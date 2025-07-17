let streaming_worker;

// extremely basic proxy to spawn worker. i tried doing it from python but it seemed to not work?
//  like the worker got garbage collected or something
async function spawn_worker() {
    streaming_worker = new Worker("/libs/pyodide_http_fork/pyodide_http/streaming_worker_code.js");
    await new Promise(resolve => {
        streaming_worker.onmessage = resolve
    });
    return streaming_worker
}
