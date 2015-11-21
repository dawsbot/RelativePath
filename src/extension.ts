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
			return; // No open text editor
		}
		
		let documents: Thenable<vscode.Uri[]> = vscode.workspace.findFiles('**/**', '**/node_modules/**', 10);
		documents.then(
			(value: vscode.Uri[]) => {
				if (value) {
					let paths: vscode.QuickPickItem[] = value.map((val: vscode.Uri) => {
						let item: vscode.QuickPickItem = { description: val.fsPath, label: val.fsPath.split(path.sep).pop() };
						return item;
					});
					vscode.window.showQuickPick(paths, { matchOnDescription: true, placeHolder: "Filename" });
				} else {
					vscode.window.showInformationMessage("No files to show.");
				}
			},
			(rejected: any) => {
				console.log("Rejected message: " + rejected);
			}
		);
		
		var uri = vscode.workspace.asRelativePath(editor.document.uri);

		// Display a message box to the user
		// vscode.window.showInformationMessage('Current uri: ' + uri);
	});
	
	context.subscriptions.push(disposable);
}