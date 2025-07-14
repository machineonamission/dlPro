
// fix workers to always be classic

// Save the original Worker constructor
const NativeWorker = self.Worker;

// Create a drop-in replacement
function PatchedWorker(scriptURL, options = {}) {
    // Always force classic mode
    const opts = Object.assign({}, options, {type: 'classic'});
    return new NativeWorker(scriptURL, opts);
}

// Preserve prototype chain and static properties
PatchedWorker.prototype = NativeWorker.prototype;
Object.setPrototypeOf(PatchedWorker, NativeWorker);

// Replace the global Worker
self.Worker = PatchedWorker;
