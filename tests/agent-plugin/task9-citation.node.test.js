const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");
const fieldHelper = require(path.join(pluginRoot, "scripts", "zotero-field.js"));

test("vendored Zotero executor reads shared Zotero auth/settings without depending on a patched native plugin", async () => {
    const {createZoteroExecutor} = require(path.join(pluginRoot, "scripts", "zotero-executor.js"));
    const storage = new Map([
        ["zoteroUserId", "42"],
        ["zoteroApiKey", "secret-key"],
        ["zoteroUserGroups", "12;14"],
        ["zoteroStyleId", "apa"]
    ]);
    const executor = createZoteroExecutor({
        storage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            }
        },
        fetch() {
            throw new Error("fetch should not be used in this test");
        }
    });

    assert.deepEqual(executor.getSettings(), {
        userId: "42",
        apiKey: "secret-key",
        groups: ["12", "14"],
        styleId: "apa",
        locale: "en-US"
    });
});

test("vendored Zotero executor lets request-time locale override missing native locale storage", async () => {
    const {createZoteroExecutor} = require(path.join(pluginRoot, "scripts", "zotero-executor.js"));
    const storage = new Map([
        ["zoteroUserId", "42"],
        ["zoteroApiKey", "secret-key"],
        ["zoteroStyleId", "apa"]
    ]);
    let requestUrl = null;
    const executor = createZoteroExecutor({
        storage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            }
        },
        fetch(url) {
            requestUrl = new URL(url);

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

    const result = await executor.formatCitation([{
        key: "ITEMKEY",
        library: "user"
    }], {
        locale: "fr-FR"
    });

    assert.equal(requestUrl.searchParams.get("locale"), "fr-FR");
    assert.equal(result.html, "(Doe, 2024)");
});

test("vendored Zotero executor fetches citation text and item data for native Zotero field payloads", async () => {
    const {createZoteroExecutor} = require(path.join(pluginRoot, "scripts", "zotero-executor.js"));
    const storage = new Map([
        ["zoteroUserId", "42"],
        ["zoteroApiKey", "secret-key"],
        ["zoteroStyleId", "ieee"]
    ]);
    let requestUrl = null;
    const executor = createZoteroExecutor({
        storage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            }
        },
        fetch(url) {
            requestUrl = new URL(url);

            return Promise.resolve({
                ok: true,
                json() {
                    return Promise.resolve([{
                        key: "ITEMKEY",
                        citation: "[2]",
                        data: {
                            id: 123,
                            type: "article-journal",
                            title: "Example Article"
                        }
                    }]);
                }
            });
        }
    });

    const result = await executor.formatCitation([{
        key: "ITEMKEY",
        library: "user",
        locator: "12"
    }], {
        style: "ieee"
    });

    assert.equal(requestUrl.searchParams.get("include"), "data,citation");
    assert.equal(result.html, "[2]");
    assert.deepEqual(result.citationItems, [{
        id: 123,
        uris: ["http://zotero.org/users/42/items/ITEMKEY"],
        uri: "http://zotero.org/users/42/items/ITEMKEY",
        itemData: {
            id: 123,
            type: "article-journal",
            title: "Example Article"
        },
        locator: "12"
    }]);
});

test("agent plugin page loads the Zotero executor before bootstrapping the bridge", async () => {
    const fs = require("node:fs");
    const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");

    assert.match(html, /scripts\/zotero-field\.js/);
    assert.match(html, /scripts\/zotero-executor\.js/);
    assert.ok(
        html.indexOf("scripts/zotero-field.js") < html.indexOf("scripts/zotero-executor.js"),
        "expected zotero-field.js to load before zotero-executor.js"
    );
    assert.ok(
        html.indexOf("scripts/zotero-executor.js") < html.indexOf("scripts/agent.js"),
        "expected zotero-executor.js to load before agent.js"
    );
});

