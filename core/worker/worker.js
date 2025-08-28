importScripts("/promise_utils.js");
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

// async bullshittery
let cookies = promise_init();
let dlurl = promise_init();
let format = promise_init();

let iframe_port;
let content_port;

function firefox_jspi_warning() {
    content_port.postMessage({
        type: "firefox_jspi_warning",
    });
}


// ask iframe to ask user for format, returns a promise that resolves when it returns
async function ask_user_for_format(info_dict) {
    iframe_port.postMessage({
        type: "format",
        info_dict: info_dict
    });
    return await format.promise;
}

function iframe_port_onmessage(event) {
    console.debug("worker received message from iframe", event.data)
    let message = event.data;
    // console.log("worker", message)
    switch (message.type) {
        // when data is received, save it and resolve any waiting promises.
        case "cookies":
            // console.log("worker got cookies from iframe");
            cookies.resolve(message.cookies);
            break;
        case "dlurl":
            dlurl.resolve(message.dlurl);
            break;
        case "format":
            format.resolve(message.format);
            break;
    }
}

function content_port_onmessage(event) {
    let message = event.data;
    console.debug("worker received message from content", event.data)
    switch (message.type) {
        // all we care about from content is the proxy. forward to any awaiting promises.
        case "response":
            response.resolve(pyodide.toPy(message.response));
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
        "/core/worker/webpack_patch.js",
        "/core/worker/classic_worker_patch.js",
        // libs
        "/libs/pyodide/pyodide.js",
        "/libs/ffmpeg/ffmpeg.js",
        // ffmpeg wrapper
        "/core/worker/ffmpeg-bridge.js",
        // proxy requests
        "/core/worker/xmlproxy_worker.js",
        // create a worker for streaming requests
        "/core/worker/pyodide_streaming_worker_proxy.js",
    )
    // load Pyodide and import required things
    console.log("Loading Pyodide and yt-dlp");
    pyodide = await loadPyodide({
        indexURL: "/libs/pyodide/",
        stdLibURL: "/libs/pyodide/python_stdlib.zip.pyodide",
        packages: [
            // "ssl",
            "/libs/pyodide/yt_dlp-2025.8.27-py3-none-any.whl",
            // "/libs/pyodide/openssl-1.1.1w.zip.pyodide",
        ]
    });
    // set up our stdin/err handlers
    pyodide.setStdin({error: true});
    pyodide.setStdout({raw: (byte) => pythonouthandler(byte, "stdout")});
    pyodide.setStderr({raw: (byte) => pythonouthandler(byte, "stderr")});

    async function load_ssl() {
        // edge doesn't allow .zip, so we have to manually load in the openssl files
        pyodide.FS.mkdirTree("/usr/lib");
        await Promise.all(
            ["libcrypto.so", "libssl.so"].map(async (file) => {
                let runtime = `/libs/pyodide/openssl-1.1.1w/${file}`;
                let f = await (await fetch(runtime)).arrayBuffer();
                // f = f.replaceAll("\r\n", "\n")
                pyodide.FS.writeFile(`/usr/lib/${file}`, new Uint8Array(f));
            })
        )
        // then load the ssl wheel directly
        // yes it'd be nice to do this during the pyodide load, but it depends on openssl which we need the pyodide fs
        // to exist before we can load
        await pyodide.loadPackage("/libs/pyodide/ssl-1.0.0-cp312-cp312-pyodide_2024_0_wasm32.whl");
    }

    async function load_pyodide_http_fork() {
        pyodide.FS.mkdirTree("/lib/python3.12/site-packages/pyodide_http_fork")
        // yes this is horrible, but theres no other way to import a directory in pyodide, and pyodide_http is so heavily
        // modified by my fork that i need it to be in a separate directory so i can use submodules and not worry about
        // building the thing
        await Promise.all(
            ["__init__.py", "_core.py", "_requests.py", "_streaming.py", "_urllib.py"].map(async (file) => {
                let runtime = `/libs/pyodide_http_fork/pyodide_http/${file}`;
                let f = await (await fetch(runtime)).text();
                // f = f.replaceAll("\r\n", "\n")
                pyodide.FS.writeFile(`/lib/python3.12/site-packages/pyodide_http_fork/${file}`, f);
            })
        )
    }

    console.log("loading openssl, ssl, and pyodide_http_fork");
    await Promise.all([load_ssl(), load_pyodide_http_fork()])

    pyodide.FS.mkdir("/dl")
    // pass cookie file
    pyodide.FS.writeFile('/cookies.txt', await cookies.promise);
    // wait to receive the download URL if we havent
    console.log("running yt-dlp")
    // run the Python script to download the video
    // yes passing the url like this is hacky, but who cares
    await pyodide.runPythonAsync(
        `downloadURL = """${await dlurl.promise}"""\n${await (await fetch("/core/worker/dl.py")).text()}`
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
