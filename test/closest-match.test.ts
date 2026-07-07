import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
    damerauLevenshtein,
    getClosestMatches,
    MAX_FALLBACK_CANDIDATES,
    subsequenceScore,
} from "../src/closest-match";

test("damerauLevenshtein counts a transposition as a single edit", () => {
    assert.equal(damerauLevenshtein("button", "button"), 0);
    assert.equal(damerauLevenshtein("buttno", "button"), 1);
    assert.equal(damerauLevenshtein("", "index.ts"), 8);
    assert.equal(damerauLevenshtein("kitten", "sitting"), 3);
});

test("subsequenceScore returns null when the query is not a subsequence", () => {
    assert.equal(subsequenceScore("xyz", "Button.tsx"), null);
    assert.notEqual(subsequenceScore("btn", "Button.tsx"), null);
});

test("subsequenceScore rewards word-boundary and camelCase matches", () => {
    // "uc" hits the start and the camelCase hump of UserController...
    const camel = subsequenceScore("uc", "UserController.ts") as number;
    // ...and only scattered mid-word letters in "documents".
    const scattered = subsequenceScore("uc", "documents.ts") as number;
    assert.ok(camel > scattered);
});

test("getClosestMatches surfaces abbreviations via subsequence match", () => {
    const files = [
        "/repo/src/index.ts",
        "/repo/src/components/Button.tsx",
        "/repo/src/api.ts",
    ];
    assert.deepEqual(getClosestMatches("btn", files, 1), [
        "/repo/src/components/Button.tsx",
    ]);
});

test("getClosestMatches matches camelCase initials", () => {
    const files = ["/repo/src/utils.ts", "/repo/src/UserController.ts"];
    assert.deepEqual(getClosestMatches("uc", files, 1), [
        "/repo/src/UserController.ts",
    ]);
});

test("getClosestMatches falls back to edit distance for substitution typos", () => {
    const files = [
        "/repo/src/index.ts",
        "/repo/src/Button.tsx",
        "/repo/src/api.ts",
    ];
    // "bztton" is not a subsequence of any name, so the typo path ranks it.
    assert.equal(
        getClosestMatches("bztton", files, 1)[0],
        "/repo/src/Button.tsx"
    );
});

test("getClosestMatches compares against the base name, not the full path", () => {
    const files = [
        "/very/deeply/nested/directory/structure/here/index.ts",
        "/index.ts",
    ];
    const matches = getClosestMatches("index.ts", files, 2);
    assert.equal(matches.length, 2);
    // Directory depth must not change ranking when base names are identical.
    assert.equal(
        matches[0],
        "/very/deeply/nested/directory/structure/here/index.ts"
    );
});

test("getClosestMatches ignores candidates beyond the fallback cap", () => {
    // Fillers that share no useful subsequence/edit proximity with the query.
    const files = Array.from(
        { length: MAX_FALLBACK_CANDIDATES + 1 },
        (_, i) => `/repo/zzzzz${i}.bin`
    );
    // Place the only strong match one slot past the cap; it must be excluded.
    files[MAX_FALLBACK_CANDIDATES] = "/repo/target.ts";

    assert.ok(
        !getClosestMatches("target.ts", files).includes("/repo/target.ts")
    );

    // The same match within the cap is returned.
    files[MAX_FALLBACK_CANDIDATES - 1] = "/repo/target.ts";
    files[MAX_FALLBACK_CANDIDATES] = "/repo/zzzzzlast.bin";
    assert.ok(
        getClosestMatches("target.ts", files).includes("/repo/target.ts")
    );
});
