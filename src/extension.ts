import * as path from "path";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
    CancellationTokenSource,
    commands,
    ExtensionContext,
    FileSystemWatcher,
    Memento,
    QuickPickItem,
    QuickPickItemKind,
    RelativePattern,
    TextEditor,
    window,
    workspace,
    WorkspaceConfiguration,
} from "vscode";
import { getClosestMatches } from "./closest-match";
import { shouldAddToCache } from "./glob-match";
import {
    buildExcludeGlob,
    collectExcludeGlobs,
    normalizeIncludeGlob,
} from "./globs";
import { hasAnyFuzzyMatch } from "./picker-suggestions";
import { partitionByRecency, recordRecentPath } from "./recent-paths";
import { replaceSelections } from "./replace-selections";
import { isTruncated, resolveMaxResults } from "./search-limit";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    let relativePath = new RelativePath(context.workspaceState);

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = commands.registerCommand("extension.relativePath", () => {
        // The code you place here will be executed every time your command is executed

        relativePath.findRelativePath();
    });

    context.subscriptions.push(relativePath);
    context.subscriptions.push(disposable);
}

const RECENTLY_USED_KEY = "relativePath.recentlyUsed";

// How long the picker waits after the last keystroke before deciding the query
// matches nothing and swapping in "did you mean" suggestions. Short enough to
// feel live, long enough that mid-word typing (x -> xy -> xyz) doesn't flash a
// suggestion list you're about to type past (issue #84).
const SUGGESTION_DEBOUNCE_MS = 150;

class RelativePath {
    private _fileNames: string[];
    private _truncated: boolean;
    private _watcher: FileSystemWatcher;
    private _workspacePath: string;
    private _configuration: WorkspaceConfiguration;
    private _tokenSource: CancellationTokenSource;
    private _state: Memento;

    constructor(state: Memento) {
        this._state = state;
        this._fileNames = null;
        this._truncated = false;
        this._tokenSource = null;
        this._workspacePath = this.getWorkspaceFolder();
        this._configuration = workspace.getConfiguration("relativePath");

        this.initializeWatcher();
        this.searchWorkspace();
        this.initializeConfigWatcher();
    }

    // When a file is added or deleted, we need to update cache
    private initializeWatcher() {
        const IGNORE_CREATE_EVENTS = false;
        const IGNORE_CHANGE_EVENTS = true;
        const IGNORE_DELETE_EVENTS = false;
        // Watch for file system changes - as we're caching the searched files
        this._watcher = workspace.createFileSystemWatcher(
            "**/*.*",
            IGNORE_CREATE_EVENTS,
            IGNORE_CHANGE_EVENTS,
            IGNORE_DELETE_EVENTS
        );

        // Add a file on creation, applying the same include/ignore/cap
        // filters as the findFiles scan so bulk creations in ignored folders
        // (e.g. npm install) don't flood the cache.
        this._watcher.onDidCreate((e) => {
            if (!this._fileNames) {
                // Initial scan hasn't finished; it will pick this file up.
                return;
            }

            const filePath = e.fsPath.replace(/\\/g, "/");
            const workspacePrefix = `${this._workspacePath}/`;
            if (!filePath.startsWith(workspacePrefix)) {
                return;
            }

            const maxResults = resolveMaxResults(
                this._configuration.get("maxFilesCached")
            );
            if (isTruncated(this._fileNames.length, maxResults)) {
                this._truncated = true;
                return;
            }

            const includeGlob: string = this._configuration.get("includeGlob");
            if (
                shouldAddToCache(
                    filePath.slice(workspacePrefix.length),
                    normalizeIncludeGlob(includeGlob),
                    this.buildIgnoreGlobs()
                )
            ) {
                this._fileNames.push(filePath);
            }
        });

        // on change active text editor refresh the cache
        // if the workspace folder has changed
        window.onDidChangeActiveTextEditor((e) => {
            const currentWorkspacePath = this.getWorkspaceFolder();
            if (this._workspacePath !== currentWorkspacePath) {
                this._workspacePath = currentWorkspacePath;

                if (this._workspacePath) {
                    this.updateFiles(true);
                }
            }
        });

        // Remove a file on deletion
        this._watcher.onDidDelete((e) => {
            if (!this._fileNames) {
                return;
            }

            let item = e.fsPath.replace(/\\/g, "/");
            let index = this._fileNames.indexOf(item);
            if (index > -1) {
                this._fileNames.splice(index, 1);
            }
        });
    }
    private getWorkspaceFolder(): string {
        const editor = window.activeTextEditor;
        if (editor) {
            const res = editor.document.uri;
            // The active file may live outside every workspace folder
            // (window opened without a folder, untitled or virtual docs);
            // there is no base path to resolve against then.
            const folder = workspace.getWorkspaceFolder(res);
            return folder?.uri.fsPath.replace(/\\/g, "/");
        }
    }
    // Purely updates the files
    private updateFiles(skipOpen = false): void {
        if (!this._workspacePath) {
            return;
        }

        // Cancel any search that is still running
        if (this._tokenSource) {
            this._tokenSource.cancel();
        }
        const tokenSource = new CancellationTokenSource();
        this._tokenSource = tokenSource;

        const includeGlob: string = this._configuration.get("includeGlob");
        const include = new RelativePattern(
            this._workspacePath,
            normalizeIncludeGlob(includeGlob)
        );
        const exclude = buildExcludeGlob(this.buildIgnoreGlobs());
        const maxResults = resolveMaxResults(
            this._configuration.get("maxFilesCached")
        );

        workspace
            .findFiles(include, exclude, maxResults, tokenSource.token)
            .then((files) => {
                if (this._tokenSource !== tokenSource) {
                    // A newer search superseded this one
                    return;
                }
                this._tokenSource = null;

                if (tokenSource.token.isCancellationRequested) {
                    return;
                }

                this._truncated = isTruncated(files.length, maxResults);
                this._fileNames = files.map((file) =>
                    file.fsPath.replace(/\\/g, "/")
                );
                if (!skipOpen) {
                    this.findRelativePath();
                }
            });
    }

