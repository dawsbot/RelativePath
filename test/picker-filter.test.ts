import * as assert from "node:assert/strict";
import { test } from "node:test";
import { filterPaths } from "../src/picker-filter";

const WORKSPACE = "/home/me/project";
const FILES = [
    "/home/me/project/notes.md",
    "/home/me/project/generated/schema.ts",
    "/home/me/project/generated/types.ts",
    "/home/me/project/src/index.ts",
];

test("keeps files whose relative path contains the query", () => {
    assert.deepEqual(filterPaths("types", FILES, WORKSPACE), [
        "/home/me/project/generated/types.ts",
    ]);
});

test("matches on any part of the relative path, not just the base name", () => {
    assert.deepEqual(filterPaths("generated", FILES, WORKSPACE), [
        "/home/me/project/generated/schema.ts",
        "/home/me/project/generated/types.ts",
    ]);
});

test("is case-insensitive", () => {
    assert.deepEqual(filterPaths("TYPES.TS", FILES, WORKSPACE), [
        "/home/me/project/generated/types.ts",
    ]);
});

test("returns nothing for a non-substring query like an abbreviation", () => {
    // "tp" is a subsequence of "types.ts" but not a substring, so it falls
    // through to the getClosestMatches suggestion path (issue #84).
    assert.deepEqual(filterPaths("tp", FILES, WORKSPACE), []);
});

test("does not match against the workspace prefix", () => {
    // "project" only appears in the stripped-off workspace path.
    assert.deepEqual(filterPaths("project", FILES, WORKSPACE), []);
});

test("an empty query keeps every file", () => {
    assert.deepEqual(filterPaths("", FILES, WORKSPACE), FILES);
});
