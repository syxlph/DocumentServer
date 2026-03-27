(function(root, factory) {
    // Deprecated for Task 4: native Zotero in vendor/zotero is now the citation authority.
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

    function getRequestItemKey(item) {
        if (!item || item.key === undefined || item.key === null || String(item.key).length < 1) {
            return "";
        }

        return String(item.key);
    }

    function getEntryKey(entry) {
        if (!entry) {
            return "";
        }

        if (entry.key !== undefined && entry.key !== null && String(entry.key).length > 0) {
            return String(entry.key);
        }

        if (entry.data && entry.data.key !== undefined && entry.data.key !== null && String(entry.data.key).length > 0) {
            return String(entry.data.key);
        }

        if (entry.meta && entry.meta.key !== undefined && entry.meta.key !== null && String(entry.meta.key).length > 0) {
            return String(entry.meta.key);
        }

        return "";
    }

    function buildRequestItemMatcher(items) {
        var requestItems = Array.isArray(items) ? items : [];
        var requestItemsByKey = Object.create(null);
        var consumedIndexes = Object.create(null);
        var index;

        requestItems.forEach(function(item, itemIndex) {
            var key = getRequestItemKey(item);

            if (!key) {
                return;
            }

            if (!requestItemsByKey[key]) {
                requestItemsByKey[key] = [];
            }

            requestItemsByKey[key].push({
                index: itemIndex,
                item: item
            });
        });

        function takeFirstUnconsumedRequestItem() {
            for (index = 0; index < requestItems.length; index += 1) {
                if (consumedIndexes[index]) {
                    continue;
                }

                consumedIndexes[index] = true;
                return requestItems[index];
            }

            return null;
        }

        function takeRequestItemForEntry(entry) {
            var key = getEntryKey(entry);
            var queue = key ? requestItemsByKey[key] : null;
            var candidate;

            if (queue) {
                while (queue.length) {
                    candidate = queue.shift();

                    if (consumedIndexes[candidate.index]) {
                        continue;
                    }

                    consumedIndexes[candidate.index] = true;
                    return candidate.item;
                }
            }

            return takeFirstUnconsumedRequestItem();
        }

        return {
            takeRequestItemForEntry: takeRequestItemForEntry
        };
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
        var normalizedRequestItem = requestItem || {};
        var citationItem;

        if (!entry) {
            return null;
        }

        if (entry.uri) {
            uri = String(entry.uri);
        } else if (entry.links && entry.links.self && entry.links.self.href) {
            uri = String(entry.links.self.href);
        } else {
            uri = buildItemUri(settings, normalizedRequestItem.key ? normalizedRequestItem : entry);
        }

        citationItem = {
            id: itemData && itemData.id !== undefined
                ? itemData.id
                : (entry.id !== undefined ? entry.id : (normalizedRequestItem.key || entry.key || "")),
            uris: uri ? [uri] : [],
            itemData: itemData
        };

        if (uri) {
            citationItem.uri = uri;
        }

        if (normalizedRequestItem.locator !== undefined) {
            citationItem.locator = normalizedRequestItem.locator;
        }

        if (normalizedRequestItem.label !== undefined) {
            citationItem.label = normalizedRequestItem.label;
        }

        if (normalizedRequestItem.prefix !== undefined) {
            citationItem.prefix = normalizedRequestItem.prefix;
        }

        if (normalizedRequestItem.suffix !== undefined) {
            citationItem.suffix = normalizedRequestItem.suffix;
        }

        if (normalizedRequestItem["suppress-author"] !== undefined) {
            citationItem["suppress-author"] = !!normalizedRequestItem["suppress-author"];
        } else if (normalizedRequestItem.suppressAuthor !== undefined) {
            citationItem["suppress-author"] = !!normalizedRequestItem.suppressAuthor;
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
                    var requestItemMatcher = buildRequestItemMatcher(items);
                    var citations = payload.map(extractCitation).filter(Boolean);
                    var citationItems = payload.map(function(entry) {
                        return buildCitationItem(entry, requestItemMatcher.takeRequestItemForEntry(entry), settings);
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
