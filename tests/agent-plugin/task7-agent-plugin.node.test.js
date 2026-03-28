const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");
const agentScriptPath = path.join(pluginRoot, "scripts", "agent.js");
const adapterScriptPath = path.join(pluginRoot, "scripts", "zotero-native-adapter.js");

function withFreshAgentGlobals(overrides, callback) {
    const names = [
        "Asc",
        "OnlyOfficeAgentPlugin",
        "OnlyOfficeAgentZoteroRuntime",
        "parent",
        "console"
    ];
    const descriptors = new Map();

    names.forEach((name) => {
        descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        if (Object.prototype.hasOwnProperty.call(overrides, name)) {
            Object.defineProperty(globalThis, name, {
                configurable: true,
                writable: true,
                value: overrides[name]
            });
            return;
        }

        delete globalThis[name];
    });

    delete require.cache[require.resolve(agentScriptPath)];
    delete require.cache[require.resolve(adapterScriptPath)];

    return Promise.resolve()
        .then(callback)
        .finally(() => {
            delete require.cache[require.resolve(agentScriptPath)];
            delete require.cache[require.resolve(adapterScriptPath)];

            names.forEach((name) => {
                const descriptor = descriptors.get(name);

                if (descriptor) {
                    Object.defineProperty(globalThis, name, descriptor);
                    return;
                }

                delete globalThis[name];
            });
        });
}

test("agent plugin manifest declares the hidden word-only agent runtime", async () => {
    const config = require(path.join(pluginRoot, "config.json"));

    assert.equal(config.name, "Agent Bridge");
    assert.equal(config.variations.length, 1);
    assert.equal(config.variations[0].type, "agent");
    assert.deepEqual(config.variations[0].EditorsSupport, ["word"]);
    assert.deepEqual(config.variations[0].events, ["onContextMenuShow", "onContextMenuClick"]);
});

test("agent plugin boots and exposes a real context-menu bridge item", async () => {
    const {createAgentPlugin} = require(agentScriptPath);
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

test("agent plugin does not eagerly bootstrap before the vendored Zotero runtime seam exists", async () => {
    await withFreshAgentGlobals({
        Asc: {
            plugin: {
                guid: "asc.{bootstrap-race-fix}",
                init() {
                    return "original-init";
                },
                executeMethod() {}
            }
        },
        console: {
            log() {}
        }
    }, async () => {
        const agentModule = require(agentScriptPath);
        const originalInit = globalThis.Asc.plugin.init;

        assert.equal(globalThis.Asc.plugin.__agentBridge, undefined);
        assert.equal(globalThis.Asc.plugin.init, originalInit);

        globalThis.OnlyOfficeAgentZoteroRuntime = {
            isConfigured() {
                return true;
            },
            getAddinZoteroFields() {
                return Promise.resolve([]);
            },
            insertCitation() {
                return Promise.resolve();
            }
        };

        const bridge = agentModule.bootstrap(globalThis);

        assert.ok(bridge);
        assert.equal(globalThis.Asc.plugin.__agentBridge, bridge);
        assert.notEqual(globalThis.Asc.plugin.init, originalInit);
    });
});

test("agent plugin bootstrap emits the dedicated host callback lane", async () => {
    const {bootstrap} = require(agentScriptPath);
    const posted = [];
    const root = {
        Asc: {
            plugin: {
                guid: "asc.{00000000-0000-0000-0000-000000000002}",
                executeMethod(_name, _args, callback) {
                    if (callback) {
                        callback(true);
                    }
                }
            }
        },
        OnlyOfficeAgentZoteroRuntime: {
            isConfigured() {
                return true;
            },
            getAddinZoteroFields() {
                return Promise.resolve([]);
            },
            insertCitation() {
                return Promise.resolve();
            }
        },
        parent: {
            postMessage(payload) {
                posted.push(JSON.parse(payload));
            }
        },
        console: {
            log() {}
        }
    };

    const bridge = bootstrap(root);
    bridge.init();

    assert.deepEqual(posted[0], {
        type: "onAgentPluginMessageCallback",
        data: {
            type: "agent.ready",
            guid: "asc.{00000000-0000-0000-0000-000000000002}",
            version: "1.0.0"
        }
    });
});

test("agent plugin responses stay on the dedicated callback lane", async () => {
    const {createAgentPlugin} = require(agentScriptPath);
    const posted = [];
    const plugin = {
        guid: "asc.{00000000-0000-0000-0000-000000000003}",
        executeMethod(name, args, callback) {
            if (name === "GetVersion" && callback) {
                callback("9.3.1");
            }
        }
    };
    const agent = createAgentPlugin({
        plugin,
        postHostEvent(payload) {
            posted.push({
                type: "onAgentPluginMessageCallback",
                data: payload
            });
        }
    });

    agent.init();
    await agent.onExternalPluginMessage({
        type: "agent.request",
        target: "agent",
        requestId: "req-callback-1",
        kind: "executeMethod",
        name: "GetVersion",
        args: []
    });

    assert.equal(posted[0].type, "onAgentPluginMessageCallback");
    assert.equal(posted[1].type, "onAgentPluginMessageCallback");
    assert.deepEqual(posted[1].data, {
        type: "agent.response",
        target: "agent",
        requestId: "req-callback-1",
        kind: "executeMethod",
        success: true,
        result: "9.3.1"
    });
});
