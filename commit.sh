#!/usr/bin/env bash
# Usage: ./commit.sh "your commit message"
# Commits all modified submodules first, then the outer repo.
set -e

MSG="${1:-chore: update}"

# Commit each submodule that has uncommitted changes
for dir in apps/web apps/server apps/extension packages/shared; do
  if [ -d "$dir/.git" ] || git -C "$dir" rev-parse --git-dir &>/dev/null 2>&1; then
    if ! git -C "$dir" diff --quiet || ! git -C "$dir" diff --cached --quiet || [ -n "$(git -C "$dir" ls-files --others --exclude-standard)" ]; then
      echo "→ Committing submodule: $dir"
      git -C "$dir" add -A
      git -C "$dir" commit -m "$MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>" || true
    fi
  fi
done

# Stage any updated submodule references + other root-level changes
git add -A
if ! git diff --cached --quiet; then
  echo "→ Committing outer repo"
  git commit -m "$MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
else
  echo "→ Outer repo: nothing to commit"
fi
