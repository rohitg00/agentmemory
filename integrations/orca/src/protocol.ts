export {}

export type MemoryItem = {
  id: string
  title: string
  type: string
  text: string
  at: number | null
  score: number | null
}

export type ServerStatus =
  | { state: 'connected'; url: string; viewerUrl: string; project: string | null; version: string | null }
  | { state: 'unauthorized' | 'unreachable' | 'refused'; url: string; viewerUrl: string; project: string | null; message: string }

declare module 'orca' {
  interface PluginRequests {
    'memory.status': { output: ServerStatus }
    'memory.recent': { input: { scope: 'project' | 'all' }; output: { items: MemoryItem[]; error: string | null } }
    'memory.search': { input: { query: string; scope: 'project' | 'all' }; output: { items: MemoryItem[]; error: string | null } }
    'memory.save': { input: { content: string; scope: 'project' | 'all' }; output: { saved: MemoryItem | null; error: string | null } }
  }
}
