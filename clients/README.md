# Clients

Each folder has the installation files for one MCP client. The core of leis-mcp does not change for a client. Only the configuration file changes.

| Folder | Client | Status |
| --- | --- | --- |
| [claude-code](claude-code/README.md) | Claude Code | Ready |
| [codex](codex/README.md) | OpenAI Codex CLI | Ready |
| [grok](grok/README.md) | xAI Grok CLI (`grok`) | Ready |
| [antigravity](antigravity/README.md) | Google Antigravity (IDE and `agy`) | Ready |
| [glm](glm/README.md) | GLM models of Z.ai, through Claude Code, OpenCode, Crush or ZCode | Ready |

## Package

All clients start the same package from the GitHub release:

```text
https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.1.0/leis-mcp-0.1.0.tgz
```

In this folder, the text `<SPEC>` means this URL. The package is not in the npm registry.

## Steps for all clients

1. Install Node.js 22 or later, git 2.37 or later and ripgrep.
2. Run the first sync. Use the same variables that you give to the server:

   ```sh
   LEIS_ESCOPO=constituicao,federal npx -y https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.1.0/leis-mcp-0.1.0.tgz sync
   ```

3. Add the server to the client. Follow the README of the client.

## Startup time

The first `npx` run downloads the package and `better-sqlite3`. This can take one minute. Some clients stop a server that does not start in 10 or 30 seconds. Do one of these:

- Run `npx -y <SPEC> --version` one time before you start the client.
- Increase the startup timeout of the client. Each client README tells how.

## One server for all clients (Streamable HTTP)

Start the server in a terminal and keep the terminal open:

```sh
LEIS_ESCOPO=constituicao,federal npx -y https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.1.0/leis-mcp-0.1.0.tgz http
```

The server listens at `http://127.0.0.1:3920/mcp`. It accepts only local connections and has no authentication. Do not expose it to a network. Each client README shows the HTTP configuration. Use stdio or HTTP for the name `leis`, not both.

## Add a client

Make a new folder with a README and the configuration file of the client. Use the command `npx -y <SPEC> serve` (stdio) or the URL `http://127.0.0.1:3920/mcp`, and the environment variables of the main [README](../README.md#configuration).
