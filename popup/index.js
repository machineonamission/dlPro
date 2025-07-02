// thanks to https://github.com/warren-bank/crx-yt-dlp for a quick start

async function main() {
    let pyodide = await loadPyodide();
    // await pyodide.loadPackage("micropip");
    // const micropip = pyodide.pyimport("micropip");
    // await micropip.install('yt-dlp');
    await pyodide.loadPackage('yt_dlp-2025.6.30-py3-none-any.whl')
    await pyodide.loadPackage('pyodide_http')
    await pyodide.loadPackage("ssl");


    let mountDir = "/dl";
    pyodide.FS.mkdirTree(mountDir);
    pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, mountDir);

    const result = await pyodide.runPython(await (await fetch("dl.py")).text());

    console.log(result)

    document.getElementById("dl").onclick = async () => {
        // Ask the user where to save the final file
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: result.split('/').pop(),
            types: [{
                description: 'MP4 Video',
                accept: { 'video/mp4': ['.mp4'] }
            }]
        });

        const writable = await fileHandle.createWritable();

        // Read the file from the virtual FS
        const data = pyodide.FS.readFile(result, { encoding: 'binary' });
// Write to the real file
        await writable.write(data);
        await writable.close();
    }


};
main();