import * as assert from "node:assert/strict";
import { test } from "node:test";
import { globToRegExp, shouldAddToCache } from "../src/glob-match";

const DEFAULT_IGNORE = [
    "**/.git/**",
    "**/node_modules/**",
    "**/*.dll",
    "**/obj/**",
];

test("** crosses directories, including zero of them", () => {
    const re = globToRegExp("**/node_modules/**");
    assert.equal(re.test("node_modules/react/index.js"), true);
    assert.equal(re.test("packages/app/node_modules/lodash/a.js"), true);
    assert.equal(re.test("src/app.ts"), false);
    assert.equal(re.test("src/my-node_modules-notes.md"), false);
});

test("* and ? stay within a single path segment", () => {
    assert.equal(globToRegExp("**/*.dll").test("bin/app.dll"), true);
    assert.equal(globToRegExp("**/*.dll").test("app.dll"), true);
    assert.equal(globToRegExp("**/*.dll").test("app.dll.txt"), false);
    assert.equal(globToRegExp("*.ts").test("src/a.ts"), false);
    assert.equal(globToRegExp("a?.ts").test("ab.ts"), true);
    assert.equal(globToRegExp("a?.ts").test("a/b.ts"), false);
});

test("supports single-level brace alternation", () => {
    const re = globToRegExp("**/*.{js,ts}");
    assert.equal(re.test("src/a.js"), true);
    assert.equal(re.test("src/b.ts"), true);
    assert.equal(re.test("src/c.css"), false);
});

test("escapes regex metacharacters in literals", () => {
    assert.equal(globToRegExp("a+b/c.ts").test("a+b/c.ts"), true);
    assert.equal(globToRegExp("a+b/c.ts").test("aab/cxts"), false);
});

test("prefix globs like src/**/*.ts match at any depth under the prefix", () => {
    const re = globToRegExp("src/**/*.ts");
    assert.equal(re.test("src/a.ts"), true);
    assert.equal(re.test("src/deep/nested/a.ts"), true);
    assert.equal(re.test("test/a.ts"), false);
});

test("shouldAddToCache rejects ignored paths", () => {
    assert.equal(
        shouldAddToCache(
            "node_modules/react/index.js",
            "**/*.*",
            DEFAULT_IGNORE
        ),
        false
    );
    assert.equal(
        shouldAddToCache("bin/app.dll", "**/*.*", DEFAULT_IGNORE),
        false
    );
});

test("shouldAddToCache rejects paths outside the include glob", () => {
    assert.equal(shouldAddToCache("Makefile", "**/*.*", DEFAULT_IGNORE), false);
    assert.equal(
        shouldAddToCache("test/a.ts", "src/**/*.ts", DEFAULT_IGNORE),
        false
    );
});

test("shouldAddToCache accepts a normal source file", () => {
    assert.equal(
        shouldAddToCache("src/app.ts", "**/*.*", DEFAULT_IGNORE),
        true
    );
    assert.equal(shouldAddToCache("src/app.ts", "**/*.*", []), true);
    assert.equal(shouldAddToCache("src/app.ts", "**/*.*", undefined), true);
});
