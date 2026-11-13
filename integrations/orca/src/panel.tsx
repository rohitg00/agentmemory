import {
  atom,
  Badge,
  Button,
  Callout,
  Card,
  Collapsible,
  EmptyState,
  Heading,
  IconButton,
  KeyValue,
  Input,
  List,
  ListItem,
  on,
  plugin,
  read,
  RelativeTime,
  Row,
  Select,
  set,
  Spinner,
  Stack,
  Switch,
  Text,
  Textarea,
  type PanelContext
} from 'orca'
import type { AgentRow, ListAnswer, MemoryItem, ServerStatus } from './protocol'

const TYPE_ICONS: Record<string, 'flag' | 'bug' | 'activity' | 'layers' | 'star' | 'book' | 'blocks' | 'lightbulb' | 'terminal' | 'file-text'> = {
  decision: 'flag',
  bug: 'bug',
  workflow: 'activity',
  pattern: 'layers',
  preference: 'star',
  fact: 'book',
  architecture: 'blocks',
  lesson: 'lightbulb',
  command: 'terminal'
}

const status = atom<ServerStatus | null>(null)
const projectOnly = atom('projectOnly', true, { persist: 'plugin' })
const query = atom('')
const lastQuery = atom<string | null>(null)
const list = atom<ListAnswer>({ items: [], project: null, error: null })
const loading = atom(false)
const selected = atom<string | null>(null)
const draft = atom('')
const note = atom<{ tone: 'success' | 'danger'; text: string } | null>(null)
const agents = atom<AgentRow[]>([])
const target = atom<string | null>(null)
let generation = 0
let visibleAtom: PanelContext['visible'] | null = null
let wasVisible = true
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function refreshSoon(delayMs: number): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refresh()
  }, delayMs)
}

