let response;

// basic wrapper to proxy requests to the content script.
async function proxy_fetch(request) {
    console.log("proxying", request.url)
    response = promise_init()
    content_port.postMessage({"type": "request", "request": request});
    const ret = await response.promise;
    response = null;
    return ret;
}
