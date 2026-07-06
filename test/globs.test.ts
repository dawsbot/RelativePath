import * as assert from "node:assert/strict";
import { test } from "node:test";

import { buildExcludeGlob, normalizeIncludeGlob } from "../src/globs";

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
