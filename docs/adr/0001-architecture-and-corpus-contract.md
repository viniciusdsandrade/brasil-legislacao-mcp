# ADR 0001. Architecture and corpus contract

- Status: accepted
- Date: 2026-11-02

## Context

leis-mcp is an MCP server for the corpus [viniciusdsandrade/leis](https://github.com/viniciusdsandrade/leis). The first client is Claude Code. Other harnesses come later and must use the same core.

We analyzed the corpus before we wrote code. We read `README.md`, `COBERTURA.md`, `PROGRESSO.md`, `scripts/comum.py` and `scripts/html2md.py`. We took a stratified sample of 3,926 files from 169 folder groups. We also searched all files for some markers and read the git history.

## Corpus facts

### Header

1. Each norm file has a YAML header between two `---` lines. The only exception is `constituicao.md`, which has no header.
2. In the sample, each header line has the form `key: value` on one line. There are no block scalars and no lists in the headers.
3. Strings are in double quotes (JSON style). Dates are ISO dates with or without quotes, or empty. `revogada` is `true`, `false` or `null`.
4. The keys that each sphere always has:

| Sphere | Keys in all sampled files | Frequent optional keys |
| --- | --- | --- |
| federal | `titulo`, `tipo`, `numero`, `data`, `ementa`, `revogada`, `versao_texto`, `fonte`, `baixado_em` | `urn` (84%), `situacao` (26%) |
| estaduais | `titulo`, `uf`, `tipo`, `numero`, `data`, `versao_texto`, `fonte`, `baixado_em` | `ementa` (96%), `revogada` (34%), `situacao` (29%) |
| municipais | `titulo`, `tipo`, `numero`, `data`, `municipio`, `uf`, `versao_texto`, `fonte`, `baixado_em` | `codigo_ibge` (85%), `revogada` (69%, mostly `null`), `ementa` (4.5%) |
| reguladores | `titulo`, `orgao`, `tipo`, `numero`, `data`, `revogada`, `versao_texto`, `fonte`, `baixado_em` | `publicacao`, `edicao` |
| jurisprudencia | `titulo`, `tribunal`, `tipo`, `numero`, `data`, `versao_texto`, `fonte`, `baixado_em` | `situacao`, `revogada` |
| tratados | `titulo`, `tipo`, `fonte`, `numero`, `data`, `pais`, `ato_promulgacao`, `ocr`, `baixado_em`, `versao_texto` | |

5. `numero` uses thousands dots in some states (`"19.493"`), suffixes (`"01-a"`, `"4-A"`) and reissue numbers (`"2200-2"`).
6. `tipo` is not always canonical in `municipais` (`"Lei ordinária"` and `"Lei Ordinária"`). The folder name is canonical.

### Paths

| Sphere | Path form |
| --- | --- |
| constitution | `constituicao.md` |
| federal | `federal/<kind>/<year>/<file>.md`, and `federal/regimentos/<file>.md` |
| estaduais | `estaduais/<UF>/<kind>/<year or sem-ano>/<file>.md` |
| municipais | `municipais/<UF>/<city>/<kind>/<year>/<file>.md` |
| reguladores | `reguladores/<agency>/<kind>/<year>/<file>.md`, and `reguladores/rfb/<year>/<file>.md` (73,020 files without a kind folder) |
| jurisprudencia | `jurisprudencia/<court>/<kind>/<file>.md`, and `jurisprudencia/regimentos/<file>.md` |
| tratados | `tratados/<group>/<file>.md` |

Folders that start with `_` (`_fonte`, `_lotes`, `_indice`) are not norms. They hold 40,987 Markdown files. The file names do not have one pattern, so the number and the date come from the header, not from the file name. No path has a comma or a non-ASCII character.

### Struck text

`html2md.py` writes struck text as `~~text~~`, and as `<del>` inside HTML tables. The converter of the Constitution removes struck text. The other files keep it.

| Sphere | Files with `~~` | Files with `<del>` |
| --- | ---: | ---: |
| constitution | 0 | 0 |
| federal | 200 | 16 |
| estaduais | 4,616 | 12 |
| municipais | 167 | 3 |
| reguladores | 1,336 | 185 |
| jurisprudencia | 0 | 0 |
| tratados | 6 | 0 |

### OCR signal

There are three signals:

1. A notice line after the title: `> Texto obtido por OCR a partir de PDF escaneado; ...` (24,171 files), `... a partir de imagem; ...` (79 files) and the two-column variant (2 files).
2. The header key `ocr`: `true` (43 files), `false` (118 files) or a text that names the engine (28 files).
3. The header key `ocr_motor` (53 files).

### Norms without text

Ten files have the notice `> A fonte oficial não disponibiliza o texto desta norma: ...`. The norms that did not enter the corpus have one line each in a `_falhas.jsonl` file (34 files, with the keys `motivo` and `status`).

### Authorship in the history

1. The base of the history has one commit for each norm: 323,849 commits with an `Autoria:` line.
2. The commit author is the first signatory, or an institution such as `Estado de São Paulo`. The other signatories are `Co-Authored-By` trailers. The e-mail addresses are synthetic (`name-NNNNN@exemplo.com`).
3. The `Autoria:` line tells the origin: `assinatura no texto.`, `signatário não identificado no texto; autoria institucional.` or `promulgação pelo Legislativo.`
4. Commits before 1970 have the date 1970-01-01. The real date is in the title and in the header.
5. Later commits are batches without authorship. Some development commits have `Co-Authored-By` trailers of tools. They are not signatories.
6. In a sample of 3,000 base commits of `estaduais`, 208 paths (7%) do not exist at `HEAD`, because a later change moved the files. The `Fonte:` line of the commit is equal to the `fonte` key of the moved file.
7. A blobless clone with the full history has about 295 MiB of commits and trees.

## Decisions

### D1. Language, runtime and SDK

We use TypeScript in strict mode, ESM and Node 22 or later. We use `@modelcontextprotocol/server` 2.4.0. The 2.x line is the stable line of the official TypeScript SDK and implements the MCP specification of 2026-07-28. The 1.x package `@modelcontextprotocol/sdk` is a maintenance line. We use `serveStdio`, which serves the 2025 handshake and the 2026 handshake from one server factory.

### D2. Hexagonal architecture

The core in `src/core/` has the domain rules, the use cases and the ports. The core has no MCP code, no file access and no subprocess. The adapters in `src/adaptadores/` connect the ports to SQLite, git, ripgrep, the file system and MCP. The MCP adapter is thin: it validates the input schema, calls the service and serializes the result. A Streamable HTTP adapter can use the same server factory later.

### D3. Local corpus, read-only

The server reads only the local clone and the local index. It does not call the GitHub API, because the API has a rate limit. The `sync` command clones with `--filter=blob:none --sparse` and sets a cone sparse checkout from `LEIS_ESCOPO`. The default scope is `constituicao,federal`. A scope entry can be a sphere, a UF (`estaduais/SP`), a city or a kind folder. Root files (`COBERTURA.md`, `PROGRESSO.md`) are always present in cone mode.

We keep the full history, because `leis_autoria` needs the base commits. The cost is about 295 MiB.

### D4. Index

We use SQLite FTS5 through `better-sqlite3`. Its bundled SQLite (3.53.4) has FTS5. `node:sqlite` does not always have FTS5. The FTS5 table uses `tokenize='unicode61 remove_diacritics 2'` and `contentless_delete=1`, so the index does not keep a second copy of the text. The columns are `titulo`, `ementa` and `corpo`. The body goes into the index only for the paths in `LEIS_CORPO`. Without the body in the index, a body search uses ripgrep in the folders of the filter.

### D5. Sync

`sync` is a separate command. It does these steps:

1. Clone, or set the sparse checkout again when the scope changes.
2. Run `git pull --ff-only`.
3. Read the changes from the indexed commit to `HEAD` with `git diff --name-status --no-renames`. `--no-renames` prevents a download of blobs in the partial clone.
4. Index new scope entries with `git ls-tree`.
5. Write in batches. Write the new commit only at the end. If the sync stops, the next sync does the same changes again. All writes are idempotent.

The server opens the index read-only and only at the first tool call. It does not block the handshake.

### D6. Header parser

The parser reads one `key: value` per line, because the corpus has only this form. It also accepts single quotes, block scalars and continuation lines, so an odd header does not stop the sync. Dates stay strings.

### D7. Kind key

Each norm has a `tipo_chave`. It is the canonical folder of `CANONICO` for the header `tipo`. When `tipo` is not in `CANONICO`, it is the folder name if the folder is canonical, else the slug of `tipo`. This repairs the non-canonical `tipo` of `municipais` and the RFB files without a kind folder. The `tipo` filter accepts a label, an abbreviation or a folder name.

### D8. Derived summary

Only 4.5% of the sampled `municipais` files have `ementa`. When the header has no `ementa`, the index takes the summary from the text before the first article. The item shows `ementa_derivada: true`.

### D9. OCR, missing text and struck text

`ocr` is true when one of the three OCR signals is present. `sem_texto` is true for the notice of missing text, or when the body has no text after the title. `leis_obter` removes struck text by default and tells how many parts it removed. The parameter `incluir_tachado` shows them.

### D10. Provisions

The parser finds articles (`Art.`, `Artigo`), paragraphs (`§`, `Parágrafo único`), items (Roman numerals) and letters (`a)`). It accepts the OCR forms `Art. 1o` and `Art. l97`. It ignores lines that start with a quotation mark, because they quote the text of another law. When the article numbers start again in one file (Constitution and ADCT), the parser makes a new block. The parameter `bloco` selects a block. The citation `ADCT art. 10` selects the transitory block.

### D11. Authorship

`sync` reads only commits that add one norm file and have an `Autoria:` line. This excludes batch commits and the `Co-Authored-By` trailers of development tools. The index keeps the path of the base commit and the `fonte`. When the path does not exist at `HEAD`, the sync links the record to the norm with the same `fonte`. The dates in the result come from the header, never from the commit.

### D12. Tool contract

The tools are `leis_buscar`, `leis_obter`, `leis_facetas`, `leis_cobertura` and `leis_autoria`. All have `readOnlyHint` and `idempotentHint`. The analysis gave these changes to the first contract:

1. `leis_buscar` has the parameter `alcance` (`cabecalho` or `texto`). `cabecalho` searches the title and the summary. `texto` searches the body.
2. `leis_obter` has the parameters `bloco`, `esfera` and `uf`, because a number and a year are not unique across spheres. Without a sphere, a citation prefers the federal norm and tells about the other matches.
3. The items have `ementa_derivada` (D8).
4. `leis_cobertura` reads the `_falhas.jsonl` files that the sync records.
5. `leis_autoria` links moved files by `fonte` (D11).

Each result has `structuredContent` and a text block with the same JSON. A result without items tells the coverage of the slice, because absence in the corpus does not prove that a norm does not exist. Each error tells the next step. `LEIS_ORCAMENTO_TOKENS` sets the token budget. A larger result is cut and gets a cursor.

We do not declare an `outputSchema`. The structured content is still present, and some clients reject a result that does not match a declared schema.

### D13. Schemas

We write the input schemas as JSON Schema and wrap them with `fromJsonSchema` from the SDK. The schemas use only `type`, `properties`, `required`, `items`, `enum`, `default`, `minimum`, `maximum` and `description`. They do not use `oneOf`, `anyOf`, `allOf` or `$ref`. The service validates the values again.

### D14. Resource template

The template is `leis://{caminho}`. In RFC 6570, the simple expansion `{caminho}` encodes `/` as `%2F`, and the SDK matcher does not accept `/` in the variable. Thus the URI has the encoded path, for example `leis://federal%2Fleis-ordinarias%2F1990%2Flei-8078-1990-09-11.md`. `leis_obter` gives the URI of each norm.

### D15. Security

1. A path must be relative, end in `.md`, have no `.` or `..` segment, have no segment that starts with `_` or `.`, and stay in the clone after symbolic links.
2. Subprocesses start with an argument list and without a shell. ripgrep gets `--no-config` and never gets `--pre`. The pattern comes after `--`. git gets the scope through `--stdin` or after `--`.
3. A user term goes into FTS5 only as a quoted string. The service removes operators, column filters and parentheses.

### D16. Logs and configuration

Logs go to stderr only. The configuration comes from environment variables: `LEIS_REMOTO`, `LEIS_RAMO`, `LEIS_CLONE`, `LEIS_INDICE`, `LEIS_ESCOPO`, `LEIS_CORPO`, `LEIS_ORCAMENTO_TOKENS`, `LEIS_RG`, `LEIS_GIT` and `LEIS_LOG`.

## Consequences

1. A new harness needs only a folder in `clients/`.
2. The first sync of the default scope downloads the history and the federal files. Later syncs read only the changes.
3. Body search without `LEIS_CORPO` needs ripgrep on the computer.
4. The index does not prove that a norm is in force. The result always gives `fonte`, `versao_texto`, `baixado_em` and the notices of the source.
