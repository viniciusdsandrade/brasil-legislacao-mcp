# Implementation plan for leis-mcp

This plan is for the agents that build leis-mcp. Each work package (WP) gives the inputs, the outputs, the steps and the checks. An agent can do one work package with this file and the files that the package names.

## 1. Goal

leis-mcp is an MCP server. It finds, reads and cites the norms of the corpus [viniciusdsandrade/leis](https://github.com/viniciusdsandrade/leis). The corpus has more than one million Markdown files. Each file has a YAML header.

The first target client is Claude Code. Codex, Grok, Antigravity, GLM and other harnesses come later. They use the same core. Only the files in `clients/` are different for each harness.

## 2. Rules for all agents

1. Do not build and do not run tests on the local computer. The GitHub Actions workflow does the typecheck and the tests.
2. Write TypeScript in strict mode. Use ESM and Node 22 or later.
3. Keep the core free of MCP code. Only `src/adaptadores/mcp/` imports the MCP SDK.
4. Do not write to stdout in the server. stdout is the JSON-RPC channel. Write logs to stderr. Do not use `console.log`.
5. Do not read the corpus through the GitHub API. Read the local clone only.
6. Start each subprocess with an argument list and without a shell. Put user terms after `--`.
7. Do not put user input directly into an FTS5 `MATCH` expression.
8. Do not put personal data in the code: home paths, e-mail addresses, network addresses and machine names.
9. Write commit messages in Portuguese, in the indicative mood, with a semantic prefix. Do not use dashes as punctuation. Do not mention AI. Do not add `Co-Authored-By`.
10. Write the README and the ADRs in ASD-STE100 Simplified Technical English.

## 3. Work packages

### WP0. Corpus analysis (no code)

- Inputs: `README.md`, `COBERTURA.md`, `PROGRESSO.md`, `scripts/comum.py` (`CANONICO`), `scripts/html2md.py`, a sample of each top folder, and the git log of the corpus.
- Steps:
  1. Read the inputs.
  2. Sample each top folder. Count the header keys, the path forms, the struck text, the OCR signals and the norms without text.
  3. Read the base commits of the history. Find the author, the `Co-Authored-By` lines and the `Autoria:` line.
  4. Change the tool contract when the data shows a gap. Write the reason in the ADR.
- Output: section "Corpus facts" in `docs/adr/0001-architecture-and-corpus-contract.md`.
- Check: each fact in the ADR has a number or an example from the corpus.

### WP1. Project setup

- Outputs: `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `.gitignore`.
- Steps:
  1. Set `"type": "module"`, `"engines": { "node": ">=22" }` and the `bin` entry `leis-mcp`.
  2. Use the latest stable line of the official SDK (`@modelcontextprotocol/server` 2.x).
  3. Use `better-sqlite3`. Its bundled SQLite has FTS5. `node:sqlite` does not always have FTS5.
  4. Make the lock file without an install (`npm install --package-lock-only --ignore-scripts`).
- Check: `npx leis-mcp` starts `dist/cli.js` after `npm run build`.

### WP2. Core domain

- Outputs: `src/core/*.ts`.
- Modules: types and errors, text helpers, vocabulary (`CANONICO`), paths and scope, header parser, document analysis, struck text, provisions, citations, FTS5 query, cursor, token budget, coverage, authorship parser, record builder, ports, service, sync use case.
- Steps:
  1. Write the ports in `src/core/portas.ts` first. The other work packages use them.
  2. Keep each module pure. Use no file system, no process and no SDK in the core.
- Check: no file in `src/core/` imports from `src/adaptadores/` or from the SDK.

### WP3. Index adapter (SQLite FTS5)

- Output: `src/adaptadores/sqlite/indice.ts`.
- Steps:
  1. Make the table `normas` and the FTS5 table `normas_fts` with `tokenize='unicode61 remove_diacritics 2'`.
  2. Put the header fields and the summary in the index. Put the body in the index only for the paths in `LEIS_CORPO`.
  3. Open the index read-only in the server.
- Check: a search for `acao` finds `ação`.

### WP4. Git adapter and sync

- Outputs: `src/adaptadores/processo.ts`, `src/adaptadores/git.ts`, `src/core/sincronizacao.ts`.
- Steps:
  1. Clone with `--filter=blob:none --sparse`. Set the sparse checkout from `LEIS_ESCOPO` (sphere and UF).
  2. Update with `git pull --ff-only`.
  3. Read the changes from the indexed commit to `HEAD` with `git diff --name-status --no-renames`.
  4. Index the changes in batches. Do not keep the full list in memory.
  5. Read the authorship from the base commits with `git log --no-renames --diff-filter=A --full-diff --grep=^Autoria:`.
  6. Write the new commit to the index only after all batches are done.
- Check: a second sync without changes reports zero changes.

### WP5. Text search adapter (ripgrep)

- Output: `src/adaptadores/ripgrep.ts`.
- Steps:
  1. Search only the folders of the filter.
  2. Use `--no-config`. Do not use `--pre`. Put the pattern after `--`.
- Check: a unit test reads the argument list.

### WP6. Service and response contract

- Output: `src/core/servico.ts`.
- Steps:
  1. Give compact items: `caminho`, `titulo`, `tipo`, `numero`, `data`, `uf`, short `ementa`, `situacao`, `fonte`.
  2. Always give `fonte`, `versao_texto` and `baixado_em`. Mark OCR text.
  3. For an empty result, give the coverage of the slice. Absence in the corpus does not prove that the norm does not exist.
  4. Give errors with the next step.
  5. Keep each response in the token budget. Give a cursor for the remaining part.
- Check: the tests of the service read the fixtures.

### WP7. MCP adapter and CLI

- Outputs: `src/adaptadores/mcp/esquemas.ts`, `src/adaptadores/mcp/servidor.ts`, `src/cli.ts`.
- Steps:
  1. Register `leis_buscar`, `leis_obter`, `leis_facetas`, `leis_cobertura` and `leis_autoria` with `readOnlyHint` and `idempotentHint`.
  2. Write flat JSON Schemas. Do not use `oneOf`, `anyOf`, `allOf` or `$ref`.
  3. Register the resource template `leis://{caminho}`.
  4. Serve stdio with `serveStdio`. Open the index only at the first tool call.
- Check: an in-memory client lists the tools and reads a resource.

### WP8. Tests and CI

- Outputs: `test/**`, `.github/workflows/ci.yml`.
- Steps:
  1. Use small fixtures in `test/fixtures/acervo/`.
  2. Test the core, the index, the sync with a local git repository, the security rules and the MCP adapter.
  3. Run the typecheck, the tests and the build on Node 22 and Node 24.
- Check: the workflow is green on the pull request.

### WP9. Client installation

- Outputs: `clients/claude-code/README.md`, `clients/claude-code/.mcp.json`.
- Later: one folder for each other harness. Do not change the core for a harness.

### WP10. Documentation

- Outputs: `README.md`, `docs/adr/0001-architecture-and-corpus-contract.md`.

### WP11. Review and delivery

- Steps:
  1. Compare the code with the contract checklist in section 5.
  2. Make one commit for each work package.
  3. Push the branch and open a pull request.
  4. Read the CI result. Fix the errors.
  5. Write a short report: done, decisions, open items.

## 4. Order and parallel work

```
WP0 -> WP1 -> WP2 (ports first) -> WP3 | WP4 | WP5 -> WP6 -> WP7 -> WP8 -> WP9 | WP10 -> WP11
```

After the ports in `src/core/portas.ts` are stable, three agents can do WP3, WP4 and WP5 at the same time. WP9 and WP10 can also run at the same time.

## 5. Contract checklist

| Requirement | Module | Test |
| --- | --- | --- |
| TypeScript strict, ESM, Node 22 or later | `tsconfig.json`, `package.json` | CI typecheck |
| Official SDK, latest stable line | `package.json` | CI typecheck |
| Core without MCP | `src/core/` | `test/arquitetura.test.ts` |
| Partial clone and sparse checkout by sphere and UF | `src/adaptadores/git.ts` | `test/sincronizacao.test.ts` |
| SQLite FTS5 with `remove_diacritics 2` | `src/adaptadores/sqlite/indice.ts` | `test/indice.test.ts` |
| Separate, incremental and idempotent sync | `src/core/sincronizacao.ts` | `test/sincronizacao.test.ts` |
| Logs on stderr only | `src/log.ts` | `test/arquitetura.test.ts` |
| Five tools with the prefix `leis_` and read-only hints | `src/adaptadores/mcp/servidor.ts` | `test/mcp.test.ts` |
| Flat schemas | `src/adaptadores/mcp/esquemas.ts` | `test/mcp.test.ts` |
| Resource template `leis://{caminho}` | `src/adaptadores/mcp/servidor.ts` | `test/mcp.test.ts` |
| Compact items, `formato`, source fields, OCR mark | `src/core/servico.ts` | `test/servico.test.ts` |
| Empty result gives coverage | `src/core/servico.ts` | `test/servico.test.ts` |
| Errors with the next step | `src/core/erros.ts` | `test/servico.test.ts` |
| Token budget and cursor | `src/core/orcamento.ts`, `src/core/servico.ts` | `test/servico.test.ts` |
| Path traversal blocked | `src/core/caminho.ts`, `src/adaptadores/acervo-local.ts` | `test/seguranca.test.ts` |
| Argument lists and `--` for user terms | `src/adaptadores/ripgrep.ts`, `src/adaptadores/git.ts` | `test/seguranca.test.ts` |
| Safe FTS5 query | `src/core/consulta-fts.ts` | `test/seguranca.test.ts` |
| Claude Code installation | `clients/claude-code/` | review |
| Streamable HTTP transport, local only | `src/adaptadores/mcp/http.ts` | `test/http.test.ts` |
| Distribution with `npx` | `.github/workflows/release.yml` | CI pack and `npx` check |
| Other harnesses without changes to the core | `clients/` | review |

## 6. Status

All work packages are done. The Streamable HTTP adapter, the client folders for Codex, Grok, Antigravity and GLM, and the release workflow are done. ADR 0001 (D17 to D21) has the decisions.

## 7. Later work

- Publish to the npm registry. The owner of the npm account must add the secret `NPM_TOKEN` (ADR 0001, D21).
- Run a sync of the full corpus and record the time and the size of the index.
