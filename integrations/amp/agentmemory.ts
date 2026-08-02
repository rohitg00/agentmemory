import type { PluginAPI } from '@ampcode/plugin'

// --- Configuration ------------------------------------------------
const API_URL = process.env.AGENTMEMORY_URL || 'http://localhost:3111'
const SECRET = process.env.AGENTMEMORY_SECRET || ''
const INJECT_CONTEXT = process.env.AGENTMEMORY_INJECT_CONTEXT === 'true'
const DEBUG = process.env.AGENTMEMORY_AMP_DEBUG === '1'

// --- REST helpers -------------------------------------------------
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (SECRET) h['Authorization'] = `Bearer ${SECRET}`
  return h
}

async function post(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<void> {
  try {
    await fetch(`${API_URL}/agentmemory${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    if (DEBUG) logger?.log(`POST ${path} failed: ${(e as Error).message}`)
  }
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${API_URL}/agentmemory${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null
  } catch (e) {
    if (DEBUG) logger?.log(`POST ${path} failed: ${(e as Error).message}`)
    return null
  }
}

// --- Project resolution -------------------------------------------
function resolveProject(): string {
  const explicit = process.env.AGENTMEMORY_PROJECT_NAME
  if (explicit && explicit.trim()) return explicit.trim()
  const cwd = process.cwd()
  try {
    const top = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
      cwd,
      stdout: 'pipe',
      stderr: 'ignore',
      timeout: 500,
    }).stdout?.toString().trim()
    if (top) return top.split(/[/\\]/).pop()!
  } catch {}
  return cwd.split(/[/\\]/).pop()!
}

// --- Observation helper -------------------------------------------
async function observe(
  sessionId: string,
  hookType: string,
  data: Record<string, unknown>,
): Promise<void> {
  await post('/observe', {
    hookType,
    sessionId,
    project: resolveProject(),
    cwd: process.cwd(),
    timestamp: new Date().toISOString(),
    data,
  })
}

function safeSlice(v: unknown, max: number): string {
  if (typeof v === 'string') return v.slice(0, max)
  if (v == null) return ''
  try {
    return JSON.stringify(v).slice(0, max)
  } catch {
    return ''
  }
}

// --- Plugin-level state -------------------------------------------
let logger: { log: (msg: string) => void } | undefined
const contextCache = new Map<string, string>()

const INSTRUCTIONS = `<agentmemory-instructions>
You have access to agentmemory for persistent cross-session memory via the
memory_recall, memory_save, memory_smart_search, and memory_sessions tools.
Use them proactively.

memory_save - Save an insight, decision, or fact to long-term memory.
  Required: content (text), concepts (2-5 comma-separated keywords), type (pattern/preference/architecture/bug/workflow/fact)
  Optional: files (comma-separated paths)
  Use when: user says "remember this", after discovering a bug, after making
  an architectural decision, or after learning a project convention.

memory_recall - Search past observations by keywords.
  Use when: user says "recall", "what did we do", "do you remember", or
  needs context from past sessions.

memory_smart_search - Hybrid semantic + keyword search with progressive disclosure.
  Use when: you need the most relevant past context, fuzzy/conceptual searches,
  or memory_recall does not find what you need.

memory_sessions - List recent sessions with status and observation counts.
  Use when: user asks about session/past history, "what did we work on".
</agentmemory-instructions>`

export default function (amp: PluginAPI) {
  logger = amp.logger
  amp.logger.log('agentmemory plugin loaded')

  // -- session.start: register the session with the memory server --
  amp.on('session.start', async (event) => {
    const sessionId = event.thread.id
    const startResult = await postJson('/session/start', {
      sessionId,
      project: resolveProject(),
      cwd: process.cwd(),
    })
    const ctx = startResult?.['context']
    if (typeof ctx === 'string' && ctx.length > 0) {
      contextCache.set(sessionId, ctx)
    }
  })

  // -- agent.start: capture the user's prompt and inject context ----
  amp.on('agent.start', async (event) => {
    const sessionId = event.thread.id

    observe(sessionId, 'prompt_submit', {
      prompt: safeSlice(event.message, 8000),
      message_id: event.id,
    })

    if (INJECT_CONTEXT) {
      let ctx = contextCache.get(sessionId)
      if (!ctx) {
        const result = await postJson('/context', {
          sessionId,
          project: resolveProject(),
        })
        ctx = result?.['context'] as string | undefined
      } else {
        contextCache.delete(sessionId)
      }
      if (typeof ctx === 'string' && ctx.length > 0) {
        return {
          message: {
            content: `\n${INSTRUCTIONS}\n\n${ctx}`,
            display: false,
          },
        }
      }
    }

    return {
      message: {
        content: `\n${INSTRUCTIONS}`,
        display: false,
      },
    }
  })

  // -- tool.call: allow all tool calls (no interception) ----------
  amp.on('tool.call', async (_event) => {
    return { action: 'allow' as const }
  })

  // -- tool.result: capture observations for every tool execution --
  amp.on('tool.result', async (event) => {
    const sessionId = event.thread.id

    if (event.status === 'error') {
      await observe(sessionId, 'post_tool_failure', {
        tool_name: event.tool,
        call_id: event.toolUseID,
        tool_input: safeSlice(event.input, 4000),
        tool_output: safeSlice(event.error, 4000),
      })
    } else {
      await observe(sessionId, 'post_tool_use', {
        tool_name: event.tool,
        call_id: event.toolUseID,
        tool_input: safeSlice(event.input, 4000),
        tool_output: safeSlice(event.output, 8000),
      })
    }
  })

  // -- agent.end: summarize and end the session --------------------
  amp.on('agent.end', async (event) => {
    const sessionId = event.thread.id
    const toolCalls = amp.helpers.toolCallsInMessages(event.messages)
    await observe(sessionId, 'agent_end', {
      status: event.status,
      tool_call_count: toolCalls.length,
    })
    post('/summarize', { sessionId }, 120000)
    post('/session/end', { sessionId }, 5000)
    contextCache.delete(sessionId)
  })

  // -- Register memory tools ---------------------------------------
  amp.registerTool({
    name: 'memory_recall',
    description: 'Search past agentmemory observations by keywords. Returns matching memories from previous sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to search for in past observations.' },
        limit: { type: 'number', description: 'Maximum number of results (default 10).' },
      },
      required: ['query'],
    },
    async execute(input) {
      const result = await postJson('/recall', { query: input['query'], limit: input['limit'] ?? 10 })
      return JSON.stringify(result ?? { results: [] }, null, 2)
    },
  })

  amp.registerTool({
    name: 'memory_save',
    description: 'Save an insight, decision, pattern, or fact to long-term memory. Use when the user says "remember this" or after discovering something worth keeping.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The memory content to save.' },
        concepts: { type: 'string', description: '2-5 comma-separated keywords for retrieval (e.g. "auth,jwt,middleware").' },
        type: { type: 'string', description: 'Memory type: pattern, preference, architecture, bug, workflow, or fact.' },
        files: { type: 'string', description: 'Comma-separated file paths related to this memory.' },
      },
      required: ['content', 'concepts'],
    },
    async execute(input) {
      const result = await postJson('/save', { content: input['content'], concepts: input['concepts'], type: input['type'] ?? 'fact', files: input['files'] ?? '' })
      return JSON.stringify(result ?? { saved: false }, null, 2)
    },
  })

  amp.registerTool({
    name: 'memory_smart_search',
    description: 'Hybrid semantic + keyword search across all memories. Use when memory_recall does not find what you need or for fuzzy/conceptual searches.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query (natural language or keywords).' },
        limit: { type: 'number', description: 'Maximum number of results (default 10).' },
      },
      required: ['query'],
    },
    async execute(input) {
      const result = await postJson('/smart-search', { query: input['query'], limit: input['limit'] ?? 10 })
      return JSON.stringify(result ?? { results: [] }, null, 2)
    },
  })

  amp.registerTool({
    name: 'memory_sessions',
    description: 'List recent agentmemory sessions with status and observation counts. Use when the user asks about past history or what was worked on.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of sessions to list (default 20).' },
      },
    },
    async execute(input) {
      const result = await postJson('/sessions', { limit: input['limit'] ?? 20 })
      return JSON.stringify(result ?? { sessions: [] }, null, 2)
    },
  })

  // -- Register commands -------------------------------------------
  amp.registerCommand('agentmemory-recall', {
    title: 'Recall memories', category: 'agentmemory',
    description: 'Search agentmemory for past observations matching a query.',
  }, async (ctx) => {
    const query = await ctx.ui.input({ prompt: 'Search query:', placeholder: 'e.g. JWT auth setup' })
    if (!query) return
    const result = await postJson('/smart-search', { query, limit: 10 })
    await ctx.ui.notify(JSON.stringify(result ?? { results: [] }, null, 2).slice(0, 2000))
  })

  amp.registerCommand('agentmemory-remember', {
    title: 'Save a memory', category: 'agentmemory',
    description: 'Save an insight, decision, or fact to agentmemory.',
  }, async (ctx) => {
    const content = await ctx.ui.input({ prompt: 'Memory content:', placeholder: 'e.g. We chose jose over jsonwebtoken for JWT' })
    if (!content) return
    const concepts = await ctx.ui.input({ prompt: 'Keywords (comma-separated):', placeholder: 'e.g. auth, jwt, jose' })
    if (!concepts) return
    const result = await postJson('/save', { content, concepts, type: 'fact' })
    await ctx.ui.notify(result?.['saved'] ? 'Memory saved.' : 'Save failed -- is agentmemory running?')
  })

  amp.registerCommand('agentmemory-session-history', {
    title: 'Session history', category: 'agentmemory',
    description: 'List recent agentmemory sessions.',
  }, async (ctx) => {
    const result = await postJson('/sessions', { limit: 20 })
    await ctx.ui.notify(JSON.stringify(result ?? { sessions: [] }, null, 2).slice(0, 2000))
  })
}