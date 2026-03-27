const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

function createStorage(seed) {
    const map = new Map(Object.entries(seed));
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        }
    };
}

test("native adapter primes the loaded CSL style before formatter updates run", async () => {
    const {createNativeZoteroAdapter, createBrowserNativeContext} = require(path.join(pluginRoot, "scripts", "zotero-native-adapter.js"));
    const calls = [];

    function FakeStylesManager() {
        this._cache = {};
        this._lastStyle = "ieee";
    }
    FakeStylesManager.prototype.getLastUsedStyleIdOrDefault = function() {
        return this._lastStyle;
    };
    FakeStylesManager.prototype.getLastUsedNotesStyle = function() {
        return "footnotes";
    };
    FakeStylesManager.prototype.getLastUsedFormat = function() {
        return "numeric";
    };
    FakeStylesManager.prototype.getStyle = async function(id, saveToLocalStorage) {
        calls.push(["getStyle", id, saveToLocalStorage]);
        return {content: "<style><citation><layout/></citation><bibliography/></style>", styleFormat: "numeric"};
    };
    FakeStylesManager.prototype.cached = function(id) {
        calls.push(["cached", id, this._cache[id] || null]);
        return this._cache[id] || null;
    };
    FakeStylesManager.prototype.setRestApiAvailable = function() {};
    FakeStylesManager.prototype.setDesktopApiAvailable = function() {};

    function FakeLocalesManager() {
        this._cache = {"en-US": "<locale xml:lang='en-US'></locale>"};
        this._selectedLanguage = "en-US";
    }
    FakeLocalesManager.prototype.getLastUsedLanguage = function() {
        return "en-US";
    };
    FakeLocalesManager.prototype.loadLocale = async function(id) {
        return this._cache[id];
    };
    FakeLocalesManager.prototype.getLocale = function(id) {
        return this._cache[id || this._selectedLanguage] || null;
    };
    FakeLocalesManager.prototype.setRestApiAvailable = function() {};
    FakeLocalesManager.prototype.setDesktopApiAvailable = function() {};

    function FakeCitationService(localesManager, styleManager) {
        this.citationDocService = {getAddinZoteroFields: async () => []};
        this._localesManager = localesManager;
        this._cslStylesManager = styleManager;
    }
    FakeCitationService.prototype.setNotesStyle = function() {};
    FakeCitationService.prototype.setStyleFormat = function() {};
    FakeCitationService.prototype.updateCslItems = async function() {
        assert.ok(this._cslStylesManager.cached("ieee"), "expected adapter to prime style cache before formatter work");
    };
    FakeCitationService.prototype.insertSelectedCitations = async function() {};

    const root = {
        localStorage: createStorage({
            zoteroUserId: "19488581",
            zoteroApiKey: "test-api-key",
            zoteroStyleId: "ieee"
        }),
        OnlyOfficeAgentVendoredZotero: {
            ZoteroApiChecker: {
                checkStatus: async () => ({online: true, hasKey: true})
            },
            ZoteroSdk: function ZoteroSdk() {
                this.hasSettings = () => true;
                this.setIsOnlineAvailable = () => {};
            },
            LocalesManager: FakeLocalesManager,
            CslStylesManager: FakeStylesManager,
            CitationService: FakeCitationService
        }
    };

    const adapter = createNativeZoteroAdapter({
        root,
        createNativeContext() {
            return createBrowserNativeContext({root, storage: root.localStorage});
        }
    });

    await assert.doesNotReject(() =>
        adapter.insertCitation({
            items: [{key: "ITEM-1", library: "user"}],
            options: {style: "ieee"}
        })
    );

    assert.deepEqual(calls[0], ["getStyle", "ieee", false]);
});

