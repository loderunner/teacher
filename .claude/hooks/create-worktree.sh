#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
NAME=$(echo "$INPUT" | jq -r '.name')
REPO_PATH="$CLAUDE_PROJECT_DIR"
WORKTREE_PATH="${REPO_PATH}/.claude/worktrees/${NAME}"
BRANCH="worktree-${NAME}"

# Create the git worktree — redirect git output away from stdout!
mkdir -p "${REPO_PATH}/.claude/worktrees"
git worktree add -b "$BRANCH" "$WORKTREE_PATH" HEAD 1>&2

cd "$WORKTREE_PATH"
pnpm install 1>&2
ln -s ../../../.vercel 1>&2
ln -s ../../../.env.local 1>&2

echo "$WORKTREE_PATH"