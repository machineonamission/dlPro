function sandbox_run_js(code) {
    return new Promise((resolve, reject) => {
        code = code.replaceAll("await import('npm:", "await import('https://esm.sh/")
        console.debug("requesting sandboxed js execution", code);
        const iframe = document.createElement("iframe");
        iframe.src = chrome.runtime.getURL("/core/iframe/sandbox.html");
        iframe.style.display = "none";
        document.body.appendChild(iframe);

        const worker_channel = new MessageChannel();
        worker_port = worker_channel.port1;
        dlpro_worker.postMessage("init", [worker_channel.port2, content_to_worker_port]);
        worker_port.onmessage = worker_port_onmessage

        const onMessage = e => {
            // only accept from our sandbox frame
            if (e.source !== iframe.contentWindow) return;
            window.removeEventListener("message", onMessage);
            iframe.remove();

            resolve(e.data);
        };

        window.addEventListener("message", onMessage);
        iframe.onload = () => {
            iframe.contentWindow.postMessage(code, "*");
        };
    });
}