    // Go through workspace to cache files
    private searchWorkspace(skipOpen = false) {
        let emptyItem: QuickPickItem = {
            label: "",
            description: "No files found",
        };

        // Show loading info box
        let info = window.showQuickPick([emptyItem], {
            matchOnDescription: false,
            placeHolder:
                "Finding files... Please wait. (Press escape to cancel)",
        });
        // If the loading box is dismissed while a search is still
        // running, cancel it. It will be restarted on next invocation.
        const onDismiss = () => {
            if (this._tokenSource) {
                this._tokenSource.cancel();
            }
        };
        info.then(onDismiss, onDismiss);

        this.updateFiles(skipOpen);
    }

    // The globs excluded from both the findFiles scan and the file-creation
    // watcher: the user's `relativePath.ignore` plus VS Code's own built-in
    // excludes so those don't have to be duplicated (issue #31).
    //
    // `files.exclude` is always merged in: findFiles applies it to the scan no
    // matter what we pass (short of a `null` exclude, which would also drop our
    // own ignore globs), so we add it to keep the creation watcher consistent
    // with that. `search.exclude` is opt-in via
    // `relativePath.respectSearchExclude` (default true), because findFiles
    // never applies it on its own.
    private buildIgnoreGlobs(): string[] {
        const ignore: string[] = this._configuration.get("ignore") ?? [];

        const filesExclude = workspace
            .getConfiguration("files")
            .get<Record<string, unknown>>("exclude");
        const globs = [...ignore, ...collectExcludeGlobs(filesExclude)];

        if (this._configuration.get("respectSearchExclude")) {
            const searchExclude = workspace
                .getConfiguration("search")
                .get<Record<string, unknown>>("exclude");
            globs.push(...collectExcludeGlobs(searchExclude));
        }

        return globs;
    }

    // Compares the ignore property of _configuration to lastConfig
    private ignoreWasUpdated(
        currentIgnore: Array<string>,
        lastIgnore: Array<string>
    ): boolean {
        if (currentIgnore.length !== lastIgnore.length) {
            return true;
        } else if (currentIgnore.some((glob) => lastIgnore.indexOf(glob) < 0)) {
            return true;
        }

        return false;
    }

