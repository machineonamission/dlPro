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
let dlurl;

// async bullshittery
let cookie_promise;
let dlurl_promise;
let format_promise;

let iframe_port;
let content_port;


// ask iframe to ask user for format, returns a promise that resolves when it returns
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
    console.debug("worker received message from iframe", event.data)
    let message = event.data;
    // console.log("worker", message)
    switch (message.type) {
        // when data is received, save it and resolve any waiting promises.
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
        case "format":
            format_promise(message.format);
            format_promise = null;
            break;
    }
}

function content_port_onmessage(event) {
    let message = event.data;
    console.debug("worker received message from content", event.data)
    switch (message.type) {
        // all we care about from content is the proxy. forward to any awaiting promises.
        case "response":
            response_resolve(pyodide.toPy(message.response));
            response_resolve = null;
            break
    }
}

onmessage = event => {
    if (event.data === "init") {
        console.debug("worker received init message");
        // set up channels that go iframe or content
        iframe_port = event.ports[0];
        content_port = event.ports[1];
        iframe_port.onmessage = iframe_port_onmessage
        content_port.onmessage = content_port_onmessage;
        // now we can begin
        main().catch(e => {
            console.error(e)
            console.log(`⚠️ FATAL WORKER ERROR\n${e.toString()}\n${e.stack}`);
            throw e
        })
    }
};


// handle raw stdout from pyodide, send message whenever we receive a \n OR a \r. by default, /r doesnt do this.
let stdout_buf = [];
let stderr_buf = [];
const decoder = new TextDecoder('utf-8');
const delimiters = [0x0a, 0x0d]; // \n and \r
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
        // patches for fuckass lib code
        "/worker/webpack_patch.js",
        "/worker/classic_worker_patch.js",
        // libs
        "/libs/pyodide/pyodide.js",
        "/libs/ffmpeg/ffmpeg.js",
        // ffmpeg wrapper
        "/worker/ffmpeg-bridge.js",
        // proxy requests
        "/worker/xmlproxy_worker.js",
        // create a worker for streaming requests
        "/worker/pyodide_streaming_worker_proxy.js",
    )
    // load Pyodide and import required things
    console.log("Loading Pyodide");
    pyodide = await loadPyodide({
        indexURL: "/libs/pyodide/"
    });
    // set up our stdin/err handlers
    pyodide.setStdin({error: true});
    pyodide.setStdout({raw: (byte) => pythonouthandler(byte, "stdout")});
    pyodide.setStderr({raw: (byte) => pythonouthandler(byte, "stderr")});
    // load easy libs
    await pyodide.loadPackage("/libs/pyodide/yt_dlp-2025.6.30-py3-none-any.whl")
    await pyodide.loadPackage("ssl");

    console.log("loading pyodide_http_fork")
    pyodide.FS.mkdir("/modules")
    pyodide.FS.mkdir("/modules/pyodide_http_fork")
    // yes this is horrible, but theres no other way to import a directory in pyodide, and pyodide_http is so heavily
    // modified by my fork that i need it to be in a separate directory so i can use submodules and not worry about
    // building the thing
    await Promise.all(
        ["__init__.py", "_core.py", "_requests.py", "_streaming.py", "_urllib.py"].map(async (file) => {
            let runtime = `/libs/pyodide_http_fork/pyodide_http/${file}`;
            let f = await (await fetch(runtime)).text();
            pyodide.FS.writeFile(`/modules/pyodide_http_fork/${file}`, f);
        })
    )

    pyodide.FS.mkdir("/dl")
    // wait to receive cookies if we havent
    await new Promise((resolve, reject) => {
        if (cookies) {
            resolve(cookies);
        } else {
            cookie_promise = resolve;
        }
    })
    // pass cookie file
    pyodide.FS.writeFile('/cookies.txt', cookies);
    // wait to receive the download URL if we havent
    await new Promise((resolve, reject) => {
        if (dlurl) {
            resolve(dlurl);
        } else {
            dlurl_promise = resolve;
        }
    })
    console.log("running yt-dlp")
    // run the Python script to download the video
    // yes passing the url like this is hacky, but who cares
    await pyodide.runPythonAsync(
        `downloadURL = """${dlurl}"""
        ${await (await fetch("/worker/dl.py")).text()}`
    );
    console.log("yt-dlp finished");
    // wait for any pending file receives to finish
    await Promise.all(awaiting_sends);
    // goodbye!
    console.log("worker finished");
    self.close()
}

let awaiting_sends = []

async function send_to_user(path) {
    console.log(`moving ${path} from yt-dlp to worker`);
    let contents = pyodide.FS.readFile(path, {encoding: 'binary'});
    pyodide.FS.unlink(path);
    // let blob = new Blob(contents);
    // let burl = URL.createObjectURL(blob);
    console.log(`moving ${path} from worker to iframe`);
    iframe_port.postMessage({type: "result", name: path.split("/").at(-1), contents: contents}, [contents.buffer]);
}

function wrap_send_to_user(path) {
    const p = send_to_user(path)
    awaiting_sends.push(p);
    return p;
}
