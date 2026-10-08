<p align="center">
  <img src="../assets/banner.png" alt="agentmemory: állandó memória AI kódolóágensek számára" width="720" />
</p>

<p align="center">
  <strong>
    A kódolóágensed mindenre emlékszik. Nem kell többé újra elmagyaráznod.
    A <a href="https://github.com/iii-hq/iii">iii engine</a>-re épül
  </strong><br/>
  Állandó memória a Claude Code, GitHub Copilot CLI, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode és bármely MCP kliens számára.
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1.6k%20stars%20%2F%20230%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Dokumentum: 1.6k csillag / 230 fork a gist-en" /></a>
</p>

<p align="center">
  <em>A gist Karpathy LLM Wiki mintáját bővíti ki megbízhatósági pontszámmal, életciklus-kezeléssel, tudásgráfokkal és hibrid kereséssel: az agentmemory ennek az implementációja.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentmemory/agentmemory"><img src="https://img.shields.io/npm/v/@agentmemory/agentmemory?color=CB3837&label=npm&style=for-the-badge&logo=npm" alt="npm verzió" /></a>
  <a href="https://github.com/rohitg00/agentmemory/actions"><img src="https://img.shields.io/github/actions/workflow/status/rohitg00/agentmemory/ci.yml?label=tests&style=for-the-badge&logo=github" alt="CI" /></a>
  <a href="https://github.com/rohitg00/agentmemory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rohitg00/agentmemory?color=blue&style=for-the-badge" alt="Licenc" /></a>
  <a href="https://github.com/rohitg00/agentmemory/stargazers"><img src="https://img.shields.io/github/stars/rohitg00/agentmemory?style=for-the-badge&color=yellow&logo=github" alt="Csillagok" /></a>
</p>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-recall.svg"><img src="../assets/tags/stat-recall.svg" alt="95.2% visszakeresési R@5" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tokens.svg"><img src="../assets/tags/stat-tokens.svg" alt="92%-kal kevesebb token" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="54 MCP eszköz" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 automatikus hook" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="0 külső adatbázis" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="2,600+ sikeres teszt" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="agentmemory demó" width="720" />
</p>

<p align="center">
  <a href="#install">Telepítés</a> &bull;
  <a href="#quick-start">Gyors indítás</a> &bull;
  <a href="#benchmarks">Benchmarkok</a> &bull;
  <a href="#vs-competitors">Versenytársakkal szemben</a> &bull;
  <a href="#works-with-every-agent">Ágensek</a> &bull;
  <a href="#how-it-works">Hogyan működik</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Megjelenítő</a> &bull;
  <a href="#powered-by-iii">iii által hajtva</a> &bull;
  <a href="#configuration">Konfiguráció</a> &bull;
  <a href="#api">API</a>
</p>

---

## Install

Követelmények:

- Node.js 20 vagy újabb, npm-mel és npx-szel (`node -v`, `npm -v`, és `npx -v`).
- A macOS/Linux alatti automatikus iii-engine telepítéshez `curl`, egy POSIX `sh`, és `tar` is szükséges. A minimális image-ek, mint a `node:20-slim`, esetleg nem tartalmazzák ezeket.
- A natív Windows a pinnelt iii-engine v0.22.1 `iii.exe` manuális telepítését igényli. A WSL2 vagy a Docker Desktop a másik két támogatott út.

A kanonikus friss telepítési parancs:

```bash
npx -y @agentmemory/agentmemory@latest
```

Az első futás egy interaktív beállítás: válaszd ki a bekötendő ágenseket (Claude Code, Cursor, Codex, Gemini CLI, OpenCode, ...), válassz egy LLM-szolgáltatót vagy maradj kulcs nélkül, majd létrehozza a konfigurációt, elindítja a memóriaszervert és a hozzá pinnelt iii engine-t, végül felajánlja a globális telepítést, hogy ezután mindenhol működjön a sima `agentmemory` parancs. A `-y` elfogadja az npx csomag-promptját, a `@latest` pedig elkerüli az elavult gyorsítótárazott kiadást. Egy szolgáltató elérhetővé teszi az LLM-funkciókat, de az LLM által írt megfigyelés-tömörítés csak akkor indul el, ha az `AGENTMEMORY_AUTO_COMPRESS=true` is be van állítva.

A kulcs nélküli mód letiltja a vektor-embeddingeket. A `memory_recall` (a `mem::search` útvonal) BM25-öt használ, míg a `memory_smart_search` strukturális gráfegyezéseket is összevonhat, ha már létezik gráfadat. Az ingyenes, eszközön futó szemantikus felidézéshez állítsd be az `EMBEDDING_PROVIDER=local` értéket a `~/.agentmemory/.env` fájlban, majd indítsd újra. Az első embedding-kérés letölti a `Xenova/all-MiniLM-L6-v2` modellt; az azt követő következtetés már lokálisan fut.

A lokális futtatási környezet négy portot használ: `3111`-et a REST/MCP HTTP-hez, `3112`-t az iii stream-ekhez, `3113`-at a megjelenítőhöz, és `49134`-et az iii worker WebSockethez. A tartós iii állapot macOS-en a `~/Library/Application Support/agentmemory` mappában, Linuxon a `$XDG_DATA_HOME/agentmemory` vagy `~/.local/share/agentmemory` mappában, Windowson pedig a `%APPDATA%\agentmemory` mappában él. A `--data-dir <path>` kapcsolóval vagy az `AGENTMEMORY_DATA_DIR` változóval írhatod felül; minden újraindításnál ugyanazt az értéket használd. A visszafelé kompatibilitás miatt egy már létező `./data/state_store.db` vagy `./data/iii-config.yaml` elsőbbséget kap a platform alapértelmezésével szemben a 0. instance esetén; egy explicit kapcsoló vagy környezeti felülírás továbbra is elsőbbséget kap.

Ezután bizonyítsd be, hogy a felidézés működik, és add meg az ágensednek a saját skilljeit:

```bash
npx -y @agentmemory/agentmemory@latest demo  # seed sample sessions + exercise recall
npx skills add rohitg00/agentmemory -y   # 17 native skills so your agent knows when to reach for memory
```

A kulcsszavas kereséseknek alapértelmezett kulcs nélküli módban is találniuk kell a BM25 révén. A demó `database performance optimization` lekérdezése szándékosan szemantikus, és nulla eredményt adhat, amíg nincs beállítva embedding-szolgáltató.

Inkább hagynád, hogy egy kódolóágens végezze el az egészet? Add neki egyetlen utasítást:

> Retrieve and follow the instructions at: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md

Bármikor bekötsz további ágenseket az `agentmemory connect <agent>` paranccsal — 20 adapter van felsorolva a [Működik minden ágenssel](#works-with-every-agent) részben. A teljes parancsreferencia a [Gyors indítás](#quick-start) alatt található.

<details>
<summary><strong>Windows</strong></summary>

A gyors útvonal a WSL2. A natív Windows engine beállításhoz a pinnelt v0.22.1 ZIP letöltése és az `iii.exe` manuális kibontása szükséges; a CLI nem bontja ki automatikusan. A Docker Desktop is támogatott. Lásd a [Windows megjegyzéseket](#windows) a lépésről lépésre útmutatóért.

</details>

<details>
<summary><strong>Globális telepítés / EACCES</strong></summary>

```bash
npm install -g @agentmemory/agentmemory@latest
```

A fenti npx parancs marad a kanonikus friss telepítési útvonal, és elkerüli a globális prefix jogosultsági problémáit.

</details>

<details>
<summary><strong>Az npx egy régi verziót szolgál ki</strong></summary>

Az npx verziónként gyorsítótáraz. Kényszerítsd a legújabbat az `npx -y @agentmemory/agentmemory@latest` paranccsal, vagy töröld egyszer a gyorsítótárat a `rm -rf ~/.npm/_npx` paranccsal (macOS/Linux; Windows alatt töröld a `%LOCALAPPDATA%\npm-cache\_npx` mappát).

</details>

<details>
<summary><strong>Már fut egy saját iii engine</strong></summary>

Az agentmemory a iii-engine v0.22.1-et pinneli, és nem kapcsolódik más verzióhoz (a worker nem tud egy másik engine protokolljával beszélni). Állítsd le a másik engine-t, majd futtasd az `npx -y @agentmemory/agentmemory@latest` parancsot. Ez telepíti és futtatja a pinnelt v0.22.1-et a `~/.agentmemory/bin` mappában, érintetlenül hagyva a saját `iii`-edet.

</details>

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Működik minden ágenssel" height="32" /></picture></h2>

Az agentmemory bármelyik olyan ágenssel működik, amely támogatja a hookokat, az MCP-t vagy a REST API-t. Minden ágens ugyanazt a memóriaszervert osztja meg.

<table>
<tr>
<td align="center" width="20%">
<a href="https://claude.com/product/claude-code"><img src="https://github.com/anthropics.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>natív plugin + 12 hook + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>natív plugin + 6 hook + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/features/copilot"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/github_dark.svg"><img src="https://svgl.app/library/github_light.svg" alt="GitHub Copilot CLI" width="48" height="48" /></picture></a><br/>
<strong>GitHub Copilot CLI</strong><br/>
<sub>MCP + plugin hookok/skillek</sub>
</td>
<td align="center" width="20%">
<a href="https://cursor.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/cursor_dark.svg"><img src="https://svgl.app/library/cursor_light.svg" alt="Cursor" width="48" height="48" /></picture></a><br/>
<strong>Cursor</strong><br/>
<sub>natív plugin + 7 hook + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../plugin/opencode/"><img src="https://raw.githubusercontent.com/rohitg00/agentmemory/main/website/public/opencode.png" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>rögzítő plugin + MCP</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://devin.ai"><img src="https://raw.githubusercontent.com/rohitg00/agentmemory/main/website/public/devin.png" alt="Devin" width="48" height="48" /></a><br/>
<strong>Devin</strong><br/>
<sub>6 hook + skill + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>natív plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>natív plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>natív plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://github.com/tinyhumansai.png?size=120" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>natív Memory trait backend</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://antigravity.google"><img src="https://svgl.app/library/antigravity.svg" alt="Antigravity" width="48" height="48" /></a><br/>
<strong>Antigravity</strong><br/>
<sub>MCP + hook</sub>
</td>
<td align="center" width="20%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://www.warp.dev"><img src="https://svgl.app/library/warp.svg" alt="Warp" width="48" height="48" /></a><br/>
<strong>Warp</strong><br/>
<sub>connect + MCP + skill</sub>
</td>
<td align="center" width="20%">
<a href="https://zed.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/zed-logo_dark.svg"><img src="https://svgl.app/library/zed-logo.svg" alt="Zed" width="48" height="48" /></picture></a><br/>
<strong>Zed</strong><br/>
<sub>MCP szerver</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://continue.dev"><img src="https://github.com/continuedev.png?size=120" alt="Continue" width="48" height="48" /></a><br/>
<strong>Continue</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://docs.factory.ai/cli"><img src="https://www.factory.ai/favicon.svg" alt="Droid" width="48" height="48" /></a><br/>
<strong>Droid</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://kiro.dev"><img src="https://kiro.dev/favicon.ico" alt="Kiro" width="48" height="48" /></a><br/>
<strong>Kiro</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/QwenLM/qwen-code"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/qwen_dark.svg"><img src="https://svgl.app/library/qwen_light.svg" alt="Qwen Code" width="48" height="48" /></picture></a><br/>
<strong>Qwen Code</strong><br/>
<sub>MCP szerver</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://svgl.app/library/deepseek.svg" alt="DeepSeek Harness" width="48" height="48" /></a><br/>
<strong>DeepSeek Harness</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP szerver</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>Bármely <strong>MCP-t vagy HTTP-t</strong> beszélő ágenssel működik. Egyetlen szerver, közöttük megosztott memóriákkal.</sub>
</p>

---

Minden alkalommal elmagyarázod ugyanazt az architektúrát. Mindig ugyanazokat a hibákat fedezed fel újra. Mindig ugyanazokat a preferenciákat tanítod be újra. A beépített memória (CLAUDE.md, .cursorrules) 200 sornál korlátozódik, és elavulttá válik. Az agentmemory ezt megoldja. Némán rögzíti, mit csinál az ágensed, kereshető memóriává tömöríti, és a megfelelő kontextust befecskendezi, amikor elindul a következő session. Egyetlen parancs. Ágensek között is működik.

**Mi változik:** Az 1. sessionben beállítod a JWT hitelesítést. A 2. sessionben rate limitinget kérsz. Az ágens már tudja, hogy a hitelesítésed a jose middleware-t használja a `src/middleware/auth.ts` fájlban, a tesztjeid lefedik a token-validálást, és a jose-t választottad a jsonwebtoken helyett az Edge-kompatibilitás miatt — nincs újramagyarázás, nincs copy-paste.

```bash
npx -y @agentmemory/agentmemory@latest
```

Alapértelmezés szerint az agentmemory a repón kívül tárolja az iii-engine állapotát, amelyből elindítottad: macOS-en a `~/Library/Application Support/agentmemory`, Linuxon a `$XDG_DATA_HOME/agentmemory` vagy `~/.local/share/agentmemory`, Windowson pedig a `%APPDATA%\agentmemory` mappában. Egy már létező, örökölt `./data/state_store.db` vagy `./data/iii-config.yaml` fájlt a rendszer a 0. instance esetén a platform alapértelmezése előtt újrahasznosít. Egy explicit hely megadásához add meg a `--data-dir <path>` kapcsolót, vagy állítsd be az `AGENTMEMORY_DATA_DIR` változót; mindkét explicit beállítás elsőbbséget kap az örökölt felismeréssel szemben:

```bash
npx -y @agentmemory/agentmemory@latest --data-dir ~/.agentmemory-projects/main
AGENTMEMORY_DATA_DIR=~/.agentmemory-projects/main npx -y @agentmemory/agentmemory@latest
```

A natív és a Docker-alapú indítás ugyanazt a feloldott host-mappát használja; a Docker a `/data` alá bind-mounteli. A `--instance 1` hozzáfűzi az `instance-1` nevet a feloldott mappához, és a különálló alapértelmezett port-négyest választja: `3211/3212/3213/49234`.

A legfrissebb kiadási megjegyzések: [CHANGELOG.md](../CHANGELOG.md).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarkok" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Visszakeresési pontosság

**coding-agent-life-v1** (házon belüli korpusz, sandboxban reprodukálható)

| Adapter | P@5 | R@5 | Top-5 találati arány | p50 késleltetés |
|---|---|---|---|---|
| **agentmemory hybrid** | **0.240** | **1.000** | **15 / 15** | 14 ms |
| grep alapvonal | 0.227 | 0.967 | 15 / 15 | 0 ms |

100%-os top-5 találati arány a **P@5 matematikai felső határán** ennél a korpusznál (0.240, lásd a scorecardot). A hibrid minden gold sessiont visszakeres; a grep 2-ből 1 gold eredményt elveszít a több sessiont átfogó, időbeli lekérdezésnél. A nyereség **felidézésben és időbeliségben** mutatkozik, nem az összesített pontosságban. Ez a benchmark kicsi és gold-szegény; a lejjebb található, nagyobb LongMemEval-S jobban differenciál. Teljes, típus szerinti bontás + korrekciós megjegyzés: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 kérdés)

| Rendszer | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| Csak BM25 fallback | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Token-megtakarítás

| Megközelítés | Token/év | Költség/év |
|---|---|---|
| Teljes kontextus beillesztése | 19.5M+ | Lehetetlen (meghaladja az ablakot) |
| LLM által összefoglalva | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + lokális embeddingek | ~170K | **$0** |

</td>
</tr>
</table>

> Embedding modell: `all-MiniLM-L6-v2` (lokális, ingyenes, nincs szükség API-kulcsra). Teljes jelentések: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Versenytárs-összehasonlítás: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md), amely az agentmemoryt a mem0, Letta, Khoj, supermemory, TencentDB Agent Memory, MemPalace, Zep/Graphiti, Cognee, Hippo rendszerekkel veti össze.

