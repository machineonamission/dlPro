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
    console.debug("iframe received message from content", event.data)
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

// receive port from content script
window.addEventListener('message', event => {
    if (event.data === "init") {
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

async function main() {
    // spawn our worker
    dlpro_worker = new Worker("/worker/worker.js");
    // init 2 way channel
    const worker_channel = new MessageChannel();
    worker_port = worker_channel.port1;
    dlpro_worker.postMessage("init", [worker_channel.port2, content_to_worker_port]);
    // message receiver
    worker_port.onmessage = event => {
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
        }
    }
    // wait for dlurl
    await new Promise(resolve => {
        if (dlurl) {
            resolve(dlurl)
        } else {
            dlurl_promise = resolve
        }
    })
    // send to worker
    worker_port.postMessage({type: "dlurl", dlurl: dlurl});
    // gather cookies (cannot be done from a worker, and needs dlurl)
    const cookies = await chrome.cookies.getAll({url: dlurl});
    // serialize to a format yt-dlp expects
    const sCookies = netscapeSerializer(cookies);
    // send cookies
    worker_port.postMessage({type: "cookies", cookies: sCookies});
}
