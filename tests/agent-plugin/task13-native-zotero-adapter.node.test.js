const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");
const adapterPath = path.join(pluginRoot, "scripts", "zotero-native-adapter.js");

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

test("native adapter delegates through the vendored runtime seam without touching CitationService globals", async () => {
    const {createNativeZoteroAdapter} = require(adapterPath);
    const calls = [];
    const runtimeFields = [[], [{
        FieldId: "field-9",
        Value: "ITEM-9",
        Content: "[9]"
    }]];
    const root = {
        localStorage: createStorage({
            zoteroUserId: "19488581"
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
            insertCitation(items) {
                calls.push(["insertCitation", items]);
                return Promise.resolve();
            }
        }
    };

    Object.defineProperty(root, "CitationService", {
        configurable: true,
        get() {
            throw new Error("legacy CitationService global should not be read");
        }
    });

    const adapter = createNativeZoteroAdapter({
        root,
        storage: root.localStorage
    });

    await assert.doesNotReject(() =>
        adapter.insertCitation({
            items: [{key: "ITEM-9", library: "user"}]
        })
    );

    assert.deepEqual(calls, [
        ["isConfigured"],
        ["getAddinZoteroFields"],
        ["insertCitation", {
            "agent-citation-0": {
                id: "ITEM-9",
                userID: "19488581"
            }
        }],
        ["getAddinZoteroFields"]
    ]);
});

test("native adapter source no longer carries the constructor-based Zotero context layer", async () => {
    const source = fs.readFileSync(adapterPath, "utf8");

    assert.doesNotMatch(source, /createBrowserNativeContext/);
    assert.doesNotMatch(source, /CitationService/);
    assert.doesNotMatch(source, /ZoteroSdk/);
    assert.doesNotMatch(source, /LocalesManager/);
    assert.doesNotMatch(source, /CslStylesManager/);
});
