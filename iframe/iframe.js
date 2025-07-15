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
            console.error(e)
            uilog(`⚠️ FATAL IFRAME ERROR\n${e.toString()}\n${e.stack}`);
            throw e
        })
    }
});

let dlurl_promise;
let dlpro_worker;
let worker_port;


async function main() {
    dlpro_worker = new Worker("../worker/worker.js");
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

let html_console = document.getElementById("console");

function uilog(message) {
    html_console.textContent += message;
    html_console.scrollTo({
        top: html_console.scrollHeight,
        left: 0,
        behavior: 'instant'
    });
}

document.documentElement.setAttribute('data-bs-theme', (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

const presets = {
    "Best": {},
    "Best, prefer MP4": {
        "format_sort": ["ext"]
    },
    "Audio": {
        "format": "bestaudio"
    },
    "Audio, prefer M4A/MP3": {
        "format": "bestaudio",
        "format_sort": ["ext"]
    },
    "Smallest": {
        "format_sort": ["+size", "+br"]
    },
    "Smallest, prefer MP4": {
        "format_sort": ["ext", "+size", "+br"]
    },
};

async function ask_user_for_format(info_dict) {
    if (info_dict.formats.length === 1) {
        return presets["Best"];
    }
    let container = document.getElementById("format_select_container")
    let preset_names = Object.keys(presets);
    preset_names.push("Manually choose format")
    container.innerHTML =
        `<label for="format_select">Select a format preset:</label>

    <select name="format" id="format_select">
      ${preset_names.map(key =>
            `<option value="${key}">${key}</option>`
        ).join("\n")}
    </select>
    <button id="format_download" class="download">Download</button>
    `
    let select = document.getElementById("format_select");
    let download_button = document.getElementById("format_download");
    await new Promise(resolve => {
        download_button.addEventListener("click", resolve)
    })
    let selected = select.value;
    if (selected === "Manually choose format") {

    } else {
        return presets[selected];
    }

}
