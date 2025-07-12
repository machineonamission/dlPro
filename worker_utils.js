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
    // debugger;
    originalImportScripts(...urls);
};
`
