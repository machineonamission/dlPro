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

// create iframe (this isnt just for aesthetics, it has its own CSP! yay workers!)
const host = document.createElement("div");
host.style.cssText = `
        /*floating window*/
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
        /*size*/
        width: 50vw;
        height: 50vh;
        overflow: hidden;
        resize:both;
        /*box styling*/
        background: rgba(0, 0, 0, 0.75);
        padding: 1rem;
        box-shadow: 0.5rem 0.5rem 0.5rem rgba(0, 0, 0, 0.5);
        border-radius: 1rem;
        backdrop-filter: blur(2rem);
`;
const iframe = document.createElement('iframe');
iframe.style.cssText = `
        background-color: "transparent";
        width:100%;
        height:100%;
`;
iframe.setAttribute('allowtransparency', "true")
iframe.src = chrome.runtime.getURL("iframe.html");
iframe.addEventListener('load', () => {
    const iframe_channel = new MessageChannel();
    const worker_channel = new MessageChannel();
    // Send port2 to the iframe
    iframe.contentWindow.postMessage("init", "*", [iframe_channel.port2, worker_channel.port2]);
    const iframe_port = iframe_channel.port1;
    const worker_port = worker_channel.port1;
    // Use port1 in the host
    iframe_port.onmessage = e => console.debug('content recieved message from iframe:', e.data);
    iframe_port.postMessage({"type": "dlurl", "dlurl": location.href});
    worker_port.onmessage = e => {
        switch(e.data.type) {
            case "request":
                proxy_fetch(e.data.request).then(response => {
                    worker_port.postMessage({"type": "response", "response": response});
                })
                break
        }
    };
});

host.appendChild(iframe);
document.body.appendChild(host);
