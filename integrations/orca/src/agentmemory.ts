import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { MemoryItem } from './protocol'

export const DEFAULT_URL = 'http://localhost:3111'
export const DEFAULT_VIEWER_URL = 'http://localhost:3113'

export type Reply = { status: number; body: unknown }

function usableSecret(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || (trimmed.startsWith('${') && trimmed.endsWith('}'))) return ''
  return trimmed
}

function readAgentmemoryFile(name: string): string {
  try {
    return readFileSync(join(homedir(), '.agentmemory', name), 'utf-8')
  } catch {
    return ''
  }
}

function envFileSecret(): string {
  let found = ''
  for (const line of readAgentmemoryFile('.env').split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    if (trimmed.slice(0, eq).replace(/^export\s+/, '').trim() !== 'AGENTMEMORY_SECRET') continue
    let value = trimmed.slice(eq + 1).trim()
    const quote = value[0]
    const close = quote === '"' || quote === "'" ? value.indexOf(quote, 1) : -1
    if (close > 0) value = value.slice(1, close)
    else if (value.includes(' #')) value = value.slice(0, value.indexOf(' #'))
    found = usableSecret(value)
  }
  return found
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
  } catch {
    return false
  }
}

export function normalizeUrl(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback
    return raw.replace(/\/+$/, '')
  } catch {
    return fallback
  }
}

export function resolveSecret(url: string): string {
  const configured = usableSecret(process.env.AGENTMEMORY_SECRET)
  if (configured) return configured
  if (process.env.AGENTMEMORY_CREDENTIAL_MODE === 'explicit' || !isLoopbackUrl(url)) return ''
  return envFileSecret() || usableSecret(readAgentmemoryFile('secret'))
}

export function secretAllowed(url: string, secret: string): boolean {
  if (!secret) return true
  try {
    return new URL(url).protocol === 'https:' || isLoopbackUrl(url)
  } catch {
    return false
  }
}

export async function callServer(
  url: string,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<Reply> {
  const secret = resolveSecret(url)
  if (!secretAllowed(url, secret)) return { status: -1, body: null }
  const signals = [AbortSignal.timeout(options.timeoutMs ?? 4000)]
  if (options.signal) signals.push(options.signal)
  try {
    const response = await fetch(`${url}/agentmemory/${path}`, {
      method: options.method ?? 'GET',
      redirect: 'error',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(secret ? { Authorization: `Bearer ${secret}` } : {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.any(signals)
    })
    return { status: response.status, body: await response.json().catch(() => null) }
  } catch {
    return { status: 0, body: null }
  }
}

export function failureText(reply: Reply): string {
  if (reply.status === -1) return 'Refusing to send the agentmemory secret over plain HTTP to a remote host. Use HTTPS or a loopback address.'
  if (reply.status === 0) return 'agentmemory is not running at this URL. Start it with: npx @agentmemory/agentmemory'
  if (reply.status === 401 || reply.status === 403) return 'agentmemory rejected the request. Check AGENTMEMORY_SECRET or ~/.agentmemory/.env.'
  const error = (reply.body as { error?: unknown } | null)?.error
  return typeof error === 'string' && error ? error : `agentmemory answered ${reply.status}.`
}

const projectCache = new Map<string, string>()

function repositoryRoot(dir: string, top: string, gitDir?: string, commonDir?: string): string {
  if (!gitDir || !commonDir) return top
  const physical = realpathSync(dir)
  const common = resolve(physical, commonDir)
  if (resolve(physical, gitDir) === common || basename(common) !== '.git') return top
  return resolve(common, '..')
}

export function projectName(dir: string): string {
  const explicit = process.env.AGENTMEMORY_PROJECT_NAME?.trim()
  if (explicit) return explicit
  const cached = projectCache.get(dir)
  if (cached) return cached
  let name = basename(dir) || dir
  try {
    const [top, gitDir, commonDir] = execFileSync('git', ['rev-parse', '--show-toplevel', '--git-dir', '--git-common-dir'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 500
    })
      .trim()
      .split(/\r?\n/)
    if (top) name = basename(repositoryRoot(dir, top, gitDir, commonDir))
  } catch {}
  projectCache.set(dir, name)
  return name
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function files(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((file): file is string => typeof file === 'string' && file.trim() !== '').slice(0, 20) : []
}

function time(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function searchItems(body: unknown): MemoryItem[] {
  const results = (body as { results?: unknown[] } | null)?.results
  if (!Array.isArray(results)) return []
  return results.flatMap((entry, index) => {
    const result = (entry ?? {}) as Record<string, unknown>
    const source = ((result.observation as Record<string, unknown> | undefined) ?? (result.memory as Record<string, unknown> | undefined) ?? result)
    const id = text(source.id) || text(result.obsId) || `result-${index}`
    const body = text(source.narrative) || text(source.content) || text(source.summary)
    const title = text(source.title) || body.split('\n')[0]?.slice(0, 80) || 'Untitled'
    const score = typeof result.combinedScore === 'number' ? result.combinedScore : typeof result.score === 'number' ? result.score : null
    return [{ id, title, type: text(source.type) || 'memory', text: body, files: files(source.files), at: time(source.timestamp ?? source.createdAt), score }]
  })
}

export function memoryItem(value: unknown): MemoryItem | null {
  const memory = (value ?? null) as Record<string, unknown> | null
  if (!memory || !text(memory.id)) return null
  const content = text(memory.content)
  return {
    id: text(memory.id),
    title: text(memory.title) || content.split('\n')[0]?.slice(0, 80) || 'Untitled',
    type: text(memory.type) || 'memory',
    text: content,
    files: files(memory.files),
    at: time(memory.updatedAt ?? memory.createdAt),
    score: null
  }
}
