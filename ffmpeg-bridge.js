if (typeof loaded === "undefined") {
    var loaded = false;
}
if (typeof ffmpeg === "undefined") {
    var ffmpeg = null;
}


async function ffmpegbridge(args) {
    try {
        console.log(`running ffmpeg command ${args}`)
        if (!loaded) {
            await load()
        }
        const res = await ffmpeg.exec(args);
        console.log("ffmpeg command finished")
    } catch (e) {
        console.error(e);
        throw e;
    }
}

// patch import scripts to conform to weird CSP directives
const classWorkerPatch = `
const originalImportScripts = self.importScripts.bind(self);
self.importScripts = (...urls) => {
    if (trustedTypes && trustedTypes.createPolicy) {
        const policy = trustedTypes.defaultPolicy || trustedTypes.createPolicy('ytdlpxtn', {
            // Here we simply pass through—the blob URL is already trusted by you.
            createScriptURL: url => url,
        });
        urls = urls.map(u => policy.createScriptURL(u));
    }
    console.log(urls);
    originalImportScripts(...urls);
};

`

async function load() {
    console.log("loading ffmpeg");
    // bug in ffmpeg.wasm, tries to load in module mode. we need to patch
    (() => {
        // Save the original Worker constructor
        const NativeWorker = window.Worker;

        // Create a drop-in replacement
        function PatchedWorker(scriptURL, options = {}) {
            // Always force classic mode
            const opts = Object.assign({}, options, { type: 'classic' });
            return new NativeWorker(scriptURL, opts);
        }

        // Preserve prototype chain and static properties
        PatchedWorker.prototype = NativeWorker.prototype;
        Object.setPrototypeOf(PatchedWorker, NativeWorker);

        // Replace the global Worker
        window.Worker = PatchedWorker;
    })();
    // load ffmpeg wasm
    // note: i tried multithreading mode and it didnt work, some weird csp error.
    // i dont think any reencoding is done anyways so its Fine
    ffmpeg = new FFmpegWASM.FFmpeg();
    await ffmpeg.load({
        coreURL: await toBlobURL(chrome.runtime.getURL("ffmpeg/ffmpeg-core.js"), "text/javascript"),
        wasmURL: await toBlobURL(chrome.runtime.getURL("ffmpeg/ffmpeg-core.wasm"), 'application/wasm'),
        classWorkerURL: await toBlobURL(chrome.runtime.getURL("ffmpeg/814.ffmpeg.js"), "text/javascript", classWorkerPatch),
    });
    ffmpeg.mount(FFmpegWASM.FFFSType.IDBFS, {}, "/dl");
    loaded = true;
    console.log("ffmpeg loaded")
}


// ripped from @ffmpeg/util, for some reason it wont import properly
const toBlobURL = async (url, mimeType, monkeypatch) => {
    const buf = await (await fetch(url)).arrayBuffer();
    const blob = new Blob(monkeypatch ? [new TextEncoder().encode(monkeypatch), buf] : [buf], {type: mimeType});
    let burl = URL.createObjectURL(blob);
    // my own addition
    // if (trustedTypes && trustedTypes.createPolicy) {
    //     const policy = trustedTypes.defaultPolicy || trustedTypes.createPolicy('default', {
    //         // Here we simply pass through—the blob URL is already trusted by you.
    //         createScriptURL: url => url,
    //     });
    //     burl = policy.createScriptURL(burl);
    // }
    return burl;
};
