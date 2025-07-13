let response_resolve;

async function proxy_fetch(request) {
    content_port.postMessage({"type": "request", "request": request});
    return await new Promise(resolve => {
        response_resolve = resolve;
    })
}
