#!/bin/sh
# Build the app and publish the result to the gh-pages branch, which GitHub Pages serves.
# The branch holds only the built files and is replaced on every deploy.
set -e
cd "$(dirname "$0")/.."
remote=$(git remote get-url origin)
name=$(git config user.name)
email=$(git config user.email)
npm run build
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Deploy $(date +%Y-%m-%d\ %H:%M)"
git push -q -f "$remote" gh-pages
rm -rf .git
echo "Deployed."
