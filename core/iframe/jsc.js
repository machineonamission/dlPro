function sandbox_run_js(code) {
    return new Promise((resolve, reject) => {
        code = code.replaceAll("await import('npm:", "await import('https://esm.sh/")
        console.debug("requesting sandboxed js execution", code);
        const iframe = document.createElement("iframe");
        iframe.src = chrome.runtime.getURL("/core/sandbox/sandbox.html");
        // this ONE fucking line caused me an hour of debugging cause firefox doesnt support sandbox in the manifest FUCKING HELL
        iframe.sandbox = "allow-scripts";
        iframe.style.display = "none";
        document.body.appendChild(iframe);

        const sandbox_channel = new MessageChannel();
        let sandbox_port = sandbox_channel.port1;
        sandbox_port.onmessage = e => {
            console.debug("sandbox result", e.data)
            iframe.remove();
            resolve(e.data);
        }

        iframe.onload = () => {
            iframe.contentWindow.postMessage(code, "*", [sandbox_channel.port2]);
        };
    });
}