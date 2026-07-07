import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
    buildExcludeGlob,
    collectBuiltInExcludes,
    normalizeIncludeGlob,
} from "../src/globs";

test("normalizes leading slash from include glob for RelativePattern", () => {
    assert.equal(normalizeIncludeGlob("/**/*.*"), "**/*.*");
    assert.equal(normalizeIncludeGlob("src/**/*.ts"), "src/**/*.ts");
});

test("uses null exclude so VS Code applies no extra defaults when ignore is empty", () => {
    assert.equal(buildExcludeGlob(undefined), null);
    assert.equal(buildExcludeGlob([]), null);
});

test("combines ignore globs without changing comma or brace literals", () => {
    assert.equal(
        buildExcludeGlob(["**/node_modules/**", "**/fixtures/{a,b}/**"]),
        "{**/node_modules/**,**/fixtures/\\{a\\,b\\}/**}"
    );
});

test("emits a single ignore glob bare so its own {a,b} groups keep working", () => {
    assert.equal(
        buildExcludeGlob(["**/fixtures/{a,b}/**"]),
        "**/fixtures/{a,b}/**"
    );
});

test("dedupes repeated ignore globs", () => {
    assert.equal(
        buildExcludeGlob(["**/node_modules/**", "**/node_modules/**"]),
        "**/node_modules/**"
    );
});

test("collects no built-in excludes when the mode is none or unset", () => {
    const files = { "**/.git": true };
    const search = { "**/node_modules": true };
    assert.deepEqual(collectBuiltInExcludes("none", files, search), []);
    assert.deepEqual(collectBuiltInExcludes(undefined, files, search), []);
});

test("collects only files.exclude globs in files mode", () => {
    assert.deepEqual(
        collectBuiltInExcludes(
            "files",
            { "**/.git": true, "**/.DS_Store": true },
            { "**/node_modules": true }
        ),
        ["**/.git", "**/.git/**", "**/.DS_Store", "**/.DS_Store/**"]
    );
});

test("collects only search.exclude globs in search mode", () => {
    assert.deepEqual(
        collectBuiltInExcludes(
            "search",
            { "**/.git": true },
            { "**/dist": true }
        ),
        ["**/dist", "**/dist/**"]
    );
});

test("collects both sources in both mode", () => {
    assert.deepEqual(
        collectBuiltInExcludes(
            "both",
            { "**/.git": true },
            { "**/dist": true }
        ),
        ["**/.git", "**/.git/**", "**/dist", "**/dist/**"]
    );
});

test("honors only globs explicitly enabled with true", () => {
    assert.deepEqual(
        collectBuiltInExcludes(
            "files",
            {
                "**/.git": true,
                "**/kept": false,
                "**/when-clause": { when: "$(basename).ts" },
            },
            undefined
        ),
        ["**/.git", "**/.git/**"]
    );
});

test("does not append a descendant form to globs already ending in /**", () => {
    assert.deepEqual(
        collectBuiltInExcludes(
            "files",
            { "**/node_modules/**": true },
            undefined
        ),
        ["**/node_modules/**"]
    );
});

test("keeps file-name patterns and adds a harmless descendant form", () => {
    assert.deepEqual(
        collectBuiltInExcludes("files", { "**/*.pyc": true }, undefined),
        ["**/*.pyc", "**/*.pyc/**"]
    );
});
