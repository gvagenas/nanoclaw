#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "NanoClaw Codex Setup"
echo "===================="

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required (>=20)."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required."
  exit 1
fi

echo ""
echo "1) Installing dependencies..."
npm install

echo ""
echo "2) Checking container runtime..."
HAS_CONTAINER=0
if command -v container >/dev/null 2>&1; then
  HAS_CONTAINER=1
  echo "Apple Container: installed"
elif command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    HAS_CONTAINER=1
    echo "Docker: installed and running"
  else
    echo "Docker: installed but not running"
  fi
else
  echo "No container runtime found."
fi

if [ "$HAS_CONTAINER" -ne 1 ]; then
  echo ""
  echo "Please install Apple Container (macOS) or Docker (macOS/Linux) and try again."
  exit 1
fi

echo ""
echo "3) Building the NanoClaw container image..."
./container/build.sh

echo ""
read -r -p "4) Configure Codex auth now? (y/N) " SETUP_CODEX
if [[ "$SETUP_CODEX" =~ ^[Yy]$ ]]; then
  if ! command -v codex >/dev/null 2>&1; then
    echo "Codex CLI not found. Install it with: npm install -g @openai/codex"
  else
    echo "Running: codex login"
    codex login || true
    if [ -f "$HOME/.codex/auth.json" ]; then
      mkdir -p data/codex/main/.codex
      cp "$HOME/.codex/auth.json" data/codex/main/.codex/auth.json
      echo "Seeded data/codex/main/.codex/auth.json"
    else
      echo "Auth file not found at ~/.codex/auth.json. You can copy it later."
    fi
  fi
else
  echo "Skipping Codex auth setup."
fi

echo ""
read -r -p "5) Start WhatsApp auth now? (y/N) " SETUP_WA
if [[ "$SETUP_WA" =~ ^[Yy]$ ]]; then
  npm run auth
else
  echo "Skipping WhatsApp auth. Run 'npm run auth' later."
fi

echo ""
echo "Next steps:"
echo "- Register your main group in data/registered_groups.json"
echo "- Set provider to codex for that group"
echo "- Start NanoClaw with: npm run dev (or your launchd service)"
