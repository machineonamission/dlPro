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

// patch console.log to output to the UI
const originalConsoleLog = console.log;
console.log = function (...args) {
    originalConsoleLog.call(console, "[dlPro]", ...args);
    html_console.innerHTML += args.map(arg => {
        try {
            return arg.toString()
        } catch (e) {
            return JSON.stringify(arg)
        }
    }).join(' ') + "\n";
};

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
