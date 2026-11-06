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

Folders that start with `_` (`_fonte`, `_lotes`, `_indice`) are not norms. They hold 40,987 Markdown files. The file names do not have one pattern, so the number and the date come from the header, not from the file name. No path has a comma or a quotation mark. 249 norm paths have a space, and 2 of these paths also have the character `°` (for example `estaduais/DF/portarias/2020/port-N° 322-2020-09-16.md`). The server accepts these paths. It refuses an empty segment, a segment that starts with `.`, `_` or a space, a backslash, NUL and control characters.

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

The server reads only the local clone and the local index. It does not call the GitHub API, because the API has a rate limit. The `sync` command clones with `--filter=blob:none --sparse` and sets a cone sparse checkout from `LEIS_ESCOPO`. The default scope is `constituicao,federal`. A scope entry can be a sphere, a UF (`estaduais/SP`), a city or a kind folder. Root files (`COBERTURA.md`, `PROGRESSO.md`) are always present in cone mode. Subfolders that start with `_` stay out of the checkout (D22).

We keep the full history, because `leis_autoria` needs the base commits. The cost is about 295 MiB.

### D4. Index

We use SQLite FTS5 through `better-sqlite3`. Its bundled SQLite (3.53.4) has FTS5. `node:sqlite` does not always have FTS5. The FTS5 table uses `tokenize='unicode61 remove_diacritics 2'` and `contentless_delete=1`, so the index does not keep a second copy of the text. The columns are `titulo`, `ementa` and `corpo`. The body goes into the index only for the paths in `LEIS_CORPO`. Without the body in the index, a body search uses ripgrep. When the filter has 2,000 norms or fewer in the index, ripgrep reads only these files. Else ripgrep reads the folders of the sphere, UF, city, agency or court of the filter, in path order, and stops at 20,000 files. The kind does not select the folder, because the kind folder is different in each sphere. A UF without a sphere selects the state folder and the city folder of the UF. The index filter comes after ripgrep. When ripgrep stops at the limit, the result has `total_aproximado: true` and a notice in `avisos`.

### D5. Sync

`sync` is a separate command. It does these steps:

1. Clone when there is no clone. Run `git fetch` for the branch. The fetch brings commits and trees, not blobs.
2. Set the sparse checkout from the scope and from the trees of the fetched commit (D22). Then run `git merge --ff-only --no-stat` to that commit. Git downloads only the blobs of the checkout files that changed.
3. Read the changes from the indexed commit to `HEAD` with `git diff --name-status --no-renames`. `--no-renames` prevents a download of blobs in the partial clone.
4. Index new scope entries with `git ls-tree`. Index again the entries whose body status changes, and all entries when the indexed commit is not in the history. For each of these entries, remove the norms that are in the index but not in the tree.
5. Before step 4, write as scope and body only the entries that stay complete. Thus, if the sync stops, the next sync reads these entries again, also when the scope goes back to the old value.
6. Write in batches. Write the new commit only at the end. If the sync stops, the next sync does the same changes again. All writes are idempotent.

The server opens the index read-only and only at the first tool call. It does not block the handshake. The index uses WAL mode, so the server sees the data of a sync when the sync writes it. You do not have to start the server again.

### D6. Header parser

The parser reads one `key: value` per line, because the corpus has only this form. It also accepts single quotes, block scalars and continuation lines, so an odd header does not stop the sync. Dates stay strings.

### D7. Kind key

Each norm has a `tipo_chave`. It is the canonical folder of `CANONICO` for the header `tipo`. When `tipo` is not in `CANONICO`, it is the folder name if the folder is canonical, else the slug of `tipo`. This repairs the non-canonical `tipo` of `municipais` and the RFB files without a kind folder. The `tipo` filter accepts a label, an abbreviation or a folder name.

### D8. Derived summary

Only 4.5% of the sampled `municipais` files have `ementa`. When the header has no `ementa`, the index takes the summary from the text before the first article. The item shows `ementa_derivada: true`.

### D9. OCR, missing text and struck text

`ocr` is true when one of the three OCR signals is present. `sem_texto` is true for the notice of missing text, or when the body has no text after the title. `leis_obter` removes struck text by default and tells how many parts it removed. The parameter `incluir_tachado` shows them.

