// ripped from https://github.com/kairi003/Get-cookies.txt-LOCALLY/blob/master/src/modules/cookie_format.mjs
// Converts cookies from Chrome's JSON format to Netscape format (which is what yt-dlp expects).
function jsonToNetscapeMapper(cookies) {
    return cookies.map(
        ({domain, expirationDate, path, secure, name, value}) => {
            const includeSubDomain = !!domain?.startsWith('.');
            const expiry = expirationDate?.toFixed() ?? '0';
            const arr = [domain, includeSubDomain, path, secure, expiry, name, value];
            return arr.map((v) =>
                typeof v === 'boolean' ? v.toString().toUpperCase() : v,
            );
        },
    );
}

function netscapeSerializer(cookies) {
    const netscapeTable = jsonToNetscapeMapper(cookies);
    const text = [
        '# Netscape HTTP Cookie File',
        '# http://curl.haxx.se/rfc/cookie_spec.html',
        '# This is a generated file!  Do not edit.',
        '',
        ...netscapeTable.map((row) => row.join('\t')),
        '', // Add a new line at the end
    ].join('\n');
    return text;
}

// when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    // inject the code
    const {agree} = await chrome.storage.local.get({"agree": false});
    if (agree) {
        await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            files: ["/promise_utils.js", "/core/content/xmlproxy_content.js", "/core/content/content.js"],
            injectImmediately: true,
            world: "ISOLATED"
        });
    } else {
        await chrome.tabs.create({url: chrome.runtime.getURL("/pages/agreement/index.html")});
    }

});

// so, in firefox only, cookies can only be accessed from the background script.
// the iframe inits it so reloads ask for the cookies again.

async function cookies(url) {
    // gather cookies (can only be done from the background script)
    const cookies = await chrome.cookies.getAll({url: url});
    // serialize to a format yt-dlp expects
    return netscapeSerializer(cookies);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "cookies") {
        cookies(request.url).then(sendResponse);
    }
    // async return
    return true;
})

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.tabs.create({url: chrome.runtime.getURL("/pages/welcome/index.html")});
        chrome.tabs.create({url: chrome.runtime.getURL("/pages/agreement/index.html")});
    }
});
