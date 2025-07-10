// thanks to https://github.com/warren-bank/crx-yt-dlp for a quick start

// content-script.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'INIT') {
        main(msg.data);
    }
});

async function main(cookies) {
    let pyodide = await loadPyodide();
    // await pyodide.loadPackage("micropip");
    // const micropip = pyodide.pyimport("micropip");
    // await micropip.install('yt-dlp');
    await pyodide.loadPackage(chrome.runtime.getURL("pyodide/yt_dlp-2025.6.30-py3-none-any.whl"))
    await pyodide.loadPackage('pyodide_http')
    await pyodide.loadPackage("ssl");


    let mountDir = "/dl";
    pyodide.FS.mkdirTree(mountDir);
    pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, mountDir);


    pyodide.FS.writeFile('/cookies.txt', cookies);

    const result = await pyodide.runPython(await (await fetch(chrome.runtime.getURL("dl.py"))).text());

    console.log(result)
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
