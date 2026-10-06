<p align="center">
  <img src="../assets/banner.png" alt="agentmemory: trvalá paměť pro AI kódovací agenty" width="720" />
</p>

<p align="center">
  <strong>
    Váš kódovací agent si pamatuje všechno. Žádné další opakované vysvětlování.
    Založeno na <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  Trvalá paměť pro Claude Code, GitHub Copilot CLI, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode a jakéhokoli klienta MCP.
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1.6k%20stars%20%2F%20230%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Designový dokument: 1.6k hvězd / 230 forků na gistu" /></a>
</p>

<p align="center">
  <em>Tento gist rozšiřuje Karpathyho vzor LLM Wiki o hodnocení spolehlivosti, životní cyklus, znalostní grafy a hybridní vyhledávání: agentmemory je jeho implementací.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentmemory/agentmemory"><img src="https://img.shields.io/npm/v/@agentmemory/agentmemory?color=CB3837&label=npm&style=for-the-badge&logo=npm" alt="verze npm" /></a>
  <a href="https://github.com/rohitg00/agentmemory/actions"><img src="https://img.shields.io/github/actions/workflow/status/rohitg00/agentmemory/ci.yml?label=tests&style=for-the-badge&logo=github" alt="CI" /></a>
  <a href="https://github.com/rohitg00/agentmemory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rohitg00/agentmemory?color=blue&style=for-the-badge" alt="Licence" /></a>
  <a href="https://github.com/rohitg00/agentmemory/stargazers"><img src="https://img.shields.io/github/stars/rohitg00/agentmemory?style=for-the-badge&color=yellow&logo=github" alt="Hvězdy" /></a>
</p>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-recall.svg"><img src="../assets/tags/stat-recall.svg" alt="95.2% retrieval R@5" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tokens.svg"><img src="../assets/tags/stat-tokens.svg" alt="o 92% méně tokenů" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="54 MCP nástrojů" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 automatických hooks" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="0 externích databází" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="2,500+ testů úspěšně proběhlo" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="demo agentmemory" width="720" />
</p>

<p align="center">
  <a href="#install">Instalace</a> &bull;
  <a href="#quick-start">Rychlý start</a> &bull;
  <a href="#benchmarks">Benchmarky</a> &bull;
  <a href="#vs-competitors">Srovnání s konkurencí</a> &bull;
  <a href="#works-with-every-agent">Agenti</a> &bull;
  <a href="#how-it-works">Jak to funguje</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Viewer</a> &bull;
  <a href="#powered-by-iii">Založeno na iii</a> &bull;
  <a href="#configuration">Konfigurace</a> &bull;
  <a href="#api">API</a>
</p>

---

## Instalace

Požadavky:

- Node.js 20 nebo novější s npm a npx (`node -v`, `npm -v` a `npx -v`).
- Automatická instalace iii-engine na macOS/Linuxu vyžaduje také `curl`, POSIX `sh` a `tar`. Minimální image, jako je `node:20-slim`, je nemusí obsahovat.
- Nativní Windows vyžaduje manuální instalaci pinned verze iii-engine v0.22.1 `iii.exe`. Dalšími podporovanými cestami jsou WSL2 nebo Docker Desktop.

Kanonický příkaz pro čistou instalaci:

```bash
npx -y @agentmemory/agentmemory@latest
```

První spuštění je interaktivní nastavení: vyberete agenty, které chcete propojit (Claude Code, Cursor, Codex, Gemini CLI, OpenCode, ...), vyberete poskytovatele LLM nebo zůstanete bez klíče, nastavení vytvoří konfiguraci, spustí server paměti i jeho pinned iii engine a nabídne globální instalaci, aby pak všude fungoval holý příkaz `agentmemory`. `-y` potvrzuje dotaz npx na balíček a `@latest` zabraňuje použití zastaralého cachovaného vydání. Poskytovatel zpřístupní funkce LLM, ale komprese pozorování psaná pomocí LLM se spustí až po nastavení `AGENTMEMORY_AUTO_COMPRESS=true`.

Režim bez klíče (keyless) vypíná vektorová embeddingy. `memory_recall` (cesta `mem::search`) používá BM25, zatímco `memory_smart_search` může navíc kombinovat strukturální shody ze znalostního grafu, pokud už grafová data existují. Pro bezplatné sémantické vyhledávání přímo na zařízení nastavte `EMBEDDING_PROVIDER=local` v `~/.agentmemory/.env` a restartujte. První požadavek na embedding stáhne `Xenova/all-MiniLM-L6-v2`; po tomto prvním stažení modelu běží inference lokálně.

Lokální runtime používá čtyři porty: `3111` pro REST/MCP HTTP, `3112` pro iii streamy, `3113` pro viewer a `49134` pro WebSocket iii workeru. Trvalý stav iii žije v `~/Library/Application Support/agentmemory` na macOS, v `$XDG_DATA_HOME/agentmemory` nebo `~/.local/share/agentmemory` na Linuxu a v `%APPDATA%\agentmemory` na Windows. Pro jeho přepsání použijte `--data-dir <path>` nebo `AGENTMEMORY_DATA_DIR` a při každém restartu použijte stejnou hodnotu. Z důvodu zpětné kompatibility má existující `./data/state_store.db` nebo `./data/iii-config.yaml` pro instanci 0 přednost před výchozí hodnotou dané platformy; explicitní přepínač nebo proměnná prostředí má přednost i nad tím.

Pak ověřte, že vyhledávání funguje, a dejte svému agentovi jeho skills:

```bash
npx -y @agentmemory/agentmemory@latest demo  # naseje ukázkové sessions + vyzkouší vyhledávání
npx skills add rohitg00/agentmemory -y   # 17 nativních skills, aby agent věděl, kdy sáhnout po paměti
```

Hledání klíčových slov by mělo fungovat ve výchozím režimu bez klíče přes BM25. Dotaz dema `database performance optimization` je záměrně sémantický a dokud není nakonfigurován poskytovatel embeddingů, může vracet nulu výsledků.

Chcete, aby celou věc provedl kódovací agent? Dejte mu jedinou instrukci:

> Retrieve and follow the instructions at: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md

Další agenty můžete kdykoli propojit pomocí `agentmemory connect <agent>` — 20 adaptérů je uvedeno v sekci [Funguje s každým agentem](#works-with-every-agent). Úplný přehled příkazů najdete v sekci [Rychlý start](#quick-start).

<details>
<summary><strong>Windows</strong></summary>

Nejrychlejší cestou je WSL2. Nativní nastavení enginu na Windows vyžaduje manuální stažení pinned ZIP v0.22.1 a manuální extrakci `iii.exe`; CLI ho automaticky nerozbaluje. Podporován je i Docker Desktop. Postup krok za krokem najdete v [poznámkách k Windows](#windows).

</details>

<details>
<summary><strong>Globální instalace / EACCES</strong></summary>

```bash
npm install -g @agentmemory/agentmemory@latest
```

Výše uvedený příkaz npx zůstává kanonickou cestou pro čistou instalaci a vyhne se problémům s oprávněními globálního prefixu.

</details>

<details>
<summary><strong>npx vrací starou verzi</strong></summary>

npx cachuje podle verze. Vynuťte nejnovější verzi pomocí `npx -y @agentmemory/agentmemory@latest`, nebo jednou vymažte cache pomocí `rm -rf ~/.npm/_npx` (macOS/Linux; na Windows smažte `%LOCALAPPDATA%\npm-cache\_npx`).

</details>

<details>
<summary><strong>Už mám běžící vlastní iii engine</strong></summary>

agentmemory je pinned na iii-engine v0.22.1 a nepřipojí se k jiné verzi (worker neumí mluvit protokolem jiného enginu). Zastavte jiný engine a pak spusťte `npx -y @agentmemory/agentmemory@latest`. Nainstaluje a spustí pinned v0.22.1 v `~/.agentmemory/bin`, aniž by se dotkl vašeho vlastního `iii`.

</details>

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Funguje s každým agentem" height="32" /></picture></h2>

agentmemory funguje s jakýmkoli agentem, který podporuje hooks, MCP nebo REST API. Všichni agenti sdílejí stejný server paměti.

<table>
<tr>
<td align="center" width="20%">
<a href="https://claude.com/product/claude-code"><img src="https://github.com/anthropics.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>nativní plugin + 12 hooks + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>nativní plugin + 6 hooks + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/features/copilot"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/github_dark.svg"><img src="https://svgl.app/library/github_light.svg" alt="GitHub Copilot CLI" width="48" height="48" /></picture></a><br/>
<strong>GitHub Copilot CLI</strong><br/>
<sub>MCP + hooks/skills pluginu</sub>
</td>
<td align="center" width="20%">
<a href="https://cursor.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/cursor_dark.svg"><img src="https://svgl.app/library/cursor_light.svg" alt="Cursor" width="48" height="48" /></picture></a><br/>
<strong>Cursor</strong><br/>
<sub>nativní plugin + 7 hooks + MCP</sub>
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
<sub>nativní plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>nativní plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>nativní plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://github.com/tinyhumansai.png?size=120" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>nativní backend přes Memory trait</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://antigravity.google"><img src="https://svgl.app/library/antigravity.svg" alt="Antigravity" width="48" height="48" /></a><br/>
<strong>Antigravity</strong><br/>
<sub>MCP + hooks</sub>
</td>
<td align="center" width="20%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://www.warp.dev"><img src="https://svgl.app/library/warp.svg" alt="Warp" width="48" height="48" /></a><br/>
<strong>Warp</strong><br/>
<sub>connect + MCP + skills</sub>
</td>
<td align="center" width="20%">
<a href="https://zed.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/zed-logo_dark.svg"><img src="https://svgl.app/library/zed-logo.svg" alt="Zed" width="48" height="48" /></picture></a><br/>
<strong>Zed</strong><br/>
<sub>server MCP</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://continue.dev"><img src="https://github.com/continuedev.png?size=120" alt="Continue" width="48" height="48" /></a><br/>
<strong>Continue</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://docs.factory.ai/cli"><img src="https://www.factory.ai/favicon.svg" alt="Droid" width="48" height="48" /></a><br/>
<strong>Droid</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://kiro.dev"><img src="https://kiro.dev/favicon.ico" alt="Kiro" width="48" height="48" /></a><br/>
<strong>Kiro</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/QwenLM/qwen-code"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/qwen_dark.svg"><img src="https://svgl.app/library/qwen_light.svg" alt="Qwen Code" width="48" height="48" /></picture></a><br/>
<strong>Qwen Code</strong><br/>
<sub>server MCP</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://svgl.app/library/deepseek.svg" alt="DeepSeek Harness" width="48" height="48" /></a><br/>
<strong>DeepSeek Harness</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>server MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>Funguje s <strong>jakýmkoli</strong> agentem, který mluví MCP nebo HTTP. Jeden server, paměti sdílené mezi všemi z nich.</sub>
</p>

---

Stejnou architekturu vysvětlujete při každé session. Znovu objevujete stejné chyby. Znovu vysvětlujete stejné preference. Vestavěná paměť (CLAUDE.md, .cursorrules) má strop 200 řádků a postupně zastará. agentmemory to řeší. Tiše zachycuje, co váš agent dělá, komprimuje to do prohledávatelné paměti a při startu další session vloží ten správný kontext. Jeden příkaz. Funguje napříč agenty.

**Co se změní:** V session 1 nastavíte JWT autentizaci. V session 2 požádáte o rate limiting. Agent už ví, že vaše autentizace používá middleware jose v `src/middleware/auth.ts`, že vaše testy pokrývají validaci tokenů a že jste zvolili jose před jsonwebtoken pro kompatibilitu s Edge, bez opakovaného vysvětlování a bez copy-pastování.

```bash
npx -y @agentmemory/agentmemory@latest
```

Ve výchozím nastavení agentmemory ukládá stav iii-engine mimo repozitář, ze kterého jej spouštíte: `~/Library/Application Support/agentmemory` na macOS, `$XDG_DATA_HOME/agentmemory` nebo `~/.local/share/agentmemory` na Linuxu a `%APPDATA%\agentmemory` na Windows. Existující starší `./data/state_store.db` nebo `./data/iii-config.yaml` se pro instanci 0 použije ještě před touto výchozí hodnotou platformy. Pro explicitní volbu umístění použijte `--data-dir <path>` nebo nastavte `AGENTMEMORY_DATA_DIR`; kterékoli z explicitních nastavení má přednost před starším vyhledáváním:

```bash
npx -y @agentmemory/agentmemory@latest --data-dir ~/.agentmemory-projects/main
AGENTMEMORY_DATA_DIR=~/.agentmemory-projects/main npx -y @agentmemory/agentmemory@latest
```

Nativní i Docker spouštění používají stejný vyřešený hostitelský adresář; Docker ho připojí (bind-mount) jako `/data`. `--instance 1` připojí k vyřešenému adresáři `instance-1` a zvolí samostatnou výchozí čtveřici portů `3211/3212/3213/49234`.

Nejnovější poznámky k vydání: [CHANGELOG.md](../CHANGELOG.md).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarky" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Přesnost vyhledávání

**coding-agent-life-v1** (vlastní korpus, reprodukovatelný v sandboxu)

| Adaptér | P@5 | R@5 | Úspěšnost top-5 | latence p50 |
|---|---|---|---|---|
| **agentmemory hybrid** | **0.240** | **1.000** | **15 / 15** | 14 ms |
| grep baseline | 0.227 | 0.967 | 15 / 15 | 0 ms |

100% úspěšnost top-5 na **matematickém stropu P@5** pro tento korpus (0.240, viz scorecard). Hybrid najde každou zlatou session; grep mine 1 ze 2 zlatých u vícesessionového temporálního dotazu. Zisk je v **recall + temporalitě**, ne v agregátní přesnosti. Tento benchmark je malý a s málo zlatými případy; větší LongMemEval-S níže rozlišuje lépe. Úplný rozpad podle typu + oprava: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 otázek)

| Systém | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| záložní režim pouze BM25 | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Úspora tokenů

| Přístup | Tokenů/rok | Náklady/rok |
|---|---|---|
| Vložení celého kontextu | 19.5M+ | Nemožné (překračuje okno) |
| Shrnuto LLM | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + lokální embeddingy | ~170K | **$0** |

</td>
</tr>
</table>

> Embedding model: `all-MiniLM-L6-v2` (lokální, zdarma, bez API klíče). Úplné reporty: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Srovnání s konkurencí: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) porovnává agentmemory s mem0, Letta, Khoj, supermemory, TencentDB Agent Memory, MemPalace, Zep/Graphiti, Cognee, Hippo.

