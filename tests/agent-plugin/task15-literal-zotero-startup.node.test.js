const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");

function read(relativePath) {
    return fs.readFileSync(path.join(pluginRoot, relativePath), "utf8");
}

test("literal startup keeps the vendored Zotero bundle inside agent-plugin", () => {
    const html = read("index.html");

    assert.match(
        html,
        /document\.write\('<script type="module" src="vendor\/zotero\/dist\/bundle\.modern\.js"><\/script>'\)/
    );
    assert.match(
        html,
        /document\.write\('<script src="vendor\/zotero\/dist\/bundle\.es5\.js"><\/script>'\)/
    );
    assert.doesNotMatch(html, /sdkjs-plugins\/vendor\/zotero/);
});

test("agent plugin startup follows the vendored Zotero page instead of a hand-rolled loader path", () => {
    const html = read("index.html");

    assert.doesNotMatch(
        html,
        /<script src="vendor\/zotero\/dist\/bundle\.modern\.js"><\/script>/
    );
    assert.doesNotMatch(html, /zotero-modern-loader/);
    assert.doesNotMatch(html, /zotero-bootstrap/);
});
