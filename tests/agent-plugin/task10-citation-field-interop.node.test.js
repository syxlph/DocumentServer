const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");
const adapterPath = path.join(pluginRoot, "scripts", "zotero-native-adapter.js");

function createStorage(seed) {
    const entries = new Map(Object.entries(seed || {}));

    return {
        getItem(key) {
            return entries.has(key) ? entries.get(key) : null;
        }
    };
}

test("native Zotero adapter maps agent citation items onto Zotero-native items without exporting the legacy storage-key surface", async () => {
    const adapterModule = require(adapterPath);
    const {createNativeCitationItems} = adapterModule;
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
    assert.equal(Object.prototype.hasOwnProperty.call(adapterModule, "NATIVE_STORAGE_KEYS"), false);
});

test("native Zotero adapter fails closed when the vendored runtime reports an unconfigured Zotero state", async () => {
    const {CONFIGURE_ZOTERO_MESSAGE, createNativeZoteroAdapter} = require(adapterPath);
    const calls = [];
    const root = {
        localStorage: createStorage({}),
        OnlyOfficeAgentZoteroRuntime: {
            isConfigured() {
                calls.push("isConfigured");
                return false;
            },
            getAddinZoteroFields() {
                calls.push("getAddinZoteroFields");
                return Promise.resolve([]);
            },
            insertCitation() {
                calls.push("insertCitation");
                return Promise.resolve();
            }
        }
    };
    const adapter = createNativeZoteroAdapter({
        root,
        storage: root.localStorage
    });

    await assert.rejects(
        adapter.insertCitation({
            requestId: "req-not-configured",
            items: [{
                key: "ITEM-1",
                library: "user"
            }]
        }),
        (error) => {
            assert.equal(error.code, "ZOTERO_NOT_CONFIGURED");
            assert.equal(error.message, CONFIGURE_ZOTERO_MESSAGE);
            assert.deepEqual(error.details, {});
            return true;
        }
    );
    assert.deepEqual(calls, ["isConfigured"]);
});

test("native Zotero adapter diffs Zotero document fields around vendored runtime insertion and returns the inserted field content", async () => {
    const {createNativeZoteroAdapter} = require(adapterPath);
    const calls = [];
    const runtimeFields = [[{
        FieldId: "field-0",
        Value: "ITEM-0",
        Content: "[1]"
    }], [{
        FieldId: "field-0",
        Value: "ITEM-0",
        Content: "[1]"
    }, {
        FieldId: "field-1",
        Value: "ITEM-1",
        Content: "[2]"
    }]];
    const nativeAdapter = createNativeZoteroAdapter({
        root: {
            localStorage: createStorage({
                zoteroUserId: "42"
            }),
            OnlyOfficeAgentZoteroRuntime: {
                isConfigured() {
                    calls.push(["isConfigured"]);
                    return true;
                },
                getAddinZoteroFields() {
                    calls.push(["getAddinZoteroFields"]);
                    return Promise.resolve(runtimeFields.shift());
                },
                insertCitation(nativeItems) {
                    calls.push(["insertCitation", nativeItems]);
                    return Promise.resolve();
                }
            }
        },
        storage: createStorage({
            zoteroUserId: "42"
        })
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
        "isConfigured"
    ], [
        "getAddinZoteroFields"
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
        "getAddinZoteroFields"
    ]]);
    assert.equal(result.inserted, true);
    assert.equal(result.fieldId, "field-1");
    assert.equal(result.html, "[2]");
});
