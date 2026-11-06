# leis-mcp with GLM models

GLM is a family of models of Z.ai. It is not an MCP client. You add leis-mcp to the program that runs GLM. The Z.ai documentation lists Claude Code first, and also OpenCode, Crush and ZCode.

Do the steps for all clients in the [clients README](../README.md#steps-for-all-clients) first. The first sync must end before you use the server.

## Claude Code with GLM

Set Claude Code to use GLM as the Z.ai documentation tells: https://docs.z.ai/devpack/quick-start. Then add leis-mcp as the [Claude Code README](../claude-code/README.md) tells. The MCP configuration does not change.

## OpenCode

Copy the `leis` entry of [opencode.json](opencode.json) to `~/.config/opencode/opencode.json` (all projects) or to `opencode.json` in a project. `timeout` is in milliseconds.

For the HTTP server, use `"leis": { "type": "remote", "url": "http://127.0.0.1:3920/mcp" }`.

## Crush

Add this entry to the `mcp` object of `~/.config/crush/crush.json`:

```json
"leis": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "--allow-remote=all", "https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.2.1/leis-mcp-0.2.1.tgz", "serve"],
  "env": { "LEIS_ESCOPO": "constituicao,federal" }
}
```

For the HTTP server, use `"leis": { "type": "http", "url": "http://127.0.0.1:3920/mcp" }`.

## ZCode

1. Open Settings, then "MCP Servers", then "New".
2. Select stdio. Set the command to `npx` and the arguments to `-y`, `--allow-remote=all`, `<SPEC>` and `serve`. `<SPEC>` is the package URL of the [clients README](../README.md#package).
3. Add the variable `LEIS_ESCOPO` with the value `constituicao,federal`.

ZCode can also import the servers of Claude Code, Codex and OpenCode.

## Sources

- https://docs.z.ai/devpack/quick-start
- https://opencode.ai/docs/mcp-servers/
- https://github.com/charmbracelet/crush
- https://zcode.z.ai/en/docs/mcp-services
