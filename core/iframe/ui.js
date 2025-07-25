let html_console = document.getElementById("console");

// throw data into the console
function uilog(message) {
    html_console.textContent += message;
    html_console.scrollTo({
        top: html_console.scrollHeight,
        left: 0,
        behavior: 'instant'
    });
}

// presets, always expandable. they map to yt-dlp options
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

// called by a message, ask for format, and wait for response
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

/**
 * Convert byte count to a human-readable string.
 * @param {number} size amount of whatever the unit is
 * @param {boolean} bytes true if bytes, false if bits
 * @param {boolean} binary_base true if binary base (1024/KiB), false if decimal base (1000/kB)
 * @param {int} decimals number of sigfigs to show, defaults to 3
 */
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

// filesize to string
function size_to_string(bytes) {
    return bytes_to_string(bytes);
}

// bitrate to string
function rate_to_string(kbps) {
    if (!kbps) return;
    return bytes_to_string(kbps * 1000, false, false) + "ps"
}

// string the size of a format
function format_size(format) {
    if (format.filesize) {
        return size_to_string(format.filesize)
    } else if (format.filesize_approx) {
        return "~" + size_to_string(format.filesize_approx)
    }
}

// concat any details, ignore empty ones
function concat_details(details) {
    const filtered_details = details.filter(d => d)
    return filtered_details.join(" | ");
}

// details for videos
function video_specific_details(format) {
    return concat_details([
        format.resolution,
        format.vcodec?.split(".").at(0),
        rate_to_string(format.vbr),
    ])
}

// details for audios
function audio_specific_details(format) {
    return concat_details([
        format.acodec?.split(".").at(0),
        rate_to_string(format.abr)
    ])
}

// details for videos, audios, bundles, whatever.
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

// combine video details with generic details
function video_to_string(format) {
    return generic_format_string(video_specific_details(format), format)
}

// combine audio details with generic details
function audio_to_string(format) {
    return generic_format_string(audio_specific_details(format), format)
}

// display other formats
function bundle_to_string(format) {
    const vsd = video_specific_details(format);
    const asd = audio_specific_details(format);
    let details = null;
    // if we have either details, show whatever we have, and ? as a placeholder
    //  otherwise, dont show (?) + (?) that is meaningless
    if (vsd || asd) {
        details = `(${vsd || "?"}) + (${asd || "?"})`;
    }
    // combine bundled details with generic details
    return generic_format_string(
        details,
        format,
        !format.vbr || !format.abr // include tbr if we are missing either vbr or abr
    )
}

async function manual_select(info_dict) {
    // if we have formats at all
    if (info_dict.formats && info_dict.formats.length > 0) {
        // sort our formats into pure videos, pure audios, and bundles/other
        let pure_videos = [];
        let pure_audios = [];
        let video_and_audio = [];
        for (const format of info_dict.formats) {
            // format.vcodec could be undefined, but that's unknown, NOT "none"
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

        // if we have bundles and pure formats, we can toggle between them
        let bundle_toggle = pure_videos.length > 0 && video_and_audio.length > 0;
        let toggle_ui;
        if (bundle_toggle) {
            // show toggle between pure formats and bundles
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
        // show dropdown for pure videos
        let video_ui = "";
        if (pure_videos.length > 0) {
            let options = `<option value="">None</option>`;
            // None should be at the top, but not selected by default
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

        // show dropdown for pure audios
        let audio_ui = "";
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

        // show dropdown for video + audio bundles or other formats
        let video_and_audio_ui = "";
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


        // put everything together
        ui.innerHTML = `
        <h2>Select download format:</h2>
        ${toggle_ui}
        ${video_ui}
        ${audio_ui}
        ${video_and_audio_ui}
        <button class="btn btn-primary" type="submit" id="preset-confirm">Confirm</button>
        `;
        // retrieve js elements
        let video_select = document.getElementById("video-select");
        let audio_select = document.getElementById("audio-select");
        let va_select = document.getElementById("va-select");
        let no = document.getElementById('format-bundle-no')
        let yes = document.getElementById('format-bundle-yes')
        // if we have a toggle
        if (bundle_toggle) {
            // listen for changes to the toggle, and update the ui accordingly
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
        // wait for confirm click
        let confirm = document.getElementById("preset-confirm");
        await wait_for_button_click(confirm)

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
        return format_selection
    } else {
        // no formats, just show error
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
    // get all presets
    let preset_names = Object.keys(presets);
    preset_names.push("Manual")
    preset_names.push("Advanced")
    // make UI for presets
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
    // grab js elements
    let select = document.getElementById("preset-select");
    let compat = document.getElementById("preset-compat");
    let confirm = document.getElementById("preset-confirm");
    // wait for button click
    await wait_for_button_click(confirm)
    let val = select.value;
    let compat_val = compat.checked;
    if (val === "Manual") {
        // if user chose manual, wait for that
        manual = true;
        ui.innerHTML = "<p>Waiting for format list...</p>";
    } else if (val === "Advanced") {
        // if user chose advanced, show immediately
        await advanced_prompt()
    } else {
        // if user chose a preset, set format_selection to that preset
        format_selection = presets[val]
        // if compat is checked, we need to sort by extension
        if (compat_val) {
            let sort = format_selection.format_sort || [];
            sort.unshift("ext");
            format_selection.format_sort = sort;
        }
        // clear ui
        ui.innerHTML = "";
    }

}

async function advanced_prompt() {
    // despite having the name "advanced", this selection is very simple, just pass raw values to yt-dlp
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
    await wait_for_button_click(confirm)
    format_selection = {}
    // if user entered json shit, add to our options
    if (json.value) {
        Object.assign(format_selection, JSON.parse(json.value));
    }
    // add predefined fields if user set them
    if (format.value) {
        format_selection.format = format.value;
    }
    if (sort.value) {
        format_selection.format_sort = sort.value.split(",");
    }
    // clear ui
    ui.innerHTML = "";
    return format_selection

}

function wait_for_button_click(button) {
    return new Promise(resolve => {
        button.addEventListener("click", resolve)
    })
}

let format_promise = show_format_selection()
