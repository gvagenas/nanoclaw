---
name: debug
description: Debug container agent issues for Codex users. Covers logs, mounts, auth, and common errors.
---

# NanoClaw Debugging (Codex)

This guide covers debugging the containerized agent execution system with Codex.

## Architecture Overview

```
Host (macOS)                          Container (Linux VM)
─────────────────────────────────────────────────────────────
src/container-runner.ts               container/agent-runner/
    │                                      │
    │ spawns Apple Container               │ runs Claude or Codex
    │ with volume mounts                   │ inside /workspace/group
    │                                      │
    ├── data/env/env ──────────────> /workspace/env-dir/env
    ├── groups/{folder} ───────────> /workspace/group
    ├── data/ipc/{folder} ────────> /workspace/ipc
    ├── data/sessions/{folder}/.claude/ ──> /home/node/.claude/
    ├── data/codex/{folder}/.codex/ ─────> /home/node/.codex/
    └── (main only) project root ──> /workspace/project
```

## Log Locations

| Log | Location | Content |
|-----|----------|---------|
| Main app logs | `logs/nanoclaw.log` | Host-side WhatsApp, routing, container spawning |
| Main app errors | `logs/nanoclaw.error.log` | Host-side errors |
| Container run logs | `groups/{folder}/logs/container-*.log` | Per-run: input, mounts, stderr, stdout |

## Common Issues

### 1) Codex auth missing

If you see an auth error, ensure one of these is set:

**ChatGPT subscription:**
```bash
codex login
mkdir -p data/codex/main/.codex
cp ~/.codex/auth.json data/codex/main/.codex/auth.json
```

**API key fallback:**
```bash
echo "OPENAI_API_KEY=sk-..." >> .env
```

### 2) Environment Variables Not Passing

Apple Container loses `-e` environment vars when using `-i`. NanoClaw mounts a filtered `.env` at `/workspace/env-dir/env` and sources it in the container.

Allowed variables:
```
CLAUDE_CODE_OAUTH_TOKEN
ANTHROPIC_API_KEY
OPENAI_API_KEY
```

### 3) Mount Issues

Apple Container quirks:
- Only mounts directories, not individual files
- Read-only mounts must use `--mount ... readonly` (not `:ro`)

Check mounts:
```bash
container run --rm --entrypoint /bin/bash nanoclaw-agent:latest -c 'ls -la /workspace/'
```

### 4) Codex command failures

Codex is executed via:
```bash
codex exec
```

Check stderr in `groups/{folder}/logs/container-*.log` for errors.
