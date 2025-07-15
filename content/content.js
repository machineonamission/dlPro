const host = document.createElement('div');
document.body.appendChild(host);
let shadow = host.attachShadow({mode: 'open'});
let drl = document.createElement('meta');
drl.setAttribute("name", "darkreader-lock")
shadow.appendChild(drl)

let sheet = new CSSStyleSheet()
sheet.replaceSync(`
:host {
    all: initial;
}`)
shadow.adoptedStyleSheets.push(sheet)

// create iframe (this isnt just for aesthetics, it has its own CSP! yay workers!)
const container = document.createElement("div");
const iframe = document.createElement('iframe');
const style = new CSSStyleSheet();
fetch(chrome.runtime.getURL("content/content.css"))
    .then(response => response.text())
    .then(css => style.replace(css))
    .then(css => shadow.adoptedStyleSheets.push(css))
iframe.setAttribute('allowtransparency', "true")
iframe.src = chrome.runtime.getURL("iframe/iframe.html");
iframe.addEventListener('load', () => {
    const iframe_channel = new MessageChannel();
    const worker_channel = new MessageChannel();
    // Send port2 to the iframe
    iframe.contentWindow.postMessage("init", "*", [iframe_channel.port2, worker_channel.port2]);
    const iframe_port = iframe_channel.port1;
    const worker_port = worker_channel.port1;
    // Use port1 in the container
    iframe_port.onmessage = e => console.debug('content recieved message from iframe:', e.data);
    iframe_port.postMessage({"type": "dlurl", "dlurl": location.href});
    worker_port.onmessage = e => {
        switch (e.data.type) {
            case "request":
                proxy_fetch(e.data.request).then(response => {
                    worker_port.postMessage({"type": "response", "response": response}, [response.body]);
                })
                break
        }
    };
});


container.appendChild(iframe);
shadow.appendChild(container);
