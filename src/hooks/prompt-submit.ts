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

  const sessionId = (data.session_id as string) || 'unknown'

  try {
    await fetch(`${REST_URL}/agentmemory/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hookType: 'prompt_submit',
        sessionId,
        project: data.cwd || process.cwd(),
        cwd: data.cwd || process.cwd(),
        timestamp: new Date().toISOString(),
        data: { prompt: data.prompt },
      }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // fire and forget
  }
}

main()