A pair of `~~` marks is valid only in one paragraph. OCR files can have a single `~~` that is noise. When a paragraph has an odd number of marks, the parser removes nothing in that paragraph, because it cannot find the pairs. Thus OCR noise does not delete real text.

Some provisions are only in struck text, because they are revoked or changed. When the clean text does not have the provision, `leis_obter` looks in the struck text. Without `incluir_tachado`, the error tells you to set it. With `incluir_tachado`, the result has the struck text and a notice.

### D10. Provisions

The parser finds articles (`Art.`, `Artigo`), paragraphs (`§`, `Parágrafo único`), items (Roman numerals) and letters (`a)`). It accepts the OCR forms `Art. 1o` and `Art. l97`. It ignores lines that start with a quotation mark, because they quote the text of another law. When the article numbers start again in one file (Constitution and ADCT), the parser makes a new block. The parameter `bloco` selects a block. The citation `ADCT art. 10` selects the transitory block.

### D11. Authorship

`sync` reads only commits that add one norm file and have an `Autoria:` line. This excludes batch commits and the `Co-Authored-By` trailers of development tools. The sync uses `git log --full-diff`. Without it, git shows only the files in the scope, and a batch commit that adds files in two folders can look like a commit of one norm. The index keeps the path of the base commit and the `fonte`. When the path does not exist at `HEAD`, the sync links the record to the norm with the same `fonte`. The dates in the result come from the header, never from the commit.

### D12. Tool contract

The tools are `leis_buscar`, `leis_obter`, `leis_facetas`, `leis_cobertura` and `leis_autoria`. All have `readOnlyHint` and `idempotentHint`. The analysis gave these changes to the first contract:

1. `leis_buscar` has the parameter `alcance` (`cabecalho` or `texto`). `cabecalho` searches the title and the summary. `texto` searches the body.
2. `leis_obter` has the parameters `bloco`, `esfera` and `uf`, because a number and a year are not unique across spheres. Without a sphere, a citation prefers the federal norm and tells about the other matches. When the result is from another sphere, the result has a notice. The notice also tells when the federal sphere is not in the local scope.
3. The items have `ementa_derivada` (D8).
4. `leis_cobertura` reads the `_falhas.jsonl` files that the sync records.
5. `leis_autoria` links moved files by `fonte` (D11).

Each result has `structuredContent` and a text block with the same JSON. A result without items tells the coverage of the slice, because absence in the corpus does not prove that a norm does not exist. This is also true for `leis_facetas`. A norm without authorship tells how many norms of the index have authorship. Each error tells the next step. `LEIS_ORCAMENTO_TOKENS` sets the token budget. A larger list is cut and gets a cursor. Candidates, facets and coverage are cut and get `truncado: true`. The resource text is cut with a notice that tells the client to use `leis_obter` and its cursor.

We do not declare an `outputSchema`. The structured content is still present, and some clients reject a result that does not match a declared schema.

### D13. Schemas

We write the input schemas as JSON Schema and wrap them with `fromJsonSchema` from the SDK. The schemas use only `type`, `properties`, `required`, `items`, `enum`, `default`, `minimum`, `maximum` and `description`. They do not use `oneOf`, `anyOf`, `allOf` or `$ref`. The service validates the values again.

### D14. Resource template

The template is `leis://{caminho}`. In RFC 6570, the simple expansion `{caminho}` encodes `/` as `%2F`, and the SDK matcher does not accept `/` in the variable. Thus the URI has the encoded path, for example `leis://federal%2Fleis-ordinarias%2F1990%2Flei-8078-1990-09-11.md`. `leis_obter` gives the URI of each norm.

### D15. Security

1. A path must be relative, end in `.md`, have no `.` or `..` segment, have no segment that starts with `_` or `.`, and stay in the clone after symbolic links.
4. `leis-mcp http` listens only on `127.0.0.1`, `::1` or `localhost`. It checks the `Host` and `Origin` headers before the SDK, against DNS rebinding. It has no authentication.
2. Subprocesses start with an argument list and without a shell. ripgrep gets `--no-config` and never gets `--pre`. The pattern comes after `--`. git gets the scope through `--stdin` or after `--`.
3. A user term goes into FTS5 only as a quoted string. The service removes operators, column filters and parentheses.

### D16. Logs and configuration

