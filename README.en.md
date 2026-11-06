# leis-mcp

[Português](README.md) | **English**

leis-mcp is an MCP server for the Brazilian legislation corpus [viniciusdsandrade/leis](https://github.com/viniciusdsandrade/leis). It finds, reads and cites norms from a local, read-only clone of the corpus.

> [!IMPORTANT]
> The texts are for information only. They do not replace the publication in the Diário Oficial. Always cite the `fonte` field of the result.

## What it does

- It searches norms by words and filters. It searches the title and the summary, and it can also search the body.
- It reads a full norm in pages of articles, or one provision: article, paragraph, item or letter.
- It counts norms by sphere, kind, UF, agency, court, city and decade.
- It shows the gaps of the corpus for a slice, and the state of the local index.
- It gives a notice when the official source marks a norm as not in force, and when the text can be incomplete.
- It shows who signed a norm, from the base commits of the corpus history.

## Status

Version 0.2.1. Get it with `npx` from the GitHub release (see [Install](#install)). The package is not in the npm registry.

## Requirements

- Node.js 22 or later.
- git 2.37 or later. The sync uses `git sparse-checkout set --cone` and the cone mode as default.
- ripgrep (`rg`). It is necessary only for body search in folders that are not in `LEIS_CORPO`.

## Install

1. Run the first sync. It clones the corpus and makes the index:

   ```sh
   LEIS_ESCOPO=constituicao,federal npx -y --allow-remote=all https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.2.1/leis-mcp-0.2.1.tgz sync
   ```

   The option `--allow-remote=all` lets npm install the package from the release URL. Since npm 12, npm refuses a package from a URL without this option, with the error `EALLOWREMOTE`. npm 10 and npm 11 also accept the option.

2. Connect your MCP client. The folder [clients](clients/README.md) has a guide for Claude Code, Codex, Grok, Antigravity and the GLM clients.

To use the source code, clone this repository and run `npm ci`. The `prepare` script builds `dist`. Then use `node dist/cli.js` in place of `npx -y --allow-remote=all <package>`.

## Commands

| Command | What it does |
| --- | --- |
| `leis-mcp` or `leis-mcp serve` | Starts the MCP server on stdio. |
| `leis-mcp http` | Starts the MCP server on Streamable HTTP at `http://127.0.0.1:3920/mcp`. One server can serve all clients. |
| `leis-mcp sync` | Clones or updates the corpus and the index. It writes a JSON report to stdout. |
| `leis-mcp status` | Shows the state of the index. |
| `leis-mcp --version` | Shows the version. |

### How sync works

1. It clones the corpus with `git clone --filter=blob:none --sparse`. Git does not download file contents outside the scope.
2. It gets the new commits with `git fetch`. The fetch does not bring file contents.
3. It sets a cone sparse checkout from `LEIS_ESCOPO` and from the folders of the fetched commit. Subfolders that start with `_`, such as `federal/_fonte` (more than 1.6 GiB), stay out of the checkout, because they have no norms. Git does not download their contents.
4. It moves the clone forward with `git merge --ff-only --no-stat`. Git downloads only the contents of the checkout files that changed.
5. It reads the changes from the indexed commit to `HEAD` and indexes them in batches.
6. It indexes new scope entries in full.
7. It reads the authorship from the base commits of the history.
8. It reads the registry of pending integrity of the corpus, directly from git, when the registry changed. A failure in this step does not stop the sync: the next sync reads the registry again.
9. It writes the new commit to the index only at the end.

If the sync stops, run it again. Each write is idempotent. A second sync without changes in the corpus changes nothing.

When a new version of leis-mcp changes the index, the server replies with the error `indice_desatualizado`. Run the sync with the same variables. It makes the index again from the local clone.

The full history without file contents is about 295 MiB. The cone mode also brings the loose files of the folders above each checkout folder. In `federal/`, these files are audit records of the corpus, about 560 MiB, and the index does not use them. The server reads only the local index and the local clone. It never calls the GitHub API.

## Configuration

Use environment variables. Use the same values for `sync` and for the server.

| Variable | Default | Meaning |
| --- | --- | --- |
| `LEIS_REMOTO` | `https://github.com/viniciusdsandrade/leis.git` | Git repository of the corpus. |
| `LEIS_RAMO` | `main` | Branch of the corpus. |
| `LEIS_CLONE` | `~/.cache/leis-mcp/acervo` | Folder of the partial clone. |
| `LEIS_INDICE` | `~/.cache/leis-mcp/indice.sqlite` | SQLite file of the index. |
| `LEIS_ESCOPO` | `constituicao,federal` | Spheres and folders in the clone, for example `constituicao,federal,estaduais/SP,municipais/SP/campinas`. |
| `LEIS_CORPO` | (empty) | Folders whose body goes into the FTS5 index, for example `constituicao,federal/leis-ordinarias`. |
| `LEIS_ORCAMENTO_TOKENS` | `8000` | Token budget of each result. |
| `LEIS_RG` | `rg` | ripgrep program. |
| `LEIS_GIT` | `git` | git program. |
| `LEIS_LOG` | `info` | Log level: `erro`, `aviso`, `info` or `depuracao`. The log goes to stderr. |
| `LEIS_HTTP_HOST` | `127.0.0.1` | Address of `leis-mcp http`: `127.0.0.1`, `::1` or `localhost`. Other addresses are refused. |
| `LEIS_HTTP_PORTA` | `3920` | Port of `leis-mcp http`. |

When `XDG_CACHE_HOME` is set, the cache folder is `$XDG_CACHE_HOME/leis-mcp`.

## Tools

All tools have the hints `readOnlyHint` and `idempotentHint`.

| Tool | Use it to | Main parameters |
| --- | --- | --- |
| `leis_buscar` | Find norms. | `texto`, `esfera`, `uf`, `municipio`, `orgao`, `tribunal`, `tipo`, `numero`, `data_de`, `data_ate`, `revogada`, `alcance` (`cabecalho` or `texto`), `limite` (10, maximum 50), `cursor`, `formato` |
| `leis_obter` | Read a norm or one provision. | `referencia` (path, `leis://` URI, LexML URN or citation), `artigo`, `paragrafo`, `inciso`, `alinea`, `bloco`, `esfera`, `uf`, `incluir_tachado`, `cursor`, `formato` |
| `leis_facetas` | Count norms. | `dimensoes` (`esfera`, `tipo`, `uf`, `orgao`, `tribunal`, `municipio`, `decada`), `texto`, the filters, `limite` |
| `leis_cobertura` | Show the gaps of a slice and the state of the index. | `esfera`, `uf`, `municipio`, `orgao`, `tribunal`, `tipo` |
| `leis_autoria` | Show the signatories of a norm, or the norms of a signatory. | `referencia` or `signatario`, `limite`, `cursor`, `formato` |

Search rules of `texto`:

- The norm must have all the words. A word matches only a full word: `consumo` does not match `consumidor`.
- Put a phrase in quotation marks: `"defesa do consumidor"`.
- Put `*` after a word of 3 letters or more to search the start of words: `consum*`.
- Accents and case have no effect.
- The FTS5 index and ripgrep use the same rules.

`municipio` accepts the city slug (`campinas`) or the form `SP/campinas` that `leis_facetas` returns.

Examples of citations for `referencia`:

- `Lei 8.078/1990`, `Lei nº 8.078, de 11 de setembro de 1990`
- `LC 123/2006`, `MP 2.200-2/2001`, `Decreto-Lei 5.452/1943`
- `CF art. 5º, XI`, `art. 5º, XI, da CF`, `ADCT art. 10`
- `CDC art. 49`, `CLT art. 2º`, `LGPD`
- `Súmula 7 do STJ`, `Súmula Vinculante 13`
- `urn:lex:br:federal:lei:1990-09-11;8078`

The server also has the resource template `leis://{caminho}`. The path is encoded, for example `leis://federal%2Fleis-ordinarias%2F1990%2Flei-8078-1990-09-11.md`. `leis_obter` gives the URI of each norm.

## Response contract

- Items are compact: `caminho`, `titulo`, `tipo`, `numero`, `data`, `uf`, a short `ementa`, `situacao`, the legal force, `fonte`, `versao_texto`, `baixado_em` and `ocr`. Use `formato: completo` to get all fields and the URI.
- Each result has `fonte`, `versao_texto` and `baixado_em`. OCR text has `ocr: true` and a notice.
- Legal force: the item has `vigencia_na_fonte` (`em vigor`, `sem vigor` or `parcialmente em vigor`) when the official source gives it, and `revogada: true` when the header marks the norm as revoked. The field `situacao` comes from the header, when the header has it. Without these fields, the legal force is unknown. `leis_obter` gives a notice when the source marks the norm as not in force.
- The filter `revogada: true` gives the norms that are revoked or not in force in the source. `revogada: false` removes these norms; the norms without information about legal force stay. The filter does not read the field `situacao`: a provisional measure with `situacao: Reeditada` stays in the result of `revogada: false`, and the item shows the status.
- Integrity: a norm in the registry of pending integrity of the corpus has `integralidade: pendente`. The text is preserved, but it is not validated as complete; in most cases, the text may not have the annex that the norm approves. `leis_obter` gives the reason from the registry and a notice. The resource `leis://` of a pending norm ends with the same notice. `leis_cobertura` counts the pending norms of the slice.
- `leis_obter` removes struck text by default and tells how many parts it removed. Use `incluir_tachado: true` to see them. A provision that is only in struck text (revoked or changed) is available only with `incluir_tachado: true`, with a notice.
- A citation without a sphere prefers the federal norm. When the result is from another sphere, the result has a notice.
- A result without items tells the coverage of the slice. Absence in the local corpus does not prove that a norm does not exist.
- Each result has `structuredContent` and a text block with the same JSON.
- Each error has a code, a message and the next step.
- A result that is larger than the token budget is cut. Use the `cursor` of the result to get the next page. Candidates, facets and coverage are cut and have `truncado: true`. The resource `leis://{caminho}` is cut with a notice that tells you to use `leis_obter` and its cursor.

## Safety

- The server accepts only `.md` paths of norms in the clone. It refuses `..`, absolute paths, hidden segments, segments that start with `_` and symbolic links that go out of the clone.
- Subprocesses start with an argument list and without a shell. User terms come after `--`. ripgrep runs with `--no-config` and never with `--pre`.
- User text goes into FTS5 only as quoted strings. Operators, column filters and parentheses become plain text.
- The server opens the index read-only. Only `sync` writes to the index and the clone.
- `leis-mcp http` listens only on a local address. It checks the `Host` and `Origin` headers against DNS rebinding. It has no authentication. Do not expose it to a network.

## Architecture

```
src/core/          Domain rules, use cases and ports. No MCP code and no I/O.
src/adaptadores/   Adapters for SQLite FTS5, git, ripgrep, the file system and MCP.
src/cli.ts         Composition root: serve, http, sync and status.
clients/           Installation files for each MCP client.
test/              vitest tests with small fixtures.
```

The plan for the agents is in [docs/plan.md](docs/plan.md). The analysis of the corpus and the decisions are in [ADR 0001](docs/adr/0001-architecture-and-corpus-contract.md).

## Development

```sh
npm ci
npm run typecheck
npm run build
npm test
```

Build before the tests: the stdio test runs `dist/cli.js`.

A tag `vX.Y.Z` starts the release workflow. It runs the tests, packs the package, checks it with `npx` and attaches it to a GitHub release. When the secret `NPM_TOKEN` exists, the workflow also publishes to the npm registry with provenance.

The GitHub Actions workflow runs these steps on Node 22, Node 24 and Node 26. Another job installs npm 12 and runs the package from a URL, as from the release.

## License

The code is under the MIT license. See [LICENSE](LICENSE).

The texts of the norms are official acts. Article 8, item IV, of Lei nº 9.610/1998 says that they are not subject to copyright.
