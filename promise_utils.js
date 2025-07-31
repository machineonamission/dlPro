// returns {promise, resolve}. the promise can be awaited on, and the resolve sets the value that is returned by awaiting.
function promise_init() {
    let ret = {};
    ret.promise = new Promise(resolve => {
        ret.resolve = resolve;
    });
    return ret;
}
