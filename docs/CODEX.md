# Codex Provider Guide

This document describes how to run NanoClaw with the **Codex** provider: authentication, memory, skills, and IPC tooling.

## Install Codex CLI (Host)

To authenticate with a ChatGPT subscription, install the Codex CLI on your host and run `codex login`.

```bash
npm i -g @openai/codex
codex login
```

Codex CLI installation details: https://developers.openai.com/codex/cli

## Authentication

NanoClaw supports two Codex auth modes:

### 1. ChatGPT Subscription (Recommended)

1. Run `codex login` on your host (browser-based sign-in).
2. Copy the generated auth file to the group’s Codex state directory:

```
data/codex/<group>/.codex/auth.json
```

For the main group, use:

```
data/codex/main/.codex/auth.json
```

### 2. OpenAI API Key (Fallback)

Add your key to `.env`:

```bash
OPENAI_API_KEY=sk-...
```

NanoClaw will pass this into the container and map it to Codex’s expected env variables.

## Selecting the Codex Provider

Each registered group can choose a provider in `data/registered_groups.json`:

```json
{
  "Some Group JID": {
    "name": "Some Group",
    "folder": "some-group",
    "trigger": "@Andy",
    "added_at": "2026-02-03T12:00:00.000Z",
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

Defaults:
- `provider`: `claude`
- `approvalPolicy`: `auto`
- `authMethod`: `chatgpt` (falls back to API key if no auth file is found)

## Approval Policy Mapping

Codex supports three approval modes (Auto, Read-only, Full Access). NanoClaw maps your `approvalPolicy` to Codex’s sandbox and approval settings in `config.toml`.

- `auto`: workspace-write with approvals for higher-risk actions
- `readonly`: read-only, no writes
- `full`: danger-full-access, no approvals

See Codex approval modes: https://developers.openai.com/codex/cli/features
See `config.toml` settings: https://developers.openai.com/codex/security

## Memory (CLAUDE.md)

Codex does not natively read memory files. NanoClaw injects memory into the Codex prompt prelude on each run:

- Global memory: `groups/global/CLAUDE.md`
- Group memory: `groups/{name}/CLAUDE.md`

Memory updates:
- “remember this” → write to `groups/{name}/CLAUDE.md`
- “remember this globally” (main group only) → write to `groups/global/CLAUDE.md`

## Filesystem IPC Tools

Codex communicates with NanoClaw via filesystem IPC. It must write JSON files into the group IPC directory inside the container:

- Messages: `/workspace/ipc/messages/*.json`
  ```json
  {"type":"message","chatJid":"<jid>","text":"hello"}
  ```

- Scheduled tasks: `/workspace/ipc/tasks/*.json`
  ```json
  {
    "type":"schedule_task",
    "prompt":"...",
    "schedule_type":"cron",
    "schedule_value":"0 9 * * 1",
    "groupFolder":"<group-folder>",
    "context_mode":"isolated"
  }
  ```

## Codex Skills

Skills are repo-scoped under `.codex/skills/<skill-name>/SKILL.md` with YAML front matter.

```markdown
---
name: setup
description: Run initial NanoClaw setup
---

# Skill instructions...
```

Codex can invoke skills explicitly by typing `$skill-name` or through `/skills`, and can also select skills implicitly based on the description.

See Codex skills docs:
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/skills/create-skill

## /setup Alias

For WhatsApp UX continuity, NanoClaw treats `/setup` as a request to invoke the `$setup` Codex skill when the group provider is `codex`.
