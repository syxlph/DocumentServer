const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

function read(relativePath) {
    return fs.readFileSync(path.join(pluginRoot, relativePath), "utf8");
}

test("agent plugin page boots vendored Zotero directly from the agent-plugin subtree", () => {
    const html = read("index.html");

    assert.match(
        html,
        /document\.write\('<script type="module" src="vendor\/zotero\/dist\/bundle\.modern\.js"><\/script>'\)/
    );
    assert.doesNotMatch(
        html,
        /<script src="vendor\/zotero\/dist\/bundle\.modern\.js"><\/script>/
    );
    assert.doesNotMatch(html, /sdkjs-plugins\/vendor\/zotero/);
    assert.doesNotMatch(html, /scripts\/zotero-modern-loader\.js/);
    assert.doesNotMatch(html, /scripts\/zotero-bootstrap\.js/);
});

test("agent plugin page keeps the full Zotero runtime scaffold intact", () => {
    const html = read("index.html");

    assert.match(html, /id="loginState"/);
    assert.match(html, /id="mainState"/);
    assert.match(html, /id="settingsState"/);
    assert.match(html, /id="libLoader"/);
    assert.match(html, /id="insertBibBtn"/);
    assert.match(html, /id="saveAsTextBtn"/);
    assert.match(html, /id="settingsBtn"/);
});

test("agent plugin page avoids module-only and custom bootstrap indirection", () => {
    const html = read("index.html");

    assert.match(
        html,
        /document\.write\('<script src="vendor\/zotero\/dist\/bundle\.es5\.js"><\/script>'\)/
    );
    assert.doesNotMatch(html, /zotero-module-bootstrap\.mjs/);
    assert.doesNotMatch(html, /zotero-modern-loader\.mjs/);
    assert.doesNotMatch(html, /zotero-modern-loader\.js/);
    assert.doesNotMatch(html, /zotero-bootstrap\.js/);
});

test("literal clone startup removes loader-era bootstrap files", () => {
    assert.equal(
        fs.existsSync(path.join(pluginRoot, "scripts", "zotero-modern-loader.js")),
        false
    );
    assert.equal(
        fs.existsSync(path.join(pluginRoot, "scripts", "zotero-bootstrap.js")),
        false
    );
    assert.equal(
        fs.existsSync(path.join(pluginRoot, "scripts", "zotero-module-bootstrap.mjs")),
        false
    );
    assert.equal(
        fs.existsSync(path.join(pluginRoot, "scripts", "zotero-modern-loader.mjs")),
        false
    );
});
