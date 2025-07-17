function proxy_fetch(request) {
    return new Promise(resolve => {
        // unpack "serialized" request
        let {
            method,
            url,
            params,
            body,
            headers,
            timeout,
            credentials
        } = request;

        // adapted from pyodide_http's internal fetch function.
        if (params) {
            let urlparams = new URLSearchParams()
            for (const [k, v] of Object.entries(params)) {
                urlparams.append(k, v);
            }
            url += "?" + urlparams.toString()
        }

        let xhr = new XMLHttpRequest();
        if (timeout !== 0) {
            xhr.timeout = timeout;
        }
        xhr.responseType = "arraybuffer";

        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                resolve({
                    "status_code": xhr.status,
                    "headers": xhr.getAllResponseHeaders(),
                    "body": xhr.response,
                });
            }
        }

        xhr.open(method, url, true);

        for (const [k, v] of Object.entries(headers)) {
            xhr.setRequestHeader(k, v);
        }

        xhr.withCredentials = credentials;
        xhr.send(body);

    })
}
