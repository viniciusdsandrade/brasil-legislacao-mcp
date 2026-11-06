# leis-mcp in Claude Code

## Install

1. Install Node.js 22 or later, git 2.37 or later and ripgrep.
2. Run the first sync. It clones the corpus and makes the index:

   ```sh
   LEIS_ESCOPO=constituicao,federal npx -y --allow-remote=all https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.1.0/leis-mcp-0.1.0.tgz sync
   ```

3. Add the server to Claude Code for all your projects:

   ```sh
   claude mcp add leis -s user -e LEIS_ESCOPO=constituicao,federal -- npx -y --allow-remote=all https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.1.0/leis-mcp-0.1.0.tgz serve
   ```

4. Start Claude Code and run `/mcp`. Make sure that `leis` is connected. If the first start is slow, start Claude Code with `MCP_TIMEOUT=120000`. The value is in milliseconds.

## Use a different scope

Use the same variables for `sync` and for the server. For example, to add the laws of the State of São Paulo:

```sh
LEIS_ESCOPO=constituicao,federal,estaduais/SP npx -y --allow-remote=all https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.1.0/leis-mcp-0.1.0.tgz sync
claude mcp add leis -s user -e LEIS_ESCOPO=constituicao,federal,estaduais/SP -- npx -y --allow-remote=all https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.1.0/leis-mcp-0.1.0.tgz serve
```

## Use in one project only

Copy [.mcp.json](.mcp.json) to the root of the project. Claude Code asks you to approve the server the first time.

## Use the HTTP server

Start the HTTP server as the [clients README](../README.md#one-server-for-all-clients-streamable-http) tells. Then add it:

```sh
claude mcp add --transport http -s user leis http://127.0.0.1:3920/mcp
```

In a `.mcp.json` file, the entry is `"leis": { "type": "http", "url": "http://127.0.0.1:3920/mcp" }`.

## Use from the source code

```sh
git clone https://github.com/viniciusdsandrade/brasil-legislacao-mcp
cd brasil-legislacao-mcp
npm ci
node dist/cli.js sync
claude mcp add leis -s user -- node "$PWD/dist/cli.js" serve
```

`npm ci` builds `dist` with the `prepare` script.

## Update the corpus

The server does not update the corpus. Run `sync` again when you want new norms. The server reads the new index when `sync` ends. You do not have to start the server again. While `sync` runs, a search can show old and new data together.
