import * as assert from "node:assert/strict";
import { test } from "node:test";
import { replaceSelections } from "../src/replace-selections";

// A minimal fake editor that records how many times edit() is invoked and
// every replace() applied to the builder. VS Code only allows one active
// edit at a time, so the multi-cursor bug (#70) reproduces as "more than one
// edit() call" here.
function makeFakeEditor(selectionCount: number) {
    const replaced: Array<{ selection: unknown; value: string }> = [];
    let editCalls = 0;
    const selections = Array.from({ length: selectionCount }, (_, i) => ({
        id: i,
    }));

    const editor = {
        selections,
        edit(callback: (builder: any) => void): Promise<boolean> {
            editCalls++;
            const builder = {
                replace(selection: unknown, value: string) {
                    replaced.push({ selection, value });
                },
            };
            callback(builder);
            return Promise.resolve(true);
        },
    };

    return {
        editor,
        replaced,
        get editCalls() {
            return editCalls;
        },
    };
}

test("replaces every selection in a single atomic edit", async () => {
    const fake = makeFakeEditor(3);
    const { editor, replaced } = fake;

    await replaceSelections(editor as any, "./foo/bar.png");

    // The heart of #70: all cursors must be written in ONE edit() call.
    assert.strictEqual(fake.editCalls, 1);
    assert.strictEqual(replaced.length, 3);
    assert.deepStrictEqual(
        replaced.map((r) => r.value),
        ["./foo/bar.png", "./foo/bar.png", "./foo/bar.png"]
    );
    assert.deepStrictEqual(
        replaced.map((r) => (r.selection as { id: number }).id),
        [0, 1, 2]
    );
});

test("still writes the single cursor case", async () => {
    const fake = makeFakeEditor(1);
    const { editor, replaced } = fake;

    await replaceSelections(editor as any, "../x.ts");

    assert.strictEqual(fake.editCalls, 1);
    assert.deepStrictEqual(replaced, [
        { selection: { id: 0 }, value: "../x.ts" },
    ]);
});
