// Matches a single workspace-relative path against the include/ignore globs,
// so the file watcher can apply the same filters as the findFiles scan when a
// file is created. Supports the glob subset VS Code documents for these
// settings: `**` (any depth, including none), `*` and `?` (within one
// segment), and non-nested `{a,b}` alternation.

export function globToRegExp(glob: string): RegExp {
    return new RegExp(`^${convert(glob)}$`);
}

// Should a newly created file enter the cache? Mirrors what findFiles would
// decide for the same path, so creations in ignored folders (e.g. an
// `npm install` filling node_modules) don't flood the cache.
export function shouldAddToCache(
    relativePath: string,
    includeGlob: string,
    ignoreGlobs: string[] | undefined
): boolean {
    if (!globToRegExp(includeGlob).test(relativePath)) {
        return false;
    }

    return !(ignoreGlobs ?? []).some((glob) =>
        globToRegExp(glob).test(relativePath)
    );
}

function convert(glob: string): string {
    let source = "";
    let index = 0;

    while (index < glob.length) {
        const char = glob.charAt(index);

        if (char === "*") {
            if (glob.charAt(index + 1) === "*") {
                if (glob.charAt(index + 2) === "/") {
                    // "**/" spans zero or more whole segments
                    source += "(?:[^/]+/)*";
                    index += 3;
                } else {
                    source += ".*";
                    index += 2;
                }
            } else {
                source += "[^/]*";
                index += 1;
            }
        } else if (char === "?") {
            source += "[^/]";
            index += 1;
        } else if (char === "{") {
            const end = glob.indexOf("}", index);
            if (end === -1) {
                source += "\\{";
                index += 1;
            } else {
                const options = glob
                    .slice(index + 1, end)
                    .split(",")
                    .map(convert);
                source += `(?:${options.join("|")})`;
                index = end + 1;
            }
        } else {
            source += escapeRegExp(char);
            index += 1;
        }
    }

    return source;
}

function escapeRegExp(char: string): string {
    return /[.+^$()|[\]\\}]/.test(char) ? `\\${char}` : char;
}
