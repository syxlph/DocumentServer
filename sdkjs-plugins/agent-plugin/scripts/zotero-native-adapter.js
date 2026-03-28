(function(root, factory) {
    var exported = factory(root);

    if (typeof module === "object" && module.exports) {
        module.exports = exported;
    }

    root.OnlyOfficeAgentZoteroNativeAdapter = exported;
})(typeof window !== "undefined" ? window : globalThis, function(root) {
    var STORAGE_KEYS = {
        userId: "zoteroUserId",
        apiKey: "zoteroApiKey",
        styleId: "zoteroStyleId",
        language: "zoteroLang",
        notesStyle: "zoteroNotesStyleId",
        format: "zoteroFormatId",
        containBibliography: "zoteroContainBibliography"
    };
    var HANDLER_NAMES = [
        "init",
        "button",
        "onThemeChanged",
        "onTranslate",
        "event_onContextMenuShow",
        "event_onContextMenuClick",
        "onExternalPluginMessage"
    ];
    var VENDORED_SCOPE_KEY = "OnlyOfficeAgentVendoredZotero";
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

    function getVendoredScope(currentRoot) {
        if (currentRoot && currentRoot[VENDORED_SCOPE_KEY]) {
            return currentRoot[VENDORED_SCOPE_KEY];
        }

        return currentRoot;
    }

    function capturePluginHandlers(plugin) {
        var preserved = {};

        HANDLER_NAMES.forEach(function(name) {
            if (plugin && typeof plugin[name] === "function") {
                preserved[name] = plugin[name];
            }
        });

        return preserved;
    }

    function composePluginHandlers(plugin, preserved, additions) {
        var names = {};

        Object.keys(preserved || {}).forEach(function(name) {
            names[name] = true;
        });
        Object.keys(additions || {}).forEach(function(name) {
            names[name] = true;
        });

        Object.keys(names).forEach(function(name) {
            var original = preserved && preserved[name];
            var added = additions && additions[name];

            if (typeof original === "function" && typeof added === "function") {
                plugin[name] = function() {
                    var originalResult = original.apply(plugin, arguments);
                    var addedResult = added.apply(plugin, arguments);

                    return addedResult !== undefined ? addedResult : originalResult;
                };
                return;
            }

            plugin[name] = typeof added === "function" ? added : original;
        });

        return plugin;
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

    function readNativeSettings(storage) {
        return {
            userId: getStorageValue(storage, STORAGE_KEYS.userId),
            apiKey: getStorageValue(storage, STORAGE_KEYS.apiKey),
            styleId: getStorageValue(storage, STORAGE_KEYS.styleId),
            language: getStorageValue(storage, STORAGE_KEYS.language),
            notesStyle: getStorageValue(storage, STORAGE_KEYS.notesStyle),
            format: getStorageValue(storage, STORAGE_KEYS.format),
            containBibliography: getStorageValue(storage, STORAGE_KEYS.containBibliography)
        };
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

    function ensureVendorGlobals(currentRoot) {
        var vendoredScope = getVendoredScope(currentRoot);
        var requiredGlobals = [
            "ZoteroSdk",
            "LocalesManager",
            "CslStylesManager",
            "CitationService"
        ];

        requiredGlobals.forEach(function(name) {
            if (typeof vendoredScope[name] !== "function") {
                throw new Error("Vendored Zotero global is unavailable: " + name);
            }
        });

        return vendoredScope;
    }

    function configureResourcePaths(localesManager, stylesManager) {
        // The hidden agent runtime does not boot Zotero's visible page router, so we pin
        // the vendored offline CSL assets here instead of mutating the vendored source tree.
        localesManager._LOCALES_PATH = "./vendor/zotero/resources/csl/locales/";
        stylesManager._STYLES_JSON_LOCAL = "./vendor/zotero/resources/csl/styles.json";
        stylesManager._STYLES_LOCAL = "./vendor/zotero/resources/csl/styles/";
        localesManager.setRestApiAvailable(false);
        localesManager.setDesktopApiAvailable(false);
        stylesManager.setRestApiAvailable(false);
        stylesManager.setDesktopApiAvailable(false);
    }

    function readAddinZoteroFields(documentService) {
        if (!documentService || typeof documentService.getAddinZoteroFields !== "function") {
            return Promise.resolve([]);
        }

        return documentService.getAddinZoteroFields()
            .catch(function() {
                return [];
            });
    }

    function findFieldById(fields, fieldId) {
        var normalizedFields = Array.isArray(fields) ? fields : [];
        var normalizedFieldId = fieldId === undefined || fieldId === null ? null : String(fieldId);
        var index;

        if (normalizedFieldId === null) {
            return null;
        }

        for (index = 0; index < normalizedFields.length; index += 1) {
            if (String(normalizedFields[index] && normalizedFields[index].FieldId) === normalizedFieldId) {
                return normalizedFields[index];
            }
        }

        return null;
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

    function resolveNativeAccess(currentRoot, sdk) {
        var checker = getVendoredScope(currentRoot);
        checker = checker && checker.ZoteroApiChecker;
        var hasSettings = sdk && typeof sdk.hasSettings === "function" && sdk.hasSettings();

        if (!hasSettings) {
            return Promise.reject(new Error(CONFIGURE_ZOTERO_MESSAGE));
        }

        if (checker && typeof checker.checkStatus === "function") {
            return Promise.resolve(checker.checkStatus(sdk)).then(function(status) {
                if (status && status.online && status.hasKey) {
                    sdk.setIsOnlineAvailable(true);
                    return status;
                }

                if (status && status.desktop && status.hasPermission) {
                    sdk.setIsOnlineAvailable(false);
                    return status;
                }

                sdk.setIsOnlineAvailable(true);
                return status || {
                    online: true,
                    hasKey: true,
                    desktop: false,
                    hasPermission: false
                };
            });
        }

        sdk.setIsOnlineAvailable(true);
        return Promise.resolve({
            online: true,
            hasKey: true,
            desktop: false,
            hasPermission: false
        });
    }

    function createBrowserNativeContext(options) {
        var currentRoot = options.root || root;
        var storage = getStorage(options.storage);
        var context = null;

        function getOrCreateContext() {
            var vendoredScope;

            if (context) {
                return context;
            }

            vendoredScope = ensureVendorGlobals(currentRoot);

            context = {
                sdk: new vendoredScope.ZoteroSdk(),
                localesManager: new vendoredScope.LocalesManager(),
                styleManager: new vendoredScope.CslStylesManager()
            };
            configureResourcePaths(context.localesManager, context.styleManager);
            context.citationService = new vendoredScope.CitationService(
                context.localesManager,
                context.styleManager,
                context.sdk
            );

            return context;
        }

        function ensureReady() {
            var currentContext = getOrCreateContext();
            var settings = readNativeSettings(storage);
            var effectiveStyleId = settings.styleId || currentContext.styleManager.getLastUsedStyleIdOrDefault();
            var effectiveLanguage = settings.language || currentContext.localesManager.getLastUsedLanguage();
            var effectiveNotesStyle = settings.notesStyle || currentContext.styleManager.getLastUsedNotesStyle();
            var effectiveFormat = settings.format || currentContext.styleManager.getLastUsedFormat();

            return resolveNativeAccess(currentRoot, currentContext.sdk).then(function() {
                return Promise.all([
                    currentContext.styleManager.getStyle(effectiveStyleId, true),
                    currentContext.localesManager.loadLocale(effectiveLanguage)
                ]).then(function(results) {
                    var styleResult = results[0];

                    if (!settings.format && styleResult && styleResult.styleFormat) {
                        effectiveFormat = styleResult.styleFormat;
                    }

                    currentContext.citationService.setNotesStyle(effectiveNotesStyle);
                    currentContext.citationService.setStyleFormat(effectiveFormat);

                    return {
                        userId: settings.userId,
                        apiKey: settings.apiKey,
                        styleId: effectiveStyleId,
                        language: effectiveLanguage,
                        notesStyle: effectiveNotesStyle,
                        format: effectiveFormat
                    };
                });
            });
        }

        function updateDocumentState(updateAll, insertBibliography) {
            return getOrCreateContext().citationService.updateCslItems(!!updateAll, !!insertBibliography);
        }

        function insertCitation(nativeItems) {
            var currentContext = getOrCreateContext();
            var documentService = currentContext.citationService.citationDocService;

            return readAddinZoteroFields(documentService)
                .then(function(beforeFields) {
                    return currentContext.citationService.insertSelectedCitations(nativeItems).then(function() {
                        return readAddinZoteroFields(documentService)
                            .then(function(afterFields) {
                                var insertedField = findInsertedField(beforeFields, afterFields);

                                return mergeCitationResult({
                                    inserted: true,
                                    fieldId: insertedField && insertedField.FieldId !== undefined ? insertedField.FieldId : undefined
                                }, insertedField);
                            });
                    });
                });
        }

        function resolveInsertedCitation(result) {
            var currentContext = getOrCreateContext();
            var documentService = currentContext.citationService.citationDocService;

            return readAddinZoteroFields(documentService).then(function(fields) {
                var refreshedField = findFieldById(fields, result && result.fieldId);

                return mergeCitationResult(result, refreshedField);
            });
        }

        return {
            ensureReady: ensureReady,
            updateDocumentState: updateDocumentState,
            insertCitation: insertCitation,
            resolveInsertedCitation: resolveInsertedCitation
        };
    }

    function createNativeZoteroAdapter(options) {
        var currentRoot = options && options.root ? options.root : root;
        var createNativeContext = options && options.createNativeContext
            ? options.createNativeContext
            : function() {
                return Promise.resolve(createBrowserNativeContext({
                    root: currentRoot,
                    storage: options && options.storage
                }));
            };
        var contextPromise = null;

        function getContext() {
            if (!contextPromise) {
                contextPromise = Promise.resolve(createNativeContext());
            }

            return contextPromise;
        }

        return {
            insertCitation: function(message) {
                return getContext().then(function(context) {
                    return context.ensureReady().then(function(settings) {
                        var nativeItems = createNativeCitationItems(message && message.items ? message.items : [], {
                            userId: settings && settings.userId
                        });

                        return context.updateDocumentState(false, false).then(function() {
                            return context.insertCitation(nativeItems).then(function(result) {
                                return context.updateDocumentState(true, false).then(function() {
                                    if (typeof context.resolveInsertedCitation === "function") {
                                        return context.resolveInsertedCitation(result);
                                    }

                                    return result;
                                });
                            });
                        });
                    });
                });
            }
        };
    }

    return {
        NATIVE_STORAGE_KEYS: STORAGE_KEYS,
        VENDORED_SCOPE_KEY: VENDORED_SCOPE_KEY,
        CONFIGURE_ZOTERO_MESSAGE: CONFIGURE_ZOTERO_MESSAGE,
        capturePluginHandlers: capturePluginHandlers,
        composePluginHandlers: composePluginHandlers,
        createBrowserNativeContext: createBrowserNativeContext,
        createNativeCitationItems: createNativeCitationItems,
        createNativeZoteroAdapter: createNativeZoteroAdapter
    };
});
