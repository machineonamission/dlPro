function init() {
    close()

    let cookies_prom = chrome.runtime.sendMessage({"type": "cookies", "url": location.href})

    const host = document.createElement('div');
    window.__dlpro_host = host;
    document.body.appendChild(host);
    let shadow = host.attachShadow({mode: 'open'});
    let drl = document.createElement('meta');
    drl.setAttribute("name", "darkreader-lock")
    shadow.appendChild(drl)

    // CAUSES A FIREFOX BUG https://bugzilla.mozilla.org/show_bug.cgi?id=1766909
    // let sheet = new CSSStyleSheet()
    // sheet.replaceSync(`
    // :host {
    //     all: initial;
    // }`)
    // shadow.adoptedStyleSheets.push(sheet)

    const sheet = document.createElement("style")
    sheet.innerHTML = `
    :host {
        all: initial;
    }`;
    shadow.appendChild(sheet);

    // create iframe (this isnt just for aesthetics, it has its own CSP! yay workers!)
    const container = document.createElement("div");
    container.classList.add("container");
    const iframe = document.createElement('iframe');

    // set up close button
    const top_right = document.createElement('div');
    top_right.classList.add('top-right');
    const close_button = document.createElement('button');
    close_button.type = 'button';
    close_button.classList.add('button');
    close_button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="2rem" height="2rem" fill="currentColor" class="bi bi-x-lg" viewBox="0 0 16 16">
      <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
    </svg>
    `
    const refresh_button = document.createElement('button');
    refresh_button.type = 'button';
    refresh_button.classList.add('button');
    refresh_button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="2rem" height="2rem" fill="currentColor" class="bi bi-arrow-clockwise" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/>
      <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/>
    </svg>
    `

    const settings = document.createElement('a');
    settings.classList.add('button');
    settings.addEventListener("click", function() {
        chrome.runtime.sendMessage({ type: "settings" });
    })
    settings.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="2rem" height="2rem" fill="currentColor" class="bi bi-gear-fill" viewBox="0 0 16 16">
      <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
    </svg>
`
    top_right.appendChild(settings)
    top_right.appendChild(refresh_button)
    top_right.appendChild(close_button)
    container.appendChild(top_right)

    close_button.addEventListener('click', close)
    refresh_button.addEventListener('click', init)

    const style = new CSSStyleSheet();
    fetch(chrome.runtime.getURL("/core/content/content.css"))
        .then(response => response.text())
        // .then(css => style.replace(css))
        .then(css => sheet.innerHTML += css)
    iframe.setAttribute('allowtransparency', "true")
    iframe.src = chrome.runtime.getURL("/core/iframe/iframe.html");
    iframe.addEventListener('load', () => {
        const iframe_channel = new MessageChannel();
        const worker_channel = new MessageChannel();
        // Send port2 to the iframe
        iframe.contentWindow.postMessage("content_init", "*", [iframe_channel.port2, worker_channel.port2]);
        const iframe_port = iframe_channel.port1;
        const worker_port = worker_channel.port1;
        // Use port1 in the container
        iframe_port.onmessage = e => console.debug('content received message from iframe:', e.data);
        cookies_prom.then(c => {
            // console.log("content got cookies from background script", c);
            iframe_port.postMessage({"type": "cookies", "cookies": c});
            // window.__dlpro_cookies = null;
        })
        iframe_port.postMessage({"type": "dlurl", "dlurl": location.href});
        worker_port.onmessage = e => {
            console.debug("content received message from worker", e.data);
            switch (e.data.type) {
                case "request":
                    proxy_fetch(e.data.request).then(response => {
                        worker_port.postMessage({"type": "response", "response": response}, [response.body]);
                    })
                    break
                case "firefox_jspi_warning":
                    chrome.runtime.sendMessage({"type": "firefox_jspi_warning"})
                    break
            }
        };
    });
    container.appendChild(iframe);
    shadow.appendChild(container);
}

function close() {
    if (window.__dlpro_host) {
        console.log("[dlPro] closing")
        window.__dlpro_host.remove();
        window.__dlpro_host = undefined;
    }
}

init()

