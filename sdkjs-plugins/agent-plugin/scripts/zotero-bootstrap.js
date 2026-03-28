(function(root) {
    var VENDORED_SCOPE_KEY = "OnlyOfficeAgentVendoredZotero";
    var REQUIRED_GLOBALS = [
        "ZoteroApiChecker",
        "ZoteroSdk",
        "LocalesManager",
        "CslStylesManager",
        "CitationService"
    ];

    function getFetchImpl() {
        if (root && typeof root.fetch === "function") {
            return root.fetch.bind(root);
        }

        if (typeof fetch === "function") {
            return fetch;
        }

        throw new Error("Vendored Zotero bootstrap requires fetch");
    }

    function getBundleUrl() {
        return new URL("./vendor/zotero/dist/bundle.modern.js", root.location.href).href;
    }

    function evaluateBundle(sourceText) {
        var factory = new Function(
            "window",
            sourceText + "\nreturn {" +
                "ZoteroApiChecker: typeof ZoteroApiChecker !== 'undefined' ? ZoteroApiChecker : undefined," +
                "ZoteroSdk: typeof ZoteroSdk !== 'undefined' ? ZoteroSdk : undefined," +
                "LocalesManager: typeof LocalesManager !== 'undefined' ? LocalesManager : undefined," +
                "CslStylesManager: typeof CslStylesManager !== 'undefined' ? CslStylesManager : undefined," +
                "CitationService: typeof CitationService !== 'undefined' ? CitationService : undefined" +
            "};"
        );

        return factory(root);
    }

    function assertVendoredScope(scope) {
        REQUIRED_GLOBALS.forEach(function(name) {
            if (!scope || !scope[name]) {
                throw new Error("Vendored Zotero bootstrap could not expose " + name);
            }
        });

        return scope;
    }

    function loadVendoredZotero() {
        if (root && root[VENDORED_SCOPE_KEY]) {
            return Promise.resolve(root[VENDORED_SCOPE_KEY]);
        }

        return getFetchImpl()(getBundleUrl())
            .then(function(response) {
                if (!response || typeof response.text !== "function") {
                    throw new Error("Vendored Zotero bootstrap received an invalid response");
                }

                if (response.ok === false) {
                    throw new Error("Failed to load vendored Zotero bundle");
                }

                return response.text();
            })
            .then(function(sourceText) {
                var scope = assertVendoredScope(evaluateBundle(sourceText));
                root[VENDORED_SCOPE_KEY] = scope;
                return scope;
            });
    }

    function showBootstrapError(error) {
        var message = error && error.message ? error.message : String(error);
        var wrapper = root.document && root.document.getElementById
            ? root.document.getElementById("errorWrapper")
            : null;

        if (wrapper) {
            wrapper.hidden = false;
            wrapper.textContent = message;
        }

        if (root.console && typeof root.console.error === "function") {
            root.console.error(error);
        }
    }

    loadVendoredZotero()
        .then(function() {
            if (root.OnlyOfficeAgentPlugin && root.Asc && root.Asc.plugin) {
                root.OnlyOfficeAgentPlugin.bootstrap(root);
            }
        })
        .catch(showBootstrapError);
})(typeof window !== "undefined" ? window : globalThis);
