#!/usr/bin/env bash
set -euo pipefail

# This script helps resolve merge conflicts from the public upstream repository
# by creating a new branch and guiding the user to open a pull request.

# 1. Ensure local 'main' is up to date
echo "🔄 Switching to 'main' and pulling latest changes from 'origin'..."
git checkout main
git pull origin main

# 2. Create a new branch for the merge
BRANCH_NAME="fix/merge-upstream-$(date +'%Y-%m-%d')"
echo "🌿 Creating a new branch named '${BRANCH_NAME}'..."
if git rev-parse --verify "${BRANCH_NAME}" >/dev/null 2>&1; then
    echo "Branch '${BRANCH_NAME}' already exists. Please delete it or check it out manually."
    exit 1
fi
git checkout -b "${BRANCH_NAME}"

# 3. Add the upstream remote if it doesn't exist
UPSTREAM_URL="https://github.com/google-gemini/gemini-cli.git"
if ! git remote | grep -q "^upstream$"; then
    echo "➕ Adding 'upstream' remote: ${UPSTREAM_URL}"
    git remote add upstream "${UPSTREAM_URL}"
else
    echo "✅ 'upstream' remote already exists."
fi

# 4. Fetch from upstream
echo "⬇️  Fetching latest changes from upstream..."
git fetch upstream main

# 5. Attempt the merge on the new branch
echo "Merging 'upstream/main' into '${BRANCH_NAME}'..."
if git merge upstream/main; then
    echo "✅ Merge successful! No conflicts detected."
    echo "🚀 To finish, push the new branch and create a pull request:"
    echo "   git push --set-upstream origin ${BRANCH_NAME}"
    echo "   gh pr create --title \"chore: Merge upstream changes\" --body \"Merged changes from the public repository.\""
else
    echo "⚠️ Merge conflicts detected!"
    echo ""
    echo "🔧 Please resolve the conflicts in your editor."
    echo "   You can see the conflicting files by running 'git status'."
    echo ""
    echo "   After resolving all conflicts, run the following commands to create a pull request:"
    echo "   git add ."
    echo "   git commit"
    echo "   git push --set-upstream origin ${BRANCH_NAME}"
    echo "   gh pr create --title \"chore: Merge upstream changes (conflicts resolved)\" --body \"Merged changes from the public repository after resolving conflicts.\""
fi