test("native adapter uses the request-scoped style bibliography state instead of stale storage", async () => {
    const {createNativeZoteroAdapter, createBrowserNativeContext} = require(path.join(pluginRoot, "scripts", "zotero-native-adapter.js"));
    const calls = [];

    function FakeStylesManager() {
        this._cache = {};
        this._lastStyle = "no-biblio-style";
    }
    FakeStylesManager.prototype.getLastUsedStyleIdOrDefault = function() {
        return this._lastStyle;
    };
    FakeStylesManager.prototype.getLastUsedNotesStyle = function() {
        return "footnotes";
    };
    FakeStylesManager.prototype.getLastUsedFormat = function() {
        return "numeric";
    };
    FakeStylesManager.prototype.isLastUsedStyleContainBibliography = function() {
        return true;
    };
    FakeStylesManager.prototype.getStyle = async function(id, saveToLocalStorage) {
        calls.push(["getStyle", id, saveToLocalStorage]);
        return {content: "<style><citation><layout/></citation></style>", styleFormat: "author-date"};
    };
    FakeStylesManager.prototype.cached = function(id) {
        return this._cache[id] || null;
    };
    FakeStylesManager.prototype.setRestApiAvailable = function() {};
    FakeStylesManager.prototype.setDesktopApiAvailable = function() {};

    function FakeLocalesManager() {
        this._cache = {"en-US": "<locale xml:lang='en-US'></locale>"};
        this._selectedLanguage = "en-US";
    }
    FakeLocalesManager.prototype.getLastUsedLanguage = function() {
        return "en-US";
    };
    FakeLocalesManager.prototype.loadLocale = async function(id) {
        return this._cache[id];
    };
    FakeLocalesManager.prototype.getLocale = function(id) {
        return this._cache[id || this._selectedLanguage] || null;
    };
    FakeLocalesManager.prototype.setRestApiAvailable = function() {};
    FakeLocalesManager.prototype.setDesktopApiAvailable = function() {};

    function FakeCitationService(localesManager, styleManager) {
        this.citationDocService = {getAddinZoteroFields: async () => []};
        this._localesManager = localesManager;
        this._cslStylesManager = styleManager;
    }
    FakeCitationService.prototype.setNotesStyle = function() {};
    FakeCitationService.prototype.setStyleFormat = function() {};
    FakeCitationService.prototype.updateCslItems = async function() {
        calls.push(["containBibliography", this._cslStylesManager.isLastUsedStyleContainBibliography()]);
        assert.equal(this._cslStylesManager.isLastUsedStyleContainBibliography(), false);
    };
    FakeCitationService.prototype.insertSelectedCitations = async function() {};

    const root = {
        localStorage: createStorage({
            zoteroUserId: "19488581",
            zoteroApiKey: "test-api-key",
            zoteroStyleId: "default-style",
            zoteroContainBibliography: "true"
        }),
        OnlyOfficeAgentVendoredZotero: {
            ZoteroApiChecker: {
                checkStatus: async () => ({online: true, hasKey: true})
            },
            ZoteroSdk: function ZoteroSdk() {
                this.hasSettings = () => true;
                this.setIsOnlineAvailable = () => {};
            },
            LocalesManager: FakeLocalesManager,
            CslStylesManager: FakeStylesManager,
            CitationService: FakeCitationService
        }
    };

    const adapter = createNativeZoteroAdapter({
        root,
        createNativeContext() {
            return createBrowserNativeContext({root, storage: root.localStorage});
        }
    });

    await assert.doesNotReject(() =>
        adapter.insertCitation({
            items: [{key: "ITEM-1", library: "user"}],
            options: {style: "no-biblio-style"}
        })
    );

    assert.deepEqual(calls, [
        ["getStyle", "no-biblio-style", false],
        ["containBibliography", false],
        ["containBibliography", false]
    ]);
});

test("native adapter uses the loaded note-style format when no request format is provided", async () => {
    const {createBrowserNativeContext} = require(path.join(pluginRoot, "scripts", "zotero-native-adapter.js"));
    const calls = [];

    function FakeStylesManager() {
        this._cache = {};
        this._lastStyle = "note-style";
    }
    FakeStylesManager.prototype.getLastUsedStyleIdOrDefault = function() {
        return this._lastStyle;
    };
    FakeStylesManager.prototype.getLastUsedNotesStyle = function() {
        return "footnotes";
    };
    FakeStylesManager.prototype.getLastUsedFormat = function() {
        return "numeric";
    };
    FakeStylesManager.prototype.getStyle = async function(id, saveToLocalStorage) {
        calls.push(["getStyle", id, saveToLocalStorage]);
        return {content: "<style><citation><layout/></citation><bibliography/></style>", styleFormat: "note"};
    };
    FakeStylesManager.prototype.cached = function(id) {
        calls.push(["cached", id, this._cache[id] || null]);
        return this._cache[id] || null;
    };
    FakeStylesManager.prototype.setRestApiAvailable = function() {};
    FakeStylesManager.prototype.setDesktopApiAvailable = function() {};

    function FakeLocalesManager() {
        this._cache = {"en-US": "<locale xml:lang='en-US'></locale>"};
        this._selectedLanguage = "en-US";
    }
    FakeLocalesManager.prototype.getLastUsedLanguage = function() {
        return "en-US";
    };
    FakeLocalesManager.prototype.loadLocale = async function(id) {
        return this._cache[id];
    };
    FakeLocalesManager.prototype.getLocale = function(id) {
        return this._cache[id || this._selectedLanguage] || null;
    };
    FakeLocalesManager.prototype.setRestApiAvailable = function() {};
    FakeLocalesManager.prototype.setDesktopApiAvailable = function() {};

    function FakeCitationService(localesManager, styleManager) {
        this.citationDocService = {getAddinZoteroFields: async () => []};
        this._localesManager = localesManager;
        this._cslStylesManager = styleManager;
    }
    FakeCitationService.prototype.setNotesStyle = function() {};
    FakeCitationService.prototype.setStyleFormat = function(format) {
        calls.push(["setStyleFormat", format]);
    };

    const root = {
        localStorage: createStorage({
            zoteroUserId: "19488581",
            zoteroApiKey: "test-api-key",
            zoteroStyleId: "note-style",
            zoteroFormatId: "numeric"
        }),
        OnlyOfficeAgentVendoredZotero: {
            ZoteroApiChecker: {
                checkStatus: async () => ({online: true, hasKey: true})
            },
            ZoteroSdk: function ZoteroSdk() {
                this.hasSettings = () => true;
                this.setIsOnlineAvailable = () => {};
            },
            LocalesManager: FakeLocalesManager,
            CslStylesManager: FakeStylesManager,
            CitationService: FakeCitationService
        }
    };

    const context = createBrowserNativeContext({root, storage: root.localStorage});
    const result = await context.ensureReady({style: "note-style"});

    assert.deepEqual(result, {
        userId: "19488581",
        apiKey: "test-api-key",
        styleId: "note-style",
        language: "en-US",
        notesStyle: "footnotes",
        format: "note"
    });
    assert.deepEqual(calls, [
        ["getStyle", "note-style", false],
        ["cached", "note-style", null],
        ["setStyleFormat", "note"]
    ]);
});
