## Relative Path Extension for VS Code

> Get the relative path to any file in your workspace

Press `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`) and start typing the file you want.

![GIF](https://media.giphy.com/media/3oEduJ5iRksPxpwoXC/giphy.gif)

<br/>

## How to use

1. [Install the extension](https://marketplace.visualstudio.com/items?itemName=jakob101.RelativePath&ssr=false#overview)
2. Press `Ctrl+Shift+H` (Mac: `Cmd+Shift+H`) and start typing the file you want.
    - The file you want will appear as you type
3. 🪄 Select your file from the dropdown!

<br/>

## Options

The following settings are customizable. **You likely do not need these, but if you do, here are your options**

They can be set in user preferences (`ctrl+,` or `cmd+,`) or workspace settings (`.vscode/settings.json`).

```javascript
// A glob by which to filter results
"relativePath.includeGlob": "/**/*.*",

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
	".js",
	".ts"
],

// For performance optimization the default limit for quick filter is 1,000 files.
// Extending this may lead to performance issues
"relativePath.searchCountLimit": 1000,

// Removes the leading ./ character when the path is pointing to a parent folder.
"relativePath.removeLeadingDot": true,

//  "Omit path parts by matched Regular Expressions
"relativePath.omitParts": [
	"\\/index$"
],

```

<br/>

## Performance Information

### In Multi root workspaces:

Everytime you switch to a file from a different folder the files in that folder are indexed and
cached to improve search performance. If you have multiple large folders part of a workspace
frequent switches between folders might slow you down.

### In Single project workspace:

The caching of the filelist in the project happens only once. If your workspace contains a lot of files
please wait for the initial file list to be created.

## Bugs

Report them [here](https://github.com/jakob101/RelativePath).

## Licence

[MIT](https://github.com/Microsoft/vscode-go/blob/master/LICENSE)
