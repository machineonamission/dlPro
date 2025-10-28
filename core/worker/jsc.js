function sandbox_run_js(code) {
    return new Promise((resolve, reject) => {
        // code = code.replaceAll("await import(", "await patch_import(")
        console.debug("worker sandbox running", code);
        const blob = new Blob([`
        
self.console.log = (...a) => postMessage({"type": "log", "data": a.join(" ")});
debugger;
        ${code}
postMessage({"type": "close"});
`
        ], {type: "text/javascript"});
        const worker = new Worker(URL.createObjectURL(blob), { type: "module" });
        const logs = [];
        worker.onmessage = e => {
            switch (e.data.type) {
                case "log":
                    logs.push(e.data.data);
                    break;
                case "close":
                    let out = logs.join("\n");
                    console.debug("sandbox js result", out)
                    resolve(out)
                    break;
            }
        };
        worker.addEventListener("error", e => {
            console.error(e);
            worker.terminate();
            debugger
            reject(e)
        })
    });
}