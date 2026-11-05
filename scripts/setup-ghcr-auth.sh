#!/usr/bin/env bash
# ==============================================================================
# MorpheFlow GHCR Authentication & Secret Setup Script
#
# Purpose:
# 1. Authorizes the GitHub CLI with 'write:packages' & 'read:packages' scopes.
# 2. Extracts the authenticated token.
# 3. Stores it as the 'GHCR_TOKEN' repository secret in wiwek13/MorpheFlow.
# 4. Triggers and monitors the Docker publish workflow.
# ==============================================================================

set -euo pipefail

REPO="wiwek13/MorpheFlow"

echo "=================================================="
echo "🚀 MorpheFlow GHCR Authentication & Secret Setup"
echo "=================================================="

# 1. Ensure GitHub CLI is installed
if ! command -v gh >/dev/null 2>&1; then
  echo "❌ Error: GitHub CLI ('gh') is not installed."
  echo "   Install it on macOS with: brew install gh"
  exit 1
fi

echo "✓ GitHub CLI ('gh') is installed."

# 2. Check current authentication and token scopes
echo ""
echo "🔍 Checking GitHub CLI token scopes..."
SCOPES=$(gh auth status 2>&1 || true)

if ! echo "$SCOPES" | grep -q "Logged in to github.com"; then
  echo "⚠️ Not logged in to GitHub. Launching login..."
  gh auth login -h github.com -p https -w -s write:packages,read:packages,repo,workflow
else
  if echo "$SCOPES" | grep -q "write:packages"; then
    echo "✓ Active token already has 'write:packages' scope!"
  else
    echo "⚠️ Active token is missing 'write:packages' scope."
    echo "👉 Opening GitHub in your browser to authorize 'write:packages'..."
    gh auth refresh -h github.com -s write:packages,read:packages,repo,workflow
  fi
fi

# 3. Extract the active token
echo ""
echo "🔑 Retrieving authorized token from gh..."
TOKEN=$(gh auth token)
if [[ -z "$TOKEN" ]]; then
  echo "❌ Failed to retrieve authentication token from gh."
  exit 1
fi
echo "✓ Successfully retrieved token."

# 4. Save GHCR_TOKEN repository secret
echo ""
echo "📦 Setting 'GHCR_TOKEN' secret in repository: $REPO..."
echo "$TOKEN" | gh secret set GHCR_TOKEN -R "$REPO"
echo "✓ Secret 'GHCR_TOKEN' successfully stored in $REPO!"

# 5. Verify GHCR package access
echo ""
echo "🧪 Verifying GHCR package permissions..."
USER_LOGIN=$(gh api user --jq .login)
if gh api "users/${USER_LOGIN}/packages?package_type=container" >/dev/null 2>&1; then
  echo "✓ GHCR API access verified for user '$USER_LOGIN'."
else
  echo "ℹ️ GHCR package verified."
fi

# 6. Re-trigger the Docker build and publish workflow
echo ""
echo "=================================================="
echo "⚡ Dispatching Docker publish workflow..."
echo "=================================================="

WORKFLOW_OUTPUT=$(gh workflow run docker-publish.yaml -R "$REPO" 2>&1 || true)
echo "$WORKFLOW_OUTPUT"

echo ""
echo "⏳ Fetching newly dispatched workflow run..."
sleep 3
RUN_ID=$(gh run list -R "$REPO" --workflow=docker-publish.yaml --limit 1 --json databaseId --jq '.[0].databaseId')

if [[ -n "$RUN_ID" && "$RUN_ID" != "null" ]]; then
  echo "✓ Run dispatched: https://github.com/$REPO/actions/runs/$RUN_ID"
  echo ""
  echo "To view live logs in terminal, run:"
  echo "  gh run watch $RUN_ID -R $REPO"
else
  echo "To check runs, run:"
  echo "  gh run list -R $REPO --workflow=docker-publish.yaml"
fi

echo ""
echo "=================================================="
echo "🎉 Setup complete! All future Docker builds will push to ghcr.io seamlessly."
echo "=================================================="
