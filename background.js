// when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    // inject the code
    await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ["content/xmlproxy_content.js", "content/content.js"],
        injectImmediately: true,
        world: "ISOLATED"
    });
});

function handleThemeChange(dark) {
    let icondata = {};
    for (const scale of [16, 32, 64, 48, 128]) {
        icondata[`${scale}`] = `/logo/${dark ? "dark" : "light"}/logo-${scale}.png`;
    }
    chrome.action.setIcon(icondata)
}

// importScripts("/theme_handler.js")
