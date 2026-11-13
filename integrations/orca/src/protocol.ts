export {}

export type MemoryItem = {
  id: string
  title: string
  type: string
  text: string
  files: string[]
  at: number | null
  score: number | null
}

export type Counts = { project: number | null; all: number | null }

export type ServerStatus =
  | { state: 'connected'; url: string; viewerUrl: string; project: string | null; version: string | null; counts: Counts }
  | { state: 'unauthorized' | 'unreachable' | 'refused'; url: string; viewerUrl: string; project: string | null; message: string }

export type ListAnswer = { items: MemoryItem[]; project: string | null; error: string | null }

export type AgentRow = { terminalId: string; title: string; agent: string; state: string }

export type Done = { ok: boolean; message: string | null }

declare module 'orca' {
  interface PluginRequests {
    'memory.status': { output: ServerStatus }
    'memory.recent': { input: { scope: 'project' | 'all' }; output: ListAnswer }
    'memory.search': { input: { query: string; scope: 'project' | 'all' }; output: ListAnswer }
    'memory.save': { input: { content: string; scope: 'project' | 'all' }; output: { saved: MemoryItem | null; error: string | null } }
    'memory.agents': { output: { agents: AgentRow[] } }
    'memory.sendToAgent': { input: { terminalId: string; text: string }; output: Done }
    'memory.openFile': { input: { path: string }; output: Done }
    'memory.openViewer': { output: Done }
  }
}
