## Relative path support for Visual Studio Code
Now you can get the relative path to any file in the workspace.

Just press `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`) and select a file.
Alternatively, you can press open command palette `F1` and search for `Relative Path`.

![GIF](https://media.giphy.com/media/3oEduJ5iRksPxpwoXC/giphy.gif)

## How to use
First, you will need to install Visual Studio Code. In the command palette (`Ctrl-Shift-P` or `Cmd-Shift-P`) select `Install Extension` and choose `RelativePath`.

## Important
Your workspace may be really big, so please wait for the initial file list to be created. This will happen only once.

## Options
The following Visual Studio Code settings are available for the RelativePath extension. They can be set in user preferences (`ctrl+,` or `cmd+,`) or workspace settings (.vscode/settings.json).
```javascript
	// An array of glob keys to ignore when searching.
	"relativePath.ignore": [
		"**/node_modules/**",
		"**/*.dll",
		"**/obj/**",
		"**/objd/**"
	],

	// Excludes the extension from the relative path url (Useful for systemjs imports).
	"relativePath.removeExtension": false,

	// Removes the leading ./ character when the path is pointing to a parent folder.
	"relativePath.removeLeadingDot": false
```

## Bugs
Report them [here](https://github.com/jakob101/RelativePath).

## Licence
[MIT](https://github.com/Microsoft/vscode-go/blob/master/LICENSE)