const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

test("agent-plugin page verifies the vendored Zotero module bootstrap contract", () => {
    const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");

    assert.match(
        html,
        /document\.write\(\s*'<script type="module" src="vendor\/zotero\/dist\/bundle\.modern\.js"><\\\/script>'\s*\)/s
    );
});

test("agent-plugin page keeps native Zotero document holders required for inline citation insertion", () => {
    const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");

    assert.match(
        html,
        /document\.write\(\s*'<script src="vendor\/zotero\/dist\/bundle\.es5\.js"><\\\/script>'\s*\)/s
    );
    assert.match(html, /id="docsHolder"/);
    assert.match(html, /id="selectedHolder"/);
    assert.match(html, /id="styleSelectList"/);
    assert.match(html, /id="styleLangList"/);
});

test("agent-plugin page no longer depends on a custom vendored bootstrap layer", () => {
    const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");

    assert.doesNotMatch(
        html,
        /<script\b[^>]*\bsrc="vendor\/zotero\/dist\/bundle\.modern\.js"[^>]*><\/script>/
    );
    assert.doesNotMatch(html, /scripts\/zotero-modern-loader\.js/);
    assert.doesNotMatch(html, /scripts\/zotero-bootstrap\.js/);
});
