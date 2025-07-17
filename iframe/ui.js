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
let advanced = false;

// let format_promise;

async function ask_user_for_format(info_dict) {
    if (format_selection !== undefined) {
        // if user selected a preset, return it
        return format_selection;
    } else if (manual) {
        // if user selected manual, ask for manual selection
        return await manual_select(info_dict);
    } else {
        // user hasn't picked anything, wait for selection
        uilog("Waiting for preset selection...");
        await format_promise;
        // re-check for manual or preset. sure do hope this doesnt recurse!
        return await ask_user_for_format(info_dict);
    }
}

function bytes_to_string(size, bytes = true, binary_base = true, decimals = 3) {
    const unitname = bytes ? "B" : "b";
    if (!+size) return '0 ' + unitname;

    const k = binary_base ? 1024 : 1000;
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['', binary_base ? 'K' : 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
        .map((s => s + (binary_base ? "i" : "") + unitname))

    const i = Math.floor(Math.log(size) / Math.log(k))

    return `${parseFloat((size / Math.pow(k, i)).toPrecision(dm))} ${sizes[i]}`
}

function size_to_string(bytes) {
    return bytes_to_string(bytes);
}

function rate_to_string(kbps) {
    if (!kbps) return;
    return bytes_to_string(kbps * 1000, false, false) + "ps"
}

function format_size(format) {
    if (format.filesize) {
        return size_to_string(format.filesize)
    } else if (format.filesize_approx) {
        return "~" + size_to_string(format.filesize_approx)
    }
}

function concat_details(details) {
    const filtered_details = details.filter(d => d)
    return filtered_details.join(" | ");
}

function video_specific_details(format) {
    return concat_details([
        format.resolution,
        format.vcodec?.split(".").at(0),
        rate_to_string(format.vbr),
    ])
}

function audio_specific_details(format) {
    return concat_details([
        format.acodec?.split(".").at(0),
        rate_to_string(format.abr)
    ])
}

function generic_format_string(details, format, include_tbr = false) {
    const fields = concat_details([
        details,
        `.${format.ext}`,
        include_tbr ? rate_to_string(format.tbr) : null,
        format_size(format),
        format.format_note
    ])
    return `${format.format_id}: ${fields}`;
}

function video_to_string(format) {
    return generic_format_string(video_specific_details(format), format)
}

function audio_to_string(format) {
    return generic_format_string(audio_specific_details(format), format)
}

function bundle_to_string(format) {
    const vsd = video_specific_details(format);
    const asd = audio_specific_details(format);
    let details = null;
    if (vsd || asd) {
        details = `(${vsd || "?"}) + (${asd || "?"})`;
    }
    return generic_format_string(
        details,
        format,
        !format.vbr || !format.abr // include tbr if we are missing either vbr or abr
    )
}

async function manual_select(info_dict) {
    // console.log(info_dict)
    if (info_dict.formats && info_dict.formats.length > 0) {
        let pure_videos = [];
        let pure_audios = [];
        let video_and_audio = [];
        for (const format of info_dict.formats) {
            // format.vcodec could be undefined, but that's unknown, so i assume means something is there, just not known what
            let has_video = format.vcodec !== "none";
            let has_audio = format.acodec !== "none";
            if (has_video === has_audio) { // either has both video and audio, or has neither (failsafe for weird formats)
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
                    Select pre-combined video and audio, or unknown formats
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
                options += `
                    <option value="${format.format_id}" ${first ? `selected="selected"` : ``}>
                        ${video_to_string(format)}
                    </option>`
                first = false;
            }
            video_ui = `
            <div class="format-bundle-no">
                <label for="video-select" >Select video format:</label>
                <select class="form-select" id="video-select">
                   ${options}
                </select>
            </div>
           `
        }
        if (pure_audios.length > 0) {
            let options = `<option value="">None</option>`;
            let first = true;
            for (const format of pure_audios) {
                options += `
                    <option value="${format.format_id}" ${first ? `selected="selected"` : ``}>
                        ${audio_to_string(format)}
                    </option>`
                first = false;
            }
            audio_ui = `
            <div class="format-bundle-no">
                <label for="audio-select" >Select audio format:</label>
                <select class="form-select" id="audio-select">
                   ${options}
                </select>
            </div>`
        }
        if (video_and_audio.length > 0) {
            let options = "";
            for (const format of video_and_audio) {
                options += `
                    <option value="${format.format_id}">
                        ${bundle_to_string(format)}
                    </option>`
            }
            video_and_audio_ui = `
            <div class="format-bundle-yes">
                <label for="va-select" >Select video + audio bundle or unknown format:</label>
                <select class="form-select" id="va-select">
                   ${options}
                </select>
            </div>`
        }


        ui.innerHTML = `
        <h2>Select download format:</h2>
        ${toggle_ui}
        ${video_ui}
        ${audio_ui}
        ${video_and_audio_ui}
        <button class="btn btn-primary" type="submit" id="preset-confirm">Confirm</button>
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
    preset_names.push("Advanced")
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
    <button class="btn btn-primary" type="submit" id="preset-confirm">Confirm</button>
    `
    ui.innerHTML = preset_ui;
    let select = document.getElementById("preset-select");
    let compat = document.getElementById("preset-compat");
    let confirm = document.getElementById("preset-confirm");
    return await new Promise(resolve => {
        confirm.addEventListener("click", async () => {
            let val = select.value;
            let compat_val = compat.checked;
            if (val === "Manual") {
                manual = true;
                ui.innerHTML = "<p>Waiting for format list...</p>";
            } else if (val === "Advanced") {
                await advanced_prompt()
            } else {
                format_selection = presets[val]
                if (compat_val) {
                    let sort = format_selection.format_sort || [];
                    sort.unshift("ext");
                    format_selection.format_sort = sort;
                }
                ui.innerHTML = "";
            }
            resolve()
        })
    })

}

async function advanced_prompt() {
    const no_spellcheck = `spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off"`
    const advanced_ui = `
    <h2>Advanced format selection:</h2>
    <div>
        <label for="advanced-format" class="form-label">yt-dlp format string:</label>
        <input type="text" class="form-control code-font" id="advanced-format" ${no_spellcheck}>
    </div>
    <div>
        <label for="advanced-format" class="form-label">yt-dlp format sort fields:</label>
        <input type="text" class="form-control code-font" id="advanced-sort" ${no_spellcheck}>
    </div>
    <div>
        <label for="advanced-json" class="form-label">JSON of extra yt-dlp options:</label>
        <textarea class="form-control code-font" id="advanced-json" ${no_spellcheck}></textarea>
    </div>
    <a href="https://github.com/yt-dlp/yt-dlp/#format-selection">Documentation</a>
    <button class="btn btn-primary" type="submit" id="advanced-confirm">Confirm</button>
    `
    ui.innerHTML = advanced_ui;
    let format = document.getElementById("advanced-format");
    let sort = document.getElementById("advanced-sort");
    let json = document.getElementById("advanced-json");
    let confirm = document.getElementById("advanced-confirm");
    return await new Promise(resolve => {
        confirm.addEventListener("click", () => {
            format_selection = {}
            if (json.value) {
                Object.assign(format_selection, JSON.parse(json.value));
            }
            if (format.value) {
                format_selection.format = format.value;
            }
            if (sort.value) {
                format_selection.format_sort = sort.value.split(",");
            }
            ui.innerHTML = "";
            resolve(format_selection)
        })
    })

}

let format_promise = show_format_selection()
