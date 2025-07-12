if (typeof loaded === "undefined") {
    var loaded = false;
}
if (typeof ffmpeg === "undefined") {
    var ffmpeg = null;
}


async function ffmpegbridge(args, files) {
    try {
        // yt-dlp, in youtube, checks ffmpeg version and merging capability. we dont need to actually launch ffmpeg for
        // this
        // just make sure to update then when ffmpeg is updated
        if (args === '["-bsfs"]') {
            return `["Bitstream filters:aac_adtstoascav1_frame_mergeav1_frame_splitav1_metadatachompdump_extradca_coredv_error_markereac3_coreextract_extradatafilter_unitsh264_metadatah264_mp4toannexbh264_redundant_ppshapqa_extracthevc_metadatahevc_mp4toannexbimxdumpmjpeg2jpegmjpegadumpmp3decompmpeg2_metadatampeg4_unpack_bframesmov2textsubnoisenullopus_metadatapcm_rechunkpgs_frame_mergeprores_metadataremove_extrasettstext2movsubtrace_headerstruehd_corevp9_metadatavp9_raw_reordervp9_superframevp9_superframe_split","ffmpeg version 5.1.4 Copyright (c) 2000-2023 the FFmpeg developers  built with emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.40 (5c27e79dd0a9c4e27ef2326841698cdd4f6b5784)  configuration: --target-os=none --arch=x86_32 --enable-cross-compile --disable-asm --disable-stripping --disable-programs --disable-doc --disable-debug --disable-runtime-cpudetect --disable-autodetect --nm=emnm --ar=emar --ranlib=emranlib --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc --extra-cflags='-I/opt/include -O3 -msimd128' --extra-cxxflags='-I/opt/include -O3 -msimd128' --disable-pthreads --disable-w32threads --disable-os2threads --enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus --enable-zlib --enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass --enable-libzimg  libavutil      57. 28.100 / 57. 28.100  libavcodec     59. 37.100 / 59. 37.100  libavformat    59. 27.100 / 59. 27.100  libavdevice    59.  7.100 / 59.  7.100  libavfilter     8. 44.100 /  8. 44.100  libswscale      6.  7.100 /  6.  7.100  libswresample   4.  7.100 /  4.  7.100  libpostproc    56.  6.100 / 56.  6.100Aborted()",0]`
        }
        args = JSON.parse(args)
        if (!loaded) {
            await load()
        }
        // look for -i file patterns, and copy those files to ffmpeg
        let is_input = false;
        for (let arg of args) {
            if (arg === "-i") {
                is_input = true;
                continue
            }
            if (is_input) {
                let file = arg;
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
        console.log(`running ffmpeg command`, args)
        let stdout = "";
        let stderr = "";
        ffmpeg.on("log", ({type, message}) => {
            switch (type) {
                case "stdout":
                    stdout += message;
                    console.log("ffmpeg stdout", message);
                    break;
                case "stderr":
                    stderr += message;
                    console.log("ffmepg stderr", message);
                    break;
                default:
                    console.warn("unknown log type", type, message);
            }
        })
        ffmpeg.on("progress", ({type, message}) => {
            console.log("progress", type, message);
        })
        const code = await ffmpeg.exec(args);
        if (code !== 0) {
            console.error(`ffmpeg command failed with code ${code}`);
        } else {
            // if last arg doesnt start with -, its probably the output. move to yt-dlp
            let lastarg = args.at(-1);
            if (!lastarg.startsWith("-")) {
                let file = lastarg;
                if (file.startsWith("file:")) {
                    file = file.slice(5);
                }
                console.log(`moving file ${file} from ffmpeg to pyodide`)
                pyodide.FS.writeFile(file, await ffmpeg.readFile(file));
            }
        }
        // delete all ffmpeg files. trying to save memory.
        console.log(`deleting ffmpeg files`)
        for (let file of await ffmpeg.listDir("/dl")) {
            if (!file.isDir) {
                await ffmpeg.deleteFile("/dl/" + file.name);
            }
        }
        console.log("ffmpeg command finished")
        // the format yt_dlp expects processes to return
        return JSON.stringify([stdout, stderr, code]);
    } catch (e) {
        console.error(e)
        throw e;
    }
}


async function load() {
    console.log("loading ffmpeg");
    // bug in ffmpeg.wasm, tries to load in module mode. we need to patch
    (() => {
        // Save the original Worker constructor
        const NativeWorker = self.Worker;

        // Create a drop-in replacement
        function PatchedWorker(scriptURL, options = {}) {
            // Always force classic mode
            const opts = Object.assign({}, options, {type: 'classic'});
            // worker urls need to be trusted i guess
            if (trustedTypes && trustedTypes.createPolicy) {
                const policy = trustedTypes.defaultPolicy || trustedTypes.createPolicy('ytdlpxtn', {
                    // Here we simply pass through—the blob URL is already trusted by you.
                    createScriptURL: url => url,
                });
                scriptURL = policy.createScriptURL(scriptURL);
            }
            return new NativeWorker(scriptURL, opts);
        }

        // Preserve prototype chain and static properties
        PatchedWorker.prototype = NativeWorker.prototype;
        Object.setPrototypeOf(PatchedWorker, NativeWorker);

        // Replace the global Worker
        self.Worker = PatchedWorker;
    })();
    // load ffmpeg wasm
    // note: i tried multithreading mode and it didnt work, some weird csp error.
    // i dont think any reencoding is done anyways so its Fine
    ffmpeg = new FFmpegWASM.FFmpeg();
    // blob url thing bypasses extra strict CORS on workers
    await ffmpeg.load({
        coreURL: await toBlobURL(await chromeruntimeurl("ffmpeg/ffmpeg-core.js"), "text/javascript"),
        wasmURL: await toBlobURL(await chromeruntimeurl("ffmpeg/ffmpeg-core.wasm"), 'application/wasm'),
        classWorkerURL: await toBlobURL(await chromeruntimeurl("ffmpeg/814.ffmpeg.js"), "text/javascript", classWorkerPatch),
    });
    await ffmpeg.createDir("/dl")
    loaded = true;
    console.log("ffmpeg loaded")
}



