// patch console.log to output to the UI
const originalConsoleLog = console.log;
console.log = function (...args) {
    originalConsoleLog.call(console, "[dlPro]", ...args);
    postMessage({
        type: "log",
        data: args.map(arg => {
            try {
                return arg.toString()
            } catch (e) {
                return JSON.stringify(arg)
            }
        }).join(' ') + "\n"
    });
};

let cookies;
let cookie_promise;

let dlurl;
let dlurl_promise;

onmessage = function (event) {
    let message = event.data;
    // console.log("worker", message)
    switch (message.type) {
        case "cookies":
            cookies = message.cookies;
            if (cookie_promise) {
                cookie_promise(cookies);
            }
            break;
        case "dlurl":
            dlurl = message.dlurl;
            if (dlurl_promise) {
                dlurl_promise(dlurl);
            }
            break;
        case "chromeruntimeurl":
            awaiting_url[message.inurl](message.outurl);
            break
    }
}

let awaiting_url = {}

console.log("worker started");

function chromeruntimeurl(path) {
    return new Promise((resolve, reject) => {
        awaiting_url[path] = resolve;
        postMessage({type: "chromeruntimeurl", inurl: path});
    })
}


// yt-dlp tries to set some headers browsers dont allow. this isnt an error but it clogs up the console. patch it out.
const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
const unsafeHeaders = ['sec-fetch-mode', 'origin', 'accept-encoding'];
XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (unsafeHeaders.includes(name.toLowerCase())) {
        return;
    }
    return originalSetRequestHeader.call(this, name, value);
};

// this code HAS to be duplicated, because you need it before you can import anything.....
// const toBlobURL = async (url, mimeType, monkeypatch) => {
//     const buf = await (await fetch(url)).arrayBuffer();
//     const blob = new Blob(monkeypatch ? [new TextEncoder().encode(monkeypatch), buf] : [buf], {type: mimeType});
//     let burl = URL.createObjectURL(blob);
//     return burl;
// };

// ffmpeg-bridge needs access to the pyodide filesystem, make it global
let pyodide;

// thanks to https://github.com/warren-bank/crx-yt-dlp for a quick start
async function main() {
    console.log("loading js libs")
    importScripts(
        await toBlobURL(await chromeruntimeurl("pyodide/pyodide.js"), "text/javascript"),
        await toBlobURL(await chromeruntimeurl("ffmpeg/ffmpeg.js"), "text/javascript",
            // stupid fucking webpack bug
            "let document = {};"),
        await toBlobURL(await chromeruntimeurl("ffmpeg-bridge.js"), "text/javascript"),
        await toBlobURL(await chromeruntimeurl("worker_utils.js"), "text/javascript"),
    )
    console.log("js libs loaded");
    // load Pyodide and import required things
    console.log("Loading Pyodide");
    pyodide = await loadPyodide({
        indexURL: await chromeruntimeurl("pyodide/")
    });
    await pyodide.loadPackage(await chromeruntimeurl("pyodide/yt_dlp-2025.6.30-py3-none-any.whl"))
    await pyodide.loadPackage('pyodide_http')
    await pyodide.loadPackage("ssl");
    console.log("sending cookies");
    pyodide.FS.mkdir("/dl")
    // wait to recieve cookies if we havent
    await new Promise((resolve, reject) => {
        if (cookies) {
            resolve(cookies);
        } else {
            cookie_promise = resolve;
        }
    })
    // pass cookie file
    pyodide.FS.writeFile('/cookies.txt', cookies);
    // wait to recieve the download URL if we havent
    await new Promise((resolve, reject) => {
        if (dlurl) {
            resolve(dlurl);
        } else {
            dlurl_promise = resolve;
        }
    })
    console.log("running yt-dlp")
    // run the Python script to download the video
    await pyodide.runPythonAsync(`downloadURL = """${dlurl}"""\n` + (await (await fetch(await chromeruntimeurl("dl.py"))).text()));
    console.log("yt-dlp finished");
    let outfiles = [];
    for (const file of pyodide.FS.readdir("/dl")) {
        const filePath = `/dl/${file}`;
        if (pyodide.FS.isDir(filePath) || [".", ".."].includes(file)) continue // skip directories and . and ..
        console.log(`moving ${filePath} from yt-dlp to worker`);
        let contents = pyodide.FS.readFile(filePath, {encoding: 'binary'});
        pyodide.FS.unlink(filePath);
        // let blob = new Blob(contents);
        // let burl = URL.createObjectURL(blob);
        postMessage({type: "result", name: file, contents: contents}, [contents.buffer]);
    }
    console.log("sending files from worker to main page")

    console.log("worker finished");
    self.close()
}

main().catch(e => {
    console.log("⚠️ FATAL ERROR", JSON.stringify(e));
    throw e
})
