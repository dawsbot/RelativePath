// Ranks file names by closeness to a query, for the "did you mean" fallback
// shown when a substring search returns nothing.
//
// Two complementary strategies, because the query reached this fallback for one
// of two reasons and they fail differently under a single metric:
//   1. Abbreviation / subsequence  ("btn" -> "Button.tsx", "uc" -> "UserController.ts")
//      -> handled by a subsequence scorer (edit distance would penalize the gaps).
//   2. Substitution typo           ("bztton" -> "Button.tsx")
//      -> handled by edit distance (a substitution breaks a subsequence entirely).
// Subsequence matches are preferred; edit distance is only consulted when the
// query is not a subsequence of any candidate.

// Upper bound on how many files the fallback will score in a single invocation.
// This is a performance guard, not a preference: scoring is one-shot and cheap
// per file, but on very large workspaces an unbounded pass could block the
// extension host for seconds. Capping keeps the worst case constant regardless
// of repo size; the strongest suggestions live in the first slice anyway.
export const MAX_FALLBACK_CANDIDATES = 50_000;

// Characters that mark the start of a new "word" within a file name. A match
// landing right after one of these (or a camelCase hump) is a stronger signal.
const WORD_SEPARATORS = new Set(["/", "\\", "-", "_", ".", " "]);

export function getClosestMatches(
    query: string,
    fileNames: string[],
    limit = 5
): string[] {
    const normalizedQuery = query.toLowerCase();
    const candidates =
        fileNames.length > MAX_FALLBACK_CANDIDATES
            ? fileNames.slice(0, MAX_FALLBACK_CANDIDATES)
            : fileNames;

    // Pass 1: subsequence matches (abbreviations). Higher score is better.
    const subsequenceMatches: {
        fileName: string;
        index: number;
        score: number;
    }[] = [];
    for (let index = 0; index < candidates.length; index++) {
        const fileName = candidates[index];
        const score = subsequenceScore(normalizedQuery, baseName(fileName));
        if (score !== null) {
            subsequenceMatches.push({ fileName, index, score });
        }
    }

    if (subsequenceMatches.length > 0) {
        return subsequenceMatches
            .sort((a, b) => b.score - a.score || a.index - b.index)
            .slice(0, limit)
            .map((match) => match.fileName);
    }

    // Pass 2: no subsequence hit (typo). Lower edit distance is better.
    return candidates
        .map((fileName, index) => ({
            fileName,
            index,
            distance: damerauLevenshtein(
                normalizedQuery,
                baseName(fileName).toLowerCase()
            ),
        }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
        .slice(0, limit)
        .map((match) => match.fileName);
}

// Scores how well `query` (already lowercased) fuzzy-matches `target`, matching
// query characters in order and allowing gaps. Returns null when `query` is not
// a subsequence of `target`. `target` keeps its original case so camelCase humps
// can be detected as word boundaries. Higher score = tighter, more prefix- and
// boundary-aligned match.
export function subsequenceScore(query: string, target: string): number | null {
    if (query.length === 0) {
        return 0;
    }

    const lowerTarget = target.toLowerCase();
    let score = 0;
    let queryIndex = 0;
    let previousMatch = -2;

    for (
        let targetIndex = 0;
        targetIndex < target.length && queryIndex < query.length;
        targetIndex++
    ) {
        if (lowerTarget.charAt(targetIndex) !== query.charAt(queryIndex)) {
            continue;
        }

        // Contiguous matches read as a real prefix of a word, not scattered hits.
        score += previousMatch === targetIndex - 1 ? 3 : 1;
        // Matches at the start of a word (or the name) are a stronger signal.
        if (targetIndex === 0 || isWordBoundary(target, targetIndex)) {
            score += 2;
        }

        previousMatch = targetIndex;
        queryIndex++;
    }

    if (queryIndex < query.length) {
        return null; // ran out of target before matching the whole query
    }

    // Mild tiebreak toward shorter names, where the match is denser.
    return score - target.length * 0.01;
}

// Optimal string alignment distance: Levenshtein plus adjacent transpositions
// counted as a single edit ("buttno" -> "button" is 1, not 2), which covers a
// very common class of typo.
export function damerauLevenshtein(a: string, b: string): number {
    if (a === b) {
        return 0;
    }
    if (a.length === 0) {
        return b.length;
    }
    if (b.length === 0) {
        return a.length;
    }

    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1, // deletion
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );

            if (
                i > 1 &&
                j > 1 &&
                a.charAt(i - 1) === b.charAt(j - 2) &&
                a.charAt(i - 2) === b.charAt(j - 1)
            ) {
                matrix[i][j] = Math.min(
                    matrix[i][j],
                    matrix[i - 2][j - 2] + 1 // transposition
                );
            }
        }
    }

    return matrix[a.length][b.length];
}

function isWordBoundary(target: string, index: number): boolean {
    const previous = target.charAt(index - 1);
    if (WORD_SEPARATORS.has(previous)) {
        return true;
    }

    // camelCase hump: an uppercase letter following a lowercase one.
    const current = target.charAt(index);
    return (
        current >= "A" && current <= "Z" && previous >= "a" && previous <= "z"
    );
}

function baseName(fileName: string): string {
    return fileName.split("/").pop() ?? fileName;
}
