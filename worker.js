// thanks to https://github.com/warren-bank/crx-yt-dlp for a quick start

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

let format_promise;

function ask_user_for_format(info_dict) {
    return new Promise((resolve, reject) => {
        format_promise = resolve;
        iframe_port.postMessage({
            type: "format",
            info_dict: info_dict
        });
    })
}

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
        case "format":
            format_promise(message.format);
            format_promise = null;
            break;
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
            console.error(e)
            console.log(`⚠️ FATAL WORKER ERROR\n${e.toString()}\n${e.stack}`);
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

let stdout_buf = [];
let stderr_buf = [];

// Create a reusable UTF-8 decoder
const decoder = new TextDecoder('utf-8');

const delimiters = [0x0a, 0x0d];

function pythonouthandler(byte, mode) {
    if (delimiters.includes(byte)) {
        const chunk = new Uint8Array(mode === "stdout" ? stdout_buf : stderr_buf);
        const text = decoder.decode(chunk);
        console.log(`[pyodide${mode === "stdout" ? "" : " err"}] ${text}`);
        if (mode === "stdout") {
            stdout_buf = [];
        } else {
            stderr_buf = [];
        }
    } else {
        if (mode === "stdout") {
            stdout_buf.push(byte);
        } else {
            stderr_buf.push(byte);
        }
    }
}


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
        await chromeruntimeurl("classic_worker_patch.js"),
        await chromeruntimeurl("xmlproxy_worker.js"),
        await chromeruntimeurl("pyodide_streaming_worker_proxy.js"),
    )
    // console.log("sab", SharedArrayBuffer)
    // console.log("js libs loaded");
    // load Pyodide and import required things
    console.log("Loading Pyodide");
    pyodide = await loadPyodide({
        indexURL: await chromeruntimeurl("pyodide/")
    });
    pyodide.setStdin({error: true});
    pyodide.setStdout({raw: (byte) => pythonouthandler(byte, "stdout")});
    pyodide.setStderr({raw: (byte) => pythonouthandler(byte, "stderr")});
    await pyodide.loadPackage(await chromeruntimeurl("pyodide/yt_dlp-2025.6.30-py3-none-any.whl"))
    // await pyodide.loadPackage('pyodide_http')
    await pyodide.loadPackage("ssl");
    console.log("loading pyodide_http_fork")
    pyodide.FS.mkdir("/modules")
    pyodide.FS.mkdir("/modules/pyodide_http_fork")
    // yes this is horrible, but theres no other way to import a directory in pyodide, and pyodide_http is so heavily
    // modified by my fork that i need it to be in a separate directory so i can use submodules and not worry about
    // building the thing
    await Promise.all(
        ["__init__.py", "_core.py", "_requests.py", "_streaming.py", "_urllib.py"].map(async (file) => {
            let runtime = await chromeruntimeurl(`pyodide_http_fork/pyodide_http/${file}`);
            let f = await (await fetch(runtime)).text();
            pyodide.FS.writeFile(`/modules/pyodide_http_fork/${file}`, f);
        })
    )

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
