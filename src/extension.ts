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
    TextEditorEdit,
    window,
    workspace,
    WorkspaceConfiguration,
} from "vscode";
import { getClosestMatches } from "./closest-match";
import { shouldAddToCache } from "./glob-match";
import { buildExcludeGlob, normalizeIncludeGlob } from "./globs";
import { partitionByRecency, recordRecentPath } from "./recent-paths";
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
                    this._configuration.get("ignore")
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
            const folder = workspace.getWorkspaceFolder(res);
            return folder.uri.fsPath.replace(/\\/g, "/");
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
        const exclude = buildExcludeGlob(this._configuration.get("ignore"));
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

            // Handle updates to the properties that shape the cached file
            // list if there are any
            if (
                this.ignoreWasUpdated(
                    this._configuration.ignore,
                    lastConfig.ignore
                ) ||
                this._configuration.maxFilesCached !==
                    lastConfig.maxFilesCached ||
                this._configuration.includeGlob !== lastConfig.includeGlob
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
        if (items) {
            const toQuickPickItem = (val: string): QuickPickItem => ({
                description: val.replace(this._workspacePath, ""),
                label: val.split("/").pop(),
            });

            // Surface the paths the user picked before above the rest of the
            // list, mirroring VS Code's own "recently opened" behavior.
            const { recent, rest } = this._configuration.get("showRecentlyUsed")
                ? partitionByRecency(items, this._state.get(RECENTLY_USED_KEY))
                : { recent: [], rest: items };

            const paths: QuickPickItem[] =
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

            let pickResult: Thenable<QuickPickItem>;
            pickResult = window.showQuickPick(paths, {
                matchOnDescription: true,
                placeHolder:
                    placeHolder ?? `Type to filter ${items.length} files`,
            });
            pickResult.then((item: QuickPickItem) =>
                this.returnRelativeLink(item, editor)
            );
        } else {
            window.showInformationMessage("No files to show.");
        }
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

            window.activeTextEditor.edit((editBuilder: TextEditorEdit) => {
                // Get all selections
                let selections = window.activeTextEditor.selections;

                // Replace selections with relative Url.
                selections.forEach((sel) => {
                    editor.edit((editBuilder) => {
                        editBuilder.replace(sel, relativeUrl);
                    });
                });
            });
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
