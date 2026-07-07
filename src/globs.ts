export function normalizeIncludeGlob(includeGlob: string): string {
    return includeGlob.replace(/^\/+/, "");
}

export function buildExcludeGlob(ignore: string[] | undefined): string | null {
    if (!ignore || ignore.length === 0) {
        return null;
    }

    const unique = [...new Set(ignore)];
    // A single-item brace (`{a}`) is not alternation, so the glob engine would
    // read it as the literal characters `{a}`. Emit the bare pattern instead
    // so its own `{a,b}` groups keep working.
    if (unique.length === 1) {
        return unique[0];
    }

    return `{${unique.map(escapeBraceSegment).join(",")}}`;
}

export type BuiltInExcludeMode = "none" | "files" | "search" | "both";

// Collect the globs from VS Code's built-in `files.exclude` / `search.exclude`
// settings so they can be merged into the exclude passed to findFiles. Both
// settings are stored as a map of glob -> value, where the value is `true`,
// `false`, or a `{ when }` sibling clause. We honor only the globs explicitly
// enabled with `true`: `false` (a user re-including a path) and `when` clauses
// (which need sibling files we can't cheaply resolve here) are skipped.
export function collectBuiltInExcludes(
    mode: BuiltInExcludeMode | undefined,
    filesExclude: Record<string, unknown> | undefined,
    searchExclude: Record<string, unknown> | undefined
): string[] {
    const globs: string[] = [];
    if (mode === "files" || mode === "both") {
        addEnabledGlobs(filesExclude, globs);
    }
    if (mode === "search" || mode === "both") {
        addEnabledGlobs(searchExclude, globs);
    }
    return globs;
}

function addEnabledGlobs(
    exclude: Record<string, unknown> | undefined,
    into: string[]
): void {
    if (!exclude) {
        return;
    }

    for (const glob of Object.keys(exclude)) {
        if (exclude[glob] !== true) {
            continue;
        }

        into.push(glob);
        // The built-in settings write folders as `**/node_modules` (no trailing
        // `/**`). findFiles prunes that folder's contents, but our file-creation
        // watcher matches file paths directly, so it also needs the descendant
        // form to keep files created later inside an excluded folder out of the
        // cache. Appending `/**` to a file-name pattern is harmless: it simply
        // never matches.
        if (!glob.endsWith("/**")) {
            into.push(`${glob}/**`);
        }
    }
}

function escapeBraceSegment(pattern: string): string {
    return pattern.replace(/[{},]/g, "\\$&");
}
