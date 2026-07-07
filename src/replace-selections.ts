// Structural interfaces so this module stays free of the `vscode` runtime
// dependency and can be unit-tested under plain `node --test`. The real
// `vscode.TextEditor` / `TextEditorEdit` are structurally compatible.
interface EditBuilder {
    replace(location: unknown, value: string): void;
}

interface EditableEditor {
    readonly selections: ReadonlyArray<unknown>;
    edit(callback: (editBuilder: EditBuilder) => void): Thenable<boolean>;
}

// Replace every active selection with `text` in a SINGLE atomic edit.
//
// VS Code allows only one active edit at a time. Firing a separate
// editor.edit() per selection (the previous approach) meant every call after
// the first ran against a busy/stale document and was dropped, so multi-cursor
// insertions only updated the first cursor (issue #70). Applying all
// replacements on one editBuilder keeps every cursor in sync.
export function replaceSelections(
    editor: EditableEditor,
    text: string
): Thenable<boolean> {
    return editor.edit((editBuilder) => {
        editor.selections.forEach((selection) => {
            editBuilder.replace(selection, text);
        });
    });
}
