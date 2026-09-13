#!/bin/bash
set -euo pipefail

REPO_URL="https://sufiyan-sabeel.github.io/Phoenix-AI/apt-repo"
KEY_URL="${REPO_URL}/gpg/phoenix.gpg"

echo "Adding PHOENIX APT repository..."

# Download and install signing key
curl -fsSL "${KEY_URL}" | gpg --dearmor -o "${PREFIX}/etc/apt/trusted.gpg.d/phoenix.gpg" 2>/dev/null || \
  curl -fsSL "${KEY_URL}" | apt-key add -

# Add repository
echo "deb ${REPO_URL} stable main" > "${PREFIX}/etc/apt/sources.list.d/phoenix.list"

# Update and install
pkg update -y
pkg install phoenix

echo "PHOENIX installed! Run 'phoenix' to start."
