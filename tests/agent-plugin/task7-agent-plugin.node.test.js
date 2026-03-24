const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

test("agent plugin manifest declares the hidden word-only agent runtime", async () => {
    const config = require(path.join(pluginRoot, "config.json"));

    assert.equal(config.name, "Agent Bridge");
    assert.equal(config.variations.length, 1);
    assert.equal(config.variations[0].type, "agent");
    assert.deepEqual(config.variations[0].EditorsSupport, ["word"]);
    assert.deepEqual(config.variations[0].events, ["onContextMenuShow", "onContextMenuClick"]);
});

test("agent plugin boots and exposes a real context-menu bridge item", async () => {
    const {createAgentPlugin} = require(path.join(pluginRoot, "scripts", "agent.js"));
    const calls = [];
    const hostEvents = [];
    const plugin = {
        guid: "asc.{00000000-0000-0000-0000-000000000001}",
        executeMethod(name, args, callback) {
            calls.push([name, args]);
            if (name === "GetVersion" && callback) {
                callback("8.3.0");
            } else if (callback) {
                callback(true);
            }
        }
    };
    const agent = createAgentPlugin({
        plugin,
        postHostEvent(payload) {
            hostEvents.push(payload);
        }
    });

    agent.init();
    agent.onContextMenuShow({selectionType: "text"});
    agent.onContextMenuClick("agent-add-citation");

    assert.equal(agent.getState().ready, true);
    assert.deepEqual(hostEvents[0], {
        type: "agent.ready",
        guid: plugin.guid,
        version: "1.0.0"
    });
    assert.deepEqual(calls[0], ["AddContextMenuItem", [{
        guid: plugin.guid,
        items: [{
            id: "agent-add-citation",
            text: "Add Citation"
        }]
    }]]);
    assert.deepEqual(hostEvents[1], {
        type: "agent.contextMenuClick",
        itemId: "agent-add-citation",
        editorVersion: "8.3.0"
    });
});