Logs go to stderr only. The configuration comes from environment variables: `LEIS_REMOTO`, `LEIS_RAMO`, `LEIS_CLONE`, `LEIS_INDICE`, `LEIS_ESCOPO`, `LEIS_CORPO`, `LEIS_ORCAMENTO_TOKENS`, `LEIS_RG`, `LEIS_GIT`, `LEIS_LOG`, `LEIS_HTTP_HOST` and `LEIS_HTTP_PORTA`. `LEIS_CORPO` is limited to the scope: `LEIS_CORPO=estaduais` with `LEIS_ESCOPO=estaduais/SP` indexes the body of `estaduais/SP`.

### D17. Search rules

`leis_buscar` reads the same terms for FTS5 and for ripgrep: words, phrases in quotation marks and prefixes (`word*`, 3 letters or more). A norm must have all the terms. For ripgrep, each term is one pattern that matches a full word and ignores accents. The first pattern reads the targets, and each next pattern reads only the files that are left. Thus the two engines give the same kind of result.

### D18. Courts in `outros-tribunais`

The corpus keeps TCU (292 files) and STM (17 files) in `jurisprudencia/outros-tribunais/<court>/`, without a kind folder. The path parser gives the court from the third segment. The slice of `tribunal=tcu` is `jurisprudencia/outros-tribunais/tcu`. The index schema has version 2 for this change, so an index of version 1 is made again.

### D19. Failure files above the scope

The cone mode of the sparse checkout also brings the files of the parent folders. When the scope has `estaduais/SP/leis-ordinarias`, the sync records `estaduais/SP/_falhas.jsonl` and `estaduais/_falhas.jsonl` when they exist. Thus `leis_cobertura` shows the failures that apply to the slice.

### D20. Streamable HTTP transport

`leis-mcp http` uses `createMcpHandler` of `@modelcontextprotocol/server` and `toNodeHandler` of `@modelcontextprotocol/node`. Each request gets a new MCP server instance on the same service and index. The endpoint is `/mcp`. The default address is `127.0.0.1:3920`.

### D21. Distribution

A tag `vX.Y.Z` starts a release workflow. It runs the tests, runs `npm pack`, starts the package with `npx` and attaches the package to a GitHub release. Clients start the package with `npx -y --allow-remote=all <release URL> serve`. Since npm 12, the default of `allow-remote` is `none`, and npm refuses a package from a URL with the error `EALLOWREMOTE`. The option `--allow-remote=all` allows the URL for that command only. npm 10 and npm 11 accept the option without a warning. A CI job installs npm 12 and runs the package from a URL. We did not publish to the npm registry: the registry shows the email of the npm account in the package metadata, and the owner of the account must decide this. When the secret `NPM_TOKEN` exists, the same workflow publishes to the registry with provenance.

### D22. Checkout without the `_` folders

The corpus keeps data that is not a norm in folders that start with `_` inside the sphere folders. On 2026-11-06, `federal/` has 88 of these folders. `federal/_fonte` alone has more than 1.6 GiB, and its norm folders have about 0.8 GiB. A cone entry brings all its subfolders, so the default scope downloaded and wrote to disk more than two times the norms.

The sync reads the folders of each scope entry from the trees with `git ls-tree -r -d`. The trees are in the blobless clone, so this reads no blob. An entry that has a `_` folder at any level is replaced by its valid subfolders. A folder without valid subfolders stays complete, because the cone mode cannot bring only the files of one folder. A folder name from the tree goes to git only when it has the characters of a scope entry. If a valid subfolder has a different name (a space or an accent), its parent folder stays complete: the sync downloads more, but it does not stop.

The order of the steps is important. The sync runs `git fetch`, reads the folders from the trees of the fetched commit, sets the checkout, and only then moves the clone forward with `git merge --ff-only --no-stat`. Thus git never downloads the contents of a `_` folder, also in the sync in which the folder first shows in the corpus, and a new norm folder is on the disk before the sync reads its files.

Before this change, the sync ran `git pull --ff-only`. The pull prints a diffstat at the end. To make the diffstat, git downloads the blob of each file that changed in the corpus, also outside the checkout. A sync with the scope `constituicao,federal` downloaded 5,534 blobs of `estaduais` in this way. `--no-stat` prevents this.

