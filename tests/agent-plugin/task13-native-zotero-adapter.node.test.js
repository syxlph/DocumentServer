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

test("native adapter reuses persisted Zotero formatting state instead of request-scoped overrides", async () => {
    const {createNativeZoteroAdapter, createBrowserNativeContext} = require(path.join(pluginRoot, "scripts", "zotero-native-adapter.js"));
    const calls = [];

    function FakeStylesManager() {
        this._cache = {};
        this._containBibliography = true;
    }
    FakeStylesManager.prototype.getLastUsedStyleIdOrDefault = function() {
        return "fallback-style";
    };
    FakeStylesManager.prototype.getLastUsedNotesStyle = function() {
        return "footnotes";
    };
    FakeStylesManager.prototype.getLastUsedFormat = function() {
        return "numeric";
    };
    FakeStylesManager.prototype.getStyle = async function(id, saveToLocalStorage) {
        calls.push(["getStyle", id, saveToLocalStorage]);
        if (saveToLocalStorage) {
            this._cache[id] = "<style><citation><layout/></citation><bibliography/></style>";
            this._containBibliography = true;
        }
        return {content: "<style><citation><layout/></citation><bibliography/></style>", styleFormat: "author-date"};
    };
    FakeStylesManager.prototype.cached = function(id) {
        return this._cache[id] || null;
    };
    FakeStylesManager.prototype.isLastUsedStyleContainBibliography = function() {
        return this._containBibliography;
    };
    FakeStylesManager.prototype.setRestApiAvailable = function() {};
    FakeStylesManager.prototype.setDesktopApiAvailable = function() {};

    function FakeLocalesManager() {
        this._cache = {"fr-FR": "<locale xml:lang='fr-FR'></locale>"};
        this._selectedLanguage = "de-DE";
    }
    FakeLocalesManager.prototype.getLastUsedLanguage = function() {
        return this._selectedLanguage;
    };
    FakeLocalesManager.prototype.loadLocale = async function(id) {
        calls.push(["loadLocale", id]);
        this._selectedLanguage = id;
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
    FakeCitationService.prototype.setNotesStyle = function(notesStyle) {
        calls.push(["setNotesStyle", notesStyle]);
    };
    FakeCitationService.prototype.setStyleFormat = function(format) {
        calls.push(["setStyleFormat", format]);
    };
    FakeCitationService.prototype.updateCslItems = async function() {
        calls.push(["updateCslItems"]);
        assert.ok(this._cslStylesManager.cached("apa"), "expected adapter to refresh the persisted Zotero style cache");
        assert.equal(this._cslStylesManager.isLastUsedStyleContainBibliography(), true);
    };
    FakeCitationService.prototype.insertSelectedCitations = async function() {};

    const root = {
        localStorage: createStorage({
            zoteroUserId: "19488581",
            zoteroApiKey: "test-api-key",
            zoteroStyleId: "apa",
            zoteroLang: "fr-FR",
            zoteroNotesStyleId: "endnotes",
            zoteroFormatId: "author-date",
            zoteroContainBibliography: "true"
        }),
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
            options: {style: "ieee", locale: "en-US"}
        })
    );

    assert.deepEqual(calls.slice(0, 4), [
        ["getStyle", "apa", true],
        ["loadLocale", "fr-FR"],
        ["setNotesStyle", "endnotes"],
        ["setStyleFormat", "author-date"]
    ]);
});

test("native context ignores request-scoped formatting overrides and refreshes persisted style state", async () => {
    const {createBrowserNativeContext} = require(path.join(pluginRoot, "scripts", "zotero-native-adapter.js"));
    let capturedStyleManager = null;
    const calls = [];

    function FakeStylesManager() {
        this._cache = {};
        this._containBibliography = true;
    }
    FakeStylesManager.prototype.getLastUsedStyleIdOrDefault = function() {
        return "fallback-style";
    };
    FakeStylesManager.prototype.getLastUsedNotesStyle = function() {
        return "footnotes";
    };
    FakeStylesManager.prototype.getLastUsedFormat = function() {
        return "numeric";
    };
    FakeStylesManager.prototype.getStyle = async function(id, saveToLocalStorage) {
        calls.push(["getStyle", id, saveToLocalStorage]);
        if (saveToLocalStorage) {
            this._cache[id] = "<style><citation><layout/></citation></style>";
            this._containBibliography = false;
        }
        return {content: "<style><citation><layout/></citation></style>", styleFormat: "author-date"};
    };
    FakeStylesManager.prototype.cached = function(id) {
        return this._cache[id] || null;
    };
    FakeStylesManager.prototype.isLastUsedStyleContainBibliography = function() {
        return this._containBibliography;
    };
    FakeStylesManager.prototype.setRestApiAvailable = function() {};
    FakeStylesManager.prototype.setDesktopApiAvailable = function() {};

    function FakeLocalesManager() {
        this._cache = {"fr-FR": "<locale xml:lang='fr-FR'></locale>"};
        this._selectedLanguage = "de-DE";
    }
    FakeLocalesManager.prototype.getLastUsedLanguage = function() {
        return this._selectedLanguage;
    };
    FakeLocalesManager.prototype.loadLocale = async function(id) {
        calls.push(["loadLocale", id]);
        this._selectedLanguage = id;
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
        capturedStyleManager = styleManager;
    }
    FakeCitationService.prototype.setNotesStyle = function(notesStyle) {
        calls.push(["setNotesStyle", notesStyle]);
    };
    FakeCitationService.prototype.setStyleFormat = function(format) {
        calls.push(["setStyleFormat", format]);
    };

    const root = {
        localStorage: createStorage({
            zoteroUserId: "19488581",
            zoteroApiKey: "test-api-key",
            zoteroStyleId: "no-biblio-style",
            zoteroLang: "fr-FR",
            zoteroNotesStyleId: "footnotes",
            zoteroFormatId: "author-date",
            zoteroContainBibliography: "true"
        }),
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
    };

    const context = createBrowserNativeContext({root, storage: root.localStorage});
    const result = await context.ensureReady({style: "ignored-style", locale: "en-US", format: "note"});

    assert.deepEqual(result, {
        userId: "19488581",
        apiKey: "test-api-key",
        styleId: "no-biblio-style",
        language: "fr-FR",
        notesStyle: "footnotes",
        format: "author-date"
    });
    assert.ok(capturedStyleManager, "expected citation service to capture the style manager instance");
    assert.ok(capturedStyleManager.cached("no-biblio-style"));
    assert.equal(capturedStyleManager.isLastUsedStyleContainBibliography(), false);
    assert.deepEqual(calls, [
        ["getStyle", "no-biblio-style", true],
        ["loadLocale", "fr-FR"],
        ["setNotesStyle", "footnotes"],
        ["setStyleFormat", "author-date"]
    ]);
});
