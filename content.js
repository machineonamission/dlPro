// thanks to https://github.com/warren-bank/crx-yt-dlp for a quick start

// receive cookies from the background script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'INIT') {
        main(msg.data);
    }
});

// yt-dlp tries to set some headers browsers dont allow. this isnt an error but it clogs up the console. patch it out.
const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
const unsafeHeaders = ['sec-fetch-mode', 'origin', 'accept-encoding'];
XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (unsafeHeaders.includes(name.toLowerCase())) {
        return;
    }
    return originalSetRequestHeader.call(this, name, value);
};

// ffmpeg-bridge needs access to the pyodide filesystem, make it global
let pyodide;

async function main(cookies) {
    // load Pyodide and import required things
    console.log("Loading Pyodide");
    pyodide = await loadPyodide();
    await pyodide.loadPackage(chrome.runtime.getURL("pyodide/yt_dlp-2025.6.30-py3-none-any.whl"))
    await pyodide.loadPackage('pyodide_http')
    await pyodide.loadPackage("ssl");
    pyodide.FS.mkdir("/dl")

    // pass cookie file
    pyodide.FS.writeFile('/cookies.txt', cookies);
    // run the Python script to download the video
    const result = await pyodide.runPythonAsync(`downloadURL = """${window.location.href}"""\n` + (await (await fetch(chrome.runtime.getURL("dl.py"))).text()));

    console.log(result)
    // very temporary download code
    const button = document.createElement('button');
    button.textContent = 'Click Me';
    document.body.appendChild(button);
    button.onclick = async () => {
        // Ask the user where to save the final file
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: result.split('/').pop(),
            types: [{
                description: 'MP4 Video',
                accept: {'video/mp4': ['.mp4']}
            }]
        });

        const writable = await fileHandle.createWritable();

        // Read the file from the virtual FS
        const data = pyodide.FS.readFile(result, {encoding: 'binary'});
// Write to the real file
        await writable.write(data);
        await writable.close();
    }
};
