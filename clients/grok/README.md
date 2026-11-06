# leis-mcp in the xAI Grok CLI

This guide is for the official `grok` command of xAI.

## Install

1. Do the steps for all clients in the [clients README](../README.md#steps-for-all-clients). The first sync must end before you use the server.
2. Add the server with the command line. Put the server command after `--`, so that `grok` does not read `-y`:

   ```sh
   grok mcp add -e LEIS_ESCOPO=constituicao,federal leis -- npx -y --allow-remote=all https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.2.1/leis-mcp-0.2.1.tgz serve
   ```

   Add `-s project` to write `.grok/config.toml` in the current project. The default is `~/.grok/config.toml`.

   Or copy the table of [config.toml](config.toml). The file also sets `startup_timeout_sec = 120`, because the first `npx` run is slow.

3. Run `grok mcp doctor leis` to check the server.

## Use the HTTP server

Start the HTTP server as the [clients README](../README.md#one-server-for-all-clients-streamable-http) tells. Then add it:

```sh
grok mcp add leis http://127.0.0.1:3920/mcp
```

`grok` selects the HTTP transport for an `http://` URL.

## Notes

- `grok` also reads `.mcp.json` and `~/.claude.json`. If the server is there, you do not have to add it again.
- Source: https://docs.x.ai/build/features/mcp-servers
