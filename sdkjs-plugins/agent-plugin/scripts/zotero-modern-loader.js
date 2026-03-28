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

    async function loadVendoredZotero(root, options) {
        var targetRoot = root || window;
        var sourceText;
        var response;

        if (targetRoot && targetRoot[VENDORED_SCOPE_KEY]) {
            return targetRoot[VENDORED_SCOPE_KEY];
        }

        if (options && typeof options.sourceText === "string") {
            sourceText = options.sourceText;
        } else {
            response = await getFetchImpl(targetRoot, options)(getBundleUrl(targetRoot, options));
            if (!response || typeof response.text !== "function") {
                throw new Error("Vendored Zotero bootstrap received an invalid response");
            }
            sourceText = await response.text();
        }

        var vendoredScope = evaluateBundleIntoScope(targetRoot, sourceText);

        if (
            !vendoredScope ||
            !vendoredScope.ZoteroApiChecker ||
            !vendoredScope.ZoteroSdk ||
            !vendoredScope.LocalesManager ||
            !vendoredScope.CslStylesManager ||
            !vendoredScope.CitationService
        ) {
            throw new Error("Vendored Zotero bootstrap could not expose ZoteroApiChecker");
        }

        targetRoot[VENDORED_SCOPE_KEY] = vendoredScope;
        return vendoredScope;
    }

    return {loadVendoredZotero: loadVendoredZotero};
});
