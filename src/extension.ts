// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, workspace, commands, Disposable,
    ExtensionContext, StatusBarAlignment, StatusBarItem,
    TextDocument, QuickPickItem, FileSystemWatcher, Uri,
    TextEditorEdit, TextEditor, Position} from 'vscode';
import * as path from "path";
let Glob = require("glob");

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    let relativePath = new RelativePath();

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

class RelativePath {

    private _items: string[];
    private _watcher: FileSystemWatcher;
    private _workspacePath: string;
    private _configuration: any;
    private _pausedSearch: boolean;
    private _myGlob: any;

    constructor() {
        this._items = null;
        this._pausedSearch = null;
        this._myGlob = null;
        this._workspacePath = workspace.rootPath.replace(/\\/g, "/");
        this._configuration = workspace.getConfiguration("relativePath");

        this.initializeWatcher();
        this.searchWorkspace();
        this.initializeConfigWatcher();
    }

    // When a file is added or deleted, we need to update cache
    private initializeWatcher() {
        // Watch for file system changes - as we're caching the searched files
        this._watcher = workspace.createFileSystemWatcher("**/*.*", false, true, false);

        // Add a file on creation
        this._watcher.onDidCreate((e: Uri) => {
            this._items.push(e.fsPath.replace(/\\/g, "/"));
        });

        // Remove a file on deletion
        this._watcher.onDidDelete((e: Uri) => {
            let item = e.fsPath.replace(/\\/g, "/");
            let index = this._items.indexOf(item);
            if (index > -1) {
                this._items.splice(index, 1);
            }
        });
    }

    // Purely updates the files
    private updateFiles(skipOpen = false): void {
        // Search for files
        if (this._pausedSearch) {
            this._pausedSearch = false;
            if (this._myGlob) {
                this._myGlob.resume();
            }
        } else {
            this._myGlob = new Glob(this._workspacePath + "/**/*.*",
                { ignore: this._configuration.get("ignore") },
                (err, files) => {
                    if (err) {
                        return;
                    }

                    this._items = files;
                    if (!skipOpen) {
                        this.findRelativePath();
                    }
                });
            this._myGlob.on("end", () => {
                this._pausedSearch = false;
            });
        }
    }

    // Go through workspace to cache files
    private searchWorkspace(skipOpen = false) {
        let emptyItem: QuickPickItem = { label: "", description: "No files found" };

        // Show loading info box
        let info = window.showQuickPick([emptyItem], { matchOnDescription: false, placeHolder: "Finding files... Please wait. (Press escape to cancel)" });
        info.then(
            (value?: any) => {
                if (this._myGlob) {
                    this._myGlob.pause();
                }
                if (this._pausedSearch === null) {
                    this._pausedSearch = true;
                }
            },
            (rejected?: any) => {
                if (this._myGlob) {
                    this._myGlob.pause();
                }
                if (this._pausedSearch === null) {
                    this._pausedSearch = true;
                }
            }
        );

        this.updateFiles(skipOpen);
    }

    // Compares the ignore property of _configuration to lastConfig
    private ignoreWasUpdated(currentIgnore: Array<string>, lastIgnore: Array<string>): boolean {
        if (currentIgnore.length !== lastIgnore.length) {
            return true;
        } else if (currentIgnore.some(glob => lastIgnore.indexOf(glob) < 0)) {
            return true;
        }

        return false;
    }

    // Listen for changes in the config files and update the config object
    private initializeConfigWatcher(): void {
        workspace.onDidChangeConfiguration((e) => {
            const lastConfig = this._configuration;
            this._configuration = workspace.getConfiguration("relativePath");

            // Handle updates to the ignored property if there's one
            if (this.ignoreWasUpdated(this._configuration.ignore, lastConfig.ignore)) {
                this.updateFiles(true);
            }
        }, this);
    }

    // Show dropdown editor
    private showQuickPick(items: string[], editor: TextEditor): void {
        if (items) {
            let paths: QuickPickItem[] = items.map((val: string) => {
                let item: QuickPickItem = { description: val.replace(this._workspacePath, ""), label: val.split("/").pop() };
                return item;
            });

            let pickResult: Thenable<QuickPickItem>;
            pickResult = window.showQuickPick(paths, { matchOnDescription: true, placeHolder: "Filename" });
            pickResult.then((item: QuickPickItem) => this.returnRelativeLink(item, editor));
        } else {
            window.showInformationMessage("No files to show.");
        }
    }

    // Check if the current extension should be excluded
    private excludeExtensionsFor(relativeUrl: string) {
        const currentExtension = path.extname(relativeUrl)
        if (currentExtension === '') {
            return false;
        }

        return this._configuration.excludedExtensions.some((ext: string) => {
            return (ext.startsWith('.') ? ext : `.${ext}`).toLowerCase() === currentExtension.toLowerCase();
        })
    }

    // Get the picked item
    private returnRelativeLink(item: QuickPickItem, editor: TextEditor): void {
        if (item) {
            const targetPath = item.description;
            const currentItemPath = editor.document.fileName.replace(/\\/g, "/").replace(this._workspacePath, "");
            let relativeUrl: string = path.relative(currentItemPath, targetPath).replace(".", "").replace(/\\/g, "/");

            if (this._configuration.removeExtension) {
                relativeUrl = relativeUrl.substring(0, relativeUrl.lastIndexOf("."));
            } else if (this.excludeExtensionsFor(relativeUrl)) {
                relativeUrl = relativeUrl.substring(0, relativeUrl.lastIndexOf("."));
            }
            if (this._configuration.removeLeadingDot && relativeUrl.startsWith("./../")) {
                relativeUrl = relativeUrl.substring(2, relativeUrl.length);
            }

            window.activeTextEditor.edit(
                (editBuilder: TextEditorEdit) => {
                    let position: Position = window.activeTextEditor.selection.end;
                    editBuilder.insert(position, relativeUrl);
                }
            );
        }
    }

    public findRelativePath() {
        // If there's no file opened
        let editor = window.activeTextEditor;
        if (!editor) {
            window.showInformationMessage("You need to have a file opened.");
            return; // No open text editor
        }

        // If we canceled the file search
        if (this._pausedSearch) {
            this.searchWorkspace();
            return;
        }

        // If there are no items found
        if (!this._items) {
            return;
        }

        this.showQuickPick(this._items, editor);
    }

    dispose() {
        this._items = null;
    }
}