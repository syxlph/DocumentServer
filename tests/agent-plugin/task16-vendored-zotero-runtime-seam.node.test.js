const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const vendorAppIndex = path.join(
    __dirname,
    "..",
    "..",
    "sdkjs-plugins",
    "agent-plugin",
    "vendor",
    "zotero",
    "src",
    "app",
    "index.js"
);

function readFile() {
    return fs.readFileSync(vendorAppIndex, "utf8");
}

test("vendored Zotero app exposes an explicit runtime seam", () => {
    const source = readFile();

    assert.match(source, /OnlyOfficeAgentZoteroRuntime/);
    assert.match(source, /OnlyOfficeAgentPlugin\.bootstrap/);
    assert.match(source, /insertCitation/);
    assert.match(source, /getAddinZoteroFields/);
});
