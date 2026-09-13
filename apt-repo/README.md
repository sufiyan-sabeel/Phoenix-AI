# PHOENIX APT Repository

This directory hosts the signed APT repository for PHOENIX Termux distribution.

## Adding the repository
```bash
pkg install curl
curl -fsSL https://sufiyan-sabeel.github.io/Phoenix-AI/apt-repo/setup.sh | bash
pkg install phoenix
```

## Repository structure
- `dists/stable/main/binary-aarch64/` - Package files
- `gpg/` - Repository signing keys
