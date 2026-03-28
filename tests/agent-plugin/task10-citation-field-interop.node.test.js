const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

test("native Zotero adapter maps agent citation items onto the vendored CitationService request shape", async () => {
    const {createNativeCitationItems, NATIVE_STORAGE_KEYS} = require(path.join(pluginRoot, "scripts", "zotero-native-adapter.js"));
    const mapped = createNativeCitationItems([{
        key: "ITEM-1",
        library: "user",
        prefix: "see ",
        locator: "12"
    }, {
        key: "ITEM-2",
        library: "group",
        libraryId: "44",
        suffix: ", p. 9",
        label: "page",
        suppressAuthor: true
    }], {
        userId: "42"
    });

    assert.deepEqual(mapped, {
        "agent-citation-0": {
            id: "ITEM-1",
            userID: "42",
            prefix: "see ",
            locator: "12"
        },
        "agent-citation-1": {
            id: "ITEM-2",
            groupID: "44",
            suffix: ", p. 9",
            label: "page",
            "suppress-author": true
        }
    });
    assert.deepEqual(NATIVE_STORAGE_KEYS, {
        userId: "zoteroUserId",
        apiKey: "zoteroApiKey",
        styleId: "zoteroStyleId",
        language: "zoteroLang",
        notesStyle: "zoteroNotesStyleId",
        format: "zoteroFormatId",
        containBibliography: "zoteroContainBibliography"
    });
});

test("browser native context fails closed when Zotero has not been configured yet", async () => {
    const {createBrowserNativeContext} = require(path.join(pluginRoot, "scripts", "zotero-native-adapter.js"));
    const calls = [];
    const storage = new Map([
        ["zoteroStyleId", "apa"],
        ["zoteroLang", "en-US"],
        ["zoteroNotesStyleId", "footnotes"],
        ["zoteroFormatId", "numeric"]
    ]);
    const root = {
        localStorage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            }
        },
        OnlyOfficeAgentVendoredZotero: {
            ZoteroSdk: function() {
                this.hasSettings = function() {
                    calls.push(["hasSettings"]);
                    return false;
                };
                this.setIsOnlineAvailable = function(value) {
                    calls.push(["setIsOnlineAvailable", value]);
                };
            },
            LocalesManager: function() {
                this.getLastUsedLanguage = function() {
                    return "en-US";
                };
                this.loadLocale = function(language) {
                    calls.push(["loadLocale", language]);
                    return Promise.resolve();
                };
                this.setRestApiAvailable = function(value) {
                    calls.push(["locales.setRestApiAvailable", value]);
                };
                this.setDesktopApiAvailable = function(value) {
                    calls.push(["locales.setDesktopApiAvailable", value]);
                };
            },
            CslStylesManager: function() {
                this.getLastUsedStyleIdOrDefault = function() {
                    return "apa";
                };
                this.getLastUsedNotesStyle = function() {
                    return "footnotes";
                };
                this.getLastUsedFormat = function() {
                    return "numeric";
                };
                this.getStyle = function(styleId) {
                    calls.push(["getStyle", styleId]);
                    return Promise.resolve();
                };
                this.setRestApiAvailable = function(value) {
                    calls.push(["styles.setRestApiAvailable", value]);
                };
                this.setDesktopApiAvailable = function(value) {
                    calls.push(["styles.setDesktopApiAvailable", value]);
                };
            },
            CitationService: function() {
                this.setNotesStyle = function(notesStyle) {
                    calls.push(["setNotesStyle", notesStyle]);
                };
                this.setStyleFormat = function(format) {
                    calls.push(["setStyleFormat", format]);
                };
                this.updateCslItems = function() {
                    return Promise.resolve();
                };
                this.insertSelectedCitations = function() {
                    return Promise.resolve();
                };
                this.citationDocService = {
                    getAddinZoteroFields() {
                        return Promise.resolve([]);
                    }
                };
            },
            ZoteroApiChecker: {
                checkStatus() {
                    calls.push(["checkStatus"]);
                    return Promise.resolve({
                        online: false,
                        hasKey: false,
                        desktop: true,
                        hasPermission: true
                    });
                }
            }
        }
    };
    const context = createBrowserNativeContext({
        root,
        storage: root.localStorage
    });

    await assert.rejects(
        context.ensureReady({}),
        /configure Zotero in the visual plugin first/i
    );
    assert.equal(calls.some((entry) => entry[0] === "checkStatus"), false);
    assert.equal(calls.some((entry) => entry[0] === "getStyle"), false);
    assert.equal(calls.some((entry) => entry[0] === "loadLocale"), false);
});

test("native Zotero adapter preloads style and locale, synchronizes native fields, and returns the final inserted citation text after refresh", async () => {
    const {createNativeZoteroAdapter} = require(path.join(pluginRoot, "scripts", "zotero-native-adapter.js"));
    const calls = [];
    const storage = new Map([
        ["zoteroUserId", "42"],
        ["zoteroApiKey", "secret-key"],
        ["zoteroStyleId", "ieee"],
        ["zoteroLang", "fr-FR"],
        ["zoteroNotesStyleId", "footnotes"],
        ["zoteroFormatId", "note"]
    ]);
    const nativeAdapter = createNativeZoteroAdapter({
        root: {
            localStorage: {
                getItem(key) {
                    return storage.has(key) ? storage.get(key) : null;
                }
            }
        },
        createNativeContext() {
            return Promise.resolve({
                ensureReady() {
                    calls.push(["ensureReady"]);
                    return Promise.resolve({
                        userId: "42"
                    });
                },
                updateDocumentState(updateAll, insertBibliography) {
                    calls.push(["updateDocumentState", updateAll, insertBibliography]);
                    return Promise.resolve();
                },
                insertCitation(nativeItems) {
                    calls.push(["insertCitation", nativeItems]);
                    return Promise.resolve({
                        inserted: true,
                        fieldId: "field-1",
                        html: "stale [1]"
                    });
                },
                resolveInsertedCitation(result) {
                    calls.push(["resolveInsertedCitation", result]);
                    return Promise.resolve({
                        inserted: true,
                        fieldId: "field-1",
                        html: "final [2]"
                    });
                }
            });
        }
    });

    const result = await nativeAdapter.insertCitation({
        requestId: "req-native-adapter-1",
        items: [{
            key: "ITEM-1",
            library: "user",
            prefix: "see ",
            locator: "12"
        }]
    });

    assert.deepEqual(calls, [[
        "ensureReady"
    ], [
        "updateDocumentState",
        false,
        false
    ], [
        "insertCitation",
        {
            "agent-citation-0": {
                id: "ITEM-1",
                userID: "42",
                prefix: "see ",
                locator: "12"
            }
        }
    ], [
        "updateDocumentState",
        true,
        false
    ], [
        "resolveInsertedCitation",
        {
            inserted: true,
            fieldId: "field-1",
            html: "stale [1]"
        }
    ]]);
    assert.deepEqual(result, {
        inserted: true,
        fieldId: "field-1",
        html: "final [2]"
    });
});
