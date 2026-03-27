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
    var CALL_COMMAND_EXECUTION_FAILED = "CALL_COMMAND_EXECUTION_FAILED";
    var CALL_COMMAND_SERIALIZATION_FAILED = "CALL_COMMAND_SERIALIZATION_FAILED";
    var CALL_COMMAND_RESPONSE_PARSE_FAILED = "CALL_COMMAND_RESPONSE_PARSE_FAILED";
    var executorFactory = typeof require === "function"
        ? require("./zotero-executor.js")
        : (typeof window !== "undefined" ? window.OnlyOfficeAgentZoteroExecutor : null);

    function createBridgeError(code, message, details) {
        return {
            code: code,
            message: message,
            details: details || {}
        };
    }

    function createRequestSummary(message) {
        if (!message) {
            return "unknown request";
        }

        if (message.kind === "executeMethod") {
            return "executeMethod " + message.name;
        }

        if (message.kind === "callCommand") {
            var code = typeof message.code === "string" ? message.code.replace(/\s+/g, " ").trim() : "";
            return "callCommand " + code.slice(0, 80);
        }

        if (message.kind === "insertCitation") {
            return "insertCitation " + ((message.items && message.items.length) || 0) + " item(s)";
        }

        return String(message.kind || "unknown");
    }

    function normalizeError(error, fallbackCode, details) {
        if (error && error.code && error.message) {
            return createBridgeError(error.code, error.message, error.details || details || {});
        }

        return createBridgeError(
            fallbackCode,
            error && error.message ? error.message : String(error),
            details || {}
        );
    }

    function createCallCommandFunction(code, payload) {
        var payloadLiteral = JSON.stringify(payload === undefined ? null : payload);

        return new Function(
            "return function() {" +
                "var Asc = typeof Asc !== 'undefined' ? Asc : {};" +
                "Asc.scope = Asc.scope || {};" +
                "Asc.scope.__agentPayload = " + payloadLiteral + ";" +
                "var __agentResult;" +
                "try {" +
                    "var __agentCommand = function() {" + code + "};" +
                    "__agentResult = __agentCommand();" +
                "} catch (error) {" +
                    "return JSON.stringify({__agentError:{" +
                        "code:'" + CALL_COMMAND_EXECUTION_FAILED + "'," +
                        "message:error && error.message ? error.message : String(error)," +
                        "details:{}" +
                    "}});" +
                "}" +
                "try {" +
                    "return JSON.stringify(__agentResult === undefined ? null : __agentResult);" +
                "} catch (error) {" +
                    "return JSON.stringify({__agentError:{" +
                        "code:'" + CALL_COMMAND_SERIALIZATION_FAILED + "'," +
                        "message:error && error.message ? error.message : String(error)," +
                        "details:{}" +
                    "}});" +
                "}" +
            "};"
        )();
    }

    function parseCallCommandResult(returnValue) {
        var parsed;

        if (typeof returnValue !== "string") {
            if (returnValue && returnValue.__agentError) {
                throw normalizeError(returnValue.__agentError, CALL_COMMAND_EXECUTION_FAILED);
            }

            return returnValue === undefined ? null : returnValue;
        }

        try {
            parsed = JSON.parse(returnValue);
        } catch (error) {
            throw createBridgeError(CALL_COMMAND_RESPONSE_PARSE_FAILED, error.message, {
                rawResult: returnValue
            });
        }

        if (parsed && parsed.__agentError) {
            throw normalizeError(parsed.__agentError, CALL_COMMAND_EXECUTION_FAILED);
        }

        return parsed;
    }

    function createAgentPlugin(options) {
        var plugin = options.plugin;
        var postHostEvent = options.postHostEvent || function() {};
        var logger = options.logger || function() {};
        var createZoteroExecutor = options.createZoteroExecutor || (executorFactory && executorFactory.createZoteroExecutor);
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

        function postResponse(message, success, resultOrError) {
            var payload = {
                type: "agent.response",
                target: "agent",
                requestId: message.requestId,
                kind: message.kind,
                success: success
            };

            if (success) {
                payload.result = resultOrError;
            } else {
                payload.error = resultOrError;
            }

            postHostEvent(payload);
        }

        function emitRequestLog(message, startedAt, success, error) {
            var entry = {
                type: "agent.log",
                timestamp: new Date(startedAt).toISOString(),
                guid: plugin.guid,
                requestId: message.requestId || null,
                kind: message.kind || null,
                summary: createRequestSummary(message),
                success: success,
                durationMs: Date.now() - startedAt
            };

            if (!success && error) {
                entry.error = error;
            }

            postHostEvent(entry);
            logger(entry);
        }

        function executeMethod(name, args) {
            return new Promise(function(resolve, reject) {
                try {
                    plugin.executeMethod(name, Array.isArray(args) ? args : [], function(result) {
                        resolve(result);
                    });
                } catch (error) {
                    reject(error);
                }
            });
        }

        function callCommand(code, args, options) {
            if (typeof plugin.callCommand !== "function") {
                return Promise.reject(createBridgeError("CALL_COMMAND_UNAVAILABLE", "Plugin runtime does not expose callCommand"));
            }

            if (typeof code !== "string" || code.trim().length < 1) {
                return Promise.reject(createBridgeError("CALL_COMMAND_INVALID_REQUEST", "callCommand requests require a non-empty code string"));
            }

            return new Promise(function(resolve, reject) {
                try {
                    plugin.callCommand(
                        createCallCommandFunction(code, args),
                        false,
                        !(options && options.recalculate === false),
                        function(result) {
                            try {
                                resolve(parseCallCommandResult(result));
                            } catch (error) {
                                reject(error);
                            }
                        }
                    );
                } catch (error) {
                    reject(normalizeError(error, CALL_COMMAND_EXECUTION_FAILED));
                }
            });
        }

        function insertCitation(message) {
            if (typeof createZoteroExecutor !== "function") {
                return Promise.reject(createBridgeError("INSERT_CITATION_UNAVAILABLE", "Zotero citation executor is not available"));
            }

            return Promise.resolve().then(function() {
                var executor = createZoteroExecutor({});

                return Promise.all([
                    executor.formatCitation(message.items || [], message.options || {}),
                    executeMethod("GetAllAddinFields", [])
                ]).then(function(results) {
                    var result = results[0] || {};
                    var existingFields = Array.isArray(results[1]) ? results[1] : [];
                    var payload = executor.createCitationFieldPayload({
                        citation: result,
                        items: message.items || [],
                        existingFields: existingFields,
                        requestId: message.requestId,
                        content: result.content || result.html,
                        settings: result.settings || {},
                        options: message.options || {}
                    });

                    return executeMethod("AddAddinField", [payload.addinField]).then(function() {
                        return {
                            inserted: true,
                            html: payload.Content || (payload.addinField && payload.addinField.Content) || (payload.citation && payload.citation.properties && payload.citation.properties.formattedCitation) || result.html
                        };
                    });
                });
            });
        }

        function handleRequest(message) {
            if (message.kind === "insertCitation") {
                return insertCitation(message);
            }

            if (message.kind === "executeMethod") {
                return executeMethod(message.name, message.args || []);
            }

            if (message.kind === "callCommand") {
                return callCommand(message.code, message.args, message.options || {});
            }

            return Promise.reject(createBridgeError("UNSUPPORTED_REQUEST_KIND", "Unsupported request kind: " + message.kind));
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

            onExternalPluginMessage: function(message) {
                var startedAt;

                if (!message || message.type !== "agent.request" || message.target !== "agent") {
                    return Promise.resolve(false);
                }

                startedAt = Date.now();

                return handleRequest(message)
                    .then(function(result) {
                        postResponse(message, true, result);
                        emitRequestLog(message, startedAt, true, null);
                        return true;
                    })
                    .catch(function(error) {
                        var normalizedError = normalizeError(error, "AGENT_REQUEST_FAILED");
                        postResponse(message, false, normalizedError);
                        emitRequestLog(message, startedAt, false, normalizedError);
                        return true;
                    });
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
                        type: "onAgentPluginMessageCallback",
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
        plugin.onExternalPluginMessage = function(message) {
            return bridge.onExternalPluginMessage(message);
        };

        return bridge;
    }

    return {
        CALL_COMMAND_EXECUTION_FAILED: CALL_COMMAND_EXECUTION_FAILED,
        CALL_COMMAND_SERIALIZATION_FAILED: CALL_COMMAND_SERIALIZATION_FAILED,
        CALL_COMMAND_RESPONSE_PARSE_FAILED: CALL_COMMAND_RESPONSE_PARSE_FAILED,
        VERSION: VERSION,
        MENU_ITEM_ID: MENU_ITEM_ID,
        createBridgeError: createBridgeError,
        createCallCommandFunction: createCallCommandFunction,
        parseCallCommandResult: parseCallCommandResult,
        createAgentPlugin: createAgentPlugin,
        bootstrap: bootstrap
    };
});
