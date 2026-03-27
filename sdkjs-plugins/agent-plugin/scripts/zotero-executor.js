(function(root, factory) {
    var exported = factory(root);

    if (typeof module === "object" && module.exports) {
        module.exports = exported;
    }

    root.OnlyOfficeAgentZoteroExecutor = exported;
})(typeof window !== "undefined" ? window : globalThis, function(root) {
    var DEFAULT_BASE_URL = "https://api.zotero.org/";
    var DEFAULT_LOCALE = "en-US";
    var fieldFactory = typeof require === "function"
        ? require("./zotero-field.js")
        : (typeof window !== "undefined" ? window.OnlyOfficeAgentZoteroField : null);

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

    function getItemData(entry) {
        if (!entry) {
            return null;
        }

        if (entry.data) {
            return entry.data;
        }

        if (entry.itemData) {
            return entry.itemData;
        }

        return entry;
    }

    function buildItemUri(settings, item) {
        var libraryId = item && item.libraryId ? String(item.libraryId) : "";
        var key = item && item.key ? String(item.key) : "";

        if (!key) {
            return "";
        }

        if (item && item.library === "group") {
            return "http://zotero.org/groups/" + libraryId + "/items/" + key;
        }

        return "http://zotero.org/users/" + String(settings && settings.userId ? settings.userId : "") + "/items/" + key;
    }

    function buildCitationItem(entry, requestItem, settings) {
        var itemData = getItemData(entry);
        var uri = "";
        var citationItem;

        if (!entry) {
            return null;
        }

        if (entry.uri) {
            uri = String(entry.uri);
        } else if (entry.links && entry.links.self && entry.links.self.href) {
            uri = String(entry.links.self.href);
        } else {
            uri = buildItemUri(settings, requestItem);
        }

        citationItem = {
            id: itemData && itemData.id !== undefined ? itemData.id : (entry.id !== undefined ? entry.id : requestItem.key),
            uris: uri ? [uri] : [],
            itemData: itemData
        };

        if (uri) {
            citationItem.uri = uri;
        }

        if (requestItem.locator !== undefined) {
            citationItem.locator = requestItem.locator;
        }

        if (requestItem.label !== undefined) {
            citationItem.label = requestItem.label;
        }

        if (requestItem.prefix !== undefined) {
            citationItem.prefix = requestItem.prefix;
        }

        if (requestItem.suffix !== undefined) {
            citationItem.suffix = requestItem.suffix;
        }

        if (requestItem["suppress-author"] !== undefined) {
            citationItem["suppress-author"] = !!requestItem["suppress-author"];
        } else if (requestItem.suppressAuthor !== undefined) {
            citationItem["suppress-author"] = !!requestItem.suppressAuthor;
        }

        return citationItem;
    }

    function stripHtml(value) {
        return String(value || "").replace(/<[^>]+>/g, "");
    }

    function createZoteroExecutor(options) {
        var fetchImpl = options.fetch || root.fetch;
        var storage = options.storage || root.localStorage;
        var baseUrl = options.baseUrl || DEFAULT_BASE_URL;
        var createCitationFieldPayload = options.createCitationFieldPayload || (fieldFactory && fieldFactory.createCitationFieldPayload);

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
            url.searchParams.set("include", "data,citation");
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
                    var citationItems = payload.map(function(entry, index) {
                        return buildCitationItem(entry, items[index] || {}, settings);
                    }).filter(Boolean);

                    if (citations.length < 1) {
                        throw new Error("Zotero did not return a citation");
                    }

                    return {
                        html: citations.join("; "),
                        content: stripHtml(citations.join("; ")),
                        citationItems: citationItems,
                        settings: settings
                    };
                });
        }

        function buildCitationFieldPayload(citationOrOptions, items, payloadOptions) {
            if (typeof createCitationFieldPayload !== "function") {
                throw new Error("Zotero citation field helper is not available");
            }

            if (citationOrOptions && citationOrOptions.citation) {
                return createCitationFieldPayload(citationOrOptions);
            }

            return createCitationFieldPayload({
                citation: citationOrOptions,
                items: items || [],
                existingFields: payloadOptions && payloadOptions.existingFields,
                requestId: payloadOptions && payloadOptions.requestId,
                citationID: payloadOptions && payloadOptions.citationID,
                noteIndex: payloadOptions && payloadOptions.noteIndex,
                content: payloadOptions && payloadOptions.content,
                settings: payloadOptions && payloadOptions.settings
            });
        }

        return {
            getSettings: getSettings,
            formatCitation: formatCitation,
            createCitationFieldPayload: buildCitationFieldPayload
        };
    }

    return {
        createZoteroExecutor: createZoteroExecutor,
        createCitationFieldPayload: function(options) {
            var executor = createZoteroExecutor({
                createCitationFieldPayload: fieldFactory && fieldFactory.createCitationFieldPayload
            });

            return executor.createCitationFieldPayload(options || {});
        }
    };
});
