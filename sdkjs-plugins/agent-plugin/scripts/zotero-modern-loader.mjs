const VENDORED_SCOPE_KEY = "OnlyOfficeAgentVendoredZotero";

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

function getBundleUrl(options) {
    if (options && options.bundleUrl) {
        return options.bundleUrl;
    }

    return new URL("../vendor/zotero/dist/bundle.modern.js", import.meta.url).href;
}

function readBundleSource(root, options) {
    if (options && typeof options.sourceText === "string") {
        return Promise.resolve(options.sourceText);
    }

    return Promise.resolve(getFetchImpl(root, options)(getBundleUrl(options))).then(function(response) {
        if (!response || typeof response.text !== "function") {
            throw new Error("Vendored Zotero modern loader received an invalid response");
        }

        if (response.ok === false) {
            throw new Error("Failed to load vendored Zotero modern bundle");
        }

        return response.text();
    });
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

export async function loadVendoredZotero(root = window, options = {}) {
    if (root && root[VENDORED_SCOPE_KEY]) {
        return root[VENDORED_SCOPE_KEY];
    }

    const sourceText = await readBundleSource(root, options);
    const vendoredScope = assertVendoredScope(evaluateBundleIntoScope(root, sourceText));

    root[VENDORED_SCOPE_KEY] = vendoredScope;
    return vendoredScope;
}
