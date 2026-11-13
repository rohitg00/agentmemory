import {
  atom,
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Heading,
  Input,
  Link,
  List,
  ListItem,
  on,
  plugin,
  read,
  RelativeTime,
  Row,
  set,
  Spinner,
  Stack,
  Switch,
  Text,
  Textarea,
  type PanelContext
} from 'orca'
import type { MemoryItem, ServerStatus } from './protocol'

const status = atom<ServerStatus | null>(null)
const projectOnly = atom('projectOnly', true, { persist: 'plugin' })
const query = atom('')
const lastQuery = atom<string | null>(null)
const items = atom<MemoryItem[]>([])
const listError = atom<string | null>(null)
const loading = atom(false)
const selected = atom<string | null>(null)
const draft = atom('')
const saveNote = atom<{ tone: 'success' | 'danger'; text: string } | null>(null)

function scope(): 'project' | 'all' {
  return read(projectOnly) ? 'project' : 'all'
}

async function refreshStatus(): Promise<void> {
  set(status, await plugin.request('memory.status'))
}

async function loadList(): Promise<void> {
  set(loading, true)
  const text = read(lastQuery)
  try {
    const answer = text
      ? await plugin.request('memory.search', { query: text, scope: scope() })
      : await plugin.request('memory.recent', { scope: scope() })
    set(items, answer.items)
    set(listError, answer.error)
  } finally {
    set(loading, false)
  }
}

async function search(value?: string): Promise<void> {
  const text = (value ?? read(query)).trim()
  set(lastQuery, text || null)
  set(selected, null)
  await loadList()
}

async function clearSearch(): Promise<void> {
  set(query, '')
  await search('')
}

async function save(): Promise<void> {
  const answer = await plugin.request('memory.save', { content: read(draft), scope: scope() })
  if (answer.error) {
    set(saveNote, { tone: 'danger', text: answer.error })
    return
  }
  set(draft, '')
  set(saveNote, { tone: 'success', text: 'Saved.' })
  if (!read(lastQuery)) await loadList()
}

async function refresh(): Promise<void> {
  await refreshStatus()
  await loadList()
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(on('workspace.changed', () => void refresh().catch(() => undefined)))
  void refresh().catch(() => undefined)
}

function statusBadge(value: ServerStatus | null) {
  if (!value) return <Badge>checking</Badge>
  if (value.state === 'connected') return <Badge tone="success">connected</Badge>
  if (value.state === 'unauthorized') return <Badge tone="warning">secret rejected</Badge>
  return <Badge tone="danger">offline</Badge>
}

function MemoryDetail({ item }: { item: MemoryItem }) {
  return (
    <Card title={item.title} description={item.type}>
      <Stack gap="xs">
        <Text size="sm">{item.text || 'No text stored.'}</Text>
        {item.at !== null ? (
          <Text muted size="xs">
            Saved <RelativeTime at={item.at} format="long" />
          </Text>
        ) : null}
        <Button variant="ghost" size="sm" onPress={() => set(selected, null)}>
          Close
        </Button>
      </Stack>
    </Card>
  )
}

export default function Panel() {
  const server = read(status)
  const list = read(items)
  const chosen = list.find((item) => item.id === read(selected)) ?? null
  const searching = read(lastQuery)
  const note = read(saveNote)
  const project = server?.project ?? null
  return (
    <Stack gap="md">
      <Row justify="between">
        <Heading>agentmemory</Heading>
        {statusBadge(server)}
      </Row>
      {server && server.state !== 'connected' ? (
        <Callout tone={server.state === 'unauthorized' ? 'warning' : 'danger'} title="Can't reach agentmemory">
          <Stack gap="xs">
            <Text size="sm">{server.message}</Text>
            <Text muted size="xs">{server.url}</Text>
            <Button variant="outline" size="sm" onPress={refresh}>
              Try again
            </Button>
          </Stack>
        </Callout>
      ) : null}
      <Switch
        label={project ? `Only ${project}` : 'Only this workspace'}
        checked={read(projectOnly)}
        disabled={!project}
        onChange={(checked) => {
          set(projectOnly, checked)
          void loadList()
        }}
      />
      <Row gap="xs">
        <Input
          label="Search memories"
          labelHidden
          type="search"
          placeholder="Search memories"
          value={read(query)}
          onChange={(value) => set(query, value)}
          onSubmit={(value) => search(value)}
        />
        <Button onPress={() => search()}>Search</Button>
      </Row>
      <Row justify="between">
        <Text weight="medium">{searching ? `Results for "${searching}"` : 'Recent memories'}</Text>
        {searching ? (
          <Button variant="ghost" size="sm" onPress={clearSearch}>
            Show recent
          </Button>
        ) : null}
      </Row>
      {read(loading) ? <Spinner label="Loading memories" /> : null}
      {read(listError) ? <Text tone="danger" size="sm">{read(listError)}</Text> : null}
      {chosen ? <MemoryDetail item={chosen} /> : null}
      {!read(loading) && !read(listError) && list.length === 0 ? (
        <EmptyState
          title={searching ? 'No matching memories' : 'No memories yet'}
          description={searching ? 'Try other words, or turn off the workspace filter.' : 'Memories your agents save, and the ones you save below, show up here.'}
        />
      ) : null}
      {list.length > 0 ? (
        <List label={searching ? 'Search results' : 'Recent memories'}>
          {list.map((item) => (
            <ListItem
              key={item.id}
              title={item.title}
              description={`${item.type}${item.text ? ` · ${item.text.slice(0, 120)}` : ''}`}
              current={item.id === read(selected)}
              onPress={() => set(selected, item.id === read(selected) ? null : item.id)}
            />
          ))}
        </List>
      ) : null}
      <Textarea
        label="Remember something"
        placeholder="A decision, a gotcha, a preference"
        rows={3}
        value={read(draft)}
        onChange={(value) => {
          set(draft, value)
          set(saveNote, null)
        }}
        onSubmit={save}
      />
      <Row justify="between">
        <Button variant="outline" onPress={save} disabled={!read(draft).trim()}>
          Save memory
        </Button>
        {server ? <Link href={server.viewerUrl}>Open viewer</Link> : null}
      </Row>
      {note ? <Text tone={note.tone} size="sm">{note.text}</Text> : null}
    </Stack>
  )
}
