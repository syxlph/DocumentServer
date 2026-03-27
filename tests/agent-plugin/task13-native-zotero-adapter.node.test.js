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
