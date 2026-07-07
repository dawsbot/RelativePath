import * as assert from "node:assert/strict";
import { test } from "node:test";
import { hasAnyFuzzyMatch, isFuzzyMatch } from "../src/picker-suggestions";

test("isFuzzyMatch treats the query as an ordered subsequence", () => {
    // Contiguous substring.
    assert.equal(isFuzzyMatch("but", "Button.tsx"), true);
    // Non-contiguous but in order (VS Code's fuzzy filter matches this).
    assert.equal(isFuzzyMatch("btn", "Button.tsx"), true);
    // Characters out of order do not match.
    assert.equal(isFuzzyMatch("ntb", "Button.tsx"), false);
});

test("isFuzzyMatch is case-insensitive", () => {
    assert.equal(isFuzzyMatch("BUTTON", "button.tsx"), true);
    assert.equal(isFuzzyMatch("button", "BUTTON.TSX"), true);
});

test("isFuzzyMatch returns false for a substitution typo", () => {
    // 'z' is nowhere in the target, so no subsequence exists.
    assert.equal(isFuzzyMatch("bztton", "Button.tsx"), false);
});

test("isFuzzyMatch treats the empty query as a match", () => {
    assert.equal(isFuzzyMatch("", "anything.ts"), true);
});

test("hasAnyFuzzyMatch is true when at least one candidate matches", () => {
    const candidates = ["/src/Button.tsx", "/src/index.ts"];
    assert.equal(hasAnyFuzzyMatch("btn", candidates), true);
});

test("hasAnyFuzzyMatch is false when a typo matches nothing", () => {
    const candidates = ["/src/Button.tsx", "/src/index.ts"];
    assert.equal(hasAnyFuzzyMatch("bztton", candidates), false);
});

test("hasAnyFuzzyMatch matches against the full relative path, not only the base name", () => {
    const candidates = ["/src/components/Button.tsx"];
    // 'src' lives in the directory portion of the path.
    assert.equal(hasAnyFuzzyMatch("src", candidates), true);
});

test("hasAnyFuzzyMatch of an empty query is always true", () => {
    assert.equal(hasAnyFuzzyMatch("", ["/a.ts"]), true);
    assert.equal(hasAnyFuzzyMatch("", []), false);
});
