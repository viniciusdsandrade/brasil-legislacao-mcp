# leis-mcp in the OpenAI Codex CLI

## Install

1. Do the steps for all clients in the [clients README](../README.md#steps-for-all-clients). The first sync must end before you use the server.
2. Add the server with the command line:

   ```sh
   codex mcp add leis --env LEIS_ESCOPO=constituicao,federal -- npx -y --allow-remote=all https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.3.0/leis-mcp-0.3.0.tgz serve
   ```

   Or copy the table of [config.toml](config.toml) to `~/.codex/config.toml`. The file also sets `startup_timeout_sec = 120`, because the first `npx` run is slow. The command line does not set it.

3. Start Codex and run `/mcp`. Make sure that `leis` is in the list.

## Use the HTTP server

Start the HTTP server as the [clients README](../README.md#one-server-for-all-clients-streamable-http) tells. Then add it:

```sh
codex mcp add leis --url http://127.0.0.1:3920/mcp
```

## Notes

- Codex shows the tools as `mcp__leis__leis_buscar` and so on. The names are short, so Codex does not cut them.
- The tool schemas are flat. They have no `oneOf`, `anyOf` or `$ref`.
- Source: the Codex MCP documentation, https://learn.chatgpt.com/docs/extend/mcp?surface=cli
