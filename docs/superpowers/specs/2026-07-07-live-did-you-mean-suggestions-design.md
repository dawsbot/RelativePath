# Live "did you mean" suggestions in the quick-filter picker

**Date:** 2026-07-07
**Status:** Approved

## Problem

`getClosestMatches` (subsequence + Damerau-Levenshtein) produces "did you
mean" suggestions when a query matches no file, but users almost never see
them.

`findRelativePath()` has two picker paths:

-   **Quick-filter path** (`allowQuickFilter`, the common case: file count below
    `relativePath.searchCountLimit`, default 10,000): uses `window.showQuickPick`.
    VS Code does the live filtering; when the typed value matches nothing it shows
    its native empty state and `getClosestMatches` is **never called**.
-   **Input-box path** (>10k files): the closest-match fallback runs, but only
    **after the user presses Enter** (`window.showInputBox`).

So in the path nearly everyone hits, typing a typo shows an empty list and no
suggestions ever appear.

## Goal

In the quick-filter picker, when the current query matches no file, show the
`getClosestMatches` suggestions **live** (after a short debounce) without
requiring Enter.

## Scope

-   **Changes:** the `showQuickPick()` method in `src/extension.ts` (used by the
    `allowQuickFilter` branch).
-   **New:** `src/picker-suggestions.ts` — a pure helper deciding whether the
    native filter would be empty, plus `test/picker-suggestions.test.ts`.
-   **Unchanged:** `src/closest-match.ts`, the input-box path, and the
    `searchCountLimit` threshold.

## Design

### Emptiness detection (the core decision)

VS Code's quick-pick filter matches an item when the query is a
**case-insensitive subsequence** of its label or description (with
`matchOnDescription = true`, the description is the workspace-relative path). So
the picker is empty exactly when the query is not a subsequence of any
candidate's relative path.

We must NOT reimplement filtering ourselves — native fuzzy matching and
highlighting stay on for the happy path. We only need a proxy for "is the list
empty", computed from the immutable candidate list and the current value:

```ts
// src/picker-suggestions.ts
export function isFuzzyMatch(query: string, target: string): boolean; // subsequence, case-insensitive
export function hasAnyFuzzyMatch(query: string, candidates: string[]): boolean; // .some short-circuit
```

Testing against the relative path (a superset of the basename) matches VS Code's
label+description behavior. This keeps our "empty?" verdict aligned with what the
user actually sees, so suggestions appear for genuine typos (e.g. `bztton`) but
NOT for abbreviations like `btn`, which VS Code's own fuzzy filter still resolves
to `Button.tsx`.

### Picker wiring

Migrate `showQuickPick()` from the fire-and-forget `window.showQuickPick` to a
managed `window.createQuickPick()`:

1. Build the base item list (recently-used separators + files) exactly as today;
   set `quickPick.items`, `matchOnDescription = true`, and the placeholder.
   Precompute the candidates' relative paths once for the emptiness test.
2. `onDidChangeValue(value)`: clear any pending timer; start a ~150ms debounce.
   On fire:
    - `value === ""` or `hasAnyFuzzyMatch(value, relativePaths)` → restore base
      items + placeholder (native filter shows the matches).
    - otherwise → `getClosestMatches(value, items)`; set items to a
      `did you mean` separator followed by the suggestions, each with
      `alwaysShow: true` (so VS Code's filter doesn't drop names that don't
      contain the typed text); set placeholder to
      `No files match "<value>". Showing the N closest names.`
      The decision is always recomputed from the immutable base list + current
      value, so it toggles correctly in both directions as the user keeps typing.
3. `onDidAccept`: resolve `selectedItems[0]` via `returnRelativeLink`, then
   `hide()`. Works for both real matches and suggestion items (both carry a
   `description` = relative path).
4. `onDidHide`: clear the debounce timer and `dispose()` the quick pick, so the
   timer never fires against a disposed picker.

Both `showQuickPick` callers (quick-filter path and the input-box sub-lists)
share this logic; it operates on whatever `items` were passed, so no caller
needs special-casing.

## Testing

-   Unit-test `isFuzzyMatch` / `hasAnyFuzzyMatch`: subsequence hits, case
    insensitivity, typo → no match, abbreviation → match, empty query.
-   `closest-match.ts` retains its existing coverage.
-   The picker-wiring layer is a thin adapter over pure functions and the VS Code
    API; it is exercised manually in the Extension Development Host.

## Edge cases

-   Empty value → base list, no suggestions.
-   Debounce timer cleared on every keystroke and on hide/accept.
-   Selecting a suggestion resolves a real relative path (same item shape as
    matches).
-   Large workspaces: emptiness test is a short-circuiting `.some` over <10k
    relative paths per debounced keystroke — negligible cost.
