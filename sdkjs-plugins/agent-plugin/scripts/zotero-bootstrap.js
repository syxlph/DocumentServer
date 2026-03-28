(function(root) {
    async function bootstrap() {
        var loader = root.OnlyOfficeAgentZoteroModernLoader;
        if (!loader || typeof loader.loadVendoredZotero !== "function") {
            throw new Error("Vendored Zotero loader is unavailable");
        }

        await loader.loadVendoredZotero(root);

        if (root.OnlyOfficeAgentPlugin && root.Asc && root.Asc.plugin) {
            root.OnlyOfficeAgentPlugin.bootstrap(root);
        }
    }

    bootstrap().catch(function(error) {
        var wrapper = root.document && root.document.getElementById
            ? root.document.getElementById("errorWrapper")
            : null;

        if (wrapper) {
            wrapper.hidden = false;
            wrapper.textContent = error && error.message ? error.message : String(error);
        }

        if (root.console && typeof root.console.error === "function") {
            root.console.error(error);
        }
    });
})(typeof window !== "undefined" ? window : globalThis);