function scope(): 'project' | 'all' {
  return read(projectOnly) ? 'project' : 'all'
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadList(): Promise<void> {
  const mine = ++generation
  set(loading, true)
  const text = read(lastQuery)
  try {
    const answer = text
      ? await plugin.request('memory.search', { query: text, scope: scope() })
      : await plugin.request('memory.recent', { scope: scope() })
    if (mine === generation) set(list, answer)
  } catch (error) {
    if (mine === generation) set(list, { items: [], project: null, error: message(error) })
  } finally {
    if (mine === generation) set(loading, false)
  }
}

async function loadAgents(): Promise<void> {
  const { agents: rows } = await plugin.request('memory.agents')
  set(agents, rows)
  if (!rows.some((row) => row.terminalId === read(target))) set(target, rows[0]?.terminalId ?? null)
}

async function refresh(): Promise<void> {
  try {
    set(status, await plugin.request('memory.status'))
  } catch (error) {
    set(status, null)
    set(list, { items: [], project: null, error: message(error) })
    return
  }
  await Promise.all([loadList(), loadAgents().catch(() => undefined)])
}

async function search(value?: string): Promise<void> {
  set(lastQuery, (value ?? read(query)).trim() || null)
  set(selected, null)
  await loadList()
}

async function showRecent(): Promise<void> {
  set(query, '')
  await search('')
}

async function save(): Promise<void> {
  const answer = await plugin.request('memory.save', { content: read(draft), scope: scope() })
  if (answer.error) {
    set(note, { tone: 'danger', text: answer.error })
    return
  }
  set(draft, '')
  set(note, { tone: 'success', text: 'Saved to agentmemory.' })
  await refresh()
}

async function act(request: Promise<{ ok: boolean; message: string | null }>, done: string): Promise<void> {
  const result = await request.catch((error) => ({ ok: false, message: message(error) }))
  set(note, result.ok ? { tone: 'success', text: done } : { tone: 'danger', text: result.message ?? 'That did not work.' })
}

export function setup(ctx: PanelContext): void {
  visibleAtom = ctx.visible
  wasVisible = read(ctx.visible)
  ctx.subscriptions.push(
    on('workspace.changed', () => void refresh()),
    on('agent.status.changed', ({ state }) => {
      void loadAgents().catch(() => undefined)
      if (state === 'done') refreshSoon(1500)
    }),
    { dispose: () => { if (refreshTimer) clearTimeout(refreshTimer) } }
  )
  void refresh()
}

function StatusBadge({ value }: { value: ServerStatus | null }) {
  if (!value) return <Badge>checking</Badge>
  if (value.state === 'connected') return <Badge tone="success">{value.version ? `v${value.version}` : 'connected'}</Badge>
  if (value.state === 'unauthorized') return <Badge tone="warning">secret rejected</Badge>
  return <Badge tone="danger">offline</Badge>
}

function count(value: number | null): string {
  return value === null ? '–' : String(value)
}

function Stats({ value }: { value: ServerStatus & { state: 'connected' } }) {
  return (
    <KeyValue
      label="Memory counts"
      items={[
        { label: value.project ? `In ${value.project}` : 'In this workspace', value: count(value.counts.project) },
        { label: 'In all projects', value: count(value.counts.all) }
      ]}
    />
  )
}

function age(at: number | null): string {
  if (at === null) return ''
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function Detail({ item }: { item: MemoryItem }) {
  const agentRows = read(agents)
  const chosen = read(target)
  return (
    <Card title={item.title} description={item.type}>
      <Stack gap="sm">
        <Text size="sm">{item.text || 'No text stored.'}</Text>
        {item.at !== null ? (
          <Text muted size="xs">
            Saved <RelativeTime at={item.at} format="long" />
          </Text>
        ) : null}
        {item.files.length > 0 ? (
          <List label="Files">
            {item.files.map((file) => (
              <ListItem key={file} icon="file" title={file} description="Open in Orca" onPress={() => act(plugin.request('memory.openFile', { path: file }), `Opened ${file}.`)} />
            ))}
          </List>
        ) : null}
        {agentRows.length > 0 ? (
          <Row gap="xs" align="end">
            <Select
              label="Agent"
              value={chosen ?? undefined}
              options={agentRows.map((row) => ({ value: row.terminalId, label: `${row.title} · ${row.state}` }))}
              onChange={(value) => set(target, value)}
            />
            <Button
              icon="next"
              disabled={!chosen}
              onPress={() => chosen && act(plugin.request('memory.sendToAgent', { terminalId: chosen, text: `${item.title}. ${item.text}` }), 'Sent to the agent prompt. Press Enter in its terminal to submit.')}
            >
              Send to agent
            </Button>
          </Row>
        ) : (
          <Text muted size="xs">Start an agent in this workspace to send it this memory.</Text>
        )}
      </Stack>
    </Card>
  )
}

export default function Panel() {
  const visible = visibleAtom ? read(visibleAtom) : true
  if (visible && !wasVisible) refreshSoon(0)
  wasVisible = visible
  const server = read(status)
  const answer = read(list)
  const searching = read(lastQuery)
  const chosen = answer.items.find((item) => item.id === read(selected)) ?? null
  const flash = read(note)
  const project = answer.project ?? (server?.project ?? null)
  return (
    <Stack gap="md">
      <Row justify="between">
        <Heading>agentmemory</Heading>
        <Row gap="xs">
          <StatusBadge value={server} />
          <IconButton icon="refresh" label="Refresh" variant="ghost" onPress={refresh} />
          <IconButton icon="open-external" label="Open the viewer in Orca" variant="ghost" onPress={() => act(plugin.request('memory.openViewer'), 'Opened the viewer in an Orca tab.')} />
        </Row>
      </Row>
      {server && server.state !== 'connected' ? (
        <Callout tone={server.state === 'unauthorized' ? 'warning' : 'danger'} title="Can't reach agentmemory">
          <Stack gap="xs">
            <Text size="sm">{server.message}</Text>
            <Text muted size="xs">{server.url}</Text>
            <Button variant="outline" size="sm" icon="refresh" onPress={refresh}>
              Try again
            </Button>
          </Stack>
        </Callout>
      ) : null}
      {server && server.state === 'connected' ? <Stats value={server} /> : null}
      {flash ? <Text tone={flash.tone} size="sm">{flash.text}</Text> : null}
      <Row gap="xs">
        <Input
          label="Search memories"
          labelHidden
          type="search"
          placeholder={project && read(projectOnly) ? `Search ${project}` : 'Search all memories'}
          value={read(query)}
          onChange={(value) => set(query, value)}
          onSubmit={(value) => search(value)}
        />
        <Button icon="search" onPress={() => search()}>
          Search
        </Button>
      </Row>
      <Switch
        label={server?.project ? `Only ${server.project}` : 'Only this workspace'}
        checked={read(projectOnly)}
        disabled={!server?.project}
        onChange={(checked) => {
          set(projectOnly, checked)
          void loadList()
        }}
      />
      <Row justify="between">
        <Text weight="semibold">{searching ? `Results for "${searching}"` : 'Recent memories'}</Text>
        {searching ? (
          <Button variant="ghost" size="sm" onPress={showRecent}>
            Show recent
          </Button>
        ) : null}
      </Row>
      {read(loading) ? <Spinner label="Loading memories" /> : null}
      {answer.error ? <Text tone="danger" size="sm">{answer.error}</Text> : null}
      {chosen ? <Detail item={chosen} /> : null}
      {!read(loading) && !answer.error && answer.items.length === 0 ? (
        <EmptyState
          icon="book"
          title={searching ? 'No matching memories' : 'No memories here yet'}
          description={
            searching
              ? 'Try other words, or turn off the workspace filter.'
              : 'Connect your agents with agentmemory connect, or save a memory below. Memories your agents keep show up here.'
          }
        />
      ) : null}
      {answer.items.length > 0 ? (
        <List label={searching ? 'Search results' : 'Recent memories'}>
          {answer.items.map((item) => (
            <ListItem
              key={item.id}
              icon={TYPE_ICONS[item.type] ?? 'file-text'}
              title={item.title}
              description={[item.type, age(item.at), item.files.length ? `${item.files.length} file${item.files.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
              current={item.id === read(selected)}
              onPress={() => set(selected, item.id === read(selected) ? null : item.id)}
            />
          ))}
        </List>
      ) : null}
      <Collapsible title="Remember something" description={project ? `Saved to ${project}` : 'Saved without a project'}>
        <Stack gap="xs">
          <Textarea
            label="Memory"
            labelHidden
            placeholder="A decision, a gotcha, a preference"
            rows={3}
            value={read(draft)}
            onChange={(value) => {
              set(draft, value)
              set(note, null)
            }}
            onSubmit={save}
          />
          <Button variant="solid" icon="add" onPress={save} disabled={!read(draft).trim()}>
            Save memory
          </Button>
        </Stack>
      </Collapsible>
    </Stack>
  )
}
