(function(root, factory) {
    var exported = factory(root);

    if (typeof module === "object" && module.exports) {
        module.exports = exported;
    }

    root.OnlyOfficeAgentZoteroNativeAdapter = exported;
})(typeof window !== "undefined" ? window : globalThis, function(root) {
    var USER_ID_STORAGE_KEY = "zoteroUserId";
    var CONFIGURE_ZOTERO_MESSAGE = "Zotero is not configured. Configure Zotero in the visual plugin first.";

    function getStorage(storage) {
        return storage || (root && root.localStorage) || null;
    }

    function getStorageValue(storage, key) {
        var value;

        if (!storage || typeof storage.getItem !== "function") {
            return null;
        }

        value = storage.getItem(key);
        return value === undefined ? null : value;
    }

    function normalizeLibraryId(value) {
        if (value === undefined || value === null || String(value).length < 1) {
            return null;
        }

        return String(value);
    }

    function createNativeCitationItems(items, settings) {
        var nativeItems = {};
        var normalizedItems = Array.isArray(items) ? items : [];
        var userId = normalizeLibraryId(settings && settings.userId);

        normalizedItems.forEach(function(item, index) {
            var entry = {
                id: String(item && item.key ? item.key : item && item.id ? item.id : "")
            };
            var itemLibraryId = normalizeLibraryId(item && item.libraryId);
            var requestId = "agent-citation-" + index;

            if (!entry.id) {
                return;
            }

            if (item && item.library === "group") {
                if (itemLibraryId) {
                    entry.groupID = itemLibraryId;
                }
            } else if (userId) {
                entry.userID = userId;
            }

            if (item && item.prefix !== undefined) {
                entry.prefix = item.prefix;
            }
            if (item && item.suffix !== undefined) {
                entry.suffix = item.suffix;
            }
            if (item && item.locator !== undefined) {
                entry.locator = item.locator;
            }
            if (item && item.label !== undefined) {
                entry.label = item.label;
            }
            if (item && item["suppress-author"] !== undefined) {
                entry["suppress-author"] = !!item["suppress-author"];
            } else if (item && item.suppressAuthor !== undefined) {
                entry["suppress-author"] = !!item.suppressAuthor;
            }

            nativeItems[requestId] = entry;
        });

        return nativeItems;
    }

    function toFieldSignature(field) {
        if (!field) {
            return "";
        }

        return [
            field.FieldId !== undefined ? String(field.FieldId) : "",
            field.Value !== undefined ? String(field.Value) : "",
            field.Content !== undefined ? String(field.Content) : ""
        ].join("::");
    }

    function findInsertedField(before, after) {
        var known = Object.create(null);
        var normalizedBefore = Array.isArray(before) ? before : [];
        var normalizedAfter = Array.isArray(after) ? after : [];
        var index;
        var signature;

        normalizedBefore.forEach(function(field) {
            known[toFieldSignature(field)] = true;
        });

        for (index = normalizedAfter.length - 1; index >= 0; index -= 1) {
            signature = toFieldSignature(normalizedAfter[index]);
            if (!known[signature]) {
                return normalizedAfter[index];
            }
        }

        return normalizedAfter.length ? normalizedAfter[normalizedAfter.length - 1] : null;
    }

    function createAdapterError(code, message, details) {
        var error = new Error(message);

        error.code = code;
        error.details = details || {};

        return error;
    }

    function getVendoredRuntime(currentRoot) {
        var runtime = currentRoot && currentRoot.OnlyOfficeAgentZoteroRuntime;

        if (
            !runtime
            || typeof runtime.isConfigured !== "function"
            || typeof runtime.getAddinZoteroFields !== "function"
            || typeof runtime.insertCitation !== "function"
        ) {
            throw createAdapterError("ZOTERO_RUNTIME_UNAVAILABLE", "Vendored Zotero runtime is unavailable");
        }

        return runtime;
    }

    function readAddinZoteroFields(runtime) {
        if (!runtime || typeof runtime.getAddinZoteroFields !== "function") {
            return Promise.resolve([]);
        }

        return Promise.resolve(runtime.getAddinZoteroFields())
            .catch(function() {
                return [];
            });
    }

    function mergeCitationResult(result, field) {
        var merged = {};

        if (result && typeof result === "object") {
            Object.keys(result).forEach(function(key) {
                merged[key] = result[key];
            });
        }

        if (field && field.FieldId !== undefined) {
            merged.fieldId = field.FieldId;
        }

        if (field && field.Content !== undefined) {
            merged.html = field.Content;
        } else if (!Object.prototype.hasOwnProperty.call(merged, "html")) {
            merged.html = "";
        }

        return merged;
    }

    function createNativeZoteroAdapter(options) {
        var currentRoot = options && options.root ? options.root : root;
        var storage = getStorage(options && options.storage);

        return {
            insertCitation: function(message) {
                var runtime;
                var nativeItems;

                try {
                    runtime = getVendoredRuntime(currentRoot);
                } catch (error) {
                    return Promise.reject(error);
                }

                if (!runtime.isConfigured()) {
                    return Promise.reject(createAdapterError("ZOTERO_NOT_CONFIGURED", CONFIGURE_ZOTERO_MESSAGE));
                }

                nativeItems = createNativeCitationItems(message && message.items ? message.items : [], {
                    userId: getStorageValue(storage, USER_ID_STORAGE_KEY)
                });

                return readAddinZoteroFields(runtime).then(function(beforeFields) {
                    return Promise.resolve(runtime.insertCitation(nativeItems)).then(function(result) {
                        return readAddinZoteroFields(runtime).then(function(afterFields) {
                            var delegatedResult = {};
                            var insertedField = findInsertedField(beforeFields, afterFields);

                            if (result && typeof result === "object") {
                                Object.keys(result).forEach(function(key) {
                                    delegatedResult[key] = result[key];
                                });
                            }

                            if (!Object.prototype.hasOwnProperty.call(delegatedResult, "inserted")) {
                                delegatedResult.inserted = true;
                            }

                            return mergeCitationResult(delegatedResult, insertedField);
                        });
                    });
                });
            }
        };
    }

    return {
        CONFIGURE_ZOTERO_MESSAGE: CONFIGURE_ZOTERO_MESSAGE,
        createNativeCitationItems: createNativeCitationItems,
        createNativeZoteroAdapter: createNativeZoteroAdapter
    };
});
