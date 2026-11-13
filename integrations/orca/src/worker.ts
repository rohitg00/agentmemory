import { execFile } from 'node:child_process'
import { isAbsolute, join, relative } from 'node:path'
import type { OrcaWorkerApi } from 'orca/worker'
import type { AgentRow, Counts, Done, ServerStatus } from './protocol'
import {
  callServer,
  DEFAULT_URL,
  DEFAULT_VIEWER_URL,
  failureText,
  memoryItem,
  normalizeUrl,
  projectName,
  searchItems
} from './agentmemory'

type Scope = 'project' | 'all'
type Workspace = { id: string; path: string; name: string; branch: string | null; hostId: string | null }

const CAPTURE_OUTPUT_MAX = 8000
const EVENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/

async function urls(orca: OrcaWorkerApi): Promise<{ url: string; viewerUrl: string }> {
  return {
    url: normalizeUrl(await orca.settings.get('url'), DEFAULT_URL),
    viewerUrl: normalizeUrl(await orca.settings.get('viewerUrl'), DEFAULT_VIEWER_URL)
  }
}

async function localWorkspaces(orca: OrcaWorkerApi): Promise<Workspace[]> {
  const { workspaces } = await orca.host.call('workspace.list', {})
  return workspaces.filter((workspace) => workspace.hostId === null || workspace.hostId === 'local')
}

async function focusedWorkspace(orca: OrcaWorkerApi): Promise<Workspace | null> {
  try {
    const focused = await orca.host.call('workspace.readContext', {})
    if (!focused) return null
    const local = await localWorkspaces(orca)
    return (
      local.find((workspace) => workspace.id === (focused as { workspaceId?: string }).workspaceId) ??
      local.find((workspace) => workspace.name === focused.displayName && workspace.branch === focused.branch) ??
      null
    )
  } catch {
    return null
  }
}

async function focusedProject(orca: OrcaWorkerApi): Promise<string | null> {
  const workspace = await focusedWorkspace(orca)
  return workspace ? projectName(workspace.path) : null
}

async function scopedProject(orca: OrcaWorkerApi, scope: Scope): Promise<string | null> {
  return scope === 'project' ? focusedProject(orca) : null
}

async function countMemories(url: string, project: string | null, signal?: AbortSignal): Promise<number | null> {
  const query = new URLSearchParams({ count: 'true' })
  if (project) query.set('project', project)
  const reply = await callServer(url, `memories?${query}`, { signal })
  const latest = (reply.body as { latestCount?: unknown } | null)?.latestCount
  return reply.status >= 200 && reply.status < 300 && typeof latest === 'number' ? latest : null
}

async function readStatus(orca: OrcaWorkerApi, signal?: AbortSignal): Promise<ServerStatus> {
  const { url, viewerUrl } = await urls(orca)
  const project = await focusedProject(orca)
  const reply = await callServer(url, 'health', { signal })
  if ((reply.status >= 200 && reply.status < 300) || reply.status === 503) {
    const version = (reply.body as { version?: unknown } | null)?.version
    const [projectCount, allCount] = await Promise.all([
      project ? countMemories(url, project, signal) : Promise.resolve(null),
      countMemories(url, null, signal)
    ])
    const counts: Counts = { project: projectCount, all: allCount }
    return { state: 'connected', url, viewerUrl, project, version: typeof version === 'string' ? version : null, counts }
  }
  const state: 'refused' | 'unauthorized' | 'unreachable' =
    reply.status === -1 ? 'refused' : reply.status === 401 || reply.status === 403 ? 'unauthorized' : 'unreachable'
  return { state, url, viewerUrl, project, message: failureText(reply) }
}

async function showStatus(orca: OrcaWorkerApi, status: ServerStatus): Promise<void> {
  const update =
    status.state === 'connected'
      ? {
          text: status.counts.project !== null ? `${status.counts.project} memories` : `${status.counts.all ?? 0} memories`,
          tone: 'success' as const,
          tooltip: status.project ? `agentmemory: ${status.project}. Press to open the viewer in Orca.` : 'agentmemory is running. Press to open the viewer in Orca.'
        }
      : { text: 'agentmemory offline', tone: 'danger' as const, tooltip: status.message }
  await orca.host.call('statusBar.update', { id: 'status', ...update }).catch(() => undefined)
}

function runOrca(args: string[]): Promise<boolean> {
  const path = [process.env.PATH, '/usr/local/bin', '/opt/homebrew/bin'].filter(Boolean).join(':')
  return new Promise((resolve) => {
    execFile('orca', args, { timeout: 10_000, env: { ...process.env, PATH: path } }, (error) => resolve(!error))
  })
}

async function openViewer(orca: OrcaWorkerApi): Promise<Done> {
  const { viewerUrl } = await urls(orca)
  const opened = await runOrca(['tab', 'create', '--url', viewerUrl, '--json'])
  return opened ? { ok: true, message: null } : { ok: false, message: `Could not open ${viewerUrl} in Orca.` }
}

