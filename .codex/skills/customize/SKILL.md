---
name: customize
description: Add capabilities or modify NanoClaw behavior for Codex users. Use to add channels, change triggers, add integrations, or adjust routing.
---

# NanoClaw Customization (Codex)

This skill helps users add capabilities or modify behavior. Ask clarifying questions directly before making changes.

## Workflow

1. Understand the request (ask clarifying questions)
2. Plan the changes (identify files to modify)
3. Implement changes directly in code
4. Tell the user how to verify

## Key Files

| File | Purpose |
|------|---------|
| `src/config.ts` | Assistant name, trigger pattern, directories |
| `src/index.ts` | Message routing, WhatsApp connection, agent invocation |
| `src/db.ts` | Database initialization and queries |
| `src/types.ts` | TypeScript interfaces |
| `src/whatsapp-auth.ts` | Standalone WhatsApp authentication script |
| `.mcp.json` | MCP server configuration (reference) |
| `groups/CLAUDE.md` | Global memory/persona |

## Common Customization Patterns

### Adding a New Input Channel (e.g., Telegram, Slack, Email)

Questions to ask:
- Which channel?
- Same trigger word or different?
- Same memory hierarchy or separate?
- Should messages from this channel go to existing groups or new ones?

Implementation pattern:
1. Add connection and message handling in `src/index.ts`
2. Store messages in the database (update `src/db.ts` if needed)
3. Ensure responses route back to correct channel

### Changing Assistant Behavior

Questions to ask:
- What aspect? (name, trigger, persona, response style)
- Apply to all groups or specific ones?

Simple changes → edit `src/config.ts`
Persona changes → edit `groups/CLAUDE.md`
Per-group behavior → edit specific group's `CLAUDE.md`

### Adding New Commands

Questions to ask:
- What should the command do?
- Available in all groups or main only?

Implementation:
1. Add command handling in `processMessage()` in `src/index.ts`
2. Check for the command before the trigger pattern check

## After Changes

Tell the user:
```bash
npm run build
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```
