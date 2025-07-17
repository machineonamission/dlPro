// fix workers to always be classic. ffmpeg tries to make a module worker which doesnt work in umd mode

const NativeWorker = self.Worker;

function PatchedWorker(scriptURL, options = {}) {
    const opts = Object.assign({}, options, {type: 'classic'});
    return new NativeWorker(scriptURL, opts);
}

PatchedWorker.prototype = NativeWorker.prototype;
Object.setPrototypeOf(PatchedWorker, NativeWorker);
self.Worker = PatchedWorker;
