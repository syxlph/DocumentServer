(function(root, factory) {
    var exported = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = exported;
    }

    root.OnlyOfficeAgentZoteroModernLoader = exported;
})(typeof window !== "undefined" ? window : globalThis, function() {
    var VENDORED_SCOPE_KEY = "OnlyOfficeAgentVendoredZotero";

    function getFetchImpl(root, options) {
        if (options && typeof options.fetch === "function") {
            return options.fetch;
        }
        if (root && typeof root.fetch === "function") {
            return root.fetch.bind(root);
        }
        if (typeof fetch === "function") {
            return fetch;
        }
        throw new Error("Vendored Zotero modern loader requires fetch");
    }

    function getBundleUrl(root, options) {
        if (options && options.bundleUrl) {
            return options.bundleUrl;
        }
        return new URL("./../vendor/zotero/dist/bundle.modern.js", root.location.href).href;
    }

    function evaluateBundleIntoScope(root, sourceText) {
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
        [
            "ZoteroApiChecker",
            "ZoteroSdk",
            "LocalesManager",
            "CslStylesManager",
            "CitationService"
        ].forEach(function(name) {
            if (!scope || !scope[name]) {
                throw new Error("Vendored Zotero modern loader could not expose " + name);
            }
        });

        return scope;
    }

    async function loadVendoredZotero(root, options) {
        var targetRoot = root || window;
        if (targetRoot && targetRoot[VENDORED_SCOPE_KEY]) {
            return targetRoot[VENDORED_SCOPE_KEY];
        }

        var sourceText = options && typeof options.sourceText === "string" ? options.sourceText : null;
        if (sourceText === null) {
            var response = await getFetchImpl(targetRoot, options)(getBundleUrl(targetRoot, options));
            if (!response || typeof response.text !== "function") {
                throw new Error("Vendored Zotero modern loader received an invalid response");
            }
            if (response.ok === false) {
                throw new Error("Failed to load vendored Zotero modern bundle");
            }
            sourceText = await response.text();
        }
        var vendoredScope = assertVendoredScope(evaluateBundleIntoScope(targetRoot, sourceText));

        targetRoot[VENDORED_SCOPE_KEY] = vendoredScope;
        return vendoredScope;
    }

    return {loadVendoredZotero: loadVendoredZotero};
});
