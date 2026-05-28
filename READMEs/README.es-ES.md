<p align="center">
  <img src="../assets/banner.png" alt="agentmemory — Memoria persistente para agentes de codificación con IA" width="720" />
</p>

<p align="center">
  <strong>
    Tu agente de codificación lo recuerda todo. Se acabó volver a explicarlo.
    Built on <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  Memoria persistente para Claude Code, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode y cualquier cliente MCP.
</p>

<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  Español |
  <a href="README.tr-TR.md">Türkçe</a> |
  <a href="README.ru-RU.md">Русский</a> |
  <a href="README.hi-IN.md">हिन्दी</a> |
  <a href="README.pt-BR.md">Português</a> |
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1200%20stars%20%2F%20172%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Documento de diseño: 1200 stars / 172 forks en el gist" /></a>
</p>

<p align="center">
  <em>El gist extiende el patrón LLM Wiki de Karpathy con puntuación de confianza, ciclo de vida, grafos de conocimiento y búsqueda híbrida: agentmemory es la implementación.</em>
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
  <img src="../assets/demo.gif" alt="Demostración de agentmemory" width="720" />
</p>

<p align="center">
  <a href="#install">Instalación</a> &bull;
  <a href="#quick-start">Inicio rápido</a> &bull;
  <a href="#benchmarks">Benchmarks</a> &bull;
  <a href="#vs-competitors">Comparativa</a> &bull;
  <a href="#works-with-every-agent">Agentes</a> &bull;
  <a href="#how-it-works">Cómo funciona</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Visor</a> &bull;
  <a href="#iii-console">iii Console</a> &bull;
  <a href="#powered-by-iii">Powered by iii</a> &bull;
  <a href="#configuration">Configuración</a> &bull;
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

O mediante `npx` (sin instalación):

```bash
npx @agentmemory/agentmemory
```

Aviso — npx cachea por versión. Si un simple `npx @agentmemory/agentmemory` sirve una versión antigua, fuerza la última con `npx -y @agentmemory/agentmemory@latest`, o limpia la caché una vez con `rm -rf ~/.npm/_npx` (macOS/Linux; en Windows borra `%LOCALAPPDATA%\npm-cache\_npx`). La primera ejecución vía npx desde la v0.9.16+ pregunta si deseas instalar globalmente, de modo que el comando `agentmemory` quede disponible en cualquier lugar.

Todas las opciones en [Inicio rápido](#quick-start) más abajo. Conexión específica por agente en [Funciona con cualquier agente](#works-with-every-agent).

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Funciona con cualquier agente" height="32" /></picture></h2>

agentmemory funciona con cualquier agente que soporte hooks, MCP o REST API. Todos los agentes comparten el mismo servidor de memoria.

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
  <sub>Funciona con <strong>cualquier</strong> agente que hable MCP o HTTP. Un único servidor, memorias compartidas entre todos ellos.</sub>
</p>

---

Vuelves a explicar la misma arquitectura cada sesión. Vuelves a descubrir los mismos bugs. Vuelves a enseñar las mismas preferencias. La memoria integrada (CLAUDE.md, .cursorrules) se topa con un techo de 200 líneas y se queda obsoleta. agentmemory soluciona esto. Captura silenciosamente lo que hace tu agente, lo comprime en una memoria buscable e inyecta el contexto correcto al inicio de la siguiente sesión. Un único comando. Funciona en todos los agentes.

**Qué cambia:** En la sesión 1 configuras autenticación JWT. En la sesión 2 pides rate limiting. El agente ya sabe que tu autenticación usa el middleware jose en `src/middleware/auth.ts`, que tus pruebas cubren la validación de tokens y que elegiste jose en lugar de jsonwebtoken por compatibilidad con Edge. Sin volver a explicar. Sin copiar y pegar. El agente simplemente lo *sabe*.

```bash
npx @agentmemory/agentmemory
```

> **Novedad en v0.9.0** — Sitio de aterrizaje en [agent-memory.dev](https://agent-memory.dev), conector de sistema de ficheros (`@agentmemory/fs-watcher`), el MCP standalone ahora hace de proxy al servidor en ejecución, por lo que los hooks y el visor coinciden, política de auditoría codificada en cada ruta de borrado, y health deja de marcar `memory_critical` en procesos Node pequeños. Notas completas en [CHANGELOG.md](../CHANGELOG.md#090--2026-04-18).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Precisión de recuperación

**coding-agent-life-v1** (corpus interno, reproducible en sandbox)

| Adaptador | P@5 | R@5 | Tasa de aciertos top-5 | Latencia p50 |
|---|---|---|---|---|
| **agentmemory hybrid** | **0.578** | **0.967** | **15 / 15** | 14 ms |
| grep baseline | 0.267 | 0.967 | 15 / 15 | 0 ms |

Tasa de aciertos top-5 del 100%. Precisión **2,2×** mejor que la baseline grep con la misma entrada. Desglose completo por tipo: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 preguntas)

| Sistema | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| BM25-only fallback | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Ahorro de tokens

| Enfoque | Tokens/año | Coste/año |
|---|---|---|
| Pegar todo el contexto | 19.5M+ | Imposible (excede la ventana) |
| Resumido por LLM | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + embeddings locales | ~170K | **$0** |

</td>
</tr>
</table>

> Modelo de embedding: `all-MiniLM-L6-v2` (local, gratuito, sin API key). Informes completos: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Comparativa con la competencia: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) — agentmemory frente a mem0, Letta, Khoj, claude-mem, Hippo.

**Reproduce en local:** [`eval/README.md`](../eval/README.md) — un harness con adaptadores intercambiables para LongMemEval `_s` (500-Q públicas) y `coding-agent-life-v1` (corpus interno de 15 sesiones). Los adaptadores grep / vector / agentmemory se puntúan en paralelo, salida NDJSON, y las scorecards publicadas quedan en [`docs/benchmarks/`](../docs/benchmarks/).