The cone mode still brings the loose files of each parent folder. This keeps the `_falhas.jsonl` files (D19). It also brings 494 audit files at the top of `federal/`, about 560 MiB. Only a change in the corpus can remove this cost.

### D23. Summary of jurisprudence

Almost no jurisprudence file has an `ementa` key, so the index derives the summary from the body. The rule for laws took a line of the CNJ JSON record (`"decisao": "MERITO",`), the situation (`APROVADO`, `Cancelado`, `Afetado`), a standard notice of suspension, the branch of law of an STJ summary, or one line of a paragraph that the PDF conversion broke (TST, TNU). In a sync of `jurisprudencia/stf` and `jurisprudencia/stj` on 2026-11-06, 6,285 of 9,613 summaries had one of these problems. The summary is in the FTS5 index, so a search by subject did not find these decisions.

A file with the key `tribunal` in the header is a court record, not the text of a law. All 11,700 files of `jurisprudencia` have this key. The derived summary of a court record comes from these rules:

1. It is the first paragraph of the section `Ementa`, `Enunciado`, `Questão` (`questaoSubmetidaAJulgamento`), `Tese` or of the line with the number of the summary (`SÚMULA 23`, `SÚMULA Nº 10 - Cancelada (...)`), in this order, or the field `textoEmenta` of the CNJ JSON record. A paragraph joins its lines up to the empty line. The JSON record is read to its end, because it grows with the history of the case.
2. `não informado` makes a section empty. When the record has these sections and all of them are empty, the norm has no summary. Other text of the record, such as the situation or a notice, is not a summary.
3. The line with the number of the summary is a label only when the number is the number of the norm. A citation of a different summary at the start of a line is text. A line `Art. N` is also text.
4. When the record has no section (TST, the summaries of TNU, TRF4), the summary is the first paragraph of text with its lines joined.

For the text of a law, the rule for laws applies as before. A section label counts only before the first article. The rule skips the lines of ```` ```json ```` blocks and the value of `situacao`. A ```` ```text ```` block is text of the norm (for example, the preformatted text of a PDF), so the rule reads it. The verb of the rule for laws still matches the start of a word, because nominal summaries (`Autorização para...`) and OCR text (`ALTERAA REDAÇÃO`) need it.

On 2026-11-06, the new rules change 8,971 of the 11,700 derived summaries of `jurisprudencia`. They change no summary of a law in the 191,564 files of `federal` and in 14,943 files of `estaduais/RR`, `municipais/RJ`, `reguladores/aneel` and `tratados`. Two limits stay. The joined paragraphs of TST keep the hyphens of the line breaks of the PDF (`gratifi- cação`). The two files of `jurisprudencia/regimentos` are texts with articles, and they get the first paragraph of the document. The index schema has version 3 for this change, so an index of version 2 is made again.

### D24. Provision labels with partial emphasis

The batches of the corpus from October 2026 keep the bold of the source (fidelity of rendering). In these files, the emphasis covers only part of a label: `**Art**. 1º`, `**Art.** 4º`, `Art. **3º**`, `**§** 2º`, `**I** –`. The parser accepted only `Art. 1º` and `**Art. 1º**`. On 2026-11-06, it read no article in 83,658 of the 189,400 federal norms that have articles (44%), for example Decreto 3.000/1999 with 1,004 articles. For these norms, `leis_obter` gave `dispositivo_nao_encontrado` and could not make pages by article. In the decrees of the State of São Paulo, the parser did not read the items with a bold Roman numeral.

The parser now removes the Markdown emphasis from the first 24 characters of a line before it looks for a label. This is only to find the provision: the text that `leis_obter` returns keeps the original marks. In `federal`, the parser reads 983,208 articles (560,444 before), and no norm with articles stays without an article. In a sample of 5,773 norms of `estaduais/SP`, the paragraphs, items and letters that the parser reads go from 20,878 to 33,372. The files with the old format do not change: the Constitution keeps its 424 articles and 2,867 units. The index does not keep the provisions, so this change needs no new sync.

A letter after the number is a suffix (`Art. 4º-A`). When a space separates the number and the hyphen, the letter is a suffix only when punctuation follows it: `**Art. 4º** -B. As fundações` is article 4º-B, and `**Artigo 2º** -O crédito aberto` is article 2º, because the dash starts the sentence. Before, the bold hid these cases, and 11 federal files had an article with a wrong key (4º-B read as 4º).

