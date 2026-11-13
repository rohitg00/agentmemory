import { assert, mockHost, mount, test } from 'orca/testing'
import * as panel from './panel'
import type { MemoryItem, ServerStatus } from './protocol'

const connected: ServerStatus = {
  state: 'connected',
  url: 'http://localhost:3111',
  viewerUrl: 'http://localhost:3113',
  project: 'myrepo',
  version: '0.9.33',
  counts: { project: 4, all: 7 }
}

const recentItem: MemoryItem = { id: 'mem_1', title: 'Deploy notes', type: 'fact', text: 'Deploys run from main.', files: ['deploy/README.md'], at: null, score: null }
const foundItem: MemoryItem = { id: 'obs_1', title: 'Use pnpm', type: 'decision', text: 'The repo uses pnpm workspaces.', files: [], at: null, score: 0.8 }

function server(status: ServerStatus = connected) {
  const calls: Array<{ name: string; input: unknown }> = []
  const saved: string[] = []
  const host = mockHost({
    requests: {
      'memory.status': () => status,
      'memory.recent': (input) => {
        calls.push({ name: 'memory.recent', input })
        const items = saved.length ? [{ ...recentItem, id: 'mem_new', title: saved[saved.length - 1], files: [] }, recentItem] : [recentItem]
        return { items, project: input.scope === 'project' ? 'myrepo' : null, error: null }
      },
      'memory.search': (input) => {
        calls.push({ name: 'memory.search', input })
        return { items: [foundItem], project: input.scope === 'project' ? 'myrepo' : null, error: null }
      },
      'memory.save': (input) => {
        calls.push({ name: 'memory.save', input })
        saved.push(input.content)
        return { saved: { ...recentItem, id: 'mem_new', title: input.content }, error: null }
      },
      'memory.agents': () => ({ agents: [{ terminalId: 't1', title: 'Claude Code', agent: 'claude', state: 'working' }] }),
      'memory.sendToAgent': (input) => {
        calls.push({ name: 'memory.sendToAgent', input })
        return { ok: true, message: null }
      },
      'memory.openFile': (input) => {
        calls.push({ name: 'memory.openFile', input })
        return { ok: true, message: null }
      },
      'memory.openViewer': () => {
        calls.push({ name: 'memory.openViewer', input: null })
        return { ok: true, message: null }
      }
    }
  })
  return { host, calls }
}

test('shows counts and recent memories for the focused project, then searches', async () => {
  const { host, calls } = server()
  const view = await mount(panel, { host })
  await view.settled()
  assert.ok(view.find({ text: 'v0.9.33' }))
  const counts = view.find({ label: 'Memory counts' })
  assert.match(counts?.text ?? '', /In myrepo\s*4/)
  assert.match(counts?.text ?? '', /In all projects\s*7/)
  assert.ok(view.find({ label: 'Deploy notes' }))
  assert.deepEqual(calls.find((call) => call.name === 'memory.recent'), { name: 'memory.recent', input: { scope: 'project' } })

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

test('opens a memory, its files in Orca, and sends it to an agent', async () => {
  const { host, calls } = server()
  const view = await mount(panel, { host })
  await view.settled()
  await view.press({ label: 'Deploy notes' })
  assert.ok(view.find({ text: 'Deploys run from main.' }))
  await view.press({ label: 'deploy/README.md' })
  assert.deepEqual(calls.find((call) => call.name === 'memory.openFile'), { name: 'memory.openFile', input: { path: 'deploy/README.md' } })
  await view.press({ text: 'Send to agent' })
  assert.deepEqual(calls.find((call) => call.name === 'memory.sendToAgent'), {
    name: 'memory.sendToAgent',
    input: { terminalId: 't1', text: 'Deploy notes. Deploys run from main.' }
  })
  assert.ok(view.find({ text: 'Sent to the agent prompt. Press Enter in its terminal to submit.' }))
  await view.press({ label: 'Open the viewer in Orca' })
  assert.ok(calls.some((call) => call.name === 'memory.openViewer'))
  assert.deepEqual(view.errors, [])
  await view.unmount()
})

test('saves a memory and shows it in the recent list', async () => {
  const { host, calls } = server()
  const view = await mount(panel, { host })
  await view.settled()
  await view.toggle({ label: 'Remember something' })
  await view.type({ label: 'Memory' }, 'Prefer small PRs')
  await view.press({ text: 'Save memory' })
  assert.deepEqual(calls.find((call) => call.name === 'memory.save'), { name: 'memory.save', input: { content: 'Prefer small PRs', scope: 'project' } })
  assert.ok(view.find({ text: 'Saved to agentmemory.' }))
  assert.ok(view.find({ label: 'Prefer small PRs' }))
  assert.deepEqual(view.errors, [])
  await view.unmount()
})

test('refreshes when the panel is shown again', async () => {
  const { host, calls } = server()
  const view = await mount(panel, { host })
  await view.settled()
  const before = calls.filter((call) => call.name === 'memory.recent').length
  await view.setVisible(false)
  await view.setVisible(true)
  await new Promise((resolve) => setTimeout(resolve, 20))
  await view.settled()
  assert.ok(calls.filter((call) => call.name === 'memory.recent').length > before)
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
