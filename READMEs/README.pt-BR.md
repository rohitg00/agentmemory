<p align="center">
  <img src="../assets/banner.png" alt="agentmemory — Memória persistente para agentes de codificação com IA" width="720" />
</p>

<p align="center">
  <strong>
    Seu agente de codificação lembra de tudo. Chega de re-explicar.
    Built on <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  Memória persistente para Claude Code, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode e qualquer cliente MCP.
</p>

<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.es-ES.md">Español</a> |
  <a href="README.tr-TR.md">Türkçe</a> |
  <a href="README.ru-RU.md">Русский</a> |
  <a href="README.hi-IN.md">हिन्दी</a> |
  Português |
  <a href="README.fr-FR.md">Français</a> |
  <a href="README.de-DE.md">Deutsch</a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/25123" target="_blank"><img src="https://trendshift.io/api/badge/repositories/25123" alt="rohitg00/agentmemory | Trendshift" width="250" height="55"/></a>
</p>

<p align="center">
  <a href="https://www.star-history.com/?repos=rohitg00%2Fagentmemory&type=date&legend=top-left">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=rohitg00/agentmemory&type=date&theme=dark&legend=top-left" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=rohitg00/agentmemory&type=date&legend=top-left" />
      <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=rohitg00/agentmemory&type=date&legend=top-left" />
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1200%20stars%20%2F%20172%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Documento de design: 1200 stars / 172 forks no gist" /></a>
</p>

<p align="center">
  <em>O gist estende o padrão LLM Wiki do Karpathy com pontuação de confiança, ciclo de vida, grafos de conhecimento e busca híbrida: agentmemory é a implementação.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentmemory/agentmemory"><img src="https://img.shields.io/npm/v/@agentmemory/agentmemory?color=CB3837&label=npm&style=for-the-badge&logo=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@agentmemory/agentmemory"><img src="https://img.shields.io/npm/dm/@agentmemory/agentmemory?color=CB3837&label=downloads&style=for-the-badge&logo=npm" alt="npm downloads" /></a>
  <a href="https://github.com/rohitg00/agentmemory/actions"><img src="https://img.shields.io/github/actions/workflow/status/rohitg00/agentmemory/ci.yml?label=tests&style=for-the-badge&logo=github" alt="CI" /></a>
  <a href="https://github.com/rohitg00/agentmemory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rohitg00/agentmemory?color=blue&style=for-the-badge" alt="License" /></a>
  <a href="https://github.com/rohitg00/agentmemory/stargazers"><img src="https://img.shields.io/github/stars/rohitg00/agentmemory?style=for-the-badge&color=yellow&logo=github" alt="Stars" /></a>
</p>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-recall.svg"><img src="../assets/tags/stat-recall.svg" alt="95.2% retrieval R@5" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tokens.svg"><img src="../assets/tags/stat-tokens.svg" alt="92% fewer tokens" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="53 MCP tools" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 auto hooks" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="0 external DBs" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="950+ tests passing" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="Demonstração do agentmemory" width="720" />
</p>

<p align="center">
  <a href="#install">Instalação</a> &bull;
  <a href="#quick-start">Início rápido</a> &bull;
  <a href="#benchmarks">Benchmarks</a> &bull;
  <a href="#vs-competitors">Comparativo</a> &bull;
  <a href="#works-with-every-agent">Agentes</a> &bull;
  <a href="#how-it-works">Como funciona</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Viewer</a> &bull;
  <a href="#iii-console">iii Console</a> &bull;
  <a href="#powered-by-iii">Powered by iii</a> &bull;
  <a href="#configuration">Configuração</a> &bull;
  <a href="#api">API</a>
</p>

---

## Install

```bash
npm install -g @agentmemory/agentmemory          # once — bare `agentmemory` on PATH
# If you hit EACCES on macOS/Linux system Node installs, retry with:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                                      # start the memory server on :3111
agentmemory demo                                 # seed sample sessions + prove recall
agentmemory connect claude-code                  # wire your agent (also: codex, cursor, gemini-cli, ...)
```

Ou via `npx` (sem instalação):

```bash
npx @agentmemory/agentmemory
```

Atenção — o npx faz cache por versão. Se um simples `npx @agentmemory/agentmemory` servir uma release antiga, force a mais recente com `npx -y @agentmemory/agentmemory@latest`, ou limpe o cache uma vez com `rm -rf ~/.npm/_npx` (macOS/Linux; no Windows apague `%LOCALAPPDATA%\npm-cache\_npx`). A primeira execução via npx a partir da v0.9.16+ pergunta inline se você quer instalar globalmente, de modo que o comando `agentmemory` simples funcione em qualquer lugar depois.

Opções completas em [Início rápido](#quick-start) abaixo. Conexão específica por agente em [Funciona com qualquer agente](#works-with-every-agent).

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Funciona com qualquer agente" height="32" /></picture></h2>

agentmemory funciona com qualquer agente que suporte hooks, MCP ou REST API. Todos os agentes compartilham o mesmo servidor de memória.

<table>
<tr>
<td align="center" width="12.5%">
<a href="https://claude.com/product/claude-code"><img src="https://matthiasroder.com/content/images/2026/01/Claude.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>native plugin + 12 hooks + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>native plugin + 6 hooks + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>native plugin + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>native plugin + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>native plugin + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://raw.githubusercontent.com/tinyhumansai/openhuman/main/app/src-tauri/icons/128x128.png" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>native Memory trait backend</sub>
</td>
<td align="center" width="12.5%">
<a href="https://cursor.com"><img src="https://www.freelogovectors.net/wp-content/uploads/2025/06/cursor-logo-freelogovectors.net_.png" alt="Cursor" width="48" height="48" /></a><br/>
<strong>Cursor</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP server</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<a href="https://github.com/opencode-ai/opencode"><img src="https://github.com/opencode-ai.png?size=120" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>22 hooks + MCP + plugin</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
<td align="center" width="12.5%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="12.5%">
<a href="https://windsurf.com"><img src="https://exafunction.github.io/public/brand/windsurf-black-symbol.svg?size=120" alt="Windsurf" width="48" height="48" /></a><br/>
<strong>Windsurf</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP server</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>Funciona com <strong>qualquer</strong> agente que fale MCP ou HTTP. Um servidor, memórias compartilhadas entre todos eles.</sub>
</p>

---

Você explica a mesma arquitetura toda sessão. Você redescobre os mesmos bugs. Você reensina as mesmas preferências. A memória integrada (CLAUDE.md, .cursorrules) bate no teto das 200 linhas e fica desatualizada. agentmemory resolve isso. Ele captura silenciosamente o que seu agente faz, comprime em memória pesquisável e injeta o contexto certo quando a próxima sessão começa. Um comando. Funciona em todos os agentes.

**O que muda:** Na sessão 1 você configura autenticação JWT. Na sessão 2 você pede rate limiting. O agente já sabe que sua autenticação usa o middleware jose em `src/middleware/auth.ts`, que seus testes cobrem a validação de tokens e que você escolheu jose em vez de jsonwebtoken por compatibilidade com Edge. Sem re-explicar. Sem copiar e colar. O agente simplesmente *sabe*.

```bash
npx @agentmemory/agentmemory
```

> **Novidade na v0.9.0** — Landing em [agent-memory.dev](https://agent-memory.dev), conector de filesystem (`@agentmemory/fs-watcher`), MCP standalone agora faz proxy para o servidor em execução, então hooks e viewer combinam, política de auditoria codificada em cada caminho de deleção, e health para de marcar `memory_critical` em processos Node pequenos. Notas completas em [CHANGELOG.md](../CHANGELOG.md#090--2026-04-18).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Precisão de recuperação

**coding-agent-life-v1** (corpus interno, reproduzível em sandbox)

| Adaptador | P@5 | R@5 | Taxa de acerto top-5 | Latência p50 |
|---|---|---|---|---|
| **agentmemory hybrid** | **0.578** | **0.967** | **15 / 15** | 14 ms |
| grep baseline | 0.267 | 0.967 | 15 / 15 | 0 ms |

Taxa de acerto top-5 de 100%. **2,2×** mais precisão que a baseline grep com a mesma entrada. Detalhamento completo por tipo: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 perguntas)

| Sistema | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| BM25-only fallback | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Economia de tokens

| Abordagem | Tokens/ano | Custo/ano |
|---|---|---|
| Colar contexto completo | 19.5M+ | Impossível (excede a janela) |
| Resumido por LLM | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + embeddings locais | ~170K | **$0** |

</td>
</tr>
</table>

> Modelo de embedding: `all-MiniLM-L6-v2` (local, gratuito, sem API key). Relatórios completos: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Comparativo com concorrentes: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) — agentmemory vs mem0, Letta, Khoj, claude-mem, Hippo.