### D25. Legal force from the source

The federal collector of the corpus writes the key `forca_legal_fonte`. It is the `legislationLegalForce` of the Senate API (normas.leg.br): a JSON list with `InForce`, `NotInForce` or `PartiallyInForce`. The collector writes `revogada: false` only when the source says `InForce`. In all other cases it writes `revogada: null` and keeps the value of the source. On 2026-11-06, 89,792 federal norms (47% of `federal`, 82% of the federal decrees) have `["NotInForce"]`, and all of them have `revogada: null`. The index read only `revogada`, so it did not know that these norms are not in force. A search with `revogada: true` found 1,456 federal decrees, and the compact item did not show `revogada`.

The index now keeps the legal force of the source in the column `vigencia_fonte`: `em_vigor`, `sem_vigor`, `parcial`, or null when the source does not give it or the list is empty. The value is what the source says. The index does not conclude that a norm is in force.

1. The item has `vigencia_na_fonte` in words (`em vigor`, `sem vigor`, `parcialmente em vigor`) when the source gives it. The compact item also has `revogada: true` when the header marks the norm as revoked.
2. `leis_obter` gives a notice when the source marks the norm as not in force or partially in force.
3. The filter `revogada: true` selects the norms with `revogada: true` in the header or with `sem_vigor` in the source. The filter `revogada: false` removes these norms and keeps the norms without information. Before, `revogada: false` selected only the norms with `revogada: false` in the header, and almost all decrees were out of the result.

The index schema has version 4 for this change and for D26, so an index of version 3 is made again. The table `normas` of an old index gets the new column when the sync opens the index.

### D26. Pending integrity

The corpus has a registry of pending integrity, `scripts/dados/pendencias-integralidade-publicadas.json`. It lists the norms whose text is preserved but not validated as complete. Each item has `path`, `sha256_md`, `estado`, `motivo` and `evidencia`. On 2026-11-06 the registry has the date 2026-11-01 and 7,639 norms: 6,209 federal decrees, 1,421 state norms (MG and PE), 6 municipal norms and 3 acts of regulators. In most cases the norm approves an annex, a statute or a table, and the text ends at the signatures. In 5,545 of the 6,209 federal files, the text has only an empty label in the place of the object, for example `<<Anexo>>` or `<TABELA>`. The server gave these texts without a notice.

The registry is not in a norm folder, so the checkout does not have it. The sync gets the object identifier of the file from the trees (`git rev-parse <commit>:<path>`). When the identifier is different from the one in the index, the sync reads the object with `git cat-file blob`. In the partial clone, git downloads only this object (about 12 MB). The sync writes all items of the registry to the table `pendencias`, also the items out of the local scope. The registry does not stop the sync. When git cannot read the object, the sync gives a warning in the log, keeps the pending norms that the index has, and reads the registry again in the next sync. When the content does not have the expected format, the sync gives a warning and writes no pending norms.

1. The item of a pending norm has `integralidade: pendente`.
2. `leis_obter` gives the state, the reason and the date of the registry in `integralidade`, and a notice. The notice says in plain words what the registry points at. For 7,408 norms, the text may not have an annex, a supplement or another object that the norm refers to. For 224 norms, the text may have characters that are different from the source. For the other 7 norms, the text or the data of the norm may be incomplete or different from the source. The notice does not say that text is missing, because the criterion of the registry is conservative.
3. `leis_cobertura` gives the number of pending norms in the slice and in the registry, with the date and the criterion. The short coverage that comes with an empty result does not have this number: it explains why a norm is not found.
4. The resource `leis://{caminho}` is the file of the corpus. For a pending norm, the text ends with the same notice, in brackets. The resource does not use the index for the text: without an index, the text does not have the notice.

## Consequences

1. A new harness needs only a folder in `clients/`. The folder has guides for Claude Code, Codex, Grok, Antigravity and the GLM clients.
2. The first sync of the default scope downloads the history and the federal files. Later syncs read only the changes.
3. Body search without `LEIS_CORPO` needs ripgrep on the computer.
4. The index does not prove that a norm is in force. The result always gives `fonte`, `versao_texto`, `baixado_em` and the notices of the source.
