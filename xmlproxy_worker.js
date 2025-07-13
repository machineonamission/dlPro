let response_resolve;
let include_credentials = true;

async function proxy_fetch(request) {
    console.log("proxying", request.url)
    content_port.postMessage({"type": "request", "request": request});
    return await new Promise(resolve => {
        response_resolve = resolve;
    })
}

async function force_cookies(cookies) {
    console.log(cookies)
    debugger
}

async function set_credential_mode(mode) {
    include_credentials = mode;
}

const origSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function (body) {
    this.withCredentials = include_credentials;
    origSend.call(this, body);
}
