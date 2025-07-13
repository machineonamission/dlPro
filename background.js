// when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    // inject the code
    await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ["xmlproxy_content.js", "content.js"],
        injectImmediately: true,
        world: "ISOLATED"
    });
});
