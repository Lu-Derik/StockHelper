#!/usr/bin/env bash
# Usage: ./commit.sh "your commit message"
set -e

MSG="${1:-chore: update}"

git add -A
if ! git diff --cached --quiet; then
  git commit -m "$MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
else
  echo "Nothing to commit."
fi