    // Listen for changes in the config files and update the config object
    private initializeConfigWatcher(): void {
        workspace.onDidChangeConfiguration((e) => {
            const lastConfig = this._configuration;
            this._configuration = workspace.getConfiguration("relativePath");

            // VS Code's own `files.exclude` always shapes our cache, and
            // `search.exclude` does too while it's respected, so a change to
            // either must trigger a rescan.
            const respectSearch = this._configuration.get(
                "respectSearchExclude"
            );

            // Handle updates to the properties that shape the cached file
            // list if there are any
            if (
                this.ignoreWasUpdated(
                    this._configuration.ignore,
                    lastConfig.ignore
                ) ||
                this._configuration.maxFilesCached !==
                    lastConfig.maxFilesCached ||
                this._configuration.includeGlob !== lastConfig.includeGlob ||
                this._configuration.respectSearchExclude !==
                    lastConfig.respectSearchExclude ||
                e.affectsConfiguration("files.exclude") ||
                (respectSearch && e.affectsConfiguration("search.exclude"))
            ) {
                this.updateFiles(true);
            }
        }, this);
    }

    // Show dropdown editor
    private showQuickPick(
        items: string[],
        editor: TextEditor,
        placeHolder?: string
    ): void {
        if (!items) {
            window.showInformationMessage("No files to show.");
            return;
        }

        const toQuickPickItem = (val: string): QuickPickItem => ({
            description: val.replace(this._workspacePath, ""),
            label: val.split("/").pop(),
        });

        // Surface the paths the user picked before above the rest of the
        // list, mirroring VS Code's own "recently opened" behavior.
        const { recent, rest } = this._configuration.get("showRecentlyUsed")
            ? partitionByRecency(items, this._state.get(RECENTLY_USED_KEY))
            : { recent: [], rest: items };

        const basePaths: QuickPickItem[] =
            recent.length > 0
                ? [
                      {
                          label: "recently used",
                          kind: QuickPickItemKind.Separator,
                      },
                      ...recent.map(toQuickPickItem),
                      {
                          label: "other files",
                          kind: QuickPickItemKind.Separator,
                      },
                      ...rest.map(toQuickPickItem),
                  ]
                : items.map(toQuickPickItem);

        const basePlaceholder =
            placeHolder ?? `Type to filter ${items.length} files`;

        // The relative paths VS Code's filter matches against (label +
        // description, with matchOnDescription on). Comparing the query to
        // these tells us when the native filter would come up empty so we can
        // swap in "did you mean" suggestions instead.
        const candidates = items.map((item) =>
            item.replace(this._workspacePath, "")
        );

        // A managed quick pick, not the fire-and-forget window.showQuickPick,
        // so we can watch typing and inject closest-match suggestions the
        // moment the query stops matching any file (issue #84).
        const quickPick = window.createQuickPick();
        quickPick.matchOnDescription = true;
        quickPick.placeholder = basePlaceholder;
        quickPick.items = basePaths;

        let debounce: ReturnType<typeof setTimeout> | undefined;
        let showingSuggestions = false;

        const restoreBase = () => {
            if (showingSuggestions) {
                quickPick.items = basePaths;
                quickPick.placeholder = basePlaceholder;
                showingSuggestions = false;
            }
        };

        quickPick.onDidChangeValue((value) => {
            if (debounce) {
                clearTimeout(debounce);
            }

            // Let VS Code's native filter handle the happy path; only step in
            // once the user pauses, so suggestions don't flash mid-word. The
            // decision is recomputed from the immutable base list every time,
            // so it toggles back to real matches as the user keeps typing.
            debounce = setTimeout(() => {
                if (value === "" || hasAnyFuzzyMatch(value, candidates)) {
                    restoreBase();
                    return;
                }

                const suggestions = getClosestMatches(value, items);
                quickPick.items = [
                    {
                        label: "did you mean",
                        kind: QuickPickItemKind.Separator,
                    },
                    ...suggestions.map((suggestion) => ({
                        ...toQuickPickItem(suggestion),
                        // These names don't contain the typed text by
                        // definition, so force them past VS Code's filter.
                        alwaysShow: true,
                    })),
                ];
                quickPick.placeholder = `No files match "${value}". Showing the ${suggestions.length} closest names.`;
                showingSuggestions = true;
            }, SUGGESTION_DEBOUNCE_MS);
        });

        quickPick.onDidAccept(() => {
            const [selected] = quickPick.selectedItems;
            quickPick.hide();
            this.returnRelativeLink(selected, editor);
        });

        quickPick.onDidHide(() => {
            if (debounce) {
                clearTimeout(debounce);
            }
            quickPick.dispose();
        });

        quickPick.show();
    }

