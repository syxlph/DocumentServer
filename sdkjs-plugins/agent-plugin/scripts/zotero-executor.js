(function(root, factory) {
    var exported = factory(root);

    if (typeof module === "object" && module.exports) {
        module.exports = exported;
    }

    root.OnlyOfficeAgentZoteroExecutor = exported;
})(typeof window !== "undefined" ? window : globalThis, function(root) {
    var DEFAULT_BASE_URL = "https://api.zotero.org/";
    var DEFAULT_LOCALE = "en-US";

    function getStorageValue(storage, key) {
        if (!storage || typeof storage.getItem !== "function") {
            return null;
        }

        return storage.getItem(key);
    }

    function extractCitation(entry) {
        if (!entry) {
            return "";
        }

        if (typeof entry.citation === "string" && entry.citation.length > 0) {
            return entry.citation;
        }

        if (entry.data && typeof entry.data.citation === "string" && entry.data.citation.length > 0) {
            return entry.data.citation;
        }

        if (entry.meta && typeof entry.meta.citation === "string" && entry.meta.citation.length > 0) {
            return entry.meta.citation;
        }

        return "";
    }

    function createZoteroExecutor(options) {
        var fetchImpl = options.fetch || root.fetch;
        var storage = options.storage || root.localStorage;
        var baseUrl = options.baseUrl || DEFAULT_BASE_URL;

        function getSettings() {
            var groups = getStorageValue(storage, "zoteroUserGroups");

            return {
                userId: getStorageValue(storage, "zoteroUserId"),
                apiKey: getStorageValue(storage, "zoteroApiKey"),
                groups: groups ? groups.split(";").filter(Boolean) : [],
                styleId: getStorageValue(storage, "zoteroStyleId"),
                locale: getStorageValue(storage, "zoteroLocale") || DEFAULT_LOCALE
            };
        }

        function buildCitationUrl(settings, items, options) {
            var firstItem = items[0] || {};
            var library = firstItem.library === "group" ? "groups/" + firstItem.libraryId : "users/" + settings.userId;
            var url = new URL(library + "/items", baseUrl);

            url.searchParams.set("format", "json");
            url.searchParams.set("include", "citation");
            url.searchParams.set("style", options && options.style ? options.style : settings.styleId);
            url.searchParams.set("locale", options && options.locale ? options.locale : settings.locale);
            url.searchParams.set("itemKey", items.map(function(item) {
                return item.key;
            }).join(","));

            return url;
        }

        function formatCitation(items, options) {
            var settings = getSettings();

            if (!settings.userId || !settings.apiKey) {
                return Promise.reject(new Error("Missing Zotero API credentials"));
            }

            if (!settings.styleId && !(options && options.style)) {
                return Promise.reject(new Error("Missing Zotero citation style"));
            }

            if (!Array.isArray(items) || items.length < 1) {
                return Promise.reject(new Error("No Zotero items were provided"));
            }

            return fetchImpl(buildCitationUrl(settings, items, options).toString(), {
                headers: {
                    "Zotero-API-Key": settings.apiKey,
                    "Zotero-API-Version": "3"
                }
            })
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error(response.status + " " + response.statusText);
                    }

                    return response.json();
                })
                .then(function(payload) {
                    var citations = payload.map(extractCitation).filter(Boolean);

                    if (citations.length < 1) {
                        throw new Error("Zotero did not return a citation");
                    }

                    return {
                        html: citations.join("; "),
                        settings: settings
                    };
                });
        }

        return {
            getSettings: getSettings,
            formatCitation: formatCitation
        };
    }

    return {
        createZoteroExecutor: createZoteroExecutor
    };
});
