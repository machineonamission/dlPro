// importing scripts is fucky with CORS. we manually run all scripts as one combined file
// when a new worker is spawned, so this can be a no-op. (thanks non module mode!)
self.importScripts = function(...urls) {
    console.log("blocking attempt to import", urls.join(" | "))
}
