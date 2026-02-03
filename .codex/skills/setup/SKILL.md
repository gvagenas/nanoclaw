---
name: setup
description: Run initial NanoClaw setup for Codex users. Use to install deps, configure Codex auth, build the container image, and authenticate WhatsApp.
---

# NanoClaw Setup (Codex)

This is the Codex-compatible setup flow. It mirrors the Claude Code `/setup` skill but is designed for Codex CLI usage.

## Quick Path

If you just want the scripted flow:
```bash
npm run setup:codex
```

## Manual Steps

### 1) Install Dependencies
```bash
npm install
```

### 2) Install Container Runtime

Check what's available:
```bash
echo "Platform: $(uname -s)"
which container && echo "Apple Container: installed" || echo "Apple Container: not installed"
which docker && docker info >/dev/null 2>&1 && echo "Docker: installed and running" || echo "Docker: not installed or not running"
```

If neither Apple Container nor Docker is available, install one first:
- Apple Container (macOS): https://github.com/apple/container/releases
- Docker (macOS/Linux): https://docker.com/products/docker-desktop

### 3) Configure Codex Authentication

**ChatGPT subscription login (recommended):**
```bash
codex login
mkdir -p data/codex/main/.codex
cp ~/.codex/auth.json data/codex/main/.codex/auth.json
```

**API key fallback:**
```bash
echo "OPENAI_API_KEY=sk-..." >> .env
```

### 4) Build Container Image
```bash
./container/build.sh
```

### 5) WhatsApp Authentication
```bash
npm run auth
```
Scan the QR code in WhatsApp.

### 6) Register Main Channel

Add your main group to `data/registered_groups.json`. Example:
```json
{
  "1234567890@g.us": {
    "name": "My Main Chat",
    "folder": "main",
    "trigger": "@Andy",
    "added_at": "2026-02-03T12:00:00Z",
    "provider": "codex",
    "providerConfig": {
      "codex": {
        "approvalPolicy": "auto",
        "authMethod": "chatgpt"
      }
    }
  }
}
```

### 7) Start NanoClaw
```bash
npm run dev
```
