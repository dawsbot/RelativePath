// Computes the Levenshtein (edit) distance between two strings: the minimum
// number of single-character insertions, deletions, or substitutions needed
// to turn `a` into `b`. Used to suggest close file matches when a search
// yields no exact substring hit.
export function levenshteinDistance(a: string, b: string): number {
    if (a === b) {
        return 0;
    }
    if (a.length === 0) {
        return b.length;
    }
    if (b.length === 0) {
        return a.length;
    }

    // Keep only the previous and current rows instead of the full matrix.
    let previousRow: number[] = [];
    for (let j = 0; j <= b.length; j++) {
        previousRow[j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        const currentRow: number[] = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
            currentRow[j] = Math.min(
                previousRow[j] + 1, // deletion
                currentRow[j - 1] + 1, // insertion
                previousRow[j - 1] + cost // substitution
            );
        }
        previousRow = currentRow;
    }

    return previousRow[b.length];
}

// Returns up to `limit` file paths whose file name is closest to `query` by
// Levenshtein distance, closest first. Comparison is case-insensitive and made
// against the file's base name (not its full path) so that a short query is not
// unfairly penalized by long directory prefixes. Ties keep their original order.
export function getClosestMatches(
    query: string,
    fileNames: string[],
    limit = 5
): string[] {
    const normalizedQuery = query.toLowerCase();

    return fileNames
        .map((fileName, index) => ({
            fileName,
            index,
            distance: levenshteinDistance(
                normalizedQuery,
                baseName(fileName).toLowerCase()
            ),
        }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
        .slice(0, limit)
        .map((match) => match.fileName);
}

function baseName(fileName: string): string {
    return fileName.split("/").pop() ?? fileName;
}
