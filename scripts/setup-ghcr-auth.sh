#!/usr/bin/env bash
set -euo pipefail

REPO="wiwek13/MorpheFlow"

echo "=================================================="
echo " MorpheFlow GHCR Authentication & Secret Setup"
echo "=================================================="

# Check gh CLI installation
if ! command -v gh >/dev/null 2>&1; then
  echo "❌ Error: GitHub CLI ('gh') is not installed. Please install it with: brew install gh"
  exit 1
fi

echo "1. Checking current gh authentication..."
if ! gh auth status >/dev/null 2>&1; then
  echo "❌ Not logged in. Running 'gh auth login'..."
  gh auth login -h github.com -p https -w -s write:packages,read:packages,repo,workflow
else
  echo "✓ gh CLI is logged in."
  SCOPES=$(gh auth status 2>&1 | grep "Token scopes" || true)
  if [[ "$SCOPES" != *"write:packages"* ]]; then
    echo "⚠️ Current token is missing 'write:packages' scope."
    echo "Refreshing token scopes..."
    gh auth refresh -h github.com -s write:packages,read:packages,repo,workflow
  else
    echo "✓ Token already has 'write:packages' scope!"
  fi
fi

echo ""
echo "2. Fetching authenticated token..."
TOKEN=$(gh auth token)
if [[ -z "$TOKEN" ]]; then
  echo "❌ Failed to retrieve authentication token from gh."
  exit 1
fi

echo "3. Storing GHCR_TOKEN repository secret in $REPO..."
echo "$TOKEN" | gh secret set GHCR_TOKEN -R "$REPO"
echo "✓ Successfully configured secret 'GHCR_TOKEN' in $REPO!"

echo ""
echo "4. Testing GHCR Container Packages access..."
USER_LOGIN=$(gh api user --jq .login)
if gh api "users/${USER_LOGIN}/packages?package_type=container" >/dev/null 2>&1; then
  echo "✓ GHCR API access verified! Your workflows can now publish packages without permission errors."
else
  echo "ℹ Note: If package 'morpheflow' does not exist yet, it will be created on the next build."
fi

echo ""
echo "=================================================="
echo " Setup complete! GitHub Actions can now push to ghcr.io."
echo "=================================================="
