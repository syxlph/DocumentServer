const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

test("zotero field helper normalizes native Zotero field values from GetAllAddinFields", async () => {
    const fieldHelper = require(path.join(pluginRoot, "scripts", "zotero-field.js"));
    const nativeFieldValue = 'ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"older","properties":{"formattedCitation":"[1]","plainCitation":"[1]","noteIndex":0},"citationItems":[{"id":"OLDER","uris":["http://zotero.org/users/42/items/OLDER"],"uri":"http://zotero.org/users/42/items/OLDER","itemData":{"id":7,"type":"article-journal","title":"Older article"}}],"schema":"https://github.com/citation-style-language/schema/raw/master/csl-citation.json"}';

    const normalized = fieldHelper.normalizeAddinFields([{
        FieldId: 1,
        Value: nativeFieldValue,
        Content: "[1]"
    }]);

    assert.equal(normalized.length, 1);
    assert.deepEqual(normalized[0], {
        FieldId: "1",
        Value: nativeFieldValue,
        Content: "[1]",
        citation: {
            citationID: "older",
            properties: {
                formattedCitation: "[1]",
                plainCitation: "[1]",
                noteIndex: 0
            },
            citationItems: [{
                id: "OLDER",
                uris: ["http://zotero.org/users/42/items/OLDER"],
                uri: "http://zotero.org/users/42/items/OLDER",
                itemData: {
                    id: 7,
                    type: "article-journal",
                    title: "Older article"
                }
            }],
            schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json"
        }
    });
});

test("zotero field helper reuses prior numeric labels and assigns new ones by document order", async () => {
    const fieldHelper = require(path.join(pluginRoot, "scripts", "zotero-field.js"));
    const nativeFieldValue = 'ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"older","properties":{"formattedCitation":"[1]","plainCitation":"[1]","noteIndex":0},"citationItems":[{"id":"OLDER","uris":["http://zotero.org/users/42/items/OLDER"],"uri":"http://zotero.org/users/42/items/OLDER","itemData":{"id":7,"type":"article-journal","title":"Older article"}}],"schema":"https://github.com/citation-style-language/schema/raw/master/csl-citation.json"}';
    const existingFields = fieldHelper.normalizeAddinFields([{
        FieldId: "1",
        Value: nativeFieldValue,
        Content: "[1]"
    }]);

    assert.equal(fieldHelper.resolveCitationContent({
        content: "[1]",
        citationItems: [{
            id: "OLDER",
            uri: "http://zotero.org/users/42/items/OLDER"
        }],
        existingFields
    }), "[1]");

    assert.equal(fieldHelper.resolveCitationContent({
        content: "[1]",
        citationItems: [{
            id: "NEW",
            uri: "http://zotero.org/users/42/items/NEW"
        }],
        existingFields
    }), "[2]");

    assert.equal(fieldHelper.resolveCitationContent({
        content: "[1, 1]",
        citationItems: [{
            id: "OLDER",
            uri: "http://zotero.org/users/42/items/OLDER"
        }, {
            id: "NEW",
            uri: "http://zotero.org/users/42/items/NEW"
        }],
        existingFields
    }), "[1, 2]");
});

test("zotero executor exposes a native field payload builder that preserves prior citations and item data", async () => {
    const fieldHelper = require(path.join(pluginRoot, "scripts", "zotero-field.js"));
    const {createZoteroExecutor} = require(path.join(pluginRoot, "scripts", "zotero-executor.js"));
    const nativeFieldValue = 'ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"older","properties":{"formattedCitation":"[1]","plainCitation":"[1]","noteIndex":0},"citationItems":[{"id":"OLDER","uris":["http://zotero.org/users/42/items/OLDER"],"uri":"http://zotero.org/users/42/items/OLDER","itemData":{"id":7,"type":"article-journal","title":"Older article"}}],"schema":"https://github.com/citation-style-language/schema/raw/master/csl-citation.json"}';
    const storage = new Map([
        ["zoteroUserId", "42"],
        ["zoteroApiKey", "secret-key"],
        ["zoteroStyleId", "ieee"]
    ]);
    const executor = createZoteroExecutor({
        storage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            }
        },
        fetch(url) {
            const requestUrl = new URL(url);

            assert.equal(requestUrl.searchParams.get("include"), "data,citation");

            return Promise.resolve({
                ok: true,
                json() {
                    return Promise.resolve([{
                        key: "ITEMKEY",
                        citation: "[1]",
                        data: {
                            id: 123,
                            type: "article-journal",
                            title: "New article"
                        }
                    }]);
                }
            });
        }
    });

    const citation = await executor.formatCitation([{
        key: "ITEMKEY",
        library: "user",
        locator: "12"
    }], {
        style: "ieee"
    });
    const existingFields = [{
        FieldId: "1",
        Value: nativeFieldValue,
        Content: "[1]"
    }];
    const expectedContent = fieldHelper.resolveCitationContent({
        content: citation.content,
        citationItems: citation.citationItems,
        existingFields
    });

    const payload = executor.createCitationFieldPayload({
        citation: citation,
        items: [{
            key: "ITEMKEY",
            library: "user",
            locator: "12"
        }],
        existingFields,
        requestId: "req-field-2",
        settings: {
            userId: "42"
        }
    });

    assert.match(payload.addinField.Value, /^ZOTERO_ITEM CSL_CITATION /);
    assert.equal(payload.addinField.Content, expectedContent);
    assert.equal(payload.citation.properties.formattedCitation, expectedContent);
    assert.equal(payload.citation.properties.plainCitation, expectedContent);
    assert.deepEqual(payload.citation.citationItems, [{
        id: 123,
        uris: ["http://zotero.org/users/42/items/ITEMKEY"],
        uri: "http://zotero.org/users/42/items/ITEMKEY",
        itemData: {
            id: 123,
            type: "article-journal",
            title: "New article"
        },
        locator: "12"
    }]);
    assert.deepEqual(payload.existingFields, fieldHelper.normalizeAddinFields(existingFields));
});
