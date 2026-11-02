# leis-mcp

**Português** | [English](README.en.md)

O leis-mcp é um servidor MCP para o acervo de legislação brasileira [viniciusdsandrade/leis](https://github.com/viniciusdsandrade/leis). Ele encontra, lê e cita normas a partir de um clone local do acervo, somente leitura.

> [!IMPORTANT]
> Os textos têm caráter informativo. Eles não substituem a publicação no Diário Oficial. Cite sempre o campo `fonte` do resultado.

## O que ele faz

- Busca normas por palavras e filtros. Procura no título e na ementa e, se você pedir, também no corpo do texto.
- Lê uma norma inteira em páginas de artigos, ou um único dispositivo: artigo, parágrafo, inciso ou alínea.
- Conta normas por esfera, tipo, UF, órgão, tribunal, município e década.
- Mostra as lacunas do acervo em um recorte e o estado do índice local.
- Mostra quem assinou uma norma, a partir dos commits da base inicial do histórico do acervo.

## Situação

Versão 0.1.0. Use com `npx` a partir da release do GitHub (veja [Instalação](#instalação)). O pacote não está no registro do npm.

## Requisitos

- Node.js 22 ou mais recente.
- git 2.37 ou mais recente. O sync usa `git sparse-checkout set --cone` e o modo cone como padrão.
- ripgrep (`rg`). Ele só é necessário para buscar no corpo do texto de pastas que não estão em `LEIS_CORPO`.

## Instalação

1. Rode o primeiro sync. Ele clona o acervo e cria o índice:

   ```sh
   LEIS_ESCOPO=constituicao,federal npx -y https://github.com/viniciusdsandrade/brasil-legislacao-mcp/releases/download/v0.1.0/leis-mcp-0.1.0.tgz sync
   ```

2. Conecte o seu cliente MCP. A pasta [clients](clients/README.md) tem guias para Claude Code, Codex, Grok, Antigravity e os clientes que usam GLM. Os guias estão em inglês.

Para usar o código-fonte, clone este repositório e rode `npm ci`. O script `prepare` compila o `dist`. Depois, use `node dist/cli.js` no lugar de `npx -y <pacote>`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `leis-mcp` ou `leis-mcp serve` | Inicia o servidor MCP em stdio. |
| `leis-mcp http` | Inicia o servidor MCP em Streamable HTTP, em `http://127.0.0.1:3920/mcp`. Um único servidor atende todos os clientes. |
| `leis-mcp sync` | Clona ou atualiza o acervo e o índice. Escreve um relatório JSON no stdout. |
| `leis-mcp status` | Mostra o estado do índice. |
| `leis-mcp --version` | Mostra a versão. |

### Como o sync funciona

1. Clona o acervo com `git clone --filter=blob:none --sparse`. O git não baixa o conteúdo dos arquivos fora do escopo.
2. Configura um sparse checkout em modo cone a partir de `LEIS_ESCOPO`.
3. Roda `git pull --ff-only`.
4. Lê as mudanças entre o commit indexado e o `HEAD` e as indexa em lotes.
5. Indexa por inteiro as entradas novas do escopo.
6. Lê a autoria nos commits da base inicial do histórico.
7. Grava o commit novo no índice só no fim.

Se o sync parar no meio, rode de novo. Cada gravação é idempotente. Um segundo sync sem mudanças no acervo não altera nada.

O histórico completo, sem o conteúdo dos arquivos, ocupa cerca de 295 MiB. O servidor lê só o índice e o clone locais. Ele nunca chama a API do GitHub.

## Configuração

Use variáveis de ambiente, com os mesmos valores no `sync` e no servidor.

| Variável | Padrão | Significado |
| --- | --- | --- |
| `LEIS_REMOTO` | `https://github.com/viniciusdsandrade/leis.git` | Repositório git do acervo. |
| `LEIS_RAMO` | `main` | Ramo do acervo. |
| `LEIS_CLONE` | `~/.cache/leis-mcp/acervo` | Pasta do clone parcial. |
| `LEIS_INDICE` | `~/.cache/leis-mcp/indice.sqlite` | Arquivo SQLite do índice. |
| `LEIS_ESCOPO` | `constituicao,federal` | Esferas e pastas que entram no clone, por exemplo `constituicao,federal,estaduais/SP,municipais/SP/campinas`. |
| `LEIS_CORPO` | (vazio) | Pastas cujo corpo do texto entra no índice FTS5, por exemplo `constituicao,federal/leis-ordinarias`. |
| `LEIS_ORCAMENTO_TOKENS` | `8000` | Orçamento de tokens de cada resultado. |
| `LEIS_RG` | `rg` | Programa do ripgrep. |
| `LEIS_GIT` | `git` | Programa do git. |
| `LEIS_LOG` | `info` | Nível do log: `erro`, `aviso`, `info` ou `depuracao`. O log vai para o stderr. |
| `LEIS_HTTP_HOST` | `127.0.0.1` | Endereço do `leis-mcp http`: `127.0.0.1`, `::1` ou `localhost`. Outros endereços são recusados. |
| `LEIS_HTTP_PORTA` | `3920` | Porta do `leis-mcp http`. |

Quando `XDG_CACHE_HOME` está definida, a pasta de cache é `$XDG_CACHE_HOME/leis-mcp`.

## Ferramentas

Todas as ferramentas têm as dicas `readOnlyHint` e `idempotentHint`.

| Ferramenta | Para que serve | Parâmetros principais |
| --- | --- | --- |
| `leis_buscar` | Encontrar normas. | `texto`, `esfera`, `uf`, `municipio`, `orgao`, `tribunal`, `tipo`, `numero`, `data_de`, `data_ate`, `revogada`, `alcance` (`cabecalho` ou `texto`), `limite` (padrão 10, máximo 50), `cursor`, `formato` |
| `leis_obter` | Ler uma norma ou um dispositivo. | `referencia` (caminho, URI `leis://`, URN LexML ou citação), `artigo`, `paragrafo`, `inciso`, `alinea`, `bloco`, `esfera`, `uf`, `incluir_tachado`, `cursor`, `formato` |
| `leis_facetas` | Contar normas. | `dimensoes` (`esfera`, `tipo`, `uf`, `orgao`, `tribunal`, `municipio`, `decada`), `texto`, os filtros, `limite` |
| `leis_cobertura` | Mostrar as lacunas de um recorte e o estado do índice. | `esfera`, `uf`, `municipio`, `orgao`, `tribunal`, `tipo` |
| `leis_autoria` | Mostrar os signatários de uma norma, ou as normas de um signatário. | `referencia` ou `signatario`, `limite`, `cursor`, `formato` |

Regras de busca do `texto`:

- A norma precisa ter todas as palavras. Uma palavra só casa com a palavra inteira: `consumo` não casa com `consumidor`.
- Ponha uma frase entre aspas: `"defesa do consumidor"`.
- Ponha `*` depois de uma palavra de 3 letras ou mais para buscar o começo das palavras: `consum*`.
- Acentos e maiúsculas não fazem diferença.
- O índice FTS5 e o ripgrep seguem as mesmas regras.

`municipio` aceita o slug do município (`campinas`) ou a forma `SP/campinas`, que o `leis_facetas` devolve.

Exemplos de citação para `referencia`:

- `Lei 8.078/1990`, `Lei nº 8.078, de 11 de setembro de 1990`
- `LC 123/2006`, `MP 2.200-2/2001`, `Decreto-Lei 5.452/1943`
- `CF art. 5º, XI`, `art. 5º, XI, da CF`, `ADCT art. 10`
- `CDC art. 49`, `CLT art. 2º`, `LGPD`
- `Súmula 7 do STJ`, `Súmula Vinculante 13`
- `urn:lex:br:federal:lei:1990-09-11;8078`

O servidor também tem o template de recurso `leis://{caminho}`. O caminho vai codificado, por exemplo `leis://federal%2Fleis-ordinarias%2F1990%2Flei-8078-1990-09-11.md`. O `leis_obter` informa a URI de cada norma.

## Contrato de resposta

- Os itens são compactos: `caminho`, `titulo`, `tipo`, `numero`, `data`, `uf`, uma `ementa` curta, `situacao`, `fonte`, `versao_texto`, `baixado_em` e `ocr`. Use `formato: completo` para receber todos os campos e a URI.
- Todo resultado tem `fonte`, `versao_texto` e `baixado_em`. Texto obtido por OCR vem com `ocr: true` e um aviso.
- O `leis_obter` remove o texto tachado por padrão e informa quantos trechos removeu. Use `incluir_tachado: true` para vê-los. Um dispositivo que só existe em texto tachado, porque foi revogado ou alterado, só aparece com `incluir_tachado: true`, e vem com aviso.
- Uma citação sem esfera prefere a norma federal. Quando o resultado é de outra esfera, ele vem com aviso.
- Um resultado sem itens informa a cobertura do recorte. A ausência no acervo local não prova que a norma não existe.
- Todo resultado tem `structuredContent` e um bloco de texto com o mesmo JSON.
- Todo erro tem um código, uma mensagem e o próximo passo.
- Um resultado maior que o orçamento de tokens é cortado. Use o `cursor` do resultado para buscar a próxima página. Candidatos, facetas e cobertura são cortados e trazem `truncado: true`. O recurso `leis://{caminho}` é cortado com um aviso que indica o `leis_obter` e o cursor dele.

## Segurança

- O servidor aceita só caminhos `.md` de normas dentro do clone. Ele recusa `..`, caminhos absolutos, segmentos ocultos, segmentos que começam com `_` e links simbólicos que saem do clone.
- Os subprocessos rodam com uma lista de argumentos e sem shell. Os termos do usuário vêm depois de `--`. O ripgrep roda com `--no-config` e nunca com `--pre`.
- O texto do usuário entra no FTS5 só como strings entre aspas. Operadores, filtros de coluna e parênteses viram texto comum.
- O servidor abre o índice somente para leitura. Só o `sync` escreve no índice e no clone.
- O `leis-mcp http` escuta só em endereço local e valida os cabeçalhos `Host` e `Origin` contra DNS rebinding. Ele não tem autenticação, então não o exponha a uma rede.

## Arquitetura

```
src/core/          Regras de domínio, casos de uso e portas. Sem código MCP e sem I/O.
src/adaptadores/   Adaptadores para SQLite FTS5, git, ripgrep, sistema de arquivos e MCP.
src/cli.ts         Raiz de composição: serve, http, sync e status.
clients/           Arquivos de instalação de cada cliente MCP.
test/              Testes vitest com fixtures pequenas.
```

O plano para os agentes está em [docs/plan.md](docs/plan.md). A análise do acervo e as decisões estão no [ADR 0001](docs/adr/0001-architecture-and-corpus-contract.md). Esses documentos estão em inglês.

## Desenvolvimento

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Uma tag `vX.Y.Z` dispara o workflow de release. Ele roda os testes, empacota o projeto, executa o pacote com `npx` e o anexa a uma release do GitHub. Quando o segredo `NPM_TOKEN` existe, o workflow também publica no registro do npm com provenance.

O workflow do GitHub Actions roda esses passos no Node 22 e no Node 24.

## Licença

O código está sob a licença MIT. Veja [LICENSE](LICENSE).

Os textos das normas são atos oficiais. Pelo art. 8º, inciso IV, da Lei nº 9.610/1998, eles não são objeto de proteção como direitos autorais.