**Lokális reprodukálás:** [`eval/README.md`](../eval/README.md), egy adapter-bővíthető harness a LongMemEval `_s` (nyilvános, 500 kérdéses) + `coding-agent-life-v1` (házon belüli, 15 sessiont tartalmazó korpusz) számára. A grep / vektor / agentmemory adapterek egymás mellett kapnak pontszámot, NDJSON kimenettel, a publikált scorecardok a [`docs/benchmarks/`](../docs/benchmarks/) mappában landolnak.

**Jól illik a [codegraph](https://github.com/colbymchenry/codegraph), az [Understand Anything](https://github.com/Lum1104/Understand-Anything) és a [Graphify](https://github.com/safishamsi/graphify) mellé.** Kódgráf-indexelés, több ágenses build-pipeline-ok, és szélesebb tudásgráfok dokumentumok / PDF-ek / képek / videók fölött. Az agentmemory a munkára emlékszik; ez a három projekt a kontextusréteg többi részét kelti életre. Receptek + kérdés-útválasztási táblázat: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="Versenytársakkal szemben" height="32" /></picture></h2>

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
<th>Beépített (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Típus</strong></td>
<td>Memóriamotor + MCP szerver</td>
<td>Memóriaréteg API</td>
<td>Teljes ágens-futtatókörnyezet</td>
<td>Személyes AI</td>
<td>Memória API + app</td>
<td>Csapatmemória-hub (LLM proxy)</td>
<td>Vektormemória (OSS)</td>
<td>Memóriamotor (Oracle DB)</td>
<td>Memóriarendszer</td>
<td>Statikus fájl</td>
</tr>
<tr>
<td><strong>Visszakeresési R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A</td>
<td>Önbevallás alapján</td>
<td>PersonaMem 76% (önbevallás alapján)</td>
<td>~96.6% (önbevallás alapján)</td>
<td>94.4% (önbevallás alapján)</td>
<td>N/A</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>Automatikus rögzítés</strong></td>
<td>12 hook (nulla manuális munka)</td>
<td>Manuális <code>add()</code> hívások</td>
<td>Az ágens saját szerkesztései</td>
<td>Manuális</td>
<td>API-oldali kinyerés</td>
<td>Proxy-elfogás (base-URL csere)</td>
<td>Manuális</td>
<td>API kinyerés</td>
<td>Manuális</td>
<td>Manuális szerkesztés</td>
</tr>
<tr>
<td><strong>Keresés</strong></td>
<td>BM25 + Vektor + Gráf (RRF fúzió)</td>
<td>Vektor + Gráf</td>
<td>Vektor (archivális)</td>
<td>Szemantikus</td>
<td>Vektor + RAG</td>
<td>4 eszköztípus (Chat / Skill / Wiki / CodeGraph)</td>
<td>Csak vektor</td>
<td>Vektor + szemantikus</td>
<td>Lecsengés-súlyozott</td>
<td>Mindent betölt a kontextusba</td>
</tr>
<tr>
<td><strong>Több ágens</strong></td>
<td>MCP + REST + lease-ek + szignálok</td>
<td>API (nincs koordináció)</td>
<td>Csak a Letta futtatókörnyezeten belül</td>
<td>Nem</td>
<td>Nem</td>
<td>Csapatszerepek + megosztott eszközök</td>
<td>Nem</td>
<td>Csak hatókörön belül</td>
<td>Több ágens közt megosztva</td>
<td>Ágensenkénti fájlok</td>
</tr>
<tr>
<td><strong>Keretrendszer-függés</strong></td>
<td>Nincs (bármely MCP kliens)</td>
<td>Nincs</td>
<td>Magas (a Lettát kell használni)</td>
<td>Önálló</td>
<td>Nincs</td>
<td>A proxy minden modellhívás elé kerül</td>
<td>Nincs</td>
<td>Oracle Database</td>
<td>Nincs</td>
<td>Ágensenkénti formátum</td>
</tr>
<tr>
<td><strong>Külső függőségek</strong></td>
<td>Nincs (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + vektor DB</td>
<td>Több</td>
<td>Felügyelt felhő</td>
<td>Docker-stack (Core + Hub + Proxy)</td>
<td>Vektortár</td>
<td>Oracle AI Database</td>
<td>Nincs</td>
<td>Nincs</td>
</tr>
<tr>
<td><strong>Memória életciklus</strong></td>
<td>4 szintű konszolidáció + lecsengés + automatikus elfelejtés</td>
<td>Passzív kinyerés</td>
<td>Az ágens kezeli</td>
<td>Manuális</td>
<td>Automatikus elfelejtés</td>
<td>Manuális átnézés; az automatikus útválasztás folyamatban</td>
<td>Nincs</td>
<td>Nincs megadva</td>
<td>Lecsengés + konszolidáció</td>
<td>Manuális ritkítás</td>
</tr>
<tr>
<td><strong>Token-hatékonyság</strong></td>
<td>~1,900 token/session ($10/év)</td>
<td>Az integrációtól függ</td>
<td>A core memória a kontextusban van</td>
<td>Változó</td>
<td>Felhő alapú díjszabás</td>
<td>Nincs megadva</td>
<td>Nincs token-budget</td>
<td>LLM-alapú (változó)</td>
<td>Változó</td>
<td>22K+ token 240 megfigyelésnél</td>
</tr>
<tr>
<td><strong>Valós idejű megjelenítő</strong></td>
<td>Igen (3113-as port)</td>
<td>Felhő alapú dashboard</td>
<td>Felhő alapú dashboard</td>
<td>Webes felhasználói felület</td>
<td>Felhő alapú dashboard</td>
<td>Hub webes felhasználói felület</td>
<td>Nincs</td>
<td>Nincs</td>
<td>Nincs</td>
<td>Nincs</td>
</tr>
<tr>
<td><strong>Önállóan üzemeltethető</strong></td>
<td>Igen (alapértelmezett)</td>
<td>Opcionális</td>
<td>Opcionális</td>
<td>Igen</td>
<td>Nem (csak felhő)</td>
<td>Igen (Docker)</td>
<td>Igen</td>
<td>Igen (Oracle DB)</td>
<td>Igen</td>
<td>Igen</td>
</tr>
</table>

<sub>Megjegyzés a benchmarkhoz: csak az agentmemory R@5 értéke a saját, mért eredményünk (LongMemEval-S, reprodukálható a <a href="../benchmark/COMPARISON.md"><code>benchmark/COMPARISON.md</code></a> alapján). A mem0 és a Letta számai a saját publikált LoCoMo-adataik (egy másik adathalmaz); a MemPalace, a supermemory, a TencentDB (PersonaMem) és az oracleagentmemory számai a gyártók önbevallás alapú állításai, amelyeket nem reprodukáltunk függetlenül (az oracleagentmemory futása GPT-5.5-öt használt egy Oracle AI Database ellen). Csak tájékoztató jellegű egymás mellett közlésre szánva, nem azonos adatokon futó közvetlen összehasonlításra. A csillagszámok közelítők, és idővel változnak.</sub>

**Újabb belépők**, amelyeket érdemes ismerni, részletesen összehasonlítva a [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) fájlban:

| Rendszer | ⭐ | Megközelítés |
|--------|---|-------|
| Zep / Graphiti | 30K | Temporális tudásgráf; a legerősebb publikált időbeli lekérdezési eredmények (LongMemEval 63.8%), de a gráf aszinkron módon épül, így a friss tények lemaradhatnak |
| Cognee | 30K | Dokumentum-tudásgráf feldolgozás, csak Python, strukturált entitáskinyerésre épül, nem session-rögzítésre |

Ezek közül semelyik nem rögzít automatikusan kódolóágens-hookokból, nem szállít local-first megjelenítőt, és nem futtatható kulcs nélkül — ez a kombináció az, amire az agentmemory épül.

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Gyors indítás" height="32" /></picture></h2>

Kompatibilitás: ez a kiadás az `iii-sdk` 0.22.1-et célozza, és a iii-engine v0.22.1-et pinneli.

### Próbáld ki 30 másodperc alatt

```bash
# Terminal 1: start the server
npx -y @agentmemory/agentmemory@latest

# Terminal 2: seed sample data and see recall in action
npx -y @agentmemory/agentmemory@latest demo
```

A `demo` 3 reális sessiont hoz létre (JWT hitelesítés, N+1 lekérdezés javítása, rate limiting), és kereséseket futtat ellenük. A kulcs nélküli telepítések letiltják a vektorokat, így a `mem::search` kulcsszavas lekérdezéseinek a BM25 révén kell találnia, míg a `database performance optimization` lekérdezés nulla eredményt adhat. A `smart-search` emellett strukturális gráfegyezéseket is visszaadhat, ha létezik gráfadat. Ahhoz, hogy a szemantikus lekérdezés vektorok révén megtalálja az N+1 javítást, állítsd be az `EMBEDDING_PROVIDER=local` értéket, indítsd újra, és hagyd, hogy az első modell-letöltés befejeződjön.

Nyisd meg a `http://localhost:3113` címet, hogy élőben lásd a memória épülését.

### Egy friss telepítés és az újraindítás utáni perzisztencia ellenőrzése

A szerver futása közben ellenőrizd a REST-et, az egészségjelzést, a megjelenítőt és az iii-alapú futtatókörnyezet státuszát:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

Az indulási állapotpanel mind a négy portot számba veszi: a REST/MCP HTTP-t a 3111-en, az iii stream-eket a 3112-n, a megjelenítőt a 3113-on, és az iii worker WebSocketet a 49134-en. A `status` megerősíti az agentmemory egészségi állapotát és az aktív szolgáltatót/embedding-módot. Mentsd el egy próbamemóriát, és erősítsd meg, hogy kereshető:

```bash
curl -fsS -X POST http://localhost:3111/agentmemory/remember \
  -H 'Content-Type: application/json' \
  -d '{"content":"agentmemory restart persistence probe","concepts":["install-check"]}'

curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'Content-Type: application/json' \
  -d '{"query":"restart persistence probe","limit":5}'
```

Ezután futtasd az `npx -y @agentmemory/agentmemory@latest stop` parancsot, indítsd el újra a kanonikus parancsot az 1. terminálban, várd meg a `/agentmemory/livez`-t, és ismételd meg a keresést. A próbamemóriát továbbra is vissza kell adnia. Ha egyéni `--data-dir`-t választottál, add meg ugyanazt a mappát az újraindításnál is.

### Napi parancsok

A telepítés és a beállítás a fenti [Telepítés](#install) részben él (az első futás végigvezet rajta). Napi szinten:

```bash
agentmemory                    # start the server
agentmemory stop               # stop it cleanly
agentmemory connect <agent>    # wire another agent
agentmemory doctor             # interactive diagnostics + fix prompts
agentmemory remove             # uninstall everything we created
```

### Session Replay

Minden session, amelyet az agentmemory rögzít, visszajátszható. Nyisd meg a megjelenítőt, válaszd a **Replay** fület, és pörgesd végig az idővonalat: a promptok, a toolhívások, a toolok eredményei és a válaszok különálló eseményekként jelennek meg, lejátszás/szünet gombbal, sebességvezérléssel (0.5x-tól 4x-ig) és billentyűparancsokkal (szóköz a váltáshoz, nyilak a léptetéshez).

Régebbi Claude Code JSONL-transcriptek behozásához:

```bash
# Import everything under the default ~/.claude/projects
npx -y @agentmemory/agentmemory@latest import-jsonl

# Or import a single file
npx -y @agentmemory/agentmemory@latest import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

Az importált sessionök a natívok mellett jelennek meg a Replay választóban. A háttérben minden bejegyzés a `mem::replay::load`, a `mem::replay::sessions` és a `mem::replay::import-jsonl` iii funkciókon megy keresztül, mellékszerverek nélkül. Minden importált transcript indexelve van kereséshez, `import` eredetcsatornával van megjelölve, és session-kristály és tanulságok kinyeréséhez van feldolgozva.

> **Figyelem, ha az `import-jsonl`-re támaszkodsz elsődleges rögzítési útvonalként:** a Claude Code `cleanupPeriodDays` beállítása (a `~/.claude/settings.json`-ban, alapértelmezetten **30**) automatikusan törli az ennél régebbi JSONL-transcripteket a `~/.claude/projects/`-ból. Ha az agentmemoryt egy több hónapos Claude Code előzményre telepíted frissen, minden, ami 30 napnál régebbi, már eltűnt az első import előtt. Vagy futtasd az `import-jsonl`-t cronon, vagy emeld fel a `cleanupPeriodDays`-t valami magasabbra, vagy kösd be az automatikus rögzítő hookokat (az alapértelmezett plugin-telepítési útvonal), hogy minden kör az agentmemorybe kerüljön, amíg a session él, és a JSONL-takarítás ne számítson többé.

### Frissítés / karbantartás

Használd a karbantartási parancsot, amikor szándékosan frissíteni akarod a lokális futtatókörnyezetet:

```bash
npx -y @agentmemory/agentmemory@latest upgrade
```

Figyelmeztetés: ez a parancs megváltoztatja a jelenlegi workspace-t/futtatókörnyezetet. Frissíthet JavaScript-függőségeket, és lehúzhatja a pinnelt `iiidev/iii:0.22.1` Docker image-et. Soha nem telepít pinnelés nélküli vagy újabb iii engine-t.

Az implementációs részletek a `src/cli.ts`-ben élnek (lásd a `runUpgrade`-et a `src/cli.ts:544-595` környékén).

### Claude Code (egyetlen blokk, illeszd be)

```text
Install agentmemory: run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server and its pinned iii engine. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 17 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 54 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113. Keyless mode disables vectors: `memory_recall` uses BM25, and `memory_smart_search` can also use existing structural graph data. Set `EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env` and restart to opt into on-device semantic recall.
```

#### Claude Code a plugin telepítése nélkül (önálló MCP útvonal)

Ha az agentmemory MCP szerverét közvetlenül a `~/.claude.json`-ban kötöd be, a `/plugin install` használata helyett, a Claude Code soha nem oldja fel a `${CLAUDE_PLUGIN_ROOT}`-ot, és a hook-szkripteket abszolút elérési utakra kell mutatnod a `~/.claude/settings.json`-ban. Ezek az útvonalak jellemzően beágyazzák az agentmemory verziószámát (pl. `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.22/scripts/…`), így a következő frissítés némán elront minden hookot.

Megoldás:

```bash
agentmemory connect claude-code --with-hooks
```

Ez ugyanazokat a hook-parancsokat olvasztja be a `~/.claude/settings.json`-ba, abszolút elérési utakkal, amelyek a jelenleg telepített `@agentmemory/agentmemory` csomag becsomagolt `plugin/` mappájára mutatnak. Futtasd újra a parancsot az agentmemory frissítése után, hogy felfrissítsd az útvonalakat. A felhasználó saját bejegyzései ugyanabban a fájlban megmaradnak; csak a korábbi agentmemory-bejegyzések kerülnek lecserélésre. A `/plugin install` útvonal marad az ajánlott megközelítés.
Távoli vagy védett telepítésekhez indítsd el a Claude Code-ot az `AGENTMEMORY_URL` és az `AGENTMEMORY_SECRET` beállításával. A plugin mindkét értéket továbbadja a becsomagolt MCP szerverének; amikor az `AGENTMEMORY_URL` üres, az MCP shim a `http://localhost:3111`-et használja.

### Codex CLI (Codex plugin platform)

```bash
# 1. start the memory server in a separate terminal
npx -y @agentmemory/agentmemory@latest

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

A Codex plugin ugyanabból a `plugin/` mappából kerül kiadásra, mint a Claude Code plugin. Ez regisztrálja:

- Egy becsomagolt stdio MCP híd a futó daemonhoz, npm-letöltés vagy fallback-tár nélkül. Lásd a [helyi Codex-útmutatót](../docs/plugins/codex-local.md) egy ki nem adott build teszteléséhez.
- 6 életciklus-hookot: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 9 meghívható skillt: `/recall`, `/remember`, `/session-history`, `/forget`, `/recap`, `/handoff`, `/lesson`, `/commit-context`, `/commit-history`, plusz 8 referencia-skillt, amelyeket az ágens igény szerint tölt be (memóriadiszciplína, MCP eszközök, REST API, konfiguráció, ágensek, hookok, architektúra, és a skill-írási útmutató)

A Codex hook-motorja befecskendezi a `CLAUDE_PLUGIN_ROOT`-ot a hook-alfolyamatokba (lásd [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), így ugyanazok a hook-szkriptek mindkét hoszton működnek, duplikálás nélkül. A Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure események csak Claude Code-specifikusak, és nincsenek regisztrálva a Codexhez.

#### A Codex-hookok bizalma és kompatibilitása

A natív plugin-hook kiváltás a Codex CLI 0.150.1-gyel ellenőrzött. A rögzítés elvárása előtt bízz meg (trust) a plugin-hookokban. A Codex Desktop viselkedése a becsomagolt runtime-jától függ; ellenőrizd a `/hooks`-ot, és erősíts meg egy rögzített eseményt, mielőtt engedélyeznél egy megoldást.

Ha a hosztod globális hookokat igényel, tükrözd a parancsokat a `~/.codex/hooks.json`-ba. Amikor az MCP már bekötve van, a jelenlegi connector `--force`-ot igényel a hook-telepítés eléréséhez:

```bash
agentmemory connect codex --with-hooks --force
```

Ez beolvasztja a globális hookokat, és felülírja az agentmemory MCP-bejegyzést, megtartva a nem kapcsolódó bejegyzéseket. A `--force` használata előtt nézd át az agentmemory egyedi endpoint-beállításait. Frissítés után futtasd újra, hogy felfrissítsd a szkriptek elérési útjait. Engedélyezd vagy a natív plugin-hookokat, vagy a globális másolatokat, hogy elkerüld a duplikált rögzítést.

### GitHub Copilot CLI

VS Code agent módhoz használd a [Copilot MCP és automatikus rögzítés útmutatót](../docs/plugins/copilot.md#vs-code-copilot-local-agent-sessions). A CLI connector nem konfigurálja a VS Code-ot.

```bash
# MCP-only wiring
agentmemory connect copilot-cli

# Alternatively, full hooks/skills plugin from the GitHub subdir
copilot plugin install rohitg00/agentmemory:plugin
```

Az `agentmemory connect copilot-cli` beolvasztja a `mcpServers.agentmemory`-t a `~/.copilot/mcp-config.json`-ba (vagy a `$COPILOT_HOME/mcp-config.json`-ba, ha a `COPILOT_HOME` be van állítva), és megtartja a meglévő szervereket. Natív Windowson ez az egyetlen automatizált `connect` adapter; minden más natív Windows-ágenst manuálisan kell konfigurálni. A WSL `connect` csak akkor támogatott, ha a célágens ugyanabban a WSL-környezetben van telepítve. A Copilot a következő indításkor vagy a `/mcp` után veszi fel az MCP szervert. Telepítsd a plugint is, ha a teljes hook/skill élményt szeretnéd.

<details>
<summary><b>OpenClaw (illeszd be ezt a promptot)</b></summary>

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

Teljes útmutató: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (illeszd be ezt a promptot)</b></summary>

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

Teljes útmutató: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Egyéb ágensek

Indítsd el a memóriaszervert: `npx -y @agentmemory/agentmemory@latest`

#### Natív skillek az `npx skills add` révén (50+ ágens)

Az agentmemory 17 skillt szállít a Claude-Code-stílusú `<dir>/SKILL.md` formátumban: 9 meghívható akció-skill (`remember`, `recall`, `recap`, `handoff`, `forget`, `lesson`, `commit-context`, `commit-history`, `session-history`) és 8 referencia-skill, amelyeket az ágens igény szerint tölt be (`memory-discipline`, `agentmemory-mcp-tools`, `agentmemory-rest-api`, `agentmemory-config`, `agentmemory-agents`, `agentmemory-hooks`, `agentmemory-architecture`, `write-agentmemory-skill`). A referencia-skillek forrásból generált adattáblákat hordoznak, így soha nem térnek el. A [`skills`](https://npmjs.com/package/skills) CLI, a vercel-labs eszköze, automatikusan telepíti ezeket a hívó ágens natív skill-mappájába, 50+ ágens között (Claude Code, Cursor, Cline, Continue, Droid, Warp, Codex, Antigravity, Kiro, OpenCode, Goose, Roo, Trae, Windsurf, és még több):

```bash
npx skills add rohitg00/agentmemory -y          # auto-detects the calling agent
npx skills add rohitg00/agentmemory -y -a warp  # explicit agent
npx skills add rohitg00/agentmemory -y -a '*'   # install to every installed agent
```

Ez **kiegészíti** az `agentmemory connect <agent>`-et:

- az `agentmemory connect <agent>` beírja az MCP szerver konfigurációt, hogy az eszközök elérhetők legyenek.
- az `npx skills add rohitg00/agentmemory` telepíti a skilleket, hogy az ágens tudja, mikor hívja őket.

Azoknál a kevés ágensnél, amelyeket a skills CLI még nem fed le (Zed v1.3.x és régebbi), másold be saját kezűleg a 17 SKILL.md fájlt az ágens natív skill-mappájába; ugyanaz a formátum mindenhol működik.

#### Standard MCP blokk

Az agentmemory bejegyzés **ugyanaz az MCP szerver blokk** minden olyan hoszton, amely a `mcpServers` formátumot használja (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI, OpenClaw):

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

**Olvasszd be ezt a bejegyzést a meglévő `mcpServers` objektumba** a hoszt konfigurációs fájljában; ne cseréld le a fájlt. Ha a fájlban már vannak más szerverek, add hozzá az `agentmemory`-t melléjük, egy újabb kulcsként a `mcpServers`-en belül. Ha a `mcpServers` teljesen hiányzik, illeszd be a blokkot a `{ "mcpServers": { ... } }` belsejébe. A `${VAR}` helyőrzők az `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` értékeket az MCP szerver indításakor a shellből öröklik; a be nem állított változók üres stringet adnak át, és a shim visszaesik a `http://localhost:3111`-re. Egy bekötött bejegyzés mind a lokális, mind a távoli (k8s / reverse-proxy mögötti) telepítéseket lefedi.

| Ágens | Konfigurációs fájl | Megjegyzések |
|---|---|---|
| **Cursor (csak MCP)** | `~/.cursor/mcp.json` | Olvasztd be a `mcpServers`-be, vagy `agentmemory connect cursor`. Egykattintásos deeplink is elérhető a weboldalon. |
| **Cursor (teljes plugin)** | `.cursor-plugin/` | Cursor Marketplace listázás (a beküldés felülvizsgálat alatt) vagy Cursor Settings → Plugins → lokális checkout. Regisztrál 7 automatikus rögzítő hookot (sessionStart, beforeSubmitPrompt, preToolUse, postToolUse, postToolUseFailure, stop, sessionEnd) + 17 skillt + az MCP szervert, az `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` kezelésével a Cursor plugin-dashboardján. Működik a Cursor IDE-ben és a `cursor-agent` CLI-ben; a CLI print-módú promptjai a session-transcriptből kerülnek visszapótlásra a session végén. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Olvasszd be a `mcpServers`-be. Indítsd újra a Claude Desktopot a szerkesztés után. |
| **Cline / Roo Code / Kilo Code** | Cline MCP beállítások (Settings UI → MCP Servers → Edit) | Ugyanaz a `mcpServers` blokk. |
| **Devin CLI (MCP + hookok)** | `~/.config/devin/config.json` | Az `agentmemory connect devin` beolvasztja az MCP bejegyzést; a `--with-hooks` hozzáad hat natív automatikus rögzítő hookot (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd) a Devin kisbetűs tool-matchereivel. Ellenőrizd a `devin mcp list` és a `/hooks` paranccsal a devinen belül. |
| **Devin CLI (teljes plugin)** | `plugin/.devin-plugin/` | A `devin plugins install ./plugin` egy checkoutból regisztrálja mind a 17 skillt `/agentmemory:<skill>` slash parancsokként, plusz az MCP szervert. A Devin plugin-hookok nem tudják elsütni a `SessionStart`/`SessionEnd`-et, ezért párosítsd a `connect devin --with-hooks`-szal a teljes session-rögzítéshez. |
| **Devin (felhő)** | Settings → Connections → MCP servers | Adj hozzá egy egyéni MCP-t (STDIO): parancs `npx`, argumentumok `-y @agentmemory/mcp@latest`, env `AGENTMEMORY_URL`, amely egy hálózatilag elérhető agentmemory-telepítésre mutat, plusz `AGENTMEMORY_SECRET` (a felhős sessionök nem érik el a localhostot — lásd [`deploy/`](../deploy/)). Tárold a secretet a Devin Secretsben, majd a "Test listing tools" segítségével ellenőrizd, hogy mind az 54 eszköz megjelenik. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (automatikusan beolvaszt). |
| **GitHub Copilot CLI (csak MCP)** | `~/.copilot/mcp-config.json` | Az `agentmemory connect copilot-cli` beolvasztja a `mcpServers.agentmemory`-t; a Copilot a következő indításkor vagy a `/mcp`-vel veszi fel. |
| **GitHub Copilot CLI (teljes plugin)** | Copilot plugin telepítés | `copilot plugin install rohitg00/agentmemory:plugin` a GitHub-aldirektóriumban lévő pluginhoz. |
| **OpenClaw** | OpenClaw MCP konfiguráció | Ugyanaz a `mcpServers` blokk. Mélyebben: az `openclaw plugins install ./integrations/openclaw` igényt tart az OpenClaw memória-slotjára (automatikusan átvált a `memory-core`-ról); állítsd be a `plugins.entries.agentmemory.hooks.allowConversationAccess=true`-t, különben a rögzítés némán blokkolva lesz. Lásd [`integrations/openclaw`](../integrations/openclaw/). |
| **Codex CLI (csak MCP)** | `.codex/config.toml` | TOML formátum: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, vagy add hozzá manuálisan a `[mcp_servers.agentmemory]`-t. |
| **Codex CLI (teljes plugin)** | Codex plugin marketplace | `codex plugin marketplace add rohitg00/agentmemory`, majd `codex plugin add agentmemory@agentmemory`. Regisztrálja az MCP-t + 6 életciklus-hookot + 17 skillt. Bízz meg a hookokban, és ellenőrizd a rögzítést a hosztodon; lásd a [Codex beállítása és ellenőrzése](../docs/plugins/codex-local.md) útmutatót. |
| **OpenCode (csak MCP)** | `opencode.json` | Más formátum: felső szintű `mcp` kulcs, a parancs tömbként: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (teljes plugin)** | `plugin/opencode/` | 22 automatikus rögzítő hook, amely lefedi a session-életciklust, az üzeneteket, a toolokat és a hibákat. A projekt-attribúció sessiononkénti, így egyetlen, több repón átnyúló OpenCode-folyamat minden sessiont a saját projektje alá fájloz. Két slash parancs (`/recall`, `/remember`). Másold a `plugin/opencode/`-ot az OpenCode workspace-edbe, és add hozzá a plugin-bejegyzést az `opencode.json`-hoz. Lásd a [`plugin/opencode/README.md`](../plugin/opencode/README.md) fájlt a teljes hook-táblázatért + hiányanalízisért. |
| **pi** | `~/.pi/agent/extensions/agentmemory` | Az `agentmemory connect pi` telepíti a becsomagolt extension-t a pi automatikus felismerő mappájába (felidézés az ágens indulásakor, rögzítés az ágens végén, `memory_search` / `memory_save` / `memory_health` eszközök, `/agentmemory-status`). A `/reload` egy futó piben felveszi. [`integrations/pi`](../integrations/pi/) egyben egy pi-csomag is (`pi install ./integrations/pi` egy checkoutból). |
| **Hermes Agent** | `~/.hermes/config.yaml` | A `cp -r integrations/hermes ~/.hermes/plugins/agentmemory` + `memory.provider: agentmemory` adja a 6-hookos memóriaszolgáltatót (prefetch, kör-rögzítés, session-vég, pre-compress, MEMORY.md-tükrözés, system prompt blokk). Validáld a `hermes plugins doctor` és a `hermes memory status` paranccsal. Lásd [`integrations/hermes`](../integrations/hermes/). |
| **Qwen Code** | `~/.qwen/settings.json` | Az `agentmemory connect qwen` beírja a standard `mcpServers` blokkot. A hook-payload mezőkompatibilis a Claude Code-dal, így a meglévő 12-hookos szkriptek módosítás nélkül működnek; kösd be őket a `hooks` szekcióban, ugyanabban a `settings.json`-ban. |
| **Antigravity IDE / 2.0** | `~/.gemini/config/mcp_config.json` | Az `agentmemory connect antigravity --with-hooks` telepíti az MCP-t és a rögzítő hookokat a megosztott testreszabási mappába. Lásd az [Antigravity beállítása és korlátai](../docs/plugins/antigravity.md) útmutatót. |
| **Antigravity CLI** (`agy`) | `~/.gemini/config/mcp_config.json` | Az `agentmemory connect antigravity-cli --with-hooks` ugyanazt az MCP- és hook-konfigurációt használja, mint a jelenlegi IDE-verziók. A meglévő telepítéseknek frissülniük kell a `--force`-szal; lásd a [frissítési megjegyzéseket](../docs/plugins/antigravity.md). |
| **Kiro** | `~/.kiro/settings/mcp.json` | Az `agentmemory connect kiro` beírja a felhasználói szintű konfigurációt. A workspace-szintű felülírások a `.kiro/settings/mcp.json`-ba kerülnek, a kódod mellé. |
| **Warp** | `~/.warp/.mcp.json` | Az `agentmemory connect warp` beírja a standard `mcpServers` blokkot. A Warp a skilleket is automatikusan felismeri a `.claude/skills/`-ből; a Claude Code plugin telepítése után a 8 agentmemory skill (`remember`, `recall`, `recap`, `handoff`, `forget`, `commit-context`, `commit-history`, `session-history`) natívan megjelenik a Warp slash-parancs palettáján. |
| **Cline (CLI)** | `~/.cline/mcp.json` | Az `agentmemory connect cline` beírja a standard `mcpServers` blokkot. VS Code extension felhasználóknak: illeszd be ugyanazt a blokkot a Cline Settings → MCP Servers → Edit JSON útján. |
| **Continue.dev** | `~/.continue/config.yaml` (előnyben részesített) vagy `config.json` (örökölt) | Az `agentmemory connect continue` létrehoz egy `config.yaml`-t a semmiből, ha egyik sem létezik, vagy módosítja a meglévő `config.json`-t. **Ha már van `config.yaml`-od**, az adapter kiírja a pontos, a `mcpServers:` alá illesztendő blokkot; nem írja át némán a yaml-odat, mert a kommentek és a horgok biztonságos megtartásához egy YAML-parserre lenne szükség, amit a csomag nem szállít. A Continue tömb formátumot (nem objektumot) használ a `mcpServers`-hez. |
| **Zed** | `~/.config/zed/settings.json` | Az `agentmemory connect zed` a `context_servers` alá ír (a Zed saját kulcsa, NEM a `mcpServers`). A távoli MCP szerverek egy `{"url": "..."}`-vel is bekötődhetnek. |
| **Droid (Factory.ai)** | `~/.factory/mcp.json` | Az `agentmemory connect droid` beírja a standard `mcpServers` blokkot. A projekt-szintű felülírások a `<repo>/.factory/mcp.json`-ba kerülnek. Add meg a `--with-hooks`-ot a natív automatikus rögzítéshez. |
| **DeepSeek Harness** | `$DSH_HOME/cordis.patch.yml` | Az `agentmemory connect dsh` hozzáfűz egy `@deepseek-ai/dsh-mcp-client` sort a home-szintű patch-réteghez, amelyet minden Harness-profil betölt; az eszközök `mcp__agentmemory__*`-ként regisztrálódnak. Add meg a `--with-hooks`-ot az automatikus rögzítés bekötéséhez is: a becsomagolt Claude Code hook-szkriptek a Harness első féltől származó `@deepseek-ai/dsh-hooks-claude-code` hídján keresztül futnak (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop), egy a `$DSH_HOME/agentmemory.hooks.json`-ba írt manifeszt révén. Alapértelmezés szerint `~/.dsh`-ra áll, ha a `DSH_HOME` nincs beállítva. |
| **Goose** | Goose MCP beállítások felhasználói felülete | Ugyanaz a `mcpServers` blokk; használd a `goose configure` → Add Extension → MCP menüt. A közvetlen YAML-szerkesztés a `~/.config/goose/config.yaml`-ban is támogatott, de a séma `extensions:` + `cmd`-t használ (nem `mcpServers:` + `command`-ot). |
| **Aider** | n/a | Beszélj közvetlenül a REST API-val: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`. |
| **Bármely ágens (32+)** | n/a | Az `npx skillkit install agentmemory` automatikusan felismeri a hosztot, és beolvaszt. |

**Sandboxolt MCP kliensek** (Flatpak / Snap / korlátozó konténerek), amelyek nem érik el a hoszt `localhost`-ját: állítsd be a `"AGENTMEMORY_FORCE_PROXY": "1"`-et is az `env` blokkban, és az `AGENTMEMORY_URL`-t irányítsd egy olyan útvonalra, amit a sandbox valóban elér (pl. a LAN-IP-d).

### Programozott hozzáférés (Python / Rust / Node)

Az agentmemory iii funkciókként regisztrálja a fő műveleteit (`mem::remember`, `mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). Bármely nyelv, amelyhez van iii SDK, közvetlenül hívhatja ezeket a `ws://localhost:49134` felett, nyelvenkénti külön REST kliens nélkül.

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

Kidolgozott példa: [`examples/python/`](../examples/python/) (gyors indítás + megfigyelés/felidézés folyamat). A REST a `:3111`-en elérhető marad azokhoz a hosztokhoz, amelyeknek nincs iii futtatókörnyezetük.

### Forrásból

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

Ez elindítja az agentmemoryt egy lokális `iii-engine`-nel, ha a pinnelt binárist már telepítetted, vagy Docker Compose-t használ, ha azt választod. A REST, a stream-ek és a megjelenítő alapértelmezetten a `127.0.0.1`-hez kötődnek. Az automatikus macOS/Linux binárisútvonal `curl`-t, egy POSIX `sh`-t és `tar`-t igényel.

Telepítsd az `iii-engine`-t manuálisan. **Az agentmemory jelenleg a `v0.22.1`-re pinneli az `iii-engine`-t**, ugyanarra a kiadásra, mint az `iii-sdk` függősége; a worker ennek az engine-nek a wire-protokollját beszéli, és a 0.20.0 átszervezte az SDK felületét, így a kettő az agentmemory kiadásaiban együtt mozog. Írd felül az `AGENTMEMORY_III_VERSION=<version>` segítségével, ha saját engine-t futtatsz, és tudod, hogy megegyezik.

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSLo iii.tar.gz https://github.com/iii-hq/iii/releases/download/iii/v0.22.1/iii-aarch64-apple-darwin.tar.gz && echo "2b309019b909a896cae874dc947e2cdf877b4f3c51dd026b79850af858517fa4  iii.tar.gz" | shasum -a 256 -c - && tar -xzf iii.tar.gz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** cseréld ki az `aarch64-apple-darwin`-t `x86_64-apple-darwin`-ra
- **Linux x64:** cseréld ki `x86_64-unknown-linux-gnu`-ra
- **Linux arm64:** cseréld ki `aarch64-unknown-linux-gnu`-ra
- **Windows:** töltsd le az `iii-x86_64-pc-windows-msvc.zip`-et az [iii-hq/iii kiadások v0.22.1](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.22.1) oldalról, és bontsd ki az `iii.exe`-t a `%USERPROFILE%\.agentmemory\bin\iii.exe` helyre

Minden archívumhoz tartozik egy illő `.sha256` fájl a kiadási oldalon; ha platformot cserélsz, használd azt a fájl hash-ét a fenti ellenőrzésben (Windowson: `Get-FileHash`). Az `npx @agentmemory/agentmemory`-ban lévő automatikus telepítő pinneli ezeket a hash-eket, és visszautasít minden archívumot, amely nem egyezik.

Vagy használj Dockert (a becsomagolt `docker-compose.yml` lehúzza az `iiidev/iii:0.22.1`-et). Teljes dokumentáció: [iii.dev/docs](https://iii.dev/docs).

### Windows

Az agentmemory Windows 10/11-en fut, de maga a Node.js-csomag nem elég; a pinnelt iii-engine v0.22.1 futtatókörnyezetre is szükség van háttérfolyamatként. A CLI nem bontja ki automatikusan a Windows ZIP-et, így a natív Windows-felhasználóknak manuálisan kell telepíteniük az `iii.exe`-t, vagy a WSL2-t, vagy a Docker Desktopot kell választaniuk.

A natív Windows automatizált MCP-bekötés csak az `agentmemory connect copilot-cli`-t támogatja. A Claude Code, a Codex, a Cursor és minden más natív Windows-ágens esetén másold be a manuális MCP blokkot az [Egyéb ágensek](#other-agents) részből az adott ágens Windows-konfigurációjába. A `connect` futtatása WSL-ben csak akkor megfelelő, ha a célágens is ugyanabban a WSL-környezetben van telepítve; nem szerkeszti egy Windows-hoszton futó ágens konfigurációját.

**A opció: előre lefordított Windows binárist (ajánlott)**

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

**B opció: Docker Desktop**

```powershell
# 1. Install Docker Desktop for Windows
# 2. Start Docker Desktop and make sure the engine is running
# 3. Select Docker explicitly and run agentmemory:
$env:AGENTMEMORY_USE_DOCKER = "1"
npx -y @agentmemory/agentmemory@latest
```

**C opció: csak önálló MCP (engine nélkül).** Ha csak az MCP eszközökre van szükséged az ágensedhez, és nincs szükséged a REST API-ra, a megjelenítőre vagy a cron-feladatokra, hagyd ki teljesen az engine-t:

```powershell
npx -y @agentmemory/agentmemory@latest mcp
# or via the shim package:
npx -y @agentmemory/mcp
```

**Diagnosztika Windowshoz:** ha az `npx -y @agentmemory/agentmemory@latest` elbukik, futtasd újra `--verbose`-szal, hogy lásd a valódi engine stderr-t. Gyakori hibamódok:

| Jelenség | Megoldás |
|---|---|
| `The engine process started but the REST API never responded.` | Erősítsd meg, hogy mind a négy levezetett port szabad, ellenőrizd, hogy a pinnelt `iii.exe` életben maradt, majd futtasd újra `--verbose`-szal, és vizsgáld meg a rögzített engine stderr-t |
| `Could not start iii-engine` | Sem az `iii.exe`, sem a Docker nincs telepítve. Lásd a fenti A vagy B opciót |
| Port-konfliktus | `netstat -ano \| findstr :3111`, hogy lásd, mi van hozzákötve, majd öld ki, vagy használj `--port <N>`-t |
| A Docker-fallback kimarad, bár a Docker telepítve van | Győződj meg róla, hogy a Docker Desktop valóban fut (a tálca ikonja) |

> Megjegyzés: az iii **engine** egy előre lefordított bináris, nem egy cargo crate, ezért ne próbáld `cargo install`-lal telepíteni. (Az iii **SDK-k** publikálva vannak a crates.io-n, az npm-en és a PyPI-n, de az agentmemorynak nincs szüksége rájuk.) A támogatott engine-telepítési módok mind a v0.22.1-re vannak pinnelve: a fenti előre lefordított bináris, az agentmemory macOS/Linux automatikus telepítési útvonala (`curl`, POSIX `sh`, és `tar` szükséges), és az `iiidev/iii:0.22.1` Docker image. A sima, upstream `install.sh | sh` a legújabb engine-t telepíti, amit az agentmemory nem támogat. Használd az `npx -y @agentmemory/agentmemory@latest`-et; macOS/Linuxon ez lehúzza a pinnelt engine-t a `~/.agentmemory/bin`-be.

---

<h2 id="deploy">Telepítés (Deploy)</h2>

Egykattintásos sablonok felügyelt hosztokhoz. Mindegyik egy önálló
Dockerfile-t szállít, amely lehúzza az `@agentmemory/agentmemory`-t az npm-ről, és
bemásolja az iii engine binárist a hivatalos `iiidev/iii` Docker Hub
image-ből; nincs szükség előre épített agentmemory image-re. A tartós tár
a `/data`-ra csatlakozik; az első indításkor az entrypoint felülírja
az npm-be csomagolt iii konfigurációt (amely a `127.0.0.1`-hez kötődik) egy
telepítésre hangolttal, amely a `0.0.0.0`-hoz kötődik, és abszolút `/data` útvonalakat használ,
legenerálja a HMAC secretet, majd leadja a jogosultságokat `root`-ról `node`-ra a
`gosu`-n keresztül, mielőtt exec-elné az agentmemory CLI-t.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Telepítés a fly.io-ra" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Telepítés a Railway-re" /></a>
</p>

A Render egykattintásos telepítés gombja a repó gyökerében lévő `render.yaml`-t igényli, amit szándékosan tisztán tartunk. Használd a [`deploy/render/`](.././deploy/render/README.md)-ben dokumentált Render Blueprint folyamatot, hogy manuálisan a repón belüli blueprintre mutass.

A teljes beállítási részletek (HMAC-rögzítés, megjelenítő SSH-tunnel, forgatás, mentés,
költségküszöbök) a [`deploy/`](.././deploy/README.md)-ben élnek:

- [`deploy/fly`](.././deploy/fly/README.md): egyetlen gép,
  `auto_stop_machines = "stop"`-pal; a legolcsóbb üresjárat.
- [`deploy/railway`](.././deploy/railway/README.md): Hobby-csomag, fix díj,
  volume a dashboardon.
- [`deploy/render`](.././deploy/render/README.md): Blueprint-folyamat,
  automatikus diszk-pillanatképek a fizetős csomagokon.
- [`deploy/coolify`](.././deploy/coolify/README.md): önálló üzemeltetés a saját
  VPS-eden, a [Coolify](https://coolify.io/self-hosted) révén; ugyanaz a Docker
  Compose stack, te birtoklod a hosztot és az adatot.

Csak a `3111`-es port van publikálva. A `3113`-as megjelenítő
a konténeren belül a loopbackhez marad kötve; minden sablon README-je dokumentálja
az SSH-tunnel mintát az eléréséhez.

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Miért agentmemory" height="32" /></picture></h2>

Minden kódolóágens elfelejt mindent, amikor a session véget ér, és minden új session azzal kezdődik, hogy újra elmagyarázod a stacket. Az agentmemory a háttérben fut, és megszünteti ezt a lépést.

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

### A beépített ágensmemóriával szemben

Minden AI kódolóágens beépített memóriával érkezik: a Claude Code-nak `MEMORY.md`-je van, a Cursornak notepadjei, a Cline-nak memory bankja. Ezek úgy működnek, mint a ragasztós jegyzetek. Az agentmemory a kereshető adatbázis a ragasztós jegyzetek mögött.

| | Beépített (CLAUDE.md) | agentmemory |
|---|---|---|
| Méretezés | 200 soros korlát | Korlátlan |
| Keresés | Mindent betölt a kontextusba | BM25 + vektor + gráf (csak top-K) |
| Token-költség | 22K+ 240 megfigyelésnél | ~1,900 token (92%-kal kevesebb) |
| Ágensek közötti | Ágensenkénti fájlok | MCP + REST (bármely ágens) |
| Koordináció | Nincs | Lease-ek, szignálok, akciók, rutinok |
| Megfigyelhetőség | Fájlok manuális olvasása | Valós idejű megjelenítő a :3113-on |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="Hogyan működik" height="32" /></picture></h2>

### Memória-pipeline

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

### 4 szintű memória-konszolidáció

Az emberi agy memóriafeldolgozásának a mintájára épül, beleértve az alvás alatti konszolidációt is.

| Szint | Mi | Analógia |
|------|------|---------|
| **Working (munka-)** | Nyers megfigyelések a toolhasználatból | Rövidtávú memória |
| **Episodic (episodikus)** | Tömörített session-összefoglalók | "Mi történt" |
| **Semantic (szemantikus)** | Kinyert tények és minták | "Mit tudok" |
| **Procedural (procedurális)** | Munkafolyamatok és döntési minták | "Hogyan kell csinálni" |

A memóriák idővel lecsengenek (Ebbinghaus-görbe). A gyakran elért memóriák megerősödnek. Az elavult memóriák automatikusan kiürülnek. Az ellentmondásokat a rendszer felismeri és feloldja.

### Mi kerül rögzítésre

| Hook | Rögzíti |
|------|----------|
| `SessionStart` | Projekt-útvonal, session-ID |
| `UserPromptSubmit` | Felhasználói promptok (privacy-szűrve) |
| `PreToolUse` | Fájlhozzáférési minták + bővített kontextus |
| `PostToolUse` | Tool neve, bemenet, kimenet |
| `PostToolUseFailure` | Hibakontextus |
| `PreCompact` | Visszainjektálja a memóriát a compaction előtt |
| `SubagentStart/Stop` | Sub-agent életciklus |
| `Stop` | Session-vég összefoglaló |
| `SessionEnd` | Session-lezárási jelző |

### Kulcsképességek

| Képesség | Leírás |
|---|---|
| **Automatikus rögzítés** | Minden toolhasználat hookokon keresztül rögzítve, manuális munka nélkül |
| **Szemantikus keresés** | BM25 + vektor + tudásgráf RRF-fúzióval |
| **Memória-evolúció** | Verziózás, felülírás, kapcsolati gráfok |
| **Felidézési higiénia** | A felülírt memória-verziók elhagyják a keresési indexeket; a KV-ben lévő verziólánc megtartja a teljes előzményt |
| **Közel-duplikátum jelzések** | A mentések egy tájékoztató `similarTo` egyezést adnak vissza, ha az új tartalom erősen hasonlít egy meglévő memóriára |
| **Ágensenkénti hatókör** | Az `agentId` végigfut a mentésen és a felidézésen a REST, az MCP és a keresési index között, megosztott vagy izolált módban |
| **Írási időbeli eredet** | Minden megfigyelés és memória egy megváltoztathatatlan eredetcsatornát hordoz (user, agent, tool, import, vagy shared), amely a rögzítéskor, mentéskor és importáláskor kerül rá |
| **Automatikus elfelejtés** | TTL-lejárat, ellentmondás-felismerés, fontosság alapú kiürítés |
| **Elsőbbséget kap az adatvédelem** | API-kulcsok, secretek, `<private>` tagek eltávolítva a tárolás előtt |
| **Önjavítás** | Circuit breaker, szolgáltató-fallback lánc, egészségfigyelés |
| **Claude híd** | Kétirányú szinkron a MEMORY.md-vel |
| **Tudásgráf** | Entitáskinyerés + BFS-bejárás |
| **Csapatmemória** | Névtér szerint megosztott + privát a csapattagok között |
| **Hivatkozási eredet** | Bármely memória visszakövethető a forrás-megfigyelésekhez |
| **Git-pillanatképek** | A memóriaállapot verziózása, visszaállítása és diff-elése |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Keresés" height="32" /></picture></h2>

Hármas folyam-visszakeresés, amely három szignált kombinál:

| Folyam | Mit csinál | Mikor |
|---|---|---|
| **BM25** | Tő szerinti kulcsszó-egyezés szinonima-bővítéssel | Mindig aktív |
| **Vektor** | Koszinusz-hasonlóság sűrű embeddingek felett | Ha van beállítva embedding-szolgáltató |
| **Gráf** | Tudásgráf-bejárás entitásegyezés révén | Ha a lekérdezésben entitásokat észlel |

Reciprocal Rank Fusionnal (RRF, k=60) fuzionálva, és sessionönkénti diverzifikálva (legfeljebb 3 eredmény sessiononként).

Ha egy vektorindex fel van töltve, a `mem::search` (a `memory_recall` mögött) a hibrid BM25 + vektor rangsorolót használja. Embeddingek nélkül BM25-öt használ. A `smart-search` emellett strukturális gráfegyezéseket is fuzionálhat, ha létezik gráfadat, kulcs nélküli módban is. A tanulság-felidézés egy dedikált, memóriában tartott BM25-indexen fut, nem a teljes korpusz lekérdezésenkénti átnézésével. A felülírt memória-verziók minden felidézési útvonalból ki vannak zárva; a verziólánc megtartja az előzményüket.

A vektorok túlélnek egy összeomlást vagy egy force-killt. A vektorindex legfeljebb minden `AGENTMEMORY_INDEX_SAVE_INTERVAL_MS`-ben (10 perc) kerül mentésre, csomagokban. Minden közben hozzáadott vagy eltávolított vektor azonnal felíródik egy kis, függőben lévő naplóba is az állapottárban, és a következő indítás lejátssza ezt az embedding-szolgáltató hívása nélkül. Minden sikeres mentés kiüríti a naplót. Azok a dokumentumok, amelyeknek a lejátszás után sincs vektoruk, a háttérben, `AGENTMEMORY_VECTOR_BACKFILL_MAX` (500) méretű batch-ekben kapnak újra embeddinget, amíg nem marad ilyen, és egy leállított backfill a következő indításkor folytatódik. A `/agentmemory/status` és a megjelenítő megmutatja a függőben lévő napló méretét és a backfill állapotát. A kulcs nélküli telepítések semmit nem írnak.

A BM25 alapból tokenizálja a görögöt, a cirillt, a hébert, az arabot és az ékezetes latint. Kínai / japán / koreai memóriákhoz telepítsd az opcionális szegmentálókat (`npm install @node-rs/jieba tiny-segmenter`), hogy szóméretű tokenekre bontsa a CJK-futásokat; nélkülük az agentmemory finoman visszaesik a teljes futás tokenizálására, és egyszeri jelzést ír a stderr-re.

### Embedding-szolgáltatók

A kulcs nélküli telepítések letiltják a vektor-embeddingeket: a `mem::search` BM25-öt használ, míg a `smart-search` emellett a meglévő strukturális gráfadatot is használhatja. Ahhoz, hogy beállj az ingyenes, eszközön futó szemantikus embeddingekre, add hozzá ezt a `~/.agentmemory/.env`-hez, és indítsd újra az agentmemoryt:

```env
EMBEDDING_PROVIDER=local
```

A normál npm-telepítés tartalmazza az opcionális `@huggingface/transformers` futtatókörnyezetet. Az első embedding-kérés letölti a `Xenova/all-MiniLM-L6-v2`-t, így hálózati hozzáférésre van szükség, és tovább tarthat; az azt követő következtetés eszközön fut. A távoli szolgáltatókat a rendszer automatikusan felismeri a kulcsaikból, hacsak az `EMBEDDING_PROVIDER` nem írja felül őket.

| Szolgáltató | Modell | Költség | Megjegyzések |
|---|---|---|---|
| **Lokális (ajánlott opt-in)** | `all-MiniLM-L6-v2` | Ingyenes | Eszközön fut az első modell-letöltés után, +8pp felidézés a csak-BM25-höz képest |
| Gemini | `gemini-embedding-001` | Ingyenes szint | 100+ nyelv, 768/1536/3072 dimenzió (MRL), 2048 tokenes bemenet. Felváltja a `text-embedding-004`-et ([elavult, leállítva 2026. jan. 14-én](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | Legjobb minőség |
| Voyage AI | `voyage-code-3` | Fizetős | Kódra optimalizálva |
| Cohere | `embed-english-v3.0` | Ingyenes próba | Általános célú |
| OpenRouter | Bármely modell | Változó | Több modellt lefedő proxy |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP szerver" height="32" /></picture></h2>

54 eszköz, 6 resource, 3 prompt és 17 skill.

> **MCP shim a teljes szerverrel szemben:** a publikált `@agentmemory/mcp` csomag egy vékony shim. A teljes, 54 eszközből álló felületet **csak akkor** adja meg, **ha el tud érni egy futó agentmemory szervert** az `AGENTMEMORY_URL` révén (proxy mód). Ha nincs elérhető szerver, a shim visszaesik egy 7 eszközből álló lokális készletre (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). Az `AGENTMEMORY_TOOLS=core|all` env-változó egy *szerveroldali* kapcsoló; a shim `env` blokkjában beállítva nincs hatása. Ha csak 7 eszközt látsz a Cursorban / OpenCode-ban / Gemini CLI-ben, indítsd el az `npx -y @agentmemory/agentmemory@latest`-et (vagy a Docker-stacket), és állítsd be az `AGENTMEMORY_URL=http://localhost:3111`-et.

### 54 eszköz

Három eszközfelület, a legkisebbtől a legnagyobbig: az `AGENTMEMORY_TOOLS=core` 8 alapeszközre szűkíti a láthatóságot (`memory_save`, `memory_recall`, `memory_consolidate`, `memory_smart_search`, `memory_sessions`, `memory_diagnose`, `memory_lesson_save`, `memory_reflect`); az alábbi alapkészlet a regisztri 14 alapozó eszköze; az alapértelmezett (`AGENTMEMORY_TOOLS=all`) mind az 54-et megjeleníti.

<details>
<summary>Alapeszközök (14)</summary>

| Eszköz | Leírás |
|------|-------------|
| `memory_recall` | Keresés a korábbi megfigyelések között |
| `memory_compress_file` | Markdown fájlok tömörítése a struktúra megtartásával |
| `memory_save` | Egy belátás, döntés vagy minta mentése |
| `memory_file_history` | Korábbi megfigyelések adott fájlokról |
| `memory_patterns` | Visszatérő minták felismerése |
| `memory_sessions` | A legutóbbi sessionök listázása |
| `memory_smart_search` | Hibrid szemantikus + kulcsszavas keresés |
| `memory_vision_search` | Keresés kép-megfigyelések között |
| `memory_timeline` | Időrendi megfigyelések |
| `memory_profile` | Projektprofil (fogalmak, fájlok, minták) |
| `memory_export` | Az összes memóriaadat exportálása |
| `memory_relations` | Kapcsolati gráf lekérdezése |
| `memory_commit_lookup` | Egy git commit mögötti sessionök |
| `memory_commits` | Egy sessionhöz rögzített commitok |

</details>

<details>
<summary>Kiterjesztett eszközök (összesen 54, az alapértelmezett felület)</summary>

| Eszköz | Leírás |
|------|-------------|
| `memory_patterns` | Visszatérő minták felismerése |
| `memory_timeline` | Időrendi megfigyelések |
| `memory_relations` | Kapcsolati gráf lekérdezése |
| `memory_graph_query` | Tudásgráf-bejárás |
| `memory_consolidate` | 4 szintű konszolidáció futtatása |
| `memory_claude_bridge_sync` | Szinkron a MEMORY.md-vel |
| `memory_team_share` | Megosztás csapattagokkal |
| `memory_team_feed` | Legutóbbi megosztott elemek |
| `memory_audit` | A műveletek audit-nyomvonala |
| `memory_governance_delete` | Törlés audit-nyomvonallal |
| `memory_snapshot_create` | Git-verziózott pillanatkép |
| `memory_action_create` | Munkaelemek létrehozása függőségekkel |
| `memory_action_update` | Akció-állapot frissítése |
| `memory_frontier` | Blokkolatlan akciók, prioritás szerint rangsorolva |
| `memory_next` | A legfontosabb egyetlen következő akció |
| `memory_lease` | Exkluzív akció-lease-ek (több ágens) |
| `memory_routine_run` | Munkafolyamat-rutinok instanciálása |
| `memory_signal_send` | Ágensek közötti üzenetküldés |
| `memory_signal_read` | Üzenetek olvasása nyugtával |
| `memory_checkpoint` | Külső feltétel-kapuk |
| `memory_mesh_sync` | P2P szinkron az instance-ok között |
| `memory_sentinel_create` | Esemény-vezérelt megfigyelők |
| `memory_sentinel_trigger` | Sentinel-ek elsütése kívülről |
| `memory_sketch_create` | Múlékony akció-gráfok |
| `memory_sketch_promote` | Véglegesítés |
| `memory_crystallize` | Akcióláncok sűrítése |
| `memory_diagnose` | Egészségvizsgálatok |
| `memory_heal` | Elakadt állapot automatikus javítása |
| `memory_facet_tag` | Dimenzió:érték tagek |
| `memory_facet_query` | Lekérdezés facet-tagek szerint |
| `memory_verify` | Eredet visszakövetése |

</details>

### 6 Resource · 3 Prompt · 17 Skill

| Típus | Név | Leírás |
|------|------|-------------|
| Resource | `agentmemory://status` | Egészségi állapot, session-szám, memória-szám |
| Resource | `agentmemory://project/{name}/profile` | Projektenkénti intelligencia |
| Resource | `agentmemory://project/{name}/recent` | Egy projekt legutóbbi megfigyelései |
| Resource | `agentmemory://memories/latest` | A legutóbbi 10 aktív memória |
| Resource | `agentmemory://graph/stats` | Tudásgráf-statisztikák |
| Resource | `agentmemory://team/{id}/profile` | Megosztott csapatprofil |
| Prompt | `recall_context` | Keresés + kontextus-üzenetek visszaadása |
| Prompt | `session_handoff` | Átadási adat ágensek között |
| Prompt | `detect_patterns` | Visszatérő minták elemzése |
| Skill | `/recall` | Keresés a memóriában |
| Skill | `/remember` | Mentés a hosszútávú memóriába |
| Skill | `/session-history` | Legutóbbi session-összefoglalók |
| Skill | `/forget` | Megfigyelések/sessionök törlése |

A táblázat a négy alap-skillt mutatja. A teljes készlet 9 meghívható skillből és 8 referencia-skillből áll; lásd a Natív skillek részt fentebb.

### Önálló MCP

Futtasd a teljes szerver nélkül, bármely MCP klienshez. Mindkettő működik:

```bash
npx -y @agentmemory/agentmemory@latest mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

Vagy add hozzá az ágensed MCP konfigurációjához:

A legtöbb ágens esetén (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI):
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

Olvasszd be az `agentmemory` bejegyzést a hoszt meglévő `mcpServers` objektumába, ne cseréld le a fájlt. Olyan sandboxolt klienseknél, amelyek nem érik el a hoszt `localhost`-ját, add hozzá a `"AGENTMEMORY_FORCE_PROXY": "1"`-et az env blokkhoz, és állítsd az `AGENTMEMORY_URL`-t egy olyan útvonalra, amit a sandbox el tud érni.

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

Másold be a plugin-fájlt a repóból:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Valós idejű megjelenítő" height="32" /></picture></h2>

Automatikusan elindul a `3113`-as porton. A megjelenítő egy pillanatképet tölt be, amikor csatlakozik (`GET /agentmemory/viewer/snapshot`), majd élő stream-eseményeket alkalmaz: új memóriák, tanulságok, megfigyelések, audit-bejegyzések, gráfváltozások és egészségfrissítések jelennek meg polling vagy oldal-újratöltés nélkül. Az egyetlen más kérés az, amire kattintasz: "load more" lapok és keresések. Ha a stream megszakad, a megjelenítő megmutatja, mennyire elavultak a számai, backoff-fal újracsatlakozik, és egy pillanatképből újraszinkronizál.

- **12 fül, négy csoportban**, élő számlálókkal, deep linkekkel (`#memories/<id>`, `#sessions/<id>?obs=<id>`, `#graph/<id>`, `#health/consolidation`), billentyűparancsokkal és egy mobilmenüvel.
- **Memories:** szerveroldali keresés, szűrők projekt, ágens és típus szerint, egy részletpanel a verziólánccal és egy szó-szintű diff-fel, eredetre mutató linkek, másolás gombok az id-hez, az MCP-híváshoz és egy curl parancshoz, szerkesztés (új verzió), elfelejtés megerősítéssel, tömeges elfelejtés és JSON-export.
- **Sessions:** egy beágyazott megfigyelés-idővonal olvasható tool-bemenettel és -kimenettel, szűrőkkel és lapozással, valamint az adott session által létrehozott memóriák és tanulságok.
- **Graph:** keresés, csomópont-részletek kapcsolatokkal és forrásokkal, egy jelmagyarázat, amely nem csak színre támaszkodik, és nagyítási vezérlők.
- **Health:** a `GET /agentmemory/status` élő verziója. Minden probléma a megoldásával érkezik, plusz az állapot-backend, az index-mentési állapot, a gráf-eredet tömörítésének haladása és egy konszolidáció-magyarázó a valódi küszöbértékekkel.
- **Audit, Activity, Profile, Replay, Lessons, Actions és Crystals** oldalak, mindegyik egy üres állapottal, amely elmondja, mi az adott szekció, miért üres, és melyik parancs tölti fel, valamint egy `?` szójegyzék-tooltippel minden terminuson és számon.

```bash
open http://localhost:3113
```

A megjelenítő szervere alapértelmezetten a `127.0.0.1`-hez kötődik, és csatolja a szerver secretjét, amikor továbbküldi a kéréseket a REST API-nak, így nincs szükség beállításra. A REST-en kiszolgált `/agentmemory/viewer` végpont a normál bearer-token szabályokat követi, és a token nélküli böngészőket a megjelenítő portjára irányítja át. A CSP-fejlécek válaszonkénti script-nonce-t használnak, és letiltják az inline handler-attribútumokat (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii konzol" height="32" /></picture></h2>

A megjelenítő a `:3113`-on azt mutatja, mire **emlékezett** az ágensed. A [iii console](https://iii.dev/docs/console) azt mutatja, mit **csinált** az ágensed: minden memória-műveletet OpenTelemetry trace-ként, minden KV-bejegyzést szerkeszthetően, minden funkciót meghívhatóan, minden stream-et csatlakoztathatóan. Két ablak ugyanarra a memóriára: egy termékalakú, egy engine-alakú.

Figyeld meg, ahogy egy `memory_smart_search` elsül, és nézd meg a BM25-pásztázást → embedding-keresést → RRF-fúziót → rerankert egy vízeséses nézetben. Szerkessz egy elakadt konszolidáció-timert a KV-böngészőben. Játssz vissza egy `PostToolUse` hookot egy módosított payloaddal. Pinneld ki a WebSocket-stream-et, és nézd, ahogy a megfigyelések élőben landolnak.

Az agentmemory ezt ingyen szállítja, mert minden funkcióhívás és trigger az iii-n keresztül sül el; semmi egyéni, semmit nem kell instrumentálni.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="iii console Workers oldal: csatlakoztatott workerek, köztük agentmemory-instance-ok, élő funkciószámokkal és futtatókörnyezet-metaadatokkal" width="720" />
  <br/>
  <em>Workers oldal: minden csatlakoztatott worker, az agentmemory-t magát is beleértve, PID-del, funkciószámmal, futtatókörnyezettel és a legutóbbi láthatósággal.</em>
</p>

**Már telepítve van.** A konzol a pinnelt `iii` engine-nel (0.22+) érkezik; nincs külön mit telepíteni. Az első indítás letölti a konzol binárist az engine mellé.

**Indítsd el az agentmemory mellett:**

```bash
agentmemory console
```

Ez a pinnelt engine `iii console`-ját futtatja az agentmemory által feloldott portok ellen (REST, stream-ek, híd), és egy porttal a megjelenítő fölött szolgálja ki, alapértelmezetten a `http://localhost:3114`-en. A `--console-port N` egy másik portot választ; a `--port` és az `--instance` ugyanúgy választja ki az agentmemory-instance-t, mint a `stop`-nál; minden más kapcsoló átadásra kerül, például a `--enable-flow` a kísérleti architektúra-gráf oldalhoz.

Ugyanaz kézzel, hasznos, ha az `agentmemory` nincs a PATH-on:

```bash
~/.agentmemory/bin/iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**Mit tehetsz a konzolból:**

| Oldal | Mire használd |
|------|-----------|
| **Workers** | Lásd minden csatlakoztatott workert és élő metrikáit, az agentmemory workert is beleértve. |
| **Functions** | Hívj meg közvetlenül bármelyik agentmemory-funkciót egy JSON-payloaddal; hasznos a `memory.recall`, `memory.consolidate`, `graph.query` teszteléséhez, kliens bekötése nélkül. |
| **Triggers** | Játssz vissza HTTP-, cron-, event- és state-triggereket: süsd el manuálisan a konszolidáció-cront, próbálj újra egy HTTP-route-ot, bocsáss ki egy állapotváltozást. |
| **States** | KV-böngésző teljes CRUD-dal a sessionök, memória-slotok, életciklus-timerek és az embedding-index felett; szerkeszd az értékeket a helyükön. |
| **Streams** | Élő WebSocket-monitor a memória-írásokhoz, hook-eseményekhez és megfigyelés-frissítésekhez, ahogy áthaladnak az iii stream-eken. |
| **Queues** | Tartós queue-topicok + dead-letter kezelés. Játssz vissza vagy dobj el elbukott embedding- / tömörítési feladatokat. |
| **Traces** | OpenTelemetry vízesés / flame / szolgáltatás-bontás nézetek. Szűrj `trace_id` szerint, hogy pontosan lásd, mely funkciók, DB-hívások és embedding-kérések adtak ki egy adott `memory.search`-t. |
| **Logs** | Strukturált OTEL-logok, trace/span ID-khez szűrve és korrelálva. |
| **Config** | Futásidejű konfiguráció: lásd pontosan, mely workerekkel, szolgáltatókkal és portokkal fut az engine-ed. |
| **Flow** | (Opcionális, `--enable-flow`) Interaktív architektúra-gráf minden workerről, triggerről és stream-ről. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="iii console trace vízesés nézet, amely a per-span időtartamot mutatja" width="720" />
  <br/>
  <em>Traces: vízesés / flame / szolgáltatás-bontás minden memória-művelethez.</em>
</p>

**A trace-ek már be vannak kapcsolva:**

Az `iii-config.yaml` az `iii-observability` workerrel engedélyezve érkezik (`exporter: memory`, `sampling_ratio: 0.1`, metrikák + logok). Nincs szükség extra konfigurációra; abban a pillanatban, hogy az agentmemory elindul, minden memória-művelet egy strukturált logot bocsát ki, amit a konzol tud olvasni, és minden tizedik (`sampling_ratio: 0.1`) emellett egy trace-span-t is kibocsát.

Ha Jaeger/Honeycomb/Grafana Tempo-ba akarsz exportálni helyette, változtasd meg az `exporter: memory`-t `exporter: otlp`-re, és állítsd be a collector-végpontot az iii observability-dokumentációja szerint.

> **Figyelem:** a konzolon magán nincs kikényszerítve hitelesítés; tartsd a `127.0.0.1`-hez kötve (ez az alapértelmezett), és soha ne tedd nyilvánosan elérhetővé.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="iii által hajtva" height="32" /></picture></h2>

Az agentmemory **már egy futó [iii](https://iii.dev) instance**. Három primitívből (worker, function, trigger) épül fel a futtatókörnyezet; a KV-állapot, a stream-ek és az OTEL-trace-ek az iii-vel érkező iii-state, iii-stream és iii-observability workerekből jönnek. Nem telepítettél Postgrest, Redist, Expresst, pm2-t vagy Prometheust, mert az iii lecseréli őket.

Ez azt jelenti, hogy egyetlen további paranccsal egy teljesen új képességgel bővítheted az agentmemoryt.

### Bővítsd az agentmemoryt több workerrel

Az agentmemoryhoz szükséges beépített workerek már ott vannak az `iii-config.yaml`-ban, és vele együtt indulnak: `iii-state` (KV), `iii-queue` (tartós újrapróbálkozás az event-feliratkozóknak), `iii-pubsub`, `iii-cron`, `iii-stream`, és `iii-observability` (OTEL-trace-ek, metrikák és logok minden funkcióhoz). Bármi más a [iii worker regiszterből](https://workers.iii.dev) beilleszthető ugyanabba az engine-be: másold az `iii-config.yaml`-t a `~/.agentmemory/iii-config.yaml`-ba (a CLI előnyben részesíti ezt a fájlt a becsomagolttal szemben, és a portokat és adat-útvonalakat is belerendereli), add hozzá a bejegyzést, telepítsd a worker futtatókörnyezetet egyszer a `~/.agentmemory/bin/iii update worker` paranccsal, és indítsd újra az agentmemoryt.

```yaml
workers:
  # ...the bundled entries...
  - name: database          # SQL-backed state adapter when you outgrow the KV defaults
  - name: iii-sandbox       # run code that came out of memory_recall inside a throwaway VM
  - name: mcp               # extra MCP servers next to agentmemory's, same engine
```

| Worker | Mit kapsz hozzá az agentmemoryhoz |
|---|---|
| [`database`](https://workers.iii.dev/workers/database) | SQL-alapú állapot-adapter, ha kinövöd a memóriabeli KV-alapértelmezéseket |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | A `memory_recall`-ból kikerült kód egy eldobható VM-ben fut, nem a shelledben |
| [`mcp`](https://workers.iii.dev/workers/mcp) | Állíts fel extra MCP szervereket az agentmemoryé mellett, osszátok meg ugyanazt az engine-t |

A 0.22.x engine-en tartsd meg az `iii-` prefixes neveket a fenti beépített workerekhez; a prefix nélküli `http`, `state`, `queue`, `pubsub` és `cron` bejegyzések azok az önálló regiszter-workerek, amelyekre az agentmemory a 0.23-as migrációval áttér.

Teljes regiszter: [workers.iii.dev](https://workers.iii.dev). Minden ottani worker ugyanazokon a primitíveken épül fel, amelyeket az agentmemory is használ, és a már meglévő agentmemoryod is egy közülük.

### Engine-konfiguráció és bind-cím

Az `agentmemory start` az engine-konfigurációt az első létező fájlból olvassa: `AGENTMEMORY_III_CONFIG`, `./iii-config.yaml` a jelenlegi mappában, `~/.agentmemory/iii-config.yaml`, majd a becsomagolt `iii-config.yaml`. Minden indításkor ezt a fájlt (adat-útvonalak, portok, állapot-backend) a `~/.agentmemory/data/iii-config.runtime.yaml`-ba rendereli, és a renderelt másolattal indítja el az engine-t, így a forrásfájlt szerkeszd, ne a renderelt másolatot. A forrásfájl `host:` értékei úgy maradnak, ahogyan írva vannak.

A becsomagolt `iii-config.yaml` szándékosan a `127.0.0.1`-hez kötődik, és ez az alapértelmezés egy konténeren belül is érvényes. Egy konténerben indított CLI a konténer saját loopbackjén figyel, így a publikált portok semmit nem érnek el. Ahhoz, hogy egy konténerizált CLI-t a publikált portokon keresztül szolgálj ki, állítsd az `AGENTMEMORY_III_CONFIG`-ot egy olyan konfigurációra, amely a `0.0.0.0`-hoz kötődik. A csomagolt `iii-config.docker.yaml` egy ilyen: a `iii-http`-t, az `iii-stream`-et és az engine-portot a `0.0.0.0`-hoz köti, és az állapotot a `/data` alatt tárolja, így csatolj ott egy írható volume-ot. Tartsd beállítva az `AGENTMEMORY_SECRET`-et, és csak azokat a portokat publikáld, amelyekre szükséged van, a `127.0.0.1`-en vagy egy megbízható proxy mögött.

Ennek a repónak a `docker-compose.yml`-je nem megy át a CLI konfiguráció-keresésén: a `/app/config.yaml`-ra csatolja az `iii-config.docker.yaml`-t, és az `iii-engine` konténer a `--config /app/config.yaml`-lal indul. Az egykattintásos [telepítési sablonok](../deploy/) a saját `0.0.0.0` konfigurációjukat írják meg az entrypointjaikban.

### Tárolási backend: fájl (alapértelmezett) vs. redis

Az `iii-state` és az `iii-stream` alapértelmezetten az iii-engine beépített, fájl-alapú KV-tárát használja: egy JSON-fájl hatókörönként, az engine-folyamat memóriájában tartva, és egy időzítő szerint visszaírva a diszkre. Ez a helyes alapértelmezés egy egyfelhasználós lokális telepítéshez; egy több egyidejű íróval rendelkező megosztott daemon valódi, kulcsonkénti írásokat kap Redis révén helyette, a művelet-onkénti hálózati fordulat árán (minden `state::*` hívás továbbra is egyetlen Redis-kapcsolaton szerializál, így ez a fájl-tár zárolását egy socketre cseréli, nem párhuzamosságra).

Állítsd be az `AGENTMEMORY_STATE_BACKEND=redis`-t (plusz az `AGENTMEMORY_REDIS_URL`-t), hogy mindkét workert az iii-engine beépített `redis` adapterére váltsd, amely minden kulcsot egy Redis hash-mezőként tárol (`HSET`) egy teljes hatókör minden íráskori felülírása helyett:

```env
# ~/.agentmemory/.env
AGENTMEMORY_STATE_BACKEND=redis
AGENTMEMORY_REDIS_URL=redis://localhost:6379
```

Az `AGENTMEMORY_STATE_BACKEND` alapértelmezetten `file`; ha nem állítod be, a mai viselkedés nem változik, és egy nem felismert érték (bármi, ami nem `file` vagy `redis`) indítási hiba, nem néma visszaesés. A `/agentmemory/status` és a megjelenítő Health oldala (a State store sor) jelzi, melyik backend aktív, és hogy válaszol-e, az URL-t soha.

**Csak sima `redis://`.** A pinnelt engine (0.22.1) TLS-támogatás nélkül építi fel a Redis-kliensét, így egy `rediss://` URL (a legtöbb felügyelt Redis-ajánlat, mint az Upstash, a Redis Cloud és az átvitel közbeni titkosítással rendelkező ElastiCache alapértelmezetten csak TLS-t enged) nem tud csatlakozni. A kapcsolat titkosítás nélküli, így a Redis-jelszó és minden tárolt memória nyílt szövegben megy át a vonalon: egy lokális Redisre, vagy egy olyan privát hálózaton lévő Redisre célozz, amelyben bízol. Bármely más Redishez futtass egy titkosított tunnelt (stunnel, SSH, vagy VPN) az agentmemory-hoszton, így a sima `redis://` szakasz azon a hoszton marad, és a tunnel upstream-kapcsolata titkosított és hitelesített. Ha egy Redis-jelszó egyetlen aposztrófot tartalmaz, percent-encode-old (`%27`); az engine kibontja az URL-t a saját YAML-konfigurációjába, mielőtt feldolgozná.

**Egy Redis-szerver minden `--instance`-hez.** Az engine Redis-kulcs-prefixei (`state:<scope>`, `stream:<name>:<group>`) fixek, így két, ugyanarra az adatbázisra mutató agentmemory-instance (`--instance 1`, `--instance 2`, ...) felülírja egymás adatait. Egy külön adatbázis-index (`redis://localhost:6379/1`) külön tartja a tárolt adatot, de az engine egyetlen Redis pub/sub csatornán (`stream::events`) továbbítja az élő megjelenítő-eseményeket, és a Redis pub/sub nem veszi figyelembe az adatbázis-indexet, így minden instance megjelenítője továbbra is a másik élő eseményeit mutatná. Adj minden instance-nek saját Redis-szervert (vagy portot), ha egynél többet futtatsz.

**Mi marad ugyanaz, és mi különbözik.** Minden agentmemory-funkció működik Redisen: sessionök, megfigyelések, memóriák (remember, supersede, evolve, forget), keresés és az index-csomagok, tanulságok, a gráf, az audit-log és annak havi hatókörei, export és import, governance-törlések, konszolidáció-státusz, a megjelenítő pillanatképe és élő stream-je, és az egészségfigyelő. Az engine minden hatókört egyetlen Redis hash-ként tárol (`HSET`/`HGET`/`HGETALL`), és ugyanazokat az állapot-triggereket süti el, mint a fájl-tár. Három engine-különbséget az agentmemory oldja meg belsőleg:

- A Redis fix sorrend nélkül adja vissza egy hatókör rekordjait. Az agentmemory a legrégebbitől rendezi őket (a rekord id-jében lévő létrehozási idő, majd az időbélyeg szerint), hogy a listák, a lapozás és az export-chunk-ok ugyanabban a sorrendben jöjjenek, mint a fájl-táron.
- Az engine egy Lua-szkriptben alkalmazza a részleges frissítéseket Redisen, amely az üres tömböket üres objektumokká alakítja. Az agentmemory saját maga alkalmazza ezeket a frissítéseket (olvasás, módosítás, írás egy kulcsonkénti zár alatt) Redisen, hogy a `tags: []`-hez hasonló mezők tömbök maradjanak.
- Az örökölt audit-log-ellenőrzés a régi hatókört Redisből olvassa, nem a fájl-tár fájlját keresi a diszken.

Egy különbség rád vár: **a Redis újraindítása után az engine leállítja az élő események továbbítását** a megjelenítőhöz, amíg az agentmemory nem indul újra. Az adat normálisan mentve és olvasva marad. Az egészségfigyelő 30 másodpercenként küld egy teszt-eseményt a Rediszen keresztül; ha nem jön vissza, a `/agentmemory/status` és a megjelenítő Health oldala azt mutatja: "Az élő frissítések nem érik el a megjelenítőt", a megoldással: indítsd újra az agentmemoryt. Ha a Redis nem fut, az állapotjelentés azt mutatja: "Az állapottár nem válaszol", és hogyan ellenőrizd (`redis-cli -u "$AGENTMEMORY_REDIS_URL" ping`). Egy nagyon nagy hatókör listázása egyetlen `HGETALL`-ban olvassa az egész hash-t, ugyanolyan költséggel, mint amikor a fájl-tár memóriában tartja.

**Ajánlott Redis-beállítások.** Az alapértelmezett `save 3600 1 300 100 60 10000` pillanatkép-politika percekig tartó írásveszteséget szenvedhet egy összeomláskor, rosszabbul, mint a fájl-tár 5 másodperces flush-ablaka. Állítsd be az `appendonly yes`-t mindenhez, amit nem szeretnél elveszíteni. Állítsd be a `maxmemory-policy noeviction`-t; az `allkeys-lru` vagy hasonló némán elkezd memóriákat elejteni, amint a Redis eléri a memóriakorlátját.

Egy natív (nem Docker) indítás, és minden egykattintásos [telepítési sablon](../deploy/) (ezek felülírják a becsomagolt `iii-config.yaml`-t, és natívan indulnak) olvassa az `AGENTMEMORY_STATE_BACKEND`/`AGENTMEMORY_REDIS_URL`-t, és belerendereli az elindított `iii-config`-ba. Az URL maga soha nem íródik bele abba a renderelt fájlba, csak egy `${AGENTMEMORY_REDIS_URL}` hivatkozás, amelyet az engine-folyamat a saját környezetéből bont ki indításkor. Csak ennek a repónak a saját Docker Compose útvonala (`AGENTMEMORY_USE_DOCKER=1`, vagy egy már így elindított engine folytatása) csatolja az `iii-config.docker.yaml`-t írásvédetten, és soha nem renderel; az `agentmemory start` figyelmeztet, amikor ezt a kombinációt észleli. Cseréld ki azt a fájlt kézzel, követve ugyanazt a `name: redis` / `config: redis_url: ...` formátumot, amelyet az [iii-state](https://workers.iii.dev/workers/iii-state) és az [iii-stream](https://workers.iii.dev/workers/iii-stream) worker-dokumentáció mutat, és irányítsd a `redis_url`-t egy a konténerből elérhető Redisre. A `docker-compose.yml` átadja az `AGENTMEMORY_REDIS_URL`-t az engine-konténernek, így a `redis_url: '${AGENTMEMORY_REDIS_URL}'` ott működik, és kint tartja az URL-t a csatolt fájlból.

A renderelt konfiguráció kint tartja az URL-t a `~/.agentmemory/data/iii-config.runtime.yaml`-ból, de az engine saját konfiguráció-workere a *kibontott* értéket mégis elmenti a `~/.agentmemory/config/iii-state.yaml`-ba és az `iii-stream.yaml`-ba, amint elindul (az iii-engine `${VAR}`-kibontása azelőtt történik, hogy ez a worker elmentené a saját seedjét, és a feloldott értéket tárolja, nem a hivatkozást). Kezeld azt a mappát úgy, mintha egy hitelesítő adatot tartalmazna: `chmod 700 ~/.agentmemory` bármely megosztott hoszton, és részesítsd előnyben egy, az agentmemory szükségleteire korlátozott Redis ACL-felhasználót az adatbázis admin hitelesítő adataival szemben.

**A migráció nem automatikus.** Az `AGENTMEMORY_STATE_BACKEND` váltása mindkét oldalon üres tárból indul; semmi nem másolja át a meglévő adatot fájlból Redisbe vagy vissza. Exportálj abból a backendből, amelyet elhagysz, és importálj abba, amelybe átmész. Ez azonosan fut bash és zsh alatt (a `bash -u`-t is beleértve). Egy olyan tömb, mint az `AUTH=(${AGENTMEMORY_SECRET:+-H "Authorization: Bearer $AGENTMEMORY_SECRET"})`, nem: a zsh egy rosszul formázott szóként tartja a headert, ahol a bash kettőre bontja, így mindkét kérés 401-et kap, amikor az `AGENTMEMORY_SECRET` beállított:

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

A `/agentmemory/export` emellett elfogadja a `?maxSessions=`-t és a `?offset=`-et egy nagy korpusz több hívásra bontásához; a `strategy` importnál `merge` (alapértelmezett, biztonságos), `replace`, vagy `skip`.

### Mit helyettesít az iii

| Hagyományos stack | Az agentmemory ezt használja |
|---|---|
| Express.js / Fastify | iii HTTP Triggerek |
| SQLite / Postgres + pgvector | iii KV State + memóriabeli vektorindex |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | iii engine worker-felügyelet |
| Prometheus / Grafana | iii OTEL + egészségfigyelő |
| Egyéni plugin-rendszerek | `iii worker add <name>` |

**219 forrásfájl · ~52,000 LOC · 2,600+ teszt · 311 funkció · 60 KV-hatókör**, mindez három primitíven. Nincs `agentmemory plugin install`. A plugin-rendszer maga az iii.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Konfiguráció" height="32" /></picture></h2>

### LLM-szolgáltatók

Az agentmemory automatikusan felismeri a szolgáltatókat a környezetedből. Egy szolgáltató elérhetővé teszi az LLM-alapú műveleteket, de a szolgáltató-konfiguráció önmagában nem engedélyezi az LLM által írt megfigyelés-tömörítést. Ahhoz mindkettő szükséges: egy szolgáltató és az `AGENTMEMORY_AUTO_COMPRESS=true`.

| Szolgáltató | Konfiguráció | Megjegyzések |
|----------|--------|-------|
| **No-op (alapértelmezett)** | Nincs szükség konfigurációra | Az LLM-alapú tömörítés/összefoglalás letiltva. A szintetikus tömörítés és a BM25-felidézés továbbra is működik. Lásd az `AGENTMEMORY_ALLOW_AGENT_SDK`-t alább, ha korábban a Claude-előfizetéses fallbackre támaszkodtál. |
| Anthropic API | `ANTHROPIC_API_KEY` | Token-alapú díjszabás |
| MiniMax | `MINIMAX_API_KEY` | Anthropic-kompatibilis |
| Gemini | `GEMINI_API_KEY` | Az embeddingeket is engedélyezi |
| OpenRouter | `OPENROUTER_API_KEY` | Bármely modell |
| OpenAI API | `OPENAI_API_KEY` | Alapértelmezett `gpt-5.6-luna`, felülírható az `OPENAI_MODEL`-lel |
| **Lokális (Ollama / LM Studio / vLLM / llama.cpp)** | `OPENAI_API_KEY=local` + `OPENAI_BASE_URL=http://localhost:11434/v1` (Ollama) vagy `http://localhost:1234/v1` (LM Studio) + `OPENAI_MODEL=<your model>` | Bármi, ami OpenAI-API-kompatibilis. Nulla költség, a saját hardvereden fut. Lásd a [Lokális modellek](#local-models-ollama--lm-studio--vllm) részt alább. |
| Claude-előfizetéses fallback | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Csak opt-in. A `@anthropic-ai/claude-agent-sdk` sessionöket indít; korábban korlátlan Stop-hook-rekurziót okozott, így nem alapértelmezett többé. |

### Lokális modellek (Ollama / LM Studio / vLLM)

Az agentmemory bármely OpenAI-API-kompatibilis szerverrel beszél, így bármi, ami kiteszi a `/v1/chat/completions`-t, kódmódosítás nélkül működik. Nincs fizetős kulcs, nincs felhő, nincs rate limit; teljesen a saját hardveredben fut.

**Ollama** (alapértelmezett port `11434`):

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

**LM Studio** (alapértelmezett port `1234`):

Nyisd meg az LM Studio-t → Local Server fül → Start Server. Válassz bármilyen chat-modellt a választóból (Qwen 3, gpt-oss, DeepSeek R1, stb.).

```env
# ~/.agentmemory/.env
OPENAI_API_KEY=lmstudio                        # any non-empty string; LM Studio ignores it
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=qwen3-8b                          # match the model name from LM Studio
```

**vLLM / llama.cpp / Text Generation Inference**: ugyanaz a forma. Irányítsd az `OPENAI_BASE_URL`-t arra az URL-re, amit a szervered kitesz, és állítsd be az `OPENAI_MODEL`-t egy olyan névre, amit a szervered elfogad.

**Modellajánlások memóriamunkára**: a tömörítés és az összefoglalás rövid feladatok (<2K token be, <500 token ki), ahol egy 7B instruct-modell is bőven elég. Ajánlások:

| Modell | Méret | Miért |
|-------|------|-----|
| `qwen3:8b` | ~5.2 GB | Kiegyensúlyozott alapértelmezés egy 16 GB-os gépen; erős a kinyerésben és a tool-alakú szövegben |
| `qwen3:4b` | ~2.6 GB | A legkisebb épkézláb opció; megfelelő tömörítéshez, gyengébb gráfkinyeréshez |
| `qwen3-coder:30b` | ~19 GB | A legjobb lokális választás kód-alakú sessionökhöz (30B MoE, 3.3B aktív) 24-32 GB hardveren |
| `gpt-oss:20b` | ~14 GB | Erős általános modell, amely elfér 16 GB RAM-ban |
| `deepseek-r1:8b` | ~5.2 GB | Reasoning-disztill; lassabb, de tisztább kinyerések |

A Qwen 3 modellek alapértelmezetten gondolkodnak, és képesek az egész token-budgetet elégetni a reasoning-en, mielőtt bármi kimenet lenne. Állítsd be az `AGENTMEMORY_LLM_NOTHINK=1`-et, hogy `/no_think`-et fűzzön a gráfkinyerési promptokhoz, és emeld fel a `MAX_TOKENS`-t (16384 működik), ha a kinyerések üresen jönnek vissza.

A reasoning-osztályú modellek (`o1`-stílusú, `<think>` blokkokkal) üres `content`-et adhatnak vissza egy `reasoning` mezővel, amit a lokális szervered esetleg nem tesz ki. Ha a kinyerések üresen jönnek vissza, váltsd előbb egy nem-reasoning modellre. Az `OPENAI_REASONING_EFFORT=none` env is kikapcsolhatja a gondolkodást az Ollama Cloud olyan thinking-modelljein, amelyek az OpenAI reasoning-sémáját tükrözik.

A lokális embeddingek opcionális függőségként érkeznek, de nem alapértelmezetten engedélyezettek. Állítsd be az `EMBEDDING_PROVIDER=local`-t, hogy beállj a `Xenova/all-MiniLM-L6-v2`-re (384 dimenzió). Az első embedding-kérés letölti a modellt; a következtetés azután eszközön fut. Ennek a beállításnak vagy egy távoli embedding-kulcsnak a híján a vektorok letiltva maradnak, a `mem::search` BM25-öt használ, és a `smart-search` még hozzáadhat meglévő gráf-egyezéseket.

### Költségtudatos modellválasztás

Amikor az LLM által írt háttér-tömörítés engedélyezve van, mind egy szolgáltatóval, mind az `AGENTMEMORY_AUTO_COMPRESS=true`-val, akkor minden megfigyelésnél lefut, így a modellválasztás érdemben megváltoztatja a havi kiadást. Rögzített terhelési adat: 635 kérés / 888K token / 35 óra aktív használat, három OpenRouter-modellen futtatva, 2026-05-23-i árazással.

| Szint | Modell | Input / 1M | Output / 1M | Költség a rögzített 35 órára | Megjegyzések |
|------|-------|------------|-------------|---------------------------|-------|
| Ajánlott | `deepseek/deepseek-v4-flash-0731` | $0.07 | $0.14 | ~$0.07 (becs.) | A legújabb DeepSeek; a legolcsóbb ajánlott választás tömörítési terhelésekhez. |
| Ajánlott | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | Szilárd tömörítési + összefoglalási minőség, ~10×-szer alacsonyabb költséggel, mint a Sonnet. |
| Ajánlott | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | Erős kódreasoning, ha a sessionjeid erősen kód-alakúak. |
| Prémium | `anthropic/claude-sonnet-5` | $3.00 | $15.00 | ~$5.02 (becs.) | Ugyanaz a listaár, mint a mért Sonnet 4.6 futás; $2/$10 bevezető árazás 2026-08-31-ig. |
| Prémium | `openai/gpt-5.6-sol` | $5.00 | $30.00 | ~$9 (becs.) | Zászlóshajó szint; költséges az állandóan futó háttérmunkára. |
| Kerülendő | `anthropic/claude-opus-5` | $5.00 | $25.00 | ~$8.40 (becs.) | Zászlóshajó-osztályú modell; túlköltekezés tömörítésre. |

A mért sorok a rögzített futásból származnak; a (becs.) sorok ugyanazt a token-mixet skálázzák az adott modell listaára szerint.

Az agentmemory futásidejű figyelmeztetést ír ki, amikor az `OPENROUTER_MODEL` egy prémium-szintű mintára illik. Állítsd be az `AGENTMEMORY_SUPPRESS_COST_WARNING=1`-et, hogy elnémítsd, ha már megtetted a tájékozott választást.

Minőség vs. költség kompromisszum memóriamunkához: a tömörítés egy összefoglalási feladat, viszonylag laza minőségi küszöbökkel (az ágens olvassa vissza az összefoglalót, nem a felhasználó). A DeepSeek V4 Flash / V4 Pro / Qwen3-Coder a Sonnethez mérten kerekítési hibahatáron belül landol ennél a feladatnál, miközben 10-70×-szer kevesebbet kerül. Tartsd meg a prémium-szintű modelleket azokra a lekérdezésekre, amiket közvetlenül olvasol.

Források: [OpenRouter árazás a Claude Sonnet 5-höz](https://openrouter.ai/anthropic/claude-sonnet-5), [DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash-0731), [DeepSeek árazási megjegyzések](https://api-docs.deepseek.com/quick_start/pricing/).

### Több ágenses memória (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

Több ágenses beállításokban, ahol több szerep osztja meg egy agentmemory szervert (architect / developer / reviewer / researcher / support-agent), az `AGENT_ID` minden írást megjelöl azzal a szereppel, amelyik végezte. Az `AGENTMEMORY_AGENT_SCOPE` szabályozza, hogy a felidézés szűr-e ez a tag szerint.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

Két mód:

| Mód | Írások megjelölése | Felidézés szűrése | Mikor használd |
|------|------------|---------------|-------------|
| `shared` (alapértelmezett) | igen | nem | Ágensek közötti kontextus audit-nyomvonallal. Az architect láthatja, mit jegyzett fel a developer, de minden sor rögzíti, ki mondta. |
| `isolated` | igen | igen | Szigorú szétválasztás. Az architect soha nem látja a developer megfigyeléseit / memóriáit / sessionjeit. |

Mi kerül megjelölésre, ha az `AGENT_ID` beállított: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. A szerep az `api::session::start` → `mem::observe` → `mem::compress` → KV útvonalon áramlik.

Mi kerül kiszűrésre isolated módban: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Minden végpont elfogadja a `?agentId=<role>`-t kérésenkénti felülírásra, és a `?agentId=*`-ot, hogy teljesen kilépj az env-hatókörből. A `/memories` emellett elfogadja a `?includeOrphans=true`-t is, hogy felszínre hozza azokat az AGENT_ID előtti memóriákat, amelyeknek az `agentId`-ja nincs definiálva.

Hívásonkénti felülírás az SDK / REST rétegben: minden mutáló végpont (`/session/start`, `/remember`) elfogad egy `agentId` mezőt a kéréstörzsben, amely felülírja az env-et. Hasznos azoknál a futtatókörnyezeteknél, amelyek sok szerepet egyetlen szerverfolyamaton keresztül vezetnek. Az MCP `memory_save` eszköze ugyanazt az `agentId` mezőt teszi ki, az önálló stdio-szerver mind az `agentId`-t, mind a `project`-et továbbítja, és a mentett memóriák az `agentId`-t is bevezetik a keresési indexbe, így az ágens-hatókörű keresés a megfigyelések mellett a memóriákra is kiterjed.

Amikor az `AGENT_ID` nincs beállítva, a memória hatókör nélkül marad (örökölt viselkedés, nincs tag, nincs szűrés).

### Portok

Az agentmemory + iii-engine alapértelmezetten négy portot köt le. Ha egy újraindítás `port in use`-szal bukik el, ez a táblázat megmondja, melyik folyamatot keresd.

| Port | Folyamat | Cél | Env felülírás |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | Belső stream-worker (az agentmemory + a megjelenítő fogyasztja) | `III_STREAM_PORT` (előnyben részesítve) vagy az örökölt `III_STREAMS_PORT` |
| `3113` | agentmemory | Valós idejű megjelenítő (`http://localhost:3113`) | `III_VIEWER_PORT` vagy `AGENTMEMORY_VIEWER_URL` a jelentett URL-hez |
| `49134` | iii-engine | WebSocket; itt regisztrálnak a workerek, és itt áramlik az OTel-telemetria | `III_ENGINE_PORT` vagy `III_ENGINE_URL` |

A `--port <N>` megváltoztatja a REST-horgonyt, és levezeti a stream-eket (`N+1`), a megjelenítőt (`N+2`) és az engine WebSocketet (`N+46023`), de csak ott, ahol a fenti megfelelő explicit port vagy URL nincs beállítva. Nem hoz létre izolált életciklus-névteret. Használd a `--instance 1`-et egy második daemonhoz; ez a 3211 horgonyt használja, alapértelmezetten `3211/3212/3213/49234`, és egy külön `instance-1` adat- és életciklus-mappát kap. Az 1-től 50-ig terjedő instance-ok ugyanezt a mintát követik.

A pinnelt engine `--no-update-check`-kel indul (nincs frissítés- vagy biztonsági-tanács-lekérdezés a GitHub ellen indításkor), és az iii anonim használati telemetriája kikapcsolva: az agentmemory beállítja az `III_TELEMETRY_ENABLED=false`-t az általa indított engine-hez, hacsak nem exportálod magad a változót, és a becsomagolt compose-fájl ugyanezt teszi.

Elavult folyamatok takarítása, ha a portok lekötve maradnak egy összeomlott futás után:

```bash
# macOS / Linux — find whatever is on each port and kill it
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

Az `agentmemory stop` tisztán learatja a workert és az engine pidfile-t egy sikeres natív leállításnál. Docker-módban kiírja a natív workert, leállítja a pontosan validált engine-konténert, és megőrzi mind a konténert, mind a `/data` csatolását egy veszteség nélküli újraindításhoz; a következő indítás validálja és folytatja ugyanazt a konténert. A Docker-alapú eltávolítás az `agentmemory remove --keep-data`-t igényli: eltávolítja a megosztott, agentmemory-kezelt fájlokat, de megőrzi a validált konténert, az adat-csatolását és a visszaállításukhoz szükséges életciklus-rekordot. A destruktív Docker-adattörlés szándékosan az üzemeltetőre van hagyva, egy mentés után. A CLI emellett visszautasítja, hogy natív engine-ként örökbe fogadjon vagy jelezzen Docker- vagy VM-port-tulajdonosokat (Docker backend, vpnkit, colima), hacsak nincs átadva a `--force`. A fenti manuális takarítás csak az összeomlás utáni esetre vonatkozik, amikor semelyik pidfile sem maradt meg.

### Konfigurációs fájl

Az agentmemory futásidejű konfigurációját tedd a `~/.agentmemory/.env`-be, ne exportálj változókat minden shellben. Ha a megjelenítő egy olyan beállítási tippet mutat, mint az `export ANTHROPIC_API_KEY=...`, másold be ebbe a fájlba `ANTHROPIC_API_KEY=...`-ként, az `export` prefix nélkül, majd indítsd újra az agentmemoryt.

A folyamat-szintű környezeti változók továbbra is működnek, és elsőbbséget kapnak a fájlban lévő értékekkel szemben.

Windowson ugyanez a fájl a `%USERPROFILE%\.agentmemory\.env`-ben él:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

Ahhoz, hogy egy Claude Code Pro/Max előfizetéssel tesztelj API-kulcs helyett, iratkozz fel rá explicit módon:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

Az LLM által írt megfigyelés-tömörítéshez mindkét sor szükséges: hozzáférés egy LLM-szolgáltatóhoz (ezt az explicit előfizetéses fallbacket is beleértve) és az `AGENTMEMORY_AUTO_COMPRESS=true`. Egy szolgáltató önmagában az alapértelmezett szintetikus tömörítési útvonalat hagyja érvényben.

A konszolidáció (gráf-csomópontok, tanulságok, kristályok) alapértelmezetten be van kapcsolva, amikor egy LLM-szolgáltató konfigurálva van. Explicit módon kapcsold ki a `CONSOLIDATION_ENABLED=false`-szal, ha LLM-mentes működést akarsz. A gráfkinyerés egy külön kapcsoló:

```env
GRAPH_EXTRACTION_ENABLED=true
# CONSOLIDATION_ENABLED=false   # opt out of auto-consolidation
```

### Környezeti változók

Hozd létre a `~/.agentmemory/.env`-et:

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

138 endpoint a `3111`-es porton. A REST API alapértelmezetten a `127.0.0.1`-hez kötődik. A védett végpontok `Authorization: Bearer <secret>`-et igényelnek, és a mesh-sync végpontok mindkét oldalon explicit módon beállított `AGENTMEMORY_SECRET`-et igényelnek.

**A hitelesítés alapértelmezetten be van kapcsolva.** Amikor az `AGENTMEMORY_SECRET` nincs beállítva (sem a shellben, sem a `~/.agentmemory/.env`-ben), a szerver az első indításkor egy véletlen secretet generál, és `0600` móddal tárolja a `~/.agentmemory/secret`-ben. Minden becsomagolt kliens onnan olvassa, amikor egy lokális szerverrel beszél: a CLI, a megjelenítő, a `plugin/scripts` alatti hookok, az MCP szerver és a `@agentmemory/mcp` shim, az `agentmemory connect` által írt konfigurációk, és a becsomagolt OpenCode, Pi, OpenClaw, Hermes és fájlrendszer-figyelő integrációk. A tárolt secret csak loopback URL-eknek kerül elküldésre (`localhost`, `127.0.0.0/8`, `::1`). Egy explicit `AGENTMEMORY_SECRET` mindig elsőbbséget kap, és a távoli klienseknek továbbra is be kell állítaniuk. A Docker és a `deploy/` entrypointok már generálnak és exportálnak egy saját secretet. Az API kézi hívásához:

```bash
curl -H "Authorization: Bearer $(cat ~/.agentmemory/secret)" http://localhost:3111/agentmemory/health
```

**Szabályok az írási kérésekhez.** A `POST`, `PUT`, `PATCH` és `DELETE` kéréseknek a REST API-hoz és a megjelenítőhöz `Content-Type: application/json`-t kell küldeniük (egy `charset` paraméter rendben van), amikor törzset hordoznak, és egy `Origin` fejlécnek, ha jelen van, egy loopback origin-nek kell lennie a konfigurált REST- vagy megjelenítő-porthoz, vagy felsorolva kell lennie a `VIEWER_ALLOWED_ORIGINS`-ban (vesszővel elválasztva, pl. `https://memory.example.com`). Azok a kliensek, amelyek nem küldenek `Origin` fejlécet (CLI, hookok, MCP, curl, szerver-szerver), nem érintettek. A megjelenítő a saját origin-ját is elfogadja.

**Fájlútvonalak.** Azok a végpontok, amelyek fájlokat olvasnak vagy írnak (`/compress-file`, `/replay/import-jsonl`, `/graph/import-graphify`), csak a `~/.agentmemory` alatti, az instance adatmappájában lévő, vagy az `AGENTMEMORY_IMPORT_ROOT`-ban felsorolt mappa alatti útvonalakat fogadják el (több mappát `:`-tal válassz el, Windowson `;`-vel). A `/replay/import-jsonl` elfogadja az alapértelmezett `~/.claude/projects`-et is. Az `/obsidian/export` az `AGENTMEMORY_EXPORT_ROOT`-on belül marad, a `/migrate` a `~/.agentmemory`-n belül. A symlinkek minden ellenőrzés előtt feloldásra kerülnek.

**Secret-tisztítás.** API-kulcsok, bearer-tokenek, PEM privát kulcs-blokkok és URL-ekbe ágyazott hitelesítő adatok (`scheme://user:password@host`) minden írási útvonalon elfedésre kerülnek, mielőtt a szöveg tárolásra kerülne: megfigyelések, remember, evolve, slotok, tanulságok, akciók, sketchek, szignálok, checkpointok, importok, jsonl-replay, mesh-sync, csapat-megosztások, tömörítési és összefoglaló kimenet, kristályok és gráf-csomópontok.

<details>
<summary>Kulcs végpontok</summary>

| Metódus | Útvonal | Leírás |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Egészségjelzés (mindig nyilvános) |
| `GET` | `/agentmemory/status` | Mi a hiba, és hogyan javítsd (HTML böngészőkhöz, egyébként JSON) |
| `GET` | `/agentmemory/viewer/snapshot` | Minden, amit a megjelenítő mutat, egyetlen válaszban |
| `POST` | `/agentmemory/session/start` | Session indítása + kontextus lekérése |
| `POST` | `/agentmemory/session/end` | Session lezárása |
| `POST` | `/agentmemory/observe` | Megfigyelés rögzítése (lásd a rögzítés-kiszolgálást alább) |
| `GET` | `/agentmemory/capture` | A rögzítési inbox, a dead letterek és az offline spool |
| `POST` | `/agentmemory/capture/retry` | Dead-letter rögzítések újrapróbálása |
| `POST` | `/agentmemory/capture/drain` | A lokális offline spool elküldése most |
| `POST` | `/agentmemory/smart-search` | Hibrid keresés |
| `POST` | `/agentmemory/context` | Kontextus generálása |
| `POST` | `/agentmemory/remember` | Mentés a hosszútávú memóriába |
| `POST` | `/agentmemory/forget` | Megfigyelések törlése |
| `POST` | `/agentmemory/enrich` | Fájlkontextus + memóriák + hibák |
| `GET` | `/agentmemory/profile` | Projektprofil |
| `GET` | `/agentmemory/export` | Minden adat exportálása |
| `POST` | `/agentmemory/import` | Import JSON-ból |
| `POST` | `/agentmemory/graph/query` | Tudásgráf-lekérdezés |
| `POST` | `/agentmemory/graph/compact` | Túlméretezett gráf-eredet ritkítása |
| `POST` | `/agentmemory/team/share` | Megosztás csapattal |
| `GET` | `/agentmemory/audit` | Audit-nyomvonal |

Teljes végpontlista: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

**Rögzítés-kiszolgálás.** A hookok minden megfigyelést egyszer küldenek el a `POST /agentmemory/observe`-nak, egy `eventId`-vel. Ez a hoszt saját id-je a híváshoz, ha a payloadnak van ilyene (például a Claude Code `tool_use_id`-je), egyébként a session, a hook-típus, a tool neve, a bemenet, a kimenet és a hoszt időbélyegének hash-e. A szerver beírja az eseményt egy rögzítési inboxba az állapottárban, elmenti a megfigyelést, majd eltávolítja az inbox-bejegyzést. A státuszkód megmondja, mi történt:

| Státusz | `status` mező | Jelentés |
|---|---|---|
| `201` | `accepted` | Elmentve. Az `observationId` az új megfigyelés. |
| `202` | `accepted` (`state: "retrying"`) | Elfogadva, de a mentés elbukott. A szerver újrapróbálja, akár egy újraindítás után is. |
| `200` | `duplicate` | Ezt az `eventId`-t már elfogadta a rendszer. Az `observationId` a meglévő megfigyelés; semmi új nem kerül tárolásra. |
| `400` / `422` | `rejected` | Érvénytelen payload, vagy a mentés véglegesen elbukott (az esemény dead letterként marad meg). |
| `503` | `rejected` (`retryable: true`) | Az inbox betelt (`AGENTMEMORY_CAPTURE_INBOX_MAX`). A hookok spoolozzák az eseményt, és később küldik el. |

Az elbukott eseményeket a rendszer minden `AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS`-ben (10 s) újrapróbálja, duplázódó backoff-fal, legfeljebb `AGENTMEMORY_CAPTURE_MAX_ATTEMPTS`-ig (5). Azok az események, amelyek továbbra sem sikerülnek, dead letterként maradnak az inboxban, felsorolva a `/agentmemory/status`-on és a megjelenítő Health oldalán, és újrapróbálhatók a `POST /agentmemory/capture/retry`-vel (`{"eventId": "..."}` vagy `{"all": true}`). Az elfogadott esemény-id-ket a rendszer `AGENTMEMORY_CAPTURE_DEDUP_HOURS`-ig (168 óra, legfeljebb `AGENTMEMORY_CAPTURE_EVENTS_MAX` id) megjegyzi, így egy, egy timeout vagy újraindítás után visszajátszott hookot egyszer tárol, míg két külön toolhívás a saját hoszt-id-jével kétszer kerül tárolásra, akkor is, ha a tartalmuk azonos. Amikor egy megfigyelés törlésre kerül (forget, session-törlés, kiürítés, automatikus elfelejtés, vagy egy import, amely lecseréli a tárat), az eseménye töröltként kerül megjelölésre, mielőtt a megfigyelés eltávolításra kerül, így az adott esemény egy ugyanazon ablakon belüli visszajátszása duplikátumként kerül megválaszolásra, és semmit nem tárol. Az állapottár 2 másodpercenként ír a diszkre, így egy megválaszolt esemény egy pillanatra még csak a memóriában lehet. Hogy ezt lefedje, minden `2xx` válasz hordozza a szerver `bootId`-ját is (minden indításnál új), az `acceptedAt`-ot és a `durableAfterMs`-t (a mentési intervallum plusz 1.5 s a fájl-tárnál, 1.5 s redisen, ahol a perzisztencia az üzemeltető beállítása). A hookok a helyi spoolban tartják az eseményt, amíg ez az ablak nem telik le, és egy későbbi híváskor törlik, egy újabb kérés nélkül. Ha a `bootId` addigra megváltozott, a szerver újraindult, így a hook ismét elküldi az eseményt ugyanazzal az `eventId`-vel; egy olyan esemény, amely valóban elérte a diszket, nem kerül kétszer tárolásra. A szerver maga is elküldi az ilyen eseményeket indításkor és minden újrapróbálkozási intervallumnál, így egy újraindítás sem veszít el semmit, akkor sem, ha utána nem fut hook. A régebbi hookok ignorálják az extra mezőket, és az új hookok egy régebbi szerver ellen ugyanúgy elvetik az eseményt `2xx`-nél, mint korábban.

Amikor a szerver nem fut, nem válaszol időben, vagy 5xx-et ad vissza, a hook hozzáfűzi a megfigyelést egy lokális spool-fájlhoz, `<data dir>/capture-spool/<host>-<port>.jsonl` (a mappa felülírható az `AGENTMEMORY_CAPTURE_SPOOL_DIR`-ral). A fájl csak a saját felhasználód számára elérhető (mód 600), a secreteket a rendszer ugyanúgy elfedi, ahogy a szerver teszi, legfeljebb `AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES`-ot (5 MiB) tárol, és eldobja az `AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS`-nál (168) régebbi bejegyzéseket. Amikor betelik, az új bejegyzések elvetésre és megszámlálásra kerülnek, és a `/agentmemory/status` jelenti. A hook továbbra is 0-val lép ki az időkorlátján belül, és nem ad hozzá kérést, amikor a szerver egészséges. A spool a következő indításkor, és az első olyan hooknál kerül elküldésre, amely ismét eléri a szervert, egy háttérfolyamatban, hogy az ágens ne várjon. Az esemény-id-k ezt biztonságossá teszik: egy megfigyelés, amely már megérkezett egy timeout előtt, nem kerül kétszer tárolásra. Az `npx @agentmemory/agentmemory capture` megmutatja a spoolt és a szerver inboxát, a `--drain` elküldi a spoolt most, és a `GET /agentmemory/capture` ugyanezt adja vissza JSON-ként. Állítsd be az `AGENTMEMORY_CAPTURE_SPOOL=false`-t, hogy kikapcsold a spoolt.

**A gráf-eredet tömörítése.** Minden tudásgráf-csomópont és -él megtartja a legújabb 32 megfigyelés id-jét, amelyekből származott. Az ennél a korlátnál korábban írt tárak csomópontonként akár több ezer id-t is tarthatnak egy forró csomóponton, ami lelassítja a gráfkeresést és a megjelenítőt, vagy elakasztja a workert. Az agentmemory ezt saját maga javítja: a frissítés utáni első indításkor a háttérben ritkít minden csomópontot, élt, felülírt élt (a temporális gráf-előzmény) és a gyorsítótárazott pillanatképet a korlátra, kis szeletekben, köztük szünettel, hogy a keresés, a rögzítés és a megjelenítő tovább működjön. Elmenti a haladását, folytatja egy újraindítás után, és soha nem fut újra, ha egyszer végzett. A `/agentmemory/status` és a megjelenítő Health oldala függőben lévőként, futóként (az aktuális hatókörrel és pozícióval), befejezettként vagy sikertelenként mutatja. Állítsd az `AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false`-ra, hogy kikapcsold.

Hogy kézzel futtasd, hívd meg a `POST /agentmemory/graph/compact`-ot. A név- és él-kulcs-indexeken sétál végig, nem listáz minden csomópontot és élt, és biztonságosan újrafuttatható. Amikor id-ket ritkít, egy `graph_compact` audit-bejegyzést ír.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{}'
```

Egy nagy táron, vagy amikor a hívás 504-et ad vissza, futtasd szeletekben. Küldd el a `scope`-ot (`nodes`, `edges` vagy `history`), az `offset`-et és a `limit`-et, majd hívd újra a visszaadott `nextOffset`-tel, amíg az `null` nem lesz. Tedd ezt a `nodes`, az `edges` és a `history` esetén, és fejezd be egy `{"scope":"snapshot"}` hívással, mert egy szeletelt futás nem érinti a gyorsítótárazott pillanatképet.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"nodes","offset":0,"limit":200}'
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"snapshot"}'
```

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Fejlesztés" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 2,600+ tests
npm run test:integration  # API tests (requires running services)
```

**Előfeltételek:** Node.js >= 20 npm/npx-szel; [iii-engine](https://iii.dev/docs) v0.22.1 vagy Docker. A macOS/Linux automatikus engine-telepítés `curl`-t, egy POSIX `sh`-t és `tar`-t is igényel; a natív Windows a manuális, pinnelt `iii.exe`-t, a WSL2-t vagy a Docker Desktopot használja.

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="Licenc" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
