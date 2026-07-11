#!/bin/bash
set -e

# Usage: GITHUB_USERNAME=user GITHUB_TOKEN=token REPO_NAME=mcp-deep-research-server ./publish.sh

USERNAME=${GITHUB_USERNAME:-""}
TOKEN=${GITHUB_TOKEN:-""}
REPO_NAME=${REPO_NAME:-"mcp-deep-research-server"}

if [ -z "$USERNAME" ] || [ -z "$TOKEN" ]; then
  echo "❌ Missing env vars"
  echo "Usage: GITHUB_USERNAME=youruser GITHUB_TOKEN=your_pat REPO_NAME=mcp-deep-research-server ./publish.sh"
  echo ""
  echo "Create a PAT at https://github.com/settings/tokens/new (classic, scope: repo)"
  exit 1
fi

echo "→ Adding remote https://github.com/$USERNAME/$REPO_NAME.git"
git remote remove origin 2>/dev/null || true
git remote add origin https://$USERNAME:$TOKEN@github.com/$USERNAME/$REPO_NAME.git

echo "→ Pushing main branch"
git push -u origin main

echo "→ Cleaning token from remote URL"
git remote set-url origin https://github.com/$USERNAME/$REPO_NAME.git

echo "✅ Published! https://github.com/$USERNAME/$REPO_NAME"
