## Relative path support for Visual Studio Code
Now you can get the relative path to any file in the workspace.

Just press `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`) and select a file. If your workspace has more than 1000 files, you will be prompted to filter that list first.
Alternatively, you can press open command palette `F1` and search for `Relative Path`.

![GIF](https://media.giphy.com/media/3oEduJ5iRksPxpwoXC/giphy.gif)

## How to use
First, you will need to install Visual Studio Code. In the command palette (`Ctrl-Shift-P` or `Cmd-Shift-P`) select `Install Extension` and choose `RelativePath`.

## Important

### In Multi root workspaces:

Everytime you switch to a file from a different folder the files in that folder are indexed and
cached to improve search performance. If you have multiple large folders part of a workspace
frequent switches between folders might slow you down.

### In Single project workspace:
The caching of the filelist in the project happens only once. If your workspace contains a lot of files
please wait for the initial file list to be created.

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

	// An array of extensions to exclude from the relative path url (Useful for used with Webpack or when importing files of mixed types)
	"relativePath.excludedExtensions": [
		".js"
	],
```

## Bugs
Report them [here](https://github.com/jakob101/RelativePath).

## Licence
[MIT](https://github.com/Microsoft/vscode-go/blob/master/LICENSE)