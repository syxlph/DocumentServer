const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const pluginRoot = path.join(__dirname, "..", "..", "sdkjs-plugins", "agent-plugin");
const vendorRoot = path.join(pluginRoot, "vendor", "zotero");

test("vendored Zotero README records the pinned upstream commit and runtime parity note", async () => {
    const readme = fs.readFileSync(path.join(vendorRoot, "README.md"), "utf8");

    assert.match(readme, /ONLYOFFICE\/onlyoffice\.github\.io/);
    assert.match(readme, /b39b42b273f0db5c8593547478b4e37b948211bf/);
    assert.match(readme, /dist\/bundle\.modern\.js/);
    assert.match(readme, /dist\/bundle\.es5\.js/);
    assert.match(readme, /dist\/citeproc_commonjs\.js/);
    assert.match(readme, /dist\/styles\.css/);
    assert.match(readme, /runtime parity/i);
});

test("vendored Zotero assets required by the hidden native bootstrap are present", async () => {
    const requiredFiles = [
        "index.html",
        "info-window.html",
        "dist/bundle.modern.js",
        "dist/bundle.es5.js",
        "dist/citeproc_commonjs.js",
        "dist/styles.css",
        "resources/csl/styles.json"
    ];

    requiredFiles.forEach((relativePath) => {
        const absolutePath = path.join(vendorRoot, relativePath);
        assert.equal(fs.existsSync(absolutePath), true, `expected ${relativePath} to exist`);
        assert.ok(fs.statSync(absolutePath).size > 0, `expected ${relativePath} to be non-empty`);
    });
});
