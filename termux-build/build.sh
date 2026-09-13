#!/bin/bash
set -euo pipefail

# PHOENIX Termux .deb Build Script
# Produces a real .deb package for Termux

PACKAGE_NAME="phoenix"
VERSION="${1:-0.1.0}"
ARCH="aarch64"
TERMUX_PREFIX="/data/data/com.termux/files/usr"

echo "=== Building PHOENIX Termux Package v${VERSION} ==="

# Setup build directory
BUILD_DIR="phoenix-${VERSION}"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}/DEBIAN"
mkdir -p "${BUILD_DIR}${TERMUX_PREFIX}/bin"
mkdir -p "${BUILD_DIR}${TERMUX_PREFIX}/lib/phoenix"
mkdir -p "${BUILD_DIR}${TERMUX_PREFIX}/share/phoenix"

# Build the CLI
echo "Building CLI..."
cd ../apps/cli && pnpm build
cd ../../termux-build

# Copy built files
cp ../apps/cli/dist/index.js "${BUILD_DIR}${TERMUX_PREFIX}/lib/phoenix/cli.js"
cp ../apps/server/dist/index.js "${BUILD_DIR}${TERMUX_PREFIX}/lib/phoenix/server.js"

# Create wrapper script
cat > "${BUILD_DIR}${TERMUX_PREFIX}/bin/phoenix" << 'WRAPPER'
#!/data/data/com.termux/files/usr/bin/bash
exec node "${TERMUX_PREFIX}/lib/phoenix/cli.js" "$@"
WRAPPER
chmod +x "${BUILD_DIR}${TERMUX_PREFIX}/bin/phoenix"

# Copy config
cp -r ../apps/web/dist "${BUILD_DIR}${TERMUX_PREFIX}/share/phoenix/web"

# Create control file
cat > "${BUILD_DIR}/DEBIAN/control" << EOF
Package: ${PACKAGE_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: Umaiz Sufiyan <dev@phoenix.ai>
Depends: nodejs, git
Section: utils
Priority: optional
Homepage: https://github.com/sufiyan-sabeel/Phoenix-AI
Description: PHOENIX - Open-source AI agent platform for terminal, Android, and web
 PHOENIX provides a cross-surface AI agent experience across terminal CLI/TUI,
 Android/Termux environment, and browser-based chat workspace.
 Features include multi-provider AI, tool calling, MCP connectors, memory system,
 Telegram bot, voice interaction, and direct ADB device control.
EOF

# Build .deb
dpkg-deb --build "${BUILD_DIR}" "phoenix_${VERSION}_${ARCH}.deb"

echo "=== Package built: phoenix_${VERSION}_${ARCH}.deb ==="
echo "Install with: dpkg -i phoenix_${VERSION}_${ARCH}.deb"
