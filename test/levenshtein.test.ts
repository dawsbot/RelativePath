import * as assert from "node:assert/strict";
import { test } from "node:test";
import { getClosestMatches, levenshteinDistance } from "../src/levenshtein";

test("returns 0 for identical strings and full length against empty", () => {
    assert.equal(levenshteinDistance("index.ts", "index.ts"), 0);
    assert.equal(levenshteinDistance("", "index.ts"), 8);
    assert.equal(levenshteinDistance("index.ts", ""), 8);
});

test("counts single-edit differences", () => {
    assert.equal(levenshteinDistance("kitten", "sitting"), 3);
    assert.equal(levenshteinDistance("button.tsx", "buttons.tsx"), 1);
});

test("suggests the closest file names, closest first, when no exact match", () => {
    const files = [
        "/repo/src/components/Button.tsx",
        "/repo/src/components/Buttons.tsx",
        "/repo/src/utils/format.ts",
        "/repo/src/index.ts",
    ];

    assert.deepEqual(getClosestMatches("Buton.tsx", files, 2), [
        "/repo/src/components/Button.tsx",
        "/repo/src/components/Buttons.tsx",
    ]);
});

test("compares against the base name, not the full path", () => {
    const files = [
        "/very/deeply/nested/directory/structure/here/index.ts",
        "/index.ts",
    ];

    // Both file names are identical, so directory depth must not change ranking.
    const matches = getClosestMatches("index.ts", files, 2);
    assert.equal(matches.length, 2);
    assert.equal(
        matches[0],
        "/very/deeply/nested/directory/structure/here/index.ts"
    );
});

test("caps results at the requested limit and preserves order on ties", () => {
    const files = ["a.ts", "b.ts", "c.ts", "d.ts"];
    // Every file name is equidistant from the query, so original order wins.
    assert.deepEqual(getClosestMatches("z.ts", files, 3), [
        "a.ts",
        "b.ts",
        "c.ts",
    ]);
});
