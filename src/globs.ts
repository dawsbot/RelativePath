export function normalizeIncludeGlob(includeGlob: string): string {
    return includeGlob.replace(/^\/+/, "");
}

export function buildExcludeGlob(ignore: string[] | undefined): string | null {
    if (!ignore || ignore.length === 0) {
        return null;
    }

    return `{${ignore.map(escapeBraceSegment).join(",")}}`;
}

function escapeBraceSegment(pattern: string): string {
    return pattern.replace(/[{},]/g, "\\$&");
}
