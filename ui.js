let shadow;
let html_console;


function uilog(message) {
    html_console.innerHTML += message;
    html_console.scrollTo({
        top: html_console.scrollHeight,
        left: 0,
        behavior: 'instant'
    });
}



// inject ui
async function inject_ui() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    shadow = host.attachShadow({mode: 'open'});
    shadow.innerHTML = (await (await fetch(chrome.runtime.getURL("ui-base.html"))).text());
    html_console = shadow.querySelector('#console');
    console.log("Loading JS libraries")
}

inject_ui()
