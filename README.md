# leis-mcp

leis-mcp is an MCP server for the Brazilian legislation corpus [viniciusdsandrade/leis](https://github.com/viniciusdsandrade/leis). It finds, reads and cites norms from a local, read-only clone of the corpus.

> [!IMPORTANT]
> The texts are for information only. They do not replace the publication in the Diário Oficial. Always cite the `fonte` field of the result.

## What it does

- It searches norms by words and filters. It searches the title and the summary, and it can also search the body.
- It reads a full norm in pages of articles, or one provision: article, paragraph, item or letter.
- It counts norms by sphere, kind, UF, agency, court, city and decade.
- It shows the gaps of the corpus for a slice, and the state of the local index.
- It shows who signed a norm, from the base commits of the corpus history.

## Status

Version 0.1.0. The package is not on npm yet. Use it from the source code (see [Install](#install)). After the release, `npx -y leis-mcp` starts it.

## Requirements

- Node.js 22 or later.
- git 2.37 or later. The sync uses `git sparse-checkout set --cone` and the cone mode as default.
- ripgrep (`rg`). It is necessary only for body search in folders that are not in `LEIS_CORPO`.

## Install

```sh
git clone https://github.com/viniciusdsandrade/brasil-legislacao-mcp
cd brasil-legislacao-mcp
npm ci
npm run build
node dist/cli.js sync
```

Then connect your MCP client. For Claude Code, see [clients/claude-code](clients/claude-code/README.md).

## Commands

| Command | What it does |
| --- | --- |
| `leis-mcp` or `leis-mcp serve` | Starts the MCP server on stdio. |
| `leis-mcp sync` | Clones or updates the corpus and the index. It writes a JSON report to stdout. |
| `leis-mcp status` | Shows the state of the index. |
| `leis-mcp --version` | Shows the version. |

### How sync works

1. It clones the corpus with `git clone --filter=blob:none --sparse`. Git does not download file contents outside the scope.
2. It sets a cone sparse checkout from `LEIS_ESCOPO`.
3. It runs `git pull --ff-only`.
4. It reads the changes from the indexed commit to `HEAD` and indexes them in batches.
5. It indexes new scope entries in full.
6. It reads the authorship from the base commits of the history.
7. It writes the new commit to the index only at the end.

If the sync stops, run it again. Each write is idempotent. A second sync without changes in the corpus changes nothing.

The full history without file contents is about 295 MiB. The server reads only the local index and the local clone. It never calls the GitHub API.

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

Examples of citations for `referencia`:

- `Lei 8.078/1990`, `Lei nº 8.078, de 11 de setembro de 1990`
- `LC 123/2006`, `MP 2.200-2/2001`, `Decreto-Lei 5.452/1943`
- `CF art. 5º, XI`, `art. 5º, XI, da CF`, `ADCT art. 10`
- `CDC art. 49`, `CLT art. 2º`, `LGPD`
- `Súmula 7 do STJ`, `Súmula Vinculante 13`
- `urn:lex:br:federal:lei:1990-09-11;8078`

The server also has the resource template `leis://{caminho}`. The path is encoded, for example `leis://federal%2Fleis-ordinarias%2F1990%2Flei-8078-1990-09-11.md`. `leis_obter` gives the URI of each norm.

## Response contract

- Items are compact: `caminho`, `titulo`, `tipo`, `numero`, `data`, `uf`, a short `ementa`, `situacao`, `fonte`, `versao_texto`, `baixado_em` and `ocr`. Use `formato: completo` to get all fields and the URI.
- Each result has `fonte`, `versao_texto` and `baixado_em`. OCR text has `ocr: true` and a notice.
- `leis_obter` removes struck text by default and tells how many parts it removed. Use `incluir_tachado: true` to see them.
- A result without items tells the coverage of the slice. Absence in the local corpus does not prove that a norm does not exist.
- Each result has `structuredContent` and a text block with the same JSON.
- Each error has a code, a message and the next step.
- A result that is larger than the token budget is cut. Use the `cursor` of the result to get the next page.

## Safety

- The server accepts only `.md` paths of norms in the clone. It refuses `..`, absolute paths, hidden segments, segments that start with `_` and symbolic links that go out of the clone.
- Subprocesses start with an argument list and without a shell. User terms come after `--`. ripgrep runs with `--no-config` and never with `--pre`.
- User text goes into FTS5 only as quoted strings. Operators, column filters and parentheses become plain text.
- The server opens the index read-only. Only `sync` writes to the index and the clone.

## Architecture

```
src/core/          Domain rules, use cases and ports. No MCP code and no I/O.
src/adaptadores/   Adapters for SQLite FTS5, git, ripgrep, the file system and MCP.
src/cli.ts         Composition root: serve, sync and status.
clients/           Installation files for each MCP client.
test/              vitest tests with small fixtures.
```

The plan for the agents is in [docs/plan.md](docs/plan.md). The analysis of the corpus and the decisions are in [ADR 0001](docs/adr/0001-architecture-and-corpus-contract.md).

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

The GitHub Actions workflow runs these steps on Node 22 and Node 24.

## License

The code is under the MIT license. See [LICENSE](LICENSE).

The texts of the norms are official acts. Article 8, item IV, of Lei nº 9.610/1998 says that they are not subject to copyright.
