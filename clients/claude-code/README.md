# leis-mcp in Claude Code

## Install

1. Install Node.js 22 or later, git 2.37 or later and ripgrep.
2. Get leis-mcp from the source code and build it:

   ```sh
   git clone https://github.com/viniciusdsandrade/brasil-legislacao-mcp
   cd brasil-legislacao-mcp
   npm ci
   npm run build
   ```

3. Run the first sync. It clones the corpus and makes the index:

   ```sh
   node dist/cli.js sync
   ```

4. Add the server to Claude Code for all your projects. Replace `<project-folder>` with the folder of step 2:

   ```sh
   claude mcp add leis -s user -- node <project-folder>/dist/cli.js
   ```

   After the release to npm, use this command:

   ```sh
   claude mcp add leis -s user -- npx -y leis-mcp
   ```

5. Start Claude Code and run `/mcp`. Make sure that `leis` is connected.

## Use a different scope

Use the same variables for `sync` and for the server. For example, to add the laws of the State of São Paulo:

```sh
LEIS_ESCOPO=constituicao,federal,estaduais/SP node dist/cli.js sync
claude mcp add leis -s user -e LEIS_ESCOPO=constituicao,federal,estaduais/SP -- node <project-folder>/dist/cli.js
```

## Use in one project only

Copy [.mcp.json](.mcp.json) to the root of the project. Claude Code asks you to approve the server the first time.

## Update the corpus

The server does not update the corpus. Run `sync` again when you want new norms. The server reads the new index at the next start.
