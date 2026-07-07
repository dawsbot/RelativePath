import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
    DEFAULT_RECENT_PATHS_LIMIT,
    partitionByRecency,
    recordRecentPath,
} from "../src/recent-paths";

test("records a new pick at the front of the list", () => {
    assert.deepEqual(recordRecentPath([], "/ws/a.ts"), ["/ws/a.ts"]);
    assert.deepEqual(recordRecentPath(["/ws/a.ts"], "/ws/b.ts"), [
        "/ws/b.ts",
        "/ws/a.ts",
    ]);
});

test("re-picking a path moves it to the front instead of duplicating it", () => {
    assert.deepEqual(recordRecentPath(["/ws/b.ts", "/ws/a.ts"], "/ws/a.ts"), [
        "/ws/a.ts",
        "/ws/b.ts",
    ]);
});

test("caps the list at the limit, dropping the oldest entries", () => {
    const recents = ["/ws/c.ts", "/ws/b.ts", "/ws/a.ts"];
    assert.deepEqual(recordRecentPath(recents, "/ws/d.ts", 3), [
        "/ws/d.ts",
        "/ws/c.ts",
        "/ws/b.ts",
    ]);
    assert.equal(DEFAULT_RECENT_PATHS_LIMIT, 100);
});

test("ignores malformed stored state (not a string array)", () => {
    assert.deepEqual(recordRecentPath(undefined, "/ws/a.ts"), ["/ws/a.ts"]);
    assert.deepEqual(recordRecentPath("junk" as any, "/ws/a.ts"), ["/ws/a.ts"]);
    assert.deepEqual(recordRecentPath([1, 2] as any, "/ws/a.ts"), ["/ws/a.ts"]);
});

test("partitions file names into recents (recency order) and the rest (original order)", () => {
    const fileNames = ["/ws/a.ts", "/ws/b.ts", "/ws/c.ts", "/ws/d.ts"];
    const recents = ["/ws/c.ts", "/ws/a.ts"];
    assert.deepEqual(partitionByRecency(fileNames, recents), {
        recent: ["/ws/c.ts", "/ws/a.ts"],
        rest: ["/ws/b.ts", "/ws/d.ts"],
    });
});

test("drops recents that no longer exist in the workspace", () => {
    const fileNames = ["/ws/a.ts"];
    const recents = ["/ws/deleted.ts", "/ws/a.ts"];
    assert.deepEqual(partitionByRecency(fileNames, recents), {
        recent: ["/ws/a.ts"],
        rest: [],
    });
});

test("with no recents everything lands in rest", () => {
    const fileNames = ["/ws/a.ts", "/ws/b.ts"];
    assert.deepEqual(partitionByRecency(fileNames, []), {
        recent: [],
        rest: fileNames,
    });
    assert.deepEqual(partitionByRecency(fileNames, undefined), {
        recent: [],
        rest: fileNames,
    });
});

test("recents that only match a subset list are filtered against that subset", () => {
    // After the input-box search narrows the list, only matches remain.
    const matches = ["/ws/src/util.ts"];
    const recents = ["/ws/other.ts", "/ws/src/util.ts"];
    assert.deepEqual(partitionByRecency(matches, recents), {
        recent: ["/ws/src/util.ts"],
        rest: [],
    });
});
