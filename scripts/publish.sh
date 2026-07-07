#!/usr/bin/env bash
#
# publish.sh: cut a new RelativePath release in one shot.
#   1. pick major / minor / patch
#   2. bump version, commit, tag
#   3. push tag to GitHub and create the release
#   4. build the VSIX and attach it to the release
#   5. walk you through the manual Marketplace upload
#
# Run it from anywhere inside the repo:  ./scripts/publish.sh
#
set -euo pipefail

# ---- config -----------------------------------------------------------------
REMOTE="origin"                      # git remote that hosts releases
REPO="dawsbot/RelativePath"          # owner/name for the gh CLI
RELEASE_BRANCH="master"              # releases are cut from here
PUBLISHER="jakob101"
MARKETPLACE_URL="https://marketplace.visualstudio.com/manage/publishers/${PUBLISHER}"

# ---- helpers ----------------------------------------------------------------
bold() { printf "\033[1m%s\033[0m\n" "$1"; }
die()  { printf "\033[31mError:\033[0m %s\n" "$1" >&2; exit 1; }

# ---- move to repo root ------------------------------------------------------
cd "$(git rev-parse --show-toplevel)" || die "not inside a git repository"

# ---- preflight checks -------------------------------------------------------
command -v gh  >/dev/null || die "gh (GitHub CLI) is not installed"
command -v npm >/dev/null || die "npm is not installed"
gh auth status >/dev/null 2>&1 || die "not logged in to gh. Run: gh auth login"

branch="$(git branch --show-current)"
[ "$branch" = "$RELEASE_BRANCH" ] || \
    die "on '$branch', but releases must come from '$RELEASE_BRANCH'. Run: git checkout $RELEASE_BRANCH"

[ -z "$(git status --porcelain)" ] || die "working tree is not clean. Commit or stash first."

bold "Fetching $REMOTE..."
git fetch --quiet "$REMOTE"
[ -z "$(git log --oneline "${REMOTE}/${RELEASE_BRANCH}..${RELEASE_BRANCH}")" ] || \
    die "local $RELEASE_BRANCH has commits not on ${REMOTE}/${RELEASE_BRANCH}. Push or merge them first."
[ -z "$(git log --oneline "${RELEASE_BRANCH}..${REMOTE}/${RELEASE_BRANCH}")" ] || \
    die "local $RELEASE_BRANCH is behind ${REMOTE}/${RELEASE_BRANCH}. Run: git pull --ff-only"

[ -d node_modules ] || { bold "Installing dependencies..."; npm install; }

# ---- choose the bump --------------------------------------------------------
current="$(node -p "require('./package.json').version")"
IFS=. read -r MA MI PA <<< "$current"
echo
bold "Current version: $current"
printf "  1) patch -> %s.%s.%s   (bug fixes)\n"       "$MA" "$MI" "$((PA + 1))"
printf "  2) minor -> %s.%s.0   (new features)\n"     "$MA" "$((MI + 1))"
printf "  3) major -> %s.0.0   (breaking changes)\n"  "$((MA + 1))"
printf "Pick 1/2/3 (or q to quit): "
read -r choice
case "$choice" in
    1) BUMP="patch" ;;
    2) BUMP="minor" ;;
    3) BUMP="major" ;;
    q | Q) echo "Aborted."; exit 0 ;;
    *) die "invalid choice: $choice" ;;
esac

printf "Release a %s bump from %s? [y/N]: " "$BUMP" "$current"
read -r confirm
[ "$confirm" = "y" ] || [ "$confirm" = "Y" ] || { echo "Aborted."; exit 0; }

# ---- bump + tag -------------------------------------------------------------
# --ignore-scripts skips this repo's `postversion` hook so THIS script owns the
# push/release flow (the hook would push to the branch's upstream and create the
# release against gh's default repo, which are not guaranteed to be $REMOTE/$REPO).
BUMPED=0
recover() {
    [ "$BUMPED" = "1" ] || return
    echo
    printf "\033[31mFailed after the version bump.\033[0m To undo the local commit + tag:\n"
    echo "  git tag -d $TAG && git reset --hard HEAD~1"
}
trap recover ERR

TAG="$(npm version "$BUMP" --ignore-scripts -m "release: v%s")"
BUMPED=1
VERSION="${TAG#v}"
bold "Bumped to $TAG"

# ---- push, release, build, attach ------------------------------------------
bold "Pushing $RELEASE_BRANCH + $TAG to $REMOTE..."
git push --follow-tags "$REMOTE" "$RELEASE_BRANCH"

bold "Creating GitHub release $TAG..."
gh release create "$TAG" --repo "$REPO" --title "$TAG" --generate-notes

bold "Building the VSIX..."
npm run package
VSIX="RelativePath-${VERSION}.vsix"
[ -f "$VSIX" ] || die "expected $VSIX but the build did not produce it"

bold "Attaching $VSIX to release $TAG..."
gh release upload "$TAG" "$VSIX" --repo "$REPO" --clobber

trap - ERR   # past the risky part

# ---- manual Marketplace step ------------------------------------------------
echo
bold "GitHub release is live with the VSIX attached:"
echo "    https://github.com/${REPO}/releases/tag/${TAG}"
echo
bold ">>> NOW upload to the VS Code Marketplace (manual step) <<<"
echo "    1. Opening: $MARKETPLACE_URL"
echo "    2. Find 'Relative Path' -> ... menu -> Update"
echo "    3. Upload this file:"
printf "         \033[1m%s/%s\033[0m\n" "$(pwd)" "$VSIX"
command -v open >/dev/null && open "$MARKETPLACE_URL" || true
echo
bold "Done. v$VERSION is tagged, released on GitHub, and ready to publish."
