function wait_for_dom() {
    return new Promise(resolve => {
        document.addEventListener("DOMContentLoaded", resolve)
    })
}

async function wait_for_data() {
    return await chrome.storage.local.get({"agree": false});
}

async function on_agree() {
    document.getElementById("agree").classList.add("d-none")
    document.getElementById("agreed").classList.remove("d-none")
}


async function main() {
    const [data, _] = await Promise.all([wait_for_data(), wait_for_dom()])
    if (data.agree) {
        await on_agree()
    } else {
        await new Promise(resolve => {
            document.getElementById("agree").addEventListener("click", resolve);
        })
        await chrome.storage.local.set({"agree": true});
        await on_agree();
        await new Promise(resolve => {
            setTimeout(resolve, 5000)
        })
        window.close();
    }
}

main()
