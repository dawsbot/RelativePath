## Unreleased

-   The picker now also honors VS Code's built-in `files.exclude` and `search.exclude` by default, so you no longer have to duplicate those globs in `relativePath.ignore`. Tune this with the new `relativePath.useBuiltInExcludes` setting: `both` (default), `files`, `search`, or `none` to restore the previous behavior of using only `relativePath.ignore`. (#31)

## 1.7.0

Big-workspace release: scanning is now bounded, filters are enforced everywhere, and defaults got a refresh.

-   New `relativePath.maxFilesCached` setting (default 100,000) caps how many files are scanned and cached, so huge monorepos no longer stall the picker or pin memory. The picker says when the list was capped. Set to 0 for the old unlimited behavior. (#74)
-   Newly created files now respect `relativePath.ignore`, `relativePath.includeGlob`, and the cache cap. Previously an `npm install` could flood the picker with node_modules paths. (#80)
-   Changing `relativePath.includeGlob` takes effect immediately instead of requiring a reload. (#80)
-   `relativePath.ignore` now excludes common build output by default: `dist`, `build`, `coverage`, `.turbo`, `.cache`, `.venv`, `__pycache__`. If you import from those folders, override the setting. (#80)
-   `relativePath.searchCountLimit` default raised from 1,000 to 10,000, so most projects get the one-step filter picker. (#80)

## 1.2.0

-   Now pre-filtering when a workspace has more than 1000 files.

## 1.1.0

-   Multi-workspace support.

## 1.0.0.

-   First stable release.
