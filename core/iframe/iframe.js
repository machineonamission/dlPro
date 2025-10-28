// patch console.log to output to the UI
const originalConsoleLog = console.log;
console.log = function (...args) {
    originalConsoleLog.call(console, "[dlPro]", ...args);
    uilog(args.map(arg => {
        try {
            return arg.toString()
        } catch (e) {
            return JSON.stringify(arg)
        }
    }).join(' ') + "\n")
};

let content_port;
let content_to_worker_port;
let dlurl = promise_init();

function content_port_onmessage(event) {
    console.debug("iframe received message from content", event.data)
    switch (event.data.type) {
        case "dlurl":
            // this is a request for the current url, send it
            dlurl.resolve(event.data.dlurl);
            break;
        case "cookies":
            // console.log("iframe got cookies from content", event.data.cookies)
            cookies.resolve(event.data.cookies)
            break
    }
}

let cookies = promise_init();

// receive port from content script
window.addEventListener('message', event => {
    if (event.data === "content_init") {
        console.debug("iframe received init message");
        content_port = event.ports[0];
        content_to_worker_port = event.ports[1];
        content_port.onmessage = content_port_onmessage;
        // top level scope isnt async
        main().catch(e => {
            console.error(e)
            console.log(`⚠️ FATAL IFRAME ERROR\n${e.toString()}\n${e.stack}`);
            throw e
        })
    }
});

let dlurl_promise;
let dlpro_worker;
let worker_port;

function save_data(data, fileName) {
    // known janky hack to save blobs: create an a, link the blob, click it.
    console.log("Moving", fileName, "from iframe to user");
    let a = document.createElement("a");
    document.body.appendChild(a);
    a.style.cssText = "display: none";
    let blob = new Blob([data], {type: "application/octet-stream"});
    let url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 0)
}

// message receiver
function worker_port_onmessage(event) {
    console.debug("iframe received message from worker", event.data)
    let message = event.data;
    // console.log("content", message)
    switch (message.type) {
        case "log":
            // log to the console
            uilog(message.data);
            break;
        case "result":
            save_data(message.contents, message.name);
            break
        case "format":
            // ask the user for a format
            ask_user_for_format(message.info_dict).then(format => {
                worker_port.postMessage({
                    type: "format",
                    format: format
                });
            });
            break;
        case "sandbox_run_js":
            sandbox_run_js(message.code).then(result => {
                worker_port.postMessage({
                    type: "sandbox_run_js",
                    result: result,
                });
            }).catch(error => {
                worker_port.postMessage({
                    type: "sandbox_run_js",
                    result: error.toString(),
                });
            });
    }
}

async function main() {
    // spawn our worker
    dlpro_worker = new Worker("/core/worker/worker.js");
    // init 2 way channel
    const worker_channel = new MessageChannel();
    worker_port = worker_channel.port1;
    dlpro_worker.postMessage("init", [worker_channel.port2, content_to_worker_port]);
    worker_port.onmessage = worker_port_onmessage



    // send to worker
    worker_port.postMessage({type: "dlurl", dlurl: await dlurl.promise});
    worker_port.postMessage({type: "cookies", "cookies": await cookies.promise});
    // gather cookies (cannot be done from a worker, and needs dlurl)
}
