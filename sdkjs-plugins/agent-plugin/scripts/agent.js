(function(root, factory) {
    var exported = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = exported;
    }

    root.OnlyOfficeAgentPlugin = exported;

    if (root.Asc && root.Asc.plugin) {
        exported.bootstrap(root);
    }
})(typeof window !== "undefined" ? window : globalThis, function() {
    var VERSION = "1.0.0";
    var MENU_ITEM_ID = "agent-add-citation";

    function createAgentPlugin(options) {
        var plugin = options.plugin;
        var postHostEvent = options.postHostEvent || function() {};
        var logger = options.logger || function() {};
        var state = {
            ready: false,
            lastContextMenuInfo: null
        };

        function log(type, payload) {
            logger({
                type: type,
                payload: payload || null
            });
        }

        return {
            init: function() {
                state.ready = true;
                postHostEvent({
                    type: "agent.ready",
                    guid: plugin.guid,
                    version: VERSION
                });
                log("ready", {
                    guid: plugin.guid
                });
            },

            onContextMenuShow: function(info) {
                state.lastContextMenuInfo = info || null;
                plugin.executeMethod("AddContextMenuItem", [{
                    guid: plugin.guid,
                    items: [{
                        id: MENU_ITEM_ID,
                        text: "Add Citation"
                    }]
                }]);
                log("context-menu-show", info || {});
            },

            onContextMenuClick: function(itemId) {
                if (itemId !== MENU_ITEM_ID) {
                    return false;
                }

                plugin.executeMethod("GetVersion", [], function(version) {
                    postHostEvent({
                        type: "agent.contextMenuClick",
                        itemId: itemId,
                        editorVersion: version
                    });
                    log("context-menu-click", {
                        itemId: itemId,
                        editorVersion: version
                    });
                });

                return true;
            },

            getState: function() {
                return {
                    ready: state.ready,
                    lastContextMenuInfo: state.lastContextMenuInfo
                };
            }
        };
    }

    function bootstrap(currentRoot) {
        var plugin = currentRoot.Asc && currentRoot.Asc.plugin;

        if (!plugin || plugin.__agentBridge) {
            return plugin && plugin.__agentBridge;
        }

        var bridge = createAgentPlugin({
            plugin: plugin,
            postHostEvent: function(payload) {
                if (currentRoot.parent && currentRoot.parent.postMessage) {
                    currentRoot.parent.postMessage(JSON.stringify({
                        type: "onExternalPluginMessageCallback",
                        data: payload
                    }), "*");
                }
            },
            logger: function(entry) {
                if (currentRoot.console && currentRoot.console.log) {
                    currentRoot.console.log("[agent-plugin]", JSON.stringify(entry));
                }
            }
        });

        plugin.__agentBridge = bridge;
        plugin.init = function() {
            bridge.init();
        };
        plugin.event_onContextMenuShow = function(info) {
            bridge.onContextMenuShow(info);
        };
        plugin.event_onContextMenuClick = function(itemId) {
            bridge.onContextMenuClick(itemId);
        };

        return bridge;
    }

    return {
        VERSION: VERSION,
        MENU_ITEM_ID: MENU_ITEM_ID,
        createAgentPlugin: createAgentPlugin,
        bootstrap: bootstrap
    };
});
