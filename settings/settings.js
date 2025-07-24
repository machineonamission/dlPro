document.addEventListener("DOMContentLoaded", function() {
    document.querySelector("#version").innerHTML = chrome.runtime.getManifest().version;
})
