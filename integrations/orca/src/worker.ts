import type { OrcaWorkerApi } from 'orca/worker'
import type { ServerStatus } from './protocol'
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

async function urls(orca: OrcaWorkerApi): Promise<{ url: string; viewerUrl: string }> {
  return {
    url: normalizeUrl(await orca.settings.get('url'), DEFAULT_URL),
    viewerUrl: normalizeUrl(await orca.settings.get('viewerUrl'), DEFAULT_VIEWER_URL)
  }
}

async function focusedProject(orca: OrcaWorkerApi): Promise<string | null> {
  try {
    const focused = await orca.host.call('workspace.readContext', {})
    if (!focused) return null
    const { workspaces } = await orca.host.call('workspace.list', {})
    const local = workspaces.filter((workspace) => workspace.hostId === null || workspace.hostId === 'local')
    const match =
      local.find((workspace) => workspace.id === (focused as { workspaceId?: string }).workspaceId) ??
      local.find((workspace) => workspace.name === focused.displayName && workspace.branch === focused.branch)
    return match ? projectName(match.path) : null
  } catch {
    return null
  }
}

async function scopedProject(orca: OrcaWorkerApi, scope: Scope): Promise<string | null> {
  return scope === 'project' ? focusedProject(orca) : null
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('memory.status', async (_input, { signal }): Promise<ServerStatus> => {
    const { url, viewerUrl } = await urls(orca)
    const project = await focusedProject(orca)
    const reply = await callServer(url, 'health', { signal })
    if (reply.status >= 200 && reply.status < 300 || reply.status === 503) {
      const version = (reply.body as { version?: unknown } | null)?.version
      return { state: 'connected', url, viewerUrl, project, version: typeof version === 'string' ? version : null }
    }
    const state: 'refused' | 'unauthorized' | 'unreachable' =
      reply.status === -1 ? 'refused' : reply.status === 401 || reply.status === 403 ? 'unauthorized' : 'unreachable'
    return { state, url, viewerUrl, project, message: failureText(reply) }
  })

  orca.panels.handle('memory.recent', async ({ scope }, { signal }) => {
    const { url } = await urls(orca)
    const project = await scopedProject(orca, scope)
    const query = new URLSearchParams({ limit: '20', latest: 'true' })
    if (project) query.set('project', project)
    const reply = await callServer(url, `memories?${query}`, { signal })
    if (reply.status < 200 || reply.status >= 300) return { items: [], error: failureText(reply) }
    const memories = (reply.body as { memories?: unknown[] } | null)?.memories
    const items = Array.isArray(memories) ? memories.flatMap((memory) => memoryItem(memory) ?? []) : []
    return { items, error: null }
  })

  orca.panels.handle('memory.search', async ({ query, scope }, { signal }) => {
    const trimmed = query.trim()
    if (!trimmed) return { items: [], error: null }
    const { url } = await urls(orca)
    const project = await scopedProject(orca, scope)
    const reply = await callServer(url, 'smart-search', {
      method: 'POST',
      body: { query: trimmed, limit: 15, ...(project ? { project } : {}) },
      timeoutMs: 10_000,
      signal
    })
    if (reply.status < 200 || reply.status >= 300) return { items: [], error: failureText(reply) }
    return { items: searchItems(reply.body), error: null }
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
    return { saved: memoryItem(result?.memory), error: null }
  })
}
