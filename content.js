// thanks to https://github.com/warren-bank/crx-yt-dlp for a quick start

let cookies;
let cookiessent = false;

// receive cookies from the background script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'INIT') {
        cookies = msg.data;
        sendcookies()
    }
});

// send cookies when theyre ready
function sendcookies() {
    if (cookies && dlpro_worker && !cookiessent) {
        dlpro_worker.postMessage({type: "cookies", cookies: cookies});
        cookiessent = true;
    }
}

// ripped from @ffmpeg/util, for some reason it wont import properly
const toBlobURL = async (url, mimeType, monkeypatch) => {
    const buf = await (await fetch(url)).arrayBuffer();
    const blob = new Blob(monkeypatch ? [new TextEncoder().encode(monkeypatch), buf] : [buf], {type: mimeType});
    let burl = URL.createObjectURL(blob);
    return burl;
};

let dlpro_worker;

async function main() {
    let scripts = [
        "noimport_patch.js",
        "webpack_patch.js",
        "pyodide/pyodide.js",
        "pyodide/pyodide.asm.js",
        "ffmpeg/ffmpeg.js",
        "ffmpeg-bridge.js",
        "worker.js",
    ]
    let bufs = await Promise.all(scripts.map(async (script) => {
        let f = await fetch(chrome.runtime.getURL(script));
        return await f.arrayBuffer();
    }))
    let blob = new Blob(bufs);
    let burl = URL.createObjectURL(blob);

    dlpro_worker = new Worker(burl);
    dlpro_worker.onmessage = event => {
        let message = event.data;
        // console.log("content", message)
        switch (message.type) {
            case "chromeruntimeurl":
                // this is a request for a file, send it
                dlpro_worker.postMessage({
                    type: "chromeruntimeurl",
                    inurl: message.inurl,
                    outurl: chrome.runtime.getURL(message.inurl),
                });
                break;
            case "log":
                // log to the console
                uilog(message.data);
                break;
            case "result":
                // create a button with an href
                let button_area = shadow.querySelector("#buttons");
                let a = document.createElement("a");
                let button = document.createElement('button');
                button.innerText = `Download ${message.name}`;
                button.classList.add("download");
                // put the file contents in a blob url
                let burl = URL.createObjectURL(new Blob([message.contents], {"type": "application/octet-stream"}));
                a.href = burl;
                a.download = message.name;
                a.appendChild(button);
                // remove blob from memory after download
                a.addEventListener("click", () => {
                    setTimeout(() => {
                        URL.revokeObjectURL(burl);
                    }, 5000)
                })
                button_area.appendChild(a);
                break
        }
    }
    sendcookies()
    dlpro_worker.postMessage({type: "dlurl", dlurl: "https://www.youtube.com/watch?v=-csWsLbXgEs"});
}

// top level scope isnt async
main().catch(e => {
    uilog(`⚠️ FATAL ERROR: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    throw e
})

/*
*
*         // Ask the user where to save the final file
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: result.split('/').pop(),
            types: [{
                description: 'MP4 Video',
                accept: {'video/mp4': ['.mp4']}
            }]
        });

        const writable = await fileHandle.createWritable();

        // Read the file from the virtual FS
        const data = pyodide.FS.readFile(result, {encoding: 'binary'});
// Write to the real file
        await writable.write(data);
        await writable.close();
        * */
