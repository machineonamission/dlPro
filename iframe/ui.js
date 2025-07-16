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

async function manual_select(info_dict) {

}

let ui = document.getElementById("ui");

async function show_format_selection() {
    let preset_names = Object.keys(presets);
    preset_names.push("Manual")
    const preset_ui = `
    <label for="preset-select">
      Select download preset:
    </label>
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
        } else {
            format_selection = presets[val]
            if (compat_val) {
                let sort = format_selection.format_sort || [];
                sort.unshift("ext");
                format_selection.format_sort = sort;
            }
        }
        ui.innerHTML = "";
        if (format_promise) {
            format_promise()
            format_promise = null;
        }
    })
}

show_format_selection()
