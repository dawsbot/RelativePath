// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
let path = require("path");
let Glob = require("glob").Glob;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log("The extension \"RelativePath\" is now active!");
    const workspacePath: string = vscode.workspace.rootPath.replace(/\\/g, "/");
    let configuration: any = vscode.workspace.getConfiguration("relativePath");
    let editor = vscode.window.activeTextEditor;
    let emptyItem: vscode.QuickPickItem = { label: "", description: "No files found" };
    let items: string[] = null;
    let myGlob = null;
    let paused: boolean = false;

    function myActivate() {

        // Show loading info box
        let info = vscode.window.showQuickPick([emptyItem], { matchOnDescription: false, placeHolder: "Finding files... Please wait. (Press escape to cancel)" });
        info.then(
            (value?: any) => {
                myGlob.pause();
                paused = true;
            },
            (rejected?: any) => {
                myGlob.pause();
                paused = true;
            }
        );

        // Search for files
        if (paused) {
            paused = false;
            myGlob.resume();
        } else {
            myGlob = new Glob(workspacePath + "/**/*.*",
                { ignore: configuration.get("ignore") },
                function(err, files) {
                    if (err) {
                        return;
                    }

                    items = files;
                    vscode.commands.executeCommand("extension.relativePath");
                });
            myGlob.on("end", function() {
                paused = false;
            });
        }
    }

    // Initialize activation
    myActivate();

    // Watch for file system changes - as we're caching the searched files
    let watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*.*", false, true, false);

    // Add a file on creation
    watcher.onDidCreate((e: vscode.Uri) => {
        items.push(e.fsPath.replace(/\\/g, "/"));
    });

    // Remove a file on deletion
    watcher.onDidDelete((e: vscode.Uri) => {
        let item = e.fsPath.replace(/\\/g, "/");
        let index = items.indexOf(item);
        if (index > -1) {
            items.splice(index, 1);
        }
    });

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand("extension.relativePath", () => {
        // The code you place here will be executed every time your command is executed

        // If there's no file opened
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage("You need to have a file opened.");
            return; // No open text editor
        }

        // If we canceled the file search
        if (paused) {
            myActivate();
            return;
        }

        // If there are no items found
        if (!items) {
            return;
        }

        showQuickPick(items);

        // Show dropdown editor
        function showQuickPick(items: string[]): void {
            if (items) {
                let paths: vscode.QuickPickItem[] = items.map((val: string) => {
                    let item: vscode.QuickPickItem = { description: val.replace(workspacePath, ""), label: val.split("/").pop() };
                    return item;
                });

                let pickResult: Thenable<vscode.QuickPickItem>;
                pickResult = vscode.window.showQuickPick(paths, { matchOnDescription: true, placeHolder: "Filename" });
                pickResult.then(returnRelativeLink);
            } else {
                vscode.window.showInformationMessage("No files to show.");
            }
        }

        // Get the picked item
        function returnRelativeLink(item: vscode.QuickPickItem): void {
            if (item) {
                const targetPath = item.description;
                const currentItemPath = editor.document.fileName.replace(/\\/g, "/").replace(workspacePath, "");
                let relativeUrl: string = path.relative(currentItemPath, targetPath).replace(".", "").replace(/\\/g, "/");

                if (configuration.removeExtension) {
                    relativeUrl = relativeUrl.substring(0, relativeUrl.lastIndexOf("."));
                }
                if (configuration.removeLeadingDot && relativeUrl.startsWith("./../")) {
                    relativeUrl = relativeUrl.substring(2, relativeUrl.length);
                }

                vscode.window.activeTextEditor.edit(
                    (editBuilder: vscode.TextEditorEdit) => {
                        let position: vscode.Position = vscode.window.activeTextEditor.selection.end;
                        editBuilder.insert(position, relativeUrl);
                    }
                );
            }
        }
    });

    context.subscriptions.push(disposable);
}