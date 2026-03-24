const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");
const {createAgentPlugin} = require(path.join(pluginRoot, "scripts", "agent.js"));

function findEvent(events, type) {
    return events.find((event) => event.type === type);
}

test("executeMethod passthrough returns a structured success envelope", async () => {
    const hostEvents = [];
    const calls = [];
    const plugin = {
        guid: "asc.{agent-bridge}",
        executeMethod(name, args, callback) {
            calls.push([name, args]);
            callback("8.3.0");
        }
    };
    const agent = createAgentPlugin({
        plugin,
        postHostEvent(payload) {
            hostEvents.push(payload);
        }
    });

    const handled = await agent.onExternalPluginMessage({
        type: "agent.request",
        target: "agent",
        requestId: "req-execute",
        kind: "executeMethod",
        name: "GetVersion",
        args: []
    });

    assert.equal(handled, true);
    assert.deepEqual(calls, [["GetVersion", []]]);
    assert.deepEqual(findEvent(hostEvents, "agent.response"), {
        type: "agent.response",
        target: "agent",
        requestId: "req-execute",
        kind: "executeMethod",
        success: true,
        result: "8.3.0"
    });
    assert.match(findEvent(hostEvents, "agent.log").summary, /GetVersion/);
});

test("callCommand passthrough serializes payloads and parses JSON responses", async () => {
    const hostEvents = [];
    const plugin = {
        guid: "asc.{agent-bridge}",
        callCommand(command, close, recalculate, callback) {
            assert.equal(close, false);
            assert.equal(recalculate, false);

            const serialized = command();
            assert.equal(serialized, JSON.stringify({
                text: "Hello world",
                selectionOnly: false
            }));

            callback(serialized);
        }
    };
    const agent = createAgentPlugin({
        plugin,
        postHostEvent(payload) {
            hostEvents.push(payload);
        }
    });

    const handled = await agent.onExternalPluginMessage({
        type: "agent.request",
        target: "agent",
        requestId: "req-call-command",
        kind: "callCommand",
        code: "return { text: Asc.scope.__agentPayload.text, selectionOnly: Asc.scope.__agentPayload.selectionOnly };",
        args: {
            text: "Hello world",
            selectionOnly: false
        },
        options: {
            recalculate: false
        }
    });

    assert.equal(handled, true);
    assert.deepEqual(findEvent(hostEvents, "agent.response"), {
        type: "agent.response",
        target: "agent",
        requestId: "req-call-command",
        kind: "callCommand",
        success: true,
        result: {
            text: "Hello world",
            selectionOnly: false
        }
    });
    assert.match(findEvent(hostEvents, "agent.log").summary, /callCommand/);
});

test("callCommand parse failures are surfaced as structured bridge errors", async () => {
    const hostEvents = [];
    const plugin = {
        guid: "asc.{agent-bridge}",
        callCommand(command, close, recalculate, callback) {
            callback("not-json");
        }
    };
    const agent = createAgentPlugin({
        plugin,
        postHostEvent(payload) {
            hostEvents.push(payload);
        }
    });

    const handled = await agent.onExternalPluginMessage({
        type: "agent.request",
        target: "agent",
        requestId: "req-bad-json",
        kind: "callCommand",
        code: "return { ok: true };"
    });

    assert.equal(handled, true);
    assert.deepEqual(findEvent(hostEvents, "agent.response"), {
        type: "agent.response",
        target: "agent",
        requestId: "req-bad-json",
        kind: "callCommand",
        success: false,
        error: {
            code: "CALL_COMMAND_RESPONSE_PARSE_FAILED",
            message: "Unexpected token 'o', \"not-json\" is not valid JSON",
            details: {
                rawResult: "not-json"
            }
        }
    });
    assert.equal(findEvent(hostEvents, "agent.log").success, false);
});
