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
        hookType: 'post_tool_use',
        sessionId,
        project: data.cwd || process.cwd(),
        cwd: data.cwd || process.cwd(),
        timestamp: new Date().toISOString(),
        data: {
          tool_name: data.tool_name,
          tool_input: data.tool_input,
          tool_output: truncate(data.tool_output, 8000),
        },
      }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // fire and forget
  }
}

function truncate(value: unknown, max: number): unknown {
  if (typeof value === 'string' && value.length > max) {
    return value.slice(0, max) + '\n[...truncated]'
  }
  if (typeof value === 'object' && value !== null) {
    const str = JSON.stringify(value)
    if (str.length > max) return JSON.parse(str.slice(0, max - 1) + '}')
    return value
  }
  return value
}

main()
