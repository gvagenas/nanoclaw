/**
 * NanoClaw Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { query, HookCallback, PreCompactHookInput } from '@anthropic-ai/claude-agent-sdk';
import { createIpcMcp } from './ipc-mcp.js';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  provider?: 'claude' | 'codex';
  providerConfig?: {
    codex?: {
      approvalPolicy?: 'auto' | 'readonly' | 'full';
      authMethod?: 'chatgpt' | 'api_key';
    };
  };
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

interface SessionsIndex {
  entries: SessionEntry[];
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function getSessionSummary(sessionId: string, transcriptPath: string): string | null {
  // sessions-index.json is in the same directory as the transcript
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    log(`Sessions index not found at ${indexPath}`);
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entry = index.entries.find(e => e.sessionId === sessionId);
    if (entry?.summary) {
      return entry.summary;
    }
  } catch (err) {
    log(`Failed to read sessions index: ${err instanceof Error ? err.message : String(err)}`);
  }

  return null;
}

/**
 * Archive the full transcript to conversations/ before compaction.
 */
function createPreCompactHook(): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preCompact = input as PreCompactHookInput;
    const transcriptPath = preCompact.transcript_path;
    const sessionId = preCompact.session_id;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      log('No transcript found for archiving');
      return {};
    }

    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const messages = parseTranscript(content);

      if (messages.length === 0) {
        log('No messages to archive');
        return {};
      }

      const summary = getSessionSummary(sessionId, transcriptPath);
      const name = summary ? sanitizeFilename(summary) : generateFallbackName();

      const conversationsDir = '/workspace/group/conversations';
      fs.mkdirSync(conversationsDir, { recursive: true });

      const date = new Date().toISOString().split('T')[0];
      const filename = `${date}-${name}.md`;
      const filePath = path.join(conversationsDir, filename);

      const markdown = formatTranscriptMarkdown(messages, summary);
      fs.writeFileSync(filePath, markdown);

      log(`Archived conversation to ${filePath}`);
    } catch (err) {
      log(`Failed to archive transcript: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {};
  };
}

function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
}

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseTranscript(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text = typeof entry.message.content === 'string'
          ? entry.message.content
          : entry.message.content.map((c: { text?: string }) => c.text || '').join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {
    }
  }

  return messages;
}

function formatTranscriptMarkdown(messages: ParsedMessage[], title?: string | null): string {
  const now = new Date();
  const formatDateTime = (d: Date) => d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const lines: string[] = [];
  lines.push(`# ${title || 'Conversation'}`);
  lines.push('');
  lines.push(`Archived: ${formatDateTime(now)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : 'Andy';
    const content = msg.content.length > 2000
      ? msg.content.slice(0, 2000) + '...'
      : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

function readFileIfExists(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8').trim();
  } catch (err) {
    log(`Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function ensureClaudeGlobalMemoryFile(input: ContainerInput): void {
  const globalPath = input.isMain
    ? '/workspace/project/groups/global/CLAUDE.md'
    : '/workspace/global/CLAUDE.md';
  const targetPath = '/workspace/CLAUDE.md';

  try {
    if (!fs.existsSync(globalPath)) return;
    const content = fs.readFileSync(globalPath, 'utf-8');
    if (fs.existsSync(targetPath)) {
      const existing = fs.readFileSync(targetPath, 'utf-8');
      if (existing === content) return;
    }
    fs.writeFileSync(targetPath, content);
  } catch (err) {
    log(`Failed to prepare Claude global memory file: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function buildCodexPrelude(input: ContainerInput): string {
  const lines: string[] = [];
  lines.push('You are NanoClaw, an assistant operating in WhatsApp.');
  lines.push('Respond with plain text only.');
  lines.push('');
  lines.push('## Tools (Filesystem IPC)');
  lines.push('To send a message, write a JSON file to `/workspace/ipc/messages/`.');
  lines.push('Example: {"type":"message","chatJid":"<jid>","text":"hello"}');
  lines.push('To schedule tasks, write a JSON file to `/workspace/ipc/tasks/`.');
  lines.push('Example: {"type":"schedule_task","prompt":"...","schedule_type":"cron","schedule_value":"0 9 * * 1","groupFolder":"<group-folder>","context_mode":"isolated"}');
  lines.push('');
  lines.push('## Skills');
  lines.push('If the user asks for `/setup`, treat it as a request to run the `$setup` skill.');
  lines.push('');
  lines.push('## Memory');

  const globalPath = input.isMain
    ? '/workspace/project/groups/global/CLAUDE.md'
    : '/workspace/global/CLAUDE.md';
  const groupPath = '/workspace/group/CLAUDE.md';
  const globalMemory = readFileIfExists(globalPath);
  const groupMemory = readFileIfExists(groupPath);

  if (globalMemory) {
    lines.push('### Global Memory');
    lines.push(globalMemory);
    lines.push('');
  }

  if (groupMemory) {
    lines.push('### Group Memory');
    lines.push(groupMemory);
    lines.push('');
  }

  if (!globalMemory && !groupMemory) {
    lines.push('No memory files found.');
    lines.push('');
  }

  lines.push('## Memory Updates');
  lines.push('If the user says "remember this", update `/workspace/group/CLAUDE.md`.');
  if (input.isMain) {
    lines.push('If the user says "remember this globally", update `/workspace/project/groups/global/CLAUDE.md`.');
  } else {
    lines.push('Never write to global memory in non-main groups.');
  }

  return lines.join('\n');
}

function ensureCodexConfig(input: ContainerInput): void {
  const codexDir = '/home/node/.codex';
  fs.mkdirSync(codexDir, { recursive: true });
  const configPath = path.join(codexDir, 'config.toml');

  const approvalPolicy = input.providerConfig?.codex?.approvalPolicy ?? 'auto';
  let approvalValue = 'on-request';
  let sandboxMode = 'workspace-write';

  if (approvalPolicy === 'readonly') {
    approvalValue = 'never';
    sandboxMode = 'read-only';
  } else if (approvalPolicy === 'full') {
    approvalValue = 'never';
    sandboxMode = 'danger-full-access';
  }

  const config = [
    `approval_policy = "${approvalValue}"`,
    `sandbox_mode = "${sandboxMode}"`,
    '',
  ].join('\n');

  try {
    let existing = '';
    if (fs.existsSync(configPath)) {
      existing = fs.readFileSync(configPath, 'utf-8');
    }

    const upsert = (contents: string, key: string, value: string): string => {
      const re = new RegExp(`^\\s*${key}\\s*=\\s*".*"\\s*$`, 'm');
      if (re.test(contents)) {
        return contents.replace(re, `${key} = "${value}"`);
      }
      const trimmed = contents.replace(/\s*$/, '');
      const suffix = trimmed.length ? '\n' : '';
      return `${trimmed}${suffix}${key} = "${value}"\n`;
    };

    const updated = upsert(upsert(existing, 'approval_policy', approvalValue), 'sandbox_mode', sandboxMode);
    if (updated !== existing) {
      fs.writeFileSync(configPath, updated);
    }
  } catch (err) {
    log(`Failed to update Codex config: ${err instanceof Error ? err.message : String(err)}`);
    fs.writeFileSync(configPath, config);
  }
}

function validateCodexAuth(input: ContainerInput): string | null {
  const authMethod = input.providerConfig?.codex?.authMethod;
  const authPath = '/home/node/.codex/auth.json';
  const hasAuthFile = fs.existsSync(authPath);
  const apiKey = process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY;

  if (authMethod === 'chatgpt') {
    if (!hasAuthFile) {
      return 'Codex auth.json not found. Run `codex login` on the host and copy ~/.codex/auth.json to data/codex/<group>/.codex/auth.json.';
    }
    return null;
  }

  if (authMethod === 'api_key') {
    if (!apiKey) {
      return 'OPENAI_API_KEY or CODEX_API_KEY is missing. Add one to .env to use Codex API key auth.';
    }
    return null;
  }

  if (!hasAuthFile && !apiKey) {
    return 'Codex authentication not found. Run `codex login` or set OPENAI_API_KEY in .env.';
  }

  return null;
}

async function runCodexExec(input: ContainerInput, prompt: string): Promise<ContainerOutput> {
  const authError = validateCodexAuth(input);
  if (authError) {
    return { status: 'error', result: null, error: authError };
  }

  ensureCodexConfig(input);

  const prelude = buildCodexPrelude(input);
  const fullPrompt = `${prelude}\n\n${prompt}`;
  const useStdin = fullPrompt.length > 8000;

  return new Promise((resolve) => {
    const child = spawn('codex', useStdin ? ['exec'] : ['exec', fullPrompt], {
      cwd: '/workspace/group',
      env: process.env,
      stdio: [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    if (useStdin) {
      child.stdin.write(fullPrompt);
      child.stdin.end();
    }

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          status: 'error',
          result: null,
          error: `Codex exited with code ${code}: ${stderr.trim().slice(-500)}`,
        });
        return;
      }
      resolve({
        status: 'success',
        result: stdout.trim() || null,
      });
    });

    child.on('error', (err) => {
      resolve({
        status: 'error',
        result: null,
        error: `Failed to start Codex: ${err.message}`,
      });
    });
  });
}

async function main(): Promise<void> {
  let input: ContainerInput;

  try {
    const stdinData = await readStdin();
    input = JSON.parse(stdinData);
    log(`Received input for group: ${input.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  let result: string | null = null;
  let newSessionId: string | undefined;
  const provider = input.provider || 'claude';

  // Add context for scheduled tasks
  let prompt = input.prompt;
  if (input.isScheduledTask) {
    if (provider === 'codex') {
      prompt = `[SCHEDULED TASK - You are running automatically, not in response to a user message. To reply, write a JSON file to /workspace/ipc/messages.]\n\n${input.prompt}`;
    } else {
      prompt = `[SCHEDULED TASK - You are running automatically, not in response to a user message. Use mcp__nanoclaw__send_message if needed to communicate with the user.]\n\n${input.prompt}`;
    }
  }

  try {
    log(`Starting agent (${provider})...`);

    if (provider === 'codex') {
      const output = await runCodexExec(input, prompt);
      writeOutput({
        status: output.status,
        result: output.result,
        error: output.error,
      });
      return;
    }

    ensureClaudeGlobalMemoryFile(input);

    const ipcMcp = createIpcMcp({
      chatJid: input.chatJid,
      groupFolder: input.groupFolder,
      isMain: input.isMain
    });

    for await (const message of query({
      prompt,
      options: {
        cwd: '/workspace/group',
        resume: input.sessionId,
        allowedTools: [
          'Bash',
          'Read', 'Write', 'Edit', 'Glob', 'Grep',
          'WebSearch', 'WebFetch',
          'mcp__nanoclaw__*'
        ],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: ['project'],
        mcpServers: {
          nanoclaw: ipcMcp
        },
        hooks: {
          PreCompact: [{ hooks: [createPreCompactHook()] }]
        }
      }
    })) {
      if (message.type === 'system' && message.subtype === 'init') {
        newSessionId = message.session_id;
        log(`Session initialized: ${newSessionId}`);
      }

      if ('result' in message && message.result) {
        result = message.result as string;
      }
    }

    log('Agent completed successfully');
    writeOutput({
      status: 'success',
      result,
      newSessionId
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId,
      error: errorMessage
    });
    process.exit(1);
  }
}

main();
