let loaded = false;
let ffmpeg = null;


async function ffmpegbridge(mode, args) {
    try {
        // yt-dlp, in youtube, checks ffmpeg version and merging capability. we dont need to actually launch ffmpeg for
        // this
        // just make sure to update then when ffmpeg is updated
        if (!loaded) {
            await load()
        }
        if (mode === "ffmpeg") {
            // look for -i file patterns, and copy those files to ffmpeg
            let is_input = false;
            for (let arg of args) {
                if (arg === "-i") {
                    is_input = true;
                    continue
                }
                if (is_input) {
                    let file = arg;
                    // idk this is something yt-dlp does
                    if (file.startsWith("file:")) {
                        file = file.slice(5);
                    }
                    console.log(`moving file ${file} from pyodide to ffmpeg`)
                    await ffmpeg.writeFile(file, pyodide.FS.readFile(file));
                    // also remove from pyodide. trying to save memory.
                    pyodide.FS.unlink(file);
                    is_input = false;
                }
            }
        } else if (mode === "ffprobe") {
            // ffprobe just takes the last argument as the file to probe
            let file = args.at(-1);
            if (file.startsWith("file:")) {
                file = file.slice(5);
            }
            console.log(`moving file ${file} from pyodide to ffprobe`)
            await ffmpeg.writeFile(file, pyodide.FS.readFile(file));
            // do NOT delete ffprobe inputs
        }

        console.log(`running ${mode} command`, args)
        // hook stdout and stderr up to console.log AND we need to return them for things like ffprobe
        let stdout = "";
        let stderr = "";
        const logcallback = ({type, message}) => {
            switch (type) {
                case "stdout":
                    stdout += message;
                    console.log("[ffmpeg]", message);
                    break;
                case "stderr":
                    stderr += message;
                    console.log("[ffmepg err]", message);
                    break;
                default:
                    console.warn("unknown log type", type, message);
            }
        }
        ffmpeg.on("log", logcallback)
        const progresscallback = ({progress, time}) => {
            console.log("[ffmpeg progress]", progress, time);
        }
        ffmpeg.on("progress", progresscallback)

        // exec the command
        let code;
        if (mode === "ffmpeg") {
            code = await ffmpeg.exec(args);
        } else if (mode === "ffprobe") {
            code = await ffmpeg.ffprobe(args);
        }
        // release listeners so we can add new ones with context next time
        ffmpeg.off("log", logcallback)
        ffmpeg.off("progress", progresscallback)
        if (code !== 0) {
            console.log(`${mode} command failed with code ${code}`);
            // dont throw an exception, failed commands dont do that
            // debugger
        } else if (mode === "ffmpeg") {
            // if last arg doesnt start with -, its probably the output. move to yt-dlp
            // ffprobe has no file output by default, no need to copy
            let lastarg = args.at(-1);
            if (!lastarg.startsWith("-")) {
                let file = lastarg;
                if (file.startsWith("file:")) {
                    file = file.slice(5);
                }
                console.log(`moving file ${file} from ffmpeg to pyodide`)
                pyodide.FS.writeFile(file, await ffmpeg.readFile(file));
                // once its sent back to yt-dlp, its not needed here. delete to save memory
                await ffmpeg.deleteFile(file);
            }
        }
        // delete any leftover files
        console.log(`deleting ffmpeg files`)
        for (let file of await ffmpeg.listDir("/dl")) {
            if (!file.isDir) {
                await ffmpeg.deleteFile("/dl/" + file.name);
            }
        }
        console.log("ffmpeg command finished")
        // the format yt_dlp expects processes to return
        return [stdout, stderr, code];
    } catch (e) {
        debugger
        console.error("[dlPro]", e)
        console.log(`⚠️ FATAL FFMPEG ERROR\n${e.toString()}\n${e.stack}`);
        throw e;
    }
}

function geturl(url) {
    // ffmpeg wasm does weird url resolution, this is the easiest hack to fix it without calling
    //  chrome.runtime.getURL, which isnt a thing in workers
    return new URL(url, self.location.href).toString()
}

async function load() {
    console.log("loading ffmpeg");
    // load ffmpeg wasm
    ffmpeg = new FFmpegWASM.FFmpeg();
    await ffmpeg.load({
        coreURL: geturl("/libs/ffmpeg/mt/ffmpeg-core.js"),
        wasmURL: geturl("/libs/ffmpeg/mt/ffmpeg-core.wasm"),
        workerURL: geturl("/libs/ffmpeg/mt/ffmpeg-core.worker.js"),
        classWorkerURL: geturl("/libs/ffmpeg/814.ffmpeg.js"),
    });
    await ffmpeg.createDir("/dl")
    loaded = true;
    console.log("ffmpeg loaded")
}



