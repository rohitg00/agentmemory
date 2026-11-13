import { assert, mockHost, mount, test } from 'orca/testing'
import * as panel from './panel'
import type { MemoryItem, ServerStatus } from './protocol'

const connected: ServerStatus = { state: 'connected', url: 'http://localhost:3111', viewerUrl: 'http://localhost:3113', project: 'myrepo', version: '0.9.33' }

const recentItem: MemoryItem = { id: 'mem_1', title: 'Deploy notes', type: 'fact', text: 'Deploys run from main.', at: null, score: null }
const foundItem: MemoryItem = { id: 'obs_1', title: 'Use pnpm', type: 'decision', text: 'The repo uses pnpm workspaces.', at: null, score: 0.8 }

function server(status: ServerStatus = connected) {
  const calls: Array<{ name: string; input: unknown }> = []
  const saved: string[] = []
  const host = mockHost({
    requests: {
      'memory.status': () => status,
      'memory.recent': (input) => {
        calls.push({ name: 'memory.recent', input })
        return { items: saved.length ? [{ ...recentItem, id: 'mem_new', title: saved[saved.length - 1] }, recentItem] : [recentItem], error: null }
      },
      'memory.search': (input) => {
        calls.push({ name: 'memory.search', input })
        return { items: [foundItem], error: null }
      },
      'memory.save': (input) => {
        calls.push({ name: 'memory.save', input })
        saved.push(input.content)
        return { saved: { ...recentItem, id: 'mem_new', title: input.content }, error: null }
      }
    }
  })
  return { host, calls }
}

test('shows recent memories for the focused project and searches', async () => {
  const { host, calls } = server()
  const view = await mount(panel, { host })
  await view.settled()
  assert.ok(view.find({ text: 'connected' }))
  assert.ok(view.find({ label: 'Deploy notes' }))
  assert.deepEqual(calls[0], { name: 'memory.recent', input: { scope: 'project' } })

  await view.type({ label: 'Search memories' }, 'pnpm', { submit: true })
  assert.ok(view.find({ label: 'Use pnpm' }))
  assert.ok(view.find({ text: 'Results for "pnpm"' }))
  assert.deepEqual(calls.at(-1), { name: 'memory.search', input: { query: 'pnpm', scope: 'project' } })

  await view.toggle({ label: 'Only myrepo' })
  assert.deepEqual(calls.at(-1), { name: 'memory.search', input: { query: 'pnpm', scope: 'all' } })

  await view.press({ text: 'Show recent' })
  assert.ok(view.find({ label: 'Deploy notes' }))
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})

test('saves a memory and shows it in the recent list', async () => {
  const { host, calls } = server()
  const view = await mount(panel, { host })
  await view.settled()
  await view.type({ label: 'Remember something' }, 'Prefer small PRs')
  await view.press({ text: 'Save memory' })
  assert.deepEqual(calls.find((call) => call.name === 'memory.save'), { name: 'memory.save', input: { content: 'Prefer small PRs', scope: 'project' } })
  assert.ok(view.find({ text: 'Saved.' }))
  assert.ok(view.find({ label: 'Prefer small PRs' }))
  assert.equal(view.valueOf({ label: 'Remember something' }), '')
  assert.deepEqual(view.errors, [])
  await view.unmount()
})

test('explains how to start agentmemory when it is offline', async () => {
  const { host } = server({ state: 'unreachable', url: 'http://localhost:3111', viewerUrl: 'http://localhost:3113', project: null, message: 'agentmemory is not running at this URL. Start it with: npx @agentmemory/agentmemory' })
  const view = await mount(panel, { host })
  await view.settled()
  assert.ok(view.find({ text: 'offline' }))
  assert.ok(view.find({ label: "Can't reach agentmemory" }))
  assert.ok(view.find({ text: 'agentmemory is not running at this URL. Start it with: npx @agentmemory/agentmemory' }))
  assert.deepEqual(view.errors, [])
  await view.unmount()
})