**Reproduza localmente:** [`eval/README.md`](../eval/README.md) — harness com adaptadores plugáveis para LongMemEval `_s` (500-Q públicas) e `coding-agent-life-v1` (corpus interno de 15 sessões). Adaptadores grep / vector / agentmemory são pontuados lado a lado, saída em NDJSON, e as scorecards publicadas ficam em [`docs/benchmarks/`](../docs/benchmarks/).

**Combina com [codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything) e [Graphify](https://github.com/safishamsi/graphify).** Indexação de grafos de código, pipelines de build multiagente e grafos de conhecimento mais amplos sobre docs / PDFs / imagens / vídeos. agentmemory lembra do trabalho; esses três projetos iluminam o resto da camada de contexto. Recipes e tabela de roteamento por pergunta: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="Comparativo" height="32" /></picture></h2>

<table>
<tr>
<th width="20%"></th>
<th width="20%">agentmemory</th>
<th width="20%">mem0 (53K ⭐)</th>
<th width="20%">Letta / MemGPT (22K ⭐)</th>
<th width="20%">Built-in (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Tipo</strong></td>
<td>Engine de memória + servidor MCP</td>
<td>API de camada de memória</td>
<td>Runtime de agente completo</td>
<td>Arquivo estático</td>
</tr>
<tr>
<td><strong>Retrieval R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>Captura automática</strong></td>
<td>12 hooks (esforço manual zero)</td>
<td>Chamadas manuais a <code>add()</code></td>
<td>O agente se autoedita</td>
<td>Edição manual</td>
</tr>
<tr>
<td><strong>Busca</strong></td>
<td>BM25 + Vector + Graph (fusão RRF)</td>
<td>Vector + Graph</td>
<td>Vector (archival)</td>
<td>Carrega tudo no contexto</td>
</tr>
<tr>
<td><strong>Multiagente</strong></td>
<td>MCP + REST + leases + signals</td>
<td>API (sem coordenação)</td>
<td>Somente dentro do runtime do Letta</td>
<td>Arquivos por agente</td>
</tr>
<tr>
<td><strong>Dependência de framework</strong></td>
<td>Nenhuma (qualquer cliente MCP)</td>
<td>Nenhuma</td>
<td>Alta (precisa usar Letta)</td>
<td>Formato por agente</td>
</tr>
<tr>
<td><strong>Dependências externas</strong></td>
<td>Nenhuma (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + BD vetorial</td>
<td>Nenhuma</td>
</tr>
<tr>
<td><strong>Ciclo de vida da memória</strong></td>
<td>Consolidação de 4 níveis + decaimento + auto-esquecimento</td>
<td>Extração passiva</td>
<td>Gerenciado pelo agente</td>
<td>Poda manual</td>
</tr>
<tr>
<td><strong>Eficiência de tokens</strong></td>
<td>~1.900 tokens/sessão ($10/ano)</td>
<td>Varia conforme a integração</td>
<td>Memória principal no contexto</td>
<td>22K+ tokens com 240 obs</td>
</tr>
<tr>
<td><strong>Viewer em tempo real</strong></td>
<td>Sim (port 3113)</td>
<td>Dashboard na nuvem</td>
<td>Dashboard na nuvem</td>
<td>Não</td>
</tr>
<tr>
<td><strong>Self-hosted</strong></td>
<td>Sim (padrão)</td>
<td>Opcional</td>
<td>Opcional</td>
<td>Sim</td>
</tr>
</table>

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Início rápido" height="32" /></picture></h2>

Compatibilidade: este release tem como alvo o `iii-sdk` estável `^0.11.0` e o iii-engine v0.11.x.

### Experimente em 30 segundos

```bash
# Terminal 1: start the server
npx @agentmemory/agentmemory

# Terminal 2: seed sample data and see recall in action
npx @agentmemory/agentmemory demo
```

`demo` semeia 3 sessões realistas (autenticação JWT, correção de N+1 queries, rate limiting) e roda buscas semânticas sobre elas. Você verá que ele encontra "N+1 query fix" ao buscar "database performance optimization" — algo que matching por palavra-chave não consegue fazer.

Abra `http://localhost:3113` para acompanhar a memória sendo construída ao vivo.

### Recomendado: instale globalmente

`npx` faz cache por versão. Se você rodou `npx @agentmemory/agentmemory@0.9.14` semana passada, um simples `npx @agentmemory/agentmemory` pode servir a versão velha 0.9.14 a partir de `~/.npm/_npx/`, e não a mais recente. Instale uma vez e o comando `agentmemory` funciona em qualquer lugar:

```bash
npm install -g @agentmemory/agentmemory
# If you hit EACCES on macOS/Linux system Node installs, retry with:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                    # start the server (same as the npx form)
agentmemory stop               # tear it down
agentmemory remove             # uninstall everything we created
agentmemory connect claude-code   # wire one agent
agentmemory doctor             # interactive diagnostics + fix prompts
```

A partir da v0.9.16, a primeira execução via npx pergunta inline se você quer instalar globalmente — responda `Y` uma vez e está pronto. Se pular, recorra a qualquer um destes para um fetch limpo:

```bash
npx -y @agentmemory/agentmemory@latest                 # forces latest from npm (cross-platform)
rm -rf ~/.npm/_npx && npx @agentmemory/agentmemory     # macOS/Linux only (POSIX shell)
```

No Windows / PowerShell, o equivalente para limpar cache é `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"` — a forma `npx -y ...@latest` acima é a opção multiplataforma.

### Session Replay

Toda sessão que o agentmemory grava é reproduzível. Abra o viewer, escolha a aba **Replay** e arraste pela timeline: prompts, chamadas a tools, resultados e respostas renderizam como eventos discretos com play/pause, controle de velocidade (0,5×–4×) e atalhos de teclado (espaço para alternar, setas para avançar passo a passo).

Já tem transcripts antigos JSONL do Claude Code que quer trazer para cá?

```bash
# Import everything under the default ~/.claude/projects
npx @agentmemory/agentmemory import-jsonl

# Or import a single file
npx @agentmemory/agentmemory import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

As sessões importadas aparecem no seletor de Replay ao lado das nativas. Sob o capô, cada entrada passa pelas funções iii `mem::replay::load`, `mem::replay::sessions` e `mem::replay::import-jsonl` — sem servidores paralelos.

### Atualização / Manutenção

Use o comando de manutenção quando você intencionalmente quiser atualizar seu runtime local:

```bash
npx @agentmemory/agentmemory upgrade
```

Aviso: este comando muta o workspace/runtime atual. Pode atualizar dependências JavaScript, pode rodar `cargo install iii-engine --force` e pode puxar imagens Docker.

Detalhes de implementação estão em `src/cli.ts` (veja `runUpgrade` na região `src/cli.ts:544-595`).

### Claude Code (um bloco, cole)

```text
Install agentmemory: run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 4 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 53 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113.
```

#### Claude Code sem instalar o plugin (caminho MCP standalone)

Se você cabear o servidor MCP do agentmemory via `~/.claude.json` diretamente em vez de usar `/plugin install`, o Claude Code nunca resolve `${CLAUDE_PLUGIN_ROOT}` e você tem que apontar os scripts de hook para caminhos absolutos em `~/.claude/settings.json`. Esses caminhos tipicamente embutem a versão do agentmemory (ex: `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.21/scripts/…`), então a próxima atualização quebra silenciosamente todos os hooks ([#508](https://github.com/rohitg00/agentmemory/issues/508)).

Contorno:

```bash
agentmemory connect claude-code --with-hooks
```

Isso mescla os mesmos comandos de hook em `~/.claude/settings.json` com caminhos absolutos resolvidos para o diretório `plugin/` empacotado do pacote `@agentmemory/agentmemory` atualmente instalado. Rode o comando novamente após atualizar o agentmemory para atualizar os caminhos. Entradas de usuário no mesmo arquivo são preservadas; apenas entradas anteriores do agentmemory são substituídas. Usar o caminho `/plugin install` continua sendo a abordagem recomendada.
Para deploys remotos ou protegidos, inicie o Claude Code com `AGENTMEMORY_URL` e `AGENTMEMORY_SECRET` definidos. O plugin repassa ambos os valores para seu servidor MCP empacotado; quando `AGENTMEMORY_URL` está vazio, o shim MCP usa `http://localhost:3111`.

### Codex CLI (plataforma de plugins do Codex)

```bash
# 1. start the memory server in a separate terminal
npx @agentmemory/agentmemory

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

O plugin do Codex é servido a partir do mesmo diretório `plugin/` do plugin do Claude Code. Ele registra:

- `@agentmemory/mcp` como servidor MCP (faz proxy de todas as 51 tools quando `AGENTMEMORY_URL` aponta para um servidor agentmemory em execução; cai para 7 tools localmente quando não há servidor acessível)
- 6 hooks de ciclo de vida: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 4 skills: `/recall`, `/remember`, `/session-history`, `/forget`

A engine de hooks do Codex injeta `CLAUDE_PLUGIN_ROOT` nos subprocessos de hook (conforme [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), então os mesmos scripts de hook funcionam nos dois hosts sem duplicação. Os eventos Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure são exclusivos do Claude Code e não são registrados para o Codex.

#### Codex Desktop: hooks do plugin atualmente silenciosos (com contorno)

`CodexHooks` e `PluginHooks` são estáveis e habilitados por padrão em [`codex-rs/features/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs), mas as builds atuais do Codex Desktop não despacham `hooks.json` local de plugin ([openai/codex#16430](https://github.com/openai/codex/issues/16430)). As tools MCP continuam funcionando; só as observações de ciclo de vida estão faltando.

Até que o upstream corrija, espelhe os mesmos comandos de hook no `~/.codex/hooks.json` global:

```bash
agentmemory connect codex --with-hooks
```

Isso adiciona um bloco idempotente em `~/.codex/hooks.json` referenciando caminhos absolutos para os scripts empacotados (sem necessidade de expansão de `${CLAUDE_PLUGIN_ROOT}` no escopo de usuário). Rode o mesmo comando novamente após atualizar o agentmemory para atualizar os caminhos. Entradas de usuário no mesmo arquivo são preservadas; só entradas anteriores do agentmemory são substituídas.

<details>
<summary><b>OpenClaw (cole este prompt)</b></summary>

```text
Install agentmemory for OpenClaw. Run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server on localhost:3111. Then add this to my OpenClaw MCP config so agentmemory is available with all 51 memory tools:

{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}

Restart OpenClaw. Verify with `curl http://localhost:3111/agentmemory/health`. Open http://localhost:3113 for the real-time viewer. For deeper memory-slot integration, copy `integrations/openclaw` to `~/.openclaw/extensions/agentmemory` and enable `plugins.slots.memory = "agentmemory"` in `~/.openclaw/openclaw.json`.
```

Guia completo: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (cole este prompt)</b></summary>

```text
Install agentmemory for Hermes. Run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server on localhost:3111. Then add this to ~/.hermes/config.yaml so Hermes can use agentmemory as an MCP server with all 51 memory tools:

mcp_servers:
  agentmemory:
    command: npx
    args: ["-y", "@agentmemory/mcp"]

memory:
  provider: agentmemory

Verify with `curl http://localhost:3111/agentmemory/health`. Open http://localhost:3113 for the real-time viewer. For deeper 6-hook memory provider integration (pre-LLM context injection, turn capture, MEMORY.md mirroring, system prompt block), copy integrations/hermes from the agentmemory repo to ~/.hermes/plugins/agentmemory.
```

Guia completo: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Outros agentes

Inicie o servidor de memória: `npx @agentmemory/agentmemory`

A entrada do agentmemory é o **mesmo bloco de servidor MCP** em todo host que usa o formato `mcpServers` (Cursor, Claude Desktop, Cline, Roo Code, Windsurf, Gemini CLI, OpenClaw):

```json
"agentmemory": {
  "command": "npx",
  "args": ["-y", "@agentmemory/mcp"],
  "env": {
    "AGENTMEMORY_URL": "${AGENTMEMORY_URL}",
    "AGENTMEMORY_SECRET": "${AGENTMEMORY_SECRET}"
  }
}
```

**Mescle esta entrada no objeto `mcpServers` existente** no arquivo de configuração do host — não substitua o arquivo. Se o arquivo já tem outros servidores, adicione `agentmemory` ao lado deles como outra chave dentro de `mcpServers`. Se `mcpServers` não existe, cole o bloco dentro de `{ "mcpServers": { ... } }`. Os placeholders `${VAR}` herdam `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` do shell no momento em que o servidor MCP sobe — variáveis não definidas passam string vazia e o shim cai para `http://localhost:3111`. Uma entrada cabeada cobre deploys tanto locais quanto remotos (k8s / com reverse-proxy).

| Agente | Arquivo de configuração | Notas |
|---|---|---|
| **Cursor** | `~/.cursor/mcp.json` | Mescle em `mcpServers`. Deeplink de um clique também disponível no site. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Mescle em `mcpServers`. Reinicie o Claude Desktop após editar. |
| **Cline / Roo Code / Kilo Code** | Configurações MCP do Cline (Settings UI → MCP Servers → Edit) | Mesmo bloco `mcpServers`. |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | Mesmo bloco `mcpServers`. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (mescla automaticamente). |
| **OpenClaw** | Configuração MCP do OpenClaw | Mesmo bloco `mcpServers`, ou use o [memory plugin](../integrations/openclaw/) mais profundo. |
| **Codex CLI (somente MCP)** | `.codex/config.toml` | Formato TOML: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, ou adicione `[mcp_servers.agentmemory]` manualmente. |
| **Codex CLI (plugin completo)** | Marketplace de plugins do Codex | `codex plugin marketplace add rohitg00/agentmemory` e depois `codex plugin add agentmemory@agentmemory`. Registra MCP + 6 hooks de ciclo de vida (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop) + 4 skills. No Codex Desktop, rode também `agentmemory connect codex --with-hooks` até que [openai/codex#16430](https://github.com/openai/codex/issues/16430) seja mergeado — os hooks de plugin estão silenciosos lá. |
| **OpenCode (somente MCP)** | `opencode.json` | Formato diferente — chave `mcp` no topo, comando como array: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (plugin completo)** | `plugin/opencode/` | 22 hooks de captura automática cobrindo ciclo de vida de sessão, mensagens, tools e erros. Dois comandos slash (`/recall`, `/remember`). Copie `plugin/opencode/` para seu workspace do OpenCode e adicione a entrada do plugin em `opencode.json`. Tabela completa de hooks + análise de gaps em [`plugin/opencode/README.md`](../plugin/opencode/README.md). |
| **pi** | `~/.pi/agent/extensions/agentmemory` | Copie [`integrations/pi`](../integrations/pi/) e reinicie o pi. |
| **Hermes Agent** | `~/.hermes/config.yaml` | Use o [memory provider plugin](../integrations/hermes/) mais profundo com `memory.provider: agentmemory`. |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` escreve o bloco `mcpServers` padrão. O payload dos hooks é compatível em nível de campo com o Claude Code, então os scripts dos 12 hooks existentes funcionam sem modificação — cabê-los na seção `hooks` do mesmo `settings.json`. |
| **Antigravity** (substitui o Gemini CLI) | `mcp_config.json` (no diretório User do Antigravity) | `agentmemory connect antigravity` escreve o bloco `mcpServers` padrão. macOS: `~/Library/Application Support/Antigravity/User/`. Linux: `~/.config/Antigravity/User/`. Use após o sunset do Gemini CLI em 2026-06-18. |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` escreve a configuração no nível do usuário. Overrides por workspace vão em `.kiro/settings/mcp.json` ao lado do seu código. |
| **Goose** | UI de configurações MCP do Goose | Mesmo bloco `mcpServers`. |
| **Aider** | n/a | Fale diretamente com a REST API: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`. |
| **Qualquer agente (32+)** | n/a | `npx skillkit install agentmemory` autodetecta o host e mescla. |

**Clientes MCP em sandbox** (Flatpak / Snap / contêineres restritivos) que não conseguem alcançar o `localhost` do host: também defina `"AGENTMEMORY_FORCE_PROXY": "1"` no bloco `env`, e aponte `AGENTMEMORY_URL` para uma rota que o sandbox realmente alcance (ex: seu IP de LAN). Veja [#234](https://github.com/rohitg00/agentmemory/issues/234) para o passo a passo de diagnóstico.

### Acesso programático (Python / Rust / Node)

agentmemory registra suas operações principais como funções iii (`mem::remember`, `mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). Qualquer linguagem com um SDK iii pode chamá-las diretamente via `ws://localhost:49134` — sem um cliente REST separado por linguagem.

```bash
pip install iii-sdk         # Python
cargo add iii-sdk           # Rust
npm  install iii-sdk        # Node
```

```python
from iii import register_worker

iii = register_worker("ws://localhost:49134")
iii.connect()

iii.trigger({
    "function_id": "mem::smart-search",
    "payload": {"project": "demo", "query": "how do tokens refresh"},
})
```

Exemplo prático: [`examples/python/`](../examples/python/) (quickstart + fluxo de observação/recall). A REST em `:3111` continua disponível para hosts sem runtime iii.

### A partir do código-fonte

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

Isso inicia o agentmemory com um `iii-engine` local se `iii` já estiver instalado, ou cai para Docker Compose se o Docker estiver disponível. REST, streams e o viewer fazem bind em `127.0.0.1` por padrão.

Instale o `iii-engine` manualmente. **O agentmemory atualmente fixa o `iii-engine` em `v0.11.2`** — `v0.11.6` introduz um novo modelo que faz sandbox de tudo via `iii worker add` que o agentmemory ainda não foi refatorado para usar. O pin sai assim que o refactor cair. Sobrescreva com `AGENTMEMORY_III_VERSION=<version>` se você migrou manualmente para o modelo de sandbox.

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSL https://github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-aarch64-apple-darwin.tar.gz | tar -xz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** troque `aarch64-apple-darwin` por `x86_64-apple-darwin`
- **Linux x64:** troque por `x86_64-unknown-linux-gnu`
- **Linux arm64:** troque por `aarch64-unknown-linux-gnu`
- **Windows:** baixe `iii-x86_64-pc-windows-msvc.zip` de [iii-hq/iii releases v0.11.2](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2), extraia `iii.exe`, adicione ao PATH

Ou use Docker (o `docker-compose.yml` empacotado puxa `iiidev/iii:0.11.2`). Docs completas: [iii.dev/docs](https://iii.dev/docs).

### Windows

agentmemory roda em Windows 10/11, mas só o pacote Node.js não é suficiente — você também precisa do runtime `iii-engine` (um binário nativo separado) como processo em segundo plano. O instalador oficial upstream é um script `sh` e hoje não há instalador PowerShell nem pacote scoop/winget, então usuários de Windows têm dois caminhos:

**Opção A — Binário Windows pré-compilado (recomendado):**

```powershell
# 1. Open https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2 in your browser
#    (we pin to v0.11.2 until agentmemory refactors for the new sandbox
#     model that engine v0.11.6+ requires)
# 2. Download iii-x86_64-pc-windows-msvc.zip
#    (or iii-aarch64-pc-windows-msvc.zip if you're on an ARM machine)
# 3. Extract iii.exe somewhere on PATH, or place it at:
#    %USERPROFILE%\.local\bin\iii.exe
#    (agentmemory checks that location automatically)
# 4. Verify:
iii --version
# Should print: 0.11.2

# 5. Then run agentmemory as usual:
npx -y @agentmemory/agentmemory
```

**Opção B — Docker Desktop:**

```powershell
# 1. Install Docker Desktop for Windows
# 2. Start Docker Desktop and make sure the engine is running
# 3. Run agentmemory — it will auto-start the bundled compose file:
npx -y @agentmemory/agentmemory
```

**Opção C — apenas MCP standalone (sem engine):** se você só precisa das tools MCP para seu agente e não precisa da REST API, viewer ou cron jobs, pule o engine completamente:

```powershell
npx -y @agentmemory/agentmemory mcp
# or via the shim package:
npx -y @agentmemory/mcp
```

**Diagnóstico para Windows:** se `npx @agentmemory/agentmemory` falhar, rode novamente com `--verbose` para ver o stderr real do engine. Modos de falha comuns:

| Sintoma | Correção |
|---|---|
| `iii-engine process started` seguido de `did not become ready within 15s` | Engine crashou na inicialização — rode novamente com `--verbose`, verifique stderr |
| `Could not start iii-engine` | Nem `iii.exe` nem Docker estão instalados. Veja Opção A ou B acima |
| Conflito de porta | `netstat -ano \| findstr :3111` para ver o que está em bind, mate o processo ou use `--port <N>` |
| Fallback do Docker é pulado mesmo com Docker instalado | Confira se o Docker Desktop está de fato rodando (ícone na bandeja do sistema) |

> Nota: não existe `cargo install iii-engine` — `iii` não é publicado no crates.io. Os únicos métodos de instalação suportados são o binário pré-compilado acima, o script de instalação `sh` upstream (somente macOS/Linux) e a imagem Docker.

---

<h2 id="deploy">Deploy</h2>

Templates de um clique para hosts gerenciados. Cada um inclui um
Dockerfile autocontido que puxa `@agentmemory/agentmemory` do npm
e copia o binário do iii engine da imagem oficial `iiidev/iii` no
Docker Hub — sem necessidade de imagem pré-compilada do agentmemory.
Armazenamento persistente monta em `/data`; o entrypoint de primeiro
boot sobrescreve a configuração iii empacotada pelo npm (que faz
bind em `127.0.0.1`) por uma ajustada para deploy que faz bind em
`0.0.0.0` e usa caminhos absolutos `/data`, gera o segredo HMAC e
depois reduz privilégios de `root` para `node` via `gosu` antes de
fazer exec do CLI do agentmemory.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

O botão de deploy de um clique do Render exige um `render.yaml` na raiz do repositório, que mantemos limpo de propósito. Use o fluxo Render Blueprint documentado em [`deploy/render/`](../deploy/render/README.md) para apontar para o blueprint do repo manualmente.

Detalhes completos de setup (captura de HMAC, túnel SSH do viewer, rotação, backup, mínimos de custo) ficam em [`deploy/`](../deploy/README.md):

- [`deploy/fly`](../deploy/fly/README.md) — máquina única com `auto_stop_machines = "stop"`; mais barato em idle.
- [`deploy/railway`](../deploy/railway/README.md) — taxa plana do plano Hobby, volume no dashboard.
- [`deploy/render`](../deploy/render/README.md) — fluxo Blueprint, snapshots automáticos de disco nos planos pagos.
- [`deploy/coolify`](../deploy/coolify/README.md) — self-hosted no seu próprio VPS via [Coolify](https://coolify.io/self-hosted); mesma stack Docker Compose, você possui o host e os dados.

Somente a porta `3111` é publicada. O viewer em `3113` fica em bind no loopback dentro do contêiner — o README de cada template documenta o padrão de túnel SSH para alcançá-lo.

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Por que agentmemory" height="32" /></picture></h2>

Todo agente de codificação esquece tudo quando a sessão termina. Você desperdiça os primeiros 5 minutos de toda sessão re-explicando sua stack. agentmemory roda em segundo plano e elimina isso por completo.

```text
Session 1: "Add auth to the API"
  Agent writes code, runs tests, fixes bugs
  agentmemory silently captures every tool use
  Session ends -> observations compressed into structured memory

Session 2: "Now add rate limiting"
  Agent already knows:
    - Auth uses JWT middleware in src/middleware/auth.ts
    - Tests in test/auth.test.ts cover token validation
    - You chose jose over jsonwebtoken for Edge compatibility
  Zero re-explaining. Starts working immediately.
```

### vs memória integrada do agente

Todo agente de codificação com IA vem com memória integrada — Claude Code tem `MEMORY.md`, Cursor tem notepads, Cline tem memory bank. Funcionam como post-its. agentmemory é o banco de dados pesquisável por trás dos post-its.

| | Integrada (CLAUDE.md) | agentmemory |
|---|---|---|
| Escala | teto de 200 linhas | Ilimitado |
| Busca | Carrega tudo no contexto | BM25 + vector + graph (só top-K) |
| Custo em tokens | 22K+ com 240 observações | ~1.900 tokens (92% menos) |
| Cross-agent | Arquivos por agente | MCP + REST (qualquer agente) |
| Coordenação | Nenhuma | Leases, signals, actions, routines |
| Observabilidade | Leitura manual de arquivos | Viewer em tempo real em :3113 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="Como funciona" height="32" /></picture></h2>

### Pipeline de memória

```text
PostToolUse hook fires
  -> SHA-256 dedup (5min window)
  -> Privacy filter (strip secrets, API keys)
  -> Store raw observation
  -> LLM compress -> structured facts + concepts + narrative
  -> Vector embedding (6 providers + local)
  -> Index in BM25 + vector

Stop / SessionEnd hook fires
  -> Summarize session
  -> Knowledge graph extraction (if GRAPH_EXTRACTION_ENABLED=true)
  -> Slot reflection (if SLOT_REFLECT_ENABLED=true)

SessionStart hook fires
  -> Load project profile (top concepts, files, patterns)
  -> Hybrid search (BM25 + vector + graph)
  -> Token budget (default: 2000 tokens)
  -> Inject into conversation
```

### Consolidação de memória em 4 níveis

Inspirada em como o cérebro humano processa memória — não muito diferente da consolidação do sono.

| Nível | O quê | Analogia |
|------|------|---------|
| **Working** | Observações brutas a partir do uso de tools | Memória de curto prazo |
| **Episodic** | Resumos de sessão comprimidos | "O que aconteceu" |
| **Semantic** | Fatos e padrões extraídos | "O que eu sei" |
| **Procedural** | Workflows e padrões de decisão | "Como fazer" |

As memórias decaem com o tempo (curva de Ebbinghaus). Memórias acessadas com frequência se reforçam. Memórias velhas são evictadas automaticamente. Contradições são detectadas e resolvidas.

### O que é capturado

| Hook | Captura |
|------|----------|
| `SessionStart` | Caminho do projeto, ID da sessão |
| `UserPromptSubmit` | Prompts do usuário (filtrados por privacidade) |
| `PreToolUse` | Padrões de acesso a arquivos + contexto enriquecido |
| `PostToolUse` | Nome da tool, entrada, saída |
| `PostToolUseFailure` | Contexto do erro |
| `PreCompact` | Reinjeta memória antes da compactação |
| `SubagentStart/Stop` | Ciclo de vida de sub-agentes |
| `Stop` | Resumo de fim de sessão |
| `SessionEnd` | Marcador de sessão completa |

### Principais capacidades

| Capacidade | Descrição |
|---|---|
| **Captura automática** | Todo uso de tool registrado via hooks — esforço manual zero |
| **Busca semântica** | BM25 + vector + grafo de conhecimento com fusão RRF |
| **Evolução de memória** | Versionamento, supersessão, grafos de relacionamento |
| **Auto-esquecimento** | Expiração por TTL, detecção de contradição, evicção por importância |
| **Privacy first** | API keys, segredos e tags `<private>` são removidos antes do armazenamento |
| **Self-healing** | Circuit breaker, cadeia de fallback de providers, monitoramento de saúde |
| **Ponte Claude** | Sincronização bidirecional com MEMORY.md |
| **Grafo de conhecimento** | Extração de entidades + travessia BFS |
| **Memória de time** | Compartilhado namespaced + privado entre membros do time |
| **Provenance de citação** | Rastreia qualquer memória de volta às observações originais |
| **Snapshots Git** | Versiona, faz rollback e diff do estado de memória |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Busca" height="32" /></picture></h2>

Recuperação triple-stream combinando três sinais:

| Stream | O que faz | Quando |
|---|---|---|
| **BM25** | Matching de palavra-chave com stemming + expansão de sinônimos | Sempre ativo |
| **Vector** | Similaridade de cosseno sobre embeddings densos | Provider de embedding configurado |
| **Graph** | Travessia do grafo de conhecimento via matching de entidades | Entidades detectadas na query |

Fundidos com Reciprocal Rank Fusion (RRF, k=60) e diversificados por sessão (máximo de 3 resultados por sessão).

BM25 tokeniza grego, cirílico, hebraico, árabe e latim acentuado de fábrica. Para memórias em chinês / japonês / coreano, instale os segmentadores opcionais (`npm install @node-rs/jieba tiny-segmenter`) para quebrar runs CJK em tokens em nível de palavra; sem eles, o agentmemory faz soft-fallback para tokenização por run inteiro e imprime uma dica única no stderr.

### Providers de embedding

agentmemory autodetecta seu provider. Para melhores resultados, instale embeddings locais (gratuito):

```bash
npm install @xenova/transformers
```

| Provider | Modelo | Custo | Notas |
|---|---|---|---|
| **Local (recomendado)** | `all-MiniLM-L6-v2` | Gratuito | Offline, +8pp de recall sobre BM25-only |
| Gemini | `gemini-embedding-001` | Free tier | 100+ idiomas, 768/1536/3072 dims (MRL), entrada de 2048 tokens. Substitui `text-embedding-004` ([deprecado, encerramento em 14 de janeiro de 2026](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | Maior qualidade |
| Voyage AI | `voyage-code-3` | Pago | Otimizado para código |
| Cohere | `embed-english-v3.0` | Trial gratuito | Uso geral |
| OpenRouter | Qualquer modelo | Varia | Proxy multi-modelo |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="Servidor MCP" height="32" /></picture></h2>

53 tools, 6 resources, 3 prompts e 4 skills — o toolkit MCP de memória mais completo para qualquer agente.

> **Shim MCP vs servidor completo:** o pacote publicado `@agentmemory/mcp` é um shim fino. Expõe a superfície completa de 51 tools **apenas quando consegue alcançar um servidor agentmemory em execução** via `AGENTMEMORY_URL` (modo proxy). Sem servidor acessível, o shim cai para um set local de 7 tools (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). A variável de ambiente `AGENTMEMORY_TOOLS=core|all` é uma flag *do lado do servidor* — defini-la no bloco `env` do shim não tem efeito. Se você vê só 7 tools no Cursor / OpenCode / Gemini CLI, inicie `npx @agentmemory/agentmemory` (ou a stack Docker) e defina `AGENTMEMORY_URL=http://localhost:3111`.

### 51 Tools

<details>
<summary>Tools principais (sempre disponíveis)</summary>

| Tool | Descrição |
|------|-------------|
| `memory_recall` | Busca observações passadas |
| `memory_compress_file` | Comprime arquivos markdown preservando a estrutura |
| `memory_save` | Salva um insight, decisão ou padrão |
| `memory_patterns` | Detecta padrões recorrentes |
| `memory_smart_search` | Busca híbrida semântica + por palavras |
| `memory_file_history` | Observações passadas sobre arquivos específicos |
| `memory_sessions` | Lista sessões recentes |
| `memory_timeline` | Observações cronológicas |
| `memory_profile` | Perfil de projeto (conceitos, arquivos, padrões) |
| `memory_export` | Exporta todos os dados de memória |
| `memory_relations` | Consulta o grafo de relacionamentos |

</details>

<details>
<summary>Tools estendidas (51 no total — defina AGENTMEMORY_TOOLS=all)</summary>

| Tool | Descrição |
|------|-------------|
| `memory_patterns` | Detecta padrões recorrentes |
| `memory_timeline` | Observações cronológicas |
| `memory_relations` | Consulta o grafo de relacionamentos |
| `memory_graph_query` | Travessia do grafo de conhecimento |
| `memory_consolidate` | Executa a consolidação de 4 níveis |
| `memory_claude_bridge_sync` | Sincroniza com MEMORY.md |
| `memory_team_share` | Compartilha com membros do time |
| `memory_team_feed` | Itens compartilhados recentes |
| `memory_audit` | Trilha de auditoria de operações |
| `memory_governance_delete` | Deleção com trilha de auditoria |
| `memory_snapshot_create` | Snapshot versionado no Git |
| `memory_action_create` | Cria itens de trabalho com dependências |
| `memory_action_update` | Atualiza status de action |
| `memory_frontier` | Actions desbloqueadas ranqueadas por prioridade |
| `memory_next` | A única action mais importante a seguir |
| `memory_lease` | Leases exclusivos de actions (multiagente) |
| `memory_routine_run` | Instancia rotinas de workflow |
| `memory_signal_send` | Mensageria entre agentes |
| `memory_signal_read` | Lê mensagens com confirmação de recebimento |
| `memory_checkpoint` | Portões de condições externas |
| `memory_mesh_sync` | Sincronização P2P entre instâncias |
| `memory_sentinel_create` | Watchers dirigidos por eventos |
| `memory_sentinel_trigger` | Dispara sentinels externamente |
| `memory_sketch_create` | Grafos de actions efêmeros |
| `memory_sketch_promote` | Promove para permanente |
| `memory_crystallize` | Compacta cadeias de actions |
| `memory_diagnose` | Health checks |
| `memory_heal` | Corrige automaticamente estado travado |
| `memory_facet_tag` | Tags dimension:value |
| `memory_facet_query` | Consulta por tags de facet |
| `memory_verify` | Rastreia provenance |

</details>

### 6 Resources · 3 Prompts · 4 Skills

| Tipo | Nome | Descrição |
|------|------|-------------|
| Resource | `agentmemory://status` | Saúde, contagem de sessões, contagem de memórias |
| Resource | `agentmemory://project/{name}/profile` | Inteligência por projeto |
| Resource | `agentmemory://memories/latest` | As 10 memórias ativas mais recentes |
| Resource | `agentmemory://graph/stats` | Estatísticas do grafo de conhecimento |
| Prompt | `recall_context` | Busca + retorna mensagens de contexto |
| Prompt | `session_handoff` | Dados de handoff entre agentes |
| Prompt | `detect_patterns` | Analisa padrões recorrentes |
| Skill | `/recall` | Busca na memória |
| Skill | `/remember` | Salva na memória de longo prazo |
| Skill | `/session-history` | Resumos recentes de sessões |
| Skill | `/forget` | Deleta observações/sessões |

### MCP standalone

Rode sem o servidor completo — para qualquer cliente MCP. Qualquer um destes funciona:

```bash
npx -y @agentmemory/agentmemory mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

Ou adicione à configuração MCP do seu agente:

A maioria dos agentes (Cursor, Claude Desktop, Cline, Roo Code, Windsurf, Gemini CLI):
```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}
```

Mescle a entrada `agentmemory` no objeto `mcpServers` existente do seu host em vez de substituir o arquivo. Para clientes em sandbox que não conseguem alcançar o `localhost` do host, adicione `"AGENTMEMORY_FORCE_PROXY": "1"` ao bloco env e defina `AGENTMEMORY_URL` para uma rota que o sandbox alcance.

OpenCode (`opencode.json`):
```json
{
  "mcp": {
    "agentmemory": {
      "type": "local",
      "command": ["npx", "-y", "@agentmemory/mcp"],
      "enabled": true
    }
  },
  "plugin": ["./plugins/agentmemory-capture.ts"]
}
```

Copie o arquivo do plugin do repo:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Viewer em tempo real" height="32" /></picture></h2>

Sobe automaticamente na porta `3113`. Stream ao vivo de observações, explorador de sessões, navegador de memórias, visualização do grafo de conhecimento e dashboard de saúde.

```bash
open http://localhost:3113
```

O servidor do viewer faz bind em `127.0.0.1` por padrão. O endpoint servido por REST `/agentmemory/viewer` segue as regras normais de bearer-token `AGENTMEMORY_SECRET`. Os headers CSP usam um nonce de script por resposta e desabilitam atributos de handler inline (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

O viewer em `:3113` mostra o que seu agente **lembrou**. O [iii console](https://iii.dev/docs/console) mostra o que seu agente **fez** — cada operação de memória como uma trace do OpenTelemetry, cada entrada KV editável, cada função invocável, cada stream observável. Duas janelas sobre a mesma memória: uma em formato de produto, outra em formato de engine.

Veja um `memory_smart_search` disparar e enxergue o scan BM25 → busca de embedding → fusão RRF → reranker como um waterfall. Edite um timer de consolidação travado no navegador KV. Reproduza um hook `PostToolUse` com payload ajustado. Fixe o stream WebSocket e veja as observações chegando ao vivo.

agentmemory oferece isso de graça porque toda função, trigger, escopo de estado e stream é um primitivo iii — nada custom, nada para instrumentar.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="Página Workers do iii console — workers conectados incluindo instâncias do agentmemory com contagem de funções ao vivo e metadados de runtime" width="720" />
  <br/>
  <em>Página Workers: todo worker conectado — incluindo o próprio agentmemory — com PID, contagem de funções, runtime e last-seen.</em>
</p>

**Já instalado.** O console vem junto com `iii` — sem instalador separado.

**Suba junto com o agentmemory:**

```bash
# agentmemory viewer holds port 3113, so run the console on 3114.
# Engine REST (3111), WebSocket (3112), and bridge (49134) defaults match agentmemory.
iii console --port 3114
```

Depois abra `http://localhost:3114`. Adicione `--enable-flow` para a página experimental de grafo de arquitetura.

Sobrescreva endpoints do engine apenas se você os tiver movido:

```bash
iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**O que você pode fazer pelo console:**

| Página | Use para |
|------|-----------|
| **Workers** | Ver todo worker conectado e suas métricas ao vivo — incluindo o próprio worker do agentmemory. |
| **Functions** | Invocar qualquer função do agentmemory diretamente com um payload JSON — útil para testar `memory.recall`, `memory.consolidate`, `graph.query` sem cabear um cliente. |
| **Triggers** | Reproduzir triggers HTTP, cron, event e state — disparar o cron de consolidação manualmente, reexecutar uma rota HTTP, emitir uma mudança de estado. |
| **States** | Navegador KV com CRUD completo — sessões, slots de memória, timers de ciclo de vida, índice de embeddings — edite valores no lugar. |
| **Streams** | Monitor WebSocket ao vivo para escritas de memória, eventos de hook e atualizações de observação à medida que fluem pelos streams iii. |
| **Queues** | Tópicos de fila duráveis + gestão de dead-letter. Reproduza ou descarte jobs de embedding / compressão que falharam. |
| **Traces** | Vistas waterfall / flame / breakdown por serviço do OpenTelemetry. Filtre por `trace_id` para ver exatamente quais funções, chamadas a DB e requisições de embedding um único `memory.search` produziu. |
| **Logs** | Logs OTEL estruturados filtrados e correlacionados a trace/span IDs. |
| **Config** | Configuração de runtime — veja exatamente com quais workers, providers e portas seu engine está rodando. |
| **Flow** | (Opcional, `--enable-flow`) Grafo de arquitetura interativo de todo worker, trigger e stream. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="Visão waterfall de trace do iii console mostrando duração por span" width="720" />
  <br/>
  <em>Traces: waterfall / flame / breakdown por serviço para toda operação de memória.</em>
</p>

**Traces já estão ativos:**

`iii-config.yaml` vem com o worker `iii-observability` habilitado (`exporter: memory`, `sampling_ratio: 1.0`, métricas + logs). Sem configuração extra — no momento em que o agentmemory inicia, toda operação de memória emite um trace span e um log estruturado que o console consegue ler.

Se você quiser exportar para Jaeger/Honeycomb/Grafana Tempo, troque `exporter: memory` por `exporter: otlp` e configure o endpoint do collector conforme a documentação de observabilidade do iii.

> **Aviso:** nenhum auth é aplicado no console em si — mantenha-o em bind em `127.0.0.1` (o padrão) e nunca o exponha publicamente.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory **já é uma instância [iii](https://iii.dev) em execução**. Funções, triggers, estado KV, streams, traces OTEL — tudo são primitivos iii. Você não instalou Postgres, Redis, Express, pm2 ou Prometheus, porque o iii os substitui.

Isso significa que mais um comando estende o agentmemory com uma capacidade totalmente nova.

### Estenda o agentmemory com um comando

```bash
iii worker add iii-pubsub          # fan memory writes out to every connected instance
iii worker add iii-cron            # scheduled consolidation, decay sweeps, snapshot rotation
iii worker add iii-queue           # durable retries for embedding + compression jobs
iii worker add iii-observability   # OTEL traces on every memory op (default on)
iii worker add iii-sandbox         # run recalled code inside an isolated microVM
iii worker add iii-database        # swap in a SQL-backed state adapter
iii worker add mcp                 # generic MCP host alongside the agentmemory MCP
```

Cada `iii worker add` registra novas funções e triggers no mesmo engine onde o agentmemory já está rodando. O viewer e o console os reconhecem na hora — sem reload, sem nova integração, sem novo contêiner.

| `iii worker add` | O que você ganha em cima do agentmemory |
|---|---|
| [`iii-pubsub`](https://workers.iii.dev/workers/iii-pubsub) | Memória multi-instância: todo `remember` faz fanout, todo `search` lê a união |
| [`iii-cron`](https://workers.iii.dev/workers/iii-cron) | Ciclo de vida agendado — consolidação noturna, snapshots semanais, decaimento em relógio fixo |
| [`iii-queue`](https://workers.iii.dev/workers/iii-queue) | Retries duráveis: jobs falhos de embedding + compressão sobrevivem a restart, sem observações perdidas |
| [`iii-observability`](https://workers.iii.dev/workers/iii-observability) | Traces OTEL, métricas, logs em toda função — cabeado em `iii-config.yaml` desde o primeiro dia |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | Código que veio do `memory_recall` roda dentro de uma VM descartável, não no seu shell |
| [`iii-database`](https://workers.iii.dev/workers/iii-database) | Adaptador de estado baseado em SQL quando você ultrapassa o KV in-memory padrão |
| [`mcp`](https://workers.iii.dev/workers/mcp) | Suba servidores MCP adicionais ao lado do MCP do agentmemory, compartilhando o mesmo engine |

Registry completo: [workers.iii.dev](https://workers.iii.dev). Todo worker lá se compõe pelos mesmos primitivos que o agentmemory usa — e o agentmemory que você já tem é um deles.

### O que o iii substitui

| Stack tradicional | agentmemory usa |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + índice vetorial in-memory |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | Supervisão de workers do iii engine |
| Prometheus / Grafana | iii OTEL + monitor de saúde |
| Sistemas de plugin customizados | `iii worker add <name>` |

**118 arquivos de código · ~21.800 LOC · 950+ tests · 123 funções · 34 escopos KV** — tudo em cima de três primitivos. Sem `agentmemory plugin install`. O sistema de plugins é o próprio iii.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Configuração" height="32" /></picture></h2>

### Providers de LLM

agentmemory autodetecta a partir do seu ambiente. Por padrão, nenhuma chamada LLM é feita a menos que você configure um provider ou opte explicitamente pelo fallback de assinatura do Claude.

| Provider | Config | Notas |
|----------|--------|-------|
| **No-op (padrão)** | Sem configuração | Compress/summarize via LLM DESATIVADO. Compressão sintética BM25 + recall ainda funcionam. Veja `AGENTMEMORY_ALLOW_AGENT_SDK` abaixo se você dependia do fallback de assinatura do Claude. |
| Anthropic API | `ANTHROPIC_API_KEY` | Cobrança por token |
| MiniMax | `MINIMAX_API_KEY` | Compatível com Anthropic |
| Gemini | `GEMINI_API_KEY` | Também habilita embeddings |
| OpenRouter | `OPENROUTER_API_KEY` | Qualquer modelo |
| Claude subscription fallback | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Apenas opt-in. Cria sessões de `@anthropic-ai/claude-agent-sdk` — costumava causar recursão sem limite no Stop-hook (seguimento do #149), por isso não é mais o padrão. |

### Seleção de modelo com consciência de custo

A compressão em background roda em toda observação, então a escolha de modelo muda o gasto mensal de forma significativa. Dados de workload capturados: 635 requisições / 888K tokens / 35 horas de uso ativo, executados contra três modelos OpenRouter a preços de 2026-05-23.

| Tier | Modelo | Input / 1M | Output / 1M | Custo para as 35h capturadas | Notas |
|------|-------|------------|-------------|---------------------------|-------|
| Recomendado | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | Qualidade sólida de compressão + sumarização a um custo ~10× menor que o Sonnet. |
| Recomendado | `deepseek/deepseek-chat` | $0.27 | $1.10 | ~$0.40 | Mais antigo mas ainda OK para workloads só de compressão. |
| Recomendado | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | Bom raciocínio de código se suas sessões forem muito orientadas a código. |
| Premium | `anthropic/claude-sonnet-4.6` | $3.00 | $15.00 | ~$5.02 | Alta qualidade, mas caro para trabalho de background sempre ativo. |
| Premium | `openai/gpt-4o` | $2.50 | $10.00 | ~$4.20 | Tier similar ao Sonnet. |
| Evitar | `anthropic/claude-opus-4.6` | $15.00 | $75.00 | ~$25+ | Modelo classe reasoning; gasto desproporcional para compressão. |

agentmemory imprime um aviso em runtime quando `OPENROUTER_MODEL` casa com um padrão de tier premium. Defina `AGENTMEMORY_SUPPRESS_COST_WARNING=1` para silenciar depois que você tiver tomado uma decisão informada.

Trade-off qualidade vs custo para trabalho de memória: compressão é uma tarefa de sumarização com critério de qualidade relativamente frouxo (quem relê o resumo é o agente, não o usuário). DeepSeek-V4-Pro / Qwen3-Coder ficam dentro do erro de arredondamento do Sonnet nessa tarefa, custando ~10× menos. Reserve os modelos tier premium para as queries que você lê diretamente.

Fontes: [OpenRouter pricing for Sonnet 4.6](https://openrouter.ai/anthropic/claude-sonnet-4.6/pricing), [DeepSeek V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro), [DeepSeek pricing notes](https://api-docs.deepseek.com/quick_start/pricing/).

### Memória multiagente (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

Em setups multiagente onde vários papéis compartilham um servidor agentmemory (architect / developer / reviewer / researcher / support-agent), `AGENT_ID` etiqueta cada escrita com o papel que a fez. `AGENTMEMORY_AGENT_SCOPE` controla se o recall filtra por essa tag.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

Dois modos:

| Modo | Etiqueta escritas | Filtra recall | Quando usar |
|------|------------|---------------|-------------|
| `shared` (padrão) | sim | não | Contexto cross-agent com trilha de auditoria. O architect pode ver o que o developer anotou, mas toda linha registra quem disse. |
| `isolated` | sim | sim | Separação estrita. O architect nunca vê observações / memórias / sessões do developer. |

O que é etiquetado quando `AGENT_ID` está definido: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. O papel flui `api::session::start` → `mem::observe` → `mem::compress` → KV.

O que é filtrado no modo isolated: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Cada endpoint aceita `?agentId=<role>` para sobrescrever por requisição, e `?agentId=*` para sair do escopo do env por completo. `/memories` também aceita `?includeOrphans=true` para mostrar memórias pré-AGENT_ID cujo `agentId` é undefined.

Override por chamada na camada SDK / REST: todo endpoint mutador (`/session/start`, `/remember`) aceita um campo `agentId` no body da requisição que vence o env. Útil para runtimes que roteiam muitos papéis por um único processo de servidor.

Quando `AGENT_ID` não está definido, a memória permanece sem escopo (comportamento legado, sem tags, sem filtros).

### Portas

agentmemory + iii-engine fazem bind em quatro portas por padrão. Se um restart falhar com `port in use`, esta tabela diz qual processo procurar.

| Porta | Processo | Propósito | Override por env |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | Worker de streams interno (consumido por agentmemory + viewer) | `III_STREAMS_PORT` |
| `3113` | agentmemory | Viewer em tempo real (`http://localhost:3113`) | `AGENTMEMORY_VIEWER_PORT` |
| `49134` | iii-engine | WebSocket — workers se registram aqui, telemetria OTel flui por cima | `III_ENGINE_URL` (URL completa, padrão `ws://localhost:49134`) |

Limpeza de processo travado quando as portas ficam ocupadas após uma execução crashada:

```bash
# macOS / Linux — find whatever is on each port and kill it
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` recolhe tanto o worker quanto o pidfile do engine de forma limpa no shutdown graceful (#640, #474). A limpeza manual acima só serve para o caso pós-crash em que nenhum pidfile foi deixado para trás.

### Arquivo de configuração

Coloque a configuração de runtime do agentmemory em `~/.agentmemory/.env` em vez de exportar variáveis em cada shell. Se o viewer mostrar uma dica de setup como `export ANTHROPIC_API_KEY=...`, copie para este arquivo como `ANTHROPIC_API_KEY=...` sem o prefixo `export`, depois reinicie o agentmemory.

Variáveis de ambiente do processo continuam funcionando e têm precedência sobre os valores no arquivo.

No Windows, o mesmo arquivo fica em `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

Para testar com uma assinatura Claude Code Pro/Max em vez de uma API key, faça opt-in explícito:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

Ligue features de graph ou consolidation no mesmo arquivo se quiser:

```env
GRAPH_EXTRACTION_ENABLED=true
CONSOLIDATION_ENABLED=true
```

### Variáveis de ambiente

Crie `~/.agentmemory/.env`:

```env
# LLM provider (pick one — default is the no-op provider: no LLM calls)
# ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_BASE_URL=...              # Optional: Anthropic-compatible proxy / Azure
# GEMINI_API_KEY=...
# OPENROUTER_API_KEY=...
# MINIMAX_API_KEY=...
# OPENAI_API_KEY=***                       # NOTE: this same key auto-activates BOTH the
#                                          # OpenAI LLM provider (here) AND the OpenAI
#                                          # embedding provider (further below). Set
#                                          # OPENAI_API_KEY_FOR_LLM=false to scope it
#                                          # to embeddings only.
# OPENAI_BASE_URL=https://api.openai.com   # Optional: override for Azure / vLLM / LM Studio / proxies
#                                          # Azure: https://<resource>.openai.azure.com/openai/deployments/<deployment>
#                                          # Auto-detected from `.openai.azure.com` hostname; uses
#                                          # api-key header + api-version query param.
# OPENAI_API_VERSION=2024-08-01-preview    # Optional: Azure api-version query param
# OPENAI_MODEL=gpt-4o-mini                 # Optional: default model
# OPENAI_TIMEOUT_MS=60000                  # Optional: OpenAI-scoped alias for the outbound fetch
#                                          # timeout. Takes precedence over AGENTMEMORY_LLM_TIMEOUT_MS
#                                          # for back-compat with v0.9.17. New configs should
#                                          # prefer the global AGENTMEMORY_LLM_TIMEOUT_MS below.
# OPENAI_REASONING_EFFORT=none             # Optional: "low" | "medium" | "high" | "none"
#                                          # Honored only by OpenAI's reasoning models (o1, o3,
#                                          # gpt-*-reasoning) and providers that mirror that
#                                          # schema (Ollama Cloud thinking models). Standard
#                                          # chat models reject this field with 400. Set to
#                                          # "none" for thinking models that return reasoning
#                                          # but no content.
# OPENAI_API_KEY_FOR_LLM=false             # Optional: set to false to skip OpenAI auto-detection
#                                          # for LLM (useful if you only want OpenAI for embeddings)
# Opt-in Claude-subscription fallback (spawns @anthropic-ai/claude-agent-sdk);
# leave OFF unless you understand the Stop-hook recursion risk (#149 follow-up):
# AGENTMEMORY_ALLOW_AGENT_SDK=true

# Embedding provider (auto-detected, or override)
# EMBEDDING_PROVIDER=local
# VOYAGE_API_KEY=...
# OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=https://api.openai.com   # Override for Azure / vLLM / LM Studio / proxies
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# OPENAI_EMBEDDING_DIMENSIONS=1536        # Required when the model is not in the known-models table

# Outbound LLM / embedding timeout
# AGENTMEMORY_LLM_TIMEOUT_MS=60000       # Default: 60 000 ms (60 s). Applies to every
                                          # raw-fetch provider (Gemini, OpenRouter, MiniMax,
                                          # OpenAI LLM, OpenAI/Cohere/Voyage/OpenRouter
                                          # embedding). For the OpenAI LLM path, the
                                          # OpenAI-scoped OPENAI_TIMEOUT_MS alias (above)
                                          # takes precedence when set, for back-compat
                                          # with v0.9.17.
                                          # Increase for slow networks or large batch calls;
                                          # decrease to fail-fast on rate-limit holds.

# Search tuning
# BM25_WEIGHT=0.4
# VECTOR_WEIGHT=0.6
# TOKEN_BUDGET=2000

# Auth
# AGENTMEMORY_SECRET=your-secret

# Ports (defaults: 3111 API, 3113 viewer)
# III_REST_PORT=3111

# Features
# AGENTMEMORY_AUTO_COMPRESS=false  # OFF by default (#138). When on,
                                   # every PostToolUse hook calls your
                                   # LLM provider to compress the
                                   # observation — expect significant
                                   # token spend on active sessions.
# AGENTMEMORY_SLOTS=false          # OFF by default. Editable pinned
                                   # memory slots — persona,
                                   # user_preferences, tool_guidelines,
                                   # project_context, guidance,
                                   # pending_items, session_patterns,
                                   # self_notes. Size-limited; agent
                                   # edits via memory_slot_* tools.
                                   # Pinned slots addressable for
                                   # SessionStart injection.
# AGENTMEMORY_REFLECT=false        # OFF by default. Requires SLOTS=on.
                                   # Stop hook fires mem::slot-reflect:
                                   # scans recent observations, auto-
                                   # appends TODOs to pending_items,
                                   # counts patterns in
                                   # session_patterns, records touched
                                   # files in project_context. Fire-
                                   # and-forget; does not block.
# AGENTMEMORY_INJECT_CONTEXT=false # OFF by default (#143). When on:
                                   # - SessionStart may inject ~1-2K
                                   #   chars of project context into
                                   #   the first turn of each session
                                   #   (this is what actually reaches
                                   #   the model — Claude Code treats
                                   #   SessionStart stdout as context)
                                   # - PreToolUse fires /agentmemory/enrich
                                   #   on every file-touching tool call
                                   #   (resource cleanup, not a token
                                   #   fix — PreToolUse stdout is debug
                                   #   log only per Claude Code docs)
                                   # Observations are still captured via
                                   # PostToolUse regardless of this flag.
# GRAPH_EXTRACTION_ENABLED=false
# CONSOLIDATION_ENABLED=true
# LESSON_DECAY_ENABLED=true
# OBSIDIAN_AUTO_EXPORT=false
# AGENTMEMORY_EXPORT_ROOT=~/.agentmemory
# CLAUDE_MEMORY_BRIDGE=false
# SNAPSHOT_ENABLED=false

# Team
# TEAM_ID=
# USER_ID=
# TEAM_MODE=private

# Tool visibility: "core" (8 tools) or "all" (51 tools)
# AGENTMEMORY_TOOLS=core
```

---

<h2 id="api"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-api.svg"><img src="../assets/tags/section-api.svg" alt="API" height="32" /></picture></h2>

124 endpoints na porta `3111`. A REST API faz bind em `127.0.0.1` por padrão. Endpoints protegidos exigem `Authorization: Bearer <secret>` quando `AGENTMEMORY_SECRET` está definido, e endpoints de mesh sync exigem `AGENTMEMORY_SECRET` em ambos os peers.

<details>
<summary>Endpoints principais</summary>

| Method | Path | Descrição |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Health check (sempre público) |
| `POST` | `/agentmemory/session/start` | Inicia sessão + obtém contexto |
| `POST` | `/agentmemory/session/end` | Encerra sessão |
| `POST` | `/agentmemory/observe` | Captura observação |
| `POST` | `/agentmemory/smart-search` | Busca híbrida |
| `POST` | `/agentmemory/context` | Gera contexto |
| `POST` | `/agentmemory/remember` | Salva na memória de longo prazo |
| `POST` | `/agentmemory/forget` | Deleta observações |
| `POST` | `/agentmemory/enrich` | Contexto de arquivo + memórias + bugs |
| `GET` | `/agentmemory/profile` | Perfil de projeto |
| `GET` | `/agentmemory/export` | Exporta todos os dados |
| `POST` | `/agentmemory/import` | Importa de JSON |
| `POST` | `/agentmemory/graph/query` | Query do grafo de conhecimento |
| `POST` | `/agentmemory/team/share` | Compartilha com o time |
| `GET` | `/agentmemory/audit` | Trilha de auditoria |

Lista completa de endpoints: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Desenvolvimento" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 950+ tests
npm run test:integration  # API tests (requires running services)
```

**Pré-requisitos:** Node.js >= 20, [iii-engine](https://iii.dev/docs) ou Docker

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="Licença" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
