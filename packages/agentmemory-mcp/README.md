# agentmemory-mcp

Standalone MCP server for [agentmemory](https://github.com/rohitg00/agentmemory).

This is a thin shim package that re-exposes the standalone MCP entrypoint from
[`@agentmemory/agentmemory`](https://www.npmjs.com/package/@agentmemory/agentmemory),
so MCP client configs that say `npx agentmemory-mcp` work out of the box.

## Usage

```bash
npx agentmemory-mcp
```

Or wire it into your MCP client (Claude Desktop, OpenClaw, Cursor, Codex, etc.):

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "agentmemory-mcp"]
    }
  }
}
```

This package depends on `@agentmemory/agentmemory` and forwards to its
`dist/standalone.mjs` entrypoint. If you already have `@agentmemory/agentmemory`
installed, you can call the same entrypoint directly:

```bash
npx @agentmemory/agentmemory mcp
```

Both commands do the same thing.

## Why does this package exist?

The README for `@agentmemory/agentmemory` documented `npx agentmemory-mcp`
because the package exposes a `bin` of that name. But `npx <name>` resolves
`<name>` against the npm registry, not against installed binaries, so users got
a 404. This shim publishes a real `agentmemory-mcp` package whose only job is
to forward to the canonical entrypoint.

See [issue #120](https://github.com/rohitg00/agentmemory/issues/120) for the
full story.

## License

Apache-2.0
