# @agentmemory/mcp

Standalone MCP server for [agentmemory](https://github.com/rohitg00/agentmemory).

This is a thin shim package that re-exposes the standalone MCP entrypoint from
[`@agentmemory/agentmemory`](https://www.npmjs.com/package/@agentmemory/agentmemory),
so MCP client configs that say `npx @agentmemory/mcp` work out of the box
without installing the full package first.

## Usage

```bash
npx -y @agentmemory/mcp
```

Or wire it into your MCP client (Claude Desktop, OpenClaw, Cursor, Codex, etc.):

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"]
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

The original plan in [issue #120](https://github.com/rohitg00/agentmemory/issues/120)
was to publish `agentmemory-mcp` as an unscoped package, but npm's name-similarity
policy blocks that name because of an unrelated package called `agent-memory-mcp`.
Publishing under the `@agentmemory` scope sidesteps the conflict and keeps the
"dedicated standalone package" UX — `npx @agentmemory/mcp` is one character
longer than `npx agentmemory-mcp` and works on the live registry.

## License

Apache-2.0
