import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

type Call = { url: string; method: string; auth: string | null; body: unknown }
type Reply = { status: number; body: unknown } | 'down'

function fakeServer(answer: (call: Call) => Reply) {
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

const WORKSPACE_PATH = '/nonexistent/agentmemory-orca-test/myrepo'

const LOCAL_ROW = { id: 'w1', kind: 'worktree', name: 'myrepo', path: WORKSPACE_PATH, branch: 'main', hostId: null }

function host(
  settings: Record<string, string | boolean> = {},
  readContext: unknown = { branch: 'main', displayName: 'myrepo', terminals: [] },
  workspaces: unknown[] = [LOCAL_ROW]
) {
  return mockHost({
    settings,
    results: {
      'workspace.readContext': readContext,
      'workspace.list': {
        workspaces,
        truncated: false
      },
      'agents.list': {
        agents: [
          { terminalId: 't1', title: 'Claude Code', agent: 'claude', state: 'working', stateStartedAt: 0 },
          { terminalId: null, title: 'Detached', agent: 'codex', state: 'done', stateStartedAt: 0 }
        ]
      },
      'terminal.sendText': { accepted: true },
      'editor.open': { opened: true },
      'statusBar.update': {}
    }
  })
}

function healthy(call: Call): Reply {
  const url = new URL(call.url)
  if (url.pathname.endsWith('/health')) return { status: 200, body: { status: 'healthy', version: '0.9.33' } }
  if (url.searchParams.get('count') === 'true') return { status: 200, body: { total: 9, latestCount: url.searchParams.get('project') ? 4 : 7 } }
  return { status: 404, body: { error: 'unexpected' } }
}

process.env.AGENTMEMORY_SECRET = 'test-secret'

test('reports a connected server with its version, project and memory counts', async () => {
  const server = fakeServer(healthy)
  try {
    const worker = await mountWorker(main, { host: host() })
    const status = await worker.request('memory.status')
    assert.deepEqual(status, {
      state: 'connected',
      url: 'http://localhost:3111',
      viewerUrl: 'http://localhost:3113',
      project: 'myrepo',
      version: '0.9.33',
      counts: { project: 4, all: 7 },
      degraded: false
    })
    assert.ok(server.calls.every((call) => call.auth === 'Bearer test-secret'))
    assert.ok(server.calls.some((call) => new URL(call.url).searchParams.get('project') === 'myrepo'))
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('searches the focused project, expands the hits and shapes the results', async () => {
  const server = fakeServer((call) => {
    if (!call.url.endsWith('/smart-search')) return healthy(call)
    const body = call.body as { expandIds?: unknown }
    if (body.expandIds) {
      return {
        status: 200,
        body: {
          mode: 'expanded',
          results: [
            {
              obsId: 'mem_1',
              sessionId: 'memory',
              observation: { id: 'mem_1', title: 'Use pnpm', narrative: 'The repo uses pnpm workspaces.', type: 'decision', memoryType: 'preference', files: ['package.json', 7], timestamp: '2026-11-01T00:00:00Z' }
            }
          ]
        }
      }
    }
    return {
      status: 200,
      body: {
        mode: 'compact',
        results: [{ obsId: 'mem_1', sessionId: 'memory', layer: 'memory', title: 'Use pnpm', type: 'decision', memoryType: 'preference', score: 0.82, timestamp: '2026-11-01T00:00:00Z' }]
      }
    }
  })
  try {
    const worker = await mountWorker(main, { host: host() })
    const scoped = await worker.request('memory.search', { query: ' pnpm ', scope: 'project' })
    const searches = server.calls.filter((call) => call.url.endsWith('/smart-search'))
    assert.deepEqual(searches.at(-2)?.body, { query: 'pnpm', limit: 15, project: 'myrepo' })
    assert.deepEqual(searches.at(-1)?.body, { expandIds: [{ obsId: 'mem_1', sessionId: 'memory' }], project: 'myrepo' })
    assert.deepEqual(scoped, {
      items: [{ id: 'mem_1', title: 'Use pnpm', type: 'preference', text: 'The repo uses pnpm workspaces.', files: ['package.json'], at: Date.parse('2026-11-01T00:00:00Z'), score: 0.82 }],
      project: 'myrepo',
      error: null
    })
    const all = await worker.request('memory.search', { query: 'pnpm', scope: 'all' })
    assert.equal(all.project, null)
    assert.deepEqual(server.calls.filter((call) => call.url.endsWith('/smart-search')).at(-2)?.body, { query: 'pnpm', limit: 15 })
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('lists the latest memories of the focused project', async () => {
  const server = fakeServer((call) =>
    call.url.includes('limit=20')
      ? { status: 200, body: { memories: [{ id: 'mem_1', title: 'Deploy notes', content: 'Deploys run from main.', type: 'fact', createdAt: '2026-11-02T00:00:00Z' }, { title: 'no id' }] } }
      : healthy(call)
  )
  try {
    const worker = await mountWorker(main, { host: host() })
    const recent = await worker.request('memory.recent', { scope: 'project' })
    const url = new URL(server.calls.filter((call) => call.url.includes('limit=20')).at(-1)!.url)
    assert.equal(url.searchParams.get('project'), 'myrepo')
    assert.equal(url.searchParams.get('latest'), 'true')
    assert.deepEqual(recent.items.map((item) => item.id), ['mem_1'])
    assert.equal(recent.project, 'myrepo')
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('saves a memory to the focused project and reports soft failures', async () => {
  let reply: Reply | null = null
  const server = fakeServer((call) =>
    call.url.endsWith('/remember')
      ? reply ?? { status: 201, body: { success: true, memory: { id: 'mem_9', title: 'Prefer small PRs', content: (call.body as { content: string }).content, type: 'preference' } } }
      : healthy(call)
  )
  try {
    const worker = await mountWorker(main, { host: host() })
    const answer = await worker.request('memory.save', { content: ' Prefer small PRs ', scope: 'project' })
    assert.deepEqual(server.calls.find((call) => call.url.endsWith('/remember'))?.body, { content: 'Prefer small PRs', project: 'myrepo' })
    assert.equal(answer.saved?.id, 'mem_9')
    assert.deepEqual(await worker.request('memory.save', { content: '  ', scope: 'all' }), { saved: null, error: 'Write something to save first.' })
    reply = { status: 201, body: { success: false, error: 'content is required' } }
    assert.deepEqual(await worker.request('memory.save', { content: 'x', scope: 'all' }), { saved: null, error: 'content is required' })
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('refuses project-scoped requests when the focused workspace cannot be read', async () => {
  const server = fakeServer(healthy)
  try {
    const failing = host({}, () => {
      throw new Error('host busy')
    })
    const worker = await mountWorker(main, { host: failing })
    const recent = await worker.request('memory.recent', { scope: 'project' })
    assert.match(recent.error ?? '', /Orca workspace/)
    const saved = await worker.request('memory.save', { content: 'x', scope: 'project' })
    assert.match(saved.error ?? '', /Orca workspace/)
    assert.equal(server.calls.filter((call) => call.url.endsWith('/remember') || call.url.includes('limit=20')).length, 0)
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('explains an offline server and a rejected secret', async () => {
  let reply: Reply = 'down'
  const server = fakeServer(() => reply)
  try {
    const worker = await mountWorker(main, { host: host() })
    assert.equal((await worker.request('memory.status')).state, 'unreachable')
    reply = { status: 401, body: { error: 'unauthorized' } }
    assert.equal((await worker.request('memory.status')).state, 'unauthorized')
    const search = await worker.request('memory.search', { query: 'x', scope: 'all' })
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

test('lists agents with a terminal and sends a memory to one without pressing Enter', async () => {
  const server = fakeServer(healthy)
  try {
    const testHost = host()
    const worker = await mountWorker(main, { host: testHost })
    assert.deepEqual(await worker.request('memory.agents'), { agents: [{ terminalId: 't1', title: 'Claude Code', agent: 'claude', state: 'working' }] })
    assert.deepEqual(await worker.request('memory.sendToAgent', { terminalId: 't1', text: 'Use pnpm.\n The repo uses pnpm.' }), { ok: true, message: null })
    const sent = testHost.calls.find((call) => call.method === 'terminal.sendText')
    assert.deepEqual(sent?.params, { terminalId: 't1', text: 'Context from agentmemory: Use pnpm. The repo uses pnpm.', enter: false })
    assert.deepEqual(await worker.request('memory.sendToAgent', { terminalId: 't1', text: '  ' }), { ok: false, message: 'Nothing to send.' })
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('opens files of the focused workspace in Orca and refuses paths outside it', async () => {
  const server = fakeServer(healthy)
  try {
    const testHost = host()
    const worker = await mountWorker(main, { host: testHost })
    assert.deepEqual(await worker.request('memory.openFile', { path: 'src/index.ts' }), { ok: true, message: null })
    assert.deepEqual(testHost.calls.find((call) => call.method === 'editor.open')?.params, { workspaceId: 'w1', path: 'src/index.ts' })
    assert.equal((await worker.request('memory.openFile', { path: '../other/secret.txt' })).ok, false)
    assert.equal((await worker.request('memory.openFile', { path: '/etc/hosts' })).ok, false)
    assert.equal(testHost.calls.filter((call) => call.method === 'editor.open').length, 1)
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('captures agent tool calls only when the capture setting is on', async () => {
  const server = fakeServer((call) => (call.url.endsWith('/observe') ? { status: 201, body: { status: 'accepted' } } : healthy(call)))
  const event = { agent: 'codex', workspaceId: 'w1', terminalId: 't9', tool: 'shell', input: { command: 'npm test' }, callId: 'call_12345678', output: 'x'.repeat(9000) }
  try {
    const off = await mountWorker(main, { host: host() })
    await off.hooks.fire('agent.tool.after', event)
    assert.equal(server.calls.filter((call) => call.url.endsWith('/observe')).length, 0)
    await off.deactivate()

    const on = await mountWorker(main, { host: host({ capture: true }) })
    await on.hooks.fire('agent.tool.after', event)
    const observed = server.calls.filter((call) => call.url.endsWith('/observe'))
    assert.equal(observed.length, 1)
    const body = observed[0].body as Record<string, unknown> & { data: Record<string, unknown> }
    assert.equal(body.hookType, 'post_tool_use')
    assert.match(body.sessionId as string, /^orca-codex-t9-[0-9a-z]+$/)
    assert.equal(body.project, 'myrepo')
    assert.equal(body.cwd, WORKSPACE_PATH)
    assert.equal(body.eventId, 'orca:call_12345678')
    assert.equal(body.data.tool_name, 'shell')
    assert.deepEqual(body.data.tool_input, { command: 'npm test' })
    assert.equal((body.data.tool_output as string).length, 8001)
    await on.hooks.fire('agent.tool.after', { ...event, workspaceId: 'remote-or-unknown' })
    assert.equal(server.calls.filter((call) => call.url.endsWith('/observe')).length, 1)
    await on.deactivate()
  } finally {
    server.restore()
  }
})

test('reports a degraded server when health answers 503', async () => {
  const server = fakeServer((call) =>
    new URL(call.url).pathname.endsWith('/health') ? { status: 503, body: { status: 'critical', version: '0.9.33' } } : healthy(call)
  )
  try {
    const worker = await mountWorker(main, { host: host() })
    const status = await worker.request('memory.status')
    assert.equal(status.state, 'connected')
    assert.equal(status.state === 'connected' && status.degraded, true)
    await worker.deactivate()
  } finally {
    server.restore()
  }
})

test('matches folder workspaces, and never guesses between duplicate or remote workspaces', async () => {
  const server = fakeServer((call) => (call.url.includes('limit=20') ? { status: 200, body: { memories: [] } } : healthy(call)))
  try {
    const folder = await mountWorker(main, { host: host({}, undefined, [{ ...LOCAL_ROW, kind: 'folder', branch: null }]) })
    assert.equal((await folder.request('memory.recent', { scope: 'project' })).project, 'myrepo')
    await folder.deactivate()

    const twins = await mountWorker(main, { host: host({}, undefined, [LOCAL_ROW, { ...LOCAL_ROW, id: 'w2', path: '/nonexistent/other/myrepo' }]) })
    const twin = await twins.request('memory.recent', { scope: 'project' })
    assert.match(twin.error ?? '', /Orca workspace/)
    await twins.deactivate()

    const remote = await mountWorker(main, { host: host({}, undefined, [LOCAL_ROW, { ...LOCAL_ROW, id: 'r1', hostId: 'ssh-box' }]) })
    assert.match((await remote.request('memory.recent', { scope: 'project' })).error ?? '', /Orca workspace/)
    await remote.deactivate()

    const remoteOnly = await mountWorker(main, { host: host({}, undefined, [{ ...LOCAL_ROW, id: 'r1', hostId: 'ssh-box' }]) })
    assert.equal((await remoteOnly.request('memory.recent', { scope: 'project' })).project, null)
    await remoteOnly.deactivate()
  } finally {
    server.restore()
  }
})

test('keeps text sent to an agent within the terminal limit', () => {
  assert.equal(main.sendTextFor('x'.repeat(10_000)).length, 4096)
  assert.equal(main.sendTextFor('Use pnpm.\n The repo uses pnpm.'), 'Context from agentmemory: Use pnpm. The repo uses pnpm.')
})

test('starts a new session for each agent launch and resends captures after the server returns', async () => {
  let down = true
  const server = fakeServer((call) => {
    if (call.url.endsWith('/observe')) return down ? 'down' : { status: 201, body: { status: 'accepted' } }
    return healthy(call)
  })
  const event = { agent: 'codex', workspaceId: 'w1', terminalId: 't9', tool: 'shell', input: { command: 'ls' }, callId: 'call_abcdefgh' }
  try {
    const worker = await mountWorker(main, { host: host({ capture: true }) })
    await worker.hooks.fire('agent.tool.after', event)
    down = false
    await worker.hooks.fire('agent.tool.after', { ...event, callId: 'call_ijklmnop' })
    const sent = server.calls.filter((call) => call.url.endsWith('/observe')).map((call) => call.body as { eventId: string; sessionId: string })
    assert.deepEqual(sent.map((body) => body.eventId), ['orca:call_abcdefgh', 'orca:call_abcdefgh', 'orca:call_ijklmnop'])
    const firstRun = sent[2].sessionId
    await new Promise((resolve) => setTimeout(resolve, 5))
    await worker.hooks.fire('agent.launch.before', { agent: 'codex', workspaceId: 'w1', workspaceKind: 'worktree', terminalId: 't9', command: 'codex', env: {} })
    await worker.hooks.fire('agent.tool.after', { ...event, callId: 'call_qrstuvwx' })
    const last = server.calls.filter((call) => call.url.endsWith('/observe')).at(-1)?.body as { sessionId: string }
    assert.notEqual(last.sessionId, firstRun)
    await worker.deactivate()
  } finally {
    server.restore()
  }
})
