let response_resolve;

// basic wrapper to proxy requests to the content script.
async function proxy_fetch(request) {
    console.log("proxying", request.url)
    content_port.postMessage({"type": "request", "request": request});
    return await new Promise(resolve => {
        response_resolve = resolve;
    })
}
