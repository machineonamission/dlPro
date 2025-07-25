// when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    // inject the code
    const {agree} = await chrome.storage.local.get({"agree": false});
    if (agree) {
        await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            files: ["/core/content/xmlproxy_content.js", "/core/content/content.js"],
            injectImmediately: true,
            world: "ISOLATED"
        });
    } else {
        await chrome.tabs.create({url: chrome.runtime.getURL("/pages/agreement/index.html")});
    }

});

// importScripts("/theme_handler.js")

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.tabs.create({url: chrome.runtime.getURL("/pages/welcome/index.html")});
        chrome.tabs.create({url: chrome.runtime.getURL("/pages/agreement/index.html")});
    }
});
