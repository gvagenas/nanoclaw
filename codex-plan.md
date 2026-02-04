# Plan: Add Codex Provider + Codex Skills + Memory Parity

**Summary**
Add a `codex` provider alongside `claude`, with per‑group auth and configuration, explicit Codex memory loading from `CLAUDE.md` files, and a full migration of Claude skills into `.codex/skills` following the Codex skills spec. Maintain `/setup` as a UX alias that maps to Codex’s `$setup` skill. Update user‑facing docs in `docs/CODEX.md`, `docs/SPEC.md`, and `README.md`.

**Public API / Interface Changes**
1. `RegisteredGroup` adds:
   - `provider: 'claude' | 'codex'` (default `claude`)
   - `providerConfig?: { codex?: { approvalPolicy: 'auto' | 'readonly' | 'full'; authMethod?: 'chatgpt' | 'api_key' } }`
2. `ContainerInput` includes `provider` and `providerConfig`.
3. `.env` allowlist includes `OPENAI_API_KEY` (and `CODEX_API_KEY`).
4. New repo‑scoped skill location: `.codex/skills/*` containing `SKILL.md` files with YAML front matter (`name`, `description`).

---

## Phase 1: Provider Selection and Routing

1. Update types in `src/types.ts`.
2. Persist `provider` and `providerConfig` in `data/registered_groups.json`.
3. Pass provider settings from `src/index.ts` and `src/task-scheduler.ts` to `runContainerAgent`.

---

## Phase 2: Container Support for Codex

1. Update `container/Dockerfile` to install Codex CLI (pin version if desired).
2. Add per‑group mount: `data/codex/{group}/.codex` → `/home/node/.codex`.
3. Set `CODEX_HOME=/home/node/.codex` in container env.
4. In `container/agent-runner/src/index.ts`, add Codex branch:
   - Build a prompt prelude containing:
     - System identity and WhatsApp context
     - Filesystem IPC instructions
     - Injected memory content from `groups/global/CLAUDE.md` and `groups/{name}/CLAUDE.md` if present
   - Run `codex exec` with `cwd=/workspace/group`
   - Capture stdout as response

---

## Phase 3: Memory Parity for Codex

1. When launching Codex, read `groups/global/CLAUDE.md` and `groups/{name}/CLAUDE.md` on the host, inject into prelude.
2. Implement “remember this” logic for Codex:
   - If user says “remember this”, Codex writes to `groups/{name}/CLAUDE.md`.
   - If user says “remember this globally” (main group only), Codex writes to `groups/global/CLAUDE.md`.

---

## Phase 4: Auth Flows

1. Subscription auth:
   - Document `codex login` in `docs/CODEX.md`.
   - Seed `data/codex/main/.codex/auth.json` for main group.
2. API key fallback:
   - Allow `OPENAI_API_KEY` into container env.
   - If `auth.json` missing and key present, use API key.

---

## Phase 5: Codex Skills Migration

1. Create `.codex/skills/<skill-name>/SKILL.md` for every Claude skill.
2. Each `SKILL.md` must include YAML front matter with `name` and `description`.
3. Convert Claude‑specific instructions to Codex equivalents:
   - `claude` CLI → `codex` CLI
   - Claude auth tokens → Codex auth (`auth.json` or `OPENAI_API_KEY`)
4. Add `/setup` WhatsApp alias:
   - If provider is `codex`, map `/setup` → `$setup` skill invocation.
   - Keep `/setup` for Claude unchanged.

---

## Phase 6: Documentation (User‑Facing)

1. Add `docs/CODEX.md`:
   - Auth setup (ChatGPT login + API key fallback)
   - Skills layout and triggers (`$skill`, `/skills`)
   - IPC protocol summary
   - Memory loading and “remember this”
2. Add a short reference section to `docs/SPEC.md` linking to `docs/CODEX.md`.
3. Update `README.md`:
   - Mention Codex as a supported provider
   - Point to `docs/CODEX.md` for setup/auth
   - Summarize how to select provider per group

---

## Test Cases and Scenarios

1. **Claude unchanged**: Provider unset or `claude` still works.
2. **Codex basic**: Group set to `codex`, responds to message.
3. **Memory loading**: `groups/global/CLAUDE.md` and `groups/{name}/CLAUDE.md` content appears in Codex responses.
4. **Remember write**: Codex writes to `groups/{name}/CLAUDE.md` when asked.
5. **Subscription auth**: `auth.json` present → Codex runs without API key.
6. **API key fallback**: No `auth.json`, `OPENAI_API_KEY` set → Codex runs.
7. **Skills**: `$setup` works in Codex; `/setup` alias maps to `$setup`.

---

## Assumptions and Defaults

- Default provider remains `claude`.
- Codex default auth method: ChatGPT subscription, fallback to API key.
- Codex approval policy default: `auto`.
- Skills are repo‑scoped under `.codex/skills`.
- Codex memory is loaded explicitly via prelude injection.
