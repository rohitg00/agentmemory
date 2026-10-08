<p align="center">
  <img src="../assets/banner.png" alt="agentmemory: persistent memory for AI coding agents" width="720" />
</p>

<p align="center">
  <strong>
    Kodeagenten din husker alt. Ikke forklar alt på nytt.
    Bygget på <a href="https://github.com/iii-hq/iii">iii-motoren</a>
  </strong><br/>
  Persistent hukommelse for Claude Code, GitHub Copilot CLI, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode, og enhver MCP-klient.
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1.6k%20stars%20%2F%20230%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Design doc: 1.6k stars / 230 forks on the gist" /></a>
</p>

<p align="center">
  <em>Gisten utvider Karpathys LLM Wiki-mønster med konfidens-scoring, livssyklus, kunnskapsgrafer og hybridsøk: agentmemory er implementasjonen.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentmemory/agentmemory"><img src="https://img.shields.io/npm/v/@agentmemory/agentmemory?color=CB3837&label=npm&style=for-the-badge&logo=npm" alt="npm version" /></a>
  <a href="https://github.com/rohitg00/agentmemory/actions"><img src="https://img.shields.io/github/actions/workflow/status/rohitg00/agentmemory/ci.yml?label=tests&style=for-the-badge&logo=github" alt="CI" /></a>
  <a href="https://github.com/rohitg00/agentmemory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rohitg00/agentmemory?color=blue&style=for-the-badge" alt="License" /></a>
  <a href="https://github.com/rohitg00/agentmemory/stargazers"><img src="https://img.shields.io/github/stars/rohitg00/agentmemory?style=for-the-badge&color=yellow&logo=github" alt="Stars" /></a>
</p>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-recall.svg"><img src="../assets/tags/stat-recall.svg" alt="95.2% retrieval R@5" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tokens.svg"><img src="../assets/tags/stat-tokens.svg" alt="92% fewer tokens" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="54 MCP tools" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 auto hooks" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="0 external DBs" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="2,600+ tests passing" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="agentmemory demo" width="720" />
</p>

<p align="center">
  <a href="#install">Installasjon</a> &bull;
  <a href="#quick-start">Hurtigstart</a> &bull;
  <a href="#benchmarks">Ytelsestester</a> &bull;
  <a href="#vs-competitors">vs konkurrenter</a> &bull;
  <a href="#works-with-every-agent">Agenter</a> &bull;
  <a href="#how-it-works">Hvordan det fungerer</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Viewer</a> &bull;
  <a href="#powered-by-iii">Drevet av iii</a> &bull;
  <a href="#configuration">Konfigurasjon</a> &bull;
  <a href="#api">API</a>
</p>

---

## Install

Krav:

- Node.js 20 eller nyere med npm og npx (`node -v`, `npm -v`, og `npx -v`).
- Automatisk installasjon av iii-engine på macOS/Linux krever også `curl`, en POSIX-`sh`, og `tar`. Minimale images som `node:20-slim` har ikke nødvendigvis disse.
- Native Windows krever at den fastlåste iii-engine v0.22.1 `iii.exe` installeres manuelt. WSL2 eller Docker Desktop er de andre støttede veiene.

Den kanoniske kommandoen for en fersk installasjon:

```bash
npx -y @agentmemory/agentmemory@latest
```

Den første kjøringen er et interaktivt oppsett: velg hvilke agenter som skal kobles til (Claude Code, Cursor, Codex, Gemini CLI, OpenCode, ...), velg en LLM-leverandør eller fortsett nøkkelfritt, og den fyller ut konfigurasjonen, starter minneserveren og dens fastlåste iii-engine, og tilbyr å installere globalt slik at den rene `agentmemory`-kommandoen fungerer overalt etterpå. `-y` godtar npx' pakkespørsmål og `@latest` unngår en utdatert, cachet utgivelse. En leverandør gjør LLM-funksjoner tilgjengelige, men LLM-skrevet observasjonskomprimering starter først når `AGENTMEMORY_AUTO_COMPRESS=true` også er satt.

Nøkkelfri modus deaktiverer vektor-embeddings. `memory_recall` (stien `mem::search`) bruker BM25, mens `memory_smart_search` også kan slå sammen strukturelle grafmatcher når grafdata allerede finnes. For gratis semantisk gjenkalling på enheten, sett `EMBEDDING_PROVIDER=local` i `~/.agentmemory/.env` og start på nytt. Den første embedding-forespørselen laster ned `Xenova/all-MiniLM-L6-v2`; etter den innledende modellnedlastingen kjører inferensen lokalt.

Den lokale kjøretiden bruker fire porter: `3111` for REST/MCP HTTP, `3112` for iii-strømmer, `3113` for viewer, og `49134` for iii-worker-WebSocket. Persistent iii-tilstand lever i `~/Library/Application Support/agentmemory` på macOS, `$XDG_DATA_HOME/agentmemory` eller `~/.local/share/agentmemory` på Linux, og `%APPDATA%\agentmemory` på Windows. Bruk `--data-dir <path>` eller `AGENTMEMORY_DATA_DIR` for å overstyre dette, og bruk samme verdi ved hver omstart. For bakoverkompatibilitet går en eksisterende `./data/state_store.db` eller `./data/iii-config.yaml` foran plattformstandarden for instans 0; et uttrykkelig flagg eller miljøvariabel vinner likevel.

Deretter kan du bevise at gjenkalling fungerer og gi agenten din dens skills:

```bash
npx -y @agentmemory/agentmemory@latest demo  # seed eksempelsesjoner + utløs gjenkalling
npx skills add rohitg00/agentmemory -y   # 17 native skills slik at agenten din vet når den skal bruke hukommelsen
```

Nøkkelordsøkene bør gi treff i standard nøkkelfri modus via BM25. Demoens `database performance optimization`-søk er med vilje semantisk og kan returnere null treff før en embedding-leverandør er konfigurert.

Foretrekker du å la en kodeagent gjøre hele jobben? Gi den én instruksjon:

> Hent og følg instruksjonene på: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md

Koble til flere agenter når du vil med `agentmemory connect <agent>` — 20 adaptere er listet under [Works with every agent](#works-with-every-agent). Full kommandoreferanse under [Quick Start](#quick-start).

<details>
<summary><strong>Windows</strong></summary>

Den raskeste veien er WSL2. Oppsett av native Windows-engine krever at den fastlåste v0.22.1-ZIP-filen lastes ned og `iii.exe` pakkes ut manuelt; CLI-en pakker den ikke ut automatisk. Docker Desktop er også støttet. Se [Windows-notatene](#windows) for trinn-for-trinn-veiledning.

</details>

<details>
<summary><strong>Global installasjon / EACCES</strong></summary>

```bash
npm install -g @agentmemory/agentmemory@latest
```

npx-kommandoen over er fortsatt den kanoniske veien for en fersk installasjon og unngår tillatelsesproblemer med den globale prefiksen.

</details>

<details>
<summary><strong>npx serverer en gammel versjon</strong></summary>

npx cacher per versjon. Tvinge den nyeste med `npx -y @agentmemory/agentmemory@latest`, eller tøm cachen én gang med `rm -rf ~/.npm/_npx` (macOS/Linux; på Windows, slett `%LOCALAPPDATA%\npm-cache\_npx`).

</details>

<details>
<summary><strong>Kjører allerede din egen iii-engine</strong></summary>

agentmemory fastlåser iii-engine v0.22.1 og kobler seg ikke til en annen versjon (workeren kan ikke snakke en annen engines protokoll). Stopp den andre engine-instansen, og kjør deretter `npx -y @agentmemory/agentmemory@latest`. Den installerer og kjører den fastlåste v0.22.1 i `~/.agentmemory/bin`, uten å røre din egen `iii`.

</details>

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Works with every agent" height="32" /></picture></h2>

agentmemory fungerer med enhver agent som støtter hooks, MCP eller REST API. Alle agenter deler samme minneserver.

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
<sub>native plugin + 7 hooks + MCP</sub>
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
<sub>native plugin + MCP</sub>
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
<sub>MCP server</sub>
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
</table>

<p align="center">
  <sub>Fungerer med <strong>enhver</strong> agent som snakker MCP eller HTTP. Én server, minner delt mellom alle.</sub>
</p>

---

Du forklarer samme arkitektur hver sesjon. Du gjenoppdager de samme feilene. Du gjenlærer agenten de samme preferansene. Innebygd hukommelse (CLAUDE.md, .cursorrules) stopper ved 200 linjer og blir utdatert. agentmemory løser dette. Den fanger stille opp det agenten din gjør, komprimerer det til søkbar hukommelse, og injiserer riktig kontekst når neste sesjon starter. Én kommando. Fungerer over flere agenter.

**Hva som endrer seg:** I sesjon 1 setter du opp JWT-autentisering. I sesjon 2 ber du om rate limiting. Agenten vet allerede at autentiseringen din bruker jose-middleware i `src/middleware/auth.ts`, at testene dine dekker token-validering, og at du valgte jose over jsonwebtoken for Edge-kompatibilitet — uten at du må forklare det på nytt eller kopiere inn kode.

```bash
npx -y @agentmemory/agentmemory@latest
```

Som standard lagrer agentmemory iii-engine-tilstanden utenfor repoet du starter den fra: `~/Library/Application Support/agentmemory` på macOS, `$XDG_DATA_HOME/agentmemory` eller `~/.local/share/agentmemory` på Linux, og `%APPDATA%\agentmemory` på Windows. En eksisterende eldre `./data/state_store.db` eller `./data/iii-config.yaml` gjenbrukes for instans 0 før denne plattformstandarden. For å velge en plassering uttrykkelig, send `--data-dir <path>` eller sett `AGENTMEMORY_DATA_DIR`; begge uttrykkelige innstillinger går foran den eldre oppdagelsen:

```bash
npx -y @agentmemory/agentmemory@latest --data-dir ~/.agentmemory-projects/main
AGENTMEMORY_DATA_DIR=~/.agentmemory-projects/main npx -y @agentmemory/agentmemory@latest
```

Native og Docker-oppstarter bruker samme oppløste host-katalog; Docker monterer den på `/data`. `--instance 1` legger `instance-1` til den oppløste katalogen og velger den separate standard portkvartetten `3211/3212/3213/49234`.

Nyeste versjonsnotater: [CHANGELOG.md](../CHANGELOG.md).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Nøyaktighet ved gjenfinning

**coding-agent-life-v1** (eget korpus, reproduserbart i sandbox)

| Adapter | P@5 | R@5 | Topp-5-treffrate | p50-latens |
|---|---|---|---|---|
| **agentmemory hybrid** | **0.240** | **1.000** | **15 / 15** | 14 ms |
| grep-baseline | 0.227 | 0.967 | 15 / 15 | 0 ms |

100 % topp-5-treffrate ved **P@5-matematikktaket** for dette korpuset (0.240, se scorekortet). Hybrid finner hver gullsesjon; grep mister 1 av 2 gull på det flersesjons-temporale søket. Gevinsten er **recall + temporal**, ikke samlet presisjon. Denne ytelsestesten er liten og gull-sparsom; den større LongMemEval-S nedenfor skiller bedre. Full oppdeling per type + korrigeringsnotat: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 spørsmål)

| System | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| Kun BM25-fallback | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Tokenbesparelser

| Metode | Tokens/år | Kostnad/år |
|---|---|---|
| Lim inn full kontekst | 19.5M+ | Umulig (overskrider konteksten) |
| LLM-oppsummert | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + lokale embeddings | ~170K | **$0** |

</td>
</tr>
</table>

> Embedding-modell: `all-MiniLM-L6-v2` (lokal, gratis, ingen API-nøkkel). Fullstendige rapporter: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Konkurrentsammenligning: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) dekker agentmemory mot mem0, Letta, Khoj, supermemory, TencentDB Agent Memory, MemPalace, Zep/Graphiti, Cognee, Hippo.

**Reprodusér lokalt:** [`eval/README.md`](../eval/README.md), en adapter-plugbar harness for LongMemEval `_s` (offentlig 500 spørsmål) + `coding-agent-life-v1` (eget korpus på 15 sesjoner). Grep-, vektor- og agentmemory-adaptere scores side ved side, NDJSON-utdata, publiserte scorekort havner i [`docs/benchmarks/`](../docs/benchmarks/).

