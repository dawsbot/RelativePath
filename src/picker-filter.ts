// The live picker owns its own filtering instead of leaning on VS Code's
// built-in quick-pick filter. Two earlier attempts tried to cooperate with the
// native filter (predict its emptiness, then read its `activeItems`) and both
// failed: its fuzzy matcher is opaque and `activeItems` goes stale the moment
// the filter empties. Owning the match makes "no results" something we compute,
// so the "did you mean" fallback (getClosestMatches) fires reliably.
//
// The rule matches the large-workspace input-box path (extension.ts): a file
// matches when the query is a case-insensitive substring of its workspace-
// relative path. Keeping both paths on the same rule means suggestions kick in
// under exactly the same condition everywhere.

export function filterPaths(
    query: string,
    items: string[],
    workspacePath: string
): string[] {
    const needle = query.toLowerCase();
    return items.filter((item) =>
        item.replace(workspacePath, "").toLowerCase().includes(needle)
    );
}
