#!/usr/bin/env node

const REST_URL = process.env['AGENTMEMORY_URL'] || 'http://localhost:3111'

async function main() {
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(input)
  } catch {
    return
  }

  const sessionId = (data.session_id as string) || `ses_${Date.now().toString(36)}`
  const project = (data.cwd as string) || process.cwd()

  try {
    const res = await fetch(`${REST_URL}/agentmemory/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, project, cwd: project }),
      signal: AbortSignal.timeout(5000),
    })

    if (res.ok) {
      const result = await res.json() as { context?: string }
      if (result.context) {
        process.stdout.write(result.context)
      }
    }
  } catch {
    // silently fail -- don't block Claude Code startup
  }
}

main()
