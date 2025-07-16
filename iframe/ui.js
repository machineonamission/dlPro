let html_console = document.getElementById("console");

function uilog(message) {
    html_console.textContent += message;
    html_console.scrollTo({
        top: html_console.scrollHeight,
        left: 0,
        behavior: 'instant'
    });
}

const presets = {
    "Best": {},
    "Audio": {
        "format": "bestaudio"
    },
    "Smallest": {
        "format_sort": ["+size", "+br"]
    },
};

let format_selection;
let manual = false;
let format_promise;

async function ask_user_for_format(info_dict) {
    if (format_selection) {
        // if user selected a preset, return it
        return format_selection;
    } else if (manual) {
        // if user selected manual, ask for manual selection
        return await manual_select(info_dict);
    } else {
        // user hasn't picked anything, wait for selection
        uilog("Waiting for preset selection...");
        await new Promise(resolve => {
            format_promise = resolve;
        })
        // re-check for manual or preset. sure do hope this doesnt recurse!
        return await ask_user_for_format(info_dict);
    }
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function format_size(format) {
    if (format.filesize) {
        return formatBytes(format.filesize)
    } else if (format.filesize_approx) {
        return "~ " + formatBytes(format.filesize_approx)
    } else {
        return "? B"
    }
}

function video_format_to_string(format) {
    return `${format.resolution} | ${format.vcodec}`;
}

function audio_format_to_string(format) {
    return `${format.acodec}`;
}

function generic_format_string(details, format) {
    return `${format.format_id}: ${details} | .${format.ext} | ${Math.round(format.tbr)} kb/s | ${format_size(format)}`;
}

async function manual_select(info_dict) {
    console.log(info_dict)
    if (info_dict.formats && info_dict.formats.length > 0) {
        let pure_videos = [];
        let pure_audios = [];
        let video_and_audio = [];
        for (const format of info_dict.formats) {
            let has_video = format.vcodec && format.vcodec !== "none";
            let has_audio = format.acodec && format.acodec !== "none";
            if (has_video && has_audio) {
                video_and_audio.push(format);
            } else if (has_video) {
                pure_videos.push(format);
            } else if (has_audio) {
                pure_audios.push(format);
            }
        }
        // better formats first, seems to be sorted in reverse priority order
        pure_audios.reverse()
        pure_videos.reverse()
        video_and_audio.reverse()

        let bundle_toggle = pure_videos.length > 0 && video_and_audio.length > 0;
        let toggle_ui;
        if (bundle_toggle) {
            toggle_ui = `
            <div id="format-bundle-toggle">
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="format-bundle" id="format-bundle-no" checked>
                  <label class="form-check-label" for="format-bundle-no">
                    Select video and audio separately (will be automatically combined)
                  </label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="format-bundle" id="format-bundle-yes">
                  <label class="form-check-label" for="format-bundle-yes">
                    Select pre-combined video and audio
                  </label>
                </div>
            </div>
            `
        } else {
            toggle_ui = "";
        }
        let audio_ui = "";
        let video_ui = "";
        let video_and_audio_ui = "";
        if (pure_videos.length > 0) {
            let options = `<option value="">None</option>`;
            let first = true;
            for (const format of pure_videos) {
                options += `<option value="${format.format_id}" ${first ? `selected="selected"` : ``}>${generic_format_string(video_format_to_string(format), format)}</option>`
                first = false;
            }
            video_ui = `
            <label for="video-select" class="format-bundle-no">Select video format:</label>
            <select class="form-select format-bundle-no" id="video-select">
               ${options}
            </select>`
        }
        if (pure_audios.length > 0) {
            let options = `<option value="">None</option>`;
            let first = true;
            for (const format of pure_audios) {
                options += `<option value="${format.format_id}"  ${first ? `selected="selected"` : ``}>${generic_format_string(audio_format_to_string(format), format)}</option>`
                first = false;
            }
            audio_ui = `
            <label for="audio-select" class="format-bundle-no">Select audio format:</label>
            <select class="form-select format-bundle-no" id="audio-select">
               ${options}
            </select>`
        }
        if (video_and_audio.length > 0) {
            let options = "";
            for (const format of video_and_audio) {
                options += `<option value="${format.format_id}">${generic_format_string(video_format_to_string(format) + " | " + audio_format_to_string(format), format)}</option>`
            }
            video_and_audio_ui = `
            <label for="va-select" class="format-bundle-yes">Select video + audio bundle format:</label>
            <select class="form-select format-bundle-yes" id="va-select">
               ${options}
            </select>`
        }


        ui.innerHTML = `
        <h2>Select download format:</h2>
        ${toggle_ui}
        ${video_ui}
        ${audio_ui}
        ${video_and_audio_ui}
        <button class="btn btn-primary" type="button" id="preset-confirm">Confirm</button>
        `;
        let video_select = document.getElementById("video-select");
        let audio_select = document.getElementById("audio-select");
        let va_select = document.getElementById("va-select");
        let no = document.getElementById('format-bundle-no')
        let yes = document.getElementById('format-bundle-yes')
        if (bundle_toggle) {
            let bundle_toggle_no = document.querySelectorAll(".format-bundle-no");
            let bundle_toggle_yes = document.querySelectorAll(".format-bundle-yes");
            bundle_toggle_yes.forEach((bundle) => {
                bundle.classList.add("d-none")
            });
            no.addEventListener("change", () => {
                if (no.checked) {
                    bundle_toggle_no.forEach((bundle) => {
                        bundle.classList.remove("d-none")
                    });
                    bundle_toggle_yes.forEach((bundle) => {
                        bundle.classList.add("d-none")
                    });
                }
            });
            yes.addEventListener("change", () => {
                if (yes.checked) {
                    bundle_toggle_no.forEach((bundle) => {
                        bundle.classList.add("d-none")
                    });
                    bundle_toggle_yes.forEach((bundle) => {
                        bundle.classList.remove("d-none")
                    });
                }
            });
        }
        let confirm = document.getElementById("preset-confirm");
        return await new Promise(resolve => {
            confirm.addEventListener("click", () => {
                let video_format = video_select?.value;
                let audio_format = audio_select?.value;
                let va_format = va_select?.value;
                let formats;
                // collect all possible formats the user may have selected, if they exist
                if (bundle_toggle) {
                    if (yes.checked) {
                        formats = [va_format];
                    } else {
                        formats = [video_format, audio_format];
                    }
                } else {
                    formats = [va_format, video_format, audio_format];
                }
                // filter out empty and join with +
                format_selection = {
                    format: formats.filter(f => f).join("+")
                };
                ui.innerHTML = "";
                resolve(format_selection)
            })
        })
    } else {
        ui.innerHTML = "<p>⚠️ No formats available.</p>";
        if (["playlist", "multi_video"].includes(info_dict._type)) {
            ui.innerHTML += "<p>Manual format selection is not supported for playlists. Please refresh and choose a preset.</p>";
        }
        console.log("No formats available for manual selection.");
        throw new Error("No formats available.");
    }
}

let ui = document.getElementById("ui");

async function show_format_selection() {
    let preset_names = Object.keys(presets);
    preset_names.push("Manual")
    const preset_ui = `
    <h2><label for="preset-select">Select download preset:</label></h2>
    <select class="form-select" id="preset-select">
       ${preset_names.map(key =>
        `<option value="${key}">${key}</option>`
    ).join("\n")}
    </select>
    <div class="form-check">
      <input class="form-check-input" type="checkbox" value="" id="preset-compat">
      <label class="form-check-label" for="preset-compat">
        Prefer compatible container (e.g. mp4, m4a, mp3)
      </label>
    </div>
    <button class="btn btn-primary" type="button" id="preset-confirm">Confirm</button>
    `
    ui.innerHTML = preset_ui;
    let select = document.getElementById("preset-select");
    let compat = document.getElementById("preset-compat");
    let confirm = document.getElementById("preset-confirm");
    confirm.addEventListener("click", () => {
        let val = select.value;
        let compat_val = compat.checked;
        if (val === "Manual") {
            manual = true;
            ui.innerHTML = "<p>Waiting for formats...</p>";
        } else {
            format_selection = presets[val]
            if (compat_val) {
                let sort = format_selection.format_sort || [];
                sort.unshift("ext");
                format_selection.format_sort = sort;
            }
            ui.innerHTML = "";
        }
        if (format_promise) {
            format_promise()
            format_promise = null;
        }
    })
}

show_format_selection()
