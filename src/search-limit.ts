// Bounds the workspace file scan so very large workspaces (huge monorepos,
// folders that slip past the ignore globs) can't pin memory or block the
// picker behind an unbounded disk crawl. See issue #74.

export const DEFAULT_MAX_FILES_CACHED = 100_000;

// Sanitizes the relativePath.maxFilesCached setting into a value for
// workspace.findFiles' maxResults parameter. Zero or negative is an explicit
// opt-out (no limit, the pre-#74 behavior); anything non-numeric falls back
// to the default cap.
export function resolveMaxResults(configValue: unknown): number | undefined {
    if (typeof configValue !== "number" || !Number.isFinite(configValue)) {
        return DEFAULT_MAX_FILES_CACHED;
    }
    if (configValue <= 0) {
        return undefined;
    }
    return Math.floor(configValue);
}

// findFiles gives no explicit truncation flag; hitting the cap exactly is the
// signal that more files likely exist.
export function isTruncated(
    fileCount: number,
    maxResults: number | undefined
): boolean {
    return maxResults !== undefined && fileCount >= maxResults;
}
