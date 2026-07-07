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
-   **New:** `src/picker-filter.ts` — the pure substring filter, plus
    `test/picker-filter.test.ts`.
-   **Unchanged:** `src/closest-match.ts`, the input-box path, and the
    `searchCountLimit` threshold.

## Design

### Own the filtering (the core decision)

The picker must offer suggestions exactly when the file list comes up empty. Two
attempts to derive that from VS Code's built-in filter both failed:

1. **Predict its emptiness** with a home-grown subsequence matcher. VS Code's
   fuzzy matcher is stricter than a raw subsequence (`tp` is a subsequence of
   `types.ts`, yet VS Code shows nothing), so the proxy reported "has a match"
   while the user saw a blank list — and, over a large list, reported "has a
   match" for nearly every short query, so suggestions basically never fired.
2. **Read its result** via `quickPick.activeItems`. That value goes **stale** the
   instant the filter empties — after typing `t` (matches `types.ts`) then `p`
   (matches nothing), `activeItems` still held `types.ts`, so the code thought
   there was a match and never offered suggestions.

The fix is to stop cooperating with the native filter and **own the match**.
Every rendered row is given `alwaysShow: true`, which forces it past VS Code's
built-in filter, so the picker displays exactly the items we set. On each
keystroke we compute the matches ourselves (`filterPaths`), and "empty" becomes a
value we control rather than a signal we read.

`filterPaths` uses the same rule as the large-workspace input-box path: a file
matches when the query is a case-insensitive substring of its workspace-relative
path. Both picker paths now share one definition of "match", so
`getClosestMatches` kicks in under exactly the same condition everywhere.

### Picker wiring

Migrate `showQuickPick()` from the fire-and-forget `window.showQuickPick` to a
managed `window.createQuickPick()`:

1. Build the base item list (recently-used separators + files) as today, mark
   every item `alwaysShow: true`, and set it as the initial `items`.
2. `onDidChangeValue(value)`: clear any pending timer, then:
    - `value === ""` → show the full base list.
    - `filterPaths(value, items)` non-empty → show those matches (each
      `alwaysShow`), with the base placeholder.
    - otherwise → set `items` to `[]` (VS Code shows its empty state) and start a
      ~150ms debounce. On fire, `getClosestMatches(value, items)`; if non-empty,
      set `items` to a `did you mean` separator followed by the suggestions (each
      `alwaysShow`) and update the placeholder to
      `No files match "<value>". Showing the N closest names.` The debounce keeps
      mid-word typing (`x` → `xy` → `xyz`) from flashing a suggestion list you're
      about to type past.
3. `onDidAccept`: resolve `selectedItems[0]` via `returnRelativeLink`, then
   `hide()`. Works for both real matches and suggestion items (both carry a
   `description` = relative path).
4. `onDidHide`: clear the debounce timer and `dispose()` the quick pick, so the
   timer never fires against a disposed picker.

`matchOnDescription = true` stays on purely for match highlighting; it no longer
affects which rows show, because `alwaysShow` overrides filtering.

Both `showQuickPick` callers (quick-filter path and the input-box sub-lists)
share this logic; it operates on whatever `items` were passed, so no caller
needs special-casing.

## Testing

-   Unit-test `filterPaths`: substring hit, path-segment match, case
    insensitivity, abbreviation → no match, no workspace-prefix match, empty
    query.
-   `closest-match.ts` retains its existing coverage.
-   The picker-wiring layer (createQuickPick events, `alwaysShow`, debounce)
    depends on the VS Code API and is exercised manually in the Extension
    Development Host.

## Edge cases

-   Empty value → base list, no suggestions.
-   Debounce timer cleared on every keystroke and on hide/accept.
-   Selecting a suggestion resolves a real relative path (same item shape as
    matches).
-   `getClosestMatches` returns nothing (empty workspace) → leave the native
    empty state rather than an empty "did you mean".
