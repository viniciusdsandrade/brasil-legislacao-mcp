# leis-mcp in Google Antigravity

The Antigravity IDE and the `agy` command use the same MCP configuration.

## Install

1. Do the steps for all clients in the [clients README](../README.md#steps-for-all-clients). The first sync must end before you use the server.
2. In the IDE, open the agent panel. Click "…", then "MCP Servers", then "Manage MCP Servers", then "View raw config".
3. Add the `leis` entry of [mcp_config.json](mcp_config.json) to `mcpServers`. The file does not accept comments.
4. Save the file. Make sure that `leis` shows its five tools.

You can also use the command line. Flags must come before the name:

```sh
agy mcp add --env LEIS_ESCOPO=constituicao,federal leis -- npx -y --allow-remote=all https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.3.1/leis-mcp-0.3.1.tgz serve
```

After the command, open the raw config and make sure that `LEIS_ESCOPO` has the full value `constituicao,federal`.

## Use the HTTP server

Start the HTTP server as the [clients README](../README.md#one-server-for-all-clients-streamable-http) tells. Then use this entry:

```json
"leis": { "serverUrl": "http://127.0.0.1:3920/mcp" }
```

Or run `agy mcp add leis http://127.0.0.1:3920/mcp`.

## Notes

- Antigravity waits up to 300 seconds for a server to start. The first `npx` run fits in this time.
- Source: https://antigravity.google/docs/mcp
