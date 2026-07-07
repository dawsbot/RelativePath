// Decides whether VS Code's quick-pick filter would show anything for a query,
// so the picker can fall back to "did you mean" suggestions the moment matches
// hit zero (issue #84).
//
// VS Code matches a quick-pick item when the query is a case-insensitive
// *subsequence* of its label or description. With `matchOnDescription` on, the
// description is the workspace-relative path (a superset of the base name), so
// testing the query as a subsequence of that path mirrors what the user sees:
// abbreviations like "btn" still match "Button.tsx", while a substitution typo
// like "bztton" matches nothing and should trigger the fallback.

// True when `query` appears in `target` as an ordered, case-insensitive
// subsequence (gaps allowed). An empty query matches everything.
export function isFuzzyMatch(query: string, target: string): boolean {
    const lowerQuery = query.toLowerCase();
    const lowerTarget = target.toLowerCase();

    let queryIndex = 0;
    for (
        let targetIndex = 0;
        targetIndex < lowerTarget.length && queryIndex < lowerQuery.length;
        targetIndex++
    ) {
        if (lowerTarget.charAt(targetIndex) === lowerQuery.charAt(queryIndex)) {
            queryIndex++;
        }
    }

    return queryIndex === lowerQuery.length;
}

// True when at least one candidate would survive the native filter. Short
// circuits on the first hit so the common (non-empty) case stays cheap even on
// large workspaces.
export function hasAnyFuzzyMatch(query: string, candidates: string[]): boolean {
    return candidates.some((candidate) => isFuzzyMatch(query, candidate));
}
