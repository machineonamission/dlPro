async function getAllCookies(details) {
    details.storeId ??= await getCurrentCookieStoreId();
    const { partitionKey, ...detailsWithoutPartitionKey } = details;
    // Error handling for browsers that do not support partitionKey, such as chrome < 119.
    // `chrome.cookies.getAll()` returns Promise but cannot directly catch() chain.
    const cookiesWithPartitionKey = partitionKey
        ? await Promise.resolve()
            .then(() => chrome.cookies.getAll(details))
            .catch(() => [])
        : [];
    const cookies = await chrome.cookies.getAll(detailsWithoutPartitionKey);
    return [...cookies, ...cookiesWithPartitionKey];
}
const getCurrentCookieStoreId = async () => {
    // If the extension is in split incognito mode, return undefined to choose the default store.
    if (chrome.runtime.getManifest().incognito === 'split') return undefined;

    // Firefox supports the `tab.cookieStoreId` property.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.cookieStoreId) return tab.cookieStoreId;

    // Chrome does not support the `tab.cookieStoreId` property.
    const stores = await chrome.cookies.getAllCookieStores();
    return stores.find((store) => store.tabIds.includes(tab.id))?.id;
};
const jsonToNetscapeMapper = (cookies) => {
    return cookies.map(
        ({ domain, expirationDate, path, secure, name, value }) => {
            const includeSubDomain = !!domain?.startsWith('.');
            const expiry = expirationDate?.toFixed() ?? '0';
            const arr = [domain, includeSubDomain, path, secure, expiry, name, value];
            return arr.map((v) =>
                typeof v === 'boolean' ? v.toString().toUpperCase() : v,
            );
        },
    );
};
const netscapeSerializer = (cookies) => {
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
export const getCookies = async () => {
    const cookies = await getAllCookies();
    const serializedCookies = netscapeSerializer(cookies);
    return serializedCookies;
}
