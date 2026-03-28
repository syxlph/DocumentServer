const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

function findEvent(events, type) {
    return events.find((event) => event.type === type);
}

test("insertCitation delegates through the native Zotero adapter and keeps the agent.response envelope stable", async () => {
    const {createAgentPlugin} = require(path.join(pluginRoot, "scripts", "agent.js"));
    const hostEvents = [];
    const adapterCalls = [];
    const plugin = {
        guid: "asc.{native-citation-bridge}",
        executeMethod() {
            throw new Error("legacy heuristic executeMethod path should not run for native insertCitation");
        }
    };
    const nativeAdapter = {
        insertCitation(message) {
            adapterCalls.push(message);
            return Promise.resolve({
                inserted: true,
                html: "[2]"
            });
        }
    };
    const agent = createAgentPlugin({
        plugin,
        nativeZoteroAdapter: nativeAdapter,
        postHostEvent(payload) {
            hostEvents.push(payload);
        }
    });

    const handled = await agent.onExternalPluginMessage({
        type: "agent.request",
        target: "agent",
        requestId: "req-native-1",
        kind: "insertCitation",
        items: [{
            key: "ITEM-1",
            library: "user",
            prefix: "see "
        }],
        options: {
            style: "ieee"
        }
    });

    assert.equal(handled, true);
    assert.deepEqual(adapterCalls, [{
        type: "agent.request",
        target: "agent",
        requestId: "req-native-1",
        kind: "insertCitation",
        items: [{
            key: "ITEM-1",
            library: "user",
            prefix: "see "
        }],
        options: {
            style: "ieee"
        }
    }]);
    assert.deepEqual(findEvent(hostEvents, "agent.response"), {
        type: "agent.response",
        target: "agent",
        requestId: "req-native-1",
        kind: "insertCitation",
        success: true,
        result: {
            inserted: true,
            html: "[2]"
        }
    });
    assert.equal(adapterCalls.length, 1);
    assert.match(findEvent(hostEvents, "agent.log").summary, /insertCitation 1 item/);
});

test("insertCitation surfaces a structured unavailable error when the native Zotero adapter is missing", async () => {
    const {createAgentPlugin} = require(path.join(pluginRoot, "scripts", "agent.js"));
    const hostEvents = [];
    const agent = createAgentPlugin({
        plugin: {
            guid: "asc.{native-citation-missing}"
        },
        postHostEvent(payload) {
            hostEvents.push(payload);
        }
    });

    const handled = await agent.onExternalPluginMessage({
        type: "agent.request",
        target: "agent",
        requestId: "req-native-missing",
        kind: "insertCitation",
        items: [{
            key: "ITEM-1",
            library: "user"
        }]
    });

    assert.equal(handled, true);
    assert.deepEqual(findEvent(hostEvents, "agent.response"), {
        type: "agent.response",
        target: "agent",
        requestId: "req-native-missing",
        kind: "insertCitation",
        success: false,
        error: {
            code: "INSERT_CITATION_UNAVAILABLE",
            message: "Native Zotero citation adapter is not available",
            details: {}
        }
    });
});
