const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

test("zotero field helper builds and parses native Zotero citation payloads", async () => {
    const fieldHelper = require(path.join(pluginRoot, "scripts", "zotero-field.js"));

    const payload = fieldHelper.createCitationFieldPayload({
        requestId: "req-field-1",
        items: [{
            key: "ITEMKEY",
            library: "user"
        }],
        content: "(Doe, 2024)"
    });

    assert.match(payload.Value, /^ZOTERO_ITEM CSL_CITATION /);
    assert.equal(payload.Content, "(Doe, 2024)");

    const parsed = fieldHelper.parseCitationFieldValue(payload.Value);
    assert.deepEqual(parsed, {
        citationID: "req-field-1",
        properties: {
            formattedCitation: "(Doe, 2024)",
            plainCitation: "(Doe, 2024)",
            noteIndex: 0
        },
        citationItems: [{
            id: "ITEMKEY"
        }],
        schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json"
    });
});

test("zotero executor exposes a native field payload builder", async () => {
    const fieldHelper = require(path.join(pluginRoot, "scripts", "zotero-field.js"));
    const {createZoteroExecutor} = require(path.join(pluginRoot, "scripts", "zotero-executor.js"));
    const storage = new Map([
        ["zoteroUserId", "42"],
        ["zoteroApiKey", "secret-key"],
        ["zoteroStyleId", "apa"]
    ]);
    const executor = createZoteroExecutor({
        storage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            }
        },
        fetch() {
            return Promise.resolve({
                ok: true,
                json() {
                    return Promise.resolve([{
                        citation: "(Doe, 2024)"
                    }]);
                }
            });
        }
    });

    const payload = executor.createCitationFieldPayload({
        html: "(Doe, 2024)",
        content: "(Doe, 2024)"
    }, [{
        key: "ITEMKEY",
        library: "user"
    }], {
        requestId: "req-field-2",
        existingFields: [{
            FieldId: "1",
            Value: "ZOTERO_ITEM CSL_CITATION {}",
            Content: "text"
        }]
    });

    assert.match(payload.Value, /^ZOTERO_ITEM CSL_CITATION /);
    assert.equal(payload.Content, "(Doe, 2024)");
    assert.equal(
        fieldHelper.parseCitationFieldValue(payload.Value).properties.formattedCitation,
        "(Doe, 2024)"
    );
});