**Funciona muy bien con [codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything) y [Graphify](https://github.com/safishamsi/graphify).** Indexado de grafos de código, pipelines de build multiagente y grafos de conocimiento más amplios sobre documentos / PDFs / imágenes / vídeos. agentmemory recuerda el trabajo; esos tres proyectos iluminan el resto de la capa de contexto. Recetas y tabla de enrutamiento por pregunta: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="Comparativa" height="32" /></picture></h2>

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
<td>Motor de memoria + servidor MCP</td>
<td>API de capa de memoria</td>
<td>Runtime de agente completo</td>
<td>Fichero estático</td>
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
<td>12 hooks (esfuerzo manual cero)</td>
<td>Llamadas manuales a <code>add()</code></td>
<td>El agente se edita a sí mismo</td>
<td>Edición manual</td>
</tr>
<tr>
<td><strong>Búsqueda</strong></td>
<td>BM25 + Vector + Graph (fusión RRF)</td>
<td>Vector + Graph</td>
<td>Vector (archival)</td>
<td>Carga todo en contexto</td>
</tr>
<tr>
<td><strong>Multiagente</strong></td>
<td>MCP + REST + leases + signals</td>
<td>API (sin coordinación)</td>
<td>Solo dentro del runtime de Letta</td>
<td>Ficheros por agente</td>
</tr>
<tr>
<td><strong>Dependencia de framework</strong></td>
<td>Ninguna (cualquier cliente MCP)</td>
<td>Ninguna</td>
<td>Alta (obliga a usar Letta)</td>
<td>Formato por agente</td>
</tr>
<tr>
<td><strong>Dependencias externas</strong></td>
<td>Ninguna (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + BD vectorial</td>
<td>Ninguna</td>
</tr>
<tr>
<td><strong>Ciclo de vida de memoria</strong></td>
<td>Consolidación de 4 niveles + decaimiento + auto-olvido</td>
<td>Extracción pasiva</td>
<td>Gestionado por el agente</td>
<td>Poda manual</td>
</tr>
<tr>
<td><strong>Eficiencia de tokens</strong></td>
<td>~1.900 tokens/sesión ($10/año)</td>
<td>Varía según la integración</td>
<td>Memoria principal en contexto</td>
<td>22K+ tokens con 240 obs</td>
</tr>
<tr>
<td><strong>Visor en tiempo real</strong></td>
<td>Sí (port 3113)</td>
<td>Dashboard en la nube</td>
<td>Dashboard en la nube</td>
<td>No</td>
</tr>
<tr>
<td><strong>Self-hosted</strong></td>
<td>Sí (por defecto)</td>
<td>Opcional</td>
<td>Opcional</td>
<td>Sí</td>
</tr>
</table>

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Inicio rápido" height="32" /></picture></h2>

Compatibilidad: esta release apunta a `iii-sdk` estable `^0.11.0` e iii-engine v0.11.x.

### Pruébalo en 30 segundos

```bash
# Terminal 1: start the server
npx @agentmemory/agentmemory

# Terminal 2: seed sample data and see recall in action
npx @agentmemory/agentmemory demo
```

`demo` siembra 3 sesiones realistas (autenticación JWT, corrección de N+1 queries, rate limiting) y ejecuta búsquedas semánticas sobre ellas. Verás cómo encuentra "N+1 query fix" al buscar "database performance optimization" — algo que la coincidencia por palabra clave no puede hacer.

Abre `http://localhost:3113` para ver cómo se construye la memoria en directo.

### Recomendado: instala globalmente

`npx` cachea por versión. Si la semana pasada ejecutaste `npx @agentmemory/agentmemory@0.9.14`, un simple `npx @agentmemory/agentmemory` puede servir la versión obsoleta 0.9.14 desde `~/.npm/_npx/`, y no la última. Instala una vez y el comando `agentmemory` funciona en cualquier sitio:

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

A partir de v0.9.16, la primera ejecución vía npx pregunta si deseas instalar globalmente — responde `Y` una vez y listo. Si lo saltas, recurre a cualquiera de estos para un fetch limpio:

```bash
npx -y @agentmemory/agentmemory@latest                 # forces latest from npm (cross-platform)
rm -rf ~/.npm/_npx && npx @agentmemory/agentmemory     # macOS/Linux only (POSIX shell)
```

En Windows / PowerShell, el equivalente para limpiar caché es `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"` — la opción `npx -y ...@latest` de arriba es la alternativa multiplataforma.

### Session Replay

Toda sesión que agentmemory registra es reproducible. Abre el visor, elige la pestaña **Replay** y desplázate por la línea de tiempo: prompts, llamadas a herramientas, resultados y respuestas se renderizan como eventos discretos con play/pause, control de velocidad (0,5×–4×) y atajos de teclado (espacio para alternar, flechas para avanzar paso a paso).

¿Ya tienes transcripciones JSONL antiguas de Claude Code que quieras importar?

```bash
# Import everything under the default ~/.claude/projects
npx @agentmemory/agentmemory import-jsonl

# Or import a single file
npx @agentmemory/agentmemory import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

Las sesiones importadas aparecen en el selector de Replay junto a las nativas. Por debajo, cada entrada se enruta a través de las funciones iii `mem::replay::load`, `mem::replay::sessions` y `mem::replay::import-jsonl` — sin servidores side-channel.

### Actualización / Mantenimiento

Usa el comando de mantenimiento cuando intencionadamente quieras actualizar tu runtime local:

```bash
npx @agentmemory/agentmemory upgrade
```

Aviso: este comando muta el workspace/runtime actual. Puede actualizar dependencias de JavaScript, puede ejecutar `cargo install iii-engine --force`, y puede traer imágenes Docker.

Los detalles de implementación están en `src/cli.ts` (ver `runUpgrade` en torno a la región `src/cli.ts:544-595`).

### Claude Code (un bloque, pégalo)

```text
Install agentmemory: run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 4 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 53 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113.
```

#### Claude Code sin instalar el plugin (ruta MCP standalone)

Si conectas el servidor MCP de agentmemory directamente vía `~/.claude.json` en lugar de usar `/plugin install`, Claude Code nunca resuelve `${CLAUDE_PLUGIN_ROOT}` y tienes que apuntar los scripts de hook a rutas absolutas en `~/.claude/settings.json`. Esas rutas suelen incluir la versión de agentmemory (p. ej. `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.21/scripts/…`), por lo que la siguiente actualización rompe silenciosamente todos los hooks ([#508](https://github.com/rohitg00/agentmemory/issues/508)).

Solución:

```bash
agentmemory connect claude-code --with-hooks
```

Esto fusiona los mismos comandos de hook en `~/.claude/settings.json` con rutas absolutas que apuntan al directorio `plugin/` empaquetado del paquete `@agentmemory/agentmemory` actualmente instalado. Vuelve a ejecutar el comando tras actualizar agentmemory para refrescar las rutas. Las entradas de usuario en el mismo fichero se preservan; solo se reemplazan las entradas previas de agentmemory. La ruta vía `/plugin install` sigue siendo la recomendada.
Para despliegues remotos o protegidos, lanza Claude Code con `AGENTMEMORY_URL` y `AGENTMEMORY_SECRET` definidos. El plugin pasa ambos valores a su servidor MCP empaquetado; cuando `AGENTMEMORY_URL` está vacío, el shim MCP usa `http://localhost:3111`.

### Codex CLI (plataforma de plugins Codex)

```bash
# 1. start the memory server in a separate terminal
npx @agentmemory/agentmemory

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

El plugin de Codex se sirve desde el mismo directorio `plugin/` que el de Claude Code. Registra:

- `@agentmemory/mcp` como servidor MCP (hace de proxy a las 51 tools cuando `AGENTMEMORY_URL` apunta a un servidor agentmemory en ejecución; cae a 7 tools en local cuando no hay servidor accesible)
- 6 hooks de ciclo de vida: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 4 skills: `/recall`, `/remember`, `/session-history`, `/forget`

El motor de hooks de Codex inyecta `CLAUDE_PLUGIN_ROOT` en los subprocesos de hook (según [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), por lo que los mismos scripts de hook funcionan en ambos hosts sin duplicación. Los eventos Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure son exclusivos de Claude Code y no se registran para Codex.

#### Codex Desktop: los hooks del plugin están silenciados (con workaround)

`CodexHooks` y `PluginHooks` son estables y están activados por defecto en [`codex-rs/features/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs), pero las builds actuales de Codex Desktop no despachan el `hooks.json` local del plugin ([openai/codex#16430](https://github.com/openai/codex/issues/16430)). Las tools MCP siguen funcionando; solo faltan las observaciones del ciclo de vida.

Hasta que se solucione upstream, replica los mismos comandos de hook en el `~/.codex/hooks.json` global:

```bash
agentmemory connect codex --with-hooks
```

Esto añade un bloque idempotente a `~/.codex/hooks.json` que referencia rutas absolutas a los scripts empaquetados (no hace falta expandir `${CLAUDE_PLUGIN_ROOT}` en el ámbito de usuario). Vuelve a ejecutar el mismo comando tras actualizar agentmemory para refrescar las rutas. Las entradas de usuario en el mismo fichero se preservan; solo se reemplazan las entradas previas de agentmemory.

<details>
<summary><b>OpenClaw (pega este prompt)</b></summary>

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

Guía completa: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (pega este prompt)</b></summary>

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

Guía completa: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Otros agentes

Arranca el servidor de memoria: `npx @agentmemory/agentmemory`

La entrada de agentmemory es el **mismo bloque de servidor MCP** en cada host que use la forma `mcpServers` (Cursor, Claude Desktop, Cline, Roo Code, Windsurf, Gemini CLI, OpenClaw):

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

**Fusiona esta entrada en el objeto `mcpServers` existente** en el fichero de configuración del host — no reemplaces el fichero. Si el fichero ya contiene otros servidores, añade `agentmemory` junto a ellos como otra clave dentro de `mcpServers`. Si `mcpServers` no existe, pega el bloque dentro de `{ "mcpServers": { ... } }`. Los marcadores `${VAR}` heredan `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` del shell al lanzar el servidor MCP — si no están definidas se pasan como cadena vacía y el shim cae a `http://localhost:3111`. Una sola entrada cubre tanto despliegues locales como remotos (k8s / con reverse-proxy).

| Agente | Fichero de configuración | Notas |
|---|---|---|
| **Cursor** | `~/.cursor/mcp.json` | Fusiona en `mcpServers`. También hay deeplink de un clic en el sitio web. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Fusiona en `mcpServers`. Reinicia Claude Desktop tras editar. |
| **Cline / Roo Code / Kilo Code** | Ajustes MCP de Cline (Settings UI → MCP Servers → Edit) | Mismo bloque `mcpServers`. |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | Mismo bloque `mcpServers`. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (fusión automática). |
| **OpenClaw** | Configuración MCP de OpenClaw | Mismo bloque `mcpServers`, o usa el [memory plugin](../integrations/openclaw/) más profundo. |
| **Codex CLI (solo MCP)** | `.codex/config.toml` | Forma TOML: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, o añade `[mcp_servers.agentmemory]` a mano. |
| **Codex CLI (plugin completo)** | Marketplace de plugins Codex | `codex plugin marketplace add rohitg00/agentmemory` y luego `codex plugin add agentmemory@agentmemory`. Registra MCP + 6 hooks de ciclo de vida (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop) + 4 skills. En Codex Desktop, ejecuta también `agentmemory connect codex --with-hooks` hasta que se mergee [openai/codex#16430](https://github.com/openai/codex/issues/16430) — los hooks de plugin están silenciados allí. |
| **OpenCode (solo MCP)** | `opencode.json` | Forma distinta — clave `mcp` en el nivel superior, comando como array: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (plugin completo)** | `plugin/opencode/` | 22 hooks de captura automática que cubren ciclo de vida de sesión, mensajes, tools y errores. Dos comandos slash (`/recall`, `/remember`). Copia `plugin/opencode/` a tu workspace de OpenCode y añade la entrada del plugin a `opencode.json`. Tabla completa de hooks + análisis de gaps en [`plugin/opencode/README.md`](../plugin/opencode/README.md). |
| **pi** | `~/.pi/agent/extensions/agentmemory` | Copia [`integrations/pi`](../integrations/pi/) y reinicia pi. |
| **Hermes Agent** | `~/.hermes/config.yaml` | Usa el [memory provider plugin](../integrations/hermes/) más profundo con `memory.provider: agentmemory`. |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` escribe el bloque `mcpServers` estándar. El payload de los hooks es compatible a nivel de campo con Claude Code, así que los scripts de los 12 hooks existentes funcionan sin modificación — conéctalos en la sección `hooks` del mismo `settings.json`. |
| **Antigravity** (sustituye a Gemini CLI) | `mcp_config.json` (en el directorio User de Antigravity) | `agentmemory connect antigravity` escribe el bloque `mcpServers` estándar. macOS: `~/Library/Application Support/Antigravity/User/`. Linux: `~/.config/Antigravity/User/`. Úsalo tras el sunset de Gemini CLI del 2026-06-18. |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` escribe la configuración de nivel usuario. Los overrides por workspace van en `.kiro/settings/mcp.json` junto a tu código. |
| **Goose** | UI de ajustes MCP de Goose | Mismo bloque `mcpServers`. |
| **Aider** | n/a | Habla directamente con la REST API: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`. |
| **Cualquier agente (32+)** | n/a | `npx skillkit install agentmemory` auto-detecta el host y fusiona. |

**Clientes MCP en sandbox** (Flatpak / Snap / contenedores restrictivos) que no pueden alcanzar el `localhost` del host: añade también `"AGENTMEMORY_FORCE_PROXY": "1"` al bloque `env`, y apunta `AGENTMEMORY_URL` a una ruta que el sandbox sí pueda alcanzar (p. ej. tu IP de LAN). Consulta [#234](https://github.com/rohitg00/agentmemory/issues/234) para el walkthrough de diagnóstico.

### Acceso programático (Python / Rust / Node)

agentmemory registra sus operaciones principales como funciones iii (`mem::remember`, `mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). Cualquier lenguaje con un SDK iii puede llamarlas directamente sobre `ws://localhost:49134` — sin un cliente REST separado por lenguaje.

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

Ejemplo trabajado: [`examples/python/`](../examples/python/) (quickstart + flujo de observación/recall). La REST en `:3111` sigue disponible para hosts sin runtime iii.

### Desde el código fuente

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

Esto arranca agentmemory con un `iii-engine` local si `iii` ya está instalado, o cae a Docker Compose si hay Docker disponible. REST, streams y el visor se enlazan a `127.0.0.1` por defecto.

Instala `iii-engine` manualmente. **agentmemory actualmente fija `iii-engine` a `v0.11.2`** — `v0.11.6` introduce un nuevo modelo que sandboxea todo vía `iii worker add`, y agentmemory aún no se ha refactorizado para él. La fijación se levantará cuando aterrice el refactor. Sobrescribe con `AGENTMEMORY_III_VERSION=<version>` si has migrado al modelo sandbox manualmente.

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSL https://github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-aarch64-apple-darwin.tar.gz | tar -xz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** cambia `aarch64-apple-darwin` por `x86_64-apple-darwin`
- **Linux x64:** cambia por `x86_64-unknown-linux-gnu`
- **Linux arm64:** cambia por `aarch64-unknown-linux-gnu`
- **Windows:** descarga `iii-x86_64-pc-windows-msvc.zip` desde [iii-hq/iii releases v0.11.2](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2), extrae `iii.exe`, añádelo al PATH

O usa Docker (el `docker-compose.yml` empaquetado descarga `iiidev/iii:0.11.2`). Documentación completa: [iii.dev/docs](https://iii.dev/docs).

### Windows

agentmemory funciona en Windows 10/11, pero el paquete de Node.js por sí solo no es suficiente — también necesitas el runtime `iii-engine` (un binario nativo aparte) como proceso en segundo plano. El instalador oficial upstream es un script `sh` y hoy no existe un instalador PowerShell ni paquete scoop/winget, así que los usuarios de Windows tienen dos rutas:

**Opción A — Binario Windows preconstruido (recomendado):**

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

**Opción B — Docker Desktop:**

```powershell
# 1. Install Docker Desktop for Windows
# 2. Start Docker Desktop and make sure the engine is running
# 3. Run agentmemory — it will auto-start the bundled compose file:
npx -y @agentmemory/agentmemory
```

**Opción C — Solo MCP standalone (sin engine):** si solo necesitas las tools MCP para tu agente y no necesitas la REST API, el visor ni los cron jobs, sáltate el engine por completo:

```powershell
npx -y @agentmemory/agentmemory mcp
# or via the shim package:
npx -y @agentmemory/mcp
```

**Diagnóstico para Windows:** si `npx @agentmemory/agentmemory` falla, vuelve a ejecutar con `--verbose` para ver el stderr real del engine. Modos de fallo habituales:

| Síntoma | Solución |
|---|---|
| `iii-engine process started` seguido de `did not become ready within 15s` | El engine ha crasheado al arrancar — reejecuta con `--verbose` y revisa stderr |
| `Could not start iii-engine` | Ni `iii.exe` ni Docker están instalados. Ver Opción A o B |
| Conflicto de puerto | `netstat -ano \| findstr :3111` para ver qué está vinculado, mátalo o usa `--port <N>` |
| Se omite el fallback a Docker aunque Docker esté instalado | Asegúrate de que Docker Desktop esté efectivamente en ejecución (icono en la bandeja del sistema) |

> Nota: no existe `cargo install iii-engine` — `iii` no está publicado en crates.io. Los únicos métodos de instalación soportados son el binario preconstruido de arriba, el script `sh` upstream (solo macOS/Linux) y la imagen Docker.

---

<h2 id="deploy">Deploy</h2>

Plantillas de un clic para hosts gestionados. Cada una incluye un
Dockerfile autocontenido que descarga `@agentmemory/agentmemory` desde npm
y copia el binario del iii engine desde la imagen oficial `iiidev/iii` de
Docker Hub — no se requiere una imagen preconstruida de agentmemory. El
almacenamiento persistente se monta en `/data`; el entrypoint del primer
arranque sobrescribe la configuración iii empaquetada por npm (que se
enlaza a `127.0.0.1`) por una afinada para despliegue que se enlaza a
`0.0.0.0` y usa rutas absolutas `/data`, genera el secreto HMAC y
baja privilegios de `root` a `node` con `gosu` antes de hacer exec
del CLI de agentmemory.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

El botón de despliegue de un clic de Render requiere un `render.yaml` en la raíz del repo, que mantenemos limpio a propósito. Usa el flujo Render Blueprint documentado en [`deploy/render/`](../deploy/render/README.md) para apuntar al blueprint del repo manualmente.

Los detalles completos de configuración (captura HMAC, túnel SSH del visor, rotación, backup, mínimos de coste) están en [`deploy/`](../deploy/README.md):

- [`deploy/fly`](../deploy/fly/README.md) — máquina única con `auto_stop_machines = "stop"`; más barato en idle.
- [`deploy/railway`](../deploy/railway/README.md) — tarifa plana del plan Hobby, volumen en el dashboard.
- [`deploy/render`](../deploy/render/README.md) — flujo Blueprint, snapshots automáticos de disco en planes de pago.
- [`deploy/coolify`](../deploy/coolify/README.md) — self-hosted en tu propio VPS vía [Coolify](https://coolify.io/self-hosted); misma stack Docker Compose, tú eres dueño del host y los datos.

Solo se publica el puerto `3111`. El visor en `3113` permanece enlazado a loopback dentro del contenedor — el README de cada plantilla documenta el patrón de túnel SSH para alcanzarlo.

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Por qué agentmemory" height="32" /></picture></h2>

Todo agente de codificación olvida todo al terminar la sesión. Pierdes los primeros 5 minutos de cada sesión re-explicando tu stack. agentmemory corre en segundo plano y lo elimina por completo.

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

### Frente a la memoria integrada del agente

Todo agente de codificación con IA viene con memoria integrada — Claude Code tiene `MEMORY.md`, Cursor tiene notepads, Cline tiene memory bank. Funcionan como notas adhesivas. agentmemory es la base de datos buscable que hay detrás de esas notas adhesivas.

| | Integrada (CLAUDE.md) | agentmemory |
|---|---|---|
| Escala | tope de 200 líneas | Ilimitado |
| Búsqueda | Carga todo en contexto | BM25 + vector + graph (solo top-K) |
| Coste en tokens | 22K+ con 240 observaciones | ~1.900 tokens (92% menos) |
| Cross-agent | Ficheros por agente | MCP + REST (cualquier agente) |
| Coordinación | Ninguna | Leases, signals, actions, routines |
| Observabilidad | Lectura manual de ficheros | Visor en tiempo real en :3113 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="Cómo funciona" height="32" /></picture></h2>

### Pipeline de memoria

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

### Consolidación de memoria en 4 niveles

Inspirada en cómo el cerebro humano procesa la memoria — no muy diferente de la consolidación del sueño.

| Nivel | Qué | Analogía |
|------|------|---------|
| **Working** | Observaciones crudas a partir del uso de tools | Memoria a corto plazo |
| **Episodic** | Resúmenes de sesión comprimidos | "Qué pasó" |
| **Semantic** | Hechos y patrones extraídos | "Lo que sé" |
| **Procedural** | Workflows y patrones de decisión | "Cómo hacerlo" |

Las memorias decaen con el tiempo (curva de Ebbinghaus). Las memorias accedidas con frecuencia se refuerzan. Las memorias obsoletas se evictan automáticamente. Las contradicciones se detectan y resuelven.

### Qué se captura

| Hook | Captura |
|------|----------|
| `SessionStart` | Ruta de proyecto, ID de sesión |
| `UserPromptSubmit` | Prompts del usuario (con filtro de privacidad) |
| `PreToolUse` | Patrones de acceso a ficheros + contexto enriquecido |
| `PostToolUse` | Nombre de la tool, entrada, salida |
| `PostToolUseFailure` | Contexto del error |
| `PreCompact` | Re-inyecta memoria antes de la compactación |
| `SubagentStart/Stop` | Ciclo de vida de sub-agentes |
| `Stop` | Resumen de fin de sesión |
| `SessionEnd` | Marcador de sesión completa |

### Capacidades clave

| Capacidad | Descripción |
|---|---|
| **Captura automática** | Cada uso de tool registrado vía hooks — esfuerzo manual cero |
| **Búsqueda semántica** | BM25 + vector + grafo de conocimiento con fusión RRF |
| **Evolución de memoria** | Versionado, supersesión, grafos de relaciones |
| **Auto-olvido** | Expiración por TTL, detección de contradicciones, evicción por importancia |
| **Privacy first** | API keys, secretos y etiquetas `<private>` se eliminan antes del almacenado |
| **Self-healing** | Circuit breaker, cadena de fallback de proveedores, monitorización de salud |
| **Puente Claude** | Sincronización bidireccional con MEMORY.md |
| **Grafo de conocimiento** | Extracción de entidades + recorrido BFS |
| **Memoria de equipo** | Espacios compartidos y privados con namespace por miembro |
| **Provenance de citas** | Traza cualquier memoria de vuelta a las observaciones origen |
| **Snapshots de Git** | Versiona, revierte y diffea el estado de memoria |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Búsqueda" height="32" /></picture></h2>

Recuperación de triple stream combinando tres señales:

| Stream | Qué hace | Cuándo |
|---|---|---|
| **BM25** | Coincidencia por palabras con stemming y expansión de sinónimos | Siempre activo |
| **Vector** | Similitud coseno sobre embeddings densos | Proveedor de embeddings configurado |
| **Graph** | Recorrido del grafo de conocimiento vía coincidencia de entidades | Entidades detectadas en la consulta |

Fusionado con Reciprocal Rank Fusion (RRF, k=60) y diversificado por sesión (máximo 3 resultados por sesión).

BM25 tokeniza griego, cirílico, hebreo, árabe y latín con tildes de serie. Para memorias en chino / japonés / coreano, instala los segmentadores opcionales (`npm install @node-rs/jieba tiny-segmenter`) para partir los runs CJK en tokens a nivel de palabra; sin ellos, agentmemory hace soft-fallback a tokenización por run completo y muestra una pista única en stderr.

### Proveedores de embedding

agentmemory autodetecta tu proveedor. Para mejores resultados, instala embeddings locales (gratis):

```bash
npm install @xenova/transformers
```

| Proveedor | Modelo | Coste | Notas |
|---|---|---|---|
| **Local (recomendado)** | `all-MiniLM-L6-v2` | Gratis | Offline, +8pp de recall sobre BM25-only |
| Gemini | `gemini-embedding-001` | Free tier | 100+ idiomas, 768/1536/3072 dims (MRL), entrada de 2048 tokens. Sustituye a `text-embedding-004` ([deprecado, cierre el 14 ene 2026](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | Máxima calidad |
| Voyage AI | `voyage-code-3` | De pago | Optimizado para código |
| Cohere | `embed-english-v3.0` | Trial gratis | Uso general |
| OpenRouter | Cualquier modelo | Varía | Proxy multi-modelo |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="Servidor MCP" height="32" /></picture></h2>

53 tools, 6 recursos, 3 prompts y 4 skills — el toolkit MCP de memoria más completo para cualquier agente.

> **Shim MCP vs servidor completo:** el paquete publicado `@agentmemory/mcp` es un shim ligero. Expone la superficie completa de 51 tools **solo cuando puede alcanzar un servidor agentmemory en ejecución** vía `AGENTMEMORY_URL` (modo proxy). Sin servidor accesible, el shim cae a un set local de 7 tools (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). La variable de entorno `AGENTMEMORY_TOOLS=core|all` es un flag *del lado del servidor* — definirla en el bloque `env` del shim no tiene efecto. Si ves solo 7 tools en Cursor / OpenCode / Gemini CLI, arranca `npx @agentmemory/agentmemory` (o la stack Docker) y define `AGENTMEMORY_URL=http://localhost:3111`.

### 51 Tools

<details>
<summary>Tools principales (siempre disponibles)</summary>

| Tool | Descripción |
|------|-------------|
| `memory_recall` | Busca observaciones pasadas |
| `memory_compress_file` | Comprime ficheros markdown preservando la estructura |
| `memory_save` | Guarda un insight, decisión o patrón |
| `memory_patterns` | Detecta patrones recurrentes |
| `memory_smart_search` | Búsqueda híbrida semántica + por palabras |
| `memory_file_history` | Observaciones pasadas sobre ficheros concretos |
| `memory_sessions` | Lista sesiones recientes |
| `memory_timeline` | Observaciones cronológicas |
| `memory_profile` | Perfil de proyecto (conceptos, ficheros, patrones) |
| `memory_export` | Exporta todos los datos de memoria |
| `memory_relations` | Consulta el grafo de relaciones |

</details>

<details>
<summary>Tools extendidas (51 en total — define AGENTMEMORY_TOOLS=all)</summary>

| Tool | Descripción |
|------|-------------|
| `memory_patterns` | Detecta patrones recurrentes |
| `memory_timeline` | Observaciones cronológicas |
| `memory_relations` | Consulta el grafo de relaciones |
| `memory_graph_query` | Recorrido del grafo de conocimiento |
| `memory_consolidate` | Ejecuta la consolidación de 4 niveles |
| `memory_claude_bridge_sync` | Sincroniza con MEMORY.md |
| `memory_team_share` | Comparte con miembros del equipo |
| `memory_team_feed` | Elementos compartidos recientes |
| `memory_audit` | Pista de auditoría de operaciones |
| `memory_governance_delete` | Borrado con pista de auditoría |
| `memory_snapshot_create` | Snapshot versionado en Git |
| `memory_action_create` | Crea ítems de trabajo con dependencias |
| `memory_action_update` | Actualiza estado de una action |
| `memory_frontier` | Actions desbloqueadas, ordenadas por prioridad |
| `memory_next` | La única acción más importante a continuación |
| `memory_lease` | Leases exclusivos de actions (multiagente) |
| `memory_routine_run` | Instancia rutinas de workflow |
| `memory_signal_send` | Mensajería entre agentes |
| `memory_signal_read` | Lee mensajes con acuse de recibo |
| `memory_checkpoint` | Gates de condiciones externas |
| `memory_mesh_sync` | Sincronización P2P entre instancias |
| `memory_sentinel_create` | Watchers dirigidos por eventos |
| `memory_sentinel_trigger` | Dispara sentinels desde fuera |
| `memory_sketch_create` | Grafos de actions efímeros |
| `memory_sketch_promote` | Promociona a permanente |
| `memory_crystallize` | Compacta cadenas de actions |
| `memory_diagnose` | Health checks |
| `memory_heal` | Repara automáticamente estado atascado |
| `memory_facet_tag` | Tags dimension:value |
| `memory_facet_query` | Consulta por tags de facet |
| `memory_verify` | Traza provenance |

</details>

### 6 Recursos · 3 Prompts · 4 Skills

| Tipo | Nombre | Descripción |
|------|------|-------------|
| Resource | `agentmemory://status` | Salud, conteo de sesiones, conteo de memorias |
| Resource | `agentmemory://project/{name}/profile` | Inteligencia por proyecto |
| Resource | `agentmemory://memories/latest` | Las 10 memorias activas más recientes |
| Resource | `agentmemory://graph/stats` | Estadísticas del grafo de conocimiento |
| Prompt | `recall_context` | Búsqueda + devuelve mensajes de contexto |
| Prompt | `session_handoff` | Datos de traspaso entre agentes |
| Prompt | `detect_patterns` | Analiza patrones recurrentes |
| Skill | `/recall` | Busca en memoria |
| Skill | `/remember` | Guarda en memoria a largo plazo |
| Skill | `/session-history` | Resúmenes recientes de sesiones |
| Skill | `/forget` | Borra observaciones/sesiones |

### MCP standalone

Ejecútalo sin el servidor completo — para cualquier cliente MCP. Cualquiera de estos funciona:

```bash
npx -y @agentmemory/agentmemory mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

O añádelo a la configuración MCP de tu agente:

La mayoría de los agentes (Cursor, Claude Desktop, Cline, Roo Code, Windsurf, Gemini CLI):
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

Fusiona la entrada `agentmemory` en el objeto `mcpServers` existente del host en lugar de reemplazar el fichero. Para clientes en sandbox que no pueden alcanzar el `localhost` del host, añade `"AGENTMEMORY_FORCE_PROXY": "1"` al bloque env y define `AGENTMEMORY_URL` a una ruta a la que el sandbox sí pueda llegar.

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

Copia el fichero del plugin desde el repo:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Visor en tiempo real" height="32" /></picture></h2>

Se inicia automáticamente en el puerto `3113`. Stream de observaciones en vivo, explorador de sesiones, navegador de memoria, visualización del grafo de conocimiento y dashboard de salud.

```bash
open http://localhost:3113
```

El servidor del visor se enlaza a `127.0.0.1` por defecto. El endpoint servido por REST `/agentmemory/viewer` sigue las reglas habituales de bearer-token `AGENTMEMORY_SECRET`. Las cabeceras CSP usan un nonce de script por respuesta y desactivan los atributos handler inline (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

El visor en `:3113` muestra lo que tu agente **recordó**. La [iii console](https://iii.dev/docs/console) muestra lo que tu agente **hizo** — cada operación de memoria como una traza OpenTelemetry, cada entrada KV editable, cada función invocable, cada stream tappable. Dos ventanas sobre la misma memoria: una con forma de producto, otra con forma de motor.

Mira cómo se dispara `memory_smart_search` y observa el escaneo BM25 → consulta de embedding → fusión RRF → reranker como un waterfall. Edita un temporizador de consolidación atascado en el navegador KV. Reproduce un hook `PostToolUse` con un payload ajustado. Fija el stream WebSocket y mira cómo aterrizan las observaciones en vivo.

agentmemory ofrece esto gratis porque cada función, trigger, scope de estado y stream es un primitivo de iii — nada custom, nada que instrumentar.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="Página Workers de iii console — workers conectados incluyendo instancias de agentmemory con conteo de funciones en vivo y metadatos de runtime" width="720" />
  <br/>
  <em>Página Workers: cada worker conectado — incluida agentmemory — con PID, conteo de funciones, runtime y last-seen.</em>
</p>

**Ya instalada.** La console se incluye con `iii` — sin instalador aparte.

**Lánzala junto a agentmemory:**

```bash
# agentmemory viewer holds port 3113, so run the console on 3114.
# Engine REST (3111), WebSocket (3112), and bridge (49134) defaults match agentmemory.
iii console --port 3114
```

Luego abre `http://localhost:3114`. Añade `--enable-flow` para la página experimental de grafo de arquitectura.

Sobrescribe endpoints del engine solo si los has movido:

```bash
iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**Qué puedes hacer desde la console:**

| Página | Úsala para |
|------|-----------|
| **Workers** | Ver todos los workers conectados y sus métricas en vivo — incluyendo el propio worker de agentmemory. |
| **Functions** | Invocar cualquier función de agentmemory directamente con un payload JSON — útil para probar `memory.recall`, `memory.consolidate`, `graph.query` sin cablear un cliente. |
| **Triggers** | Reproducir triggers HTTP, cron, event y state — disparar manualmente el cron de consolidación, reintentar una ruta HTTP, emitir un cambio de estado. |
| **States** | Navegador KV con CRUD completo — sesiones, slots de memoria, temporizadores del ciclo de vida, índice de embeddings — edita valores in-place. |
| **Streams** | Monitor WebSocket en vivo para escrituras de memoria, eventos de hooks y actualizaciones de observaciones a medida que fluyen por los streams de iii. |
| **Queues** | Topics de cola duraderas + gestión de dead-letter. Reproduce o descarta jobs fallidos de embedding / compresión. |
| **Traces** | Vistas OpenTelemetry waterfall / flame / desglose por servicio. Filtra por `trace_id` para ver exactamente qué funciones, llamadas a BD y peticiones de embedding produjo un único `memory.search`. |
| **Logs** | Logs OTEL estructurados, filtrados y correlados con trace/span IDs. |
| **Config** | Configuración de runtime — ve exactamente con qué workers, proveedores y puertos está ejecutando tu engine. |
| **Flow** | (Opcional, `--enable-flow`) Grafo de arquitectura interactivo de cada worker, trigger y stream. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="Vista de waterfall de trazas de iii console mostrando duración por span" width="720" />
  <br/>
  <em>Traces: waterfall / flame / desglose por servicio para cada operación de memoria.</em>
</p>

**Las trazas ya están activas:**

`iii-config.yaml` se sirve con el worker `iii-observability` habilitado (`exporter: memory`, `sampling_ratio: 1.0`, métricas + logs). No se necesita configuración adicional — desde el momento en que agentmemory arranca, cada operación de memoria emite una traza-span y un log estructurado que la console puede leer.

Si quieres exportar a Jaeger/Honeycomb/Grafana Tempo en su lugar, cambia `exporter: memory` por `exporter: otlp` y define el endpoint del collector según la documentación de observabilidad de iii.

> **Aviso:** la console en sí no impone auth — mantenla enlazada a `127.0.0.1` (por defecto) y nunca la expongas públicamente.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory **ya es una instancia [iii](https://iii.dev) en ejecución**. Funciones, triggers, estado KV, streams, trazas OTEL — todo son primitivos de iii. No has instalado Postgres, Redis, Express, pm2 ni Prometheus, porque iii los reemplaza.

Eso significa que un comando más extiende agentmemory con una capacidad completamente nueva.

### Extiende agentmemory con un comando

```bash
iii worker add iii-pubsub          # fan memory writes out to every connected instance
iii worker add iii-cron            # scheduled consolidation, decay sweeps, snapshot rotation
iii worker add iii-queue           # durable retries for embedding + compression jobs
iii worker add iii-observability   # OTEL traces on every memory op (default on)
iii worker add iii-sandbox         # run recalled code inside an isolated microVM
iii worker add iii-database        # swap in a SQL-backed state adapter
iii worker add mcp                 # generic MCP host alongside the agentmemory MCP
```

Cada `iii worker add` registra nuevas funciones y triggers en el mismo engine en el que agentmemory ya está corriendo. El visor y la console los detectan al instante — sin recargar, sin nueva integración, sin nuevo contenedor.

| `iii worker add` | Qué obtienes encima de agentmemory |
|---|---|
| [`iii-pubsub`](https://workers.iii.dev/workers/iii-pubsub) | Memoria multi-instancia: cada `remember` se difunde, cada `search` lee la unión |
| [`iii-cron`](https://workers.iii.dev/workers/iii-cron) | Ciclo de vida programado — consolidación nocturna, snapshots semanales, decaimiento en un reloj fijo |
| [`iii-queue`](https://workers.iii.dev/workers/iii-queue) | Reintentos duraderos: los jobs de embedding + compresión fallidos sobreviven al reinicio, sin observaciones perdidas |
| [`iii-observability`](https://workers.iii.dev/workers/iii-observability) | Trazas OTEL, métricas y logs en cada función — cableado en `iii-config.yaml` desde el primer día |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | El código salido de `memory_recall` corre dentro de una VM desechable, no en tu shell |
| [`iii-database`](https://workers.iii.dev/workers/iii-database) | Adaptador de estado respaldado por SQL cuando te quedas pequeño con el KV in-memory por defecto |
| [`mcp`](https://workers.iii.dev/workers/mcp) | Levanta servidores MCP adicionales junto al MCP de agentmemory, compartiendo el mismo engine |

Registro completo: [workers.iii.dev](https://workers.iii.dev). Cada worker allí se compone a través de los mismos primitivos que usa agentmemory — y el agentmemory que ya tienes es uno de ellos.

### Qué reemplaza iii

| Stack tradicional | agentmemory usa |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + índice vectorial in-memory |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | Supervisión de workers del iii engine |
| Prometheus / Grafana | iii OTEL + monitor de salud |
| Sistemas de plugins propios | `iii worker add <name>` |

**118 ficheros de código · ~21.800 LOC · 950+ tests · 123 funciones · 34 scopes KV** — todo sobre tres primitivos. No hay `agentmemory plugin install`. El sistema de plugins es iii mismo.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Configuración" height="32" /></picture></h2>

### Proveedores de LLM

agentmemory autodetecta desde tu entorno. Por defecto no se hacen llamadas LLM a menos que configures un proveedor o aceptes explícitamente el fallback de suscripción de Claude.

| Proveedor | Configuración | Notas |
|----------|--------|-------|
| **No-op (por defecto)** | Sin configuración | Compresión/resumen vía LLM DESACTIVADA. La compresión sintética BM25 + recall siguen funcionando. Mira `AGENTMEMORY_ALLOW_AGENT_SDK` más abajo si dependías del fallback de suscripción de Claude. |
| Anthropic API | `ANTHROPIC_API_KEY` | Facturación por token |
| MiniMax | `MINIMAX_API_KEY` | Compatible con Anthropic |
| Gemini | `GEMINI_API_KEY` | También habilita embeddings |
| OpenRouter | `OPENROUTER_API_KEY` | Cualquier modelo |
| Claude subscription fallback | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Solo opt-in. Lanza sesiones de `@anthropic-ai/claude-agent-sdk` — solía causar recursión sin límite en el Stop-hook (seguimiento de #149), por eso ya no es el comportamiento por defecto. |

### Selección de modelo con conciencia de coste

La compresión en background corre en cada observación, así que la elección de modelo cambia el gasto mensual de forma significativa. Datos de carga capturados: 635 peticiones / 888K tokens / 35 horas de uso activo, sobre tres modelos de OpenRouter con precios del 2026-05-23.

| Tier | Modelo | Input / 1M | Output / 1M | Coste para las 35h capturadas | Notas |
|------|-------|------------|-------------|---------------------------|-------|
| Recomendado | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | Calidad de compresión + resumen sólida a ~10× menos coste que Sonnet. |
| Recomendado | `deepseek/deepseek-chat` | $0.27 | $1.10 | ~$0.40 | Más antiguo pero aún correcto para cargas solo de compresión. |
| Recomendado | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | Buen razonamiento de código si tus sesiones son muy code-centric. |
| Premium | `anthropic/claude-sonnet-4.6` | $3.00 | $15.00 | ~$5.02 | Alta calidad pero caro para trabajo de background siempre activo. |
| Premium | `openai/gpt-4o` | $2.50 | $10.00 | ~$4.20 | Tier similar a Sonnet. |
| Evitar | `anthropic/claude-opus-4.6` | $15.00 | $75.00 | ~$25+ | Modelo de reasoning; sobrecoste enorme para compresión. |

agentmemory imprime un aviso en runtime cuando `OPENROUTER_MODEL` coincide con un patrón de tier premium. Define `AGENTMEMORY_SUPPRESS_COST_WARNING=1` para silenciarlo una vez que hayas tomado una decisión informada.

Trade-off de calidad vs coste en trabajo de memoria: la compresión es una tarea de resumen con un listón de calidad relativamente flexible (quien re-lee el resumen es el agente, no el usuario). DeepSeek-V4-Pro / Qwen3-Coder se quedan dentro del error de redondeo respecto a Sonnet en esta tarea, costando ~10× menos. Reserva los modelos de tier premium para las consultas que leas directamente.

Fuentes: [OpenRouter pricing for Sonnet 4.6](https://openrouter.ai/anthropic/claude-sonnet-4.6/pricing), [DeepSeek V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro), [DeepSeek pricing notes](https://api-docs.deepseek.com/quick_start/pricing/).

### Memoria multiagente (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

En montajes multiagente donde varios roles comparten un servidor agentmemory (architect / developer / reviewer / researcher / support-agent), `AGENT_ID` etiqueta cada escritura con el rol que la hizo. `AGENTMEMORY_AGENT_SCOPE` controla si el recall filtra por esa etiqueta.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

Dos modos:

| Modo | Etiqueta escrituras | Filtra recall | Cuándo usarlo |
|------|------------|---------------|-------------|
| `shared` (por defecto) | sí | no | Contexto cross-agent con pista de auditoría. El architect puede ver lo que el developer apuntó, pero cada fila registra quién lo dijo. |
| `isolated` | sí | sí | Separación estricta. El architect nunca ve observaciones / memorias / sesiones del developer. |

Qué se etiqueta cuando `AGENT_ID` está definido: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. El rol fluye `api::session::start` → `mem::observe` → `mem::compress` → KV.

Qué se filtra en modo isolated: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Cada endpoint acepta `?agentId=<role>` para sobreescribir por petición, y `?agentId=*` para optar por salir del scope del entorno por completo. `/memories` también acepta `?includeOrphans=true` para sacar memorias previas a AGENT_ID cuyo `agentId` es undefined.

Sobrescritura por llamada en la capa SDK / REST: cada endpoint que muta (`/session/start`, `/remember`) acepta un campo `agentId` en el body que gana frente al entorno. Útil para runtimes que enrutan muchos roles a un único proceso de servidor.

Cuando `AGENT_ID` no está definido, la memoria permanece sin scope (comportamiento legacy, sin etiquetas, sin filtros).

### Puertos

agentmemory + iii-engine enlazan cuatro puertos por defecto. Si un reinicio falla con `port in use`, esta tabla te dice qué proceso buscar.

| Puerto | Proceso | Propósito | Override por env |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | Worker de streams interno (consumido por agentmemory + visor) | `III_STREAMS_PORT` |
| `3113` | agentmemory | Visor en tiempo real (`http://localhost:3113`) | `AGENTMEMORY_VIEWER_PORT` |
| `49134` | iii-engine | WebSocket — los workers se registran aquí, la telemetría OTel fluye por encima | `III_ENGINE_URL` (URL completa, por defecto `ws://localhost:49134`) |

Limpieza de procesos zombi cuando los puertos quedan ocupados tras una ejecución crasheada:

```bash
# macOS / Linux — find whatever is on each port and kill it
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` recoge limpiamente tanto el worker como el pidfile del engine en un shutdown graceful (#640, #474). La limpieza manual de arriba solo aplica al caso post-crash en el que no queda ningún pidfile.

### Fichero de configuración

Coloca la configuración de runtime de agentmemory en `~/.agentmemory/.env` en lugar de exportar variables en cada shell. Si el visor muestra una pista de setup tipo `export ANTHROPIC_API_KEY=...`, cópiala a este fichero como `ANTHROPIC_API_KEY=...` sin el prefijo `export`, y reinicia agentmemory.

Las variables de entorno del proceso siguen funcionando y tienen prioridad sobre los valores del fichero.

En Windows, el mismo fichero vive en `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

Para probar con una suscripción Claude Code Pro/Max en lugar de una API key, acepta opt-in explícito:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

Activa graph o consolidation en el mismo fichero si las quieres:

```env
GRAPH_EXTRACTION_ENABLED=true
CONSOLIDATION_ENABLED=true
```

### Variables de entorno

Crea `~/.agentmemory/.env`:

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

124 endpoints en el puerto `3111`. La REST API se enlaza a `127.0.0.1` por defecto. Los endpoints protegidos requieren `Authorization: Bearer <secret>` cuando `AGENTMEMORY_SECRET` está definido, y los endpoints de mesh sync requieren `AGENTMEMORY_SECRET` en ambos peers.

<details>
<summary>Endpoints principales</summary>

| Method | Path | Descripción |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Health check (siempre público) |
| `POST` | `/agentmemory/session/start` | Inicia sesión + obtiene contexto |
| `POST` | `/agentmemory/session/end` | Finaliza sesión |
| `POST` | `/agentmemory/observe` | Captura observación |
| `POST` | `/agentmemory/smart-search` | Búsqueda híbrida |
| `POST` | `/agentmemory/context` | Genera contexto |
| `POST` | `/agentmemory/remember` | Guarda en memoria a largo plazo |
| `POST` | `/agentmemory/forget` | Borra observaciones |
| `POST` | `/agentmemory/enrich` | Contexto de fichero + memorias + bugs |
| `GET` | `/agentmemory/profile` | Perfil de proyecto |
| `GET` | `/agentmemory/export` | Exporta todos los datos |
| `POST` | `/agentmemory/import` | Importa desde JSON |
| `POST` | `/agentmemory/graph/query` | Consulta del grafo de conocimiento |
| `POST` | `/agentmemory/team/share` | Comparte con el equipo |
| `GET` | `/agentmemory/audit` | Pista de auditoría |

Lista completa de endpoints: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Desarrollo" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 950+ tests
npm run test:integration  # API tests (requires running services)
```

**Requisitos previos:** Node.js >= 20, [iii-engine](https://iii.dev/docs) o Docker

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="Licencia" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
