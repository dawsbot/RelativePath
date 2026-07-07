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
-   **Unchanged:** `src/closest-match.ts`, the input-box path, and the
    `searchCountLimit` threshold.

## Design

### Emptiness detection (the core decision)

The picker must offer suggestions exactly when VS Code's native filter comes up
empty. **Do not predict that with a home-grown matcher.** A first attempt tested
whether the query was a case-insensitive subsequence of any candidate path and
treated "no subsequence" as empty. That was wrong in both directions and shipped
a broken feature:

-   VS Code's fuzzy matcher is **stricter** than a raw subsequence — e.g. `tp`
    is a subsequence of `types.ts`, but VS Code still shows nothing. So the proxy
    reported "has a match" while the user saw a blank list, and no suggestions
    appeared.
-   Over a large file list, almost any short query is a subsequence of _some_
    path, so the proxy reported "has a match" for nearly everything, and
    suggestions basically never triggered ("no matter what I type").

Instead, read VS Code's **actual** filter result. After VS Code filters the base
items against the current value, `quickPick.activeItems` is empty exactly when
nothing matched. That is ground truth and stays in lockstep with what the user
sees, so native fuzzy matching and highlighting remain untouched for the happy
path.

### Picker wiring

Migrate `showQuickPick()` from the fire-and-forget `window.showQuickPick` to a
managed `window.createQuickPick()`:

1. Build the base item list (recently-used separators + files) exactly as today;
   set `quickPick.items`, `matchOnDescription = true`, and the placeholder.
2. `onDidChangeValue`: clear any pending timer. If suggestions are currently on
   screen, immediately restore the base list (so the user sees native filtering
   for the new value at once, never a stale "did you mean"). Then start a ~150ms
   debounce.
3. On debounce fire (the user has paused, and VS Code has finished filtering the
   base list against the current value):
    - `value === ""` → restore base list + placeholder.
    - `quickPick.activeItems.length > 0` → native filter has matches; leave them.
    - otherwise → `getClosestMatches(value, items)`; if non-empty, set items to a
      `did you mean` separator followed by the suggestions, each with
      `alwaysShow: true` (so VS Code's filter doesn't drop names that don't match
      the typed text); set placeholder to
      `No files match "<value>". Showing the N closest names.`
4. `onDidAccept`: resolve `selectedItems[0]` via `returnRelativeLink`, then
   `hide()`. Works for both real matches and suggestion items (both carry a
   `description` = relative path).
5. `onDidHide`: clear the debounce timer and `dispose()` the quick pick, so the
   timer never fires against a disposed picker.

Debouncing before reading `activeItems` also removes any race: 150ms after the
last keystroke, VS Code has settled its filter, so the read is reliable without
depending on `onDidChangeActive` ordering.

Both `showQuickPick` callers (quick-filter path and the input-box sub-lists)
share this logic; it operates on whatever `items` were passed, so no caller
needs special-casing.

## Testing

-   `closest-match.ts` retains its existing coverage.
-   The picker-wiring layer reacts to VS Code's own filter result and cannot be
    unit-tested without the extension host
    API; it is exercised manually in the Extension Development Host.

## Edge cases

-   Empty value → base list, no suggestions.
-   Debounce timer cleared on every keystroke and on hide/accept.
-   Selecting a suggestion resolves a real relative path (same item shape as
    matches).
-   `getClosestMatches` returns nothing (empty workspace) → leave the native
    empty state rather than an empty "did you mean".
