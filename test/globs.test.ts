import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
    buildExcludeGlob,
    collectExcludeGlobs,
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

test("collects nothing from an undefined or empty exclude map", () => {
    assert.deepEqual(collectExcludeGlobs(undefined), []);
    assert.deepEqual(collectExcludeGlobs({}), []);
});

test("collects each enabled glob with a folder-descendant form", () => {
    assert.deepEqual(
        collectExcludeGlobs({ "**/.git": true, "**/.DS_Store": true }),
        ["**/.git", "**/.git/**", "**/.DS_Store", "**/.DS_Store/**"]
    );
});

test("honors only globs explicitly enabled with true", () => {
    assert.deepEqual(
        collectExcludeGlobs({
            "**/.git": true,
            "**/kept": false,
            "**/when-clause": { when: "$(basename).ts" },
        }),
        ["**/.git", "**/.git/**"]
    );
});

test("does not append a descendant form to globs already ending in /**", () => {
    assert.deepEqual(collectExcludeGlobs({ "**/node_modules/**": true }), [
        "**/node_modules/**",
    ]);
});

test("keeps file-name patterns and adds a harmless descendant form", () => {
    assert.deepEqual(collectExcludeGlobs({ "**/*.pyc": true }), [
        "**/*.pyc",
        "**/*.pyc/**",
    ]);
});
