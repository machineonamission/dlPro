// thanks to https://github.com/warren-bank/crx-yt-dlp for a quick start

// ripped from https://github.com/kairi003/Get-cookies.txt-LOCALLY/blob/master/src/modules/cookie_format.mjs
// Converts cookies from Chrome's JSON format to Netscape format (which is what yt-dlp expects).
function jsonToNetscapeMapper(cookies) {
    return cookies.map(
        ({domain, expirationDate, path, secure, name, value}) => {
            const includeSubDomain = !!domain?.startsWith('.');
            const expiry = expirationDate?.toFixed() ?? '0';
            const arr = [domain, includeSubDomain, path, secure, expiry, name, value];
            return arr.map((v) =>
                typeof v === 'boolean' ? v.toString().toUpperCase() : v,
            );
        },
    );
}

function netscapeSerializer(cookies) {
    const netscapeTable = jsonToNetscapeMapper(cookies);
    const text = [
        '# Netscape HTTP Cookie File',
        '# http://curl.haxx.se/rfc/cookie_spec.html',
        '# This is a generated file!  Do not edit.',
        '',
        ...netscapeTable.map((row) => row.join('\t')),
        '', // Add a new line at the end
    ].join('\n');
    return text;
}

let content_port;
let content_to_worker_port;
let dlurl;

function content_port_onmessage(event) {
    console.debug("iframe recieved message from content", event.data)
    switch (event.data.type) {
        case "dlurl":
            // this is a request for the current url, send it
            dlurl = event.data.dlurl;
            if (dlurl_promise) {
                dlurl_promise(dlurl)
            }
            break;
    }
}

// recieve port from content script
window.addEventListener('message', event => {
    if (event.data === "init") {
        console.debug("iframe recieved init message");
        content_port = event.ports[0];
        content_to_worker_port = event.ports[1];
        content_port.onmessage = content_port_onmessage;
        // top level scope isnt async
        main().catch(e => {
            uilog(`⚠️ FATAL ERROR: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
            throw e
        })
    }
});

let dlurl_promise;
let dlpro_worker;
let worker_port;

async function send_cookies_and_dlurl() {

}

async function main() {
    dlpro_worker = new Worker("worker.js");
    // init 2 way channel
    const worker_channel = new MessageChannel();
    worker_port = worker_channel.port1;
    dlpro_worker.postMessage("init", [worker_channel.port2, content_to_worker_port]);
    // message reciever
    worker_port.onmessage = event => {
        console.debug("iframe recieved message from worker", event.data)
        let message = event.data;
        // console.log("content", message)
        switch (message.type) {
            case "chromeruntimeurl":
                // this is a request for a file, send it
                worker_port.postMessage({
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
                let button_area = document.getElementById("buttons");
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
    await new Promise(resolve => {
        if (dlurl) {
            resolve(dlurl)
        } else {
            dlurl_promise = resolve
        }
    })
    worker_port.postMessage({type: "dlurl", dlurl: dlurl});
    // gather cookies (can only be done from the background script)
    const cookies = await chrome.cookies.getAll({url: dlurl});
// serialize to a format yt-dlp expects
    const sCookies = netscapeSerializer(cookies);
    // send cookies
    worker_port.postMessage({type: "cookies", cookies: sCookies});
}



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