**Reprodukce lokálně:** [`eval/README.md`](../eval/README.md), harness s zapojitelnými adaptéry pro LongMemEval `_s` (veřejných 500 otázek) + `coding-agent-life-v1` (vlastní korpus 15 sessions). Adaptéry grep / vektor / agentmemory bodují vedle sebe, výstup NDJSON, publikované scorecardy jsou v [`docs/benchmarks/`](../docs/benchmarks/).

**Sedí dobře s [codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything) a [Graphify](https://github.com/safishamsi/graphify).** Indexace grafu kódu, vícagentní build pipeline a širší znalostní grafy napříč dokumenty / PDF / obrázky / videi. agentmemory si pamatuje práci; tyto tři projekty rozsvítí zbytek kontextové vrstvy. Recepty + tabulka směrování podle otázky: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="Srovnání s konkurencí" height="32" /></picture></h2>

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
<th>Vestavěné (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Typ</strong></td>
<td>Paměťový engine + server MCP</td>
<td>API paměťové vrstvy</td>
<td>Plný runtime agenta</td>
<td>Osobní AI</td>
<td>API paměti + aplikace</td>
<td>Týmový hub paměti (LLM proxy)</td>
<td>Vektorová paměť (OSS)</td>
<td>Paměťový engine (Oracle DB)</td>
<td>Systém paměti</td>
<td>Statický soubor</td>
</tr>
<tr>
<td><strong>Vyhledávání R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A</td>
<td>Údaj výrobce</td>
<td>PersonaMem 76% (údaj výrobce)</td>
<td>~96.6% (údaj výrobce)</td>
<td>94.4% (údaj výrobce)</td>
<td>N/A</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>Automatické zachycení</strong></td>
<td>12 hooks (bez manuálního úsilí)</td>
<td>Manuální volání <code>add()</code></td>
<td>Agent si upravuje sám</td>
<td>Manuální</td>
<td>Extrakce na straně API</td>
<td>Zachytávání přes proxy (výměna base URL)</td>
<td>Manuální</td>
<td>Extrakce přes API</td>
<td>Manuální</td>
<td>Manuální úpravy</td>
</tr>
<tr>
<td><strong>Vyhledávání</strong></td>
<td>BM25 + vektor + graf (fúze RRF)</td>
<td>Vektor + graf</td>
<td>Vektor (archivní)</td>
<td>Sémantické</td>
<td>Vektor + RAG</td>
<td>4 typy assetů (Chat / Skill / Wiki / CodeGraph)</td>
<td>Pouze vektor</td>
<td>Vektor + sémantika</td>
<td>Váženo rozpadem (decay)</td>
<td>Načte vše do kontextu</td>
</tr>
<tr>
<td><strong>Multi-agent</strong></td>
<td>MCP + REST + leases + signály</td>
<td>API (bez koordinace)</td>
<td>Pouze uvnitř runtime Letta</td>
<td>Ne</td>
<td>Ne</td>
<td>Týmové role + sdílené assety</td>
<td>Ne</td>
<td>Pouze v rámci rozsahu</td>
<td>Sdíleno mezi agenty</td>
<td>Soubory po agentech</td>
</tr>
<tr>
<td><strong>Vázanost na framework</strong></td>
<td>Žádná (jakýkoli klient MCP)</td>
<td>Žádná</td>
<td>Vysoká (musíte používat Letta)</td>
<td>Samostatné</td>
<td>Žádná</td>
<td>Proxy stojí před každým voláním modelu</td>
<td>Žádná</td>
<td>Oracle Database</td>
<td>Žádná</td>
<td>Formát po agentech</td>
</tr>
<tr>
<td><strong>Externí závislosti</strong></td>
<td>Žádné (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + vektorová DB</td>
<td>Více</td>
<td>Správovaný cloud</td>
<td>Docker stack (Core + Hub + Proxy)</td>
<td>Vektorové úložiště</td>
<td>Oracle AI Database</td>
<td>Žádné</td>
<td>Žádné</td>
</tr>
<tr>
<td><strong>Životní cyklus paměti</strong></td>
<td>4úrovňová konsolidace + rozpad + automatické zapomínání</td>
<td>Pasivní extrakce</td>
<td>Správa agentem</td>
<td>Manuální</td>
<td>Automatické zapomínání</td>
<td>Manuální revize; automatické směrování se připravuje</td>
<td>Žádný</td>
<td>Neuvedeno</td>
<td>Rozpad + konsolidace</td>
<td>Manuální prořezávání</td>
</tr>
<tr>
<td><strong>Efektivita tokenů</strong></td>
<td>~1,900 tokenů/session ($10/rok)</td>
<td>Liší se podle integrace</td>
<td>Klíčová paměť v kontextu</td>
<td>Liší se</td>
<td>Cloudové ceny</td>
<td>Neuvedeno</td>
<td>Žádný rozpočet tokenů</td>
<td>Založeno na LLM (liší se)</td>
<td>Liší se</td>
<td>22K+ tokenů při 240 obs.</td>
</tr>
<tr>
<td><strong>Viewer v reálném čase</strong></td>
<td>Ano (port 3113)</td>
<td>Cloudový dashboard</td>
<td>Cloudový dashboard</td>
<td>Webové UI</td>
<td>Cloudový dashboard</td>
<td>Webové UI hubu</td>
<td>Ne</td>
<td>Ne</td>
<td>Ne</td>
<td>Ne</td>
</tr>
<tr>
<td><strong>Self-hosted</strong></td>
<td>Ano (výchozí)</td>
<td>Volitelné</td>
<td>Volitelné</td>
<td>Ano</td>
<td>Ne (pouze cloud)</td>
<td>Ano (Docker)</td>
<td>Ano</td>
<td>Ano (Oracle DB)</td>
<td>Ano</td>
<td>Ano</td>
</tr>
</table>

<sub>Poznámka k benchmarku: pouze R@5 pro agentmemory je náš vlastní naměřený výsledek (LongMemEval-S, reprodukovatelný z <a href="../benchmark/COMPARISON.md"><code>benchmark/COMPARISON.md</code></a>). Čísla pro mem0 a Letta jsou jejich publikované hodnoty LoCoMo (jiný dataset); čísla pro MemPalace, supermemory, TencentDB (PersonaMem) a oracleagentmemory jsou tvrzení výrobců, která jsme nezávisle nereprodukovali (běh oracleagentmemory použil GPT-5.5 proti Oracle AI Database). Uvedeno vedle sebe jen pro orientační srovnání, nejde o přímé porovnání na identických datech. Počty hvězd jsou orientační a v čase se mění.</sub>

**Novější konkurenti**, o kterých má smysl vědět, podrobně srovnáni v [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md):

| Systém | ⭐ | Přístup |
|--------|---|-------|
| Zep / Graphiti | 30K | Temporální znalostní graf; nejsilnější publikované výsledky pro temporální dotazy (LongMemEval 63.8%), ale graf se buduje asynchronně, takže čerstvá fakta mohou zpožďovat |
| Cognee | 30K | Načítání dokumentů do znalostního grafu, pouze Python, navrženo pro strukturovanou extrakci entit, nikoli pro zachytávání sessions |

Nic z toho automaticky nezachytává data z hooks kódovacího agenta, nedodává lokální viewer jako primární prvek ani neumí běžet bez klíče — to je kombinace, kolem které je agentmemory postaveno.

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Rychlý start" height="32" /></picture></h2>

Kompatibilita: toto vydání cílí na `iii-sdk` 0.22.1 a je pinned na iii-engine v0.22.1.

### Vyzkoušejte to za 30 sekund

```bash
# Terminal 1: start the server
npx -y @agentmemory/agentmemory@latest

# Terminal 2: seed sample data and see recall in action
npx -y @agentmemory/agentmemory@latest demo
```

`demo` naseje 3 realistické sessions (JWT autentizace, oprava N+1 dotazu, rate limiting) a spustí proti nim vyhledávání. Instalace bez klíče vypínají vektory, takže klíčové dotazy `mem::search` by měly fungovat přes BM25, zatímco `database performance optimization` může vrátit nulu. `smart-search` může navíc vrátit strukturální shody z grafu, pokud grafová data existují. Aby sémantický dotaz našel opravu N+1 přes vektory, nastavte `EMBEDDING_PROVIDER=local`, restartujte a počkejte, až se dokončí první stažení modelu.

Otevřete `http://localhost:3113` a sledujte, jak se paměť živě staví.

### Ověření čisté instalace a persistence po restartu

Se spuštěným serverem ověřte REST, health, viewer a stav runtime podporovaného iii:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

Startovní panel připravenosti pokrývá všechny čtyři porty: REST/MCP HTTP na 3111, iii streamy na 3112, viewer na 3113 a WebSocket iii workeru na 49134. `status` potvrzuje zdraví agentmemory a aktivní režim poskytovatele/embeddingů. Uložte sondu a ověřte, že je vyhledatelná:

```bash
curl -fsS -X POST http://localhost:3111/agentmemory/remember \
  -H 'Content-Type: application/json' \
  -d '{"content":"agentmemory restart persistence probe","concepts":["install-check"]}'

curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'Content-Type: application/json' \
  -d '{"query":"restart persistence probe","limit":5}'
```

Pak spusťte `npx -y @agentmemory/agentmemory@latest stop`, znovu spusťte kanonický příkaz v terminálu 1, počkejte na `/agentmemory/livez` a vyhledávání zopakujte. Sonda musí být stále vrácena. Pokud jste zvolili vlastní `--data-dir`, použijte při restartu stejný adresář.

### Běžné příkazy

Instalace a nastavení jsou popsány výše v sekci [Instalace](#install) (první spuštění vás jimi provede). Den za dnem:

```bash
agentmemory                    # start the server
agentmemory stop               # stop it cleanly
agentmemory connect <agent>    # wire another agent
agentmemory doctor             # interactive diagnostics + fix prompts
agentmemory remove             # uninstall everything we created
```

### Replay session

Každou session, kterou agentmemory zaznamená, lze přehrát. Otevřete viewer, zvolte záložku **Replay** a projděte se časovou osou: prompty, volání nástrojů, výsledky nástrojů a odpovědi se vykreslují jako samostatné události s play/pause, řízením rychlosti (0.5x až 4x) a klávesovými zkratkami (mezerník pro přepnutí, šipky pro krokování).

Pro import starších JSONL transkriptů z Claude Code:

```bash
# Import everything under the default ~/.claude/projects
npx -y @agentmemory/agentmemory@latest import-jsonl

# Or import a single file
npx -y @agentmemory/agentmemory@latest import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

Importované sessions se objeví ve výběru Replay vedle nativních. Pod kapotou každá položka jde přes iii funkce `mem::replay::load`, `mem::replay::sessions` a `mem::replay::import-jsonl`, bez vedlejších serverů. Každý importovaný transkript je indexován pro vyhledávání, oražen původním kanálem `import` a prohledán na session crystal a lessons.

> **Upozornění, pokud se spoléháte na `import-jsonl` jako hlavní cestu zachycení:** `cleanupPeriodDays` v Claude Code (v `~/.claude/settings.json`, výchozí **30**) automaticky maže JSONL transkripty starší než toto okno z `~/.claude/projects/`. Pokud instalujete agentmemory nově na měsíce starou historii Claude Code, vše starší než 30 dní je už pryč před prvním importem. Buď spouštějte `import-jsonl` na cronu, zvyšte `cleanupPeriodDays` na vyšší hodnotu, nebo zapojte hooks pro automatické zachycení (výchozí cesta instalace pluginu), aby se každý tah ukládal do agentmemory už za běhu session a čištění JSONL přestalo hrát roli.

### Upgrade / údržba

Příkaz pro údržbu použijte, když chcete úmyslně aktualizovat svůj lokální runtime:

```bash
npx -y @agentmemory/agentmemory@latest upgrade
```

Varování: tento příkaz mění aktuální workspace/runtime. Může aktualizovat JavaScript závislosti a stáhnout pinned Docker image `iiidev/iii:0.22.1`. Nikdy nenainstaluje nepinned nebo novější iii engine.

Detaily implementace jsou v `src/cli.ts` (viz `runUpgrade` kolem oblasti `src/cli.ts:544-595`).

### Claude Code (jeden blok, vložte ho)

```text
Install agentmemory: run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server and its pinned iii engine. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 17 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 54 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113. Keyless mode disables vectors: `memory_recall` uses BM25, and `memory_smart_search` can also use existing structural graph data. Set `EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env` and restart to opt into on-device semantic recall.
```

#### Claude Code bez instalace pluginu (cesta MCP-standalone)

Pokud zapojíte server MCP agentmemory přímo přes `~/.claude.json` místo použití `/plugin install`, Claude Code nikdy nevyřeší `${CLAUDE_PLUGIN_ROOT}` a musíte nasměrovat skripty hooks na absolutní cesty v `~/.claude/settings.json`. Tyto cesty typicky obsahují verzi agentmemory (např. `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.22/scripts/…`), takže další upgrade tiše rozbije všechny hooks.

Řešení:

```bash
agentmemory connect claude-code --with-hooks
```

Toto sloučí stejné příkazy hooks do `~/.claude/settings.json` s absolutními cestami vyřešenými na balíčený adresář `plugin/` aktuálně nainstalovaného balíčku `@agentmemory/agentmemory`. Po upgradu agentmemory příkaz spusťte znovu, aby se cesty obnovily. Uživatelské položky ve stejném souboru zůstanou zachovány; nahrazeny jsou pouze předchozí položky agentmemory. Doporučovaným přístupem zůstává cesta přes `/plugin install`.
Pro vzdálená nebo chráněná nasazení spusťte Claude Code s nastaveným `AGENTMEMORY_URL` a `AGENTMEMORY_SECRET`. Plugin obě hodnoty předá svému zabalenému serveru MCP; když je `AGENTMEMORY_URL` prázdné, shim MCP použije `http://localhost:3111`.

### Codex CLI (platforma pluginů Codex)

```bash
# 1. start the memory server in a separate terminal
npx -y @agentmemory/agentmemory@latest

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Plugin pro Codex se dodává ze stejného adresáře `plugin/` jako plugin pro Claude Code. Registruje:

- Zabalený stdio MCP most k běžícímu daemonu, bez stažení přes npm nebo fallback úložiště. Viz [lokální průvodce Codexem](../docs/plugins/codex-local.md) pro testování nevydaného buildu.
- 6 hooks životního cyklu: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 9 vyvolatelných skills: `/recall`, `/remember`, `/session-history`, `/forget`, `/recap`, `/handoff`, `/lesson`, `/commit-context`, `/commit-history`, plus 8 referenčních skills, které agent načítá podle potřeby (disciplína paměti, nástroje MCP, REST API, konfigurace, agenti, hooks, architektura a průvodce psaním skills)

Enginový hook Codexu vkládá `CLAUDE_PLUGIN_ROOT` do subprocesů hooks (podle [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), takže stejné skripty hooks fungují na obou hostitelích bez duplikace. Události Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure jsou pouze pro Claude Code a pro Codex se neregistrují.

#### Důvěra a kompatibilita hooků Codexu

Nativní vyvolávání hooků pluginu je ověřeno s Codex CLI 0.150.1. Před očekáváním zachycení udělte hookům pluginu důvěru (trust). Chování Codex Desktop závisí na jeho zabaleném runtime; zkontrolujte `/hooks` a potvrďte zachycenou událost, než povolíte náhradní řešení.

Pokud váš hostitel vyžaduje globální hooky, zrcadlete příkazy do `~/.codex/hooks.json`. Když je MCP již zapojené, současný konektor potřebuje `--force`, aby se dostal k instalaci hooků:

```bash
agentmemory connect codex --with-hooks --force
```

Tohle sloučí globální hooky a přepíše záznam MCP agentmemory, při zachování nesouvisejících položek. Před použitím `--force` zkontrolujte veškerá vlastní nastavení endpointu agentmemory. Po upgradu spusťte znovu, abyste obnovili cesty ke skriptům. Povolte buď nativní hooky pluginu, nebo globální kopie, abyste se vyhnuli duplicitnímu zachycení.

### GitHub Copilot CLI

Pro agentní režim VS Code použijte [průvodce MCP a automatickým zachycením pro Copilot](../docs/plugins/copilot.md#vs-code-copilot-local-agent-sessions). Konektor CLI nekonfiguruje VS Code.

```bash
# MCP-only wiring
agentmemory connect copilot-cli

# Alternatively, full hooks/skills plugin from the GitHub subdir
copilot plugin install rohitg00/agentmemory:plugin
```

`agentmemory connect copilot-cli` sloučí `mcpServers.agentmemory` do `~/.copilot/mcp-config.json` (nebo `$COPILOT_HOME/mcp-config.json`, pokud je nastaveno `COPILOT_HOME`) a zachová existující servery. Na nativním Windows je to jediný automatizovaný adaptér `connect`; každého dalšího nativního agenta na Windows nakonfigurujte manuálně. `connect` ve WSL je podporován pouze tehdy, když je cílový agent nainstalován ve stejném prostředí WSL. Copilot si server MCP vyzvedne při dalším spuštění nebo po `/mcp`. Pro plný zážitek s hooks/skills nainstalujte i plugin.

<details>
<summary><b>OpenClaw (vložte tento prompt)</b></summary>

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

Úplný návod: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (vložte tento prompt)</b></summary>

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

Úplný návod: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Další agenti

Spusťte server paměti: `npx -y @agentmemory/agentmemory@latest`

#### Nativní skills přes `npx skills add` (50+ agentů)

agentmemory dodává 17 skills ve formátu `<dir>/SKILL.md` ve stylu Claude Code: 9 vyvolatelných akčních skills (`remember`, `recall`, `recap`, `handoff`, `forget`, `lesson`, `commit-context`, `commit-history`, `session-history`) a 8 referenčních skills, které agent načítá podle potřeby (`memory-discipline`, `agentmemory-mcp-tools`, `agentmemory-rest-api`, `agentmemory-config`, `agentmemory-agents`, `agentmemory-hooks`, `agentmemory-architecture`, `write-agentmemory-skill`). Referenční skills obsahují datové tabulky generované ze zdroje, takže se nikdy neliší. CLI [`skills`](https://npmjs.com/package/skills) od vercel-labs je automaticky instaluje do nativního adresáře skills volajícího agenta napříč 50+ agenty (Claude Code, Cursor, Cline, Continue, Droid, Warp, Codex, Antigravity, Kiro, OpenCode, Goose, Roo, Trae, Windsurf a dalšími):

```bash
npx skills add rohitg00/agentmemory -y          # auto-detects the calling agent
npx skills add rohitg00/agentmemory -y -a warp  # explicit agent
npx skills add rohitg00/agentmemory -y -a '*'   # install to every installed agent
```

Toto je **doplňkové** k `agentmemory connect <agent>`:

- `agentmemory connect <agent>` zapíše konfiguraci serveru MCP, aby byly nástroje k dispozici.
- `npx skills add rohitg00/agentmemory` nainstaluje skills, aby agent věděl, kdy je má volat.

Pro těch několik agentů, které CLI skills ještě nepokrývá (Zed v1.3.x a nižší), vložte 17 souborů SKILL.md do nativního adresáře skills agenta sami; stejný formát funguje všude.

#### Standardní blok MCP

Položka agentmemory je **stejný blok serveru MCP** na všech hostitelích, kteří používají tvar `mcpServers` (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI, OpenClaw):

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

**Sloučte tuto položku do existujícího objektu `mcpServers`** v konfiguračním souboru hostitele; soubor nenahrazujte. Pokud soubor už má jiné servery, přidejte `agentmemory` vedle nich jako další klíč uvnitř `mcpServers`. Pokud `mcpServers` zcela chybí, vložte blok do `{ "mcpServers": { ... } }`. Zástupné symboly `${VAR}` zdědí `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` ze shellu při spuštění serveru MCP; nenastavené proměnné předají prázdné řetězce a shim se vrátí na `http://localhost:3111`. Jeden zapojený záznam pokrývá lokální i vzdálená (k8s / za reverzní proxy) nasazení.

| Agent | Konfigurační soubor | Poznámky |
|---|---|---|
| **Cursor (pouze MCP)** | `~/.cursor/mcp.json` | Sloučte do `mcpServers`, nebo použijte `agentmemory connect cursor`. Na webu je k dispozici i deeplink na jedno kliknutí. |
| **Cursor (plný plugin)** | `.cursor-plugin/` | Záznam v Cursor Marketplace (podání čeká na schválení) nebo Cursor Settings → Plugins → lokální checkout. Registruje 7 hooks pro automatické zachycení (sessionStart, beforeSubmitPrompt, preToolUse, postToolUse, postToolUseFailure, stop, sessionEnd) + 17 skills + server MCP, přičemž `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` se správují v dashboardu pluginu Cursor. Funguje v IDE Cursor i v CLI `cursor-agent`; prompty v print-mode CLI se na konci session doplní zpětně z transkriptu session. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Sloučte do `mcpServers`. Po úpravě Claude Desktop restartujte. |
| **Cline / Roo Code / Kilo Code** | nastavení MCP v Cline (Settings UI → MCP Servers → Edit) | Stejný blok `mcpServers`. |
| **Devin CLI (MCP + hooks)** | `~/.config/devin/config.json` | `agentmemory connect devin` sloučí položku MCP; `--with-hooks` přidá šest nativních hooks pro automatické zachycení (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd) s malými písmeny v maticích nástrojů Devin. Ověřte pomocí `devin mcp list` a `/hooks` uvnitř devin. |
| **Devin CLI (plný plugin)** | `plugin/.devin-plugin/` | `devin plugins install ./plugin` z checkoutu zaregistruje všech 17 skills jako slash příkazy `/agentmemory:<skill>` plus server MCP. Hooks pluginu Devin neumí vyvolat `SessionStart`/`SessionEnd`, takže ho pro plné zachycení session kombinujte s `connect devin --with-hooks`. |
| **Devin (cloud)** | Settings → Connections → MCP servers | Přidejte vlastní MCP (STDIO): příkaz `npx`, argumenty `-y @agentmemory/mcp@latest`, env `AGENTMEMORY_URL` ukazující na síťově dostupné nasazení agentmemory plus `AGENTMEMORY_SECRET` (cloudové sessions se nedostanou na localhost — viz [`deploy/`](../deploy/)). Uložte secret do Devin Secrets a pomocí „Test listing tools“ ověřte, že se objeví všech 54 nástrojů. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (sloučí se automaticky). |
| **GitHub Copilot CLI (pouze MCP)** | `~/.copilot/mcp-config.json` | `agentmemory connect copilot-cli` sloučí `mcpServers.agentmemory`; Copilot si ji vyzvedne při dalším spuštění nebo po `/mcp`. |
| **GitHub Copilot CLI (plný plugin)** | instalace pluginu Copilot | `copilot plugin install rohitg00/agentmemory:plugin` pro plugin z podadresáře GitHub. |
| **OpenClaw** | konfigurace MCP OpenClaw | Stejný blok `mcpServers`. Hlouběji: `openclaw plugins install ./integrations/openclaw` obsadí paměťový slot OpenClaw (automaticky přepne z `memory-core`); nastavte `plugins.entries.agentmemory.hooks.allowConversationAccess=true`, jinak je zachycení tahů tiše blokováno. Viz [`integrations/openclaw`](../integrations/openclaw/). |
| **Codex CLI (pouze MCP)** | `.codex/config.toml` | Tvar TOML: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, nebo manuálně přidejte `[mcp_servers.agentmemory]`. |
| **Codex CLI (plný plugin)** | marketplace pluginů Codex | `codex plugin marketplace add rohitg00/agentmemory`, pak `codex plugin add agentmemory@agentmemory`. Registruje MCP + 6 hooks životního cyklu + 17 skills. Důvěřujte hookům a ověřte zachycení ve svém hostiteli; viz [nastavení a validace Codexu](../docs/plugins/codex-local.md). |
| **OpenCode (pouze MCP)** | `opencode.json` | Jiný tvar: klíč `mcp` na nejvyšší úrovni, příkaz jako pole: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (plný plugin)** | `plugin/opencode/` | 22 hooks pro automatické zachycení pokrývajících životní cyklus session, zprávy, nástroje a chyby. Přiřazení k projektu je po jednotlivých sessions, takže jeden proces OpenCode pokrývající více repozitářů zařadí každou session pod její vlastní projekt. Dva slash příkazy (`/recall`, `/remember`). Zkopírujte `plugin/opencode/` do svého workspace OpenCode a doplňte položku pluginu do `opencode.json`. Úplnou tabulku hooks + analýzu mezer najdete v [`plugin/opencode/README.md`](../plugin/opencode/README.md). |
| **pi** | `~/.pi/agent/extensions/agentmemory` | `agentmemory connect pi` nainstaluje zabalené rozšíření do adresáře automatického vyhledávání pi (recall při startu agenta, zachycení při konci agenta, nástroje `memory_search` / `memory_save` / `memory_health`, `/agentmemory-status`). `/reload` v běžícím pi ho načte. [`integrations/pi`](../integrations/pi/) je také balíček pi (`pi install ./integrations/pi` z checkoutu). |
| **Hermes Agent** | `~/.hermes/config.yaml` | `cp -r integrations/hermes ~/.hermes/plugins/agentmemory` + `memory.provider: agentmemory` dá poskytovatele paměti se 6 hooks (prefetch, zachycení tahu, konec session, pre-compress, zrcadlení MEMORY.md, blok systémového promptu). Ověřte pomocí `hermes plugins doctor` a `hermes memory status`. Viz [`integrations/hermes`](../integrations/hermes/). |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` zapíše standardní blok `mcpServers`. Payload hooks je polově kompatibilní s Claude Code, takže existující skripty pro 12 hooks fungují bez úprav; zapojte je přes sekci `hooks` ve stejném `settings.json`. |
| **Antigravity IDE / 2.0** | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity --with-hooks` nainstaluje MCP a hooky pro zachycení do sdíleného adresáře přizpůsobení. Viz [nastavení a limity Antigravity](../docs/plugins/antigravity.md). |
| **Antigravity CLI** (`agy`) | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity-cli --with-hooks` používá stejnou konfiguraci MCP a hooků jako aktuální verze IDE. Stávající instalace by měly provést refresh pomocí `--force`; viz [poznámky k upgradu](../docs/plugins/antigravity.md). |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` zapíše konfiguraci na úrovni uživatele. Přepisy na úrovni workspace patří do `.kiro/settings/mcp.json` vedle vašeho kódu. |
| **Warp** | `~/.warp/.mcp.json` | `agentmemory connect warp` zapíše standardní blok `mcpServers`. Warp také automaticky vyhledává skills z `.claude/skills/`; po instalaci pluginu Claude Code se 8 skills agentmemory (`remember`, `recall`, `recap`, `handoff`, `forget`, `commit-context`, `commit-history`, `session-history`) objeví nativně v paletě slash příkazů Warp. |
| **Cline (CLI)** | `~/.cline/mcp.json` | `agentmemory connect cline` zapíše standardní blok `mcpServers`. Uživatelé rozšíření VS Code: vložte stejný blok přes Cline Settings → MCP Servers → Edit JSON. |
| **Continue.dev** | `~/.continue/config.yaml` (preferované) nebo `config.json` (starší) | `agentmemory connect continue` vytvoří `config.yaml` od nuly, pokud žádný z nich neexistuje, nebo upraví existující `config.json`. **Pokud už máte `config.yaml`**, adaptér vypíše přesný blok k vložení pod `mcpServers:`; váš yaml tiše nepřepíše, protože bezpečné zachování komentářů a kotev vyžaduje parser YAML, který balíček nedodává. Continue používá pro `mcpServers` formu pole (ne objektu). |
| **Zed** | `~/.config/zed/settings.json` | `agentmemory connect zed` zapíše pod `context_servers` (klíč Zed, NE `mcpServers`). Vzdálené servery MCP lze zapojit místo toho přes `{"url": "..."}`. |
| **Droid (Factory.ai)** | `~/.factory/mcp.json` | `agentmemory connect droid` zapíše standardní blok `mcpServers`. Přepisy na úrovni projektu patří do `<repo>/.factory/mcp.json`. Pro nativní automatické zachycení přidejte `--with-hooks`. |
| **DeepSeek Harness** | `$DSH_HOME/cordis.patch.yml` | `agentmemory connect dsh` připojí řádek `@deepseek-ai/dsh-mcp-client` do vrstvy patchů na úrovni home, kterou načítá každý profil Harness; nástroje se registrují jako `mcp__agentmemory__*`. Pro zapojení i automatického zachycení přidejte `--with-hooks`: zabalené skripty hooks pro Claude Code běží přes vlastní most Harness `@deepseek-ai/dsh-hooks-claude-code` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) pomocí manifestu zapsaného do `$DSH_HOME/agentmemory.hooks.json`. Pokud `DSH_HOME` není nastaveno, výchozí je `~/.dsh`. |
| **Goose** | UI nastavení MCP v Goose | Stejný blok `mcpServers`; použijte `goose configure` → Add Extension → MCP. Přímá úprava YAML v `~/.config/goose/config.yaml` je podporována, ale schéma používá `extensions:` + `cmd` (ne `mcpServers:` + `command`). |
| **Aider** | n/a | Mluvte přímo s REST API: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`. |
| **Jakýkoli agent (32+)** | n/a | `npx skillkit install agentmemory` automaticky detekuje hostitele a sloučí konfiguraci. |

**Sandboxovaní klienti MCP** (Flatpak / Snap / omezující kontejnery), kteří se nedostanou na `localhost` hostitele: navíc nastavte `"AGENTMEMORY_FORCE_PROXY": "1"` v bloku `env` a nasměrujte `AGENTMEMORY_URL` na cestu, na kterou se sandbox skutečně dostane (např. vaši LAN IP adresu).

### Programový přístup (Python / Rust / Node)

agentmemory registruje své klíčové operace jako iii funkce (`mem::remember`, `mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). Jakýkoli jazyk s iii SDK je může volat přímo přes `ws://localhost:49134`, bez samostatného klienta REST pro každý jazyk.

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

Hotový příklad: [`examples/python/`](../examples/python/) (quickstart + průběh observation/recall). REST na `:3111` zůstává dostupné pro hostitele bez runtime iii.

### Ze zdroje

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

Tím se spustí agentmemory s lokálním `iii-engine`, pokud je pinned binárka už nainstalována, nebo se použije Docker Compose, pokud je zvolen. REST, streamy a viewer se ve výchozím stavu váží na `127.0.0.1`. Automatická cesta binárky pro macOS/Linux vyžaduje `curl`, POSIX `sh` a `tar`.

Nainstalujte `iii-engine` manuálně. **agentmemory je momentálně pinned na `iii-engine` ve verzi `v0.22.1`**, stejné vydání jako jeho závislost `iii-sdk`; worker mluví protokolem tohoto enginu a 0.20.0 přeorganizovalo povrch SDK, takže se obě verze ve vydáních agentmemory pohybují společně. Přepište pomocí `AGENTMEMORY_III_VERSION=<version>`, pokud provozujete vlastní engine a víte, že sedí.

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSLo iii.tar.gz https://github.com/iii-hq/iii/releases/download/iii/v0.22.1/iii-aarch64-apple-darwin.tar.gz && echo "2b309019b909a896cae874dc947e2cdf877b4f3c51dd026b79850af858517fa4  iii.tar.gz" | shasum -a 256 -c - && tar -xzf iii.tar.gz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** nahraďte `aarch64-apple-darwin` za `x86_64-apple-darwin`
- **Linux x64:** nahraďte za `x86_64-unknown-linux-gnu`
- **Linux arm64:** nahraďte za `aarch64-unknown-linux-gnu`
- **Windows:** stáhněte `iii-x86_64-pc-windows-msvc.zip` z [iii-hq/iii releases v0.22.1](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.22.1) a rozbalte `iii.exe` do `%USERPROFILE%\.agentmemory\bin\iii.exe`

Každý archiv má na stránce vydání odpovídající soubor `.sha256`; při výměně platformy použijte hash z tohoto souboru ve výše uvedené kontrole (na Windows: `Get-FileHash`). Automatický instalátor v `npx @agentmemory/agentmemory` má tyto hashe pevně dané a odmítne archiv, který nesedí.

Nebo použijte Docker (zabalený `docker-compose.yml` stahuje `iiidev/iii:0.22.1`). Úplná dokumentace: [iii.dev/docs](https://iii.dev/docs).

### Windows

agentmemory běží na Windows 10/11, ale samotný balíček Node.js nestačí; potřebujete také pinned runtime iii-engine v0.22.1 jako proces na pozadí. CLI nerozbaluje Windows ZIP automaticky, takže uživatelé nativního Windows musí `iii.exe` nainstalovat manuálně, použít WSL2, nebo zvolit Docker Desktop.

Automatizované zapojení MCP na nativním Windows podporuje pouze `agentmemory connect copilot-cli`. Pro Claude Code, Codex, Cursor a každého dalšího nativního agenta na Windows zkopírujte manuální blok MCP ze sekce [Další agenti](#other-agents) do konfigurace daného agenta na Windows. Spouštění `connect` ve WSL je vhodné pouze tehdy, když je cílový agent nainstalován ve stejném prostředí WSL; nijak neupravuje konfiguraci agenta na hostiteli Windows.

**Varianta A: předpřipravená binárka pro Windows (doporučeno)**

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

**Varianta B: Docker Desktop**

```powershell
# 1. Install Docker Desktop for Windows
# 2. Start Docker Desktop and make sure the engine is running
# 3. Select Docker explicitly and run agentmemory:
$env:AGENTMEMORY_USE_DOCKER = "1"
npx -y @agentmemory/agentmemory@latest
```

**Varianta C: pouze samostatné MCP (bez enginu).** Pokud pro svého agenta potřebujete jen nástroje MCP a nepotřebujete REST API, viewer ani cron úlohy, engine úplně vynechte:

```powershell
npx -y @agentmemory/agentmemory@latest mcp
# or via the shim package:
npx -y @agentmemory/mcp
```

**Diagnostika pro Windows:** pokud `npx -y @agentmemory/agentmemory@latest` selže, spusťte ho znovu s `--verbose`, abyste viděli skutečný stderr enginu. Běžné způsoby selhání:

| Příznak | Oprava |
|---|---|
| `The engine process started but the REST API never responded.` | Ověřte, že všechny čtyři odvozené porty jsou volné, zkontrolujte, že pinned `iii.exe` zůstal naživu, pak spusťte znovu s `--verbose` a prozkoumejte zachycený stderr enginu |
| `Could not start iii-engine` | Není nainstalován ani `iii.exe`, ani Docker. Viz varianta A nebo B výše |
| Konflikt portů | `netstat -ano \| findstr :3111` ukáže, co je obsazeno, pak to ukončete nebo použijte `--port <N>` |
| Záložní řešení přes Docker se vynechá, i když je Docker nainstalován | Ujistěte se, že Docker Desktop skutečně běží (ikona v system tray) |

> Poznámka: iii **engine** je předpřipravená binárka, ne cargo crate, takže se ji nesnažte instalovat pomocí `cargo install`. (iii **SDK** jsou publikována na crates.io, npm a PyPI, ale agentmemory je nepotřebuje.) Všechny podporované metody instalace enginu jsou pinned na v0.22.1: výše uvedená předpřipravená binárka, automatická instalační cesta agentmemory pro macOS/Linux (vyžaduje `curl`, POSIX `sh` a `tar`) a Docker image `iiidev/iii:0.22.1`. Holé `install.sh | sh` z upstreamu nainstaluje nejnovější engine, který agentmemory nepodporuje. Použijte `npx -y @agentmemory/agentmemory@latest`; na macOS/Linuxu si stáhne pinned engine do `~/.agentmemory/bin`.

---

<h2 id="deploy">Nasazení</h2>

Šablony pro nasazení na jedno kliknutí u správovaných hostitelů. Každá z nich dodává samostatný
Dockerfile, který stáhne `@agentmemory/agentmemory` z npm a zkopíruje
binárku iii enginu z oficiálního Docker Hub image
`iiidev/iii`; žádný předpřipravený image agentmemory není potřeba. Trvalé úložiště
se připojuje na `/data`; entrypoint při prvním startu přepíše
konfiguraci iii zabalenou v npm (která se váže na `127.0.0.1`) tou
upravenou pro nasazení, která se váže na `0.0.0.0` a používá absolutní cesty `/data`, vygeneruje
HMAC secret a pak sníží oprávnění z `root` na `node` pomocí
`gosu` před spuštěním CLI agentmemory.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Nasadit na fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Nasadit na Railway" /></a>
</p>

Tlačítko pro nasazení na jedno kliknutí od Renderu vyžaduje `render.yaml` v kořeni repozitáře, který záměrně udržujeme čistý. Pro manuální nasměrování na blueprint v repozitáři použijte postup Render Blueprint popsaný v [`deploy/render/`](.././deploy/render/README.md).

Úplné detaily nastavení (zachycení HMAC, SSH tunel pro viewer, rotace, zálohy,
spodní hranice nákladů) jsou v [`deploy/`](.././deploy/README.md):

- [`deploy/fly`](.././deploy/fly/README.md): jeden stroj s
  `auto_stop_machines = "stop"`; nejlevnější v nečinnosti.
- [`deploy/railway`](.././deploy/railway/README.md): pevný poplatek plánu Hobby,
  volume v dashboardu.
- [`deploy/render`](.././deploy/render/README.md): postup Blueprint,
  automatické snímky disku na placených plánech.
- [`deploy/coolify`](.././deploy/coolify/README.md): self-hosted na vlastním
  VPS přes [Coolify](https://coolify.io/self-hosted); stejný Docker
  Compose stack, host i data vlastníte vy.

Publikován je pouze port `3111`. Viewer na `3113` zůstává uvnitř kontejneru
vázán na loopback; postup SSH tunelu pro jeho dosažení je zdokumentován
v README každé šablony.

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Proč agentmemory" height="32" /></picture></h2>

Každý kódovací agent po skončení session zapomene všechno a každá nová session začíná tím, že znovu vysvětlujete svůj stack. agentmemory běží na pozadí a tento krok odstraňuje.

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

### vs vestavěná paměť agenta

Každý AI kódovací agent se dodává s vestavěnou pamětí: Claude Code má `MEMORY.md`, Cursor má poznámkové bloky, Cline má memory bank. Ty funguji jako lístečky na ledničku. agentmemory je prohledávatelná databáze za těmi lístečky.

| | Vestavěné (CLAUDE.md) | agentmemory |
|---|---|---|
| Rozsah | strop 200 řádků | neomezený |
| Vyhledávání | načte vše do kontextu | BM25 + vektor + graf (pouze top-K) |
| Náklady na tokeny | 22K+ při 240 pozorováních | ~1,900 tokenů (o 92% méně) |
| Napříč agenty | soubory po agentech | MCP + REST (jakýkoli agent) |
| Koordinace | žádná | leases, signály, akce, routiny |
| Observabilita | manuální čtení souborů | viewer v reálném čase na :3113 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="Jak to funguje" height="32" /></picture></h2>

### Pipeline paměti

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

### 4úrovňová konsolidace paměti

Vzor podle toho, jak lidský mozek zpracovává paměť, včetně konsolidace během spánku.

| Úroveň | Co | Analogie |
|------|------|---------|
| **Pracovní** | Syrová pozorování z použití nástrojů | Krátkodobá paměť |
| **Epizodická** | Komprimovaná shrnutí sessions | „Co se stalo" |
| **Sémantická** | Extrahovaná fakta a vzory | „Co vím" |
| **Procedurální** | Workflows a rozhodovací vzory | „Jak to udělat" |

Paměti v čase slábnou (Ebbinghausova křivka). Často navštěvované paměti se zesilují. Zastaralé paměti se automaticky odstraňují. Rozpory se detekují a řeší.

### Co se zachycuje

| Hook | Zachycuje |
|------|----------|
| `SessionStart` | cestu k projektu, ID session |
| `UserPromptSubmit` | uživatelské prompty (filtrované na soukromí) |
| `PreToolUse` | vzory přístupu k souborům + obohacený kontext |
| `PostToolUse` | název nástroje, vstup, výstup |
| `PostToolUseFailure` | kontext chyby |
| `PreCompact` | znovu vloží paměť před kompakcí |
| `SubagentStart/Stop` | životní cyklus sub-agenta |
| `Stop` | shrnutí na konci session |
| `SessionEnd` | značka dokončení session |

### Klíčové schopnosti

| Schopnost | Popis |
|---|---|
| **Automatické zachycení** | každé použití nástroje se zaznamená přes hooks, bez manuálního úsilí |
| **Sémantické vyhledávání** | BM25 + vektor + znalostní graf s fúzí RRF |
| **Evoluce paměti** | verzování, nahrazování (supersession), grafy vztahů |
| **Hygiena vyhledávání** | nahrazené verze paměti opustí vyhledávací indexy; řetězec verzí v KV si uchovává úplnou historii |
| **Náznaky téměř-duplikátů** | ukládání nahlásí orientační shodu `similarTo`, když se nový obsah silně podobá existující paměti |
| **Rozsah po agentech** | `agentId` prochází ukládáním a vyhledáváním přes REST, MCP i vyhledávací index, v režimu sdíleném nebo izolovaném |
| **Původ v okamžiku zápisu** | každé pozorování a paměť nese neměnný kanál původu (user, agent, tool, import nebo shared) otištěný při zachycení, uložení a importu |
| **Automatické zapomínání** | expirace TTL, detekce rozporů, odstranění podle důležitosti |
| **Soukromí na prvním místě** | API klíče, secrets a značky `<private>` se před uložením odstraní |
| **Samoopravné chování** | circuit breaker, záložní řetězec poskytovatelů, monitorování zdraví |
| **Most do Claude** | obousměrná synchronizace s MEMORY.md |
| **Znalostní graf** | extrakce entit + BFS průchod |
| **Týmová paměť** | sdílená i privátní, s namespacy mezi členy týmu |
| **Původ citací** | dohledání jakékoli paměti zpět k výchozím pozorováním |
| **Git snapshoty** | verzování, rollback a diff stavu paměti |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Vyhledávání" height="32" /></picture></h2>

Trojproudové vyhledávání kombinující tři signály:

| Proud | Co dělá | Kdy |
|---|---|---|
| **BM25** | shoda klíčových slov se stemmingem a rozšířením synonym | vždy zapnuto |
| **Vector** | kosinová podobnost nad hustými embeddingy | nakonfigurován poskytovatel embeddingů |
| **Graph** | průchod znalostním grafem přes shodu entit | v dotazu byly detekovány entity |

Sloučeno pomocí Reciprocal Rank Fusion (RRF, k=60) a diverzifikováno po sessions (max 3 výsledky na session).

Když je vektorový index naplněný, `mem::search` (za `memory_recall`) používá hybridní řadič BM25 + vektor. Bez embeddingů používá BM25. `smart-search` může navíc sloučit strukturální shody z grafu, pokud grafová data existují, včetně režimu bez klíče. Vyhledávání lessons běží na vyhrazeném in-memory indexu BM25 místo skenování celého korpusu při každém dotazu. Nahrazené verze paměti jsou vyloučeny z každé cesty vyhledávání; řetězec verzí uchovává jejich historii.

Vektory přežijí pád nebo násilné vypnutí. Vektorový index se ukládá v dávkách nejvýše jednou za `AGENTMEMORY_INDEX_SAVE_INTERVAL_MS` (10 minut). Každý vektor přidaný nebo odstraněný mezitím se navíc okamžitě zapíše do malého čekajícího logu ve state store a při dalším startu se přehraje bez volání poskytovatele embeddingů. Každé úspěšné uložení log vyprázdní. Dokumenty, které po přehrání stále nemají vektor, se na pozadí znovu embedují v dávkách po `AGENTMEMORY_VECTOR_BACKFILL_MAX` (500), dokud žádné nezbydou, a zastavený backfill pokračuje při dalším startu. `/agentmemory/status` a viewer zobrazují velikost čekajícího logu a stav backfillu. Instalace bez klíče nic nezapisují.

BM25 standardně tokenizuje řečtinu, cyrilici, hebrejštinu, arabštinu a akcentovanou latinku. Pro paměti v čínštině / japonštině / korejštině nainstalujte volitelné segmentery (`npm install @node-rs/jieba tiny-segmenter`), aby se běhy CJK rozdělily na tokeny na úrovni slov; bez nich agentmemory měkce spadne na tokenizaci celého běhu a jednou vypíše nápovědu na stderr.

### Poskytovatelé embeddingů

Instalace bez klíče vypínají vektorové embeddingy: `mem::search` používá BM25, zatímco `smart-search` může navíc použít existující strukturální grafová data. Pro bezplatné sémantické embeddingy přímo na zařízení přidejte toto do `~/.agentmemory/.env` a restartujte agentmemory:

```env
EMBEDDING_PROVIDER=local
```

Běžná instalace npm obsahuje volitelný runtime `@huggingface/transformers`. První požadavek na embedding stáhne `Xenova/all-MiniLM-L6-v2`, takže potřebuje síťový přístup a může trvat déle; následná inference běží na zařízení. Vzdálení poskytovatelé jsou automaticky detekováni podle svých klíčů, pokud je nepřepíše `EMBEDDING_PROVIDER`.

| Poskytovatel | Model | Náklady | Poznámky |
|---|---|---|---|
| **Lokální (doporučeno jako opt-in)** | `all-MiniLM-L6-v2` | zdarma | na zařízení po prvním stažení modelu, +8pp recall oproti samotnému BM25 |
| Gemini | `gemini-embedding-001` | bezplatný tier | 100+ jazyků, rozměry 768/1536/3072 (MRL), vstup 2048 tokenů. Nahrazuje `text-embedding-004` ([deprecated, ukončení 14. 1. 2026](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | nejvyšší kvalita |
| Voyage AI | `voyage-code-3` | placené | optimalizováno pro kód |
| Cohere | `embed-english-v3.0` | bezplatná zkouška | univerzální použití |
| OpenRouter | jakýkoli model | liší se | proxy pro více modelů |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="Server MCP" height="32" /></picture></h2>

54 nástrojů, 6 resources, 3 prompty a 17 skills.

> **Shim MCP vs plný server:** publikovaný balíček `@agentmemory/mcp` je tenký shim. Celý povrch 54 nástrojů zpřístupní **pouze když se dostane k běžícímu serveru agentmemory** přes `AGENTMEMORY_URL` (proxy režim). Když žádný server není dostupný, shim se vrátí na lokální sadu 7 nástrojů (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). Proměnná prostředí `AGENTMEMORY_TOOLS=core|all` je příznak *na straně serveru*; nastavení v bloku `env` shimu nemá žádný efekt. Pokud v Cursor / OpenCode / Gemini CLI vidíte jen 7 nástrojů, spusťte `npx -y @agentmemory/agentmemory@latest` (nebo Docker stack) a nastavte `AGENTMEMORY_URL=http://localhost:3111`.

### 54 nástrojů

Tři povrchy nástrojů, od nejmenšího k největšímu: `AGENTMEMORY_TOOLS=core` omezí viditelnost na 8 nezbytných (`memory_save`, `memory_recall`, `memory_consolidate`, `memory_smart_search`, `memory_sessions`, `memory_diagnose`, `memory_lesson_save`, `memory_reflect`); základní sada níže je 14 základních nástrojů registru; výchozí nastavení (`AGENTMEMORY_TOOLS=all`) zpřístupní všech 54.

<details>
<summary>Základní nástroje (14)</summary>

| Nástroj | Popis |
|------|-------------|
| `memory_recall` | vyhledá minulá pozorování |
| `memory_compress_file` | komprimuje soubory markdown při zachování struktury |
| `memory_save` | uloží poznatek, rozhodnutí nebo vzor |
| `memory_file_history` | minulá pozorování o konkrétních souborech |
| `memory_patterns` | detekuje opakující se vzory |
| `memory_sessions` | vypíše nedávné sessions |
| `memory_smart_search` | hybridní sémantické + klíčové vyhledávání |
| `memory_vision_search` | vyhledává pozorování z obrázků |
| `memory_timeline` | chronologická pozorování |
| `memory_profile` | profil projektu (koncepty, soubory, vzory) |
| `memory_export` | exportuje všechna data paměti |
| `memory_relations` | dotaz na graf vztahů |
| `memory_commit_lookup` | sessions za konkrétním git commitem |
| `memory_commits` | commity zaznamenané pro session |

</details>

<details>
<summary>Rozšířené nástroje (celkem 54, výchozí povrch)</summary>

| Nástroj | Popis |
|------|-------------|
| `memory_patterns` | detekuje opakující se vzory |
| `memory_timeline` | chronologická pozorování |
| `memory_relations` | dotaz na graf vztahů |
| `memory_graph_query` | průchod znalostním grafem |
| `memory_consolidate` | spustí 4úrovňovou konsolidaci |
| `memory_claude_bridge_sync` | synchronizace s MEMORY.md |
| `memory_team_share` | sdílení s členy týmu |
| `memory_team_feed` | nedávné sdílené položky |
| `memory_audit` | audit trail operací |
| `memory_governance_delete` | smazání s audit trail |
| `memory_snapshot_create` | snapshot verzovaný v gitu |
| `memory_action_create` | vytvoří pracovní položky se závislostmi |
| `memory_action_update` | aktualizuje stav akce |
| `memory_frontier` | nezablokované akce seřazené podle priority |
| `memory_next` | jediná nejdůležitější další akce |
| `memory_lease` | exkluzivní leases akcí (multi-agent) |
| `memory_routine_run` | instanciuje workflow routiny |
| `memory_signal_send` | zprávy mezi agenty |
| `memory_signal_read` | čte zprávy s potvrzením o přijetí |
| `memory_checkpoint` | brány na externí podmínky |
| `memory_mesh_sync` | P2P synchronizace mezi instancemi |
| `memory_sentinel_create` | hlídače řízené událostmi |
| `memory_sentinel_trigger` | vyvolá sentinely externě |
| `memory_sketch_create` | efemérní grafy akcí |
| `memory_sketch_promote` | povýší na trvalé |
| `memory_crystallize` | zhuští řetězce akcí |
| `memory_diagnose` | kontroly zdraví |
| `memory_heal` | automatická oprava zaseknutého stavu |
| `memory_facet_tag` | značky dimenze:hodnota |
| `memory_facet_query` | dotaz podle facetových značek |
| `memory_verify` | dohledá původ |

</details>

### 6 resources · 3 prompty · 17 skills

| Typ | Název | Popis |
|------|------|-------------|
| Resource | `agentmemory://status` | zdraví, počet sessions, počet pamětí |
| Resource | `agentmemory://project/{name}/profile` | inteligence pro konkrétní projekt |
| Resource | `agentmemory://project/{name}/recent` | nedávná pozorování pro projekt |
| Resource | `agentmemory://memories/latest` | posledních 10 aktivních pamětí |
| Resource | `agentmemory://graph/stats` | statistiky znalostního grafu |
| Resource | `agentmemory://team/{id}/profile` | sdílený profil týmu |
| Prompt | `recall_context` | vyhledá + vrátí kontextové zprávy |
| Prompt | `session_handoff` | data pro předání mezi agenty |
| Prompt | `detect_patterns` | analyzuje opakující se vzory |
| Skill | `/recall` | vyhledá v paměti |
| Skill | `/remember` | uloží do dlouhodobé paměti |
| Skill | `/session-history` | nedávná shrnutí sessions |
| Skill | `/forget` | smaže pozorování/sessions |

Tabulka zobrazuje čtyři klíčové skills. Celá sada je 9 vyvolatelných skills plus 8 referenčních skills; viz sekce Nativní skills výše.

### Samostatné MCP

Spuštění bez plného serveru, pro jakéhokoli klienta MCP. Funguje kterékoli z tohoto:

```bash
npx -y @agentmemory/agentmemory@latest mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

Nebo přidejte do konfigurace MCP svého agenta:

Většina agentů (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI):
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

Sloučte položku `agentmemory` do existujícího objektu `mcpServers` vašeho hostitele, místo nahrazení celého souboru. Pro sandboxované klienty, kteří se nedostanou na `localhost` hostitele, přidejte do bloku env `"AGENTMEMORY_FORCE_PROXY": "1"` a nastavte `AGENTMEMORY_URL` na cestu, na kterou se sandbox dostane.

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

Zkopírujte soubor pluginu z repozitáře:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Viewer v reálném čase" height="32" /></picture></h2>

Automaticky se spouští na portu `3113`. Viewer při připojení načte jeden snapshot (`GET /agentmemory/viewer/snapshot`) a pak aplikuje živé streamové události: nové paměti, lessons, pozorování, audit záznamy, změny grafu a aktualizace zdraví se objevují bez pollingu nebo obnovení stránky. Jediné další požadavky jsou akce, na které kliknete, stránky „load more" a vyhledávání. Když stream vypadne, viewer ukáže, jak staré jsou jeho čísla, znovu se připojí s odstupňovaným zpomalením a znovu se sesynchronizuje z jednoho snapshotu.

- **12 záložek ve čtyřech skupinách** s živými počty, deep linky (`#memories/<id>`, `#sessions/<id>?obs=<id>`, `#graph/<id>`, `#health/consolidation`), klávesovými zkratkami a mobilním menu.
- **Memories:** vyhledávání na straně serveru, filtry podle projektu, agenta a typu, detailní panel s řetězcem verzí a diffem slov, odkazy na původ, tlačítka pro kopírování id, volání MCP a příkazu curl, úprava (nová verze), forget s potvrzením, hromadný forget a export JSON.
- **Sessions:** vložená časová osa pozorování s čitelným vstupem a výstupem nástrojů, filtry a stránkování, a paměti i lessons, které každá session vyprodukovala.
- **Graph:** vyhledávání, detail uzlu se vztahy a zdroji, legenda, která se nespoléhá jen na barvu, a ovládání zoomu.
- **Health:** živá verze `GET /agentmemory/status`. Každý problém má svou opravu, plus backend state, stav uložení indexu, průběh komprese provenience grafu a vysvětlení konsolidace se skutečnými prahovými hodnotami.
- **Stránky Audit, Activity, Profile, Replay, Lessons, Actions a Crystals**, každá s prázdným stavem, který říká, co daná sekce je, proč je prázdná a jaký příkaz ji naplní, a tooltip se slovníčkem `?` u každého termínu a čísla.

```bash
open http://localhost:3113
```

Server vieweru se ve výchozím stavu váže na `127.0.0.1` a při předávání požadavků na REST API přikládá server secret, takže nevyžaduje žádné nastavení. Endpoint `/agentmemory/viewer` zpřístupněný přes REST se řídí běžnými pravidly bearer tokenu a prohlížeče bez tokenu přesměruje na port vieweru. Hlavičky CSP používají nonce skriptu pro každou odpověď a vypínají inline handler atributy (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

Viewer na `:3113` ukazuje, co si váš agent **zapamatoval**. [iii console](https://iii.dev/docs/console) ukazuje, co váš agent **udělal**: každá operace s pamětí jako trace OpenTelemetry, každá položka KV editovatelná, každá funkce vyvolatelná, každý stream napojitelný. Dvě okna na stejnou paměť: jedno ve tvaru produktu, druhé ve tvaru enginu.

Sledujte, jak se vyvolá `memory_smart_search`, a uvidíte skenování BM25 → vyhledání embeddingu → fúzi RRF → reranker jako waterfall. Upravte zaseknutý časovač konsolidace v prohlížeči KV. Přehrajte hook `PostToolUse` s upraveným payloadem. Připněte si WebSocket stream a sledujte, jak pozorování přicházejí živě.

agentmemory tohle dodává zadarmo, protože každé volání funkce a trigger se vyvolává přes iii; nic na míru, nic k instrumentaci.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="Stránka Workers v iii console: připojení workeři včetně instancí agentmemory s živými počty funkcí a metadaty runtime" width="720" />
  <br/>
  <em>Stránka Workers: každý připojený worker, včetně samotného agentmemory, s PID, počtem funkcí, runtime a časem posledního výskytu.</em>
</p>

**Už je nainstalováno.** Console se dodává s pinned enginem `iii` (0.22+); není třeba nic instalovat zvlášť. Při prvním spuštění se binárka console stáhne vedle enginu.

**Spuštění společně s agentmemory:**

```bash
agentmemory console
```

Tím se spustí `iii console` pinned enginu proti portům, které agentmemory vyřešil (REST, streamy, bridge), a obslouží se o jeden port nad viewerem, výchozí `http://localhost:3114`. `--console-port N` zvolí jiný port; `--port` a `--instance` volí instanci agentmemory stejně jako u `stop`; jakýkoli jiný přepínač se předá dál, například `--enable-flow` pro experimentální stránku architekturního grafu.

Totéž manuálně, užitečné, když `agentmemory` není v PATH:

```bash
~/.agentmemory/bin/iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**Co lze z console dělat:**

| Stránka | K čemu slouží |
|------|-----------|
| **Workers** | zobrazí každého připojeného workera a jeho živé metriky, včetně samotného workeru agentmemory. |
| **Functions** | vyvolá přímo jakoukoli funkci agentmemory s payloadem JSON; vhodné pro testování `memory.recall`, `memory.consolidate`, `graph.query` bez zapojování klienta. |
| **Triggers** | přehraje triggery HTTP, cron, event a state: manuálně vyvolá cron konsolidace, zopakuje HTTP route, vyšle změnu stavu. |
| **States** | prohlížeč KV s plným CRUD nad sessions, sloty paměti, časovači životního cyklu a indexem embeddingů; hodnoty lze upravovat na místě. |
| **Streams** | živý monitor WebSocket pro zápisy paměti, události hooks a aktualizace pozorování, jak proudí přes iii streamy. |
| **Queues** | trvalá témata queue + správa dead-letter. Přehrání nebo zahození neúspěšných úloh embeddingu / komprese. |
| **Traces** | pohledy waterfall / flame / rozpad podle služby v OpenTelemetry. Filtrování podle `trace_id` ukáže přesně, které funkce, volání DB a požadavky na embedding jedno `memory.search` vyprodukovalo. |
| **Logs** | strukturované logy OTEL filtrované a korelované na ID trace/span. |
| **Config** | runtime konfigurace: přesně vidíte, s jakými workery, poskytovateli a porty váš engine běží. |
| **Flow** | (volitelné, `--enable-flow`) interaktivní architekturní graf každého workeru, triggeru a streamu. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="Pohled waterfall na trace v iii console zobrazující dobu trvání jednotlivých spanů" width="720" />
  <br/>
  <em>Traces: waterfall / flame / rozpad podle služby pro každou operaci s pamětí.</em>
</p>

**Traces jsou už zapnuté:**

`iii-config.yaml` se dodává se zapnutým workerem `iii-observability` (`exporter: memory`, `sampling_ratio: 0.1`, metriky + logy). Žádná další konfigurace není potřeba; ve chvíli, kdy agentmemory nastartuje, každá operace s pamětí vyšle strukturovaný log, který console umí číst, a jedna z deseti operací (`sampling_ratio: 0.1`) vyšle i trace span.

Pokud chcete exportovat místo toho do Jaeger/Honeycomb/Grafana Tempo, změňte `exporter: memory` na `exporter: otlp` a nastavte endpoint kolektoru podle dokumentace observability iii.

> **Upozornění:** na samotné console není vynucena žádná autentizace; udržujte ji vázanou na `127.0.0.1` (výchozí stav) a nikdy ji nevystavujte veřejně.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Založeno na iii" height="32" /></picture></h2>

agentmemory je **už běžící instance [iii](https://iii.dev)**. Runtime skládají tři primitiva (worker, function, trigger); stav KV, streamy a trace OTEL pochází z workerů iii-state, iii-stream a iii-observability, které se dodávají s iii. Neinstalovali jste Postgres, Redis, Express, pm2 ani Prometheus, protože iii je nahrazuje.

To znamená, že jeden další příkaz rozšíří agentmemory o celou novou schopnost.

### Rozšiřte agentmemory dalšími workery

Vestavěné (builtin) workery, které agentmemory potřebuje, jsou už v `iii-config.yaml` a startují s ním: `iii-state` (KV), `iii-queue` (trvalé opakování pro odběratele událostí), `iii-pubsub`, `iii-cron`, `iii-stream` a `iii-observability` (OTEL trace, metriky a logy u každé funkce). Cokoli dalšího z [registru workerů iii](https://workers.iii.dev) se zapojí do stejného enginu: zkopírujte `iii-config.yaml` do `~/.agentmemory/iii-config.yaml` (CLI tento soubor preferuje před zabaleným a pořád do něj vykresluje porty a cesty k datům), přidejte položku, jednou nainstalujte runtime workeru pomocí `~/.agentmemory/bin/iii update worker` a agentmemory restartujte.

```yaml
workers:
  # ...the bundled entries...
  - name: database          # SQL-backed state adapter when you outgrow the KV defaults
  - name: iii-sandbox       # run code that came out of memory_recall inside a throwaway VM
  - name: mcp               # extra MCP servers next to agentmemory's, same engine
```

| Worker | Co navíc získáte oproti agentmemory |
|---|---|
| [`database`](https://workers.iii.dev/workers/database) | adaptér stavu nad SQL, když vám výchozí KV nestačí |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | kód, který vyšel z `memory_recall`, běží uvnitř jednorázového VM, ne ve vašem shellu |
| [`mcp`](https://workers.iii.dev/workers/mcp) | postavte další servery MCP vedle toho od agentmemory, se stejným enginem |

Na enginu 0.22.x zachovejte pro výše uvedené builtin workery názvy s prefixem `iii-`; nepreixované položky `http`, `state`, `queue`, `pubsub` a `cron` jsou samostatné workery z registru, na které se agentmemory přesune s migrací na 0.23.

Úplný registr: [workers.iii.dev](https://workers.iii.dev). Každý worker tam skládá přes stejná primitiva, která používá agentmemory, a agentmemory, které už máte, je jedním z nich.

### Konfigurace enginu a bind adresa

`agentmemory start` čte konfiguraci enginu z prvního souboru, který existuje: `AGENTMEMORY_III_CONFIG`, `./iii-config.yaml` v aktuálním adresáři, `~/.agentmemory/iii-config.yaml`, pak zabalený `iii-config.yaml`. Při každém startu tento soubor vykreslí (cesty k datům, porty, backend stavu) do `~/.agentmemory/data/iii-config.runtime.yaml` a engine spustí s vykresleným souborem, takže upravujte zdrojový soubor, ne ten vykreslený. Hodnoty `host:` ze zdrojového souboru se zachovávají tak, jak jsou napsané.

Zabalený `iii-config.yaml` se váže na `127.0.0.1` zcela úmyslně, a tato výchozí hodnota platí i uvnitř kontejneru. CLI spuštěné v kontejneru poslouchá na loopbacku kontejneru, takže publikované porty se nikam nedostanou. Aby bylo kontejnerizované CLI dosažitelné přes publikované porty, nastavte `AGENTMEMORY_III_CONFIG` na konfiguraci, která se váže na `0.0.0.0`. Zabalený `iii-config.docker.yaml` je taková konfigurace: váže `iii-http`, `iii-stream` a port enginu na `0.0.0.0` a ukládá stav pod `/data`, takže tam připojte zapisovatelný volume. Mějte nastavené `AGENTMEMORY_SECRET` a publikujte jen porty, které potřebujete, na `127.0.0.1` nebo za proxy, které důvěřujete.

`docker-compose.yml` z tohoto repozitáře nejde přes vyhledávání konfigurace v CLI: připojí `iii-config.docker.yaml` jako `/app/config.yaml` a kontejner `iii-engine` se spustí s `--config /app/config.yaml`. Šablony pro [nasazení na jedno kliknutí](../deploy/) si zapisují svou vlastní konfiguraci `0.0.0.0` ve svých entrypointech.

### Úložný backend: file (výchozí) vs redis

`iii-state` a `iii-stream` ve výchozím stavu používají zabalené souborové úložiště KV iii-engine: jeden JSON soubor na scope, držený v paměti procesu enginu a periodicky přepisovaný na disk. To je správná výchozí hodnota pro lokální instalaci jednoho uživatele; sdílený daemon s více souběžnými writery dostane místo toho skutečné zápisy po jednotlivých klíčích z Redis, za cenu síťového round-tripu na každou operaci (každé volání `state::*` se stejně serializuje na jednom spojení Redis, takže se tím vyměňuje zámek souborového úložiště za socket, ne za paralelismus).

Nastavte `AGENTMEMORY_STATE_BACKEND=redis` (plus `AGENTMEMORY_REDIS_URL`), abyste přepnuli oba workery na vestavěný adaptér `redis` iii-engine, který ukládá každý klíč jako pole hash Redis (`HSET`) místo přepisování celého scope při každém zápisu:

```env
# ~/.agentmemory/.env
AGENTMEMORY_STATE_BACKEND=redis
AGENTMEMORY_REDIS_URL=redis://localhost:6379
```

`AGENTMEMORY_STATE_BACKEND` má výchozí hodnotu `file`; když ho nenastavíte, dnešní chování se nezmění, a nerozpoznaná hodnota (cokoli jiného než `file` nebo `redis`) je chyba při startu, ne tichý fallback. `/agentmemory/status` a stránka Health ve viewer (řádek State store) hlásí, který backend je aktivní a zda odpovídá, nikdy ne URL.

**Pouze čisté `redis://`.** Pinned engine (0.22.1) sestavuje svého klienta Redis bez podpory TLS, takže URL `rediss://` (většina správovaných nabídek Redis, jako Upstash, Redis Cloud a ElastiCache se šifrováním při přenosu, má ve výchozím stavu jen TLS) se nepřipojí. Spojení je nešifrované, takže heslo Redis i každá uložená paměť cestují po síti v čistém textu: nasměrujte na lokální Redis nebo na Redis v privátní síti, které důvěřujete. Pro jakýkoli jiný Redis spusťte šifrovaný tunel (stunnel, SSH nebo VPN) na hostiteli agentmemory, aby čistý skok `redis://` zůstal na tomto hostiteli a upstream spojení tunelu bylo šifrované a autentizované. Pokud heslo Redis obsahuje jednoduchou uvozovku, percent-encode ji (`%27`); engine URL rozvine do své konfigurace YAML ještě před parsováním.

**Jeden server Redis na jeden `--instance`.** Prefixy klíčů Redis v enginu (`state:<scope>`, `stream:<name>:<group>`) jsou pevné, takže dvě instance agentmemory (`--instance 1`, `--instance 2`, ...) nasměrované na stejnou databázi si přepíší data navzájem. Samostatný index databáze (`redis://localhost:6379/1`) udrží uložená data odděleně, ale engine přenáší živé události vieweru přes jeden pub/sub kanál Redis (`stream::events`), a pub/sub Redis ignoruje index databáze, takže viewer každé instance by i tak zobrazoval živé události té druhé. Pokud provozujete více než jednu instanci, dejte každé vlastní server (nebo port) Redis.

**Co zůstává stejné a co se liší.** Na Redis funguje každá funkce agentmemory: sessions, pozorování, paměti (remember, supersede, evolve, forget), vyhledávání a indexové dávky, lessons, graf, audit log a jeho měsíční scopy, export a import, governance delete, stav konsolidace, snapshot vieweru a jeho živý stream, i health monitor. Engine ukládá každý scope jako jeden hash Redis (`HSET`/`HGET`/`HGETALL`) a vyvolává stejné state triggery jako souborové úložiště. Uvnitř agentmemory se ošetřují tři rozdíly enginu:

- Redis vrací záznamy scope v žádném pevném pořadí. agentmemory je seřadí od nejstarších (podle času vytvoření v id záznamu, pak podle jeho timestampu), takže seznamy, stránkování a dávky exportu se vrátí ve stejném pořadí jako na souborovém úložišti.
- Engine aplikuje částečné aktualizace na Redis ve skriptu Lua, který prázdná pole mění na prázdné objekty. agentmemory aplikuje tyto aktualizace sám (čti, změň, zapiš pod zámkem na klíč) na Redis, takže pole jako `tags: []` zůstanou poli.
- Starší kontrola audit logu čte starý scope z Redis, místo hledání souboru souborového úložiště na disku.

Jeden rozdíl vyžaduje vaši pozornost: **po restartu Redis engine přestane předávat živé události** vieweru, dokud se agentmemory nerestartuje. Data se stále normálně ukládají a čtou. Health monitor posílá testovací událost přes Redis každých 30 sekund; když se nevrátí, `/agentmemory/status` a stránka Health ve viewer zobrazí „Live updates are not reaching the viewer" s opravou: restartujte agentmemory. Pokud Redis neběží, status report zobrazí „The state store is not answering" a jak to ověřit (`redis-cli -u "$AGENTMEMORY_REDIS_URL" ping`). Výpis velmi velkého scope čte celý hash v jednom `HGETALL`, se stejnými náklady, jako kdyby ho v paměti drželo souborové úložiště.

**Doporučená nastavení Redis.** Výchozí snapshotová politika `save 3600 1 300 100 60 10000` může při pádu ztratit minuty zápisů, hůř než 5sekundové okno flush souborového úložiště. Nastavte `appendonly yes` pro cokoli, o co byste nerádi přišli. Nastavte `maxmemory-policy noeviction`; `allkeys-lru` nebo podobné tiše odhazují paměti, jakmile Redis narazí na svůj limit paměti.

Nativní (nekontejnerový) start a každá šablona pro [nasazení na jedno kliknutí](../deploy/) (přepisují zabalený `iii-config.yaml` a startují nativně) čtou `AGENTMEMORY_STATE_BACKEND`/`AGENTMEMORY_REDIS_URL` a vykreslují je do spuštěné `iii-config`. Samotná URL se do tohoto vykresleného souboru nikdy nezapisuje, pouze odkaz `${AGENTMEMORY_REDIS_URL}`, který proces enginu rozvine ze svého vlastního prostředí při startu. Jen vlastní cesta Docker Compose tohoto repozitáře (`AGENTMEMORY_USE_DOCKER=1`, nebo navázání na engine už takto spuštěný) připojuje `iii-config.docker.yaml` jako read-only a nikdy nevykresluje; `agentmemory start` na tuto kombinaci varuje. Tento soubor přepněte manuálně, podle stejného tvaru `name: redis` / `config: redis_url: ...` uvedeného v dokumentaci workerů [iii-state](https://workers.iii.dev/workers/iii-state) a [iii-stream](https://workers.iii.dev/workers/iii-stream), a nasměrujte `redis_url` na Redis dostupný z kontejneru. `docker-compose.yml` předává `AGENTMEMORY_REDIS_URL` do kontejneru enginu, takže tam funguje `redis_url: '${AGENTMEMORY_REDIS_URL}'` a URL se tím nedostane do připojeného souboru.

Vykreslená konfigurace udržuje URL mimo `~/.agentmemory/data/iii-config.runtime.yaml`, ale vlastní konfigurační worker enginu stejně po startu uloží *rozvinutou* hodnotu do `~/.agentmemory/config/iii-state.yaml` a `iii-stream.yaml` (expanze `${VAR}` v iii-engine proběhne dřív, než tento worker uloží svůj seed, a uloží se vyřešená hodnota, ne odkaz). Zacházejte s tímto adresářem, jako by obsahoval přihlašovací údaj: na jakémkoli sdíleném hostiteli udělejte `chmod 700 ~/.agentmemory` a dejte přednost uživateli ACL Redis omezenému na to, co agentmemory potřebuje, před administrátorskými údaji databáze.

**Migrace není automatická.** Přepnutí `AGENTMEMORY_STATE_BACKEND` začíná na obou stranách od prázdného úložiště; nic nekopíruje existující data z file do Redis nebo zpět. Exportujte z backendu, který opouštíte, a importujte do toho, na který přecházíte. Toto běží identicky v bash i zsh (včetně `bash -u`). Pole jako `AUTH=(${AGENTMEMORY_SECRET:+-H "Authorization: Bearer $AGENTMEMORY_SECRET"})` tak nefunguje: zsh zachová hlavičku jako jedno poškozené slovo, kde bash ji rozdělí na dvě, takže oba požadavky vrátí 401 pokaždé, když je `AGENTMEMORY_SECRET` nastaveno:

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

`/agentmemory/export` také přijímá `?maxSessions=` a `?offset=` pro rozdělení velkého korpusu do více volání; `strategy` při importu je `merge` (bezpečná výchozí hodnota), `replace` nebo `skip`.

### Co iii nahrazuje

| Tradiční stack | agentmemory používá |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + in-memory vektorový index |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | dohled nad workery iii engine |
| Prometheus / Grafana | iii OTEL + health monitor |
| Vlastní systémy pluginů | `iii worker add <name>` |

**219 zdrojových souborů · ~52,000 řádků kódu · 2,500+ testů · 311 funkcí · 60 KV scopes**, vše na třech primitivech. Žádné `agentmemory plugin install`. Systém pluginů je samo iii.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Konfigurace" height="32" /></picture></h2>

### Poskytovatelé LLM

agentmemory automaticky detekuje poskytovatele z vašeho prostředí. Poskytovatel zpřístupní operace založené na LLM, ale samotná konfigurace poskytovatele nezapíná kompresi pozorování psanou LLM. Tato cesta vyžaduje jak poskytovatele, tak `AGENTMEMORY_AUTO_COMPRESS=true`.

| Poskytovatel | Konfigurace | Poznámky |
|----------|--------|-------|
| **No-op (výchozí)** | konfigurace není potřeba | komprese/shrnutí přes LLM je vypnuto. Syntetická komprese a vyhledávání přes BM25 fungují i tak. Pokud jste se dříve spoléhali na záložní řešení přes předplatné Claude, viz `AGENTMEMORY_ALLOW_AGENT_SDK` níže. |
| Anthropic API | `ANTHROPIC_API_KEY` | fakturace za token |
| MiniMax | `MINIMAX_API_KEY` | kompatibilní s Anthropic |
| Gemini | `GEMINI_API_KEY` | zapíná i embeddingy |
| OpenRouter | `OPENROUTER_API_KEY` | jakýkoli model |
| OpenAI API | `OPENAI_API_KEY` | výchozí `gpt-5.6-luna`, přepište pomocí `OPENAI_MODEL` |
| **Lokální (Ollama / LM Studio / vLLM / llama.cpp)** | `OPENAI_API_KEY=local` + `OPENAI_BASE_URL=http://localhost:11434/v1` (Ollama) nebo `http://localhost:1234/v1` (LM Studio) + `OPENAI_MODEL=<your model>` | cokoli kompatibilní s OpenAI API. Nulové náklady, běží na vašem hardwaru. Viz [Lokální modely](#local-models-ollama--lm-studio--vllm) níže. |
| Záložní řešení přes předplatné Claude | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | pouze opt-in. Spouští sessions `@anthropic-ai/claude-agent-sdk`; dříve to způsobovalo neomezenou rekurzi Stop-hook, takže už to není výchozí nastavení. |

### Lokální modely (Ollama / LM Studio / vLLM)

agentmemory komunikuje s jakýmkoli serverem kompatibilním s OpenAI API, takže cokoli, co zpřístupňuje `/v1/chat/completions`, funguje beze změn kódu. Žádné placené klíče, žádný cloud, žádné rate limity; běží čistě na vašem hardwaru.

**Ollama** (výchozí port `11434`):

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

**LM Studio** (výchozí port `1234`):

Otevřete LM Studio → záložku Local Server → Start Server. V nabídce vyberte libovolný chat model (Qwen 3, gpt-oss, DeepSeek R1 atd.).

```env
# ~/.agentmemory/.env
OPENAI_API_KEY=lmstudio                        # any non-empty string; LM Studio ignores it
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=qwen3-8b                          # match the model name from LM Studio
```

**vLLM / llama.cpp / Text Generation Inference**: stejný tvar. Nasměrujte `OPENAI_BASE_URL` na URL, kterou zpřístupňuje váš server, a nastavte `OPENAI_MODEL` na název, který váš server přijme.

**Výběr modelu pro práci s pamětí**: komprese a shrnutí jsou krátké úlohy (<2K tokenů na vstupu, <500 tokenů na výstupu), kde plně postačí 7B instruct model. Doporučení:

| Model | Velikost | Proč |
|-------|------|-----|
| `qwen3:8b` | ~5.2 GB | vyvážená výchozí volba na stroji s 16 GB; silný v extrakci a textu ve tvaru nástrojů |
| `qwen3:4b` | ~2.6 GB | nejmenší rozumná volba; v pořádku pro kompresi, slabší pro extrakci grafu |
| `qwen3-coder:30b` | ~19 GB | nejlepší lokální volba pro sessions ve tvaru kódu (30B MoE, 3.3B aktivních) na hardwaru 24-32 GB |
| `gpt-oss:20b` | ~14 GB | silný obecný model, který se vejde do 16 GB RAM |
| `deepseek-r1:8b` | ~5.2 GB | reasoning distill; pomalejší, ale čistší extrakce |

Modely Qwen 3 ve výchozím stavu „myslí" a mohou spálit celý rozpočet tokenů na uvažování ještě před jakýmkoli výstupem. Nastavte `AGENTMEMORY_LLM_NOTHINK=1`, aby se k promptům pro extrakci grafu přidalo `/no_think`, a zvyšte `MAX_TOKENS` (16384 funguje), pokud se extrakce vrací prázdné.

Modely třídy reasoning (ve stylu `o1` s bloky `<think>`) mohou vracet prázdný `content` s polem `reasoning`, které váš lokální server nemusí zpřístupnit. Pokud se extrakce vrací prázdné, nejprve přepněte na model bez reasoning. Proměnná prostředí `OPENAI_REASONING_EFFORT=none` může také vypnout myšlení u thinking modelů Ollama Cloud, které zrcadlí schéma reasoning od OpenAI.

Lokální embeddingy se dodávají jako volitelná závislost, ale ve výchozím stavu nejsou zapnuté. Nastavte `EMBEDDING_PROVIDER=local`, abyste zapnuli `Xenova/all-MiniLM-L6-v2` (384 dimenzí). První požadavek na embedding stáhne model; inference pak běží na zařízení. Bez tohoto nastavení nebo vzdáleného klíče pro embeddingy zůstávají vektory vypnuté, `mem::search` používá BM25 a `smart-search` může i tak přidat existující shody z grafu.

### Výběr modelu s ohledem na náklady

Když je komprese na pozadí psaná LLM zapnutá (poskytovatel i `AGENTMEMORY_AUTO_COMPRESS=true`), běží u každého pozorování, takže volba modelu výrazně ovlivní měsíční výdaje. Zachycená data o zátěži: 635 requestů / 888K tokenů / 35 hodin aktivního používání, spuštěno proti třem modelům OpenRouter podle ceníku z 2026-05-23.

| Úroveň | Model | Vstup / 1M | Výstup / 1M | Náklady za zachycených 35h | Poznámky |
|------|-------|------------|-------------|---------------------------|-------|
| Doporučeno | `deepseek/deepseek-v4-flash-0731` | $0.07 | $0.14 | ~$0.07 (odhad) | nejnovější DeepSeek; nejlevnější doporučená volba pro zátěž typu komprese. |
| Doporučeno | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | solidní kvalita komprese + shrnutí za ~10× nižší náklady než Sonnet. |
| Doporučeno | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | silné uvažování nad kódem, pokud jsou vaše sessions silně orientované na kód. |
| Prémiová | `anthropic/claude-sonnet-5` | $3.00 | $15.00 | ~$5.02 (odhad) | stejná ceníková cena jako naměřený běh Sonnet 4.6; úvodní cena $2/$10 do 2026-08-31. |
| Prémiová | `openai/gpt-5.6-sol` | $5.00 | $30.00 | ~$9 (odhad) | vlajková úroveň; nákladná pro neustále běžící práci na pozadí. |
| Vyhněte se | `anthropic/claude-opus-5` | $5.00 | $25.00 | ~$8.40 (odhad) | model vlajkové třídy; přeplatíte za kompresi. |

Naměřené řádky pocházejí ze zachyceného běhu; řádky (odhad) škálují stejnou směs tokenů podle ceníkové ceny každého modelu.

agentmemory vypíše při startu varování, když `OPENROUTER_MODEL` odpovídá vzoru prémiové úrovně. Nastavte `AGENTMEMORY_SUPPRESS_COST_WARNING=1`, abyste ho umlčeli, jakmile učiníte informovanou volbu.

Poměr kvality a nákladů pro práci s pamětí: komprese je úloha typu shrnutí s poměrně volnými nároky na kvalitu (shrnutí si znovu čte agent, ne uživatel). DeepSeek V4 Flash / V4 Pro / Qwen3-Coder se v této úloze blíží Sonnet na úroveň zaokrouhlovací chyby, za 10-70× nižší náklady. Prémiové modely šetřete na dotazy, které čtete přímo vy.

Zdroje: [ceník OpenRouter pro Claude Sonnet 5](https://openrouter.ai/anthropic/claude-sonnet-5), [DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash-0731), [poznámky k cenám DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/).

### Paměť pro víc agentů (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

V multi-agentních nastaveních, kde si několik rolí sdílí jeden server agentmemory (architekt / vývojář / reviewer / researcher / support agent), `AGENT_ID` oznamuje každý zápis rolí, která ho vytvořila. `AGENTMEMORY_AGENT_SCOPE` řídí, zda vyhledávání podle této značky filtruje.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

Dva režimy:

| Režim | Značí zápisy | Filtruje vyhledávání | Kdy použít |
|------|------------|---------------|-------------|
| `shared` (výchozí) | ano | ne | kontext napříč agenty s audit trail. Architekt vidí, co zaznamenal vývojář, ale každý řádek zaznamená, kdo to řekl. |
| `isolated` | ano | ano | striktní oddělení. Architekt nikdy nevidí pozorování / paměti / sessions vývojáře. |

Co se značí, když je `AGENT_ID` nastaveno: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. Role prochází od `api::session::start` → `mem::observe` → `mem::compress` → KV.

Co se filtruje v izolovaném režimu: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Každý endpoint přijímá `?agentId=<role>` pro přepsání na úrovni jednotlivého požadavku a `?agentId=*` pro úplné odhlášení z rozsahu dle env. `/memories` také přijímá `?includeOrphans=true`, aby se zobrazily paměti z doby před AGENT_ID, jejichž `agentId` je nedefinované.

Přepsání na úrovni jednotlivého volání ve vrstvě SDK / REST: každý měnící endpoint (`/session/start`, `/remember`) přijímá pole `agentId` v těle požadavku, které má přednost před env. Užitečné pro runtime, které směrují mnoho rolí přes jeden proces serveru. Nástroj MCP `memory_save` zpřístupňuje stejné pole `agentId`, samostatný stdio server předává jak `agentId`, tak `project`, a uložené paměti nesou `agentId` do vyhledávacího indexu, takže vyhledávání v rozsahu agenta pokrývá jak paměti, tak pozorování.

Když `AGENT_ID` není nastaveno, paměť zůstává bez rozsahu (starší chování, žádné značky, žádné filtry).

### Porty

agentmemory + iii-engine se ve výchozím stavu váží na čtyři porty. Pokud restart selže s `port in use`, tato tabulka vám řekne, jaký proces hledat.

| Port | Proces | Účel | Přepis přes env |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | interní worker streamů (využívá ho agentmemory + viewer) | `III_STREAM_PORT` (preferováno) nebo starší `III_STREAMS_PORT` |
| `3113` | agentmemory | viewer v reálném čase (`http://localhost:3113`) | `III_VIEWER_PORT` nebo `AGENTMEMORY_VIEWER_URL` pro hlášenou URL |
| `49134` | iii-engine | WebSocket; zde se registrují workery, protéká tím telemetrie OTel | `III_ENGINE_PORT` nebo `III_ENGINE_URL` |

`--port <N>` změní kotvu REST a odvodí streamy `N+1`, viewer `N+2` a WebSocket enginu `N+46023`, jen pokud odpovídající explicitní port nebo URL výše není nastaven. Nevytváří izolovaný namespace životního cyklu. Pro druhý daemon použijte `--instance 1`; používá kotvu 3211, výchozí `3211/3212/3213/49234`, a dostane samostatný adresář dat a životního cyklu `instance-1`. Instance 1 až 50 se řídí stejným vzorem.

Pinned engine startuje s `--no-update-check` (žádné vyhledávání aktualizací nebo bezpečnostních upozornění proti GitHubu při startu) a s vypnutou anonymní telemetrií používání iii: agentmemory nastaví `III_TELEMETRY_ENABLED=false` pro engine, který spouští, pokud si tuto proměnnou nevyexportujete sami, a zabalený soubor compose dělá totéž.

Vyčištění zaseknutých procesů, když porty zůstanou obsazené po zhavarovaném běhu:

```bash
# macOS / Linux — find whatever is on each port and kill it
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` čistě sklidí pidfile workeru i enginu při korektním nativním vypnutí. V režimu Docker vypláchne nativní worker, zastaví přesně validovaný kontejner enginu a zachová jak kontejner, tak jeho mount `/data` pro bezeztrátový restart; další start validuje a obnoví tentýž kontejner. Odinstalace postavená na Dockeru vyžaduje `agentmemory remove --keep-data`: odstraní sdílené soubory správované agentmemory, přičemž zachová validovaný kontejner, jeho datový mount a záznam životního cyklu potřebný k jejich obnovení. Destruktivní smazání dat Dockeru je záměrně ponecháno na operátorovi po zálohování. CLI také odmítá přijmout nebo signalizovat držitele portů Docker nebo VM (Docker backend, vpnkit, colima) jako nativní engine, pokud není předán `--force`. Výše uvedené manuální čištění je jen pro případ po havárii, kdy nezůstal žádný pidfile.

### Konfigurační soubor

Dejte runtime konfiguraci agentmemory do `~/.agentmemory/.env`, místo exportování proměnných v každém shellu. Pokud viewer zobrazí instalační nápovědu jako `export ANTHROPIC_API_KEY=...`, zkopírujte ji do tohoto souboru jako `ANTHROPIC_API_KEY=...` bez prefixu `export`, pak agentmemory restartujte.

Proměnné prostředí procesu stále fungují a mají přednost před hodnotami v souboru.

Na Windows žije stejný soubor na `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

Pro test s předplatným Claude Code Pro/Max místo API klíče se přihlaste explicitně:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

Komprese pozorování psaná LLM vyžaduje obě řádky: přístup k poskytovateli LLM (včetně tohoto explicitního záložního řešení přes předplatné) a `AGENTMEMORY_AUTO_COMPRESS=true`. Samotný poskytovatel nechá na místě výchozí syntetickou cestu komprese.

Konsolidace (uzly grafu, lessons, crystals) je ve výchozím stavu zapnutá, kdykoli je nakonfigurován poskytovatel LLM. Explicitně se z ní odhlaste pomocí `CONSOLIDATION_ENABLED=false`, pokud chcete provoz bez LLM. Extrakce grafu je samostatný příznak:

```env
GRAPH_EXTRACTION_ENABLED=true
# CONSOLIDATION_ENABLED=false   # opt out of auto-consolidation
```

### Proměnné prostředí

Vytvořte `~/.agentmemory/.env`:

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

138 endpointů na portu `3111`. REST API se ve výchozím stavu váže na `127.0.0.1`. Chráněné endpointy vyžadují `Authorization: Bearer <secret>`, a endpointy pro mesh sync vyžadují explicitně nastavené `AGENTMEMORY_SECRET` na obou stranách.

**Autentizace je ve výchozím stavu zapnutá.** Když `AGENTMEMORY_SECRET` není nastaveno (v shellu ani v `~/.agentmemory/.env`), server při prvním startu vygeneruje náhodný secret a uloží ho do `~/.agentmemory/secret` s režimem `0600`. Každý zabalený klient ho odtud čte, když mluví s lokálním serverem: CLI, viewer, hooks pod `plugin/scripts`, server MCP a shim `@agentmemory/mcp`, konfigurace zapsané příkazem `agentmemory connect` a zabalené integrace OpenCode, Pi, OpenClaw, Hermes a filesystem-watcher. Uložený secret se posílá jen na loopback URL (`localhost`, `127.0.0.0/8`, `::1`). Explicitní `AGENTMEMORY_SECRET` má vždy přednost, a vzdálení klienti ho stejně potřebují nastavený. Docker a entrypointy v `deploy/` už svůj vlastní secret generují a exportují. Pro manuální volání API:

```bash
curl -H "Authorization: Bearer $(cat ~/.agentmemory/secret)" http://localhost:3111/agentmemory/health
```

**Pravidla požadavků pro zápisy.** Požadavky `POST`, `PUT`, `PATCH` a `DELETE` na REST API a viewer musí poslat `Content-Type: application/json` (parametr `charset` je v pořádku), kdykoli nesou tělo, a hlavička `Origin`, pokud je přítomná, musí být loopback origin pro nakonfigurovaný port REST nebo vieweru, nebo musí být uvedena v `VIEWER_ALLOWED_ORIGINS` (odděleno čárkami, např. `https://memory.example.com`). Klienty, které žádnou hlavičku `Origin` neposílají (CLI, hooks, MCP, curl, server-server), se to nijak nedotýká. Viewer navíc akceptuje svůj vlastní origin.

**Cesty k souborům.** Endpointy, které čtou nebo zapisují soubory (`/compress-file`, `/replay/import-jsonl`, `/graph/import-graphify`), přijímají jen cesty pod `~/.agentmemory`, adresářem dat instance, nebo adresářem uvedeným v `AGENTMEMORY_IMPORT_ROOT` (víc jich oddělte pomocí `:`, na Windows pomocí `;`). `/replay/import-jsonl` navíc přijímá svou výchozí `~/.claude/projects`. `/obsidian/export` zůstává uvnitř `AGENTMEMORY_EXPORT_ROOT` a `/migrate` uvnitř `~/.agentmemory`. Symlinky se vyřeší před každou kontrolou.

**Odstraňování secrets.** API klíče, bearer tokeny, bloky privátních klíčů PEM a přihlašovací údaje vložené v URL (`scheme://user:password@host`) se před uložením textu odstraní, na každé cestě zápisu: pozorování, remember, evolve, slots, lessons, actions, sketches, signály, checkpoints, importy, jsonl replay, mesh sync, sdílení s týmem, výstup komprese a shrnutí, crystals a uzly grafu.

<details>
<summary>Klíčové endpointy</summary>

| Metoda | Cesta | Popis |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | kontrola zdraví (vždy veřejná) |
| `GET` | `/agentmemory/status` | co je špatně a jak to opravit (HTML pro prohlížeče, jinak JSON) |
| `GET` | `/agentmemory/viewer/snapshot` | vše, co viewer zobrazuje, v jedné odpovědi |
| `POST` | `/agentmemory/session/start` | spustí session + vrátí kontext |
| `POST` | `/agentmemory/session/end` | ukončí session |
| `POST` | `/agentmemory/observe` | zachytí pozorování (viz doručení zachycení níže) |
| `GET` | `/agentmemory/capture` | inbox zachycení, dead letters a offline spool |
| `POST` | `/agentmemory/capture/retry` | zopakuje zachycení v dead letters |
| `POST` | `/agentmemory/capture/drain` | hned odešle lokální offline spool |
| `POST` | `/agentmemory/smart-search` | hybridní vyhledávání |
| `POST` | `/agentmemory/context` | vygeneruje kontext |
| `POST` | `/agentmemory/remember` | uloží do dlouhodobé paměti |
| `POST` | `/agentmemory/forget` | smaže pozorování |
| `POST` | `/agentmemory/enrich` | kontext souboru + paměti + bugy |
| `GET` | `/agentmemory/profile` | profil projektu |
| `GET` | `/agentmemory/export` | exportuje všechna data |
| `POST` | `/agentmemory/import` | import z JSON |
| `POST` | `/agentmemory/graph/query` | dotaz na znalostní graf |
| `POST` | `/agentmemory/graph/compact` | zmenší nadměrnou provenienci grafu |
| `POST` | `/agentmemory/team/share` | sdílí s týmem |
| `GET` | `/agentmemory/audit` | audit trail |

Úplný seznam endpointů: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

**Doručení zachycení.** Hooks poslají každé pozorování jednou na `POST /agentmemory/observe` s `eventId`. Je to vlastní id hostitele pro to volání, pokud ho payload má (například `tool_use_id` z Claude Code), jinak hash session, typu hooku, názvu nástroje, vstupu, výstupu a timestampu hostitele. Server zapíše událost do inboxu zachycení ve state store, uloží pozorování, pak odstraní položku z inboxu. Status kód říká, co se stalo:

| Status | pole `status` | Význam |
|---|---|---|
| `201` | `accepted` | uloženo. `observationId` je nové pozorování. |
| `202` | `accepted` (`state: "retrying"`) | přijato, ale uložení selhalo. Server to zopakuje, i po restartu. |
| `200` | `duplicate` | toto `eventId` už bylo přijato. `observationId` je existující pozorování; nic nového se neuloží. |
| `400` / `422` | `rejected` | neplatný payload, nebo uložení definitivně selhalo (událost se uchová jako dead letter). |
| `503` | `rejected` (`retryable: true`) | inbox je plný (`AGENTMEMORY_CAPTURE_INBOX_MAX`). Hooks událost uloží do spoolu a pošlou později. |

Neúspěšné události se opakují každých `AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS` (10 s) se zdvojnásobujícím se zpomalením, až do `AGENTMEMORY_CAPTURE_MAX_ATTEMPTS` (5). Události, které stále selhávají, zůstávají v inboxu jako dead letters, jsou uvedeny na `/agentmemory/status` a na stránce Health vieweru, a lze je zopakovat pomocí `POST /agentmemory/capture/retry` (`{"eventId": "..."}` nebo `{"all": true}`). Přijatá id událostí se pamatují po `AGENTMEMORY_CAPTURE_DEDUP_HOURS` (168 hodin, nejvýš `AGENTMEMORY_CAPTURE_EVENTS_MAX` id), takže hook přehraný po timeoutu nebo restartu se uloží jednou, zatímco dvě samostatná volání nástroje s vlastními id hostitele se uloží dvakrát, i když je jejich obsah identický. Když je pozorování smazáno (forget, smazání session, eviction, auto-forget nebo import, který nahrazuje úložiště), jeho událost se označí jako smazaná ještě před odstraněním pozorování, takže přehrání této události ve stejném okně se zodpoví jako duplikát a nic se neuloží. State store zapisuje na disk každé 2 sekundy, takže zodpovězená událost může ještě chvíli existovat jen v paměti. Aby to bylo ošetřeno, každá odpověď `2xx` nese i `bootId` serveru (nové při každém startu), `acceptedAt` a `durableAfterMs` (interval ukládání plus 1,5 s na souborovém úložišti, 1,5 s na redis, kde je trvalost na nastavení operátora). Hooks uchovávají událost v lokálním spoolu, dokud toto okno neuplyne, a smažou ji při pozdějším volání bez dalšího požadavku. Pokud se `bootId` do té doby změnil, server se restartoval, takže hook pošle událost znovu se stejným `eventId`; událost, která se na disk dostala, se neuloží dvakrát. Server takové události posílá i sám při startu a při každém intervalu opakování, takže restart nic neztratí, i když potom žádný hook neběží. Starší hooks ignorují extra pole a nové hooks proti staršímu serveru zahodí událost na `2xx` jako dřív.

Když je server mimo provoz, neodpoví včas nebo vrátí 5xx, hook připojí pozorování do lokálního souboru spoolu, `<data dir>/capture-spool/<host>-<port>.jsonl` (adresář přepište pomocí `AGENTMEMORY_CAPTURE_SPOOL_DIR`). Soubor je privátní pro vašeho uživatele (režim 600), secrets jsou odstraněny stejně jako je odstraňuje server, pojme nejvýš `AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES` (5 MiB) a zahazuje záznamy starší než `AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS` (168). Když je plný, nové záznamy se zahodí a započítají, a `/agentmemory/status` to nahlásí. Hook stále skončí s kódem 0 ve svém časovém limitu a nepřidá žádný požadavek, když je server zdravý. Spool se odešle při dalším startu a prvním hookem, který se znovu dostane k serveru, v procesu na pozadí, aby agent nečekal. Id událostí to dělají bezpečným: pozorování, které dorazilo před timeoutem, se neuloží dvakrát. `npx @agentmemory/agentmemory capture` zobrazí spool i inbox serveru, `--drain` hned odešle spool a `GET /agentmemory/capture` vrátí totéž jako JSON. Nastavte `AGENTMEMORY_CAPTURE_SPOOL=false`, abyste spool vypnuli.

**Komprimace provenience grafu.** Každý uzel a hrana znalostního grafu si drží id posledních 32 pozorování, ze kterých vznikly. Úložiště zapsaná před tímto limitem mohou mít u „horkého" uzlu tisíce id, což zpomaluje vyhledávání v grafu a viewer, nebo to shazuje worker. agentmemory to opravuje samo: při prvním startu po upgradu na pozadí zmenší každý uzel, hranu, nahrazenou hranu (temporální historii grafu) a cachovaný snapshot na tento limit, v malých dávkách s pauzou mezi nimi, aby vyhledávání, zachycení i viewer fungovaly dál. Ukládá si svůj postup, pokračuje po restartu a po dokončení už nikdy znovu neběží. `/agentmemory/status` a stránka Health vieweru ji zobrazují jako čekající, běžící (s aktuálním scope a pozicí), hotovou nebo neúspěšnou. Nastavte `AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false`, abyste ji vypnuli.

Pro manuální spuštění zavolejte `POST /agentmemory/graph/compact`. Prochází indexy názvů a klíčů hran místo výpisu každého uzlu a hrany, a je bezpečné ho spustit znovu. Když zmenší id, zapíše audit záznam `graph_compact`.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{}'
```

Na velkém úložišti, nebo když volání vrátí 504, spusťte ho po dávkách. Pošlete `scope` (`nodes`, `edges` nebo `history`), `offset` a `limit`, pak volejte znovu s vráceným `nextOffset`, dokud není `null`. Udělejte to pro `nodes`, `edges` a `history`, a zakončete jedním voláním `{"scope":"snapshot"}`, protože dávkový běh se cachovaného snapshotu nedotýká.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"nodes","offset":0,"limit":200}'
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"snapshot"}'
```

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Vývoj" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 2,500+ tests
npm run test:integration  # API tests (requires running services)
```

**Požadavky:** Node.js >= 20 s npm/npx; [iii-engine](https://iii.dev/docs) v0.22.1 nebo Docker. Automatická instalace enginu na macOS/Linuxu navíc vyžaduje `curl`, POSIX `sh` a `tar`; nativní Windows používá manuálně pinned `iii.exe`, WSL2 nebo Docker Desktop.

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="Licence" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
