import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

type Call = { url: string; method: string; auth: string | null; body: unknown }

function fakeServer(answer: (call: Call) => { status: number; body: unknown } | 'down') {
  const calls: Call[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      auth: headers.get('authorization'),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null
    }
    calls.push(call)
    const reply = answer(call)
    if (reply === 'down') throw new TypeError('fetch failed')
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { calls, restore: () => { globalThis.fetch = original } }
}

function host(settings: Record<string, string> = {}) {
  return mockHost({
    settings,
    results: {
      'workspace.readContext': { branch: 'main', displayName: 'myrepo', terminals: [] },
      'workspace.list': {
        workspaces: [{ id: 'w1', kind: 'worktree', name: 'myrepo', path: '/nonexistent/agentmemory-orca-test/myrepo', branch: 'main', hostId: null }],
        truncated: false
      }
    }
  })
}

process.env.AGENTMEMORY_SECRET = 'test-secret'

test('reports a connected server with its version and the focused project', async () => {
  const server = fakeServer(() => ({ status: 200, body: { status: 'healthy', version: '0.9.33' } }))
  try {
    const worker = await mountWorker(main, { host: host() })
    const status = await worker.request('memory.status')
    assert.deepEqual(status, { state: 'connected', url: 'http://localhost:3111', viewerUrl: 'http://localhost:3113', project: 'myrepo', version: '0.9.33' })
    assert.equal(server.calls[0].url, 'http://localhost:3111/agentmemory/health')
    assert.equal(server.calls[0].auth, 'Bearer test-secret')
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('searches the focused project and shapes the results', async () => {
  const server = fakeServer(() => ({
    status: 200,
    body: { results: [{ observation: { id: 'obs_1', title: 'Use pnpm', narrative: 'The repo uses pnpm workspaces.', type: 'decision', timestamp: '2026-11-01T00:00:00Z' }, combinedScore: 0.82 }] }
  }))
  try {
    const worker = await mountWorker(main, { host: host() })
    const scoped = await worker.request('memory.search', { query: ' pnpm ', scope: 'project' })
    assert.deepEqual(server.calls[0].body, { query: 'pnpm', limit: 15, project: 'myrepo' })
    assert.equal(server.calls[0].method, 'POST')
    assert.deepEqual(scoped, {
      items: [{ id: 'obs_1', title: 'Use pnpm', type: 'decision', text: 'The repo uses pnpm workspaces.', at: Date.parse('2026-11-01T00:00:00Z'), score: 0.82 }],
      error: null
    })
    await worker.request('memory.search', { query: 'pnpm', scope: 'all' })
    assert.deepEqual(server.calls[1].body, { query: 'pnpm', limit: 15 })
    assert.deepEqual(await worker.request('memory.search', { query: '   ', scope: 'all' }), { items: [], error: null })
    assert.equal(server.calls.length, 2)
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('lists the latest memories of the focused project', async () => {
  const server = fakeServer(() => ({
    status: 200,
    body: { memories: [{ id: 'mem_1', title: 'Deploy notes', content: 'Deploys run from main.', type: 'fact', createdAt: '2026-11-02T00:00:00Z' }, { title: 'no id' }] }
  }))
  try {
    const worker = await mountWorker(main, { host: host() })
    const recent = await worker.request('memory.recent', { scope: 'project' })
    const url = new URL(server.calls[0].url)
    assert.equal(url.pathname, '/agentmemory/memories')
    assert.equal(url.searchParams.get('project'), 'myrepo')
    assert.equal(url.searchParams.get('latest'), 'true')
    assert.deepEqual(recent.items.map((item) => item.id), ['mem_1'])
    assert.equal(recent.error, null)
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('saves a memory to the focused project', async () => {
  let reply: { status: number; body: unknown } | null = null
  const server = fakeServer((call) => reply ?? { status: 201, body: { success: true, memory: { id: 'mem_9', title: 'Prefer small PRs', content: (call.body as { content: string }).content, type: 'preference' } } })
  try {
    const worker = await mountWorker(main, { host: host() })
    const answer = await worker.request('memory.save', { content: ' Prefer small PRs ', scope: 'project' })
    assert.deepEqual(server.calls[0].body, { content: 'Prefer small PRs', project: 'myrepo' })
    assert.equal(answer.saved?.id, 'mem_9')
    assert.equal(answer.error, null)
    assert.deepEqual(await worker.request('memory.save', { content: '  ', scope: 'all' }), { saved: null, error: 'Write something to save first.' })
    assert.equal(server.calls.length, 1)
    reply = { status: 201, body: { success: false, error: 'content is required' } }
    assert.deepEqual(await worker.request('memory.save', { content: 'x', scope: 'all' }), { saved: null, error: 'content is required' })
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('explains an offline server and a rejected secret', async () => {
  let reply: 'down' | { status: number; body: unknown } = 'down'
  const server = fakeServer(() => reply)
  try {
    const worker = await mountWorker(main, { host: host() })
    const offline = await worker.request('memory.status')
    assert.equal(offline.state, 'unreachable')
    reply = { status: 401, body: { error: 'unauthorized' } }
    const rejected = await worker.request('memory.status')
    assert.equal(rejected.state, 'unauthorized')
    const search = await worker.request('memory.search', { query: 'x', scope: 'all' })
    assert.deepEqual(search.items, [])
    assert.match(search.error ?? '', /rejected the request/)
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('never sends the secret to a remote host over plain HTTP', async () => {
  const server = fakeServer(() => ({ status: 200, body: {} }))
  try {
    const worker = await mountWorker(main, { host: host({ url: 'http://memory.example.com:3111/' }) })
    const status = await worker.request('memory.status')
    assert.equal(status.state, 'refused')
    assert.equal(status.url, 'http://memory.example.com:3111')
    assert.equal(server.calls.length, 0)
    await worker.deactivate()
  } finally {
    server.restore()
  }
})
