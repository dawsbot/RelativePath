// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'; 
var path = require('path');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "RelativePath" is now active!'); 

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	var disposable = vscode.commands.registerCommand('extension.sayHello', () => {
		// The code you place here will be executed every time your command is executed
		var editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage("You need to have a file loaded.");	
			return; // No open text editor
		}
		
		// Get the documents
		let documents: Thenable<vscode.Uri[]> = vscode.workspace.findFiles('**/**', '**/node_modules/**', 10);
		documents.then(
			showQuickPick
		);
		
		// Show dropdown editor
		function showQuickPick(items: vscode.Uri[]): void {
			if (items) {
				let paths: vscode.QuickPickItem[] = items.map((val: vscode.Uri) => {
					let item: vscode.QuickPickItem = { description: val.fsPath, label: val.fsPath.split(path.sep).pop() };
					return item;
				});
				
				let pickResult: Thenable<vscode.QuickPickItem>;
				pickResult = vscode.window.showQuickPick(paths, { matchOnDescription: true, placeHolder: "Filename" });
				pickResult.then(getRelativePath);
			} else {
				vscode.window.showInformationMessage("No files to show.");
			}
		}
		
		// Get the picked item
		function getRelativePath(item: vscode.QuickPickItem): void {
			if (item) {
				const targetPath = item.description;
				const currentItemPath = editor.document.fileName;
				let relativeUrl: string = path.relative(currentItemPath, targetPath);
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