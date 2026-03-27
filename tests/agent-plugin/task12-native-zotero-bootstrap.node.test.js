const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

test("agent plugin page loads vendored Zotero in the same top-level page before the adapter and bridge", async () => {
    const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");

    assert.match(html, /vendor\/zotero\/dist\/styles\.css/);
    assert.match(html, /vendor\/zotero\/dist\/citeproc_commonjs\.js/);
    assert.match(html, /vendor\/zotero\/dist\/bundle\.es5\.js/);
    assert.match(html, /scripts\/zotero-module-bootstrap\.mjs/);
    assert.ok(
        html.indexOf("scripts/zotero-module-bootstrap.mjs") > html.indexOf("vendor/zotero/dist/citeproc_commonjs.js"),
        "expected the modern bootstrap module to load after shared Zotero prerequisites"
    );
    assert.doesNotMatch(html, /<iframe/i);
});

test("agent plugin page avoids module-only bootstrap files and loads the classic vendored bridge path", async () => {
    const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");
    const bootstrapIndex = html.indexOf("scripts/zotero-bootstrap.js");

    assert.match(html, /vendor\/zotero\/dist\/styles\.css/);
    assert.match(html, /vendor\/zotero\/dist\/citeproc_commonjs\.js/);
    assert.match(html, /scripts\/zotero-modern-loader\.js/);
    assert.match(html, /scripts\/zotero-native-adapter\.js/);
    assert.match(html, /scripts\/agent\.js/);
    assert.match(html, /scripts\/zotero-bootstrap\.js/);
    assert.doesNotMatch(html, /type="module"/);
    assert.doesNotMatch(html, /zotero-module-bootstrap\.mjs/);
    assert.notEqual(bootstrapIndex, -1, "expected classic bootstrap script to be present");

    for (const scriptPath of [
        "scripts/zotero-modern-loader.js",
        "scripts/zotero-native-adapter.js",
        "scripts/agent.js"
    ]) {
        const scriptIndex = html.indexOf(scriptPath);

        assert.notEqual(scriptIndex, -1, `expected ${scriptPath} to be present`);
        assert.ok(scriptIndex < bootstrapIndex, `expected ${scriptPath} to load before bootstrap runs`);
    }
});

test("classic vendored loader exposes module-scoped Zotero symbols on a stable global", async () => {
    const {loadVendoredZotero} = require(path.join(pluginRoot, "scripts", "zotero-modern-loader.js"));
    const root = {};
    const sourceText = [
        "var ZoteroSdk = function ZoteroSdk() {};",
        "var ZoteroApiChecker = { checkStatus: function() { return Promise.resolve({ desktop: true, hasPermission: true }); } };",
        "var LocalesManager = function LocalesManager() {};",
        "var CslStylesManager = function CslStylesManager() {};",
        "var CitationService = function CitationService() {};"
    ].join("\n");

    const exports = await loadVendoredZotero(root, {sourceText});
    const vendoredZotero = root.OnlyOfficeAgentVendoredZotero;

    assert.equal(vendoredZotero, exports);
    assert.equal(typeof vendoredZotero.ZoteroApiChecker, "object");
    assert.equal(typeof vendoredZotero.ZoteroSdk, "function");
    assert.equal(typeof vendoredZotero.LocalesManager, "function");
    assert.equal(typeof vendoredZotero.CslStylesManager, "function");
    assert.equal(typeof vendoredZotero.CitationService, "function");
});

test("modern bootstrap module loads the vendored loader before the adapter and bridge", async () => {
    const bootstrapModule = fs.readFileSync(path.join(pluginRoot, "scripts", "zotero-module-bootstrap.mjs"), "utf8");

    assert.match(bootstrapModule, /import \{ loadVendoredZotero \} from "\.\/zotero-modern-loader\.mjs";/);
    assert.match(bootstrapModule, /import "\.\/zotero-native-adapter\.js";/);
    assert.match(bootstrapModule, /import "\.\/agent\.js";/);
    assert.ok(
        bootstrapModule.indexOf("./zotero-modern-loader.mjs") < bootstrapModule.indexOf('./zotero-native-adapter.js'),
        "expected vendored Zotero loader to import before the adapter on the modern path"
    );
    assert.ok(
        bootstrapModule.indexOf('./zotero-native-adapter.js') < bootstrapModule.indexOf('./agent.js'),
        "expected adapter import before agent bridge import on the modern path"
    );
    assert.match(bootstrapModule, /await loadVendoredZotero\(window\);/);
});

test("modern vendored loader exposes module-scoped Zotero symbols on a stable global for the adapter", async () => {
    const loaderPath = path.join(pluginRoot, "scripts", "zotero-modern-loader.mjs");
    const {loadVendoredZotero} = await import(pathToFileURL(loaderPath).href);
    const root = {};
    const sourceText = [
        "var ZoteroSdk = function ZoteroSdk() {};",
        "var ZoteroApiChecker = { checkStatus: function() { return Promise.resolve({ desktop: true, hasPermission: true }); } };",
        "var LocalesManager = function LocalesManager() {};",
        "var CslStylesManager = function CslStylesManager() {};",
        "var CitationService = function CitationService() {};",
        "window.__bundleExecuted = (window.__bundleExecuted || 0) + 1;"
    ].join("\n");

    const exports = await loadVendoredZotero(root, {
        sourceText
    });

    assert.equal(root.__bundleExecuted, 1);
    assert.equal(root.OnlyOfficeAgentVendoredZotero, exports);
    assert.equal(typeof root.OnlyOfficeAgentVendoredZotero.ZoteroSdk, "function");
    assert.equal(typeof root.OnlyOfficeAgentVendoredZotero.ZoteroApiChecker.checkStatus, "function");
});

test("native bootstrap composes vendored plugin handlers with the agent bridge", async () => {
    const {capturePluginHandlers, composePluginHandlers} = require(path.join(pluginRoot, "scripts", "zotero-native-adapter.js"));
    const calls = [];
    const plugin = {
        init() {
            calls.push("vendor-init");
        },
        button(id) {
            calls.push(["vendor-button", id]);
        },
        onThemeChanged(theme) {
            calls.push(["vendor-theme", theme.name]);
        }
    };
    const preserved = capturePluginHandlers(plugin);

    composePluginHandlers(plugin, preserved, {
        init() {
            calls.push("bridge-init");
        }
    });

    plugin.init();
    plugin.button(7);
    plugin.onThemeChanged({name: "theme-dark"});

    assert.deepEqual(calls, [
        "vendor-init",
        "bridge-init",
        ["vendor-button", 7],
        ["vendor-theme", "theme-dark"]
    ]);
});
