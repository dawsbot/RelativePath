import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
    DEFAULT_MAX_FILES_CACHED,
    isTruncated,
    resolveMaxResults,
} from "../src/search-limit";

test("falls back to the default cap when the setting is missing or invalid", () => {
    assert.equal(resolveMaxResults(undefined), DEFAULT_MAX_FILES_CACHED);
    assert.equal(resolveMaxResults(null), DEFAULT_MAX_FILES_CACHED);
    assert.equal(resolveMaxResults("50000"), DEFAULT_MAX_FILES_CACHED);
    assert.equal(resolveMaxResults(NaN), DEFAULT_MAX_FILES_CACHED);
    assert.equal(resolveMaxResults(Infinity), DEFAULT_MAX_FILES_CACHED);
});

test("treats zero or negative as an explicit opt-out (no limit)", () => {
    assert.equal(resolveMaxResults(0), undefined);
    assert.equal(resolveMaxResults(-1), undefined);
});

test("passes positive values through, flooring fractions", () => {
    assert.equal(resolveMaxResults(1), 1);
    assert.equal(resolveMaxResults(100_000), 100_000);
    assert.equal(resolveMaxResults(1234.9), 1234);
});

test("reports truncation only when the cap was reached", () => {
    assert.equal(isTruncated(100_000, 100_000), true);
    assert.equal(isTruncated(99_999, 100_000), false);
    assert.equal(isTruncated(0, 100_000), false);
    // No cap -> never truncated, regardless of count.
    assert.equal(isTruncated(10_000_000, undefined), false);
});