test("insertCitation uses the hidden agent runtime to create a Zotero add-in field", async () => {
    const {createAgentPlugin} = require(path.join(pluginRoot, "scripts", "agent.js"));
    const hostEvents = [];
    const calls = [];
    const nativeFieldValue = 'ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"older","properties":{"formattedCitation":"[1]","plainCitation":"[1]","noteIndex":0},"citationItems":[{"id":"OLDER","uris":["http://zotero.org/users/42/items/OLDER"],"uri":"http://zotero.org/users/42/items/OLDER","itemData":{"id":7,"type":"article-journal","title":"Older article"}}],"schema":"https://github.com/citation-style-language/schema/raw/master/csl-citation.json"}';
    const newCitationItem = {
        id: 123,
        uris: ["http://zotero.org/users/42/items/ITEMKEY"],
        uri: "http://zotero.org/users/42/items/ITEMKEY",
        itemData: {
            id: 123,
            type: "article-journal",
            title: "Example Article"
        }
    };
    const plugin = {
        guid: "asc.{7C0D3AE4-4932-4A1D-9E7A-6A7A2C7D98F1}",
        executeMethod(name, args, callback) {
            calls.push([name, args]);
            if (callback) {
                if (name === "GetAllAddinFields") {
                    callback([{
                        FieldId: "1",
                        Value: nativeFieldValue,
                        Content: "[1]"
                    }]);
                } else {
                    callback(true);
                }
            }
        }
    };
    const agent = createAgentPlugin({
        plugin,
        postHostEvent(payload) {
            hostEvents.push(payload);
        },
        createZoteroExecutor() {
            return {
                formatCitation(items) {
                    assert.deepEqual(items, [{
                        key: "ITEMKEY",
                        library: "user"
                    }]);
                    return Promise.resolve({
                        html: "[1]",
                        content: "[1]",
                        citationItems: [newCitationItem],
                        settings: {
                            userId: "42"
                        }
                    });
                },
                createCitationFieldPayload(payloadOptions) {
                    const {citation, items, existingFields, requestId, content, settings} = payloadOptions;
                    const normalizedExistingFields = fieldHelper.normalizeAddinFields(existingFields);
                    const expectedContent = fieldHelper.resolveCitationContent({
                        content: content,
                        citationItems: [newCitationItem],
                        existingFields: normalizedExistingFields
                    });

                    assert.deepEqual(citation, {
                        html: "[1]",
                        content: "[1]",
                        citationItems: [newCitationItem],
                        settings: {
                            userId: "42"
                        }
                    });
                    assert.deepEqual(items, [{
                        key: "ITEMKEY",
                        library: "user"
                    }]);
                    assert.deepEqual(normalizedExistingFields, [{
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
                    }]);
                    assert.equal(requestId, "req-1");
                    assert.equal(content, "[1]");
                    assert.equal(expectedContent, fieldHelper.resolveCitationContent({
                        content: "[1]",
                        citationItems: [newCitationItem],
                        existingFields: normalizedExistingFields
                    }));
                    assert.equal(settings.userId, "42");

                    return {
                        addinField: {
                            Value: fieldHelper.buildCitationFieldValue({
                                citationID: "req-1",
                                properties: {
                                    formattedCitation: expectedContent,
                                    plainCitation: expectedContent,
                                    noteIndex: 0
                                },
                                citationItems: [newCitationItem],
                                schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json"
                            }),
                            Content: expectedContent
                        },
                        citation: citation,
                        existingFields: normalizedExistingFields
                    };
                }
            };
        }
    });

    await agent.onExternalPluginMessage({
        type: "agent.request",
        target: "agent",
        requestId: "req-1",
        kind: "insertCitation",
        items: [{
            key: "ITEMKEY",
            library: "user"
        }]
    });

    assert.deepEqual(calls, [[
        "GetAllAddinFields",
        []
    ], [
        "AddAddinField",
        [{
            Value: fieldHelper.buildCitationFieldValue({
                citationID: "req-1",
                properties: {
                    formattedCitation: fieldHelper.resolveCitationContent({
                        content: "[1]",
                        citationItems: [newCitationItem],
                        existingFields: fieldHelper.normalizeAddinFields([{
                            FieldId: "1",
                            Value: nativeFieldValue,
                            Content: "[1]"
                        }])
                    }),
                    plainCitation: fieldHelper.resolveCitationContent({
                        content: "[1]",
                        citationItems: [newCitationItem],
                        existingFields: fieldHelper.normalizeAddinFields([{
                            FieldId: "1",
                            Value: nativeFieldValue,
                            Content: "[1]"
                        }])
                    }),
                    noteIndex: 0
                },
                citationItems: [newCitationItem],
                schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json"
            }),
            Content: fieldHelper.resolveCitationContent({
                content: "[1]",
                citationItems: [newCitationItem],
                existingFields: fieldHelper.normalizeAddinFields([{
                    FieldId: "1",
                    Value: nativeFieldValue,
                    Content: "[1]"
                }])
            })
        }]
    ]]);
    assert.deepEqual(hostEvents[0], {
        type: "agent.response",
        target: "agent",
        requestId: "req-1",
        kind: "insertCitation",
        success: true,
        result: {
            inserted: true,
            html: fieldHelper.resolveCitationContent({
                content: "[1]",
                citationItems: [newCitationItem],
                existingFields: fieldHelper.normalizeAddinFields([{
                    FieldId: "1",
                    Value: nativeFieldValue,
                    Content: "[1]"
                }])
            })
        }
    });
});
