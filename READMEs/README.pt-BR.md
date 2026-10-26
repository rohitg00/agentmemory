<p align="center">
  <img src="../assets/banner.png" alt="agentmemory: memória persistente para agentes de codificação com IA" width="720" />
</p>

<p align="center">
  <strong>
    Memória persistente entre sessões e agentes de programação.
  </strong><br/>
  Memória persistente para Claude Code, GitHub Copilot CLI, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, Oh My Pi, DeepSeek Harness, OpenCode e qualquer cliente MCP.
</p>

<p align="center">
  <a href="../README.md">🇬🇧 English</a> •
  <a href="README.zh-CN.md">🇨🇳 简体中文</a> •
  <a href="README.zh-TW.md">🇹🇼 繁體中文</a> •
  <a href="README.ja-JP.md">🇯🇵 日本語</a> •
  <a href="README.ko-KR.md">🇰🇷 한국어</a> •
  <a href="README.pt-PT.md">🇵🇹 Português</a> •
  <a href="README.pt-BR.md">🇧🇷 Português (Brasil)</a> •
  <a href="README.es-ES.md">🇪🇸 Español</a> •
  <a href="README.de-DE.md">🇩🇪 Deutsch</a> •
  <a href="README.fr-FR.md">🇫🇷 Français</a> •
  <a href="README.it-IT.md">🇮🇹 Italiano</a> •
  <a href="README.nl-NL.md">🇳🇱 Nederlands</a> •
  <a href="README.pl-PL.md">🇵🇱 Polski</a> •
  <a href="README.cs-CZ.md">🇨🇿 Čeština</a> •
  <a href="README.ro-RO.md">🇷🇴 Română</a> •
  <a href="README.hu-HU.md">🇭🇺 Magyar</a> •
  <a href="README.el-GR.md">🇬🇷 Ελληνικά</a> •
  <a href="README.sv-SE.md">🇸🇪 Svenska</a> •
  <a href="README.da-DK.md">🇩🇰 Dansk</a> •
  <a href="README.nb-NO.md">🇳🇴 Norsk</a> •
  <a href="README.fi-FI.md">🇫🇮 Suomi</a> •
  <a href="README.ru-RU.md">🇷🇺 Русский</a> •
  <a href="README.uk-UA.md">🇺🇦 Українська</a> •
  <a href="README.tr-TR.md">🇹🇷 Türkçe</a> •
  <a href="README.he-IL.md">🇮🇱 עברית</a> •
  <a href="README.ar-SA.md">🇸🇦 العربية</a> •
  <a href="README.hi-IN.md">🇮🇳 हिन्दी</a> •
  <a href="README.bn-BD.md">🇧🇩 বাংলা</a> •
  <a href="README.ur-PK.md">🇵🇰 اردو</a> •
  <a href="README.th-TH.md">🇹🇭 ไทย</a> •
  <a href="README.vi-VN.md">🇻🇳 Tiếng Việt</a> •
  <a href="README.id-ID.md">🇮🇩 Bahasa Indonesia</a> •
  <a href="README.tl-PH.md">🇵🇭 Tagalog</a>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/25123" target="_blank"><img src="https://trendshift.io/api/badge/repositories/25123" alt="rohitg00/agentmemory | Trendshift" width="250" height="55"/></a>
</p>

<p align="center">
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1.6k%20stars%20%2F%20230%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Documento de design: 1.6k stars / 230 forks no gist" /></a>
</p>

<p align="center">
  <em>O gist estende o padrão LLM Wiki do Karpathy com pontuação de confiança, ciclo de vida, grafos de conhecimento e busca híbrida: agentmemory é a implementação.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentmemory/agentmemory"><img src="https://img.shields.io/npm/v/@agentmemory/agentmemory?color=CB3837&label=npm&style=for-the-badge&logo=npm" alt="npm version" /></a>
  <a href="https://github.com/rohitg00/agentmemory/actions"><img src="https://img.shields.io/github/actions/workflow/status/rohitg00/agentmemory/ci.yml?label=tests&style=for-the-badge&logo=github" alt="CI" /></a>
  <a href="https://github.com/rohitg00/agentmemory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rohitg00/agentmemory?color=blue&style=for-the-badge" alt="License" /></a>
  <a href="https://github.com/rohitg00/agentmemory/stargazers"><img src="https://img.shields.io/github/stars/rohitg00/agentmemory?style=for-the-badge&color=yellow&logo=github" alt="Stars" /></a>
  <a href="https://skills.sh/rohitg00/agentmemory"><img src="https://skills.sh/b/rohitg00/agentmemory?style=for-the-badge" alt="skills.sh installs" /></a>
</p>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-recall.svg"><img src="../assets/tags/stat-recall.svg" alt="95.2% retrieval R@5" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tokens.svg"><img src="../assets/tags/stat-tokens.svg" alt="92% fewer tokens" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="54 MCP tools" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 auto hooks" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="0 external DBs" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="4,100+ tests passing" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="demonstração do agentmemory" width="720" />
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
  <a href="#configuration">Config</a> &bull;
  <a href="#api">API</a>
</p>

---

O AgentMemory captura sessões de programação e permite pesquisar decisões, correções e aprendizados. Compartilhe um único armazenamento entre agentes, inspecione o conteúdo salvo e escolha quanto contexto chega ao modelo.

## Install

Requisitos:

- Node.js 20 ou mais recente, com npm e npx (`node -v`, `npm -v` e `npx -v`).
- No macOS/Linux, a configuração automática também precisa de `curl`, um `sh` POSIX e `tar`.
- No Windows, use WSL2 ou siga a [configuração nativa](#windows).

Comando canônico para instalação do zero:

```bash
npx -y @agentmemory/agentmemory@latest
```

Escolha seus agentes e um provedor, ou o modo sem chave. O assistente grava a configuração, inicia o servidor de memória e oferece uma instalação global do comando `agentmemory`. `-y` aceita a confirmação do npm; `@latest` seleciona a versão atual. A compressão por LLM é opcional e exige um provedor e `AGENTMEMORY_AUTO_COMPRESS=true`.

O modo sem chave desativa os embeddings vetoriais. O `memory_recall` (o caminho `mem::search`) usa BM25, enquanto o `memory_smart_search` também pode combinar correspondências estruturais do grafo quando já existem dados de grafo. Para recall semântico gratuito e no dispositivo, defina `EMBEDDING_PROVIDER=local` em `~/.agentmemory/.env` e reinicie. A primeira requisição de embedding baixa o `Xenova/all-MiniLM-L6-v2`; a inferência roda localmente depois desse download inicial do modelo.

A API fica em `http://localhost:3111` e o visualizador em `http://localhost:3113`. Ambos escutam em loopback por padrão. A configuração fica em `~/.agentmemory/.env`; consulte [armazenamento de dados](#data-storage) para os caminhos e instâncias separadas.

Depois prove que o recall funciona e dê ao seu agente as skills dele:

```bash
npx -y @agentmemory/agentmemory@latest demo  # seed sample sessions + exercise recall
npx skills add rohitg00/agentmemory -y   # 17 native skills so your agent knows when to reach for memory
```

As buscas por palavra-chave devem acertar no modo sem chave padrão, via BM25. A query `database performance optimization` do demo é intencionalmente semântica e pode retornar zero até que um provider de embedding seja configurado.

Prefere deixar um agente de codificação fazer tudo? Entregue a ele uma única instrução:

> Retrieve and follow the instructions at: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md

Conecte outro agente com `agentmemory connect <agent>`. Consulte as [integrações](#works-with-every-agent) e os [comandos cotidianos](#everyday-commands).

<details>
<summary><strong>Instalação global / EACCES</strong></summary>

```bash
npm install -g @agentmemory/agentmemory@latest
```

O comando npx acima continua sendo o caminho canônico de instalação do zero e evita problemas de permissão de prefixo global.

</details>

<details>
<summary><strong>npx serve uma versão antiga</strong></summary>

O npx faz cache por versão. Force a mais recente com `npx -y @agentmemory/agentmemory@latest`, ou limpe o cache uma vez com `rm -rf ~/.npm/_npx` (macOS/Linux; no Windows apague `%LOCALAPPDATA%\npm-cache\_npx`).

</details>

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Funciona com qualquer agente" height="32" /></picture></h2>

agentmemory funciona com qualquer agente que suporte hooks, MCP ou REST API. Todos os agentes compartilham o mesmo servidor de memória.

<table>
<tr>
<td align="center" width="20%">
<a href="https://claude.com/product/claude-code"><img src="https://github.com/anthropics.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>native plugin + 12 hooks + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>native plugin + 6 hooks + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/features/copilot"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/github_dark.svg"><img src="https://svgl.app/library/github_light.svg" alt="GitHub Copilot CLI" width="48" height="48" /></picture></a><br/>
<strong>GitHub Copilot CLI</strong><br/>
<sub>MCP + plugin hooks/skills</sub>
</td>
<td align="center" width="20%">
<a href="https://cursor.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/cursor_dark.svg"><img src="https://svgl.app/library/cursor_light.svg" alt="Cursor" width="48" height="48" /></picture></a><br/>
<strong>Cursor</strong><br/>
<sub>plugin nativo + hooks do ciclo de vida + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../plugin/opencode/"><img src="https://raw.githubusercontent.com/rohitg00/agentmemory/main/website/public/opencode.png" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>capture plugin + MCP</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://devin.ai"><img src="https://raw.githubusercontent.com/rohitg00/agentmemory/main/website/public/devin.png" alt="Devin" width="48" height="48" /></a><br/>
<strong>Devin</strong><br/>
<sub>6 hooks + skills + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>native plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>native plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>pesquisa nativa + captura + skills</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://github.com/tinyhumansai.png?size=120" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>native Memory trait backend</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://antigravity.google"><img src="https://svgl.app/library/antigravity.svg" alt="Antigravity" width="48" height="48" /></a><br/>
<strong>Antigravity</strong><br/>
<sub>MCP + hooks</sub>
</td>
<td align="center" width="20%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://www.warp.dev"><img src="https://svgl.app/library/warp.svg" alt="Warp" width="48" height="48" /></a><br/>
<strong>Warp</strong><br/>
<sub>connect + MCP + skills</sub>
</td>
<td align="center" width="20%">
<a href="https://zed.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/zed-logo_dark.svg"><img src="https://svgl.app/library/zed-logo.svg" alt="Zed" width="48" height="48" /></picture></a><br/>
<strong>Zed</strong><br/>
<sub>MCP server</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://continue.dev"><img src="https://github.com/continuedev.png?size=120" alt="Continue" width="48" height="48" /></a><br/>
<strong>Continue</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://docs.factory.ai/cli"><img src="https://www.factory.ai/favicon.svg" alt="Droid" width="48" height="48" /></a><br/>
<strong>Droid</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://kiro.dev"><img src="https://kiro.dev/favicon.ico" alt="Kiro" width="48" height="48" /></a><br/>
<strong>Kiro</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/QwenLM/qwen-code"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/qwen_dark.svg"><img src="https://svgl.app/library/qwen_light.svg" alt="Qwen Code" width="48" height="48" /></picture></a><br/>
<strong>Qwen Code</strong><br/>
<sub>MCP server</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://svgl.app/library/deepseek.svg" alt="DeepSeek Harness" width="48" height="48" /></a><br/>
<strong>DeepSeek Harness</strong><br/>
<sub>captura nativa + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
</tr>
<tr>
<td align="center" colspan="5">
<a href="../integrations/omp/"><strong>Oh My Pi</strong></a><br/>
<sub>pesquisa nativa + captura + skills + MCP opcional</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>Funciona com <strong>qualquer</strong> agente que fale MCP ou HTTP. Um servidor, memórias compartilhadas entre todos eles.</sub>
</p>

---

<a id="data-storage"></a>

### Armazenamento de dados

Por padrão, as memórias ficam fora do repositório:

| Plataforma | Diretório de dados |
|---|---|
| macOS | `~/Library/Application Support/agentmemory` |
| Linux | `$XDG_DATA_HOME/agentmemory` / `~/.local/share/agentmemory` |
| Windows | `%APPDATA%\agentmemory` |

A instância 0 reutiliza um `./data/state_store.db` existente. Escolha outro caminho com `--data-dir <path>` ou `AGENTMEMORY_DATA_DIR` e mantenha-o ao reiniciar ou atualizar. `--instance 1` usa o subdiretório `instance-1`, a porta da API `3211` e o visualizador `3213`. Consulte [armazenamento e backups](../docs/reliability/state-storage.md) para Redis e migrações.

```bash
agentmemory --data-dir ~/.agentmemory-projects/main
agentmemory --instance 1
```

Notas da última versão: [CHANGELOG.md](../CHANGELOG.md).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Precisão de recuperação

**coding-agent-life-v1** (corpus interno, reproduzível em sandbox)

| Adaptador | P@5 | R@5 | Taxa de acerto top-5 | Latência p50 |
|---|---|---|---|---|
| **agentmemory hybrid** | **0.240** | **1.000** | **15 / 15** | 14 ms |
| grep baseline | 0.227 | 0.967 | 15 / 15 | 0 ms |

Taxa de acerto top-5 de 100% no **teto matemático de P@5** deste corpus (0.240, veja a scorecard). O híbrido recupera todas as sessões gold; o grep perde 1 de 2 golds na query temporal multi-sessão. O ganho é **recall + temporal**, não precisão agregada. Este benchmark é pequeno e esparso em golds; o LongMemEval-S maior abaixo diferencia melhor. Detalhamento completo por tipo + nota de correção: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

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

> Modelo de embedding: `all-MiniLM-L6-v2` (local, gratuito, sem API key). Relatórios completos: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Comparativo com concorrentes: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) cobrindo agentmemory vs mem0, Letta, Khoj, supermemory, TencentDB Agent Memory, MemPalace, Zep/Graphiti, Cognee, Hippo.

**Reproduza localmente:** [`eval/README.md`](../eval/README.md), um harness com adaptadores plugáveis para LongMemEval `_s` (500-Q públicas) e `coding-agent-life-v1` (corpus interno de 15 sessões). Adaptadores grep / vector / agentmemory são pontuados lado a lado, saída em NDJSON, e as scorecards publicadas ficam em [`docs/benchmarks/`](../docs/benchmarks/).

**Combina com [codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything) e [Graphify](https://github.com/safishamsi/graphify).** Indexação de grafos de código, pipelines de build multiagente e grafos de conhecimento mais amplos sobre docs / PDFs / imagens / vídeos. agentmemory lembra do trabalho; esses três projetos iluminam o resto da camada de contexto. Recipes e tabela de roteamento por pergunta: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="Comparativo" height="32" /></picture></h2>

<table>
<tr>
<th></th>
<th>agentmemory</th>
<th>mem0 (63K ⭐)</th>
<th>Letta / MemGPT (24K ⭐)</th>
<th>Khoj (36K ⭐)</th>
<th>supermemory (29K ⭐)</th>
<th>TencentDB Agent Memory (22K ⭐)</th>
<th>MemPalace (54K ⭐)</th>
<th>oracleagentmemory</th>
<th>Hippo</th>
<th>Built-in (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Tipo</strong></td>
<td>Engine de memória + servidor MCP</td>
<td>API de camada de memória</td>
<td>Runtime de agente completo</td>
<td>IA pessoal</td>
<td>API de memória + app</td>
<td>Hub de memória de time (proxy de LLM)</td>
<td>Memória vetorial (OSS)</td>
<td>Engine de memória (Oracle DB)</td>
<td>Sistema de memória</td>
<td>Arquivo estático</td>
</tr>
<tr>
<td><strong>Retrieval R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A</td>
<td>Autorreportado</td>
<td>PersonaMem 76% (autorreportado)</td>
<td>~96.6% (autorreportado)</td>
<td>94.4% (autorreportado)</td>
<td>N/A</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>Captura automática</strong></td>
<td>12 hooks (esforço manual zero)</td>
<td>Chamadas manuais a <code>add()</code></td>
<td>O agente se autoedita</td>
<td>Manual</td>
<td>Extração no lado da API</td>
<td>Interceptação por proxy (troca de base-URL)</td>
<td>Manual</td>
<td>Extração via API</td>
<td>Manual</td>
<td>Edição manual</td>
</tr>
<tr>
<td><strong>Busca</strong></td>
<td>BM25 + Vector + Graph (fusão RRF)</td>
<td>Vector + Graph</td>
<td>Vector (archival)</td>
<td>Semântica</td>
<td>Vector + RAG</td>
<td>4 tipos de asset (Chat / Skill / Wiki / CodeGraph)</td>
<td>Somente vector</td>
<td>Vector + semântica</td>
<td>Ponderada por decaimento</td>
<td>Carrega tudo no contexto</td>
</tr>
<tr>
<td><strong>Multiagente</strong></td>
<td>MCP + REST + leases + signals</td>
<td>API (sem coordenação)</td>
<td>Somente dentro do runtime do Letta</td>
<td>Não</td>
<td>Não</td>
<td>Papéis de time + assets compartilhados</td>
<td>Não</td>
<td>Somente com escopo</td>
<td>Compartilhado multiagente</td>
<td>Arquivos por agente</td>
</tr>
<tr>
<td><strong>Dependência de framework</strong></td>
<td>Nenhuma (qualquer cliente MCP)</td>
<td>Nenhuma</td>
<td>Alta (precisa usar Letta)</td>
<td>Standalone</td>
<td>Nenhuma</td>
<td>Proxy na frente de toda chamada de modelo</td>
<td>Nenhuma</td>
<td>Oracle Database</td>
<td>Nenhuma</td>
<td>Formato por agente</td>
</tr>
<tr>
<td><strong>Dependências externas</strong></td>
<td>Nenhum serviço de banco de dados separado necessário</td>
<td>Qdrant / pgvector</td>
<td>Postgres + BD vetorial</td>
<td>Várias</td>
<td>Nuvem gerenciada</td>
<td>Stack Docker (Core + Hub + Proxy)</td>
<td>Vector store</td>
<td>Oracle AI Database</td>
<td>Nenhuma</td>
<td>Nenhuma</td>
</tr>
<tr>
<td><strong>Ciclo de vida da memória</strong></td>
<td>Consolidação de 4 níveis + decaimento + auto-esquecimento</td>
<td>Extração passiva</td>
<td>Gerenciado pelo agente</td>
<td>Manual</td>
<td>Auto-esquecimento</td>
<td>Revisão manual; roteamento automático em andamento</td>
<td>Nenhum</td>
<td>Não informado</td>
<td>Decaimento + consolidação</td>
<td>Poda manual</td>
</tr>
<tr>
<td><strong>Eficiência de tokens</strong></td>
<td>~1,900 tokens/sessão ($10/ano)</td>
<td>Varia por integração</td>
<td>Memória principal no contexto</td>
<td>Varia</td>
<td>Precificação em nuvem</td>
<td>Não informado</td>
<td>Sem orçamento de tokens</td>
<td>Baseado em LLM (varia)</td>
<td>Varia</td>
<td>22K+ tokens em 240 observações</td>
</tr>
<tr>
<td><strong>Viewer em tempo real</strong></td>
<td>Sim (porta 3113)</td>
<td>Dashboard na nuvem</td>
<td>Dashboard na nuvem</td>
<td>Web UI</td>
<td>Dashboard na nuvem</td>
<td>Web UI do Hub</td>
<td>Não</td>
<td>Não</td>
<td>Não</td>
<td>Não</td>
</tr>
<tr>
<td><strong>Self-hosted</strong></td>
<td>Sim (padrão)</td>
<td>Opcional</td>
<td>Opcional</td>
<td>Sim</td>
<td>Não (somente nuvem)</td>
<td>Sim (Docker)</td>
<td>Sim</td>
<td>Sim (Oracle DB)</td>
<td>Sim</td>
<td>Sim</td>
</tr>
</table>

<sub>Nota de benchmark: apenas o R@5 do agentmemory é resultado medido por nós mesmos (LongMemEval-S, reproduzível a partir de <a href="../benchmark/COMPARISON.md"><code>benchmark/COMPARISON.md</code></a>). Os números de mem0 e Letta são os números LoCoMo publicados por eles (um dataset diferente); os números de MemPalace, supermemory, TencentDB (PersonaMem) e oracleagentmemory são alegações autorreportadas dos fornecedores que não reproduzimos de forma independente (a execução do oracleagentmemory usou GPT-5.5 contra um Oracle AI Database). Mostrados lado a lado apenas como ordem de grandeza, não como comparação direta sobre dados idênticos. As contagens de stars são aproximadas e mudam com o tempo.</sub>

**Novos entrantes** que vale a pena conhecer, comparados em profundidade em [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md):

| Sistema | ⭐ | Abordagem |
|--------|---|-------|
| Zep / Graphiti | 30K | Grafo de conhecimento temporal; os resultados publicados mais fortes em queries temporais (LongMemEval 63.8%), mas o grafo é construído de forma assíncrona, então fatos recentes podem atrasar |
| Cognee | 30K | Ingestão de documento para grafo de conhecimento, somente Python, feito para extração estruturada de entidades em vez de captura de sessão |

O AgentMemory combina captura por agentes de programação, histórico de projeto pesquisável e visualizador local. O uso sem chave está disponível desde a primeira execução.

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Início rápido" height="32" /></picture></h2>

### Teste em 30 segundos

```bash
# Terminal 1: start the server
npx -y @agentmemory/agentmemory@latest

# Terminal 2: seed sample data and see recall in action
npx -y @agentmemory/agentmemory@latest demo
```

`demo` semeia 3 sessões realistas (autenticação JWT, correção de query N+1, rate limiting) e roda buscas contra elas. Instalações sem chave desativam os vetores, então as buscas por palavra-chave do `mem::search` devem acertar via BM25, enquanto `database performance optimization` pode retornar zero. O `smart-search` também pode retornar correspondências estruturais do grafo quando existem dados de grafo. Para que a query semântica encontre a correção de N+1 via vetores, defina `EMBEDDING_PROVIDER=local`, reinicie e espere o primeiro download do modelo terminar.

Abra `http://localhost:3113` para acompanhar a memória sendo construída ao vivo.

<a id="validate-a-fresh-install-and-restart-persistence"></a>

### Valide uma instalação nova e a persistência ao reiniciar

Com o servidor em execução, verifique a saúde, o visualizador e o status:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

`status` mostra a saúde do servidor e os provedores e embeddings ativos. Salve uma memória de teste e confirme a pesquisa:

```bash
# Default generated local secret. For an explicit AGENTMEMORY_SECRET, use that value instead.
read -r AGENTMEMORY_SECRET < "$HOME/.agentmemory/secret"

curl -fsS -X POST http://localhost:3111/agentmemory/remember \
  -H "Authorization: Bearer $AGENTMEMORY_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"content":"agentmemory restart persistence probe","concepts":["install-check"]}'

curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H "Authorization: Bearer $AGENTMEMORY_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"query":"restart persistence probe","limit":5}'
```

Depois rode `npx -y @agentmemory/agentmemory@latest stop`, inicie novamente o comando canônico no Terminal 1, espere por `/agentmemory/livez` e repita a busca. A sonda deve continuar sendo retornada. Se você selecionou um `--data-dir` customizado, passe o mesmo diretório no reinício.

<a id="everyday-commands"></a>

### Comandos do dia a dia

Instalação e setup estão em [Install](#install) acima (a primeira execução te guia por eles). No dia a dia:

```bash
agentmemory                    # start the server
agentmemory stop               # stop it cleanly
agentmemory connect <agent>    # wire another agent
agentmemory doctor             # interactive diagnostics + fix prompts
agentmemory remove             # uninstall everything we created
```

### Replay de sessão

Toda sessão que o agentmemory grava é reproduzível. Abra o viewer, escolha a aba **Replay** e arraste pela timeline: prompts, chamadas a tools, resultados de tools e respostas renderizam como eventos discretos com play/pause, controle de velocidade (0.5x a 4x) e atalhos de teclado (espaço para alternar, setas para avançar passo a passo).

Para trazer transcripts JSONL mais antigos do Claude Code:

```bash
# Import everything under the default ~/.claude/projects
npx -y @agentmemory/agentmemory@latest import-jsonl

# Or import a single file
npx -y @agentmemory/agentmemory@latest import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

Sessões importadas aparecem no seletor de Replay ao lado das nativas. Cada transcript importado é indexado para busca, carimbado com o canal de origem `import` e minerado para gerar um crystal de sessão e lessons.

> **Atenção se você depende do `import-jsonl` como caminho primário de captura:** o `cleanupPeriodDays` do Claude Code (em `~/.claude/settings.json`, padrão **30**) apaga automaticamente de `~/.claude/projects/` os transcripts JSONL mais antigos que essa janela. Se você instalar o agentmemory do zero sobre um histórico de Claude Code com meses de idade, tudo com mais de 30 dias já se foi antes do primeiro import. Rode `import-jsonl` em um cron, aumente `cleanupPeriodDays` para algo maior, ou conecte os hooks de captura automática (o caminho padrão de instalação do plugin) para que cada turno chegue ao agentmemory enquanto a sessão está viva e a limpeza dos JSONL deixe de importar.

### Upgrade / Manutenção

Use o comando de manutenção quando você quiser intencionalmente atualizar seu runtime local:

```bash
npx -y @agentmemory/agentmemory@latest upgrade
```

O comando atualiza o ambiente local e pode atualizar dependências JavaScript no workspace atual. Faça um backup e leia o [guia de atualização](../docs/upgrades/iii-0.25.md) antes de continuar.

### Claude Code (um bloco só, cole e vá)

```text
Install agentmemory: run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 17 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 54 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113. Keyless mode disables vectors: `memory_recall` uses BM25, and `memory_smart_search` can also use existing structural graph data. Set `EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env` and restart to opt into on-device semantic recall.
```

#### Claude Code sem instalar o plugin (caminho MCP standalone)

Se você cabear o servidor MCP do agentmemory via `~/.claude.json` diretamente em vez de usar `/plugin install`, o Claude Code nunca resolve `${CLAUDE_PLUGIN_ROOT}` e você tem que apontar os scripts de hook para caminhos absolutos em `~/.claude/settings.json`. Esses caminhos tipicamente embutem a versão do agentmemory (ex.: `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.22/scripts/…`), então a próxima atualização quebra silenciosamente todos os hooks.

Contorno:

```bash
agentmemory connect claude-code --with-hooks
```

Isso mescla os mesmos comandos de hook em `~/.claude/settings.json` com caminhos absolutos resolvidos para o diretório `plugin/` empacotado do pacote `@agentmemory/agentmemory` atualmente instalado. Rode o comando novamente após atualizar o agentmemory para atualizar os caminhos. Entradas de usuário no mesmo arquivo são preservadas; apenas entradas anteriores do agentmemory são substituídas. Usar o caminho `/plugin install` continua sendo a abordagem recomendada.
Para deploys remotos ou protegidos, inicie o Claude Code com `AGENTMEMORY_URL` e `AGENTMEMORY_SECRET` definidos. O plugin repassa ambos os valores para seu servidor MCP empacotado; quando `AGENTMEMORY_URL` está vazio, o shim MCP usa `http://localhost:3111`.

### Codex CLI (plataforma de plugins do Codex)

```bash
# 1. start the memory server in a separate terminal
npx -y @agentmemory/agentmemory@latest

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

O plugin do Codex é entregue a partir do mesmo diretório `plugin/` do plugin do Claude Code. Ele registra:

- Uma bridge MCP via stdio empacotada para o daemon em execução, sem download via npm nem armazenamento de fallback. Veja o [guia local do Codex](../docs/plugins/codex-local.md) para testar uma build ainda não lançada.
- 6 hooks de ciclo de vida: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 9 skills invocáveis: `/recall`, `/remember`, `/session-history`, `/forget`, `/recap`, `/handoff`, `/lesson`, `/commit-context`, `/commit-history`, mais 8 skills de referência que o agente carrega sob demanda (disciplina de memória, tools MCP, REST API, config, agentes, hooks, arquitetura e o guia de autoria de skills)

A engine de hooks do Codex injeta `CLAUDE_PLUGIN_ROOT` nos subprocessos de hook (conforme [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), então os mesmos scripts de hook funcionam nos dois hosts sem duplicação. Os eventos Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure são exclusivos do Claude Code e não são registrados para o Codex.

#### Confiança e compatibilidade dos hooks do Codex

O despacho nativo de hooks de plugin está verificado com o Codex CLI 0.150.1. Confie nos hooks do plugin antes de esperar captura. O comportamento no Desktop depende do runtime empacotado dele; verifique `/hooks` e confirme um evento capturado antes de habilitar um contorno.

Se o seu host exigir hooks globais, espelhe os comandos em `~/.codex/hooks.json`. Quando o MCP já está configurado, o conector atual precisa de `--force` para chegar à instalação dos hooks:

```bash
agentmemory connect codex --with-hooks --force
```

Isso mescla os hooks globais e reescreve a entrada MCP do agentmemory, preservando as entradas não relacionadas. Revise quaisquer configurações customizadas de endpoint do agentmemory antes de usar `--force`. Rode novamente após atualizar para atualizar os caminhos dos scripts. Habilite os hooks nativos do plugin ou as cópias globais para evitar captura duplicada.

### GitHub Copilot CLI

Para o modo agente do VS Code, use o [guia de MCP e captura automática do Copilot](../docs/plugins/copilot.md#vs-code-copilot-local-agent-sessions). O conector do CLI não configura o VS Code.

```bash
# MCP-only wiring
agentmemory connect copilot-cli

# Alternatively, full hooks/skills plugin from the GitHub subdir
copilot plugin install rohitg00/agentmemory:plugin
```

`agentmemory connect copilot-cli` mescla `mcpServers.agentmemory` em `~/.copilot/mcp-config.json` (ou `$COPILOT_HOME/mcp-config.json` quando `COPILOT_HOME` está definido) e preserva os servidores existentes. No Windows nativo este é o único adaptador `connect` automatizado; configure todo outro agente nativo do Windows manualmente. O `connect` no WSL só é suportado quando o agente de destino está instalado nesse mesmo ambiente WSL. O Copilot detecta o servidor MCP no próximo lançamento ou depois de `/mcp`. Instale o plugin também quando quiser a experiência completa de hooks/skills.

### Cursor

```bash
agentmemory connect cursor
```

Depois adicione o plugin nativo de um checkout do AgentMemory em **Settings → Plugins → Add marketplace** e recarregue a janela. O plugin oferece captura do ciclo de vida, atribuição ao projeto, skills e MCP. Ative os hooks do plugin ou os manuais em `~/.cursor/hooks.json` para evitar captura duplicada. [Guia do Cursor](../integrations/cursor/).

### Pi, Oh My Pi, DeepSeek Harness

```bash
agentmemory connect pi --with-mcp
agentmemory connect omp --with-mcp
agentmemory connect dsh --with-hooks
```

Escolha o comando para seu host. Pi e OMP instalam pesquisa, captura, reenvio offline e 17 skills; `--with-mcp` adiciona todas as ferramentas. Execute `/reload` no Pi ou reinicie o OMP e verifique `/agentmemory-status`. O DSH instala MCP e o plugin de captura incluído; reinicie o DSH depois.

O Pi também oferece o pacote instalável `@agentmemory/pi`. O [guia do Pi](../integrations/pi/) explica a instalação local e a disponibilidade no npm. Use apenas um método de instalação por host.

[Pi](../integrations/pi/) · [Oh My Pi](../integrations/omp/) · [DSH](../docs/dsh.md)

<details>
<summary><b>OpenClaw (cole este prompt)</b></summary>

```text
Install agentmemory for OpenClaw. Run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server on localhost:3111. Then add this to my OpenClaw MCP config so agentmemory is available with all 54 memory tools:

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
Install agentmemory for Hermes. Run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server on localhost:3111. Then add this to ~/.hermes/config.yaml so Hermes can use agentmemory as an MCP server with all 54 memory tools:

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

<a id="other-agents"></a>

### Outros agentes

Inicie o servidor de memória: `npx -y @agentmemory/agentmemory@latest`

#### Skills nativas via `npx skills add` (50+ agentes)

agentmemory entrega 17 skills no formato `<dir>/SKILL.md` estilo Claude Code: 9 skills de ação invocáveis (`remember`, `recall`, `recap`, `handoff`, `forget`, `lesson`, `commit-context`, `commit-history`, `session-history`) e 8 skills de referência que o agente carrega sob demanda (`memory-discipline`, `agentmemory-mcp-tools`, `agentmemory-rest-api`, `agentmemory-config`, `agentmemory-agents`, `agentmemory-hooks`, `agentmemory-architecture`, `write-agentmemory-skill`). As skills de referência carregam tabelas de dados geradas a partir do código-fonte, então nunca ficam defasadas. O CLI [`skills`](https://npmjs.com/package/skills) da vercel-labs as instala automaticamente no diretório nativo de skills do agente chamador em 50+ agentes (Claude Code, Cursor, Cline, Continue, Droid, Warp, Codex, Antigravity, Kiro, OpenCode, Goose, Roo, Trae, Windsurf e mais):

```bash
npx skills add rohitg00/agentmemory -y          # auto-detects the calling agent
npx skills add rohitg00/agentmemory -y -a warp  # explicit agent
npx skills add rohitg00/agentmemory -y -a '*'   # install to every installed agent
```

Isso é **complementar** a `agentmemory connect <agent>`:

- `agentmemory connect <agent>` normalmente grava a configuração MCP. Hermes, OpenClaw, Pi e Oh My Pi instalam a integração nativa e as skills incluídas por padrão; MCP é opcional com `--with-mcp`.
- `npx skills add rohitg00/agentmemory` instala skills para agentes que não as incluem nativamente. Pule esta etapa para Hermes, OpenClaw, Pi e Oh My Pi: seus conectores já instalam as skills.

Para os poucos agentes que o CLI de skills ainda não cobre (Zed v1.3.x e anteriores), coloque você mesmo os 17 arquivos SKILL.md no diretório nativo de skills do agente; o mesmo formato funciona em todo lugar.

#### Bloco MCP padrão

A entrada do agentmemory é o **mesmo bloco de servidor MCP** em todo host que usa o formato `mcpServers` (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI, OpenClaw):

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

**Mescle esta entrada no objeto `mcpServers` existente** no arquivo de configuração do host; não substitua o arquivo. Se o arquivo já tem outros servidores, adicione `agentmemory` ao lado deles como outra chave dentro de `mcpServers`. Se `mcpServers` não existir, cole o bloco dentro de `{ "mcpServers": { ... } }`. Os placeholders `${VAR}` herdam `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` do shell no momento em que o servidor MCP sobe; variáveis não definidas passam string vazia e o shim cai para `http://localhost:3111`. Uma única entrada cabeada cobre tanto deploys locais quanto remotos (k8s / com reverse-proxy).

| Agente | Arquivo de config | Notas |
|---|---|---|
| **Cursor (somente MCP)** | `~/.cursor/mcp.json` | Mescle em `mcpServers`, ou `agentmemory connect cursor`. Deeplink de um clique também disponível no site. |
| **Cursor (plugin completo)** | `.cursor-plugin/` | Depois adicione o plugin nativo de um checkout do AgentMemory em **Settings → Plugins → Add marketplace** e recarregue a janela. O plugin oferece captura do ciclo de vida, atribuição ao projeto, skills e MCP. Ative os hooks do plugin ou os manuais em `~/.cursor/hooks.json` para evitar captura duplicada. [Guia do Cursor](../integrations/cursor/). |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Mescle em `mcpServers`. Reinicie o Claude Desktop depois de editar. |
| **Cline / Roo Code / Kilo Code** | Configurações MCP do Cline (Settings UI → MCP Servers → Edit) | Mesmo bloco `mcpServers`. |
| **Devin CLI (MCP + hooks)** | `~/.config/devin/config.json` | `agentmemory connect devin` mescla a entrada MCP; `--with-hooks` adiciona seis hooks nativos de captura automática (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd) com os matchers de ferramentas em minúsculas do Devin. Verifique com `devin mcp list` e `/hooks` dentro do devin. |
| **Devin CLI (plugin completo)** | `plugin/.devin-plugin/` | `devin plugins install ./plugin` a partir de um checkout registra todas as 17 skills como slash commands `/agentmemory:<skill>` mais o servidor MCP. Hooks de plugin do Devin não conseguem disparar `SessionStart`/`SessionEnd`, então combine com `connect devin --with-hooks` para captura completa de sessão. |
| **Devin (cloud)** | Settings → Connections → MCP servers | Adicione um MCP customizado (STDIO): comando `npx`, args `-y @agentmemory/mcp@latest`, env `AGENTMEMORY_URL` apontando para um deploy do agentmemory alcançável pela rede, mais `AGENTMEMORY_SECRET` (sessões na cloud não conseguem alcançar localhost — veja [`deploy/`](../deploy/)). Guarde o secret nos Devin Secrets, depois use "Test listing tools" para verificar que as 54 tools aparecem. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (mescla automaticamente). |
| **GitHub Copilot CLI (somente MCP)** | `~/.copilot/mcp-config.json` | `agentmemory connect copilot-cli` mescla `mcpServers.agentmemory`; o Copilot detecta no próximo lançamento ou em `/mcp`. |
| **GitHub Copilot CLI (plugin completo)** | Instalação de plugin do Copilot | `copilot plugin install rohitg00/agentmemory:plugin` para o plugin a partir do subdiretório do GitHub. |
| **OpenClaw** | Configuração MCP do OpenClaw | Mesmo bloco `mcpServers`. Mais profundo: `openclaw plugins install ./integrations/openclaw` reivindica o slot de memória do OpenClaw (alterna automaticamente de `memory-core`); defina `plugins.entries.agentmemory.hooks.allowConversationAccess=true` ou a captura de turnos fica bloqueada silenciosamente. Veja [`integrations/openclaw`](../integrations/openclaw/). |
| **Codex CLI (somente MCP)** | `.codex/config.toml` | Formato TOML: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, ou adicione `[mcp_servers.agentmemory]` manualmente. |
| **Codex CLI (plugin completo)** | Marketplace de plugins do Codex | `codex plugin marketplace add rohitg00/agentmemory` e depois `codex plugin add agentmemory@agentmemory`. Registra MCP + 6 hooks de ciclo de vida + 17 skills. Confie nos hooks e verifique a captura no seu host; veja [configuração e validação do Codex](../docs/plugins/codex-local.md). |
| **OpenCode (somente MCP)** | `opencode.json` | Formato diferente: chave de nível superior `mcp`, comando como array: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (plugin completo)** | `plugin/opencode/` | 22 hooks de captura automática cobrindo ciclo de vida de sessão, mensagens, tools e erros. A atribuição de projeto é por sessão, então um único processo do OpenCode abrangendo vários repositórios arquiva cada sessão sob o próprio projeto. Dois slash commands (`/recall`, `/remember`). Copie `plugin/opencode/` para o seu workspace do OpenCode e adicione a entrada do plugin em `opencode.json`. Veja [`plugin/opencode/README.md`](../plugin/opencode/README.md) para a tabela completa de hooks + análise de gaps. |
| **Pi / Oh My Pi** | `~/.pi/agent/` / `~/.omp/agent/` | pesquisa nativa + captura + skills. [Pi](../integrations/pi/) · [Oh My Pi](../integrations/omp/). |
| **Hermes Agent** | `~/.hermes/config.yaml` | `cp -r integrations/hermes ~/.hermes/plugins/agentmemory` + `memory.provider: agentmemory` ativa o memory provider de 6 hooks (prefetch, captura de turnos, fim de sessão, pré-compressão, espelhamento do MEMORY.md, bloco de system prompt). Valide com `hermes plugins doctor` e `hermes memory status`. Veja [`integrations/hermes`](../integrations/hermes/). |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` escreve o bloco `mcpServers` padrão. O payload dos hooks é compatível em nível de campo com o Claude Code, então os scripts dos 12 hooks existentes funcionam sem modificação; conecte-os via a seção `hooks` do mesmo `settings.json`. |
| **Antigravity IDE / 2.0** | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity --with-hooks` instala o MCP e os hooks de captura no diretório de customização compartilhado. Veja [configuração e limites do Antigravity](../docs/plugins/antigravity.md). |
| **Antigravity CLI** (`agy`) | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity-cli --with-hooks` usa a mesma configuração de MCP e hooks das versões atuais do IDE. Instalações existentes devem atualizar com `--force`; veja as [notas de atualização](../docs/plugins/antigravity.md). |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` escreve a configuração no nível de usuário. Overrides de workspace vão em `.kiro/settings/mcp.json` ao lado do seu código. |
| **Warp** | `~/.warp/.mcp.json` | `agentmemory connect warp` escreve o bloco `mcpServers` padrão. O Warp também auto-descobre skills de `.claude/skills/`; instalado o plugin do Claude Code, as 8 skills do agentmemory (`remember`, `recall`, `recap`, `handoff`, `forget`, `commit-context`, `commit-history`, `session-history`) aparecem nativamente na paleta de slash commands do Warp. |
| **Cline (CLI)** | `~/.cline/mcp.json` | `agentmemory connect cline` escreve o bloco `mcpServers` padrão. Usuários da extensão do VS Code: cole o mesmo bloco via Cline Settings → MCP Servers → Edit JSON. |
| **Continue.dev** | `~/.continue/config.yaml` (preferido) ou `config.json` (legado) | `agentmemory connect continue` cria `config.yaml` se estiver ausente ou modifica o `config.json` existente. Se o YAML já existir, mostra o bloco para adicionar em `mcpServers:` e preservar comentários e âncoras. O Continue usa um array, não um objeto. |
| **Zed** | `~/.config/zed/settings.json` | `agentmemory connect zed` escreve sob `context_servers` (a chave do Zed, NÃO `mcpServers`). Servidores MCP remotos podem ser cabeados via `{"url": "..."}` em vez disso. |
| **Droid (Factory.ai)** | `~/.factory/mcp.json` | `agentmemory connect droid` escreve o bloco `mcpServers` padrão. Overrides com escopo de projeto vão em `<repo>/.factory/mcp.json`. Passe `--with-hooks` para captura automática nativa. |
| **DeepSeek Harness** | `$DSH_HOME/cordis.patch.yml` | `agentmemory connect dsh` ativa as ferramentas MCP. Adicione `--with-hooks` para carregar o plugin nativo de captura incluído no AgentMemory. Não é necessário um pacote adicional. [DSH](../docs/dsh.md). |
| **Goose** | UI de configurações MCP do Goose | Mesmo bloco `mcpServers`; use `goose configure` → Add Extension → MCP. Edição direta do YAML em `~/.config/goose/config.yaml` é suportada, mas o schema usa `extensions:` + `cmd` (não `mcpServers:` + `command`). |
| **Aider** | n/a | Use os [exemplos REST autenticados](#validate-a-fresh-install-and-restart-persistence) para gravar e pesquisar memórias em scripts. |
| **Agentes compatíveis** | Apenas skills | `npx skills add rohitg00/agentmemory`; escolha as skills e os agentes em que deseja instalá-las. |

**Clientes MCP em sandbox** (Flatpak / Snap / containers restritivos) que não conseguem alcançar o `localhost` do host: defina também `"AGENTMEMORY_FORCE_PROXY": "1"` no bloco `env`, e aponte `AGENTMEMORY_URL` para uma rota que o sandbox consiga de fato alcançar (por exemplo, o IP da sua LAN).

### Acesso programático (Python / Rust / Node)

Use a [API REST](#api) em qualquer linguagem ou as [ferramentas MCP](#mcp-server) em um agente. REST usa JSON e autenticação bearer; consulte o [exemplo de gravação e pesquisa](#validate-a-fresh-install-and-restart-persistence). Os [exemplos Python](../examples/python/) cobrem a integração direta com o runtime.

### A partir do código-fonte

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

`npm start` inicia o mesmo servidor local da CLI instalada. Os requisitos estão em [Install](#install); a API e o visualizador escutam em `127.0.0.1`.

### Windows

agentmemory roda no Windows 10/11. O WSL2 segue o caminho Linux e pode instalar o engine fixado automaticamente. O Windows nativo exige a instalação manual do binário iii-engine v0.25.0 fixado; baixe o arquivo correspondente na [página de releases do iii 0.25.0](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.25.0), confira o checksum e coloque `iii.exe` no `PATH` (por exemplo, `%USERPROFILE%\.local\bin\iii.exe`). O CLI não extrai o ZIP do Windows automaticamente.

A configuração MCP automatizada no Windows nativo dá suporte apenas a `agentmemory connect copilot-cli`. Para os outros agentes nativos do Windows, use o bloco MCP manual em [Outros agentes](#other-agents). Rode `connect` no WSL somente quando o agente de destino estiver instalado no mesmo ambiente WSL.

**Somente MCP standalone (sem engine).** Se você precisa apenas das ferramentas MCP, sem REST API, viewer ou serviços de runtime:

```powershell
npx -y @agentmemory/agentmemory@latest mcp
# or
npx -y @agentmemory/mcp
```

Execute `agentmemory doctor` ou reinicie com `--verbose`. Use `--port <N>` ou `--instance <N>` se as portas estiverem ocupadas. Consulte compatibilidade e recuperação no [guia de atualização](../docs/upgrades/iii-0.25.md).

---

<h2 id="deploy">Deploy</h2>

Hospede o serviço com Docker Compose ou os modelos abaixo. Memórias e credenciais ficam no volume `/data`. Faça um backup e reutilize esse volume nas atualizações. O [guia de implantação](../deploy/README.md) cobre autenticação, rede, backups e migração.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

O botão de deploy de um clique do Render exige um `render.yaml` na raiz do repositório, que deliberadamente mantemos limpa. Use o fluxo de Render Blueprint documentado em [`deploy/render/`](.././deploy/render/README.md) para apontar manualmente para o blueprint que já está no repositório.

Detalhes completos de setup (captura de HMAC, túnel SSH do viewer,
rotação, backup, pisos de custo) ficam em [`deploy/`](.././deploy/README.md):

- [`deploy/fly`](.././deploy/fly/README.md): uma única máquina com
  `auto_stop_machines = "stop"`; a mais barata quando ociosa.
- [`deploy/railway`](.././deploy/railway/README.md): taxa fixa do plano
  Hobby, volume no dashboard.
- [`deploy/render`](.././deploy/render/README.md): fluxo de Blueprint,
  snapshots automáticos de disco nos planos pagos.
- [`deploy/coolify`](.././deploy/coolify/README.md): self-hosted na sua
  própria VPS via [Coolify](https://coolify.io/self-hosted); mesma
  stack Docker Compose, você é dono do host e dos dados.

REST usa a porta `3111`; o visualizador, `3113`. Mantenha ambos privados ou proteja-os com autenticação e TLS. O guia de implantação explica a exposição de rede e a [migração de instalações Docker antigas](../deploy/README.md#migrating-from-the-legacy-cli-docker-mode).

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Por que agentmemory" height="32" /></picture></h2>

O conhecimento do projeto se espalha por conversas e arquivos de instruções. O AgentMemory permite pesquisar decisões, correções e aprendizados no agente que você estiver usando.

```text
Session 1: "Add auth to the API"
  Agent writes code, runs tests, fixes bugs
  Connected hooks capture supported tool events
  Observations become searchable project history

Session 2: "Now add rate limiting"
  Agent recalls:
    - Auth uses JWT middleware in src/middleware/auth.ts
    - Tests in test/auth.test.ts cover token validation
    - You chose jose over jsonwebtoken for Edge compatibility
  Continues with the earlier decisions in context.
```

### vs memória integrada do agente

Todo agente de codificação com IA vem com memória integrada: Claude Code tem `MEMORY.md`, Cursor tem notepads, Cline tem memory bank. Elas funcionam como post-its. agentmemory é o banco de dados pesquisável por trás dos post-its.

| | Integrada (CLAUDE.md) | agentmemory |
|---|---|---|
| Manutenção | Instruções mantidas manualmente | Histórico de sessões e memórias indexadas |
| Busca | Carrega tudo no contexto | BM25 + vector + graph (somente top-K) |
| Custo em tokens | 22K+ em 240 observações | ~1,900 tokens (92% menos) |
| Entre agentes | Arquivos por agente | MCP + REST (qualquer agente) |
| Coordenação | Nenhuma | Leases, signals, actions, routines |
| Observabilidade | Leitura manual de arquivos | Viewer em tempo real na :3113 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="Como funciona" height="32" /></picture></h2>

### Pipeline de memória

```text
PostToolUse hook fires
  -> SHA-256 dedup (5min window)
  -> Privacy filter (strip secrets, API keys)
  -> Store raw observation
  -> Synthetic compression by default
     (LLM-written compression only with a provider + AGENTMEMORY_AUTO_COMPRESS=true)
  -> Vector embedding when an embedding provider is active
  -> Index in BM25, plus vectors when enabled

Stop / SessionEnd hook fires
  -> Summarize session
  -> Knowledge graph extraction (if GRAPH_EXTRACTION_ENABLED=true)
  -> Slot reflection (if AGENTMEMORY_SLOTS=true and AGENTMEMORY_REFLECT=true)

SessionStart hook fires
  -> Load project profile (top concepts, files, patterns)
  -> Hybrid search (BM25 + vector + graph)
  -> Token budget (default: 2000 tokens)
  -> Inject context when enabled by the integration
```

### Consolidação de memória em 4 níveis

Modelada em como o cérebro humano processa memória, incluindo a consolidação do sono.

| Nível | O quê | Analogia |
|------|------|---------|
| **Working** | Observações brutas do uso de tools | Memória de curto prazo |
| **Episodic** | Resumos de sessão comprimidos | "O que aconteceu" |
| **Semantic** | Fatos e padrões extraídos | "O que eu sei" |
| **Procedural** | Workflows e padrões de decisão | "Como fazer" |

As memórias decaem com o tempo (curva de Ebbinghaus). Memórias acessadas com frequência se reforçam. Memórias obsoletas são evictadas automaticamente. Contradições são detectadas e resolvidas.

### O que é capturado

Esta tabela descreve os hooks do Claude Code. Outras integrações capturam os eventos fornecidos pelo host; consulte os respectivos guias. A injeção automática de contexto pelos hooks compartilhados exige `AGENTMEMORY_INJECT_CONTEXT=true`.

| Hook | Captura |
|------|----------|
| `SessionStart` | Caminho do projeto, ID da sessão |
| `UserPromptSubmit` | Prompts do usuário (filtrados por privacidade) |
| `PreToolUse` | Padrões de acesso a arquivos + contexto enriquecido |
| `PostToolUse` | Nome da tool, entrada, saída |
| `PostToolUseFailure` | Contexto de erro |
| `PreCompact` | Reinjeta memória antes da compactação |
| `SubagentStart/Stop` | Ciclo de vida de sub-agentes |
| `Stop` | Resumo de fim de sessão |
| `SessionEnd` | Marcador de sessão completa |

### Principais capacidades

| Capacidade | Descrição |
|---|---|
| **Captura automática** | Integrações nativas registram os eventos de sessão e ferramentas compatíveis |
| **Busca semântica** | BM25 + vector + grafo de conhecimento com fusão RRF |
| **Evolução de memória** | Versionamento, supersessão, grafos de relacionamento |
| **Higiene de recall** | Versões supersedidas de memória saem dos índices de busca; a cadeia de versões no KV mantém o histórico completo |
| **Dicas de quase-duplicata** | Saves reportam uma correspondência consultiva `similarTo` quando o conteúdo novo se parece muito com uma memória existente |
| **Escopo por agente** | `agentId` atravessa save e recall em REST, MCP e no índice de busca, em modo shared ou isolated |
| **Provenance em tempo de escrita** | Toda observação e memória carrega um canal de origem imutável (user, agent, tool, import ou shared) carimbado na captura, no save e no import |
| **Auto-esquecimento** | Expiração por TTL, detecção de contradição, eviction por importância |
| **Privacidade antes de tudo** | API keys, secrets e tags `<private>` são removidos antes do armazenamento |
| **Self-healing** | Circuit breaker, cadeia de fallback de providers, monitoramento de saúde |
| **Bridge com o Claude** | Sincronização bidirecional com o MEMORY.md |
| **Grafo de conhecimento** | Extração de entidades + travessia BFS |
| **Memória de time** | Compartilhada e privada com namespace entre membros do time |
| **Provenance de citação** | Rastreia qualquer memória de volta às observações de origem |
| **Snapshots do git** | Versiona, reverte e faz diff do estado da memória |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Busca" height="32" /></picture></h2>

Recuperação em stream triplo, combinando três sinais:

| Stream | O que faz | Quando |
|---|---|---|
| **BM25** | Correspondência por palavra-chave com stemming e expansão de sinônimos | Sempre ativo |
| **Vector** | Similaridade de cosseno sobre embeddings densos | Provider de embedding configurado |
| **Graph** | Travessia do grafo de conhecimento via correspondência de entidades | Entidades detectadas na query |

Combinados com Reciprocal Rank Fusion (RRF, k=60) e diversificados por sessão (máximo 3 resultados por sessão).

Quando um índice vetorial está populado, o `mem::search` (por trás do `memory_recall`) usa o ranker híbrido BM25 + vector. Sem embeddings ele usa BM25. O `smart-search` pode ainda combinar correspondências estruturais do grafo quando existem dados de grafo, inclusive no modo sem chave. O recall de lessons roda sobre um índice BM25 dedicado em memória, em vez de escanear todo o corpus a cada query. Versões supersedidas de memória são excluídas de todo caminho de recall; a cadeia de versões mantém o histórico delas.

Vetores sobrevivem a um crash ou force-kill. O índice vetorial é salvo em buckets no máximo a cada `AGENTMEMORY_INDEX_SAVE_INTERVAL_MS` (10 minutos). Todo vetor adicionado ou removido nesse meio tempo também é gravado imediatamente em um pequeno log pendente no state store, e o próximo início o reproduz sem chamar o provider de embedding. Cada save bem-sucedido esvazia o log. Documentos que ainda não têm vetor depois da reprodução são re-embeddados em segundo plano em lotes de `AGENTMEMORY_VECTOR_BACKFILL_MAX` (500) até que não reste nenhum, e um backfill interrompido continua no próximo início. `/agentmemory/status` e o viewer mostram o tamanho do log pendente e o estado do backfill. Instalações sem chave não escrevem nada.

O BM25 tokeniza grego, cirílico, hebraico, árabe e latim acentuado nativamente. Para memórias em chinês / japonês / coreano, instale os segmentadores opcionais (`npm install @node-rs/jieba tiny-segmenter`) para dividir sequências CJK em tokens no nível de palavra; sem eles, o agentmemory cai graciosamente para tokenização da sequência inteira e imprime uma dica única no stderr.

### Providers de embedding

Instalações sem chave desativam os embeddings vetoriais: o `mem::search` usa BM25, enquanto o `smart-search` também pode usar dados estruturais de grafo já existentes. Para optar por embeddings semânticos gratuitos e no dispositivo, adicione isto a `~/.agentmemory/.env` e reinicie o agentmemory:

```env
EMBEDDING_PROVIDER=local
```

A instalação normal via npm inclui o runtime opcional `@huggingface/transformers`. A primeira requisição de embedding baixa o `Xenova/all-MiniLM-L6-v2`, então precisa de acesso à rede e pode demorar mais; a inferência seguinte roda no dispositivo. Providers remotos são detectados automaticamente a partir de suas chaves, a menos que `EMBEDDING_PROVIDER` as sobrescreva.

| Provider | Modelo | Custo | Notas |
|---|---|---|---|
| **Local (opt-in recomendado)** | `all-MiniLM-L6-v2` | Gratuito | No dispositivo após o primeiro download do modelo, +8pp de recall sobre BM25 sozinho |
| Gemini | `gemini-embedding-001` | Camada gratuita | 100+ idiomas, dimensões 768/1536/3072 (MRL), entrada de 2048 tokens. Substitui o `text-embedding-004` ([descontinuado, desligamento em 14 de jan. de 2026](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | Maior qualidade |
| Voyage AI | `voyage-code-3` | Pago | Otimizado para código |
| Cohere | `embed-english-v3.0` | Trial gratuito | Uso geral |
| OpenRouter | Qualquer modelo | Varia | Proxy multi-modelo |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="Servidor MCP" height="32" /></picture></h2>

54 tools, 6 resources, 3 prompts e 17 skills.

> **Shim MCP vs servidor completo:** o pacote publicado `@agentmemory/mcp` é um shim fino. Ele expõe a superfície completa de 54 tools **somente quando consegue alcançar um servidor agentmemory em execução** via `AGENTMEMORY_URL` (modo proxy). Sem nenhum servidor acessível, o shim cai para um conjunto local de 7 tools (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). A env var `AGENTMEMORY_TOOLS=core|all` é uma flag do *lado do servidor*; defini-la no bloco `env` do shim não tem efeito. Se você vê apenas 7 tools no Cursor / OpenCode / Gemini CLI, inicie `npx -y @agentmemory/agentmemory@latest` (ou a stack Docker) e defina `AGENTMEMORY_URL=http://localhost:3111`.

### 54 Tools

Três superfícies de tools, da menor para a maior: `AGENTMEMORY_TOOLS=core` reduz a visibilidade a 8 essenciais (`memory_save`, `memory_recall`, `memory_consolidate`, `memory_smart_search`, `memory_sessions`, `memory_diagnose`, `memory_lesson_save`, `memory_reflect`); o conjunto base abaixo são as 14 tools fundamentais do registry; o padrão (`AGENTMEMORY_TOOLS=all`) expõe todas as 54.

<details>
<summary>Tools base (14)</summary>

| Tool | Descrição |
|------|-------------|
| `memory_recall` | Busca observações passadas |
| `memory_compress_file` | Comprime arquivos markdown preservando a estrutura |
| `memory_save` | Salva um insight, decisão ou padrão |
| `memory_file_history` | Observações passadas sobre arquivos específicos |
| `memory_patterns` | Detecta padrões recorrentes |
| `memory_sessions` | Lista sessões recentes |
| `memory_smart_search` | Busca híbrida semântica + palavra-chave |
| `memory_vision_search` | Busca observações de imagem |
| `memory_timeline` | Observações em ordem cronológica |
| `memory_profile` | Perfil do projeto (conceitos, arquivos, padrões) |
| `memory_export` | Exporta todos os dados de memória |
| `memory_relations` | Consulta o grafo de relacionamento |
| `memory_commit_lookup` | Sessões por trás de um commit git |
| `memory_commits` | Commits registrados para uma sessão |

</details>

<details>
<summary>Tools estendidas (54 no total, a superfície padrão)</summary>

| Tool | Descrição |
|------|-------------|
| `memory_patterns` | Detecta padrões recorrentes |
| `memory_timeline` | Observações em ordem cronológica |
| `memory_relations` | Consulta o grafo de relacionamento |
| `memory_graph_query` | Travessia do grafo de conhecimento |
| `memory_consolidate` | Executa a consolidação de 4 níveis |
| `memory_claude_bridge_sync` | Sincroniza com o MEMORY.md |
| `memory_team_share` | Compartilha com membros do time |
| `memory_team_feed` | Itens compartilhados recentes |
| `memory_audit` | Trilha de auditoria das operações |
| `memory_governance_delete` | Deleta com trilha de auditoria |
| `memory_snapshot_create` | Snapshot versionado com git |
| `memory_action_create` | Cria work items com dependências |
| `memory_action_update` | Atualiza o status de uma action |
| `memory_frontier` | Actions desbloqueadas, ranqueadas por prioridade |
| `memory_next` | A próxima action mais importante, uma só |
| `memory_lease` | Leases exclusivos de action (multiagente) |
| `memory_routine_run` | Instancia routines de workflow |
| `memory_signal_send` | Mensageria entre agentes |
| `memory_signal_read` | Lê mensagens com confirmação de recebimento |
| `memory_checkpoint` | Gates de condição externa |
| `memory_mesh_sync` | Sync P2P entre instâncias |
| `memory_sentinel_create` | Watchers orientados a evento |
| `memory_sentinel_trigger` | Dispara sentinels externamente |
| `memory_sketch_create` | Grafos de action efêmeros |
| `memory_sketch_promote` | Promove a permanente |
| `memory_crystallize` | Compacta cadeias de action |
| `memory_diagnose` | Checagens de saúde |
| `memory_heal` | Corrige automaticamente estado travado |
| `memory_facet_tag` | Tags dimensão:valor |
| `memory_facet_query` | Consulta por facet tags |
| `memory_verify` | Rastreia provenance |

</details>

### 6 Resources · 3 Prompts · 17 Skills

| Tipo | Nome | Descrição |
|------|------|-------------|
| Resource | `agentmemory://status` | Saúde, contagem de sessões, contagem de memórias |
| Resource | `agentmemory://project/{name}/profile` | Inteligência por projeto |
| Resource | `agentmemory://project/{name}/recent` | Observações recentes de um projeto |
| Resource | `agentmemory://memories/latest` | As 10 memórias ativas mais recentes |
| Resource | `agentmemory://graph/stats` | Estatísticas do grafo de conhecimento |
| Resource | `agentmemory://team/{id}/profile` | Perfil de time compartilhado |
| Prompt | `recall_context` | Busca + retorna mensagens de contexto |
| Prompt | `session_handoff` | Dados de handoff entre agentes |
| Prompt | `detect_patterns` | Analisa padrões recorrentes |
| Skill | `/recall` | Busca na memória |
| Skill | `/remember` | Salva na memória de longo prazo |
| Skill | `/session-history` | Resumos de sessões recentes |
| Skill | `/forget` | Deleta observações/sessões |

A tabela mostra as quatro skills principais. O conjunto completo é de 9 skills invocáveis mais 8 skills de referência; veja a seção de skills nativas acima.

### MCP standalone

Rode sem o servidor completo, para qualquer cliente MCP. Qualquer uma destas opções funciona:

```bash
npx -y @agentmemory/agentmemory@latest mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

Ou adicione à configuração MCP do seu agente:

A maioria dos agentes (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI):
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

Mescle a entrada `agentmemory` no objeto `mcpServers` já existente do seu host, em vez de substituir o arquivo. Para clientes em sandbox que não conseguem alcançar o `localhost` do host, adicione `"AGENTMEMORY_FORCE_PROXY": "1"` ao bloco `env` e defina `AGENTMEMORY_URL` para uma rota que o sandbox consiga alcançar.

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

Copie o arquivo do plugin a partir do repositório:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Viewer em tempo real" height="32" /></picture></h2>

Inicia automaticamente na porta `3113`. O viewer carrega um snapshot ao conectar (`GET /agentmemory/viewer/snapshot`) e então aplica eventos em tempo real enviados por SSE em `/agentmemory/viewer/events`, pelo worker REST: novas memórias, lessons, observações, entradas de auditoria, mudanças no grafo e atualizações de saúde aparecem sem polling nem recarregamento da página. As outras requisições são as ações em que você clica, páginas de “carregar mais” e buscas. Quando o stream cai, o viewer mostra há quanto tempo os dados estão desatualizados, reconecta com backoff e sincroniza novamente a partir de um snapshot.

- **12 abas em quatro grupos** com contagens ao vivo, deep links (`#memories/<id>`, `#sessions/<id>?obs=<id>`, `#graph/<id>`, `#health/consolidation`), atalhos de teclado e um menu mobile.
- **Memories:** busca no lado do servidor, filtros por projeto, agente e tipo, um painel de detalhe com a cadeia de versões e um diff de palavras, links de provenance, botões de copiar para o id, a chamada MCP e um comando curl, editar (uma nova versão), forget com confirmação, forget em massa e export em JSON.
- **Sessions:** uma timeline inline de observações com entrada e saída de tool legíveis, filtros e paginação, e as memórias e lessons que cada sessão produziu.
- **Graph:** busca, detalhe do node com relações e fontes, uma legenda que não depende só de cor, e controles de zoom.
- **Health:** a versão ao vivo de `GET /agentmemory/status`. Todo problema vem com a sua correção, mais o backend de estado, o estado de save do índice, o progresso de compactação de provenance do grafo e um explicador de consolidação com os thresholds reais.
- **Páginas Audit, Activity, Profile, Replay, Lessons, Actions e Crystals**, cada uma com um estado vazio que explica o que a seção é, por que está vazia e o comando que a preenche, e um tooltip `?` de glossário em todo termo e número.

```bash
open http://localhost:3113
```

O servidor do viewer faz bind em `127.0.0.1` por padrão e anexa o secret do servidor ao encaminhar requisições para a REST API. Em um bind fora do loopback, a casca HTML permanece pública, mas cada requisição de proxy exige bearer token; o viewer pede o token e o guarda no session storage do navegador. Configure allowlists explícitas de host/origem e TLS antes de expor um viewer. O endpoint REST `/agentmemory/viewer` continua seguindo as regras normais de bearer token e redireciona navegadores sem token para a porta do viewer. Os headers CSP usam um nonce de script por resposta e desabilitam atributos de handler inline (`script-src-attr 'none'`).

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Configuração" height="32" /></picture></h2>

### Providers de LLM

agentmemory detecta providers automaticamente a partir do seu ambiente. Um provider libera operações baseadas em LLM, mas a configuração de um provider por si só não ativa a compressão de observações escrita por LLM. Esse caminho exige tanto um provider quanto `AGENTMEMORY_AUTO_COMPRESS=true`.

| Provider | Config | Notas |
|----------|--------|-------|
| **No-op (padrão)** | Nenhuma config necessária | Compress/summarize baseados em LLM ficam desativados. Compressão sintética e recall via BM25 continuam funcionando. Veja `AGENTMEMORY_ALLOW_AGENT_SDK` abaixo se você costumava depender do fallback via assinatura Claude. |
| API Anthropic | `ANTHROPIC_API_KEY` | Cobrança por token |
| MiniMax | `MINIMAX_API_KEY` | Compatível com Anthropic |
| Gemini | `GEMINI_API_KEY` | Também ativa embeddings |
| OpenRouter | `OPENROUTER_API_KEY` | Qualquer modelo |
| API OpenAI | `OPENAI_API_KEY` | Padrão `gpt-5.6-luna`, sobrescreva com `OPENAI_MODEL` |
| **Local (Ollama / LM Studio / vLLM / llama.cpp)** | `OPENAI_API_KEY=local` + `OPENAI_BASE_URL=http://localhost:11434/v1` (Ollama) ou `http://localhost:1234/v1` (LM Studio) + `OPENAI_MODEL=<your model>` | Qualquer coisa compatível com a API da OpenAI. Custo zero, roda no seu hardware. Veja [Modelos locais](#local-models-ollama--lm-studio--vllm) abaixo. |
| Fallback de assinatura Claude | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Somente opt-in. Dispara sessões do `@anthropic-ai/claude-agent-sdk`; costumava causar recursão sem limite no Stop hook, então deixou de ser o padrão. |

<a id="local-models-ollama--lm-studio--vllm"></a>

### Modelos locais (Ollama / LM Studio / vLLM)

agentmemory fala com qualquer servidor compatível com a API da OpenAI, então qualquer coisa que exponha `/v1/chat/completions` funciona sem mudanças de código. Sem chaves pagas, sem nuvem, sem rate limits; roda inteiramente no seu hardware.

**Ollama** (porta padrão `11434`):

```bash
ollama pull qwen3:8b   # or qwen3:4b, gpt-oss:20b, qwen3-coder:30b, etc.
ollama serve
```

```env
# ~/.agentmemory/.env
OPENAI_API_KEY=ollama                          # any non-empty string; Ollama ignores it
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=qwen3:8b
```

**LM Studio** (porta padrão `1234`):

Abra o LM Studio → aba Local Server → Start Server. Escolha qualquer modelo de chat no seletor (Qwen 3, gpt-oss, DeepSeek R1, etc.).

```env
# ~/.agentmemory/.env
OPENAI_API_KEY=lmstudio                        # any non-empty string; LM Studio ignores it
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=qwen3-8b                          # match the model name from LM Studio
```

**vLLM / llama.cpp / Text Generation Inference**: mesmo formato. Aponte `OPENAI_BASE_URL` para a URL que o seu servidor expõe e defina `OPENAI_MODEL` para um nome que o seu servidor vai aceitar.

**Escolhas de modelo para trabalho de memória**: compressão e sumarização são tarefas curtas (<2K tokens de entrada, <500 tokens de saída) onde um modelo instruct de 7B já é suficiente. Recomendações:

| Modelo | Tamanho | Por quê |
|-------|------|-----|
| `qwen3:8b` | ~5.2 GB | Padrão equilibrado numa máquina de 16 GB; forte em extração e texto no formato de tool |
| `qwen3:4b` | ~2.6 GB | Menor opção sensata; ok para compressão, mais fraco para extração de grafo |
| `qwen3-coder:30b` | ~19 GB | Melhor escolha local para sessões no formato de código (30B MoE, 3.3B ativo) em hardware de 24-32 GB |
| `gpt-oss:20b` | ~14 GB | Modelo geral forte que cabe em 16 GB de RAM |
| `deepseek-r1:8b` | ~5.2 GB | Distill de raciocínio; mais lento, mas com extrações mais limpas |

Os modelos Qwen 3 pensam por padrão e podem queimar todo o token budget em raciocínio antes de qualquer saída. Defina `AGENTMEMORY_LLM_NOTHINK=1` para anexar `/no_think` aos prompts de extração de grafo, e aumente `MAX_TOKENS` (16384 funciona) se as extrações voltarem vazias.

Modelos da classe reasoning (estilo `o1` com blocos `<think>`) podem retornar `content` vazio com um campo `reasoning` que o seu servidor local pode não expor. Se as extrações voltarem vazias, troque primeiro para um modelo sem reasoning. A env `OPENAI_REASONING_EFFORT=none` também pode desativar o thinking em modelos de thinking do Ollama Cloud que espelham o schema de reasoning da OpenAI.

Embeddings locais vêm como uma dependência opcional, mas não são ativados por padrão. Defina `EMBEDDING_PROVIDER=local` para optar pelo `Xenova/all-MiniLM-L6-v2` (384 dim). A primeira requisição de embedding baixa o modelo; a inferência fica no dispositivo depois disso. Sem essa configuração ou uma chave de embedding remota, os vetores ficam desativados, o `mem::search` usa BM25, e o `smart-search` ainda pode adicionar correspondências de grafo já existentes.

### Seleção de modelo com consciência de custo

Comece sem chave para captura e pesquisa por palavras-chave. `EMBEDDING_PROVIDER=local` ativa a pesquisa semântica local após o primeiro download do modelo. A compressão por LLM exige um provedor e `AGENTMEMORY_AUTO_COMPRESS=true`; pode gerar uma solicitação por observação. Consulte os preços atuais antes de ativá-la. O visualizador e `agentmemory status` mostram os provedores ativos.

### Memória multiagente (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

Em setups multiagente onde vários papéis compartilham um único servidor agentmemory (architect / developer / reviewer / researcher / support-agent), `AGENT_ID` marca toda escrita com o papel que a fez. `AGENTMEMORY_AGENT_SCOPE` controla se o recall filtra por essa tag.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

Dois modos:

| Modo | Marca escritas | Filtra recall | Quando usar |
|------|------------|---------------|-------------|
| `shared` (padrão) | sim | não | Contexto entre agentes com trilha de auditoria. O architect pode ver o que o developer anotou, mas toda linha registra quem disse o quê. |
| `isolated` | sim | sim | Separação estrita. O architect nunca vê as observações / memórias / sessões do developer. |

O que é marcado quando `AGENT_ID` está definido: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. O papel flui de `api::session::start` → `mem::observe` → `mem::compress` → KV.

O que é filtrado no modo isolated: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Cada endpoint aceita `?agentId=<role>` para sobrescrever por requisição, e `?agentId=*` para sair do escopo do env por completo. `/memories` também aceita `?includeOrphans=true` para mostrar memórias pré-AGENT_ID cujo `agentId` é undefined.

Override por chamada na camada SDK / REST: todo endpoint mutador (`/session/start`, `/remember`) aceita um campo `agentId` no body da requisição que vence o env. Útil para runtimes que roteiam muitos papéis por um único processo de servidor. A tool MCP `memory_save` expõe o mesmo campo `agentId`, o servidor stdio standalone repassa tanto `agentId` quanto `project`, e memórias salvas carregam `agentId` para o índice de busca, então a busca com escopo de agente cobre memórias além de observações.

Quando `AGENT_ID` não está definido, a memória permanece sem escopo (comportamento legado, sem tags, sem filtros).

### Portas

| Porta | Uso | Configuração |
|---|---|---|
| `3111` | REST API, MCP HTTP, SSE | `III_REST_PORT` |
| `3113` | Viewer UI | `III_VIEWER_PORT` |

`--port <N>` define a porta da API e, por padrão, o visualizador em `N+2`. Use `--instance N` para uma instância separada. Mantenha as portas internas privadas e consulte o [guia de implantação](../deploy/README.md) antes de permitir acesso remoto.

### Backend de armazenamento: file (padrão) vs redis

O armazenamento em arquivos padrão não precisa de um serviço de banco de dados separado. Redis é opcional com `AGENTMEMORY_STATE_BACKEND=redis` e `AGENTMEMORY_REDIS_URL`. Trocar o backend não copia as memórias. O [guia de armazenamento e backups](../docs/reliability/state-storage.md) cobre persistência, limitações do Redis e exportação/importação autenticada.

### Arquivo de config

Coloque a configuração de runtime do agentmemory em `~/.agentmemory/.env` em vez de exportar variáveis em todo shell. Se o viewer mostrar uma dica de configuração como `export ANTHROPIC_API_KEY=...`, copie-a para esse arquivo como `ANTHROPIC_API_KEY=...`, sem o prefixo `export`, e então reinicie o agentmemory. Defina `AGENTMEMORY_ENV_FILE` para usar outro caminho de arquivo env.

As variáveis de ambiente do processo têm prioridade sobre o arquivo. Reinicie o servidor após alterar a configuração.

No Windows, o mesmo arquivo mora em `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

Para testar com uma assinatura Claude Code Pro/Max em vez de uma API key, opte por isso explicitamente:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

A compressão de observações escrita por LLM exige as duas linhas: acesso a um provider de LLM (incluindo este fallback explícito de assinatura) e `AGENTMEMORY_AUTO_COMPRESS=true`. Um provider por si só deixa o caminho padrão de compressão sintética no lugar.

A consolidação (nodes de grafo, lessons, crystals) vem ativada por padrão sempre que um provider de LLM está configurado. Desative explicitamente com `CONSOLIDATION_ENABLED=false` se você quiser operação sem LLM. A extração de grafo é uma flag separada:

```env
GRAPH_EXTRACTION_ENABLED=true
# CONSOLIDATION_ENABLED=false   # opt out of auto-consolidation
```

### Variáveis de ambiente

Opções comuns para `~/.agentmemory/.env`:

```env
EMBEDDING_PROVIDER=local

# AGENTMEMORY_INJECT_CONTEXT=true
# AGENTMEMORY_AUTO_COMPRESS=true
# AGENTMEMORY_TOOLS=core

# AUTO_FORGET_ENABLED=false
# LESSON_DECAY_ENABLED=false
# INSIGHT_DECAY_ENABLED=false
```

A referência completa está em [`.env.example`](../.env.example): credenciais, filtros de captura, retenção, armazenamento, escopo de equipe e opções. `AGENTMEMORY_ENV_FILE` seleciona outro arquivo. Nunca inclua um `.env` preenchido ou um segredo bearer no git.

---

<h2 id="api"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-api.svg"><img src="../assets/tags/section-api.svg" alt="API" height="32" /></picture></h2>

146 endpoints na porta `3111`. A REST API faz bind em `127.0.0.1` por padrão. Endpoints protegidos exigem `Authorization: Bearer <secret>`, e endpoints de mesh sync exigem um `AGENTMEMORY_SECRET` explicitamente definido em ambos os peers.

**A autenticação vem ativada por padrão.** Quando `AGENTMEMORY_SECRET` não está definida na shell nem em `~/.agentmemory/.env`, a CLI gera um segredo aleatório na primeira execução em `~/.agentmemory/secret` e grava uma cópia chamada `secret` no diretório de dados selecionado, com permissões `0600`. Todos os clientes empacotados o leem de lá ao falar com um servidor local: CLI, viewer, hooks em `plugin/scripts`, servidor MCP e shim `@agentmemory/mcp`, configurações escritas por `agentmemory connect` e integrações empacotadas de OpenCode, Pi, OpenClaw, Hermes e filesystem-watcher. O secret armazenado só é enviado para URLs de loopback (`localhost`, `127.0.0.0/8`, `::1`). Um `AGENTMEMORY_SECRET` explícito sempre prevalece, e clientes remotos precisam ter o secret definido em seu ambiente. Deploys self-hosted com Docker baseados no repositório e os entrypoints de `deploy/` geram e exportam seu próprio secret. Para chamar a API manualmente:

```bash
curl -H "Authorization: Bearer <secret-from-data-dir>" http://localhost:3111/agentmemory/health
```

**Regras de requisição para escritas.** Requisições `POST`, `PUT`, `PATCH` e `DELETE` para a REST API e o viewer devem enviar `Content-Type: application/json` (um parâmetro `charset` não tem problema) sempre que carregarem um body, e um header `Origin`, quando presente, deve ser uma origem de loopback para a porta REST ou do viewer configurada, ou estar listado em `VIEWER_ALLOWED_ORIGINS` (separado por vírgulas, por exemplo `https://memory.example.com`). Clientes que não enviam header `Origin` (CLI, hooks, MCP, curl, servidor-para-servidor) não são afetados. O viewer também aceita sua própria origem.

**Caminhos de arquivo.** Endpoints que leem ou escrevem arquivos (`/compress-file`, `/replay/import-jsonl`, `/graph/import-graphify`) só aceitam caminhos dentro de `~/.agentmemory`, do diretório de dados da instância, ou de um diretório listado em `AGENTMEMORY_IMPORT_ROOT` (separe vários com `:`, ou `;` no Windows). `/replay/import-jsonl` também aceita seu padrão `~/.claude/projects`. `/obsidian/export` fica dentro de `AGENTMEMORY_EXPORT_ROOT` e `/migrate` dentro de `~/.agentmemory`. Symlinks são resolvidos antes de toda checagem.

**Limpeza de secrets.** API keys, bearer tokens, blocos de chave privada PEM e credenciais embutidas em URLs (`scheme://user:password@host`) são redigidas antes de o texto ser armazenado, em todo caminho de escrita: observations, remember, evolve, slots, lessons, actions, sketches, signals, checkpoints, imports, jsonl replay, mesh sync, team shares, saída de compressão e resumo, crystals e nodes de grafo.

<details>
<summary>Endpoints principais</summary>

| Método | Caminho | Descrição |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Health check (sempre público) |
| `GET` | `/agentmemory/status` | O que está errado e como corrigir (HTML para navegadores, JSON para o resto) |
| `GET` | `/agentmemory/viewer/snapshot` | Tudo o que o viewer mostra, em uma única resposta |
| `POST` | `/agentmemory/session/start` | Inicia sessão + obtém contexto |
| `POST` | `/agentmemory/session/end` | Finaliza sessão |
| `POST` | `/agentmemory/observe` | Captura observação (veja a entrega de captura abaixo) |
| `GET` | `/agentmemory/capture` | Inbox de captura, dead letters e spool offline |
| `POST` | `/agentmemory/capture/retry` | Tenta de novo as capturas em dead-letter |
| `POST` | `/agentmemory/capture/drain` | Envia agora o spool offline local |
| `POST` | `/agentmemory/smart-search` | Busca híbrida |
| `POST` | `/agentmemory/context` | Gera contexto |
| `POST` | `/agentmemory/remember` | Salva na memória de longo prazo |
| `POST` | `/agentmemory/forget` | Deleta observações |
| `POST` | `/agentmemory/enrich` | Contexto de arquivo + memórias + bugs |
| `GET` | `/agentmemory/profile` | Perfil do projeto |
| `GET` | `/agentmemory/export` | Exporta todos os dados |
| `POST` | `/agentmemory/import` | Importa a partir de JSON |
| `POST` | `/agentmemory/graph/query` | Consulta ao grafo de conhecimento |
| `POST` | `/agentmemory/graph/compact` | Reduz provenance de grafo superdimensionada |
| `POST` | `/agentmemory/team/share` | Compartilha com o time |
| `GET` | `/agentmemory/audit` | Trilha de auditoria |

Lista completa de endpoints: [REST API](../plugin/skills/agentmemory-rest-api/REFERENCE.md)

</details>

**Entrega de captura.** Os hooks enviam cada observação uma única vez para `POST /agentmemory/observe` com um `eventId`. Esse id é o próprio id do host para a chamada, quando o payload tem um (por exemplo, o `tool_use_id` do Claude Code), ou então um hash da sessão, tipo de hook, nome da tool, entrada, saída e timestamp do host. O servidor grava o evento em um inbox de captura no state store, armazena a observação e então remove a entrada do inbox. O status code diz o que aconteceu:

| Status | Campo `status` | Significado |
|---|---|---|
| `201` | `accepted` | Armazenada. `observationId` é a nova observação. |
| `202` | `accepted` (`state: "retrying"`) | Aceita, mas o armazenamento falhou. O servidor tenta de novo, inclusive depois de um restart. |
| `200` | `duplicate` | Este `eventId` já havia sido aceito. `observationId` é a observação existente; nada novo é armazenado. |
| `400` / `422` | `rejected` | Payload inválido, ou o armazenamento falhou de forma definitiva (o evento é mantido como dead letter). |
| `503` | `rejected` (`retryable: true`) | O inbox está cheio (`AGENTMEMORY_CAPTURE_INBOX_MAX`). Os hooks colocam o evento no spool e o enviam depois. |

Eventos que falham são tentados de novo a cada `AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS` (10 s) com backoff que dobra, até `AGENTMEMORY_CAPTURE_MAX_ATTEMPTS` (5). Eventos que continuam falhando ficam no inbox como dead letters, são listados em `/agentmemory/status` e na página Health do viewer, e podem ser tentados de novo com `POST /agentmemory/capture/retry` (`{"eventId": "..."}` ou `{"all": true}`). Ids de evento aceitos são lembrados por `AGENTMEMORY_CAPTURE_DEDUP_HOURS` (168 horas, no máximo `AGENTMEMORY_CAPTURE_EVENTS_MAX` ids), então um hook reproduzido depois de um timeout ou de um restart é armazenado uma única vez, enquanto duas chamadas de tool separadas com seus próprios ids de host são armazenadas duas vezes, mesmo quando o conteúdo delas é idêntico. Quando uma observação é deletada (forget, deleção de sessão, eviction, auto-forget ou um import que substitui o store), o evento dela é marcado como deletado antes que a observação seja removida, então uma reprodução desse evento dentro da mesma janela é respondida como duplicata e não armazena nada. O state store grava em disco a cada 2 segundos, então um evento já respondido ainda pode estar só em memória por um instante. Para cobrir isso, toda resposta `2xx` também carrega o `bootId` do servidor (novo a cada início), `acceptedAt` e `durableAfterMs` (o intervalo de save mais 1.5 s no store de arquivo, 1.5 s no redis, onde a persistência é configuração do operador). Os hooks mantêm o evento no spool local até que essa janela tenha passado, e o deletam numa chamada posterior sem fazer outra requisição. Se o `bootId` tiver mudado até então, o servidor reiniciou, então o hook envia o evento de novo com o mesmo `eventId`; um evento que de fato chegou ao disco não é armazenado duas vezes. O servidor também envia esses eventos por conta própria no início e a cada intervalo de retry, então um restart não perde nada mesmo quando nenhum hook roda depois. Hooks antigos ignoram os campos extras, e hooks novos contra um servidor mais antigo descartam o evento no `2xx` como antes.

Quando o servidor está fora do ar, não responde a tempo ou retorna um 5xx, o hook anexa a observação a um arquivo de spool local, `<data dir>/capture-spool/<host>-<port>.jsonl` (sobrescreva a pasta com `AGENTMEMORY_CAPTURE_SPOOL_DIR`). O arquivo é privado ao seu usuário (modo 600), secrets são redigidos da mesma forma que o servidor os redige, ele guarda no máximo `AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES` (5 MiB) e descarta entradas mais antigas que `AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS` (168). Quando está cheio, novas entradas são descartadas e contadas, e `/agentmemory/status` reporta isso. O hook ainda sai com código 0 dentro do seu limite de tempo e não adiciona nenhuma requisição quando o servidor está saudável. O spool é enviado no próximo início e pelo primeiro hook que alcançar o servidor de novo, em um processo em segundo plano para que o agente não espere. Ids de evento tornam isso seguro: uma observação que já chegou antes de um timeout não é armazenada duas vezes. `npx @agentmemory/agentmemory capture` mostra o spool e o inbox do servidor, `--drain` envia o spool agora, e `GET /agentmemory/capture` retorna o mesmo em JSON. Defina `AGENTMEMORY_CAPTURE_SPOOL=false` para desativar o spool.

**Compactando provenance de grafo.** A compactação da proveniência antiga é adiada na inicialização porque lê os scopes antigos completos. `/agentmemory/status` informa `deferred`, ou `off` com `AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false`. Execute a compactação manual abaixo durante a manutenção. A migração do índice de busca é separada: use `agentmemory graph-index migrate --allow-legacy-scan` conforme o [guia de manutenção](../docs/reliability/graph-index-migration.md).

Para rodar manualmente, chame `POST /agentmemory/graph/compact`. Ele percorre os índices de nome e de chave de edge em vez de listar todo node e edge, e é seguro rodar de novo. Quando reduz ids, ele grava uma entrada de auditoria `graph_compact`.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" -d '{}'
```

Em um store grande, ou quando a chamada retorna 504, rode em fatias. Envie `scope` (`nodes`, `edges` ou `history`), `offset` e `limit`, depois chame de novo com o `nextOffset` retornado até que seja `null`. Faça isso para `nodes`, `edges` e `history`, e termine com uma chamada `{"scope":"snapshot"}`, porque uma execução em fatias não toca o snapshot em cache.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" -d '{"scope":"nodes","offset":0,"limit":200}'
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" -d '{"scope":"snapshot"}'
```

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Desenvolvimento" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 4,100+ tests
npm run test:integration  # API tests (requires running services)
```

[Install](#install) · [CONTRIBUTING.md](../CONTRIBUTING.md)

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="Licença" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
