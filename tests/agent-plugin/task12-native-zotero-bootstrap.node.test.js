const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

test("agent plugin page loads vendored Zotero in the same top-level page before the adapter and bridge", async () => {
    const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");

    assert.match(html, /vendor\/zotero\/dist\/styles\.css/);
    assert.match(html, /vendor\/zotero\/dist\/citeproc_commonjs\.js/);
    assert.match(html, /scripts\/zotero-modern-loader\.js/);
    assert.match(html, /scripts\/zotero-native-adapter\.js/);
    assert.match(html, /scripts\/agent\.js/);
    assert.match(html, /scripts\/zotero-bootstrap\.js/);
    assert.ok(
        html.indexOf("scripts/zotero-modern-loader.js") > html.indexOf("vendor/zotero/dist/citeproc_commonjs.js"),
        "expected the classic vendored loader to load after shared Zotero prerequisites"
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

    const exports = await loadVendoredZotero(root, {
        fetch(url) {
            throw new Error(`unexpected fetch for ${url}`);
        },
        sourceText
    });
    const vendoredZotero = root.OnlyOfficeAgentVendoredZotero;

    assert.equal(vendoredZotero, exports);
    assert.equal(typeof vendoredZotero.ZoteroApiChecker, "object");
    assert.equal(typeof vendoredZotero.ZoteroSdk, "function");
    assert.equal(typeof vendoredZotero.LocalesManager, "function");
    assert.equal(typeof vendoredZotero.CslStylesManager, "function");
    assert.equal(typeof vendoredZotero.CitationService, "function");
});

test("classic bootstrap script loads vendored Zotero before bootstrapping the agent bridge", async () => {
    const bootstrapScript = fs.readFileSync(path.join(pluginRoot, "scripts", "zotero-bootstrap.js"), "utf8");

    assert.match(bootstrapScript, /OnlyOfficeAgentZoteroModernLoader/);
    assert.match(bootstrapScript, /await loader\.loadVendoredZotero\(root\);/);
    assert.match(bootstrapScript, /OnlyOfficeAgentPlugin\.bootstrap\(root\);/);
    assert.match(bootstrapScript, /bootstrap\(\)\.catch/);
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