function truncate(value: unknown): unknown {
  if (value === undefined) return undefined
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return undefined
  return text.length > CAPTURE_OUTPUT_MAX ? `${text.slice(0, CAPTURE_OUTPUT_MAX)}…` : value
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('memory.status', async (_input, { signal }) => {
    const status = await readStatus(orca, signal)
    await showStatus(orca, status)
    return status
  })

  orca.panels.handle('memory.recent', async ({ scope }, { signal }) => {
    const { url } = await urls(orca)
    const project = await scopedProject(orca, scope)
    const query = new URLSearchParams({ limit: '20', latest: 'true' })
    if (project) query.set('project', project)
    const reply = await callServer(url, `memories?${query}`, { signal })
    if (reply.status < 200 || reply.status >= 300) return { items: [], project, error: failureText(reply) }
    const memories = (reply.body as { memories?: unknown[] } | null)?.memories
    const items = Array.isArray(memories) ? memories.flatMap((memory) => memoryItem(memory) ?? []) : []
    return { items, project, error: null }
  })

  orca.panels.handle('memory.search', async ({ query, scope }, { signal }) => {
    const trimmed = query.trim()
    const project = await scopedProject(orca, scope)
    if (!trimmed) return { items: [], project, error: null }
    const { url } = await urls(orca)
    const reply = await callServer(url, 'smart-search', {
      method: 'POST',
      body: { query: trimmed, limit: 15, ...(project ? { project } : {}) },
      timeoutMs: 10_000,
      signal
    })
    if (reply.status < 200 || reply.status >= 300) return { items: [], project, error: failureText(reply) }
    return { items: searchItems(reply.body), project, error: null }
  })

  orca.panels.handle('memory.save', async ({ content, scope }, { signal }) => {
    const trimmed = content.trim()
    if (!trimmed) return { saved: null, error: 'Write something to save first.' }
    const { url } = await urls(orca)
    const project = await scopedProject(orca, scope)
    const reply = await callServer(url, 'remember', {
      method: 'POST',
      body: { content: trimmed, ...(project ? { project } : {}) },
      timeoutMs: 10_000,
      signal
    })
    const result = reply.body as { success?: boolean; memory?: unknown; error?: unknown } | null
    if (reply.status < 200 || reply.status >= 300 || result?.success === false) return { saved: null, error: failureText(reply) }
    void readStatus(orca).then((status) => showStatus(orca, status))
    return { saved: memoryItem(result?.memory), error: null }
  })

  orca.panels.handle('memory.agents', async () => {
    try {
      const { agents } = await orca.host.call('agents.list', {})
      const rows: AgentRow[] = agents.flatMap((agent) =>
        agent.terminalId ? [{ terminalId: agent.terminalId, title: agent.title ?? agent.agent ?? 'Agent', agent: agent.agent ?? 'agent', state: agent.state }] : []
      )
      return { agents: rows }
    } catch {
      return { agents: [] }
    }
  })

  orca.panels.handle('memory.sendToAgent', async ({ terminalId, text }) => {
    const body = text.trim()
    if (!body) return { ok: false, message: 'Nothing to send.' }
    try {
      const { accepted } = await orca.host.call('terminal.sendText', { terminalId, text: `Context from agentmemory: ${body.replace(/\s+/g, ' ')}`, enter: false })
      return accepted ? { ok: true, message: null } : { ok: false, message: 'The terminal did not accept the text.' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  })

  orca.panels.handle('memory.openFile', async ({ path }) => {
    const workspace = await focusedWorkspace(orca)
    if (!workspace) return { ok: false, message: 'Open a local workspace first.' }
    const absolute = isAbsolute(path) ? path : join(workspace.path, path)
    const inside = relative(workspace.path, absolute)
    if (inside.startsWith('..') || isAbsolute(inside)) return { ok: false, message: `${path} is outside ${workspace.name}.` }
    try {
      await orca.host.call('editor.open', { workspaceId: workspace.id, path: inside })
      return { ok: true, message: null }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  })

  orca.panels.handle('memory.openViewer', () => openViewer(orca))

  orca.commands.register('agentmemory.openViewer', async () => {
    const result = await openViewer(orca)
    if (!result.ok) await orca.host.call('notifications.show', { title: 'agentmemory', body: result.message ?? 'Could not open the viewer.' }).catch(() => undefined)
    return result
  })

  orca.commands.register('agentmemory.refresh', async () => {
    const status = await readStatus(orca)
    await showStatus(orca, status)
    return status.state
  })

  orca.events.on('workspace.changed', async () => {
    await showStatus(orca, await readStatus(orca))
  })

  orca.hooks.on('agent.tool.after', async (event) => {
    if ((await orca.settings.get('capture')) !== true) return
    const workspace = (await localWorkspaces(orca).catch(() => [])).find((row) => row.id === event.workspaceId)
    if (!workspace) return
    const { url } = await urls(orca)
    const eventId = event.callId && EVENT_ID_RE.test(`orca:${event.callId}`) ? `orca:${event.callId}` : undefined
    await callServer(url, 'observe', {
      method: 'POST',
      body: {
        hookType: 'post_tool_use',
        sessionId: `orca-${event.agent}-${event.terminalId ?? workspace.id}`,
        project: projectName(workspace.path),
        cwd: workspace.path,
        timestamp: new Date().toISOString(),
        ...(eventId ? { eventId } : {}),
        data: { tool_name: event.tool, tool_input: truncate(event.input), tool_output: truncate(event.output), agent: event.agent, source: 'orca' }
      },
      timeoutMs: 5000
    })
  })

  void readStatus(orca).then((status) => showStatus(orca, status)).catch(() => undefined)
}
