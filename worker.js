// patch console.log to output to the UI
const originalConsoleLog = console.log;
console.log = function (...args) {
    originalConsoleLog.call(console, "[dlPro]", ...args);
    iframe_port.postMessage({
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

let iframe_port;
let content_port;

function iframe_port_onmessage(event) {
    console.debug("worker recieved message from iframe", event.data)
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

function content_port_onmessage(event) {
    let message = event.data;
    console.debug("worker recieved message from content", event.data)
    switch (message.type) {
        case "response":
            response_resolve(pyodide.toPy(message.response));
            response_resolve = null;
            break
    }
}

onmessage = event => {
    if (event.data === "init") {
        console.debug("worker recieved init message");
        iframe_port = event.ports[0];
        content_port = event.ports[1];
        iframe_port.onmessage = iframe_port_onmessage
        content_port.onmessage = content_port_onmessage;
        main().catch(e => {
            console.log("⚠️ FATAL ERROR", JSON.stringify(e, Object.getOwnPropertyNames(e)));
            throw e
        })
    }
};
let awaiting_url = {}

function chromeruntimeurl(path) {
    return new Promise((resolve, reject) => {
        awaiting_url[path] = resolve;
        iframe_port.postMessage({type: "chromeruntimeurl", inurl: path});
    })
}


// // yt-dlp tries to set some headers browsers dont allow. this isnt an error but it clogs up the console. patch it out.
// const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
// const unsafeHeaders = ['sec-fetch-mode', 'origin', 'accept-encoding', "referer"];
// XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
//     if (unsafeHeaders.includes(name.toLowerCase())) {
//         console.debug("[dlPro] blocked unsafe header", name, value);
//         return;
//     }
//     return originalSetRequestHeader.call(this, name, value);
// };

// this code HAS to be duplicated, because you need it before you can import anything.....
// const toBlobURL = async (url, mimeType, monkeypatch) => {
//     const buf = await (await fetch(url)).arrayBuffer();
//     const blob = new Blob(monkeypatch ? [new TextEncoder().encode(monkeypatch), buf] : [buf], {type: mimeType});
//     let burl = URL.createObjectURL(blob);
//     return burl;
// };

// fix workers to always be classic, and trust urls for youtube
// (() => {
//     // Save the original Worker constructor
//     const NativeWorker = self.Worker;
//
//     // Create a drop-in replacement
//     function PatchedWorker(scriptURL, options = {}) {
//         // Always force classic mode
//         const opts = Object.assign({}, options, {type: 'classic'});
//         // worker urls need to be trusted i guess
//         if (trustedTypes && trustedTypes.createPolicy) {
//             const policy = trustedTypes.defaultPolicy || trustedTypes.createPolicy('ytdlpxtn', {
//                 // Here we simply pass through—the blob URL is already trusted by you.
//                 createScriptURL: url => url,
//             });
//             scriptURL = policy.createScriptURL(scriptURL);
//         }
//         return new NativeWorker(scriptURL, opts);
//     }
//
//     // Preserve prototype chain and static properties
//     PatchedWorker.prototype = NativeWorker.prototype;
//     Object.setPrototypeOf(PatchedWorker, NativeWorker);
//
//     // Replace the global Worker
//     self.Worker = PatchedWorker;
// })();

// ffmpeg-bridge needs access to the pyodide filesystem, make it global
let pyodide;

// thanks to https://github.com/warren-bank/crx-yt-dlp for a quick start
async function main() {
    // console.log("loading js libs")
    console.log("worker started");
    importScripts(
        await chromeruntimeurl("webpack_patch.js"),
        await chromeruntimeurl("pyodide/pyodide.js"),
        await chromeruntimeurl("ffmpeg/ffmpeg.js"),
        await chromeruntimeurl("ffmpeg-bridge.js"),
        await chromeruntimeurl("xmlproxy_worker.js"),
    )
    // console.log("js libs loaded");
    // load Pyodide and import required things
    console.log("Loading Pyodide");
    pyodide = await loadPyodide({
        indexURL: await chromeruntimeurl("pyodide/")
    });
    await pyodide.loadPackage(await chromeruntimeurl("pyodide/yt_dlp-2025.6.30-py3-none-any.whl"))
    await pyodide.loadPackage('pyodide_http')
    await pyodide.loadPackage("ssl");
    pyodide.FS.mkdir("/dl")
    // wait to recieve cookies if we havent
    await new Promise((resolve, reject) => {
        if (cookies) {
            resolve(cookies);
        } else {
            cookie_promise = resolve;
        }
    })
    // debugger
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
        iframe_port.postMessage({type: "result", name: file, contents: contents}, [contents.buffer]);
    }
    console.log("sending files from worker to main page")

    console.log("worker finished");
    self.close()
}
