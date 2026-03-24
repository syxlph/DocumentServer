const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

test("vendored Zotero executor reads the shared browser-side settings", async () => {
    const {createZoteroExecutor} = require(path.join(pluginRoot, "scripts", "zotero-executor.js"));
    const storage = new Map([
        ["zoteroUserId", "42"],
        ["zoteroApiKey", "secret-key"],
        ["zoteroUserGroups", "12;14"],
        ["zoteroStyleId", "apa"],
        ["zoteroLocale", "en-US"]
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

test("agent plugin page loads the Zotero executor before bootstrapping the bridge", async () => {
    const fs = require("node:fs");
    const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");

    assert.match(html, /scripts\/zotero-executor\.js/);
    assert.ok(
        html.indexOf("scripts/zotero-executor.js") < html.indexOf("scripts/agent.js"),
        "expected zotero-executor.js to load before agent.js"
    );
});

test("insertCitation uses the hidden agent runtime to paste a formatted citation", async () => {
    const {createAgentPlugin} = require(path.join(pluginRoot, "scripts", "agent.js"));
    const hostEvents = [];
    const calls = [];
    const plugin = {
        guid: "asc.{7C0D3AE4-4932-4A1D-9E7A-6A7A2C7D98F1}",
        executeMethod(name, args, callback) {
            calls.push([name, args]);
            if (callback) {
                callback(true);
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
                        html: "(Doe, 2024)"
                    });
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
        "PasteHtml",
        ["(Doe, 2024)"]
    ]]);
    assert.deepEqual(hostEvents[0], {
        type: "agent.response",
        target: "agent",
        requestId: "req-1",
        kind: "insertCitation",
        success: true,
        result: {
            inserted: true,
            html: "(Doe, 2024)"
        }
    });
});
