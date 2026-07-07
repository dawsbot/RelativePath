// Tracks the paths the user actually picked so the quick pick can surface
// them above the full file list on the next invocation. See issue #65.

export const DEFAULT_RECENT_PATHS_LIMIT = 100;

// Stored state comes from Memento.get and may be anything after upgrades or
// manual edits; only a clean string array is trusted.
function sanitize(recents: unknown): string[] {
    if (!Array.isArray(recents)) {
        return [];
    }
    return recents.filter((item): item is string => typeof item === "string");
}

// Returns a new recency list with the picked path in front, deduplicated and
// capped at the limit.
export function recordRecentPath(
    recents: unknown,
    pickedPath: string,
    limit: number = DEFAULT_RECENT_PATHS_LIMIT
): string[] {
    const cleaned = sanitize(recents).filter((item) => item !== pickedPath);
    return [pickedPath, ...cleaned].slice(0, limit);
}

// Splits the file names to display into the recently used ones (most recent
// first) and everything else (original order). Recents pointing at files no
// longer in the list are dropped.
export function partitionByRecency(
    fileNames: string[],
    recents: unknown
): { recent: string[]; rest: string[] } {
    const available = new Set(fileNames);
    const recent = sanitize(recents).filter((item) => available.has(item));
    if (recent.length === 0) {
        return { recent, rest: fileNames };
    }
    const recentSet = new Set(recent);
    return {
        recent,
        rest: fileNames.filter((item) => !recentSet.has(item)),
    };
}