**Fungerer godt sammen med [codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything), og [Graphify](https://github.com/safishamsi/graphify).** Kodegrafindeksering, flerstegs byggepipeliner, og bredere kunnskapsgrafer over dokumenter/PDF-er/bilder/videoer. agentmemory husker arbeidet; disse tre prosjektene lyser opp resten av kontekstlaget. Oppskrifter + spørsmål-rutingstabell: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="vs Competitors" height="32" /></picture></h2>

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
<th>Innebygd (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Type</strong></td>
<td>Minnemotor + MCP-server</td>
<td>Minnelag-API</td>
<td>Fullstendig agent-runtime</td>
<td>Personlig AI</td>
<td>Minne-API + app</td>
<td>Team-minnehub (LLM-proxy)</td>
<td>Vektorminne (åpen kildekode)</td>
<td>Minnemotor (Oracle DB)</td>
<td>Minnesystem</td>
<td>Statisk fil</td>
</tr>
<tr>
<td><strong>Gjenfinning R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>Ikke tilgjengelig</td>
<td>Selvrapportert</td>
<td>PersonaMem 76% (selvrapportert)</td>
<td>~96.6% (selvrapportert)</td>
<td>94.4% (selvrapportert)</td>
<td>Ikke tilgjengelig</td>
<td>Ikke tilgjengelig (grep)</td>
</tr>
<tr>
<td><strong>Automatisk fangst</strong></td>
<td>12 hooks (ingen manuell innsats)</td>
<td>Manuelle <code>add()</code>-kall</td>
<td>Agenten redigerer selv</td>
<td>Manuelt</td>
<td>Uttrekk på API-siden</td>
<td>Proxy-avlytting (base-URL-bytte)</td>
<td>Manuelt</td>
<td>API-uttrekk</td>
<td>Manuelt</td>
<td>Manuell redigering</td>
</tr>
<tr>
<td><strong>Søk</strong></td>
<td>BM25 + vektor + graf (RRF-fusjon)</td>
<td>Vektor + graf</td>
<td>Vektor (arkiv)</td>
<td>Semantisk</td>
<td>Vektor + RAG</td>
<td>4 ressurstyper (Chat / Skill / Wiki / CodeGraph)</td>
<td>Kun vektor</td>
<td>Vektor + semantisk</td>
<td>Forfallsvektet</td>
<td>Laster alt inn i konteksten</td>
</tr>
<tr>
<td><strong>Flere agenter</strong></td>
<td>MCP + REST + leaser + signaler</td>
<td>API (ingen koordinering)</td>
<td>Kun innenfor Letta-runtime</td>
<td>Nei</td>
<td>Nei</td>
<td>Teamroller + delte ressurser</td>
<td>Nei</td>
<td>Kun avgrenset</td>
<td>Delt mellom flere agenter</td>
<td>Filer per agent</td>
</tr>
<tr>
<td><strong>Rammeverksbinding</strong></td>
<td>Ingen (enhver MCP-klient)</td>
<td>Ingen</td>
<td>Høy (må bruke Letta)</td>
<td>Frittstående</td>
<td>Ingen</td>
<td>Proxy fronter hvert modellkall</td>
<td>Ingen</td>
<td>Oracle Database</td>
<td>Ingen</td>
<td>Format per agent</td>
</tr>
<tr>
<td><strong>Eksterne avhengigheter</strong></td>
<td>Ingen (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + vektor-DB</td>
<td>Flere</td>
<td>Administrert sky</td>
<td>Docker-stack (Core + Hub + Proxy)</td>
<td>Vektorlager</td>
<td>Oracle AI Database</td>
<td>Ingen</td>
<td>Ingen</td>
</tr>
<tr>
<td><strong>Minnelivssyklus</strong></td>
<td>4-nivås konsolidering + forfall + automatisk glemming</td>
<td>Passivt uttrekk</td>
<td>Agent-administrert</td>
<td>Manuelt</td>
<td>Automatisk glemming</td>
<td>Manuell gjennomgang; automatisk ruting underveis</td>
<td>Ingen</td>
<td>Ikke angitt</td>
<td>Forfall + konsolidering</td>
<td>Manuell beskjæring</td>
</tr>
<tr>
<td><strong>Tokeneffektivitet</strong></td>
<td>~1 900 tokens/sesjon ($10/år)</td>
<td>Varierer med integrasjon</td>
<td>Kjerneminne i konteksten</td>
<td>Varierer</td>
<td>Skyprising</td>
<td>Ikke angitt</td>
<td>Ingen tokenbudsjett</td>
<td>LLM-basert (varierer)</td>
<td>Varierer</td>
<td>22K+ tokens ved 240 observasjoner</td>
</tr>
<tr>
<td><strong>Viewer i realtid</strong></td>
<td>Ja (port 3113)</td>
<td>Sky-dashbord</td>
<td>Sky-dashbord</td>
<td>Web-UI</td>
<td>Sky-dashbord</td>
<td>Hub-web-UI</td>
<td>Nei</td>
<td>Nei</td>
<td>Nei</td>
<td>Nei</td>
</tr>
<tr>
<td><strong>Selvhostet</strong></td>
<td>Ja (standard)</td>
<td>Valgfritt</td>
<td>Valgfritt</td>
<td>Ja</td>
<td>Nei (kun sky)</td>
<td>Ja (Docker)</td>
<td>Ja</td>
<td>Ja (Oracle DB)</td>
<td>Ja</td>
<td>Ja</td>
</tr>
</table>

<sub>Merk om ytelsestester: kun agentmemorys R@5 er vårt eget målte resultat (LongMemEval-S, reproduserbart fra <a href="../benchmark/COMPARISON.md"><code>benchmark/COMPARISON.md</code></a>). Tallene for mem0 og Letta er deres publiserte LoCoMo-tall (et annet datasett); tallene for MemPalace, supermemory, TencentDB (PersonaMem) og oracleagentmemory er leverandørers selvrapporterte påstander vi ikke har reprodusert selv (oracleagentmemorys kjøring brukte GPT-5.5 mot en Oracle AI Database). Vist side ved side kun som et grovt sammenligningsgrunnlag, ikke en direkte sammenligning på identiske data. Stjernetall er tilnærmede og endrer seg over tid.</sub>

**Nyere aktører** verdt å kjenne til, sammenlignet i detalj i [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md):

| System | ⭐ | Vinkling |
|--------|---|-------|
| Zep / Graphiti | 30K | Temporal kunnskapsgraf; de sterkeste publiserte resultatene på temporale søk (LongMemEval 63.8%), men grafen bygges asynkront så ferske fakta kan ligge etter |
| Cognee | 30K | Dokument-til-kunnskapsgraf-innlasting, kun Python, bygget for strukturert entitetsuttrekk snarere enn sesjonsfangst |

Ingen av disse fanger automatisk fra kodeagent-hooks, leverer en lokal-først viewer, eller kjører nøkkelfritt — kombinasjonen agentmemory er bygget rundt.

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Quick Start" height="32" /></picture></h2>

Kompatibilitet: denne utgivelsen bruker `iii-sdk` 0.22.1 og fastlåser iii-engine v0.22.1.

### Prøv det på 30 sekunder

```bash
# Terminal 1: start serveren
npx -y @agentmemory/agentmemory@latest

# Terminal 2: seed eksempeldata og se gjenkalling i praksis
npx -y @agentmemory/agentmemory@latest demo
```

`demo` seeder 3 realistiske sesjoner (JWT-autentisering, N+1-spørringsfiks, rate limiting) og kjører søk mot dem. Nøkkelfrie installasjoner deaktiverer vektorer, så nøkkelordsøkene i `mem::search` bør gi treff via BM25, mens `database performance optimization` kan returnere null treff. `smart-search` kan i tillegg returnere strukturelle grafmatcher når grafdata finnes. For å få det semantiske søket til å finne N+1-fiksen via vektorer, sett `EMBEDDING_PROVIDER=local`, start på nytt, og vent til den første modellnedlastingen er fullført.

Åpne `http://localhost:3113` for å se hukommelsen bygges opp live.

### Validere en fersk installasjon og persistens ved omstart

Med serveren i gang, valider REST, health, viewer, og den iii-baserte kjøretidsstatusen:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

Oppstartspanelet for "ready" dekker alle fire portene: REST/MCP HTTP på 3111, iii-strømmer på 3112, viewer på 3113, og iii-worker-WebSocket på 49134. `status` bekrefter agentmemorys helse og den aktive leverandør-/embedding-modusen. Lagre en probe og bekreft at den er søkbar:

```bash
curl -fsS -X POST http://localhost:3111/agentmemory/remember \
  -H 'Content-Type: application/json' \
  -d '{"content":"agentmemory restart persistence probe","concepts":["install-check"]}'

curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'Content-Type: application/json' \
  -d '{"query":"restart persistence probe","limit":5}'
```

Kjør deretter `npx -y @agentmemory/agentmemory@latest stop`, start den kanoniske kommandoen på nytt i Terminal 1, vent på `/agentmemory/livez`, og gjenta søket. Proben må fortsatt returneres. Hvis du valgte en egendefinert `--data-dir`, bruk samme katalog ved omstarten.

### Daglige kommandoer

Installasjon og oppsett er beskrevet i [Install](#install) over (den første kjøringen leder deg gjennom det). Til daglig bruk:

```bash
agentmemory                    # start serveren
agentmemory stop               # stopp den rent
agentmemory connect <agent>    # koble til en annen agent
agentmemory doctor             # interaktiv diagnostikk + forslag til fiks
agentmemory remove             # avinstaller alt vi opprettet
```

### Sesjonsavspilling

Hver sesjon agentmemory registrerer kan spilles av på nytt. Åpne viewer, velg fanen **Replay**, og spol gjennom tidslinjen: prompter, verktøykall, verktøyresultater og svar vises som separate hendelser med spill/pause, hastighetskontroll (0.5x til 4x), og tastatursnarveier (mellomrom for å veksle, piltaster for å gå trinn for trinn).

For å hente inn eldre Claude Code JSONL-transkripsjoner:

```bash
# Importer alt under standard ~/.claude/projects
npx -y @agentmemory/agentmemory@latest import-jsonl

# Eller importer én enkelt fil
npx -y @agentmemory/agentmemory@latest import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

Importerte sesjoner vises i Replay-velgeren side om side med native sesjoner. Under overflaten rutes hver oppføring gjennom iii-funksjonene `mem::replay::load`, `mem::replay::sessions`, og `mem::replay::import-jsonl`, uten noen sidekanal-servere. Hver importerte transkripsjon indekseres for søk, stemples med opprinnelseskanalen `import`, og bearbeides til en sesjonskrystall og læringspunkter.

> **Viktig hvis du bruker `import-jsonl` som din primære fangstvei:** Claude Codes `cleanupPeriodDays` (i `~/.claude/settings.json`, standard **30**) sletter automatisk JSONL-transkripsjoner eldre enn dette vinduet fra `~/.claude/projects/`. Hvis du installerer agentmemory ferskt på en Claude Code-historikk som er flere måneder gammel, er alt eldre enn 30 dager allerede borte før den første importen. Kjør enten `import-jsonl` via cron, sett `cleanupPeriodDays` høyere, eller koble til auto-fangst-hookene (standard installasjonsvei for plugin) slik at hver tur lander i agentmemory mens sesjonen er aktiv, og JSONL-ryddingen ikke lenger har betydning.

### Oppgradering / vedlikehold

Bruk vedlikeholdskommandoen når du med vilje vil oppdatere den lokale kjøretiden:

```bash
npx -y @agentmemory/agentmemory@latest upgrade
```

Advarsel: denne kommandoen endrer den nåværende arbeidsflaten/kjøretiden. Den kan oppdatere JavaScript-avhengigheter og hente det fastlåste `iiidev/iii:0.22.1`-Docker-imaget. Den installerer aldri en ufastlåst eller nyere iii-engine.

Implementasjonsdetaljer finnes i `src/cli.ts` (se `runUpgrade` rundt `src/cli.ts:544-595`).

### Claude Code (én blokk, lim den inn)

```text
Install agentmemory: run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server and its pinned iii engine. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 17 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 54 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113. Keyless mode disables vectors: `memory_recall` uses BM25, and `memory_smart_search` can also use existing structural graph data. Set `EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env` and restart to opt into on-device semantic recall.
```

#### Claude Code uten plugin-installasjon (MCP-frittstående vei)

Hvis du kobler agentmemorys MCP-server direkte gjennom `~/.claude.json` i stedet for å bruke `/plugin install`, løser Claude Code aldri opp `${CLAUDE_PLUGIN_ROOT}`, og du må peke hook-skriptene til absolutte stier i `~/.claude/settings.json`. Disse stiene bygger typisk inn agentmemory-versjonen (f.eks. `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.22/scripts/…`), så neste oppgradering knekker stille hver hook.

Løsning:

```bash
agentmemory connect claude-code --with-hooks
```

Dette slår sammen de samme hook-kommandoene inn i `~/.claude/settings.json` med absolutte stier løst opp mot den medfølgende `plugin/`-katalogen til den installerte `@agentmemory/agentmemory`-pakken. Kjør kommandoen på nytt etter at du har oppgradert agentmemory for å oppdatere stiene. Brukeroppføringer i samme fil bevares; kun tidligere agentmemory-oppføringer byttes ut. Å bruke `/plugin install`-veien er fortsatt den anbefalte metoden.
For eksterne eller beskyttede distribusjoner, start Claude Code med `AGENTMEMORY_URL` og `AGENTMEMORY_SECRET` satt. Pluginen sender begge verdiene videre til sin medfølgende MCP-server; når `AGENTMEMORY_URL` er tom, bruker MCP-shimmen `http://localhost:3111`.

### Codex CLI (Codex-plugin-plattformen)

```bash
# 1. start minneserveren i en separat terminal
npx -y @agentmemory/agentmemory@latest

# 2. registrer agentmemory-markedsplassen og installer pluginen
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Codex-pluginen leveres fra samme `plugin/`-katalog som Claude Code-pluginen. Den registrerer:

- En medfølgende stdio MCP-bro til den kjørende daemonen, uten npm-nedlasting eller fallback-lager. Se [den lokale Codex-veiledningen](../docs/plugins/codex-local.md) for å teste en build som ennå ikke er utgitt.
- 6 livssyklus-hooks: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 9 skills som kan kalles: `/recall`, `/remember`, `/session-history`, `/forget`, `/recap`, `/handoff`, `/lesson`, `/commit-context`, `/commit-history`, pluss 8 referanseskills agenten laster ved behov (minnedisiplin, MCP-verktøy, REST API, konfigurasjon, agenter, hooks, arkitektur, og skill-forfatterveiledningen)

Codex' hook-motor injiserer `CLAUDE_PLUGIN_ROOT` inn i hook-underprosesser (ifølge [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), så de samme hook-skriptene fungerer på begge verter uten duplisering. Subagent-/SessionEnd-/Notification-/TaskCompleted-/PostToolUseFailure-hendelser er kun for Claude Code og registreres ikke for Codex.

#### Codex-hooks: tillit og kompatibilitet

Native plugin-hook-utsendelse er verifisert med Codex CLI 0.150.1. Stol på plugin-hooksene før du forventer fangst. Desktop-oppførselen avhenger av dens medfølgende kjøretid; kontroller `/hooks` og bekreft en fanget hendelse før du aktiverer en løsning.

Hvis verten din krever globale hooks, speil kommandoene inn i `~/.codex/hooks.json`. Når MCP allerede er tilkoblet, trenger den nåværende adapteren `--force` for å nå hook-installasjonen:

```bash
agentmemory connect codex --with-hooks --force
```

Dette slår sammen globale hooks og skriver om agentmemory MCP-oppføringen, og bevarer urelaterte oppføringer. Gå gjennom eventuelle egendefinerte agentmemory-endepunktinnstillinger før du bruker `--force`. Kjør på nytt etter oppgradering for å oppdatere skriptstiene. Aktiver enten native plugin-hooks eller globale kopier for å unngå duplisert fangst.

### GitHub Copilot CLI

For VS Code agent-modus, bruk [Copilot MCP- og auto-fangst-veiledningen](../docs/plugins/copilot.md#vs-code-copilot-local-agent-sessions). CLI-adapteren konfigurerer ikke VS Code.

```bash
# Kun MCP-tilkobling
agentmemory connect copilot-cli

# Alternativt, full hooks/skills-plugin fra GitHub-undermappen
copilot plugin install rohitg00/agentmemory:plugin
```

`agentmemory connect copilot-cli` slår sammen `mcpServers.agentmemory` inn i `~/.copilot/mcp-config.json` (eller `$COPILOT_HOME/mcp-config.json` når `COPILOT_HOME` er satt) og bevarer eksisterende servere. På native Windows er dette den eneste automatiserte `connect`-adapteren; konfigurer alle andre native Windows-agenter manuelt. WSL-`connect` er kun støttet når målagenten også er installert i samme WSL-miljø. Installer også pluginen når du vil ha hele hook-/skill-opplevelsen.

<details>
<summary><b>OpenClaw (lim inn denne prompten)</b></summary>

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

Full veiledning: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (lim inn denne prompten)</b></summary>

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

Full veiledning: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Andre agenter

Start minneserveren: `npx -y @agentmemory/agentmemory@latest`

#### Native skills via `npx skills add` (50+ agenter)

agentmemory leveres med 17 skills i Claude-Code-stilens `<dir>/SKILL.md`-format: 9 skills som kan kalles (`remember`, `recall`, `recap`, `handoff`, `forget`, `lesson`, `commit-context`, `commit-history`, `session-history`) og 8 referanseskills agenten laster ved behov (`memory-discipline`, `agentmemory-mcp-tools`, `agentmemory-rest-api`, `agentmemory-config`, `agentmemory-agents`, `agentmemory-hooks`, `agentmemory-architecture`, `write-agentmemory-skill`). Referanseskillene har datatabeller generert fra kildekoden, så de aldri går ut av synk. CLI-en [`skills`](https://npmjs.com/package/skills) fra vercel-labs installerer dem automatisk inn i den kallende agentens native skill-katalog over 50+ agenter (Claude Code, Cursor, Cline, Continue, Droid, Warp, Codex, Antigravity, Kiro, OpenCode, Goose, Roo, Trae, Windsurf, med flere):

```bash
npx skills add rohitg00/agentmemory -y          # oppdager den kallende agenten automatisk
npx skills add rohitg00/agentmemory -y -a warp  # uttrykkelig agent
npx skills add rohitg00/agentmemory -y -a '*'   # installer til hver installerte agent
```

Dette er **utfyllende** til `agentmemory connect <agent>`:

- `agentmemory connect <agent>` skriver MCP-serverkonfigurasjonen slik at verktøyene er tilgjengelige.
- `npx skills add rohitg00/agentmemory` installerer skillene slik at agenten vet når den skal kalle dem.

For de få agentene skills-CLI-en ikke dekker ennå (Zed v1.3.x og eldre), legg de 17 SKILL.md-filene manuelt under agentens native skill-katalog; samme format fungerer overalt.

#### Standard MCP-blokk

agentmemory-oppføringen er **samme MCP-server-blokk** på tvers av alle verter som bruker `mcpServers`-formen (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI, OpenClaw):

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

**Slå denne oppføringen sammen med det eksisterende `mcpServers`-objektet** i vertens konfigurasjonsfil; ikke erstatt filen. Hvis filen allerede har andre servere, legg til `agentmemory` ved siden av dem som en ny nøkkel inne i `mcpServers`. Hvis `mcpServers` mangler helt, lim inn blokken inne i `{ "mcpServers": { ... } }`. `${VAR}`-plassholderne arver `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` fra skallet når MCP-serveren starter; usatte variabler gir tomme strenger og shimmen faller tilbake til `http://localhost:3111`. Én tilkoblet oppføring dekker både lokale og eksterne (k8s / reverse-proxy) distribusjoner.

| Agent | Konfigurasjonsfil | Merknader |
|---|---|---|
| **Cursor (kun MCP)** | `~/.cursor/mcp.json` | Slå sammen inn i `mcpServers`, eller `agentmemory connect cursor`. Et direktelink med ett klikk er også tilgjengelig på nettsiden. |
| **Cursor (full plugin)** | `.cursor-plugin/` | Oppføring på Cursor Marketplace (innsending under vurdering) eller Cursor Settings → Plugins → lokalt sjekket ut. Registrerer 7 auto-fangst-hooks (sessionStart, beforeSubmitPrompt, preToolUse, postToolUse, postToolUseFailure, stop, sessionEnd) + 17 skills + MCP-serveren, med `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` administrert i Cursors plugin-dashbord. Fungerer i Cursor-IDE-en og `cursor-agent`-CLI-en; CLI-ens print-modus-prompter fylles etterpå inn fra sesjonstranskripsjonen når sesjonen avsluttes. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Slå sammen inn i `mcpServers`. Start Claude Desktop på nytt etter redigering. |
| **Cline / Roo Code / Kilo Code** | Clines MCP-innstillinger (Settings-UI → MCP Servers → Edit) | Samme `mcpServers`-blokk. |
| **Devin CLI (MCP + hooks)** | `~/.config/devin/config.json` | `agentmemory connect devin` slår sammen MCP-oppføringen; `--with-hooks` legger til seks native auto-fangst-hooks (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd) med Devins små bokstaver i verktøymatcherne. Verifiser med `devin mcp list` og `/hooks` inne i devin. |
| **Devin CLI (full plugin)** | `plugin/.devin-plugin/` | `devin plugins install ./plugin` fra et checkout registrerer alle 17 skills som `/agentmemory:<skill>`-slash-kommandoer pluss MCP-serveren. Devins plugin-hooks kan ikke utløse `SessionStart`/`SessionEnd`, så kombiner den med `connect devin --with-hooks` for full sesjonsfangst. |
| **Devin (sky)** | Settings → Connections → MCP servers | Legg til en egendefinert MCP (STDIO): kommando `npx`, argumenter `-y @agentmemory/mcp@latest`, miljøvariabel `AGENTMEMORY_URL` pekende på en nettverksnåbar agentmemory-distribusjon pluss `AGENTMEMORY_SECRET` (sky-sesjoner kan ikke nå localhost — se [`deploy/`](../deploy/)). Lagre hemmeligheten i Devin Secrets, og bruk deretter "Test listing tools" for å verifisere at alle 54 verktøyene vises. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (slås sammen automatisk). |
| **GitHub Copilot CLI (kun MCP)** | `~/.copilot/mcp-config.json` | `agentmemory connect copilot-cli` slår sammen `mcpServers.agentmemory`; Copilot plukker det opp ved neste oppstart eller `/mcp`. |
| **GitHub Copilot CLI (full plugin)** | Copilot plugin-installasjon | `copilot plugin install rohitg00/agentmemory:plugin` for pluginen fra GitHub-undermappen. |
| **OpenClaw** | OpenClaw MCP-konfigurasjon | Samme `mcpServers`-blokk. Dypere: `openclaw plugins install ./integrations/openclaw` tar over OpenClaws minneplass (bytter automatisk fra `memory-core`); sett `plugins.entries.agentmemory.hooks.allowConversationAccess=true`, ellers blokkeres turfangsten stille. Se [`integrations/openclaw`](../integrations/openclaw/). |
| **Codex CLI (kun MCP)** | `.codex/config.toml` | TOML-form: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, eller legg til `[mcp_servers.agentmemory]` manuelt. |
| **Codex CLI (full plugin)** | Codex plugin-markedsplass | `codex plugin marketplace add rohitg00/agentmemory` deretter `codex plugin add agentmemory@agentmemory`. Registrerer MCP + 6 livssyklus-hooks + 17 skills. Stol på hooks og bekreft fangst på verten din; se [Codex-oppsett og validering](../docs/plugins/codex-local.md). |
| **OpenCode (kun MCP)** | `opencode.json` | Annen form: toppnivå-nøkkelen `mcp`, kommando som array: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (full plugin)** | `plugin/opencode/` | 22 auto-fangst-hooks som dekker sesjonslivssyklus, meldinger, verktøy, feil. Prosjekttilskrivning er per sesjon, så én OpenCode-prosess som spenner over flere repoer registrerer hver sesjon under sitt eget prosjekt. To slash-kommandoer (`/recall`, `/remember`). Kopier `plugin/opencode/` inn i OpenCode-arbeidsområdet ditt og legg plugin-oppføringen til `opencode.json`. Se [`plugin/opencode/README.md`](../plugin/opencode/README.md) for hele hook-tabellen + gap-analysen. |
| **pi** | `~/.pi/agent/extensions/agentmemory` | `agentmemory connect pi` installerer den medfølgende utvidelsen inn i pi-ens auto-oppdagelseskatalog (gjenkalling ved agentstart, fangst ved agentslutt, verktøyene `memory_search` / `memory_save` / `memory_health`, `/agentmemory-status`). `/reload` i en kjørende pi plukker den opp. [`integrations/pi`](../integrations/pi/) er også en pi-pakke (`pi install ./integrations/pi` fra et checkout). |
| **Hermes Agent** | `~/.hermes/config.yaml` | `cp -r integrations/hermes ~/.hermes/plugins/agentmemory` + `memory.provider: agentmemory` gir 6-hook-minneleverandøren (prefetch, turfangst, sesjonsslutt, pre-compress, MEMORY.md-speiling, systemprompt-blokk). Valider med `hermes plugins doctor` og `hermes memory status`. Se [`integrations/hermes`](../integrations/hermes/). |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` skriver standard `mcpServers`-blokk. Hook-nyttelasten er feltkompatibel med Claude Code, så de eksisterende 12-hook-skriptene fungerer uten endring; koble dem til via `hooks`-delen i samme `settings.json`. |
| **Antigravity IDE / 2.0** | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity --with-hooks` installerer MCP og fangst-hooks i den delte tilpasningskatalogen. Se [Antigravity-oppsett og begrensninger](../docs/plugins/antigravity.md). |
| **Antigravity CLI** (`agy`) | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity-cli --with-hooks` bruker samme MCP- og hook-konfigurasjon som nåværende IDE-versjoner. Eksisterende installasjoner bør oppdateres med `--force`; se [oppgraderingsnotatene](../docs/plugins/antigravity.md). |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` skriver brukernivå-konfigurasjonen. Arbeidsområde-overstyringer går i `.kiro/settings/mcp.json` ved siden av koden din. |
| **Warp** | `~/.warp/.mcp.json` | `agentmemory connect warp` skriver standard `mcpServers`-blokk. Warp oppdager også automatisk skills fra `.claude/skills/`; når Claude Code-pluginen er installert vises de 8 agentmemory-skillene (`remember`, `recall`, `recap`, `handoff`, `forget`, `commit-context`, `commit-history`, `session-history`) naturlig i Warps slash-kommando-palett. |
| **Cline (CLI)** | `~/.cline/mcp.json` | `agentmemory connect cline` skriver standard `mcpServers`-blokk. VS Code-utvidelsesbrukere: lim inn samme blokk via Cline Settings → MCP Servers → Edit JSON. |
| **Continue.dev** | `~/.continue/config.yaml` (foretrukket) eller `config.json` (eldre) | `agentmemory connect continue` oppretter `config.yaml` fra grunnen når ingen av dem finnes, eller endrer en eksisterende `config.json`. **Hvis du allerede har `config.yaml`** skriver adapteren ut den eksakte blokken som skal limes inn under `mcpServers:`; den overskriver ikke yaml-filen din stille, fordi det å bevare kommentarer og ankre trygt krever en YAML-parser pakken ikke leverer. Continue bruker array-form (ikke objekt) for `mcpServers`. |
| **Zed** | `~/.config/zed/settings.json` | `agentmemory connect zed` skriver under `context_servers` (Zeds nøkkel, IKKE `mcpServers`). Eksterne MCP-servere kan kobles til via `{"url": "..."}` i stedet. |
| **Droid (Factory.ai)** | `~/.factory/mcp.json` | `agentmemory connect droid` skriver standard `mcpServers`-blokk. Prosjektavgrensede overstyringer går i `<repo>/.factory/mcp.json`. Send `--with-hooks` for native auto-fangst. |
| **DeepSeek Harness** | `$DSH_HOME/cordis.patch.yml` | `agentmemory connect dsh` legger til en `@deepseek-ai/dsh-mcp-client`-rad i patch-laget på hjemmenivå som hver Harness-profil laster; verktøy registreres som `mcp__agentmemory__*`. Send `--with-hooks` for også å koble til auto-fangst: de medfølgende Claude Code-hook-skriptene kjører gjennom Harnessens egen `@deepseek-ai/dsh-hooks-claude-code`-bro (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) via et manifest skrevet til `$DSH_HOME/agentmemory.hooks.json`. Standard er `~/.dsh` når `DSH_HOME` ikke er satt. |
| **Goose** | Gooses MCP-innstillings-UI | Samme `mcpServers`-blokk; bruk `goose configure` → Add Extension → MCP. Direkte YAML-redigering ved `~/.config/goose/config.yaml` er støttet, men skjemaet bruker `extensions:` + `cmd` (ikke `mcpServers:` + `command`). |
| **Aider** | n/a | Snakk direkte med REST-API-en: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`. |
| **Enhver agent (32+)** | n/a | `npx skillkit install agentmemory` oppdager verten automatisk og slår sammen. |

**Sandkasse-MCP-klienter** (Flatpak / Snap / restriktive containere) som ikke kan nå vertens `localhost`: sett også `"AGENTMEMORY_FORCE_PROXY": "1"` i `env`-blokken, og pek `AGENTMEMORY_URL` mot en rute sandkassen faktisk kan nå (f.eks. din LAN-IP).

### Programmatisk tilgang (Python / Rust / Node)

agentmemory registrerer sine kjerneoperasjoner som iii-funksjoner (`mem::remember`, `mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). Ethvert språk med en iii-SDK kan kalle dem direkte over `ws://localhost:49134`, uten en separat REST-klient per språk.

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

Gjennomarbeidet eksempel: [`examples/python/`](../examples/python/) (hurtigstart + observasjon/gjenkalling-flyt). REST på `:3111` er fortsatt tilgjengelig for verter uten en iii-kjøretid.

### Fra kildekode

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

Dette starter agentmemory med en lokal `iii-engine` hvis den fastlåste binærfilen allerede er installert, eller bruker Docker Compose når det er valgt. REST, strømmer og viewer bindes til `127.0.0.1` som standard. Den automatiske binærfil-stien for macOS/Linux krever `curl`, en POSIX-`sh`, og `tar`.

Installer `iii-engine` manuelt. **agentmemory fastlåser for øyeblikket `iii-engine` til `v0.22.1`**, samme utgivelse som dens `iii-sdk`-avhengighet; workeren snakker den enginens kablingsprotokoll, og 0.20.0 omorganiserte SDK-overflaten, så de to beveger seg sammen i agentmemory-utgivelser. Overstyr med `AGENTMEMORY_III_VERSION=<version>` hvis du kjører din egen engine og vet at den matcher.

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSLo iii.tar.gz https://github.com/iii-hq/iii/releases/download/iii/v0.22.1/iii-aarch64-apple-darwin.tar.gz && echo "2b309019b909a896cae874dc947e2cdf877b4f3c51dd026b79850af858517fa4  iii.tar.gz" | shasum -a 256 -c - && tar -xzf iii.tar.gz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** bytt `aarch64-apple-darwin` med `x86_64-apple-darwin`
- **Linux x64:** bytt til `x86_64-unknown-linux-gnu`
- **Linux arm64:** bytt til `aarch64-unknown-linux-gnu`
- **Windows:** last ned `iii-x86_64-pc-windows-msvc.zip` fra [iii-hq/iii releases v0.22.1](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.22.1) og pakk ut `iii.exe` til `%USERPROFILE%\.agentmemory\bin\iii.exe`

Hvert arkiv har en matchende `.sha256`-fil på utgivelsessiden; når du bytter plattform, bruk den filens hash i kontrollen over (på Windows: `Get-FileHash`). Den automatiske installatøren i `npx @agentmemory/agentmemory` fastlåser disse hashene og avviser et arkiv som ikke stemmer.

Eller bruk Docker (den medfølgende `docker-compose.yml` henter `iiidev/iii:0.22.1`). Full dokumentasjon: [iii.dev/docs](https://iii.dev/docs).

### Windows

agentmemory kjører på Windows 10/11, men Node.js-pakken alene er ikke nok; du trenger også den fastlåste iii-engine v0.22.1-kjøretiden som en bakgrunnsprosess. CLI-en pakker ikke automatisk ut Windows-ZIP-filen, så native Windows-brukere må installere `iii.exe` manuelt, bruke WSL2, eller velge Docker Desktop.

Automatisert native Windows-MCP-tilkobling støtter bare `agentmemory connect copilot-cli`. For Claude Code, Codex, Cursor, og alle andre native Windows-agenter, kopier den manuelle MCP-blokken fra [Other agents](#other-agents) inn i agentens Windows-konfigurasjon. Å kjøre `connect` i WSL er bare riktig når målagenten også er installert i samme WSL-miljø; det endrer ikke konfigurasjonen til en agent som kjører på Windows-verten.

**Alternativ A: ferdigbygget Windows-binærfil (anbefalt)**

```powershell
# 1. Open https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.22.1 in your browser
#    (agentmemory pins the engine to the same release as its iii-sdk;
#     v0.22.1 is the current pair)
# 2. Download iii-x86_64-pc-windows-msvc.zip
#    (or iii-aarch64-pc-windows-msvc.zip if you're on an ARM machine)
# 3. Extract iii.exe to agentmemory's private engine directory:
New-Item -ItemType Directory -Force "$HOME\.agentmemory\bin"
# Copy iii.exe to $HOME\.agentmemory\bin\iii.exe
# 4. Verify:
& "$HOME\.agentmemory\bin\iii.exe" --version
# Should print: 0.22.1

# 5. Then run agentmemory as usual:
npx -y @agentmemory/agentmemory@latest
```

**Alternativ B: Docker Desktop**

```powershell
# 1. Install Docker Desktop for Windows
# 2. Start Docker Desktop and make sure the engine is running
# 3. Select Docker explicitly and run agentmemory:
$env:AGENTMEMORY_USE_DOCKER = "1"
npx -y @agentmemory/agentmemory@latest
```

**Alternativ C: kun frittstående MCP (ingen engine).** Hvis du bare trenger MCP-verktøyene for agenten din og ikke trenger REST-API-en, viewer, eller cron-jobber, hopp over engine-en helt:

```powershell
npx -y @agentmemory/agentmemory@latest mcp
# or via the shim package:
npx -y @agentmemory/mcp
```

**Diagnostikk for Windows:** hvis `npx -y @agentmemory/agentmemory@latest` mislykkes, kjør den på nytt med `--verbose` for å se den faktiske engine-stderr. Vanlige feilmodi:

| Symptom | Fiks |
|---|---|
| `The engine process started but the REST API never responded.` | Bekreft at alle fire avledede porter er ledige, verifiser at den fastlåste `iii.exe` holdt seg i live, og kjør deretter på nytt med `--verbose` og undersøk den fangede engine-stderr |
| `Could not start iii-engine` | Verken `iii.exe` eller Docker er installert. Se Alternativ A eller B over |
| Portkonflikt | `netstat -ano \| findstr :3111` for å se hva som er bundet, og drep det eller bruk `--port <N>` |
| Docker-fallback hoppet over selv om Docker er installert | Sørg for at Docker Desktop faktisk kjører (systemstatusfelt-ikon) |

> Merk: iii-**engine** er en ferdigbygget binærfil, ikke en cargo-kiste, så ikke prøv å `cargo install` den. (iii-**SDK-ene** er publisert på crates.io, npm, og PyPI, men agentmemory trenger dem ikke.) Støttede installasjonsmetoder for engine er alle fastlåst til v0.22.1: den ferdigbygde binærfilen over, agentmemorys macOS/Linux-autoinstallasjonsvei (`curl`, POSIX-`sh`, og `tar` kreves), og Docker-imaget `iiidev/iii:0.22.1`. En ren oppstrøms `install.sh | sh` installerer den nyeste engine-en, som agentmemory ikke støtter. Bruk `npx -y @agentmemory/agentmemory@latest`; på macOS/Linux henter den den fastlåste engine-en inn i `~/.agentmemory/bin`.

---

<h2 id="deploy">Deploy</h2>

Maler med ett klikk for administrerte verter. Hver av dem leverer en
selvstendig Dockerfile som henter `@agentmemory/agentmemory` fra npm og
kopierer inn iii-engine-binærfilen fra det offisielle
`iiidev/iii`-Docker Hub-imaget; ingen forhåndsbygget agentmemory-image
er nødvendig. Persistent lagring monteres på `/data`;
entrypointen ved første oppstart overskriver den npm-medfølgende
iii-konfigurasjonen (som binder `127.0.0.1`) med en distribusjons-
tilpasset versjon som binder `0.0.0.0` og bruker absolutte `/data`-
stier, genererer HMAC-hemmeligheten, og senker deretter rettighetene
fra `root` til `node` via `gosu` før den kjører agentmemory-CLI-en.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

Renders knapp for ett-klikks-distribusjon krever `render.yaml` i repoets rot, som vi med vilje holder ren. Bruk Render Blueprint-flyten dokumentert i [`deploy/render/`](.././deploy/render/README.md) for å peke på den interne blueprinten manuelt.

Fullstendige oppsettsdetaljer (HMAC-fangst, SSH-tunnel for viewer, rotasjon, sikkerhetskopiering,
kostnadsgulv) finnes i [`deploy/`](.././deploy/README.md):

- [`deploy/fly`](.././deploy/fly/README.md): én enkelt maskin med
  `auto_stop_machines = "stop"`; billigst når inaktiv.
- [`deploy/railway`](.././deploy/railway/README.md): Hobby-planen, fast
  pris, volum i dashbordet.
- [`deploy/render`](.././deploy/render/README.md): Blueprint-flyt,
  automatiske disk-snapshot på betalte planer.
- [`deploy/coolify`](.././deploy/coolify/README.md): selvhostet på din
  egen VPS via [Coolify](https://coolify.io/self-hosted); samme Docker
  Compose-stack, du eier verten og dataene.

Kun port `3111` publiseres. Viewer på `3113` holdes bundet til
loopback inne i containeren; hver mals README dokumenterer
SSH-tunnel-mønsteret for å nå den.

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Why agentmemory" height="32" /></picture></h2>

Hver kodeagent glemmer alt når sesjonen avsluttes, og hver ny sesjon starter med at du forklarer stacken din på nytt. agentmemory kjører i bakgrunnen og fjerner dette steget.

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

### vs innebygd agenthukommelse

Hver AI-kodeagent leveres med innebygd hukommelse: Claude Code har `MEMORY.md`, Cursor har notisblokker, Cline har en minnebank. Disse fungerer som gule lapper. agentmemory er den søkbare databasen bak de gule lappene.

| | Innebygd (CLAUDE.md) | agentmemory |
|---|---|---|
| Skala | Tak på 200 linjer | Ubegrenset |
| Søk | Laster alt inn i konteksten | BM25 + vektor + graf (kun topp-K) |
| Tokenkostnad | 22K+ ved 240 observasjoner | ~1 900 tokens (92 % mindre) |
| Tvers av agenter | Filer per agent | MCP + REST (hvilken som helst agent) |
| Koordinering | Ingen | Leaser, signaler, handlinger, rutiner |
| Observerbarhet | Les filer manuelt | Viewer i realtid på :3113 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="How It Works" height="32" /></picture></h2>

### Hukommelsespipeline

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
  -> Slot reflection (if SLOT_REFLECT_ENABLED=true)

SessionStart hook fires
  -> Load project profile (top concepts, files, patterns)
  -> Hybrid search (BM25 + vector + graph)
  -> Token budget (default: 2000 tokens)
  -> Inject into conversation
```

### 4-nivås hukommelseskonsolidering

Modellert etter hvordan menneskehjernen behandler hukommelse, inkludert konsolidering under søvn.

| Nivå | Hva | Analogi |
|------|------|---------|
| **Working (arbeid)** | Rå observasjoner fra verktøybruk | Korttidshukommelse |
| **Episodic (episodisk)** | Komprimerte sesjonsoppsummeringer | "Hva som skjedde" |
| **Semantic (semantisk)** | Uttrukne fakta og mønstre | "Hva jeg vet" |
| **Procedural (prosedyral)** | Arbeidsflyter og beslutningsmønstre | "Hvordan gjøre det" |

Minner forfaller over tid (Ebbinghaus-kurven). Ofte brukte minner styrkes. Utdaterte minner kastes automatisk. Motsetninger oppdages og løses.

### Hva som fanges opp

| Hook | Fanger |
|------|----------|
| `SessionStart` | Prosjektsti, sesjons-ID |
| `UserPromptSubmit` | Brukerprompter (personvernfiltrert) |
| `PreToolUse` | Filtilgangsmønstre + utvidet kontekst |
| `PostToolUse` | Verktøynavn, inndata, utdata |
| `PostToolUseFailure` | Feilkontekst |
| `PreCompact` | Injiserer hukommelse på nytt før komprimering |
| `SubagentStart/Stop` | Livssyklus for underagenter |
| `Stop` | Oppsummering ved sesjonsslutt |
| `SessionEnd` | Markør for fullført sesjon |

### Viktige egenskaper

| Egenskap | Beskrivelse |
|---|---|
| **Automatisk fangst** | Hver verktøybruk registreres via hooks, uten manuell innsats |
| **Semantisk søk** | BM25 + vektor + kunnskapsgraf med RRF-fusjon |
| **Hukommelsesevolusjon** | Versjonering, erstatning, relasjonsgrafer |
| **Hygiene ved gjenkalling** | Erstattede minneversjoner forlater søkeindeksene; versjonskjeden i KV beholder full historikk |
| **Hint om nær-duplikater** | Lagringer rapporterer et rådgivende `similarTo`-treff når nytt innhold ligner mye på et eksisterende minne |
| **Avgrensning per agent** | `agentId` flyter gjennom lagring og gjenkalling over REST, MCP, og søkeindeksen, i delt eller isolert modus |
| **Opprinnelse ved skrivetidspunkt** | Hver observasjon og hvert minne har en uforanderlig opprinnelseskanal (user, agent, tool, import, eller shared) stemplet ved fangst, lagring, og import |
| **Automatisk glemming** | TTL-utløp, oppdagelse av motsetninger, beskjæring etter viktighet |
| **Personvern først** | API-nøkler, hemmeligheter, `<private>`-tagger fjernes før lagring |
| **Selvhelende** | Strømbryterkrets (circuit breaker), fallback-kjede for leverandører, helseovervåking |
| **Claude-bro** | Toveis synkronisering med MEMORY.md |
| **Kunnskapsgraf** | Entitetsuttrekk + BFS-traversering |
| **Teamhukommelse** | Navneromdelt delt + privat mellom teammedlemmer |
| **Siteringsopprinnelse** | Spor ethvert minne tilbake til kildeobservasjonene |
| **Git-snapshots** | Versjoner, tilbakerulling, og diff av minnetilstand |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Search" height="32" /></picture></h2>

Trippel-strøm-gjenfinning som kombinerer tre signaler:

| Strøm | Hva den gjør | Når |
|---|---|---|
| **BM25** | Stemmet nøkkelordmatching med synonymutvidelse | Alltid på |
| **Vektor** | Kosinus-likhet over tette embeddings | Embedding-leverandør konfigurert |
| **Graf** | Kunnskapsgraf-traversering via entitetsmatching | Entiteter oppdaget i søket |

Fusjonert med Reciprocal Rank Fusion (RRF, k=60) og sesjonsdiversifisert (maks 3 resultater per sesjon).

Når en vektorindeks er fylt, bruker `mem::search` (bak `memory_recall`) den hybride BM25 + vektor-rangereren. Uten embeddings bruker den BM25. `smart-search` kan i tillegg slå sammen strukturelle grafmatcher når grafdata finnes, også i nøkkelfri modus. Gjenkalling av læringspunkter kjører på en dedikert BM25-indeks i minnet i stedet for å skanne hele korpuset per søk. Erstattede minneversjoner er utelatt fra hver gjenkallingsvei; versjonskjeden beholder historikken deres.

Vektorer overlever en krasj eller tvungen avslutning. Vektorindeksen lagres i bøtter minst hvert `AGENTMEMORY_INDEX_SAVE_INTERVAL_MS` (10 minutter). Hver vektor som legges til eller fjernes i mellomtiden skrives også umiddelbart til en liten ventende logg i state-lageret, og neste oppstart spiller den av igjen uten å kalle embedding-leverandøren. Hver vellykkede lagring tømmer loggen. Dokumenter som fortsatt ikke har en vektor etter avspillingen, re-embeddes i bakgrunnen i batcher av `AGENTMEMORY_VECTOR_BACKFILL_MAX` (500) til ingen er igjen, og en etterfylling som stoppes fortsetter ved neste oppstart. `/agentmemory/status` og viewer viser størrelsen på den ventende loggen og etterfyllingsstatusen. Nøkkelfrie installasjoner skriver ingenting.

BM25 tokeniserer gresk, kyrillisk, hebraisk, arabisk, og aksentuert latin ut av boksen. For kinesiske/japanske/koreanske minner, installer de valgfrie segmenterne (`npm install @node-rs/jieba tiny-segmenter`) for å dele opp CJK-sekvenser i ord-nivå-tokens; uten dem faller agentmemory mykt tilbake til hele-sekvens-tokenisering og skriver et engangs-hint til stderr.

### Embedding-leverandører

Nøkkelfrie installasjoner deaktiverer vektor-embeddings: `mem::search` bruker BM25, mens `smart-search` også kan bruke eksisterende strukturelle grafdata. For å velge gratis semantiske embeddings på enheten, legg dette til i `~/.agentmemory/.env` og start agentmemory på nytt:

```env
EMBEDDING_PROVIDER=local
```

Den vanlige npm-installasjonen inkluderer den valgfrie `@huggingface/transformers`-kjøretiden. Den første embedding-forespørselen laster ned `Xenova/all-MiniLM-L6-v2`, så den trenger nettverkstilgang og kan ta lengre tid; senere inferens kjører på enheten. Eksterne leverandører oppdages automatisk fra sine nøkler med mindre `EMBEDDING_PROVIDER` overstyrer dem.

| Leverandør | Modell | Kostnad | Merknader |
|---|---|---|---|
| **Lokal (anbefalt opt-in)** | `all-MiniLM-L6-v2` | Gratis | På enheten etter den første modellnedlastingen, +8 prosentpoeng gjenkalling over kun-BM25 |
| Gemini | `gemini-embedding-001` | Gratis nivå | 100+ språk, 768/1536/3072 dimensjoner (MRL), 2048-tokens inndata. Erstatter `text-embedding-004` ([avviklet, stengt 14. januar 2026](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | Høyest kvalitet |
| Voyage AI | `voyage-code-3` | Betalt | Optimalisert for kode |
| Cohere | `embed-english-v3.0` | Gratis prøveperiode | Generell bruk |
| OpenRouter | Hvilken som helst modell | Varierer | Flermodell-proxy |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP Server" height="32" /></picture></h2>

54 MCP-verktøy, 6 ressurser, 3 prompter, og 17 skills.

> **MCP-shim vs full server:** den publiserte `@agentmemory/mcp`-pakken er en tynn shim. Den eksponerer hele 54-verktøys-overflaten **kun når den kan nå en kjørende agentmemory-server** via `AGENTMEMORY_URL` (proxy-modus). Uten en nåbar server faller shimmen tilbake til et lokalt sett på 7 verktøy (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). Miljøvariabelen `AGENTMEMORY_TOOLS=core|all` er et flagg på *serversiden*; å sette den i shimmens `env`-blokk har ingen effekt. Hvis du bare ser 7 verktøy i Cursor / OpenCode / Gemini CLI, start `npx -y @agentmemory/agentmemory@latest` (eller Docker-stacken) og sett `AGENTMEMORY_URL=http://localhost:3111`.

### 54 verktøy

Tre verktøyoverflater, fra minst til størst: `AGENTMEMORY_TOOLS=core` begrenser synligheten til 8 essensielle (`memory_save`, `memory_recall`, `memory_consolidate`, `memory_smart_search`, `memory_sessions`, `memory_diagnose`, `memory_lesson_save`, `memory_reflect`); grunnsettet nedenfor er registerets 14 grunnleggende verktøy; standarden (`AGENTMEMORY_TOOLS=all`) eksponerer alle 54.

<details>
<summary>Grunnverktøy (14)</summary>

| Verktøy | Beskrivelse |
|------|-------------|
| `memory_recall` | Søk i tidligere observasjoner |
| `memory_compress_file` | Komprimer markdown-filer og bevar strukturen |
| `memory_save` | Lagre en innsikt, beslutning, eller et mønster |
| `memory_file_history` | Tidligere observasjoner om spesifikke filer |
| `memory_patterns` | Oppdag gjentakende mønstre |
| `memory_sessions` | List opp nylige sesjoner |
| `memory_smart_search` | Hybrid semantisk + nøkkelordsøk |
| `memory_vision_search` | Søk i bildeobservasjoner |
| `memory_timeline` | Kronologiske observasjoner |
| `memory_profile` | Prosjektprofil (konsepter, filer, mønstre) |
| `memory_export` | Eksporter all minnedata |
| `memory_relations` | Spør relasjonsgrafen |
| `memory_commit_lookup` | Sesjoner bak en git-commit |
| `memory_commits` | Commits registrert for en sesjon |

</details>

<details>
<summary>Utvidede verktøy (54 totalt, standardoverflaten)</summary>

| Verktøy | Beskrivelse |
|------|-------------|
| `memory_patterns` | Oppdag gjentakende mønstre |
| `memory_timeline` | Kronologiske observasjoner |
| `memory_relations` | Spør relasjonsgrafen |
| `memory_graph_query` | Kunnskapsgraf-traversering |
| `memory_consolidate` | Kjør 4-nivås konsolidering |
| `memory_claude_bridge_sync` | Synkroniser med MEMORY.md |
| `memory_team_share` | Del med teammedlemmer |
| `memory_team_feed` | Nylig delte elementer |
| `memory_audit` | Revisjonsspor for operasjoner |
| `memory_governance_delete` | Slett med revisjonsspor |
| `memory_snapshot_create` | Git-versjonert snapshot |
| `memory_action_create` | Opprett arbeidselementer med avhengigheter |
| `memory_action_update` | Oppdater handlingsstatus |
| `memory_frontier` | Ublokkerte handlinger rangert etter prioritet |
| `memory_next` | Den enkelt viktigste neste handlingen |
| `memory_lease` | Eksklusive handlingsleaser (flere agenter) |
| `memory_routine_run` | Instansier arbeidsflyt-rutiner |
| `memory_signal_send` | Meldinger mellom agenter |
| `memory_signal_read` | Les meldinger med kvitteringer |
| `memory_checkpoint` | Eksterne tilstandsporter |
| `memory_mesh_sync` | P2P-synkronisering mellom instanser |
| `memory_sentinel_create` | Hendelsesdrevne overvåkere |
| `memory_sentinel_trigger` | Utløs sentinels eksternt |
| `memory_sketch_create` | Forbigående handlingsgrafer |
| `memory_sketch_promote` | Forfrem til permanent |
| `memory_crystallize` | Komprimer handlingskjeder |
| `memory_diagnose` | Helsekontroller |
| `memory_heal` | Fiks fastlåst tilstand automatisk |
| `memory_facet_tag` | Dimensjon:verdi-tagger |
| `memory_facet_query` | Spør etter fasett-tagger |
| `memory_verify` | Spor opprinnelse |

</details>

### 6 ressurser · 3 prompter · 17 skills

| Type | Navn | Beskrivelse |
|------|------|-------------|
| Ressurs | `agentmemory://status` | Helse, sesjonsantall, minneantall |
| Ressurs | `agentmemory://project/{name}/profile` | Prosjektspesifikk intelligens |
| Ressurs | `agentmemory://project/{name}/recent` | Nylige observasjoner for et prosjekt |
| Ressurs | `agentmemory://memories/latest` | De siste 10 aktive minnene |
| Ressurs | `agentmemory://graph/stats` | Kunnskapsgraf-statistikk |
| Ressurs | `agentmemory://team/{id}/profile` | Delt teamprofil |
| Prompt | `recall_context` | Søk + returner kontekstmeldinger |
| Prompt | `session_handoff` | Overleveringsdata mellom agenter |
| Prompt | `detect_patterns` | Analyser gjentakende mønstre |
| Skill | `/recall` | Søk i hukommelsen |
| Skill | `/remember` | Lagre til langtidshukommelse |
| Skill | `/session-history` | Nylige sesjonsoppsummeringer |
| Skill | `/forget` | Slett observasjoner/sesjoner |

Tabellen viser de fire kjerne-skillene. Hele settet er 9 skills som kan kalles, pluss 8 referanseskills; se avsnittet om native skills over.

### Frittstående MCP

Kjør uten hele serveren, for en hvilken som helst MCP-klient. Begge disse fungerer:

```bash
npx -y @agentmemory/agentmemory@latest mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

Eller legg til i agentens MCP-konfigurasjon:

De fleste agenter (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI):
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

Slå sammen `agentmemory`-oppføringen inn i vertens eksisterende `mcpServers`-objekt i stedet for å erstatte filen. For sandkasse-klienter som ikke kan nå vertens `localhost`, legg til `"AGENTMEMORY_FORCE_PROXY": "1"` i `env`-blokken og sett `AGENTMEMORY_URL` til en rute sandkassen kan nå.

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

Kopier plugin-filen fra repoet:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Real-Time Viewer" height="32" /></picture></h2>

Starter automatisk på port `3113`. Viewer laster ett snapshot når den kobler til (`GET /agentmemory/viewer/snapshot`) og bruker deretter live strømhendelser: nye minner, læringspunkter, observasjoner, revisjonsoppføringer, grafendringer, og helseoppdateringer vises uten polling eller sideoppdateringer. De eneste andre forespørslene er handlingene du klikker på, "load more"-sider, og søk. Når strømmen faller ut, viser viewer hvor gamle tallene er, kobler til igjen med backoff, og synkroniserer på nytt fra ett snapshot.

- **12 faner i fire grupper** med live antall, dype lenker (`#memories/<id>`, `#sessions/<id>?obs=<id>`, `#graph/<id>`, `#health/consolidation`), tastatursnarveier, og en mobilmeny.
- **Memories:** server-side søk, filtre etter prosjekt, agent, og type, et detaljpanel med versjonskjeden og en orddiff, opprinnelseslenker, kopieringsknapper for id-en, MCP-kallet, og en curl-kommando, rediger (en ny versjon), glem med bekreftelse, bulk-glemming, og JSON-eksport.
- **Sessions:** en innebygd observasjonstidslinje med lesbar verktøyinndata og -utdata, filtre og paginering, og minnene og læringspunktene hver sesjon produserte.
- **Graph:** søk, nodedetaljer med relasjoner og kilder, en legende som ikke er avhengig av farge alene, og zoomkontroller.
- **Health:** liveversjonen av `GET /agentmemory/status`. Hvert problem kommer med sin fiks, pluss state-backend, indekslagringsstatus, fremdrift for komprimering av grafopprinnelse, og en konsolideringsforklaring med de reelle tersklene.
- **Audit, Activity, Profile, Replay, Lessons, Actions og Crystals**-sider, hver med en tom tilstand som sier hva avsnittet er, hvorfor det er tomt, og kommandoen som fyller det, og et `?`-ordlistetips på hvert begrep og tall.

```bash
open http://localhost:3113
```

Viewer-serveren bindes til `127.0.0.1` som standard og legger på serverhemmeligheten når den videresender forespørsler til REST-API-en, så den krever ikke noe oppsett. REST-serverte `/agentmemory/viewer`-endepunktet følger de normale bearer-token-reglene og omdirigerer nettlesere uten en token til viewer-porten. CSP-headere bruker en per-respons-script-nonce og deaktiverer inline-håndteringsattributter (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

Viewer på `:3113` viser hva agenten din **husket**. [iii-konsollen](https://iii.dev/docs/console) viser hva agenten din **gjorde**: hver minneoperasjon som en OpenTelemetry-trace, hver KV-oppføring redigerbar, hver funksjon kallbar, hver strøm avlyttbar. To vinduer på samme hukommelse: ett produkt-formet, ett motor-formet.

Se en `memory_smart_search` utløses og se BM25-skanningen → embedding-oppslaget → RRF-fusjonen → rerankeren som en fossefall-visning. Rediger en fastlåst konsolideringstimer i KV-browseren. Spill av en `PostToolUse`-hook på nytt med en justert nyttelast. Fest WebSocket-strømmen og se observasjoner lande live.

agentmemory leverer dette gratis fordi hvert funksjonskall og hver trigger utløses gjennom iii; ingenting egendefinert, ingenting å instrumentere.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="iii console Workers page: connected workers including agentmemory instances with live function counts and runtime metadata" width="720" />
  <br/>
  <em>Workers-siden: hver tilkoblede worker, inkludert agentmemory selv, med PID, funksjonsantall, runtime, og sist sett.</em>
</p>

**Allerede installert.** Konsollen leveres med den fastlåste `iii`-engine-en (0.22+); ingenting separat å installere. Den første oppstarten laster ned konsoll-binærfilen ved siden av engine-en.

**Start sammen med agentmemory:**

```bash
agentmemory console
```

Dette kjører den fastlåste engine-ens `iii console` mot portene agentmemory løste opp (REST, strømmer, bro) og serverer den én port over viewer, `http://localhost:3114` som standard. `--console-port N` velger en annen port; `--port` og `--instance` velger agentmemory-instansen på samme måte som de gjør for `stop`; ethvert annet flagg sendes videre, for eksempel `--enable-flow` for den eksperimentelle arkitektur-graf-siden.

Det samme for hånd, nyttig når `agentmemory` ikke er på PATH:

```bash
~/.agentmemory/bin/iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**Hva du kan gjøre fra konsollen:**

| Side | Brukes til |
|------|-----------|
| **Workers** | Se hver tilkoblede worker og dens live metrikker, inkludert agentmemory-workeren selv. |
| **Functions** | Kall direkte hvilken som helst av agentmemorys funksjoner med en JSON-nyttelast; nyttig for å teste `memory.recall`, `memory.consolidate`, `graph.query` uten å koble til en klient. |
| **Triggers** | Spill av HTTP-, cron-, event-, og state-triggere på nytt: utløs konsolideringscronen manuelt, prøv en HTTP-rute på nytt, send en tilstandsendring. |
| **States** | KV-browser med full CRUD over sesjoner, minneplasser, livssyklustimere, og embeddings-indeksen; rediger verdier direkte. |
| **Streams** | Live WebSocket-overvåker for minneskriving, hook-hendelser, og observasjonsoppdateringer mens de flyter gjennom iii-strømmer. |
| **Queues** | Varige køtopics + dead-letter-administrasjon. Spill av eller forkast mislykkede embedding-/komprimeringsjobber. |
| **Traces** | OpenTelemetry fossefall-/flamme-/tjenesteoppdelingsvisninger. Filtrer etter `trace_id` for å se nøyaktig hvilke funksjoner, DB-kall, og embedding-forespørsler et enkelt `memory.search`-kall produserte. |
| **Logs** | Strukturerte OTEL-logger filtrert og korrelert til trace-/span-ID-er. |
| **Config** | Kjøretidskonfigurasjon: se nøyaktig hvilke workere, leverandører, og porter engine-en din kjører med. |
| **Flow** | (Valgfritt, `--enable-flow`) Interaktiv arkitekturgraf av hver worker, trigger, og strøm. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="iii console trace waterfall view showing per-span duration" width="720" />
  <br/>
  <em>Traces: fossefall-/flamme-/tjenesteoppdeling for hver minneoperasjon.</em>
</p>

**Traces er allerede på:**

`iii-config.yaml` leveres med `iii-observability`-workeren aktivert (`exporter: memory`, `sampling_ratio: 0.1`, metrikker + logger). Ingen ekstra konfigurasjon nødvendig; i det øyeblikket agentmemory starter, sender hver minneoperasjon ut en strukturert logg konsollen kan lese, og én av ti av dem (`sampling_ratio: 0.1`) sender også ut en trace-span.

Hvis du vil eksportere til Jaeger/Honeycomb/Grafana Tempo i stedet, endre `exporter: memory` til `exporter: otlp` og sett collector-endepunktet ifølge iiis observability-dokumentasjon.

> **Viktig:** ingen autentisering er tvunget på konsollen selv; hold den bundet til `127.0.0.1` (standard) og eksponer den aldri offentlig.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory er **allerede en kjørende [iii](https://iii.dev)-instans**. Tre primitiver (worker, funksjon, trigger) utgjør kjøretiden; KV-tilstand, strømmer, og OTEL-traces kommer fra workerne iii-state, iii-stream, og iii-observability som leveres med iii. Du installerte ikke Postgres, Redis, Express, pm2, eller Prometheus, fordi iii erstatter dem.

Det betyr at én kommando til utvider agentmemory med en helt ny egenskap.

### Utvid agentmemory med flere workere

Byggesteinene agentmemory trenger er allerede i `iii-config.yaml` og starter med den: `iii-state` (KV), `iii-queue` (varige gjentatte forsøk for event-abonnentene), `iii-pubsub`, `iii-cron`, `iii-stream`, og `iii-observability` (OTEL-traces, metrikker, og logger på hver funksjon). Alt annet fra [iii-worker-registeret](https://workers.iii.dev) kobles til samme engine: kopier `iii-config.yaml` til `~/.agentmemory/iii-config.yaml` (CLI-en foretrekker denne filen over den medfølgende, og rendrer fortsatt porter og datastier inn i den), legg til oppføringen, installer worker-kjøretiden én gang med `~/.agentmemory/bin/iii update worker`, og start agentmemory på nytt.

```yaml
workers:
  # ...the bundled entries...
  - name: database          # SQL-backed state adapter when you outgrow the KV defaults
  - name: iii-sandbox       # run code that came out of memory_recall inside a throwaway VM
  - name: mcp               # extra MCP servers next to agentmemory's, same engine
```

| Worker | Hva du får i tillegg til agentmemory |
|---|---|
| [`database`](https://workers.iii.dev/workers/database) | SQL-basert state-adapter når du vokser ut av KV-standardene i minnet |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | Kode som kommer ut av `memory_recall` kjører inne i en engangs-VM, ikke i skallet ditt |
| [`mcp`](https://workers.iii.dev/workers/mcp) | Sett opp ekstra MCP-servere ved siden av agentmemorys, del samme engine |

På engine 0.22.x, behold navnene med `iii-`-prefiks for byggesteinene over; de uprefikserte oppføringene `http`, `state`, `queue`, `pubsub`, og `cron` er de frittstående registerworkerne agentmemory flytter til med 0.23-migreringen.

Fullt register: [workers.iii.dev](https://workers.iii.dev). Hver worker der settes sammen gjennom de samme primitivene agentmemory bruker, og agentmemory du allerede har er en av dem.

### Engine-konfigurasjon og bindeadresse

`agentmemory start` leser engine-konfigurasjonen fra den første filen som finnes: `AGENTMEMORY_III_CONFIG`, `./iii-config.yaml` i den nåværende katalogen, `~/.agentmemory/iii-config.yaml`, deretter den medfølgende `iii-config.yaml`. Ved hver oppstart rendrer den denne filen (datastier, porter, state-backend) inn i `~/.agentmemory/data/iii-config.runtime.yaml` og starter engine-en med den rendrede kopien, så rediger kildefilen, ikke den rendrede. `host:`-verdiene i kildefilen beholdes som skrevet.

Den medfølgende `iii-config.yaml` binder `127.0.0.1` med vilje, og denne standarden gjelder også inne i en container. En CLI startet i en container lytter på containerens loopback, så publiserte porter når ingenting. For å servere en konteinerisert CLI gjennom publiserte porter, sett `AGENTMEMORY_III_CONFIG` til en konfigurasjon som binder `0.0.0.0`. Den medfølgende `iii-config.docker.yaml` er en slik: den binder `iii-http`, `iii-stream`, og engine-porten til `0.0.0.0` og lagrer tilstand under `/data`, så monter et skrivbart volum der. Hold `AGENTMEMORY_SECRET` satt, og publiser bare de portene du trenger, på `127.0.0.1` eller bak en proxy du stoler på.

Dette repoets `docker-compose.yml` går ikke gjennom CLI-ens konfigurasjonssøk: det monterer `iii-config.docker.yaml` på `/app/config.yaml`, og `iii-engine`-containeren starter med `--config /app/config.yaml`. Maler for [ett-klikks-distribusjon](../deploy/) skriver sin egen `0.0.0.0`-konfigurasjon i sine entrypoints.

### Lagringsbackend: filbasert (standard) vs redis

`iii-state` og `iii-stream` bruker som standard iii-engines medfølgende filbaserte KV-lager: én JSON-fil per scope, holdt i engine-prosessens minne og skrevet til disk på en timer. Dette er det riktige standardvalget for en lokal installasjon med én bruker; en delt daemon med flere samtidige skrivere får ekte skriving per nøkkel fra Redis i stedet, til kostnaden av en nettverks-rundtur per operasjon (hvert `state::*`-kall serialiseres fortsatt på én Redis-tilkobling, så dette bytter filens lagerlås mot en socket, ikke mot parallellitet).

Sett `AGENTMEMORY_STATE_BACKEND=redis` (pluss `AGENTMEMORY_REDIS_URL`) for å bytte begge workerne til iii-engines innebygde `redis`-adapter, som lagrer hver nøkkel som et Redis hash-felt (`HSET`) i stedet for å skrive om hele scopet ved hver skriving:

```env
# ~/.agentmemory/.env
AGENTMEMORY_STATE_BACKEND=redis
AGENTMEMORY_REDIS_URL=redis://localhost:6379
```

`AGENTMEMORY_STATE_BACKEND` er `file` som standard; å la den være usatt beholder dagens oppførsel uendret, og en ukjent verdi (noe annet enn `file` eller `redis`) gir en oppstartsfeil i stedet for en stille fallback. `/agentmemory/status` og viewerens Health-side (State store-raden) rapporterer hvilken backend som er aktiv og om den svarer, aldri URL-en.

**Kun ren `redis://`.** Den fastlåste engine-en (0.22.1) bygger sin Redis-klient uten TLS-støtte, så en `rediss://`-URL (de fleste administrerte Redis-tilbud, som Upstash, Redis Cloud, og ElastiCache med kryptering under overføring, er TLS-only som standard) kobler ikke til. Tilkoblingen er ukryptert, så Redis-passordet og hvert lagrede minne går over tråden i klartekst: pek på en lokal Redis eller en på et privat nettverk du stoler på. For enhver annen Redis, kjør en kryptert tunnel (stunnel, SSH, eller en VPN) på agentmemory-verten, slik at det rene `redis://`-hoppet holder seg på den verten og tunnelens oppstrøms-tilkobling er kryptert og autentisert. Hvis et Redis-passord inneholder et enkelt sitattegn, prosent-koder det (`%27`); engine-en utvider URL-en til sin YAML-konfigurasjon før parsing.

**Én Redis-server per `--instance`.** Engine-ens Redis-nøkkelprefikser (`state:<scope>`, `stream:<name>:<group>`) er fastsatte, så to agentmemory-instanser (`--instance 1`, `--instance 2`, ...) pekt mot samme database overskriver hverandres data. En egen databaseindeks (`redis://localhost:6379/1`) holder lagret data separat, men engine-en relayer live viewer-hendelser over én Redis pub/sub-kanal (`stream::events`), og Redis pub/sub ignorerer databaseindeksen, så hver instans' viewer vil fortsatt vise den andres live-hendelser. Gi hver instans sin egen Redis-server (eller port) når du kjører mer enn én.

**Hva som forblir det samme, og hva som er forskjellig.** Hver agentmemory-egenskap fungerer på Redis: sesjoner, observasjoner, minner (remember, erstatt, evolve, forget), søk og indeksbøttene, læringspunkter, grafen, revisjonsloggen og dens månedlige scopes, eksport og import, governance-sletting, konsolideringsstatus, viewer-snapshotet og dens live-strøm, og helseovervåkeren. Engine-en lagrer hvert scope som én Redis-hash (`HSET`/`HGET`/`HGETALL`) og utløser de samme state-triggerne som filbaseret lager. Tre engine-forskjeller håndteres inne i agentmemory:

- Redis returnerer en scopes oppføringer i ingen fast rekkefølge. agentmemory sorterer dem eldste først (etter opprettelsestiden i oppføringens id, deretter tidsstempelet), slik at lister, paginering, og eksportbiter kommer tilbake i samme rekkefølge som i filbaseret lager.
- Engine-en bruker partielle oppdateringer på Redis i et Lua-skript som gjør tomme arrayer til tomme objekter. agentmemory utfører disse oppdateringene selv (les, endre, skriv under en lås per nøkkel) på Redis, slik at felt som `tags: []` forblir arrayer.
- Den eldre revisjonsloggkontrollen leser det gamle scopet fra Redis i stedet for å se etter filbasertets fil på disk.

Én forskjell krever din oppmerksomhet: **etter at Redis starter på nytt, stopper engine-en å relaye live-hendelser** til viewer til agentmemory starter på nytt. Data lagres og leses fortsatt normalt. Helseovervåkeren sender en testhendelse gjennom Redis hvert 30. sekund; når den ikke kommer tilbake, viser `/agentmemory/status` og viewerens Health-side "Live updates are not reaching the viewer" med fiksen: start agentmemory på nytt. Hvis Redis er nede, viser statusrapporten "The state store is not answering" og hvordan du sjekker det (`redis-cli -u "$AGENTMEMORY_REDIS_URL" ping`). Å liste et veldig stort scope leser hele hashen i én `HGETALL`, samme kostnad som filbasertet som holder det i minnet.

**Anbefalte Redis-innstillinger.** Standard snapshot-policy `save 3600 1 300 100 60 10000` kan tape minutter med skriving ved en krasj, verre enn filbasertets 5-sekunders flush-vindu. Sett `appendonly yes` for alt du ville savnet å tape. Sett `maxmemory-policy noeviction`; `allkeys-lru` eller lignende dropper minner stille når Redis når minnegrensen sin.

En native (ikke-Docker) oppstart, og hver mal for [ett-klikks-distribusjon](../deploy/) (de overskriver den medfølgende `iii-config.yaml` og starter native), leser `AGENTMEMORY_STATE_BACKEND`/`AGENTMEMORY_REDIS_URL` og rendrer dem inn i den startede `iii-config`-en. URL-en selv skrives aldri til den rendrede filen, bare en `${AGENTMEMORY_REDIS_URL}`-referanse som engine-prosessen utvider fra sitt eget miljø ved oppstart. Bare dette repoets egen Docker Compose-vei (`AGENTMEMORY_USE_DOCKER=1`, eller gjenoppta en engine allerede startet på den måten) monterer `iii-config.docker.yaml` skrivebeskyttet og rendrer aldri; `agentmemory start` advarer når den oppdager den kombinasjonen. Bytt den filen manuelt, ved å følge samme `name: redis` / `config: redis_url: ...`-form vist i [iii-state](https://workers.iii.dev/workers/iii-state)- og [iii-stream](https://workers.iii.dev/workers/iii-stream)-worker-dokumentasjonen, og pek `redis_url` mot en Redis nåbar fra containeren. `docker-compose.yml` sender `AGENTMEMORY_REDIS_URL` inn i engine-containeren, så `redis_url: '${AGENTMEMORY_REDIS_URL}'` fungerer der og holder URL-en utenfor den monterte filen.

Den rendrede konfigurasjonen holder URL-en utenfor `~/.agentmemory/data/iii-config.runtime.yaml`, men engine-ens egen konfigurasjonsworker lagrer fortsatt den *utvidede* verdien til `~/.agentmemory/config/iii-state.yaml` og `iii-stream.yaml` når den starter (iii-engines `${VAR}`-utvidelse skjer før denne workeren lagrer sitt seed, og den lagrer den oppløste verdien, ikke referansen). Behandle den katalogen som om den inneholder et credential: `chmod 700 ~/.agentmemory` på en delt vert, og foretrekk en Redis ACL-bruker avgrenset til hva agentmemory trenger over databasens admin-credentials.

**Migrering er ikke automatisk.** Å bytte `AGENTMEMORY_STATE_BACKEND` starter fra et tomt lager på begge sider; ingenting kopierer eksisterende data fra fil til Redis eller tilbake. Eksporter fra backenden du forlater og importer inn i den du flytter til. Dette kjører identisk under bash og zsh (inkludert `bash -u`). En array som `AUTH=(${AGENTMEMORY_SECRET:+-H "Authorization: Bearer $AGENTMEMORY_SECRET"})` gjør det ikke: zsh holder headeren som ett feilformet ord der bash deler den i to, så begge forespørslene gir 401 når `AGENTMEMORY_SECRET` er satt:

```bash
# 0. Use the generated secret when none is exported:
AGENTMEMORY_SECRET="${AGENTMEMORY_SECRET:-$(cat ~/.agentmemory/secret 2>/dev/null)}"

# 1. On the old backend, while agentmemory is still running on it:
if [ -n "${AGENTMEMORY_SECRET:-}" ]; then
  curl -fsS -H "Authorization: Bearer $AGENTMEMORY_SECRET" http://localhost:3111/agentmemory/export > backup.json
else
  curl -fsS http://localhost:3111/agentmemory/export > backup.json
fi

# 2. Confirm backup.json is a usable export before switching backends:
jq -e '.version and .exportedAt' backup.json > /dev/null || {
  echo "backup.json is not a valid export; do not switch backends" >&2
  exit 1
}

# 3. Switch AGENTMEMORY_STATE_BACKEND (and AGENTMEMORY_REDIS_URL if needed),
#    restart agentmemory against the new backend, then:
if [ -n "${AGENTMEMORY_SECRET:-}" ]; then
  jq -n --slurpfile d backup.json '{exportData: $d[0], strategy: "merge"}' | \
    curl -fsS -H "Authorization: Bearer $AGENTMEMORY_SECRET" -X POST http://localhost:3111/agentmemory/import \
      -H 'Content-Type: application/json' -d @-
else
  jq -n --slurpfile d backup.json '{exportData: $d[0], strategy: "merge"}' | \
    curl -fsS -X POST http://localhost:3111/agentmemory/import \
      -H 'Content-Type: application/json' -d @-
fi
```

`/agentmemory/export` godtar også `?maxSessions=` og `?offset=` for å dele opp et stort korpus over flere kall; `strategy` ved import er `merge` (sikker standard), `replace`, eller `skip`.

### Hva iii erstatter

| Tradisjonell stack | agentmemory bruker |
|---|---|
| Express.js / Fastify | iii HTTP-triggere |
| SQLite / Postgres + pgvector | iii KV-tilstand + vektorindeks i minnet |
| SSE / Socket.io | iii-strømmer (WebSocket) |
| pm2 / systemd | iii engine worker-overvåking |
| Prometheus / Grafana | iii OTEL + helseovervåker |
| Egendefinerte plugin-systemer | `iii worker add <name>` |

**219 kildefiler · ~52,000 LOC · 2,600+ tester · 311 funksjoner · 60 KV-scopes**, alt på tre primitiver. Ingen `agentmemory plugin install`. Plugin-systemet er iii selv.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Configuration" height="32" /></picture></h2>

### LLM-leverandører

agentmemory oppdager leverandører automatisk fra miljøet ditt. En leverandør gjør LLM-baserte operasjoner tilgjengelige, men leverandørkonfigurasjon alene aktiverer ikke LLM-skrevet observasjonskomprimering. Denne stien krever både en leverandør og `AGENTMEMORY_AUTO_COMPRESS=true`.

| Leverandør | Konfigurasjon | Merknader |
|----------|--------|-------|
| **No-op (standard)** | Ingen konfigurasjon nødvendig | LLM-basert komprimering/oppsummering er deaktivert. Syntetisk komprimering og BM25-gjenkalling fungerer fortsatt. Se `AGENTMEMORY_ALLOW_AGENT_SDK` under hvis du tidligere brukte Claude-abonnement-fallbacken. |
| Anthropic API | `ANTHROPIC_API_KEY` | Fakturering per token |
| MiniMax | `MINIMAX_API_KEY` | Anthropic-kompatibel |
| Gemini | `GEMINI_API_KEY` | Aktiverer også embeddings |
| OpenRouter | `OPENROUTER_API_KEY` | Hvilken som helst modell |
| OpenAI API | `OPENAI_API_KEY` | Standard `gpt-5.6-luna`, overstyr med `OPENAI_MODEL` |
| **Lokal (Ollama / LM Studio / vLLM / llama.cpp)** | `OPENAI_API_KEY=local` + `OPENAI_BASE_URL=http://localhost:11434/v1` (Ollama) eller `http://localhost:1234/v1` (LM Studio) + `OPENAI_MODEL=<your model>` | Alt som er OpenAI-API-kompatibelt. Null kostnad, kjører på egen maskinvare. Se [Lokale modeller](#local-models-ollama--lm-studio--vllm) under. |
| Claude-abonnement-fallback | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Kun opt-in. Starter `@anthropic-ai/claude-agent-sdk`-sesjoner; dette brukte å forårsake ubegrenset Stop-hook-rekursjon, så det er ikke lenger standard. |

### Lokale modeller (Ollama / LM Studio / vLLM)

agentmemory snakker med enhver OpenAI-API-kompatibel server, så alt som eksponerer `/v1/chat/completions` fungerer uten kodeendringer. Ingen betalte nøkler, ingen sky, ingen rate-grenser; kjører helt på din egen maskinvare.

**Ollama** (standardport `11434`):

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

**LM Studio** (standardport `1234`):

Åpne LM Studio → Local Server-fanen → Start Server. Velg en hvilken som helst chat-modell fra velgeren (Qwen 3, gpt-oss, DeepSeek R1, osv.).

```env
# ~/.agentmemory/.env
OPENAI_API_KEY=lmstudio                        # any non-empty string; LM Studio ignores it
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=qwen3-8b                          # match the model name from LM Studio
```

**vLLM / llama.cpp / Text Generation Inference**: samme form. Pek `OPENAI_BASE_URL` mot hvilken URL serveren din eksponerer og sett `OPENAI_MODEL` til et navn serveren din vil godta.

**Modellvalg for hukommelsesarbeid**: komprimering og oppsummering er korte oppgaver (<2K tokens inn, <500 tokens ut) der en 7B instruct-modell er mer enn nok. Anbefalinger:

| Modell | Størrelse | Hvorfor |
|-------|------|-----|
| `qwen3:8b` | ~5.2 GB | Balansert standard på en 16 GB-maskin; sterk på uttrekk og verktøy-formet tekst |
| `qwen3:4b` | ~2.6 GB | Minste fornuftige alternativ; fint for komprimering, svakere for grafuttrekk |
| `qwen3-coder:30b` | ~19 GB | Beste lokale valg for kode-formede sesjoner (30B MoE, 3.3B aktive) på 24-32 GB maskinvare |
| `gpt-oss:20b` | ~14 GB | Sterk generell modell som får plass i 16 GB RAM |
| `deepseek-r1:8b` | ~5.2 GB | Resonnerings-distill; tregere men renere uttrekk |

Qwen 3-modeller tenker som standard og kan brenne hele tokenbudsjettet på resonnering før noe utdata. Sett `AGENTMEMORY_LLM_NOTHINK=1` for å legge til `/no_think` i grafuttrekk-promptene, og øk `MAX_TOKENS` (16384 fungerer) hvis uttrekkene kommer tomme tilbake.

Resonneringsmodeller (`o1`-stil med `<think>`-blokker) kan returnere tomt `content` med et `reasoning`-felt din lokale server ikke nødvendigvis eksponerer. Hvis uttrekkene kommer tomme tilbake, bytt til en ikke-resonnerende modell først. Miljøvariabelen `OPENAI_REASONING_EFFORT=none` kan også deaktivere tenking på Ollama Cloud-tenkemodeller som speiler OpenAIs resonnerings-skjema.

Lokale embeddings leveres som en valgfri avhengighet, men er ikke aktivert som standard. Sett `EMBEDDING_PROVIDER=local` for å velge `Xenova/all-MiniLM-L6-v2` (384 dimensjoner). Den første embedding-forespørselen laster ned modellen; inferens kjører på enheten etterpå. Uten denne innstillingen eller en ekstern embedding-nøkkel forblir vektorer deaktivert, `mem::search` bruker BM25, og `smart-search` kan fortsatt legge til eksisterende grafmatcher.

### Kostnadsbevisst modellvalg

Når LLM-skrevet bakgrunnskomprimering er aktivert med både en leverandør og `AGENTMEMORY_AUTO_COMPRESS=true`, kjører den på hver observasjon, så modellvalget endrer det månedlige forbruket betydelig. Fanget arbeidsbelastningsdata: 635 forespørsler / 888K tokens / 35 timer aktiv bruk, kjørt mot tre OpenRouter-modeller ved prisene fra 2026-05-23.

| Nivå | Modell | Input / 1M | Output / 1M | Kostnad for de fangede 35 timene | Merknader |
|------|-------|------------|-------------|---------------------------|-------|
| Anbefalt | `deepseek/deepseek-v4-flash-0731` | $0.07 | $0.14 | ~$0.07 (est.) | Nyeste DeepSeek; billigste anbefalte valg for komprimeringsarbeid. |
| Anbefalt | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | Solid komprimerings- og oppsummeringskvalitet til ~10x lavere kostnad enn Sonnet. |
| Anbefalt | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | Sterk koderesonnering hvis sesjonene dine er tungt kode-formede. |
| Premium | `anthropic/claude-sonnet-5` | $3.00 | $15.00 | ~$5.02 (est.) | Samme listepris som den målte Sonnet 4.6-kjøringen; $2/$10 introduksjonspris ut 2026-08-31. |
| Premium | `openai/gpt-5.6-sol` | $5.00 | $30.00 | ~$9 (est.) | Flaggskip-nivå; dyrt for alltid-på bakgrunnsarbeid. |
| Unngå | `anthropic/claude-opus-5` | $5.00 | $25.00 | ~$8.40 (est.) | Flaggskip-klasse modell; overforbruk for komprimering. |

Målte rader kommer fra den fangede kjøringen; (est.)-rader skalerer samme token-miks med hver modells listepris.

agentmemory skriver ut en kjøretidsadvarsel når `OPENROUTER_MODEL` matcher et premium-nivå-mønster. Sett `AGENTMEMORY_SUPPRESS_COST_WARNING=1` for å dempe den når du har gjort et informert valg.

Kvalitet vs kostnad for hukommelsesarbeid: komprimering er en oppsummeringsoppgave med relativt løse kvalitetskrav (agenten leser oppsummeringen på nytt, ikke brukeren). DeepSeek V4 Flash / V4 Pro / Qwen3-Coder ligger innenfor avrundingsfeilen av Sonnet på denne oppgaven, samtidig som de kostet 10-70x mindre. Spar premium-modellene til søk du leser direkte.

Kilder: [OpenRouter-prising for Claude Sonnet 5](https://openrouter.ai/anthropic/claude-sonnet-5), [DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash-0731), [DeepSeek-prisnotater](https://api-docs.deepseek.com/quick_start/pricing/).

### Hukommelse for flere agenter (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

I oppsett med flere agenter der flere roller deler én agentmemory-server (arkitekt / utvikler / reviewer / forsker / support-agent), tagger `AGENT_ID` hver skriving med rollen som utførte den. `AGENTMEMORY_AGENT_SCOPE` styrer om gjenkalling filtrerer etter denne taggen.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

To moduser:

| Modus | Tagger skriving | Filtrerer gjenkalling | Når brukes den |
|------|------------|---------------|-------------|
| `shared` (standard) | ja | nei | Kryss-agent-kontekst med revisjonsspor. Arkitekten kan se hva utvikleren noterte, men hver rad registrerer hvem som sa det. |
| `isolated` | ja | ja | Strikt separasjon. Arkitekten ser aldri utviklerens observasjoner/minner/sesjoner. |

Hva som tagges når `AGENT_ID` er satt: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. Rollen flyter fra `api::session::start` → `mem::observe` → `mem::compress` → KV.

Hva som filtreres i isolert modus: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Hvert endepunkt godtar `?agentId=<role>` for å overstyre per forespørsel, og `?agentId=*` for å gå ut av miljø-scopet helt. `/memories` godtar også `?includeOrphans=true` for å vise minner fra før AGENT_ID der `agentId` er udefinert.

Overstyring per kall på SDK-/REST-laget: hvert muterende endepunkt (`/session/start`, `/remember`) godtar et `agentId`-felt i forespørselskroppen som vinner over miljøvariabelen. Nyttig for kjøretider som ruter mange roller gjennom én serverprosess. MCP-verktøyet `memory_save` eksponerer samme `agentId`-felt, den frittstående stdio-serveren videresender både `agentId` og `project`, og lagrede minner bærer `agentId` inn i søkeindeksen, slik at agent-avgrenset søk dekker minner så vel som observasjoner.

Når `AGENT_ID` ikke er satt, forblir hukommelsen uten avgrensning (eldre oppførsel, ingen tagger, ingen filtre).

### Porter

agentmemory + iii-engine binder fire porter som standard. Hvis en omstart mislykkes med `port in use`, viser denne tabellen hvilken prosess du skal se etter.

| Port | Prosess | Formål | Miljøoverstyring |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | Intern strømme-worker (brukt av agentmemory + viewer) | `III_STREAM_PORT` (foretrukket) eller eldre `III_STREAMS_PORT` |
| `3113` | agentmemory | Viewer i realtid (`http://localhost:3113`) | `III_VIEWER_PORT` eller `AGENTMEMORY_VIEWER_URL` for den rapporterte URL-en |
| `49134` | iii-engine | WebSocket; workere registrerer seg her, OTel-telemetri flyter over den | `III_ENGINE_PORT` eller `III_ENGINE_URL` |

`--port <N>` endrer REST-ankeret og avleder strømmer `N+1`, viewer `N+2`, og engine-WebSocket `N+46023` bare der den tilsvarende uttrykkelige porten eller URL-en over ikke er satt. Det skaper ikke et isolert livssyklus-navnerom. Bruk `--instance 1` for en andre daemon; den bruker anker 3211, standard `3211/3212/3213/49234`, og får en separat `instance-1` data- og livssykluskatalog. Instanser 1 til 50 følger samme mønster.

Den fastlåste engine-en starter med `--no-update-check` (ingen oppdaterings- eller sikkerhetsvarsel-oppslag mot GitHub ved oppstart) og med iiis anonyme brukstelemetri av: agentmemory setter `III_TELEMETRY_ENABLED=false` for engine-en den starter med mindre du eksporterer variabelen selv, og den medfølgende compose-filen gjør det samme.

Opprydding av gjenværende prosesser når porter forblir bundet etter en krasjet kjøring:

```bash
# macOS / Linux — find whatever is on each port and kill it
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` henter inn både worker- og engine-pidfilen rent ved en graceful native avslutning. I Docker-modus flusher den den native workeren, stopper den eksakte validerte engine-containeren, og bevarer både containeren og dens `/data`-montering for en tapsfri omstart; neste oppstart validerer og gjenopptar den samme containeren. Docker-basert avinstallasjon krever `agentmemory remove --keep-data`: den fjerner delte agentmemory-administrerte filer samtidig som den bevarer den validerte containeren, dens datamontering, og livssyklus-posten som trengs for å gjenopprette dem. Destruktiv Docker-datasletting er med vilje overlatt til operatøren etter en sikkerhetskopi. CLI-en avviser også å adoptere eller signalere Docker- eller VM-portholdere (Docker-backend, vpnkit, colima) som den native engine-en med mindre `--force` sendes. Den manuelle opprydningen over er bare for post-krasj-tilfellet der ingen pidfil er igjen.

### Konfigurasjonsfil

Legg agentmemorys kjøretidskonfigurasjon i `~/.agentmemory/.env` i stedet for å eksportere variabler i hvert skall. Hvis viewer viser et oppsettshint som `export ANTHROPIC_API_KEY=...`, kopier det inn i denne filen som `ANTHROPIC_API_KEY=...` uten `export`-prefikset, og start deretter agentmemory på nytt.

Miljøvariabler i prosessen fungerer fortsatt og går foran verdier i filen.

På Windows ligger samme fil på `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

For å teste med et Claude Code Pro/Max-abonnement i stedet for en API-nøkkel, velg det inn uttrykkelig:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

LLM-skrevet observasjonskomprimering krever begge linjene: tilgang til en LLM-leverandør (inkludert denne uttrykkelige abonnement-fallbacken) og `AGENTMEMORY_AUTO_COMPRESS=true`. En leverandør alene lar standard syntetisk komprimeringsvei stå på plass.

Konsolidering (grafnoder, læringspunkter, krystaller) er på som standard når en LLM-leverandør er konfigurert. Velg deg uttrykkelig ut med `CONSOLIDATION_ENABLED=false` hvis du vil ha LLM-fri drift. Grafuttrekk er et eget flagg:

```env
GRAPH_EXTRACTION_ENABLED=true
# CONSOLIDATION_ENABLED=false   # opt out of auto-consolidation
```

### Miljøvariabler

Opprett `~/.agentmemory/.env`:

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
# OPENAI_MODEL=gpt-5.6-luna                # Optional: default model
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
# leave OFF unless you understand the Stop-hook recursion risk:
# AGENTMEMORY_ALLOW_AGENT_SDK=true

# Embedding provider (BM25-only when unset; local is an explicit opt-in)
# EMBEDDING_PROVIDER=local
# VOYAGE_API_KEY=...
# OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=https://api.openai.com   # Override for Azure / vLLM / LM Studio / proxies
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# OPENAI_EMBEDDING_DIMENSIONS=1536        # Required when the model is not in the known-models table
# OPENAI_EMBEDDING_BASE_URL=https://...   # Embeddings only; falls back to OPENAI_BASE_URL
# OPENAI_EMBEDDING_API_KEY=sk-...         # Embeddings only; wins over OPENAI_API_KEY when set

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

# Auth (generated into ~/.agentmemory/secret on first start when unset)
# AGENTMEMORY_SECRET=your-secret
# VIEWER_ALLOWED_ORIGINS=https://memory.example.com
# AGENTMEMORY_IMPORT_ROOT=~/projects

# Ports (defaults: 3111 API, 3113 viewer)
# III_REST_PORT=3111

# Engine usage telemetry (iii). Off unless you set it; true opts in.
# III_TELEMETRY_ENABLED=false

# Features
# AGENTMEMORY_AUTO_COMPRESS=false  # OFF by default. Requires an LLM
                                   # provider as well. When both are on,
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
# AGENTMEMORY_INJECT_CONTEXT=false # OFF by default. When on:
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
# AGENTMEMORY_LLM_NOTHINK=1        # Local reasoning models only: ask the
                                   # model to skip its hidden thinking pass
                                   # during graph extraction. Faster runs;
                                   # relation quality can drop slightly.
# CONSOLIDATION_ENABLED=false   # on by default when an LLM provider is configured
# LESSON_DECAY_ENABLED=true
# OBSIDIAN_AUTO_EXPORT=false
# AGENTMEMORY_EXPORT_ROOT=~/.agentmemory
# CLAUDE_MEMORY_BRIDGE=false
# SNAPSHOT_ENABLED=false

# Storage and durability
# AGENTMEMORY_STATE_BACKEND=file           # file (default) or redis; see "Storage backend" below
# AGENTMEMORY_REDIS_URL=redis://localhost:6379   # Required with redis, plain redis:// only
# AGENTMEMORY_STATE_SAVE_INTERVAL_MS=2000  # How often the engine writes file state to disk.
                                           # A hard kill loses at most this window.
# AGENTMEMORY_INDEX_SAVE_INTERVAL_MS=600000  # Minimum time between search index saves;
                                             # shutdown and deletes still save at once.
# AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=true   # One-time background trim of oversized graph
                                           # provenance; false skips it

# Sessions
# AGENTMEMORY_SESSION_SWEEP_ENABLED=true   # Hourly sweep marks sessions left active past
                                           # the threshold as abandoned. Deletes nothing;
                                           # new activity makes the session active again.
# AGENTMEMORY_SESSION_SWEEP_STALE_HOURS=24

# Capture filters (hooks)
# AGENTMEMORY_CAPTURE_ALLOW=               # Comma or space list of tool names or globs;
                                           # when set, only these tools are captured
# AGENTMEMORY_CAPTURE_DENY=                # Extra names or globs to skip, added to the
                                           # defaults: memory_*, toolsearch,
                                           # listmcpresources, fetchmcpresource
# AGENTMEMORY_CAPTURE_OUTPUT_MAX=8000      # Max characters of tool output per observation
# AGENTMEMORY_PRE_COMPACT_BUDGET=1500      # Token budget for PreCompact context; 0 disables

# Audit log
# AGENTMEMORY_AUDIT_RETENTION_MONTHS=0     # Drop month scopes older than N months; 0 keeps all
# AGENTMEMORY_AUDIT_INDEX_PERSIST=false    # 1 or true records index migration and cleanup
                                           # rows (debugging only)

# Team
# TEAM_ID=
# USER_ID=
# TEAM_MODE=private

# Tool visibility: "all" (54 tools, default) or "core" (8 tools, lean)
# AGENTMEMORY_TOOLS=core
```

---

<h2 id="api"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-api.svg"><img src="../assets/tags/section-api.svg" alt="API" height="32" /></picture></h2>

138 endepunkter på port `3111`. REST-API-en bindes til `127.0.0.1` som standard. Beskyttede endepunkter krever `Authorization: Bearer <secret>`, og mesh-synkroniseringsendepunkter krever en uttrykkelig satt `AGENTMEMORY_SECRET` på begge sider.

**Autentisering er på som standard.** Når `AGENTMEMORY_SECRET` ikke er satt (i skallet eller i `~/.agentmemory/.env`), genererer serveren en tilfeldig hemmelighet ved første oppstart og lagrer den i `~/.agentmemory/secret` med modus `0600`. Hver medfølgende klient leser den fra der når den snakker med en lokal server: CLI-en, viewer, hookene under `plugin/scripts`, MCP-serveren og `@agentmemory/mcp`-shimmen, konfigurasjonene skrevet av `agentmemory connect`, og de medfølgende OpenCode-, Pi-, OpenClaw-, Hermes-, og filsystem-overvåker-integrasjonene. Den lagrede hemmeligheten sendes bare til loopback-URL-er (`localhost`, `127.0.0.0/8`, `::1`). En uttrykkelig `AGENTMEMORY_SECRET` vinner alltid, og eksterne klienter trenger den fortsatt satt. Docker og `deploy/`-entrypointene genererer og eksporterer allerede sin egen hemmelighet. For å kalle API-en manuelt:

```bash
curl -H "Authorization: Bearer $(cat ~/.agentmemory/secret)" http://localhost:3111/agentmemory/health
```

**Forespørselsregler for skriving.** `POST`-, `PUT`-, `PATCH`-, og `DELETE`-forespørsler til REST-API-en og viewer må sende `Content-Type: application/json` (en `charset`-parameter er greit) når de har en kropp, og en `Origin`-header, når den er til stede, må være en loopback-opprinnelse for den konfigurerte REST- eller viewer-porten eller være listet i `VIEWER_ALLOWED_ORIGINS` (kommaseparert, f.eks. `https://memory.example.com`). Klienter som sender ingen `Origin`-header (CLI, hooks, MCP, curl, server-til-server) er ikke påvirket. Viewer godtar også sin egen opprinnelse.

**Filstier.** Endepunkter som leser eller skriver filer (`/compress-file`, `/replay/import-jsonl`, `/graph/import-graphify`) godtar bare stier under `~/.agentmemory`, instansens datakatalog, eller en katalog listet i `AGENTMEMORY_IMPORT_ROOT` (separer flere med `:`, eller `;` på Windows). `/replay/import-jsonl` godtar også sin standard `~/.claude/projects`. `/obsidian/export` holder seg innenfor `AGENTMEMORY_EXPORT_ROOT` og `/migrate` innenfor `~/.agentmemory`. Symlinker løses opp før hver kontroll.

**Fjerning av hemmeligheter.** API-nøkler, bearer-tokens, PEM-private-key-blokker, og credentials innebygd i URL-er (`scheme://user:password@host`) sladdes før tekst lagres, på hver skrivevei: observasjoner, remember, evolve, slots, læringspunkter, handlinger, sketches, signaler, checkpoints, imports, jsonl-avspilling, mesh-synkronisering, team-delinger, komprimerings- og oppsummeringsutdata, krystaller, og grafnoder.

<details>
<summary>Viktige endepunkter</summary>

| Metode | Sti | Beskrivelse |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Helsekontroll (alltid offentlig) |
| `GET` | `/agentmemory/status` | Hva er galt og hvordan fikse det (HTML for nettlesere, JSON ellers) |
| `GET` | `/agentmemory/viewer/snapshot` | Alt viewer viser, i én respons |
| `POST` | `/agentmemory/session/start` | Start sesjon + hent kontekst |
| `POST` | `/agentmemory/session/end` | Avslutt sesjon |
| `POST` | `/agentmemory/observe` | Fang observasjon (se fangstlevering under) |
| `GET` | `/agentmemory/capture` | Fangst-innboks, dead letters, og offline-kø |
| `POST` | `/agentmemory/capture/retry` | Prøv dead-letter-fangster på nytt |
| `POST` | `/agentmemory/capture/drain` | Send den lokale offline-køen nå |
| `POST` | `/agentmemory/smart-search` | Hybridsøk |
| `POST` | `/agentmemory/context` | Generer kontekst |
| `POST` | `/agentmemory/remember` | Lagre til langtidshukommelse |
| `POST` | `/agentmemory/forget` | Slett observasjoner |
| `POST` | `/agentmemory/enrich` | Filkontekst + minner + feil |
| `GET` | `/agentmemory/profile` | Prosjektprofil |
| `GET` | `/agentmemory/export` | Eksporter all data |
| `POST` | `/agentmemory/import` | Importer fra JSON |
| `POST` | `/agentmemory/graph/query` | Kunnskapsgraf-spørring |
| `POST` | `/agentmemory/graph/compact` | Beskjær overdimensjonert grafopprinnelse |
| `POST` | `/agentmemory/team/share` | Del med team |
| `GET` | `/agentmemory/audit` | Revisjonsspor |

Full endepunktliste: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

**Fangstlevering.** Hooks sender hver observasjon én gang til `POST /agentmemory/observe` med en `eventId`. Dette er vertens egen id for kallet når nyttelasten har en (for eksempel Claude Codes `tool_use_id`), ellers en hash av sesjonen, hook-typen, verktøynavnet, inndata, utdata, og vert-tidsstempelet. Serveren skriver hendelsen til en fangst-innboks i state-lageret, lagrer observasjonen, og fjerner deretter innboks-oppføringen. Statuskoden sier hva som skjedde:

| Status | `status`-felt | Betydning |
|---|---|---|
| `201` | `accepted` | Lagret. `observationId` er den nye observasjonen. |
| `202` | `accepted` (`state: "retrying"`) | Akseptert, men lagring mislyktes. Serveren prøver på nytt, også etter en omstart. |
| `200` | `duplicate` | Denne `eventId`-en var allerede akseptert. `observationId` er den eksisterende observasjonen; ingenting nytt lagres. |
| `400` / `422` | `rejected` | Ugyldig nyttelast, eller lagring mislyktes permanent (hendelsen beholdes som et dead letter). |
| `503` | `rejected` (`retryable: true`) | Innboksen er full (`AGENTMEMORY_CAPTURE_INBOX_MAX`). Hooks mellomlagrer hendelsen og sender den senere. |

Mislykkede hendelser prøves på nytt hvert `AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS` (10 sek) med doblende backoff, opp til `AGENTMEMORY_CAPTURE_MAX_ATTEMPTS` (5). Hendelser som fortsatt mislykkes forblir i innboksen som dead letters, listes på `/agentmemory/status` og viewerens Health-side, og kan prøves på nytt med `POST /agentmemory/capture/retry` (`{"eventId": "..."}` eller `{"all": true}`). Aksepterte hendelses-ID-er huskes i `AGENTMEMORY_CAPTURE_DEDUP_HOURS` (168 timer, høyst `AGENTMEMORY_CAPTURE_EVENTS_MAX` ID-er), slik at en hook som spilles av igjen etter en timeout eller en omstart lagres én gang, mens to separate verktøykall med sine egne vert-ID-er lagres to ganger selv når innholdet deres er identisk. Når en observasjon slettes (forget, sesjonssletting, eviction, auto-forget, eller en import som erstatter lageret), markeres hendelsen som slettet før observasjonen fjernes, slik at en avspilling av den hendelsen innenfor samme vindu besvares som et duplikat og lagrer ingenting. State-lageret skriver til disk hvert 2. sekund, så et besvart event kan fortsatt bare være i minnet et øyeblikk. For å dekke dette bærer også hvert `2xx`-svar serverens `bootId` (ny ved hver oppstart), `acceptedAt`, og `durableAfterMs` (lagringsintervallet pluss 1.5 sek på filbasertet, 1.5 sek på redis, der persistens er operatørens innstilling). Hooks holder på hendelsen i den lokale mellomlagringen til dette vinduet er passert og sletter den ved et senere kall uten en ny forespørsel. Hvis `bootId` har endret seg da, har serveren startet på nytt, så hooken sender hendelsen på nytt med samme `eventId`; en hendelse som nådde disken lagres ikke to ganger. Serveren sender også slike hendelser selv ved oppstart og ved hvert retry-intervall, slik at en omstart ikke taper noe selv når ingen hook kjører etterpå. Eldre hooks ignorerer de ekstra feltene, og nye hooks mot en eldre server forkaster hendelsen ved `2xx` som før.

Når serveren er nede, ikke svarer i tide, eller returnerer en 5xx, legger hooken observasjonen til en lokal mellomlagringsfil, `<data dir>/capture-spool/<host>-<port>.jsonl` (overstyr mappen med `AGENTMEMORY_CAPTURE_SPOOL_DIR`). Filen er privat for brukeren din (modus 600), hemmeligheter sladdes på samme måte som serveren sladder dem, den har plass til høyst `AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES` (5 MiB) og dropper oppføringer eldre enn `AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS` (168). Når den er full, droppes nye oppføringer og telles, og `/agentmemory/status` rapporterer det. Hooken avsluttes fortsatt med 0 innen tidsgrensen og legger ikke til noen forespørsel når serveren er sunn. Mellomlagringen sendes ved neste oppstart og av den første hooken som når serveren igjen, i en bakgrunnsprosess slik at agenten ikke venter. Hendelses-ID-er gjør dette trygt: en observasjon som faktisk ankom før en timeout lagres ikke to ganger. `npx @agentmemory/agentmemory capture` viser mellomlagringen og serverinnboksen, `--drain` sender mellomlagringen nå, og `GET /agentmemory/capture` returnerer samme som JSON. Sett `AGENTMEMORY_CAPTURE_SPOOL=false` for å skru av mellomlagringen.

**Komprimering av grafopprinnelse.** Hver kunnskapsgraf-node og -kant holder ID-ene til de nyeste 32 observasjonene den kom fra. Lagre skrevet før dette taket kan holde tusenvis av ID-er per "varm" node, noe som gjør grafsøk og viewer treg eller feller workeren. agentmemory fikser dette selv: ved den første oppstarten etter en oppgradering beskjærer den hver node, kant, erstattet kant (den temporale grafhistorikken), og den bufrede snapshoten til taket i bakgrunnen, i små skiver med en pause mellom dem, slik at søk, fangst, og viewer fortsetter å fungere. Den lagrer fremdriften sin, fortsetter etter en omstart, og kjører aldri igjen når den er ferdig. `/agentmemory/status` og viewerens Health-side viser den som ventende, kjørende (med nåværende scope og posisjon), ferdig, eller mislykket. Sett `AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false` for å skru den av.

For å kjøre den manuelt, kall `POST /agentmemory/graph/compact`. Den går gjennom navne- og kant-nøkkel-indeksene i stedet for å liste hver node og kant, og er trygg å kjøre på nytt. Når den beskjærer ID-er skriver den en `graph_compact`-revisjonsoppføring.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{}'
```

På et stort lager, eller når kallet returnerer 504, kjør det i skiver. Send `scope` (`nodes`, `edges`, eller `history`), `offset`, og `limit`, og kall deretter på nytt med den returnerte `nextOffset` til den er `null`. Gjør dette for `nodes`, `edges`, og `history`, og avslutt med ett `{"scope":"snapshot"}`-kall, fordi en skivet kjøring ikke berører den bufrede snapshoten.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"nodes","offset":0,"limit":200}'
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"snapshot"}'
```

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Development" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 2,600+ tests
npm run test:integration  # API tests (requires running services)
```

**Forutsetninger:** Node.js >= 20 med npm/npx; [iii-engine](https://iii.dev/docs) v0.22.1 eller Docker. Den automatiske engine-installasjonen på macOS/Linux krever også `curl`, en POSIX-`sh`, og `tar`; native Windows bruker den manuelt fastlåste `iii.exe`, WSL2, eller Docker Desktop.

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="License" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)


