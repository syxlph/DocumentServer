const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

test("agent-plugin page preserves the vendored Zotero loader container required at bundle evaluation time", () => {
    const html = fs.readFileSync(path.join(pluginRoot, "index.html"), "utf8");

    assert.match(html, /id="libLoader"/);
});