    // Check if the current extension should be excluded
    private excludeExtensionsFor(relativeUrl: string) {
        const currentExtension = path.extname(relativeUrl);
        if (currentExtension === "") {
            return false;
        }

        return this._configuration.excludedExtensions.some((ext: string) => {
            return (
                (ext.startsWith(".") ? ext : `.${ext}`).toLowerCase() ===
                currentExtension.toLowerCase()
            );
        });
    }

    // Get the picked item
    private returnRelativeLink(item: QuickPickItem, editor: TextEditor): void {
        if (item) {
            const targetPath = item.description;
            this._state.update(
                RECENTLY_USED_KEY,
                recordRecentPath(
                    this._state.get(RECENTLY_USED_KEY),
                    `${this._workspacePath}${targetPath}`
                )
            );
            const currentItemPath = editor.document.fileName
                .replace(/\\/g, "/")
                .replace(this._workspacePath, "");
            let relativeUrl: string = path
                .relative(currentItemPath, targetPath)
                .replace(".", "")
                .replace(/\\/g, "/");

            if (
                this._configuration.removeExtension ||
                this.excludeExtensionsFor(relativeUrl)
            ) {
                relativeUrl = relativeUrl.substring(
                    0,
                    relativeUrl.lastIndexOf(".")
                );
            }

            if (
                this._configuration.removeLeadingDot &&
                relativeUrl.startsWith("./../")
            ) {
                relativeUrl = relativeUrl.substring(2, relativeUrl.length);
            }

            if (this._configuration.omitParts) {
                this._configuration.omitParts.forEach((omitRegexp) => {
                    relativeUrl = relativeUrl.replace(
                        new RegExp(omitRegexp),
                        ""
                    );
                });
            }

            // Write every active cursor in one atomic edit. Separate edit()
            // calls per selection are dropped by VS Code after the first,
            // which broke multi-cursor insertions (issue #70).
            replaceSelections(editor, relativeUrl);
        }
    }

    public findRelativePath() {
        // If there's no file opened
        let editor = window.activeTextEditor;

        if (this._workspacePath == null || !editor) {
            window.showInformationMessage("You need to have a file opened.");
            return; // No open text editor
        }

        // If search is still running, wait for it to open the picker.
        if (this._tokenSource) {
            return;
        }

        // If there are no cached items yet, start or restart the search.
        if (!this._fileNames) {
            this.searchWorkspace();
            return;
        }

        const allowQuickFilter =
            this._configuration.searchCountLimit > this._fileNames.length;

        // When the scan stopped at relativePath.maxFilesCached, say so
        // instead of presenting a silently partial list.
        const foundLabel = this._truncated
            ? `Found the first ${this._fileNames.length} files (capped by 'relativePath.maxFilesCached')`
            : `Found ${this._fileNames.length} files`;

        if (allowQuickFilter) {
            this.showQuickPick(
                this._fileNames,
                editor,
                this._truncated ? `${foundLabel}. Type to filter.` : undefined
            );
        } else {
            // Don't filter on too many files. Show the input search box instead
            const placeHolder = `${foundLabel} but your limit is ${this._configuration.searchCountLimit}. Start typing or ignore files with 'relativePath.ignore' in settings.`;
            const input = window.showInputBox({ placeHolder });
            input.then(
                (val) => {
                    if (val === undefined) {
                        // User pressed 'Escape'
                        return;
                    }

                    if (val === "") {
                        // User just pressed 'Enter'
                        this.showQuickPick(this._fileNames, editor);
                        return;
                    }

                    const matches = this._fileNames.filter(
                        (item) =>
                            item.toLowerCase().indexOf(val.toLowerCase()) > -1
                    );

                    if (matches.length === 0) {
                        // No file contains the search text. Fall back to the
                        // closest matches by Levenshtein distance so the user
                        // gets a "did you mean" list instead of an empty one.
                        const suggestions = getClosestMatches(
                            val,
                            this._fileNames
                        );
                        this.showQuickPick(
                            suggestions,
                            editor,
                            `No files match "${val}". Showing the ${suggestions.length} closest names.`
                        );
                        return;
                    }

                    this.showQuickPick(matches, editor);
                },
                () => {
                    return;
                }
            );
        }
    }

    dispose() {
        this._fileNames = null;
    }
}
