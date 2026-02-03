# Plan: Add OpenAI Codex Provider (Side-by-Side) With ChatGPT Subscription Auth

**Summary**
Add a second provider ("codex") that runs inside the existing container alongside the current Claude flow. Codex runs non-interactive via `codex exec` for WhatsApp triggers, uses filesystem IPC for task/message tooling, and is authenticated via ChatGPT subscription login with API-key fallback. We preserve container isolation and keep Claude as the default provider per group.

**Important Public API/Interface Changes**
1. `RegisteredGroup` adds provider settings:
   - `provider: 'claude' | 'codex'` (default `claude`)
   - `providerConfig?: { codex?: { approvalPolicy: 'auto' | 'readonly' | 'full'; authMethod?: 'chatgpt' | 'api_key' } }`
2. `ContainerInput` includes `provider` and `providerConfig` so the container runner can decide which agent to run.
3. `.env` allowlist expands to include `OPENAI_API_KEY` for API-key fallback.

---

## Phase 1: Provider Selection and Routing

1. **Types**
   - Update `src/types.ts` to include the provider fields and `providerConfig`.
2. **State and Registration**
   - Update group registration and loading to persist `provider` and `providerConfig` in `data/registered_groups.json`.
   - Default new groups to `provider: 'claude'`.
3. **Runtime Routing**
   - Update `src/index.ts` → `runAgent()` to pass provider details to `runContainerAgent`.
   - No change to message loop semantics.

---

## Phase 2: Container Changes (Codex Runtime)

1. **Container Image**
   - Modify `container/Dockerfile` to install the OpenAI Codex CLI (in addition to Claude Code CLI).
   - Keep existing Chromium/curl toolchain; Codex can use shell for web access.

2. **Codex Auth & Config Storage**
   - Add a new per-group mount: `data/codex/{group}/.codex` → `/home/node/.codex`.
   - This aligns with Codex’s default config/auth locations and keeps group isolation on disk.

3. **Agent Runner (Container)**
   - In `container/agent-runner/src/index.ts`, add a provider branch:
     - **Claude path** remains unchanged.
     - **Codex path**:
       - Build a prompt prelude that includes:
         - System identity (NanoClaw agent, WhatsApp context).
         - Instructions for filesystem IPC ("tools").
         - Optional memory context: include `groups/CLAUDE.md` and `groups/{name}/CLAUDE.md` contents to match Claude’s memory behavior.
       - Use `codex exec` to run non-interactive with `cwd=/workspace/group`.
       - Capture stdout and return as `result`.

4. **Codex Config Bootstrapping**
   - On first run, ensure `/home/node/.codex/config.toml` exists.
   - Write minimal config:
     - `approval_policy = "auto"` (per your choice).
     - `preferred_auth_method = "chatgpt"` when subscription flow is selected, else `"api_key"`.

---

## Phase 3: Auth Flows (ChatGPT Subscription + API Key Fallback)

1. **Subscription Login (Primary)**
   - Update `.claude/skills/setup/SKILL.md` to add OpenAI section:
     - If subscription auth selected:
       - Run `codex login` on host (browser-based).
       - For headless environments, allow device auth.
       - Copy `~/.codex/auth.json` into `data/codex/main/.codex/auth.json` (seed for main group).
   - On first Codex run, if no auth is present in mounted `/home/node/.codex`, error with a clear message.

2. **API Key Fallback**
   - Extend the `.env` allowlist in `src/container-runner.ts` to include `OPENAI_API_KEY`.
   - If `OPENAI_API_KEY` exists and auth file does not, Codex will authenticate via API key per preferred auth config.

---

## Phase 4: Filesystem IPC “Tools” (Codex)

1. **Documented IPC Protocol**
   - Add a short “Codex Tools” section (likely in `docs/SPEC.md`) that documents:
     - `/workspace/ipc/messages/*.json` format for sending messages.
     - `/workspace/ipc/tasks/*.json` for scheduling/pause/resume/cancel.

2. **Prompt Instructions**
   - Codex prompt prelude includes a concise JSON example for send-message and schedule-task.

---

## Phase 5: Acceptance & Compatibility

1. **Backward Compatibility**
   - Claude remains the default provider.
   - No changes to existing group behavior unless provider is switched.

2. **Operational Defaults**
   - `provider = 'claude'`
   - `approval_policy = "auto"` for Codex
   - `preferred_auth_method = "chatgpt"` if subscription is configured; else `api_key`

---

## Test Cases and Scenarios

1. **Claude Path Unchanged**
   - Start app; ensure Claude still responds in main and a group with provider unset.
2. **Codex Path Basic**
   - Set one group to `provider: codex`.
   - Send `@Assistant` message → verify codex response is returned.
3. **Subscription Auth**
   - Run `codex login` on host.
   - Verify `/home/node/.codex/auth.json` is mounted and Codex runs without API key.
4. **API Key Fallback**
   - Remove auth.json, set `OPENAI_API_KEY` in `.env`, run again; verify response.
5. **Filesystem IPC**
   - Ask Codex to schedule a task and verify file creation in `/workspace/ipc/tasks`.
   - Confirm host picks it up and schedules in DB.

---

## Assumptions and Defaults

- Codex will be run in non-interactive mode via `codex exec`.
- Codex local state is stored under `~/.codex` and can be relocated with `CODEX_HOME`; we will mount per-group state at `/home/node/.codex`.
- Approval mode will be `auto` (your choice).
- Tooling for Codex will be filesystem IPC only (no MCP server).
- Conversation continuity for Codex relies on NanoClaw’s existing “missed messages” prompt plus injected CLAUDE.md memory, not Codex session resumption.
