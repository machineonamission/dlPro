// when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    // inject the code
    await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ["ui.js", "pyodide/pyodide.js", "ffmpeg/ffmpeg.js", /*"ffmpeg/utils.js",*/ "ffmpeg-bridge.js", "content.js"],
        injectImmediately: true,
        world: "ISOLATED"
    });
    // gather cookies (can only be done from the background script)
    const cookies = await chrome.cookies.getAll({url: tab.url});
    // serialize to a format yt-dlp expects
    const sCookies = netscapeSerializer(cookies);
    // send cookies
    chrome.tabs.sendMessage(tab.id, {
        type: 'INIT',
        data: sCookies
    });
});

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
