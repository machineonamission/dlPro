let streaming_worker;

async function spawn_worker() {
    streaming_worker = new Worker("/libs/pyodide_http_fork/pyodide_http/streaming_worker_code.js");
    await new Promise(resolve => {
        streaming_worker.onmessage = resolve
    });
    // console.log(streaming_worker)
    return streaming_worker
}
