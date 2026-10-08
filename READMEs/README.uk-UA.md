<p align="center">
  <img src="../assets/banner.png" alt="agentmemory: постійна пам'ять для AI-агентів кодування" width="720" />
</p>

<p align="center">
  <strong>
    Ваш агент кодування пам'ятає все. Більше не потрібно пояснювати все заново.
    Створено на основі <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  Постійна пам'ять для Claude Code, GitHub Copilot CLI, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode та будь-якого MCP-клієнта.
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1.6k%20stars%20%2F%20230%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Проєктний документ: 1.6k зірок / 230 форків на gist" /></a>
</p>

<p align="center">
  <em>Цей gist розширює підхід Karpathy «LLM Wiki», додаючи оцінку довіри, життєвий цикл, графи знань і гібридний пошук: agentmemory — це реалізація цього підходу.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentmemory/agentmemory"><img src="https://img.shields.io/npm/v/@agentmemory/agentmemory?color=CB3837&label=npm&style=for-the-badge&logo=npm" alt="версія npm" /></a>
  <a href="https://github.com/rohitg00/agentmemory/actions"><img src="https://img.shields.io/github/actions/workflow/status/rohitg00/agentmemory/ci.yml?label=tests&style=for-the-badge&logo=github" alt="CI" /></a>
  <a href="https://github.com/rohitg00/agentmemory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rohitg00/agentmemory?color=blue&style=for-the-badge" alt="Ліцензія" /></a>
  <a href="https://github.com/rohitg00/agentmemory/stargazers"><img src="https://img.shields.io/github/stars/rohitg00/agentmemory?style=for-the-badge&color=yellow&logo=github" alt="Зірки" /></a>
</p>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-recall.svg"><img src="../assets/tags/stat-recall.svg" alt="95.2% точність пошуку R@5" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tokens.svg"><img src="../assets/tags/stat-tokens.svg" alt="92% менше токенів" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="54 інструменти MCP" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 автоматичних хуків" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="0 зовнішніх БД" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="2,600+ тестів пройдено" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="демонстрація agentmemory" width="720" />
</p>

<p align="center">
  <a href="#install">Встановлення</a> &bull;
  <a href="#quick-start">Швидкий старт</a> &bull;
  <a href="#benchmarks">Бенчмарки</a> &bull;
  <a href="#vs-competitors">Порівняння з конкурентами</a> &bull;
  <a href="#works-with-every-agent">Агенти</a> &bull;
  <a href="#how-it-works">Як це працює</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Переглядач</a> &bull;
  <a href="#powered-by-iii">На основі iii</a> &bull;
  <a href="#configuration">Конфігурація</a> &bull;
  <a href="#api">API</a>
</p>

---

## Встановлення

Вимоги:

- Node.js 20 або новіше, з npm і npx (`node -v`, `npm -v` та `npx -v`).
- Автоматичне встановлення iii-engine на macOS/Linux також потребує `curl`, POSIX `sh` та `tar`. Мінімальні образи, такі як `node:20-slim`, можуть не містити їх.
- Для нативного Windows потрібно вручну встановити закріплену версію iii-engine v0.22.1 `iii.exe`. WSL2 або Docker Desktop — інші підтримувані шляхи.

Канонічна команда для чистого встановлення:

```bash
npx -y @agentmemory/agentmemory@latest
```

Перший запуск — це інтерактивне налаштування: оберіть агентів для підключення (Claude Code, Cursor, Codex, Gemini CLI, OpenCode, ...), оберіть постачальника LLM або залишайтеся без ключа, після чого створюється конфігурація, запускається сервер пам'яті та закріплений за ним iii engine, і пропонується встановити пакет глобально, щоб команда `agentmemory` надалі працювала будь-де. `-y` приймає запит npx щодо пакета, а `@latest` уникає застарілого кешованого релізу. Постачальник робить доступними можливості LLM, але стиснення спостережень, написане LLM, запускається лише тоді, коли також встановлено `AGENTMEMORY_AUTO_COMPRESS=true`.

Режим без ключа вимикає векторні ембединги. `memory_recall` (шлях `mem::search`) використовує BM25, тоді як `memory_smart_search` також може об'єднувати структурні збіги графа, якщо дані графа вже існують. Щоб безкоштовно отримати семантичне пригадування на пристрої, встановіть `EMBEDDING_PROVIDER=local` у `~/.agentmemory/.env` і перезапустіть. Перший запит ембединга завантажує `Xenova/all-MiniLM-L6-v2`; після цього первинного завантаження моделі обчислення виконуються локально.

Локальний рантайм використовує чотири порти: `3111` для REST/MCP HTTP, `3112` для потоків iii, `3113` для переглядача та `49134` для WebSocket воркера iii. Постійний стан iii зберігається у `~/Library/Application Support/agentmemory` на macOS, у `$XDG_DATA_HOME/agentmemory` або `~/.local/share/agentmemory` на Linux та у `%APPDATA%\agentmemory` на Windows. Використовуйте `--data-dir <path>` або `AGENTMEMORY_DATA_DIR`, щоб перевизначити це значення, і повторно використовуйте те саме значення під час кожного перезапуску. Для зворотної сумісності наявний `./data/state_store.db` або `./data/iii-config.yaml` має пріоритет над платформовим значенням за замовчуванням для інстансу 0; явний прапорець або змінна середовища все одно перемагають.

Потім перевірте, що пригадування працює, і дайте агенту його скіли:

```bash
npx -y @agentmemory/agentmemory@latest demo  # seed sample sessions + exercise recall
npx skills add rohitg00/agentmemory -y   # 17 native skills so your agent knows when to reach for memory
```

Пошук за ключовими словами має спрацьовувати в типовому режимі без ключа через BM25. Запит `database performance optimization` у демо навмисно семантичний і може повертати нуль результатів, доки не налаштовано постачальника ембедингів.

Бажаєте доручити все агенту кодування? Дайте йому одну інструкцію:

> Retrieve and follow the instructions at: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md

Підключайте більше агентів у будь-який момент за допомогою `agentmemory connect <agent>` — 20 адаптерів перелічено у розділі [Працює з кожним агентом](#works-with-every-agent). Повний довідник команд — у розділі [Швидкий старт](#quick-start).

<details>
<summary><strong>Windows</strong></summary>

Найшвидший шлях — WSL2. Налаштування нативного двигуна Windows вимагає вручну завантажити закріплений ZIP-архів v0.22.1 і розпакувати `iii.exe`; CLI не розпаковує його автоматично. Docker Desktop також підтримується. Покрокову інструкцію дивіться у розділі [Примітки щодо Windows](#windows).

</details>

<details>
<summary><strong>Глобальне встановлення / EACCES</strong></summary>

```bash
npm install -g @agentmemory/agentmemory@latest
```

Команда npx вище залишається канонічним шляхом для чистого встановлення і дозволяє уникнути проблем із правами доступу до глобального префікса.

</details>

<details>
<summary><strong>npx видає стару версію</strong></summary>

npx кешує за версіями. Примусово отримайте останню версію за допомогою `npx -y @agentmemory/agentmemory@latest`, або одноразово очистьте кеш командою `rm -rf ~/.npm/_npx` (macOS/Linux; на Windows видаліть `%LOCALAPPDATA%\npm-cache\_npx`).

</details>

<details>
<summary><strong>У вас уже працює власний iii engine</strong></summary>

agentmemory закріплений за iii-engine v0.22.1 і не підключиться до іншої версії (воркер не може розмовляти протоколом іншого двигуна). Зупиніть інший двигун, потім запустіть `npx -y @agentmemory/agentmemory@latest`. Він встановить і запустить закріплену версію v0.22.1 у `~/.agentmemory/bin`, не торкаючись вашого власного `iii`.

</details>

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Працює з кожним агентом" height="32" /></picture></h2>

agentmemory працює з будь-яким агентом, що підтримує хуки, MCP або REST API. Усі агенти використовують один і той самий сервер пам'яті.

<table>
<tr>
<td align="center" width="20%">
<a href="https://claude.com/product/claude-code"><img src="https://github.com/anthropics.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>нативний плагін + 12 хуків + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>нативний плагін + 6 хуків + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/features/copilot"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/github_dark.svg"><img src="https://svgl.app/library/github_light.svg" alt="GitHub Copilot CLI" width="48" height="48" /></picture></a><br/>
<strong>GitHub Copilot CLI</strong><br/>
<sub>MCP + хуки/скіли плагіна</sub>
</td>
<td align="center" width="20%">
<a href="https://cursor.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/cursor_dark.svg"><img src="https://svgl.app/library/cursor_light.svg" alt="Cursor" width="48" height="48" /></picture></a><br/>
<strong>Cursor</strong><br/>
<sub>нативний плагін + 7 хуків + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../plugin/opencode/"><img src="https://raw.githubusercontent.com/rohitg00/agentmemory/main/website/public/opencode.png" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>плагін захоплення + MCP</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://devin.ai"><img src="https://raw.githubusercontent.com/rohitg00/agentmemory/main/website/public/devin.png" alt="Devin" width="48" height="48" /></a><br/>
<strong>Devin</strong><br/>
<sub>6 хуків + скіли + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>нативний плагін + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>нативний плагін + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>нативний плагін + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://github.com/tinyhumansai.png?size=120" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>нативний бекенд на основі трейта Memory</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://antigravity.google"><img src="https://svgl.app/library/antigravity.svg" alt="Antigravity" width="48" height="48" /></a><br/>
<strong>Antigravity</strong><br/>
<sub>MCP + хуки</sub>
</td>
<td align="center" width="20%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://www.warp.dev"><img src="https://svgl.app/library/warp.svg" alt="Warp" width="48" height="48" /></a><br/>
<strong>Warp</strong><br/>
<sub>підключення + MCP + скіли</sub>
</td>
<td align="center" width="20%">
<a href="https://zed.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/zed-logo_dark.svg"><img src="https://svgl.app/library/zed-logo.svg" alt="Zed" width="48" height="48" /></picture></a><br/>
<strong>Zed</strong><br/>
<sub>MCP-сервер</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://continue.dev"><img src="https://github.com/continuedev.png?size=120" alt="Continue" width="48" height="48" /></a><br/>
<strong>Continue</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://docs.factory.ai/cli"><img src="https://www.factory.ai/favicon.svg" alt="Droid" width="48" height="48" /></a><br/>
<strong>Droid</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://kiro.dev"><img src="https://kiro.dev/favicon.ico" alt="Kiro" width="48" height="48" /></a><br/>
<strong>Kiro</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/QwenLM/qwen-code"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/qwen_dark.svg"><img src="https://svgl.app/library/qwen_light.svg" alt="Qwen Code" width="48" height="48" /></picture></a><br/>
<strong>Qwen Code</strong><br/>
<sub>MCP-сервер</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://svgl.app/library/deepseek.svg" alt="DeepSeek Harness" width="48" height="48" /></a><br/>
<strong>DeepSeek Harness</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>Працює з <strong>будь-яким</strong> агентом, що підтримує MCP або HTTP. Один сервер, пам'ять спільна для всіх них.</sub>
</p>

---

Ви пояснюєте ту саму архітектуру щосесії. Ви повторно виявляєте ті самі помилки. Ви повторно навчаєте агента тим самим уподобанням. Вбудована пам'ять (CLAUDE.md, .cursorrules) обмежена 200 рядками і швидко застаріває. agentmemory вирішує цю проблему. Він непомітно фіксує те, що робить ваш агент, стискає це у пам'ять із можливістю пошуку і вставляє потрібний контекст на початку наступної сесії. Одна команда. Працює між агентами.

**Що змінюється:** у сесії 1 ви налаштували JWT-автентифікацію. У сесії 2 ви просите додати обмеження частоти запитів (rate limiting). Агент уже знає, що ваша автентифікація використовує middleware jose у `src/middleware/auth.ts`, що ваші тести покривають перевірку токенів, і що ви обрали jose замість jsonwebtoken для сумісності з Edge — без повторних пояснень і копіювання.

```bash
npx -y @agentmemory/agentmemory@latest
```

За замовчуванням agentmemory зберігає стан iii-engine поза репозиторієм, з якого ви його запускаєте: `~/Library/Application Support/agentmemory` на macOS, `$XDG_DATA_HOME/agentmemory` або `~/.local/share/agentmemory` на Linux та `%APPDATA%\agentmemory` на Windows. Наявний застарілий `./data/state_store.db` або `./data/iii-config.yaml` використовується повторно для інстансу 0 ще до цього платформового значення за замовчуванням. Щоб явно обрати розташування, передайте `--data-dir <path>` або встановіть `AGENTMEMORY_DATA_DIR`; будь-яке з явних налаштувань має пріоритет над застарілим виявленням:

```bash
npx -y @agentmemory/agentmemory@latest --data-dir ~/.agentmemory-projects/main
AGENTMEMORY_DATA_DIR=~/.agentmemory-projects/main npx -y @agentmemory/agentmemory@latest
```

Нативні запуски та запуски в Docker використовують той самий визначений каталог хоста; Docker монтує його як `/data`. `--instance 1` додає `instance-1` до визначеного каталогу і обирає окремий квартет портів за замовчуванням `3211/3212/3213/49234`.

Примітки до останнього релізу: [CHANGELOG.md](../CHANGELOG.md).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Бенчмарки" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Точність пригадування

**coding-agent-life-v1** (власний корпус, відтворюваний у sandbox)

| Адаптер | P@5 | R@5 | Частка влучань у топ-5 | латентність p50 |
|---|---|---|---|---|
| **agentmemory (гібридний)** | **0.240** | **1.000** | **15 / 15** | 14 ms |
| базовий варіант grep | 0.227 | 0.967 | 15 / 15 | 0 ms |

100% влучань у топ-5 на рівні **математичної межі P@5** для цього корпусу (0.240, див. scorecard). Гібридний режим знаходить усі золоті сесії; grep пропускає 1 з 2 золотих результатів у мультисесійному темпоральному запиті. Прирощення — це **пригадування + темпоральність**, а не агрегована точність. Цей бенчмарк невеликий і має мало золотих прикладів; більший LongMemEval-S нижче краще розрізняє результати. Повна розбивка за типами + примітка про виправлення: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 запитань)

| Система | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| резервний варіант лише на BM25 | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Економія токенів

| Підхід | Токенів/рік | Вартість/рік |
|---|---|---|
| Вставка повного контексту | 19.5M+ | Неможливо (перевищує вікно контексту) |
| Підсумовування через LLM | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + локальні ембединги | ~170K | **$0** |

</td>
</tr>
</table>

> Модель ембедингів: `all-MiniLM-L6-v2` (локальна, безкоштовна, без API-ключа). Повні звіти: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Порівняння з конкурентами: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) охоплює agentmemory порівняно з mem0, Letta, Khoj, supermemory, TencentDB Agent Memory, MemPalace, Zep/Graphiti, Cognee, Hippo.

**Відтворити локально:** [`eval/README.md`](../eval/README.md) — придатний до підключення адаптерів harness для LongMemEval `_s` (публічний набір із 500 запитань) + `coding-agent-life-v1` (власний корпус із 15 сесій). Адаптери grep / vector / agentmemory оцінюються поруч, вивід у форматі NDJSON, опубліковані scorecard потрапляють у [`docs/benchmarks/`](../docs/benchmarks/).

**Добре поєднується з [codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything) та [Graphify](https://github.com/safishamsi/graphify).** Індексування графа коду, конвеєри збирання для кількох агентів і ширші графи знань за документами / PDF / зображеннями / відео. agentmemory запам'ятовує роботу; ці три проєкти оживляють решту контекстного шару. Рецепти + таблиця маршрутизації питань: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="Порівняння з конкурентами" height="32" /></picture></h2>

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
<th>Вбудована (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Тип</strong></td>
<td>Двигун пам'яті + MCP-сервер</td>
<td>API шару пам'яті</td>
<td>Повноцінний рантайм агента</td>
<td>Персональний AI</td>
<td>API пам'яті + застосунок</td>
<td>Хаб командної пам'яті (LLM-проксі)</td>
<td>Векторна пам'ять (OSS)</td>
<td>Двигун пам'яті (Oracle DB)</td>
<td>Система пам'яті</td>
<td>Статичний файл</td>
</tr>
<tr>
<td><strong>Пригадування R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>Н/Д</td>
<td>Заявлено самостійно</td>
<td>PersonaMem 76% (заявлено самостійно)</td>
<td>~96.6% (заявлено самостійно)</td>
<td>94.4% (заявлено самостійно)</td>
<td>Н/Д</td>
<td>Н/Д (grep)</td>
</tr>
<tr>
<td><strong>Автозахоплення</strong></td>
<td>12 хуків (без ручних дій)</td>
<td>Ручні виклики <code>add()</code></td>
<td>Самостійне редагування агентом</td>
<td>Вручну</td>
<td>Видобування на стороні API</td>
<td>Перехоплення через проксі (підміна base-URL)</td>
<td>Вручну</td>
<td>Видобування через API</td>
<td>Вручну</td>
<td>Ручне редагування</td>
</tr>
<tr>
<td><strong>Пошук</strong></td>
<td>BM25 + вектор + граф (злиття RRF)</td>
<td>Вектор + граф</td>
<td>Вектор (архівний)</td>
<td>Семантичний</td>
<td>Вектор + RAG</td>
<td>4 типи активів (Chat / Skill / Wiki / CodeGraph)</td>
<td>Лише вектор</td>
<td>Вектор + семантичний</td>
<td>Зважений за згасанням</td>
<td>Завантажує все у контекст</td>
</tr>
<tr>
<td><strong>Мультиагентність</strong></td>
<td>MCP + REST + оренди + сигнали</td>
<td>API (без координації)</td>
<td>Лише в межах рантайму Letta</td>
<td>Ні</td>
<td>Ні</td>
<td>Командні ролі + спільні активи</td>
<td>Ні</td>
<td>Лише в межах скоупу</td>
<td>Спільна для кількох агентів</td>
<td>Файли для кожного агента</td>
</tr>
<tr>
<td><strong>Прив'язка до фреймворку</strong></td>
<td>Немає (будь-який MCP-клієнт)</td>
<td>Немає</td>
<td>Висока (потрібно використовувати Letta)</td>
<td>Автономний</td>
<td>Немає</td>
<td>Проксі обробляє кожен виклик моделі</td>
<td>Немає</td>
<td>Oracle Database</td>
<td>Немає</td>
<td>Формат для кожного агента</td>
</tr>
<tr>
<td><strong>Зовнішні залежності</strong></td>
<td>Немає (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + векторна БД</td>
<td>Декілька</td>
<td>Керована хмара</td>
<td>Docker-стек (Core + Hub + Proxy)</td>
<td>Векторне сховище</td>
<td>Oracle AI Database</td>
<td>Немає</td>
<td>Немає</td>
</tr>
<tr>
<td><strong>Життєвий цикл пам'яті</strong></td>
<td>4-рівнева консолідація + згасання + автозабування</td>
<td>Пасивне видобування</td>
<td>Керується агентом</td>
<td>Вручну</td>
<td>Автозабування</td>
<td>Ручний перегляд; автоматична маршрутизація в розробці</td>
<td>Немає</td>
<td>Не вказано</td>
<td>Згасання + консолідація</td>
<td>Ручне очищення</td>
</tr>
<tr>
<td><strong>Ефективність токенів</strong></td>
<td>~1,900 токенів/сесію ($10/рік)</td>
<td>Залежить від інтеграції</td>
<td>Основна пам'ять у контексті</td>
<td>Залежить</td>
<td>Хмарне ціноутворення</td>
<td>Не вказано</td>
<td>Без бюджету токенів</td>
<td>На основі LLM (залежить)</td>
<td>Залежить</td>
<td>22K+ токенів при 240 спостереженнях</td>
</tr>
<tr>
<td><strong>Переглядач у реальному часі</strong></td>
<td>Так (порт 3113)</td>
<td>Хмарна панель</td>
<td>Хмарна панель</td>
<td>Веб-інтерфейс</td>
<td>Хмарна панель</td>
<td>Веб-інтерфейс Hub</td>
<td>Ні</td>
<td>Ні</td>
<td>Ні</td>
<td>Ні</td>
</tr>
<tr>
<td><strong>Самостійний хостинг</strong></td>
<td>Так (за замовчуванням)</td>
<td>Опційно</td>
<td>Опційно</td>
<td>Так</td>
<td>Ні (лише хмара)</td>
<td>Так (Docker)</td>
<td>Так</td>
<td>Так (Oracle DB)</td>
<td>Так</td>
<td>Так</td>
</tr>
</table>

<sub>Примітка до бенчмарків: лише R@5 для agentmemory — це наш власний вимірений результат (LongMemEval-S, відтворюваний з <a href="../benchmark/COMPARISON.md"><code>benchmark/COMPARISON.md</code></a>). Показники mem0 і Letta — це їхні опубліковані числа LoCoMo (інший набір даних); показники MemPalace, supermemory, TencentDB (PersonaMem) та oracleagentmemory — це заявлені самими постачальниками твердження, які ми не відтворювали самостійно (запуск oracleagentmemory використовував GPT-5.5 проти Oracle AI Database). Наведено поруч лише для орієнтовного порівняння, а не як пряме протистояння на однакових даних. Кількість зірок приблизна і змінюється з часом.</sub>

**Новіші учасники**, варті уваги, детально порівняні в [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md):

| Система | ⭐ | Підхід |
|--------|---|-------|
| Zep / Graphiti | 30K | Темпоральний граф знань; найкращі опубліковані результати для темпоральних запитів (LongMemEval 63.8%), але граф будується асинхронно, тому нові факти можуть надходити із затримкою |
| Cognee | 30K | Перетворення документів на граф знань, лише Python, створено для структурованого видобування сутностей, а не для захоплення сесій |

Жоден з них не має автозахоплення через хуки агентів кодування, не постачається з локальним переглядачем і не працює без ключа — саме це поєднання лежить в основі agentmemory.

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Швидкий старт" height="32" /></picture></h2>

Сумісність: цей реліз орієнтований на `iii-sdk` 0.22.1 і закріплює iii-engine v0.22.1.

### Спробуйте за 30 секунд

```bash
# Terminal 1: start the server
npx -y @agentmemory/agentmemory@latest

# Terminal 2: seed sample data and see recall in action
npx -y @agentmemory/agentmemory@latest demo
```

`demo` створює 3 реалістичні сесії (JWT-автентифікація, виправлення запиту N+1, обмеження частоти запитів) і виконує пошук за ними. Встановлення без ключа вимикають вектори, тому запити за ключовими словами `mem::search` мають спрацьовувати через BM25, тоді як `database performance optimization` може повертати нуль результатів. `smart-search` може додатково повертати структурні збіги графа, якщо дані графа існують. Щоб семантичний запит знаходив виправлення N+1 через вектори, встановіть `EMBEDDING_PROVIDER=local`, перезапустіть і дайте завершитися першому завантаженню моделі.

Відкрийте `http://localhost:3113`, щоб спостерігати за побудовою пам'яті в реальному часі.

### Перевірка чистого встановлення та стійкості після перезапуску

Поки сервер працює, перевірте REST, стан здоров'я, переглядач і статус рантайму на основі iii:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

Панель готовності під час запуску охоплює всі чотири порти: REST/MCP HTTP на 3111, потоки iii на 3112, переглядач на 3113 та WebSocket воркера iii на 49134. `status` підтверджує стан здоров'я agentmemory та активний режим постачальника/ембедингів. Збережіть тестовий запис і перевірте, що його можна знайти:

```bash
curl -fsS -X POST http://localhost:3111/agentmemory/remember \
  -H 'Content-Type: application/json' \
  -d '{"content":"agentmemory restart persistence probe","concepts":["install-check"]}'

curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'Content-Type: application/json' \
  -d '{"query":"restart persistence probe","limit":5}'
```

Потім виконайте `npx -y @agentmemory/agentmemory@latest stop`, знову запустіть канонічну команду в терміналі 1, дочекайтеся `/agentmemory/livez` і повторіть пошук. Тестовий запис має й надалі повертатися. Якщо ви обрали власний `--data-dir`, передайте той самий каталог під час перезапуску.

### Щоденні команди

Встановлення та налаштування описані в розділі [Встановлення](#install) вище (перший запуск проведе вас через цей процес). Щодня:

```bash
agentmemory                    # start the server
agentmemory stop               # stop it cleanly
agentmemory connect <agent>    # wire another agent
agentmemory doctor             # interactive diagnostics + fix prompts
agentmemory remove             # uninstall everything we created
```

### Відтворення сесій

Кожну сесію, яку записує agentmemory, можна відтворити. Відкрийте переглядач, оберіть вкладку **Replay** і прогортайте часову шкалу: промпти, виклики інструментів, результати інструментів і відповіді відображаються як окремі події з керуванням відтворення/паузи, регулюванням швидкості (від 0.5x до 4x) і клавіатурними скороченнями (пробіл — перемкнути, стрілки — покроково).

Щоб імпортувати старіші JSONL-транскрипти Claude Code:

```bash
# Import everything under the default ~/.claude/projects
npx -y @agentmemory/agentmemory@latest import-jsonl

# Or import a single file
npx -y @agentmemory/agentmemory@latest import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

Імпортовані сесії з'являються в переліку Replay поруч із нативними. Під капотом кожен запис проходить через функції iii `mem::replay::load`, `mem::replay::sessions` і `mem::replay::import-jsonl`, без будь-яких побічних серверів. Кожен імпортований транскрипт індексується для пошуку, позначається каналом походження `import` і аналізується для створення кристала сесії та уроків.

> **Важливо, якщо ви покладаєтеся на `import-jsonl` як на основний шлях захоплення:** `cleanupPeriodDays` Claude Code (у `~/.claude/settings.json`, за замовчуванням **30**) автоматично видаляє JSONL-транскрипти, старіші за це вікно, з `~/.claude/projects/`. Якщо ви встановлюєте agentmemory на вже кількамісячну історію Claude Code, усе старіше за 30 днів уже зникло ще до першого імпорту. Або запускайте `import-jsonl` за розкладом (cron), або підвищте `cleanupPeriodDays`, або підключіть хуки автозахоплення (типовий шлях встановлення плагіна), щоб кожен крок потрапляв в agentmemory, поки сесія активна, і очищення JSONL більше не мало значення.

### Оновлення / обслуговування

Використовуйте команду обслуговування, коли ви свідомо хочете оновити свій локальний рантайм:

```bash
npx -y @agentmemory/agentmemory@latest upgrade
```

Попередження: ця команда змінює поточний робочий простір/рантайм. Вона може оновити залежності JavaScript і завантажити закріплений Docker-образ `iiidev/iii:0.22.1`. Вона ніколи не встановлює незакріплений або новіший iii engine.

Деталі реалізації містяться в `src/cli.ts` (див. `runUpgrade` у межах `src/cli.ts:544-595`).

### Claude Code (один блок, вставте як є)

```text
Install agentmemory: run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server and its pinned iii engine. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 17 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 54 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113. Keyless mode disables vectors: `memory_recall` uses BM25, and `memory_smart_search` can also use existing structural graph data. Set `EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env` and restart to opt into on-device semantic recall.
```

#### Claude Code без встановлення плагіна (автономний шлях MCP)

Якщо ви підключаєте MCP-сервер agentmemory напряму через `~/.claude.json`, а не через `/plugin install`, Claude Code ніколи не розгортає `${CLAUDE_PLUGIN_ROOT}`, і вам доведеться вказувати абсолютні шляхи до скриптів хуків у `~/.claude/settings.json`. Ці шляхи, як правило, містять версію agentmemory (наприклад, `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.22/scripts/…`), тому наступне оновлення непомітно зламає кожен хук.

Обхідне рішення:

```bash
agentmemory connect claude-code --with-hooks
```

Ця команда об'єднує ті самі команди хуків у `~/.claude/settings.json`, використовуючи абсолютні шляхи, визначені до вбудованого каталогу `plugin/` наразі встановленого пакета `@agentmemory/agentmemory`. Повторно запустіть команду після оновлення agentmemory, щоб оновити шляхи. Записи користувача в тому самому файлі зберігаються; замінюються лише попередні записи agentmemory. Шлях через `/plugin install` залишається рекомендованим підходом.
Для віддалених або захищених розгортань запускайте Claude Code зі встановленими `AGENTMEMORY_URL` та `AGENTMEMORY_SECRET`. Плагін передає обидва значення своєму вбудованому MCP-серверу; якщо `AGENTMEMORY_URL` порожній, MCP-шим використовує `http://localhost:3111`.

### Codex CLI (платформа плагінів Codex)

```bash
# 1. start the memory server in a separate terminal
npx -y @agentmemory/agentmemory@latest

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Плагін Codex постачається з того самого каталогу `plugin/`, що й плагін Claude Code. Він реєструє:

- Вбудований stdio MCP-мост до запущеного демона, без завантаження через npm і без локального резервного сховища. Див. [локальний посібник Codex](../docs/plugins/codex-local.md), щоб протестувати нерелізну збірку.
- 6 хуків життєвого циклу: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 9 викликаних скілів: `/recall`, `/remember`, `/session-history`, `/forget`, `/recap`, `/handoff`, `/lesson`, `/commit-context`, `/commit-history`, а також 8 довідкових скілів, які агент завантажує за потреби (дисципліна пам'яті, інструменти MCP, REST API, конфігурація, агенти, хуки, архітектура та посібник зі створення скілів)

Механізм хуків Codex вставляє `CLAUDE_PLUGIN_ROOT` у підпроцеси хуків (згідно з [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), тому ті самі скрипти хуків працюють для обох хостів без дублювання. Події Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure доступні лише для Claude Code і не реєструються для Codex.

#### Довіра до хуків Codex та сумісність

Нативна диспетчеризація хуків плагіна підтверджена для Codex CLI 0.150.1. Перш ніж очікувати захоплення, підтвердьте довіру до хуків плагіна. Поведінка Codex Desktop залежить від вбудованого в нього середовища виконання; перевірте `/hooks` і підтвердьте захоплену подію, перш ніж застосовувати обхідне рішення.

Якщо ваш хост вимагає глобальних хуків, продзеркаліть команди у `~/.codex/hooks.json`. Якщо MCP уже підключено, поточному конектору потрібен `--force`, щоб дістатися встановлення хуків:

```bash
agentmemory connect codex --with-hooks --force
```

Це об'єднує глобальні хуки та перезаписує запис MCP agentmemory, зберігаючи незв'язані записи. Перевірте власні налаштування endpoint agentmemory, перш ніж використовувати `--force`. Запустіть повторно після оновлення, щоб оновити шляхи скриптів. Увімкніть або нативні хуки плагіна, або глобальні копії, щоб уникнути дублювання захоплення.

### GitHub Copilot CLI

Для режиму агента VS Code скористайтеся [посібником з MCP та автозахоплення Copilot](../docs/plugins/copilot.md#vs-code-copilot-local-agent-sessions). Конектор CLI не налаштовує VS Code.

```bash
# MCP-only wiring
agentmemory connect copilot-cli

# Альтернативно, повний плагін хуків/скілів з підкаталогу GitHub
copilot plugin install rohitg00/agentmemory:plugin
```

`agentmemory connect copilot-cli` об'єднує `mcpServers.agentmemory` з `~/.copilot/mcp-config.json` (або `$COPILOT_HOME/mcp-config.json`, якщо встановлено `COPILOT_HOME`) і зберігає наявні сервери. У нативному Windows це єдиний автоматизований адаптер `connect`; усіх інших нативних агентів Windows потрібно налаштовувати вручну. `connect` у WSL підтримується лише тоді, коли цільовий агент встановлено в тому самому середовищі WSL. Copilot підхоплює MCP-сервер під час наступного запуску або після `/mcp`. Встановіть також плагін, якщо хочете отримати повний досвід роботи з хуками/скілами.

<details>
<summary><b>OpenClaw (вставте цей промпт)</b></summary>

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

Повний посібник: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (вставте цей промпт)</b></summary>

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

Повний посібник: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Інші агенти

Запустіть сервер пам'яті: `npx -y @agentmemory/agentmemory@latest`

#### Нативні скіли через `npx skills add` (50+ агентів)

agentmemory постачає 17 скілів у форматі `<dir>/SKILL.md` у стилі Claude Code: 9 викликаних скілів-дій (`remember`, `recall`, `recap`, `handoff`, `forget`, `lesson`, `commit-context`, `commit-history`, `session-history`) і 8 довідкових скілів, які агент завантажує за потреби (`memory-discipline`, `agentmemory-mcp-tools`, `agentmemory-rest-api`, `agentmemory-config`, `agentmemory-agents`, `agentmemory-hooks`, `agentmemory-architecture`, `write-agentmemory-skill`). Довідкові скіли містять таблиці даних, згенеровані з джерела, тому вони ніколи не розходяться з ним. CLI [`skills`](https://npmjs.com/package/skills) від vercel-labs автоматично встановлює їх у нативний каталог скілів агента, що викликає, для понад 50 агентів (Claude Code, Cursor, Cline, Continue, Droid, Warp, Codex, Antigravity, Kiro, OpenCode, Goose, Roo, Trae, Windsurf та інших):

```bash
npx skills add rohitg00/agentmemory -y          # auto-detects the calling agent
npx skills add rohitg00/agentmemory -y -a warp  # explicit agent
npx skills add rohitg00/agentmemory -y -a '*'   # install to every installed agent
```

Це **доповнює** `agentmemory connect <agent>`:

- `agentmemory connect <agent>` записує конфігурацію MCP-сервера, щоб інструменти стали доступними.
- `npx skills add rohitg00/agentmemory` встановлює скіли, щоб агент знав, коли їх викликати.

Для декількох агентів, які CLI skills ще не підтримує (Zed v1.3.x і нижче), розмістіть 17 файлів SKILL.md у нативному каталозі скілів агента самостійно; той самий формат працює всюди.

#### Стандартний блок MCP

Запис agentmemory — це **той самий блок MCP-сервера** для кожного хоста, що використовує структуру `mcpServers` (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI, OpenClaw):

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

**Об'єднайте цей запис із наявним об'єктом `mcpServers`** у конфігураційному файлі хоста; не замінюйте файл повністю. Якщо файл уже містить інші сервери, додайте `agentmemory` поруч як ще один ключ усередині `mcpServers`. Якщо `mcpServers` взагалі відсутній, вставте блок усередину `{ "mcpServers": { ... } }`. Заповнювачі `${VAR}` успадковують `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` з оболонки під час запуску MCP-сервера; невстановлені змінні передають порожні рядки, і шим переходить на `http://localhost:3111`. Один підключений запис охоплює як локальні, так і віддалені (k8s / за реверс-проксі) розгортання.

| Агент | Конфігураційний файл | Примітки |
|---|---|---|
| **Cursor (лише MCP)** | `~/.cursor/mcp.json` | Об'єднайте з `mcpServers`, або скористайтеся `agentmemory connect cursor`. На сайті також доступне глибоке посилання в один клік. |
| **Cursor (повний плагін)** | `.cursor-plugin/` | Запис у Cursor Marketplace (на розгляді) або Cursor Settings → Plugins → локальний checkout. Реєструє 7 хуків автозахоплення (sessionStart, beforeSubmitPrompt, preToolUse, postToolUse, postToolUseFailure, stop, sessionEnd) + 17 скілів + MCP-сервер, із `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET`, керованими в панелі плагінів Cursor. Працює в Cursor IDE та CLI `cursor-agent`; промпти режиму print у CLI доповнюються з транскрипту сесії в кінці сесії. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Об'єднайте з `mcpServers`. Перезапустіть Claude Desktop після редагування. |
| **Cline / Roo Code / Kilo Code** | Налаштування MCP Cline (Settings UI → MCP Servers → Edit) | Той самий блок `mcpServers`. |
| **Devin CLI (MCP + хуки)** | `~/.config/devin/config.json` | `agentmemory connect devin` об'єднує запис MCP; `--with-hooks` додає шість нативних хуків автозахоплення (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd) із відповідниками інструментів Devin у нижньому регістрі. Перевірте за допомогою `devin mcp list` та `/hooks` усередині devin. |
| **Devin CLI (повний плагін)** | `plugin/.devin-plugin/` | `devin plugins install ./plugin` з checkout реєструє всі 17 скілів як слеш-команди `/agentmemory:<skill>` разом із MCP-сервером. Хуки плагіна Devin не можуть викликати `SessionStart`/`SessionEnd`, тому поєднуйте це з `connect devin --with-hooks` для повного захоплення сесії. |
| **Devin (хмара)** | Settings → Connections → MCP servers | Додайте власний MCP (STDIO): команда `npx`, аргументи `-y @agentmemory/mcp@latest`, змінна середовища `AGENTMEMORY_URL`, що вказує на доступне в мережі розгортання agentmemory, плюс `AGENTMEMORY_SECRET` (хмарні сесії не можуть дістатися localhost — див. [`deploy/`](../deploy/)). Збережіть секрет у Devin Secrets, потім скористайтеся «Test listing tools», щоб перевірити появу всіх 54 інструментів. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (об'єднує автоматично). |
| **GitHub Copilot CLI (лише MCP)** | `~/.copilot/mcp-config.json` | `agentmemory connect copilot-cli` об'єднує `mcpServers.agentmemory`; Copilot підхоплює це під час наступного запуску або через `/mcp`. |
| **GitHub Copilot CLI (повний плагін)** | Встановлення плагіна Copilot | `copilot plugin install rohitg00/agentmemory:plugin` для плагіна з підкаталогу GitHub. |
| **OpenClaw** | Конфігурація MCP OpenClaw | Той самий блок `mcpServers`. Глибше: `openclaw plugins install ./integrations/openclaw` займає слот пам'яті OpenClaw (автоматично перемикається з `memory-core`); встановіть `plugins.entries.agentmemory.hooks.allowConversationAccess=true`, інакше захоплення кроків буде непомітно блокуватися. Див. [`integrations/openclaw`](../integrations/openclaw/). |
| **Codex CLI (лише MCP)** | `.codex/config.toml` | Формат TOML: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, або додайте `[mcp_servers.agentmemory]` вручну. |
| **Codex CLI (повний плагін)** | Marketplace плагінів Codex | `codex plugin marketplace add rohitg00/agentmemory`, потім `codex plugin add agentmemory@agentmemory`. Реєструє MCP + 6 хуків життєвого циклу + 17 скілів. Підтвердьте довіру до хуків і перевірте захоплення на вашому хості; див. [налаштування та перевірку Codex](../docs/plugins/codex-local.md). |
| **OpenCode (лише MCP)** | `opencode.json` | Інший формат: ключ `mcp` на верхньому рівні, команда у вигляді масиву: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (повний плагін)** | `plugin/opencode/` | 22 хуки автозахоплення, що охоплюють життєвий цикл сесії, повідомлення, інструменти, помилки. Атрибуція проєкту відбувається для кожної сесії окремо, тому один процес OpenCode, що охоплює декілька репозиторіїв, фіксує кожну сесію під власним проєктом. Дві слеш-команди (`/recall`, `/remember`). Скопіюйте `plugin/opencode/` у ваш робочий простір OpenCode і додайте запис плагіна до `opencode.json`. Повну таблицю хуків + аналіз прогалин див. у [`plugin/opencode/README.md`](../plugin/opencode/README.md). |
| **pi** | `~/.pi/agent/extensions/agentmemory` | `agentmemory connect pi` встановлює вбудоване розширення в каталог автовиявлення pi (пригадування на старті агента, захоплення в кінці роботи агента, інструменти `memory_search` / `memory_save` / `memory_health`, `/agentmemory-status`). `/reload` у запущеному pi підхоплює це. [`integrations/pi`](../integrations/pi/) — це також пакет pi (`pi install ./integrations/pi` з checkout). |
| **Hermes Agent** | `~/.hermes/config.yaml` | `cp -r integrations/hermes ~/.hermes/plugins/agentmemory` + `memory.provider: agentmemory` дає постачальника пам'яті з 6 хуками (попереднє отримання, захоплення кроку, завершення сесії, передстиснення, дзеркалювання MEMORY.md, блок системного промпту). Перевірте за допомогою `hermes plugins doctor` та `hermes memory status`. Див. [`integrations/hermes`](../integrations/hermes/). |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` записує стандартний блок `mcpServers`. Корисне навантаження хука сумісне за полями з Claude Code, тому наявні скрипти для 12 хуків працюють без змін; підключіть їх через розділ `hooks` у тому самому `settings.json`. |
| **Antigravity IDE / 2.0** | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity --with-hooks` встановлює MCP і хуки захоплення у спільному каталозі налаштувань. Див. [налаштування та обмеження Antigravity](../docs/plugins/antigravity.md). |
| **Antigravity CLI** (`agy`) | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity-cli --with-hooks` використовує ту саму конфігурацію MCP і хуків, що й поточні версії IDE. Наявні встановлення слід оновити за допомогою `--force`; див. [примітки щодо оновлення](../docs/plugins/antigravity.md). |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` записує конфігурацію рівня користувача. Перевизначення на рівні робочого простору розміщуються в `.kiro/settings/mcp.json` поруч із вашим кодом. |
| **Warp** | `~/.warp/.mcp.json` | `agentmemory connect warp` записує стандартний блок `mcpServers`. Warp також автоматично виявляє скіли з `.claude/skills/`; після встановлення плагіна Claude Code 8 скілів agentmemory (`remember`, `recall`, `recap`, `handoff`, `forget`, `commit-context`, `commit-history`, `session-history`) з'являються нативно в палітрі слеш-команд Warp. |
| **Cline (CLI)** | `~/.cline/mcp.json` | `agentmemory connect cline` записує стандартний блок `mcpServers`. Користувачі розширення VS Code: вставте той самий блок через Cline Settings → MCP Servers → Edit JSON. |
| **Continue.dev** | `~/.continue/config.yaml` (бажано) або `config.json` (застарілий) | `agentmemory connect continue` створює `config.yaml` з нуля, якщо жоден з файлів не існує, або змінює наявний `config.json`. **Якщо у вас уже є `config.yaml`**, адаптер виводить точний блок для вставки під `mcpServers:`; він не перезаписує ваш yaml непомітно, тому що безпечне збереження коментарів і якорів потребує парсера YAML, якого немає в пакеті. Continue використовує для `mcpServers` форму масиву (а не об'єкта). |
| **Zed** | `~/.config/zed/settings.json` | `agentmemory connect zed` записує дані під `context_servers` (ключ Zed, НЕ `mcpServers`). Віддалені MCP-сервери замість цього можна підключити через `{"url": "..."}`. |
| **Droid (Factory.ai)** | `~/.factory/mcp.json` | `agentmemory connect droid` записує стандартний блок `mcpServers`. Перевизначення на рівні проєкту розміщуються в `<repo>/.factory/mcp.json`. Передайте `--with-hooks` для нативного автозахоплення. |
| **DeepSeek Harness** | `$DSH_HOME/cordis.patch.yml` | `agentmemory connect dsh` додає рядок `@deepseek-ai/dsh-mcp-client` до шару патчів рівня home, який завантажує кожен профіль Harness; інструменти реєструються як `mcp__agentmemory__*`. Передайте `--with-hooks`, щоб також підключити автозахоплення: вбудовані скрипти хуків Claude Code працюють через власний місток Harness `@deepseek-ai/dsh-hooks-claude-code` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) через маніфест, записаний у `$DSH_HOME/agentmemory.hooks.json`. За замовчуванням використовує `~/.dsh`, якщо `DSH_HOME` не встановлено. |
| **Goose** | Інтерфейс налаштувань MCP Goose | Той самий блок `mcpServers`; скористайтеся `goose configure` → Add Extension → MCP. Пряме редагування YAML у `~/.config/goose/config.yaml` підтримується, але схема використовує `extensions:` + `cmd` (а не `mcpServers:` + `command`). |
| **Aider** | н/д | Звертайтеся напряму до REST API: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`. |
| **Будь-який агент (32+)** | н/д | `npx skillkit install agentmemory` автоматично визначає хост і об'єднує конфігурацію. |

**MCP-клієнти в sandbox** (Flatpak / Snap / обмежувальні контейнери), які не можуть дістатися `localhost` хоста: також встановіть `"AGENTMEMORY_FORCE_PROXY": "1"` у блоці `env` та вкажіть у `AGENTMEMORY_URL` маршрут, якого sandbox справді може досягти (наприклад, вашу IP-адресу в LAN).

### Програмний доступ (Python / Rust / Node)

agentmemory реєструє свої основні операції як функції iii (`mem::remember`, `mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). Будь-яка мова з iii SDK може викликати їх безпосередньо через `ws://localhost:49134`, без окремого REST-клієнта для кожної мови.

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

Готовий приклад: [`examples/python/`](../examples/python/) (швидкий старт + потік спостереження/пригадування). REST на `:3111` залишається доступним для хостів без рантайму iii.

### Зі джерельного коду

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

Це запускає agentmemory з локальним `iii-engine`, якщо закріплений бінарний файл уже встановлено, або використовує Docker Compose, якщо його обрано. REST, потоки та переглядач за замовчуванням прив'язуються до `127.0.0.1`. Автоматичний шлях встановлення бінарного файлу на macOS/Linux вимагає `curl`, POSIX `sh` та `tar`.

Встановіть `iii-engine` вручну. **agentmemory наразі закріплений за `iii-engine` версії `v0.22.1`**, тим самим релізом, що й залежність `iii-sdk`; воркер розмовляє протоколом саме цього двигуна, а 0.20.0 реорганізував поверхню SDK, тому ці дві версії рухаються разом у релізах agentmemory. Перевизначте за допомогою `AGENTMEMORY_III_VERSION=<version>`, якщо ви запускаєте власний двигун і знаєте, що він відповідає.

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSLo iii.tar.gz https://github.com/iii-hq/iii/releases/download/iii/v0.22.1/iii-aarch64-apple-darwin.tar.gz && echo "2b309019b909a896cae874dc947e2cdf877b4f3c51dd026b79850af858517fa4  iii.tar.gz" | shasum -a 256 -c - && tar -xzf iii.tar.gz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** замініть `aarch64-apple-darwin` на `x86_64-apple-darwin`
- **Linux x64:** замініть на `x86_64-unknown-linux-gnu`
- **Linux arm64:** замініть на `aarch64-unknown-linux-gnu`
- **Windows:** завантажте `iii-x86_64-pc-windows-msvc.zip` з [релізів iii-hq/iii v0.22.1](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.22.1) і розпакуйте `iii.exe` у `%USERPROFILE%\.agentmemory\bin\iii.exe`

Кожен архів має відповідний файл `.sha256` на сторінці релізу; коли ви змінюєте платформу, використовуйте хеш із цього файлу в перевірці вище (на Windows: `Get-FileHash`). Автоматичний встановлювач у `npx @agentmemory/agentmemory` закріплює ці хеші і відмовляється від архіву, який не відповідає.

Або скористайтеся Docker (вбудований `docker-compose.yml` завантажує `iiidev/iii:0.22.1`). Повна документація: [iii.dev/docs](https://iii.dev/docs).

### Windows

agentmemory працює на Windows 10/11, але самого пакета Node.js недостатньо; вам також потрібен закріплений рантайм iii-engine v0.22.1 як фоновий процес. CLI не розпаковує Windows ZIP автоматично, тому користувачі нативного Windows мають встановити `iii.exe` вручну, скористатися WSL2 або обрати Docker Desktop.

Автоматизоване підключення MCP у нативному Windows підтримує лише `agentmemory connect copilot-cli`. Для Claude Code, Codex, Cursor та будь-якого іншого нативного агента Windows скопіюйте ручний блок MCP з розділу [Інші агенти](#other-agents) у конфігурацію цього агента на Windows. Запуск `connect` у WSL доречний лише тоді, коли цільовий агент також встановлено в тому самому середовищі WSL; він не редагує конфігурацію агента, що працює на хості Windows.

**Варіант A: готовий бінарний файл для Windows (рекомендовано)**

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

**Варіант B: Docker Desktop**

```powershell
# 1. Install Docker Desktop for Windows
# 2. Start Docker Desktop and make sure the engine is running
# 3. Select Docker explicitly and run agentmemory:
$env:AGENTMEMORY_USE_DOCKER = "1"
npx -y @agentmemory/agentmemory@latest
```

**Варіант C: лише автономний MCP (без двигуна).** Якщо вам потрібні лише інструменти MCP для вашого агента і не потрібні REST API, переглядач або завдання cron, повністю обійдіться без двигуна:

```powershell
npx -y @agentmemory/agentmemory@latest mcp
# or via the shim package:
npx -y @agentmemory/mcp
```

**Діагностика для Windows:** якщо `npx -y @agentmemory/agentmemory@latest` завершується помилкою, повторно запустіть з `--verbose`, щоб побачити фактичний stderr двигуна. Поширені режими відмов:

| Симптом | Виправлення |
|---|---|
| `The engine process started but the REST API never responded.` | Переконайтеся, що всі чотири похідні порти вільні, перевірте, що закріплений `iii.exe` не завершився, потім повторно запустіть з `--verbose` і перегляньте захоплений stderr двигуна |
| `Could not start iii-engine` | Не встановлено ні `iii.exe`, ні Docker. Див. варіант A або B вище |
| Конфлікт порту | `netstat -ano \| findstr :3111`, щоб побачити, що зайняте, потім завершіть цей процес або скористайтеся `--port <N>` |
| Резервний варіант Docker пропущено, навіть якщо Docker встановлено | Переконайтеся, що Docker Desktop справді запущено (значок у треї) |

> Примітка: iii **engine** — це готовий бінарний файл, а не cargo crate, тож не намагайтеся виконати для нього `cargo install`. (iii **SDK** опубліковані на crates.io, npm та PyPI, але agentmemory вони не потрібні.) Усі підтримувані способи встановлення двигуна закріплені за v0.22.1: готовий бінарний файл вище, шлях автовстановлення agentmemory для macOS/Linux (потрібні `curl`, POSIX `sh` та `tar`) та Docker-образ `iiidev/iii:0.22.1`. Звичайний `install.sh | sh` з основного репозиторію встановлює найновіший двигун, який agentmemory не підтримує. Використовуйте `npx -y @agentmemory/agentmemory@latest`; на macOS/Linux ця команда завантажує закріплений двигун у `~/.agentmemory/bin`.

---

<h2 id="deploy">Розгортання</h2>

Шаблони в один клік для керованих хостів. Кожен із них постачається із
самодостатнім Dockerfile, який завантажує `@agentmemory/agentmemory` з npm і копіює
бінарний файл двигуна iii з офіційного образу Docker Hub `iiidev/iii`;
заздалегідь зібраний образ agentmemory не потрібен. Постійне сховище
монтується в `/data`; точка входу першого завантаження перезаписує
вбудовану в npm-пакет конфігурацію iii (яка прив'язується до
`127.0.0.1`) налаштованою для розгортання версією, що прив'язується до
`0.0.0.0` та використовує абсолютні шляхи `/data`, генерує секрет HMAC,
а потім знижує привілеї з `root` до `node` через
`gosu` перед виконанням CLI agentmemory.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Розгорнути на fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Розгорнути на Railway" /></a>
</p>

Кнопка розгортання в один клік для Render вимагає `render.yaml` у корені репозиторію, який ми свідомо тримаємо чистим. Скористайтеся процесом Render Blueprint, описаним у [`deploy/render/`](.././deploy/render/README.md), щоб вручну вказати на blueprint усередині репозиторію.

Повні деталі налаштування (захоплення HMAC, SSH-тунель для переглядача, ротація, резервне копіювання,
мінімальна вартість) містяться в [`deploy/`](.././deploy/README.md):

- [`deploy/fly`](.././deploy/fly/README.md): одна машина з
  `auto_stop_machines = "stop"`; найдешевший варіант у режимі очікування.
- [`deploy/railway`](.././deploy/railway/README.md): фіксована плата тарифу Hobby,
  том у панелі керування.
- [`deploy/render`](.././deploy/render/README.md): процес Blueprint,
  автоматичні знімки диска на платних тарифах.
- [`deploy/coolify`](.././deploy/coolify/README.md): самостійний хостинг на
  власному VPS через [Coolify](https://coolify.io/self-hosted); той самий Docker
  Compose-стек, хост і дані залишаються у вас.

Публікується лише порт `3111`. Переглядач на `3113` стає
прив'язаним до loopback усередині контейнера; README кожного шаблону документує
схему SSH-тунелю для доступу до нього.

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Чому agentmemory" height="32" /></picture></h2>

Кожен агент кодування забуває все, коли сесія закінчується, і кожна нова сесія починається з того, що ви повторно пояснюєте свій стек. agentmemory працює у фоновому режимі і усуває цей крок.

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

### Порівняно з вбудованою пам'яттю агента

Кожен AI-агент кодування постачається з вбудованою пам'яттю: у Claude Code є `MEMORY.md`, у Cursor — notepads, у Cline — memory bank. Вони працюють як стікери-нагадування. agentmemory — це база даних із можливістю пошуку, що стоїть за цими стікерами.

| | Вбудована (CLAUDE.md) | agentmemory |
|---|---|---|
| Масштаб | Обмеження 200 рядків | Без обмежень |
| Пошук | Завантажує все у контекст | BM25 + вектор + граф (лише топ-K) |
| Вартість у токенах | 22K+ при 240 спостереженнях | ~1,900 токенів (на 92% менше) |
| Між агентами | Файли для кожного агента | MCP + REST (будь-який агент) |
| Координація | Немає | Оренди, сигнали, дії, рутини |
| Спостережуваність | Читання файлів вручну | Переглядач у реальному часі на :3113 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="Як це працює" height="32" /></picture></h2>

### Конвеєр пам'яті

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

### 4-рівнева консолідація пам'яті

Побудовано за зразком того, як людський мозок обробляє пам'ять, включно з консолідацією під час сну.

| Рівень | Що | Аналогія |
|------|------|---------|
| **Робочий (Working)** | Необроблені спостереження з використання інструментів | Короткочасна пам'ять |
| **Епізодичний (Episodic)** | Стиснуті підсумки сесій | «Що сталося» |
| **Семантичний (Semantic)** | Видобуті факти та закономірності | «Що я знаю» |
| **Процедурний (Procedural)** | Робочі процеси та шаблони рішень | «Як це робити» |

Пам'ять згасає з часом (крива Еббінгауза). Часто використовувана пам'ять зміцнюється. Застарілі записи пам'яті автоматично витісняються. Суперечності виявляються й вирішуються.

### Що фіксується

| Хук | Фіксує |
|------|----------|
| `SessionStart` | Шлях до проєкту, ID сесії |
| `UserPromptSubmit` | Промпти користувача (з фільтром приватності) |
| `PreToolUse` | Шаблони доступу до файлів + збагачений контекст |
| `PostToolUse` | Назву інструменту, вхідні та вихідні дані |
| `PostToolUseFailure` | Контекст помилки |
| `PreCompact` | Повторно вставляє пам'ять перед компактуванням |
| `SubagentStart/Stop` | Життєвий цикл субагента |
| `Stop` | Підсумок завершення сесії |
| `SessionEnd` | Маркер завершення сесії |

### Ключові можливості

| Можливість | Опис |
|---|---|
| **Автоматичне захоплення** | Кожне використання інструменту записується через хуки, без ручних дій |
| **Семантичний пошук** | BM25 + вектор + граф знань зі злиттям RRF |
| **Еволюція пам'яті** | Версіювання, заміщення, графи зв'язків |
| **Гігієна пригадування** | Заміщені версії пам'яті зникають з пошукових індексів; ланцюжок версій у KV зберігає повну історію |
| **Підказки про близькі дублікати** | Збереження повідомляє про рекомендаційний збіг `similarTo`, коли новий контент сильно нагадує наявну пам'ять |
| **Скоупінг для кожного агента** | `agentId` проходить через збереження та пригадування в REST, MCP та пошуковому індексі, у спільному або ізольованому режимі |
| **Походження на момент запису** | Кожне спостереження та запис пам'яті несе незмінний канал походження (користувач, агент, інструмент, імпорт або спільний доступ), зафіксований під час захоплення, збереження та імпорту |
| **Автозабування** | Закінчення TTL, виявлення суперечностей, витіснення за важливістю |
| **Приватність понад усе** | API-ключі, секрети, теги `<private>` видаляються перед збереженням |
| **Самовідновлення** | Circuit breaker, ланцюжок резервних постачальників, моніторинг стану |
| **Місток до Claude** | Двостороння синхронізація з MEMORY.md |
| **Граф знань** | Видобування сутностей + обхід у ширину (BFS) |
| **Командна пам'ять** | Спільна + приватна пам'ять з просторами імен для членів команди |
| **Походження цитат** | Простежуйте будь-яку пам'ять до вихідних спостережень |
| **Знімки Git** | Версіювання, відкат і diff стану пам'яті |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Пошук" height="32" /></picture></h2>

Потрійний потік пошуку, що поєднує три сигнали:

| Потік | Що робить | Коли |
|---|---|---|
| **BM25** | Пошук за ключовими словами зі стеммінгом та розширенням синонімів | Завжди активний |
| **Вектор** | Косинусна подібність для щільних ембедингів | Налаштовано постачальника ембедингів |
| **Граф** | Обхід графа знань через збіг сутностей | У запиті виявлено сутності |

Об'єднується за допомогою Reciprocal Rank Fusion (RRF, k=60) і диверсифікується за сесіями (максимум 3 результати на сесію).

Коли векторний індекс заповнено, `mem::search` (що стоїть за `memory_recall`) використовує гібридний ранжувальник BM25 + вектор. Без ембедингів він використовує BM25. `smart-search` може додатково об'єднувати структурні збіги графа, якщо дані графа існують, зокрема в режимі без ключа. Пригадування уроків виконується на окремому BM25-індексі в пам'яті, а не шляхом сканування всього корпусу під час кожного запиту. Заміщені версії пам'яті виключаються з усіх шляхів пригадування; ланцюжок версій зберігає їхню історію.

Вектори переживають збій або примусове завершення. Векторний індекс зберігається пакетами не частіше, ніж кожні `AGENTMEMORY_INDEX_SAVE_INTERVAL_MS` (10 хвилин). Кожен вектор, доданий або видалений у проміжку, також відразу записується у невеликий журнал очікування в хранилищі стану, і наступний запуск відтворює його без звернення до постачальника ембедингів. Кожне успішне збереження очищає журнал. Документи, які все ще не мають вектора після відтворення, повторно ембедяться у фоновому режимі партіями по `AGENTMEMORY_VECTOR_BACKFILL_MAX` (500), доки не залишиться жодного, а зупинене доповнення продовжується з наступного запуску. `/agentmemory/status` і переглядач показують розмір журналу очікування та стан доповнення. Встановлення без ключа нічого не записують.

BM25 одразу токенізує грецьку, кирилицю, іврит, арабську та латиницю з діакритикою. Для пам'яті китайською / японською / корейською встановіть опційні сегментатори (`npm install @node-rs/jieba tiny-segmenter`), щоб розбивати послідовності CJK на токени рівня слів; без них agentmemory плавно переходить на токенізацію цілими послідовностями та одноразово виводить підказку в stderr.

### Постачальники ембедингів

Встановлення без ключа вимикають векторні ембединги: `mem::search` використовує BM25, тоді як `smart-search` також може використовувати наявні структурні дані графа. Щоб безкоштовно підключити семантичні ембединги на пристрої, додайте це до `~/.agentmemory/.env` і перезапустіть agentmemory:

```env
EMBEDDING_PROVIDER=local
```

Звичайне встановлення npm включає опційний рантайм `@huggingface/transformers`. Перший запит ембединга завантажує `Xenova/all-MiniLM-L6-v2`, тому потребує доступу до мережі й може займати більше часу; подальші обчислення виконуються на пристрої. Віддалені постачальники автоматично визначаються за їхніми ключами, якщо `EMBEDDING_PROVIDER` не перевизначає їх.

| Постачальник | Модель | Вартість | Примітки |
|---|---|---|---|
| **Локальний (рекомендоване підключення)** | `all-MiniLM-L6-v2` | Безкоштовно | На пристрої після першого завантаження моделі, +8пп до пригадування порівняно з лише BM25 |
| Gemini | `gemini-embedding-001` | Безкоштовний тариф | 100+ мов, 768/1536/3072 вимірів (MRL), вхід до 2048 токенів. Замінює `text-embedding-004` ([застаріла, вимкнення 14 січня 2026](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | Найвища якість |
| Voyage AI | `voyage-code-3` | Платно | Оптимізовано для коду |
| Cohere | `embed-english-v3.0` | Безкоштовна пробна версія | Загального призначення |
| OpenRouter | Будь-яка модель | Залежить | Проксі для декількох моделей |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP-сервер" height="32" /></picture></h2>

54 інструменти, 6 ресурсів, 3 промпти та 17 скілів.

> **MCP-шим проти повного сервера:** опублікований пакет `@agentmemory/mcp` — це тонкий шим. Він надає повну поверхню з 54 інструментів **лише тоді, коли може дістатися запущеного сервера agentmemory** через `AGENTMEMORY_URL` (режим проксі). Якщо жоден сервер недоступний, шим переходить на локальний набір із 7 інструментів (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). Змінна середовища `AGENTMEMORY_TOOLS=core|all` — це прапорець *на боці сервера*; встановлення його в блоці `env` шима не має ефекту. Якщо ви бачите лише 7 інструментів у Cursor / OpenCode / Gemini CLI, запустіть `npx -y @agentmemory/agentmemory@latest` (або стек Docker) і встановіть `AGENTMEMORY_URL=http://localhost:3111`.

### 54 інструменти

Три поверхні інструментів, від найменшої до найбільшої: `AGENTMEMORY_TOOLS=core` обмежує видимість до 8 основних (`memory_save`, `memory_recall`, `memory_consolidate`, `memory_smart_search`, `memory_sessions`, `memory_diagnose`, `memory_lesson_save`, `memory_reflect`); базовий набір нижче — це 14 фундаментальних інструментів реєстру; типовий режим (`AGENTMEMORY_TOOLS=all`) надає всі 54.

<details>
<summary>Базові інструменти (14)</summary>

| Інструмент | Опис |
|------|-------------|
| `memory_recall` | Пошук минулих спостережень |
| `memory_compress_file` | Стиснення markdown-файлів зі збереженням структури |
| `memory_save` | Збереження інсайту, рішення або шаблону |
| `memory_file_history` | Минулі спостереження щодо конкретних файлів |
| `memory_patterns` | Виявлення повторюваних шаблонів |
| `memory_sessions` | Перелік останніх сесій |
| `memory_smart_search` | Гібридний семантичний + ключовий пошук |
| `memory_vision_search` | Пошук спостережень із зображеннями |
| `memory_timeline` | Хронологічні спостереження |
| `memory_profile` | Профіль проєкту (концепти, файли, шаблони) |
| `memory_export` | Експорт усіх даних пам'яті |
| `memory_relations` | Запит графа зв'язків |
| `memory_commit_lookup` | Сесії, що стоять за git-комітом |
| `memory_commits` | Коміти, записані для сесії |

</details>

<details>
<summary>Розширені інструменти (54 загалом, типова поверхня)</summary>

| Інструмент | Опис |
|------|-------------|
| `memory_patterns` | Виявлення повторюваних шаблонів |
| `memory_timeline` | Хронологічні спостереження |
| `memory_relations` | Запит графа зв'язків |
| `memory_graph_query` | Обхід графа знань |
| `memory_consolidate` | Запуск 4-рівневої консолідації |
| `memory_claude_bridge_sync` | Синхронізація з MEMORY.md |
| `memory_team_share` | Поширення серед членів команди |
| `memory_team_feed` | Останні спільні елементи |
| `memory_audit` | Журнал аудиту операцій |
| `memory_governance_delete` | Видалення з журналом аудиту |
| `memory_snapshot_create` | Знімок із версіюванням Git |
| `memory_action_create` | Створення робочих елементів із залежностями |
| `memory_action_update` | Оновлення статусу дії |
| `memory_frontier` | Неблоковані дії, ранжовані за пріоритетом |
| `memory_next` | Єдина найважливіша наступна дія |
| `memory_lease` | Ексклюзивні оренди дій (мультиагентність) |
| `memory_routine_run` | Інстанціювання рутин робочого процесу |
| `memory_signal_send` | Обмін повідомленнями між агентами |
| `memory_signal_read` | Читання повідомлень із підтвердженнями |
| `memory_checkpoint` | Зовнішні умовні ворота |
| `memory_mesh_sync` | P2P-синхронізація між інстансами |
| `memory_sentinel_create` | Вартові на основі подій |
| `memory_sentinel_trigger` | Зовнішнє спрацювання вартових |
| `memory_sketch_create` | Ефемерні графи дій |
| `memory_sketch_promote` | Підвищення до постійного стану |
| `memory_crystallize` | Компактування ланцюжків дій |
| `memory_diagnose` | Перевірки стану здоров'я |
| `memory_heal` | Автовиправлення застряглого стану |
| `memory_facet_tag` | Теги вимір:значення |
| `memory_facet_query` | Запит за фасетними тегами |
| `memory_verify` | Простеження походження |

</details>

### 6 ресурсів · 3 промпти · 17 скілів

| Тип | Назва | Опис |
|------|------|-------------|
| Ресурс | `agentmemory://status` | Стан здоров'я, кількість сесій, кількість записів пам'яті |
| Ресурс | `agentmemory://project/{name}/profile` | Аналітика для конкретного проєкту |
| Ресурс | `agentmemory://project/{name}/recent` | Останні спостереження для проєкту |
| Ресурс | `agentmemory://memories/latest` | 10 останніх активних записів пам'яті |
| Ресурс | `agentmemory://graph/stats` | Статистика графа знань |
| Ресурс | `agentmemory://team/{id}/profile` | Спільний командний профіль |
| Промпт | `recall_context` | Пошук + повернення контекстних повідомлень |
| Промпт | `session_handoff` | Передача даних між агентами |
| Промпт | `detect_patterns` | Аналіз повторюваних шаблонів |
| Скіл | `/recall` | Пошук у пам'яті |
| Скіл | `/remember` | Збереження в довгострокову пам'ять |
| Скіл | `/session-history` | Підсумки останніх сесій |
| Скіл | `/forget` | Видалення спостережень/сесій |

У таблиці показано чотири основні скіли. Повний набір — це 9 викликаних скілів плюс 8 довідкових скілів; див. розділ про нативні скіли вище.

### Автономний MCP

Запуск без повного сервера, для будь-якого MCP-клієнта. Працює будь-який із варіантів:

```bash
npx -y @agentmemory/agentmemory@latest mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

Або додайте до конфігурації MCP вашого агента:

Більшість агентів (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI):
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

Об'єднайте запис `agentmemory` з наявним об'єктом `mcpServers` вашого хоста, а не замінюйте файл. Для клієнтів у sandbox, які не можуть дістатися `localhost` хоста, додайте `"AGENTMEMORY_FORCE_PROXY": "1"` до блоку env та встановіть у `AGENTMEMORY_URL` маршрут, до якого sandbox може дістатися.

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

Скопіюйте файл плагіна з репозиторію:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Переглядач у реальному часі" height="32" /></picture></h2>

Автоматично запускається на порту `3113`. Переглядач завантажує один знімок під час підключення (`GET /agentmemory/viewer/snapshot`), а потім застосовує події живого потоку: нові записи пам'яті, уроки, спостереження, записи аудиту, зміни графа та оновлення стану здоров'я з'являються без опитування чи перезавантаження сторінки. Інші запити — лише ті дії, які ви клацаєте, сторінки «завантажити ще» та пошукові запити. Коли потік перериваться, переглядач показує, наскільки застарілими є його дані, перепідключається з наростанням інтервалу (backoff) і повторно синхронізується з одного знімка.

- **12 вкладок у чотирьох групах** із показниками в реальному часі, глибокими посиланнями (`#memories/<id>`, `#sessions/<id>?obs=<id>`, `#graph/<id>`, `#health/consolidation`), клавіатурними скороченнями та мобільним меню.
- **Memories (Пам'ять):** пошук на стороні сервера, фільтри за проєктом, агентом і типом, панель деталей із ланцюжком версій і порівнянням слів, посилання на походження, кнопки копіювання для id, виклику MCP та команди curl, редагування (нова версія), забування з підтвердженням, масове забування та експорт у JSON.
- **Sessions (Сесії):** вбудована часова шкала спостережень із читабельними вхідними та вихідними даними інструментів, фільтри та пагінація, а також записи пам'яті та уроки, створені кожною сесією.
- **Graph (Граф):** пошук, деталі вузла зі зв'язками та джерелами, легенда, що не покладається лише на колір, та керування масштабом.
- **Health (Стан здоров'я):** жива версія `GET /agentmemory/status`. Кожна проблема супроводжується своїм виправленням, а також бекендом стану, станом збереження індексу, прогресом компактування походження графа та поясненням консолідації з реальними порогами.
- Сторінки **Audit (Аудит), Activity (Активність), Profile (Профіль), Replay (Відтворення), Lessons (Уроки), Actions (Дії) та Crystals (Кристали)**, кожна з порожнім станом, що пояснює, що це за розділ, чому він порожній і яка команда заповнить його, а також підказка-глосарій `?` для кожного терміну і числа.

```bash
open http://localhost:3113
```

Сервер переглядача за замовчуванням прив'язується до `127.0.0.1` і додає серверний секрет, коли переадресовує запити до REST API, тож він не потребує налаштування. Ендпоінт `/agentmemory/viewer`, що обслуговується через REST, дотримується звичайних правил bearer-токена і переспрямовує браузери без токена на порт переглядача. Заголовки CSP використовують nonce скрипту для кожної відповіді та вимикають атрибути вбудованих обробників (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Консоль iii" height="32" /></picture></h2>

Переглядач на `:3113` показує, що ваш агент **запам'ятав**. [Консоль iii](https://iii.dev/docs/console) показує, що ваш агент **зробив**: кожну операцію з пам'яттю як трасування OpenTelemetry, кожен запис KV можна редагувати, кожну функцію можна викликати, кожен потік можна підключити для прослуховування. Два вікна на ту саму пам'ять: одне у формі продукту, інше — у формі двигуна.

Спостерігайте за спрацюванням `memory_smart_search` і бачте сканування BM25 → пошук ембединга → злиття RRF → реранкер як каскад. Редагуйте застряглий таймер консолідації в браузері KV. Відтворюйте хук `PostToolUse` зі зміненим корисним навантаженням. Закріпіть потік WebSocket і спостерігайте, як спостереження надходять у реальному часі.

agentmemory надає це безкоштовно, тому що кожен виклик функції та тригер спрацьовує через iii; нічого власного, нічого інструментувати.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="Сторінка Workers консолі iii: підключені воркери, включно з інстансами agentmemory, з показниками кількості функцій у реальному часі та метаданими рантайму" width="720" />
  <br/>
  <em>Сторінка Workers: кожен підключений воркер, включно з самим agentmemory, з PID, кількістю функцій, рантаймом і часом останньої активності.</em>
</p>

**Уже встановлено.** Консоль постачається разом із закріпленим двигуном `iii` (0.22+); нічого окремо встановлювати не потрібно. Перший запуск завантажує бінарний файл консолі поруч із двигуном.

**Запуск разом з agentmemory:**

```bash
agentmemory console
```

Це запускає `iii console` закріпленого двигуна проти портів, визначених agentmemory (REST, потоки, bridge), і обслуговує її на один порт вище за переглядач, за замовчуванням `http://localhost:3114`. `--console-port N` обирає інший порт; `--port` і `--instance` обирають інстанс agentmemory так само, як для `stop`; будь-який інший прапорець передається напряму, наприклад `--enable-flow` для експериментальної сторінки графа архітектури.

Те саме вручну, корисно, коли `agentmemory` відсутній у PATH:

```bash
~/.agentmemory/bin/iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**Що можна робити з консолі:**

| Сторінка | Використовуйте, щоб |
|------|-----------|
| **Workers** | Бачити кожен підключений воркер і його показники в реальному часі, включно з самим воркером agentmemory. |
| **Functions** | Викликати будь-яку функцію agentmemory напряму з корисним навантаженням JSON; зручно для тестування `memory.recall`, `memory.consolidate`, `graph.query` без підключення клієнта. |
| **Triggers** | Відтворювати HTTP-, cron-, подієві та стейт-тригери: запустити cron консолідації вручну, повторити HTTP-маршрут, згенерувати зміну стану. |
| **States** | Браузер KV із повним CRUD для сесій, слотів пам'яті, таймерів життєвого циклу та індексу ембедингів; редагувати значення на місці. |
| **Streams** | Живий монітор WebSocket для записів пам'яті, подій хуків та оновлень спостережень у міру їхнього проходження через потоки iii. |
| **Queues** | Довговічні теми черги + керування dead-letter. Відтворювати або відкидати невдалі завдання ембедингу / стиснення. |
| **Traces** | Перегляди OpenTelemetry waterfall / flame / розбивки за сервісами. Фільтруйте за `trace_id`, щоб побачити, які саме функції, запити до БД та запити ембедингу породив один `memory.search`. |
| **Logs** | Структуровані логи OTEL, відфільтровані та співвіднесені з ID трасування/спанів. |
| **Config** | Конфігурація рантайму: побачити, з якими воркерами, постачальниками і портами працює ваш двигун. |
| **Flow** | (Опційно, `--enable-flow`) Інтерактивний граф архітектури кожного воркера, тригера і потоку. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="Перегляд waterfall трасування консолі iii, що показує тривалість кожного спана" width="720" />
  <br/>
  <em>Traces: waterfall / flame / розбивка за сервісами для кожної операції з пам'яттю.</em>
</p>

**Трасування вже увімкнено:**

`iii-config.yaml` постачається з увімкненим воркером `iii-observability` (`exporter: memory`, `sampling_ratio: 0.1`, метрики + логи). Додаткова конфігурація не потрібна; у момент запуску agentmemory кожна операція з пам'яттю генерує структурований лог, який може прочитати консоль, і кожна десята з них (`sampling_ratio: 0.1`) також генерує спан трасування.

Якщо ви натомість хочете експортувати в Jaeger/Honeycomb/Grafana Tempo, змініть `exporter: memory` на `exporter: otlp` і встановіть ендпоінт колектора відповідно до документації з спостережуваності iii.

> **Важливо:** на самій консолі автентифікація не застосовується; тримайте її прив'язаною до `127.0.0.1` (значення за замовчуванням) і ніколи не публікуйте її назовні.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="На основі iii" height="32" /></picture></h2>

agentmemory **вже є запущеним інстансом [iii](https://iii.dev)**. Рантайм складається з трьох примітивів (worker, function, trigger); KV-стан, потоки та трасування OTEL надходять від воркерів iii-state, iii-stream та iii-observability, що постачаються разом з iii. Ви не встановлювали Postgres, Redis, Express, pm2 чи Prometheus, тому що iii замінює їх.

Це означає, що одна додаткова команда розширює agentmemory цілою новою можливістю.

### Розширення agentmemory додатковими воркерами

Вбудовані воркери, потрібні agentmemory, уже є в `iii-config.yaml` і завантажуються разом з ним: `iii-state` (KV), `iii-queue` (стійкі повторні спроби для підписників подій), `iii-pubsub`, `iii-cron`, `iii-stream` та `iii-observability` (трасування OTEL, метрики й логи для кожної функції). Будь-що інше з [реєстру воркерів iii](https://workers.iii.dev) підключається до того самого двигуна: скопіюйте `iii-config.yaml` у `~/.agentmemory/iii-config.yaml` (CLI надає перевагу цьому файлу над вбудованим і все одно рендерить у нього порти та шляхи даних), додайте запис, встановіть рантайм воркера один раз командою `~/.agentmemory/bin/iii update worker` і перезапустіть agentmemory.

```yaml
workers:
  # ...the bundled entries...
  - name: database          # SQL-backed state adapter when you outgrow the KV defaults
  - name: iii-sandbox       # run code that came out of memory_recall inside a throwaway VM
  - name: mcp               # extra MCP servers next to agentmemory's, same engine
```

| Воркер | Що ви отримуєте на додачу до agentmemory |
|---|---|
| [`database`](https://workers.iii.dev/workers/database) | Адаптер стану на основі SQL, коли вам стає замало типових налаштувань KV у пам'яті |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | Код, отриманий з `memory_recall`, виконується у тимчасовій VM, а не у вашій оболонці |
| [`mcp`](https://workers.iii.dev/workers/mcp) | Розгортайте додаткові MCP-сервери поруч з сервером agentmemory, спільно з тим самим двигуном |

На двигуні 0.22.x зберігайте назви з префіксом `iii-` для вбудованих воркерів вище; записи без префікса `http`, `state`, `queue`, `pubsub` і `cron` — це автономні воркери з реєстру, на які agentmemory перейде з миграцією на 0.23.

Повний реєстр: [workers.iii.dev](https://workers.iii.dev). Кожен воркер там складається з тих самих примітивів, що використовує agentmemory, і agentmemory, який у вас уже є, — один з них.

### Конфігурація двигуна та адреса прив'язки

`agentmemory start` зчитує конфігурацію двигуна з першого наявного файлу: `AGENTMEMORY_III_CONFIG`, `./iii-config.yaml` у поточному каталозі, `~/.agentmemory/iii-config.yaml`, потім вбудований `iii-config.yaml`. Під час кожного запуску вона рендерить цей файл (шляхи даних, порти, бекенд стану) у `~/.agentmemory/data/iii-config.runtime.yaml` і запускає двигун з відрендереною копією, тож редагуйте вихідний файл, а не відрендерений. Значення `host:` вихідного файлу зберігаються такими, якими їх записано.

Вбудований `iii-config.yaml` навмисно прив'язується до `127.0.0.1`, і це значення за замовчуванням застосовується й усередині контейнера. CLI, запущений у контейнері, прослуховує loopback контейнера, тож опубліковані порти не дістануться нічого. Щоб обслуговувати контейнеризований CLI через опубліковані порти, встановіть `AGENTMEMORY_III_CONFIG` на конфігурацію, яка прив'язується до `0.0.0.0`. Запакований `iii-config.docker.yaml` саме такий: він прив'язує `iii-http`, `iii-stream` та порт двигуна до `0.0.0.0` і зберігає стан у `/data`, тож монтуйте туди том із правом запису. Тримайте `AGENTMEMORY_SECRET` встановленим і публікуйте лише потрібні вам порти, на `127.0.0.1` або за проксі, якому ви довіряєте.

`docker-compose.yml` цього репозиторію не проходить через пошук конфігурації CLI: він монтує `iii-config.docker.yaml` у `/app/config.yaml`, а контейнер `iii-engine` запускається з `--config /app/config.yaml`. [Шаблони розгортання](../deploy/) в один клік записують власну конфігурацію `0.0.0.0` у своїх точках входу.

### Бекенд сховища: file (за замовчуванням) проти redis

`iii-state` і `iii-stream` за замовчуванням використовують вбудоване файлове KV-сховище iii-engine: один JSON-файл на скоуп, що зберігається в пам'яті процесу двигуна і періодично перезаписується на диск за таймером. Це правильне значення за замовчуванням для локального встановлення з одним користувачем; спільний демон із кількома одночасними записувачами замість цього отримує справжні записи для кожного ключа від Redis, за ціною одного мережевого обороту на операцію (кожен виклик `state::*` все одно серіалізується на одному з'єднанні Redis, тож це обмінює блокування файлового сховища на сокет, а не на паралелізм).

Встановіть `AGENTMEMORY_STATE_BACKEND=redis` (плюс `AGENTMEMORY_REDIS_URL`), щоб перемкнути обидва воркери на вбудований адаптер `redis` iii-engine, який зберігає кожен ключ як поле хеша Redis (`HSET`) замість перезапису всього скоупу під час кожного запису:

```env
# ~/.agentmemory/.env
AGENTMEMORY_STATE_BACKEND=redis
AGENTMEMORY_REDIS_URL=redis://localhost:6379
```

`AGENTMEMORY_STATE_BACKEND` за замовчуванням має значення `file`; якщо не встановлювати її, поточна поведінка залишається незмінною, а невідоме значення (будь-яке, окрім `file` чи `redis`) призводить до помилки запуску, а не до тихого переходу на запасний варіант. `/agentmemory/status` і сторінка Health переглядача (рядок State store) повідомляють, який бекенд активний і чи він відповідає, але ніколи — URL.

**Лише звичайний `redis://`.** Закріплений двигун (0.22.1) збирає свій клієнт Redis без підтримки TLS, тому URL `rediss://` (більшість керованих пропозицій Redis, таких як Upstash, Redis Cloud та ElastiCache з шифруванням під час передавання, за замовчуванням працюють лише через TLS) не зможе підключитися. З'єднання не зашифроване, тож пароль Redis і кожен збережений запис пам'яті проходять мережею у відкритому вигляді: вказуйте на локальний Redis або на такий, що в приватній мережі, якій ви довіряєте. Для будь-якого іншого Redis запустіть зашифрований тунель (stunnel, SSH або VPN) на хості agentmemory, щоб звичайний перехід `redis://` залишався на цьому хості, а вихідне з'єднання тунелю було зашифрованим і автентифікованим. Якщо пароль Redis містить одинарну лапку, закодуйте її у відсотковому форматі (`%27`); двигун розгортає URL у своїй YAML-конфігурації перед розбором.

**Один сервер Redis на кожен `--instance`.** Префікси ключів Redis двигуна (`state:<scope>`, `stream:<name>:<group>`) фіксовані, тому два інстанси agentmemory (`--instance 1`, `--instance 2`, ...), спрямовані на одну базу даних, перезаписують дані один одного. Окремий індекс бази даних (`redis://localhost:6379/1`) розділяє збережені дані, але двигун транслює живі події переглядача через один канал Redis pub/sub (`stream::events`), а Redis pub/sub ігнорує індекс бази даних, тож переглядач кожного інстансу все одно показуватиме живі події іншого. Виділяйте кожному інстансу власний сервер Redis (або порт), коли запускаєте більше одного.

**Що залишається тим самим, а що відрізняється.** Кожна функція agentmemory працює на Redis: сесії, спостереження, записи пам'яті (remember, supersede, evolve, forget), пошук і бакети індексу, уроки, граф, журнал аудиту та його місячні скоупи, експорт та імпорт, видалення через управління, статус консолідації, знімок переглядача та його живий потік, а також монітор стану здоров'я. Двигун зберігає кожен скоуп як один хеш Redis (`HSET`/`HGET`/`HGETALL`) і генерує ті самі тригери стану, що й файлове сховище. Три відмінності двигуна обробляються всередині agentmemory:

- Redis повертає записи скоупу в непевному порядку. agentmemory сортує їх від найстаріших (за часом створення в id запису, потім за його часовою міткою), тож списки, пагінація та фрагменти експорту повертаються в тому самому порядку, що й у файловому сховищі.
- Двигун застосовує часткові оновлення в Redis через Lua-скрипт, який перетворює порожні масиви на порожні об'єкти. agentmemory застосовує ці оновлення самостійно (читання, зміна, запис під блокуванням на рівні ключа) на Redis, тож поля, такі як `tags: []`, залишаються масивами.
- Застаріла перевірка журналу аудиту зчитує старий скоуп із Redis, замість того щоб шукати файл файлового сховища на диску.

Одна відмінність вимагає вашої уваги: **після перезапуску Redis двигун припиняє транслювати живі події** переглядачу, доки не перезапуститься agentmemory. Дані все одно зберігаються й читаються нормально. Монітор стану здоров'я надсилає тестову подію через Redis кожні 30 секунд; якщо вона не повертається, `/agentmemory/status` і сторінка Health переглядача показують «Live updates are not reaching the viewer» із виправленням: перезапустіть agentmemory. Якщо Redis недоступний, звіт про стан показує «The state store is not answering» і спосіб це перевірити (`redis-cli -u "$AGENTMEMORY_REDIS_URL" ping`). Перелік дуже великого скоупу зчитує весь хеш за один `HGETALL` — та сама вартість, що й зберігання його у пам'яті у файловому сховищі.

**Рекомендовані налаштування Redis.** Типова політика знімків `save 3600 1 300 100 60 10000` може втратити кілька хвилин записів під час збою, що гірше за 5-секундне вікно скидання файлового сховища. Встановіть `appendonly yes` для всього, втрату чого вам буде прикро. Встановіть `maxmemory-policy noeviction`; `allkeys-lru` або подібне непомітно відкидає записи пам'яті, щойно Redis досягає межі пам'яті.

Нативний запуск (без Docker) та кожен [шаблон розгортання](../deploy/) в один клік (вони перезаписують вбудований `iii-config.yaml` і запускаються нативно) зчитують `AGENTMEMORY_STATE_BACKEND`/`AGENTMEMORY_REDIS_URL` та рендерять їх у запущений `iii-config`. Сам URL ніколи не записується у цей відрендерений файл — лише посилання `${AGENTMEMORY_REDIS_URL}`, яке процес двигуна розгортає зі свого власного середовища під час завантаження. Лише власний шлях Docker Compose цього репозиторію (`AGENTMEMORY_USE_DOCKER=1`, або відновлення вже запущеного таким чином двигуна) монтує `iii-config.docker.yaml` лише для читання і ніколи не рендерить; `agentmemory start` попереджає, коли виявляє таке поєднання. Змінюйте цей файл вручну, дотримуючись тієї самої форми `name: redis` / `config: redis_url: ...`, показаної в документації воркерів [iii-state](https://workers.iii.dev/workers/iii-state) та [iii-stream](https://workers.iii.dev/workers/iii-stream), і вкажіть у `redis_url` Redis, доступний із контейнера. `docker-compose.yml` передає `AGENTMEMORY_REDIS_URL` у контейнер двигуна, тож `redis_url: '${AGENTMEMORY_REDIS_URL}'` там працює і тримає URL поза змонтованим файлом.

Відрендерена конфігурація тримає URL поза `~/.agentmemory/data/iii-config.runtime.yaml`, але власний воркер конфігурації двигуна все одно зберігає *розгорнуте* значення в `~/.agentmemory/config/iii-state.yaml` та `iii-stream.yaml`, щойно він завантажується (розгортання `${VAR}` iii-engine відбувається до того, як цей воркер зберігає своє початкове значення, і він зберігає розв'язане значення, а не посилання). Ставтеся до цього каталогу як до такого, що містить облікові дані: виконайте `chmod 700 ~/.agentmemory` на будь-якому спільному хості й надавайте перевагу користувачу ACL Redis, обмеженому тим, що потрібно agentmemory, а не адміністративним обліковим даним бази даних.

**Миграція не автоматична.** Перемикання `AGENTMEMORY_STATE_BACKEND` починається з порожнього сховища на обох боках; ніщо не копіює наявні дані з file до Redis чи назад. Виконайте експорт з бекенду, який ви залишаєте, та імпорт у той, на який переходите. Це однаково працює під bash і zsh (включно з `bash -u`). А от масив, подібний до `AUTH=(${AGENTMEMORY_SECRET:+-H "Authorization: Bearer $AGENTMEMORY_SECRET"})`, працює не однаково: zsh тримає заголовок як одне неправильно сформоване слово, тоді як bash розбиває його на два, тож обидва запити повертають 401, щойно встановлено `AGENTMEMORY_SECRET`:

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

`/agentmemory/export` також приймає `?maxSessions=` та `?offset=` для розбиття великого корпусу на декілька викликів; `strategy` під час імпорту — це `merge` (безпечний за замовчуванням), `replace` або `skip`.

### Що замінює iii

| Традиційний стек | agentmemory використовує |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + векторний індекс у пам'яті |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | нагляд за воркерами двигуна iii |
| Prometheus / Grafana | iii OTEL + монітор стану здоров'я |
| Власні системи плагінів | `iii worker add <name>` |

**220 вихідних файлів · ~52,000 LOC · 2,600+ тестів · 311 функцій · 60 KV-скоупів**, усе на трьох примітивах. Жодного `agentmemory plugin install`. Система плагінів — це сам iii.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Конфігурація" height="32" /></picture></h2>

### Постачальники LLM

agentmemory автоматично визначає постачальників із вашого середовища. Постачальник робить доступними операції на основі LLM, але сама лише конфігурація постачальника не вмикає стиснення спостережень, написане LLM. Цей шлях потребує як постачальника, так і `AGENTMEMORY_AUTO_COMPRESS=true`.

| Постачальник | Конфігурація | Примітки |
|----------|--------|-------|
| **No-op (за замовчуванням)** | Конфігурація не потрібна | Стиснення/підсумовування на основі LLM вимкнено. Синтетичне стиснення та пригадування через BM25 все ще працюють. Див. `AGENTMEMORY_ALLOW_AGENT_SDK` нижче, якщо ви раніше покладалися на запасний варіант через підписку Claude. |
| Anthropic API | `ANTHROPIC_API_KEY` | Оплата за токен |
| MiniMax | `MINIMAX_API_KEY` | Сумісний з Anthropic |
| Gemini | `GEMINI_API_KEY` | Також увімкає ембединги |
| OpenRouter | `OPENROUTER_API_KEY` | Будь-яка модель |
| OpenAI API | `OPENAI_API_KEY` | За замовчуванням `gpt-5.6-luna`, перевизначте через `OPENAI_MODEL` |
| **Локальний (Ollama / LM Studio / vLLM / llama.cpp)** | `OPENAI_API_KEY=local` + `OPENAI_BASE_URL=http://localhost:11434/v1` (Ollama) або `http://localhost:1234/v1` (LM Studio) + `OPENAI_MODEL=<your model>` | Усе, що сумісне з OpenAI API. Нульова вартість, працює на вашому обладнанні. Див. [Локальні моделі](#local-models-ollama--lm-studio--vllm) нижче. |
| Запасний варіант через підписку Claude | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Лише за явним підключенням. Породжує сесії `@anthropic-ai/claude-agent-sdk`; раніше це спричиняло необмежену рекурсію хука Stop, тож більше не є значенням за замовчуванням. |

### Локальні моделі (Ollama / LM Studio / vLLM)

agentmemory спілкується з будь-яким сервером, сумісним з OpenAI API, тож усе, що надає `/v1/chat/completions`, працює без змін у коді. Без платних ключів, без хмари, без обмежень частоти запитів; працює повністю на вашому обладнанні.

**Ollama** (порт за замовчуванням `11434`):

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

**LM Studio** (порт за замовчуванням `1234`):

Відкрийте LM Studio → вкладка Local Server → Start Server. Оберіть будь-яку чат-модель із переліку (Qwen 3, gpt-oss, DeepSeek R1 тощо).

```env
# ~/.agentmemory/.env
OPENAI_API_KEY=lmstudio                        # any non-empty string; LM Studio ignores it
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=qwen3-8b                          # match the model name from LM Studio
```

**vLLM / llama.cpp / Text Generation Inference**: той самий формат. Вкажіть у `OPENAI_BASE_URL` URL, який надає ваш сервер, і встановіть у `OPENAI_MODEL` назву, яку прийме ваш сервер.

**Вибір моделей для роботи з пам'яттю**: стиснення та підсумовування — це короткі завдання (<2K токенів на вхід, <500 токенів на вихід), для яких цілком достатньо 7B instruct-моделі. Рекомендації:

| Модель | Розмір | Чому |
|-------|------|-----|
| `qwen3:8b` | ~5.2 ГБ | Збалансований варіант за замовчуванням на машині з 16 ГБ; сильна у видобуванні та тексті, схожому на виклики інструментів |
| `qwen3:4b` | ~2.6 ГБ | Найменший розумний варіант; підходить для стиснення, слабша для видобування графа |
| `qwen3-coder:30b` | ~19 ГБ | Найкращий локальний вибір для сесій, орієнтованих на код (30B MoE, 3.3B активних) на обладнанні з 24-32 ГБ |
| `gpt-oss:20b` | ~14 ГБ | Сильна загальна модель, що вписується в 16 ГБ RAM |
| `deepseek-r1:8b` | ~5.2 ГБ | Дистиляція з міркуванням; повільніша, але чистіше видобування |

Моделі Qwen 3 за замовчуванням «думають» і можуть витратити весь бюджет токенів на міркування ще до будь-якого виводу. Встановіть `AGENTMEMORY_LLM_NOTHINK=1`, щоб додавати `/no_think` до промптів видобування графа, і підвищте `MAX_TOKENS` (підходить 16384), якщо видобування повертається порожнім.

Моделі класу reasoning (у стилі `o1` з блоками `<think>`) можуть повертати порожній `content` із полем `reasoning`, яке ваш локальний сервер може не показувати. Якщо видобування повертається порожнім, спершу переключіться на модель без reasoning. Змінна середовища `OPENAI_REASONING_EFFORT=none` також може вимикати «мислення» на моделях Ollama Cloud, що дзеркалять схему reasoning OpenAI.

Локальні ембединги постачаються як опційна залежність, але не увімкнені за замовчуванням. Встановіть `EMBEDDING_PROVIDER=local`, щоб підключити `Xenova/all-MiniLM-L6-v2` (384 вимірів). Перший запит ембединга завантажує модель; надалі обчислення виконуються на пристрої. Без цього налаштування або віддаленого ключа ембедингів вектори залишаються вимкненими, `mem::search` використовує BM25, а `smart-search` все одно може додавати наявні збіги графа.

### Вибір моделі з урахуванням вартості

Коли фонове стиснення, написане LLM, увімкнене як через постачальника, так і через `AGENTMEMORY_AUTO_COMPRESS=true`, воно запускається для кожного спостереження, тож вибір моделі суттєво змінює щомісячні витрати. Зафіксовані дані навантаження: 635 запитів / 888K токенів / 35 годин активного використання, запущені на трьох моделях OpenRouter за цінами станом на 2026-05-23.

| Рівень | Модель | Вхід / 1M | Вихід / 1M | Вартість для зафіксованих 35г | Примітки |
|------|-------|------------|-------------|---------------------------|-------|
| Рекомендовано | `deepseek/deepseek-v4-flash-0731` | $0.07 | $0.14 | ~$0.07 (оцінка) | Найновіший DeepSeek; найдешевший рекомендований вибір для навантажень стиснення. |
| Рекомендовано | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | Якісне стиснення + підсумовування за ціною ~у 10× нижчою, ніж у Sonnet. |
| Рекомендовано | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | Сильне кодове міркування, якщо ваші сесії значною мірою орієнтовані на код. |
| Преміум | `anthropic/claude-sonnet-5` | $3.00 | $15.00 | ~$5.02 (оцінка) | Та сама прайс-листова ціна, що й у вимірюваному запуску Sonnet 4.6; вступна ціна $2/$10 до 2026-08-31. |
| Преміум | `openai/gpt-5.6-sol` | $5.00 | $30.00 | ~$9 (оцінка) | Флагманський рівень; дорогий для постійно активної фонової роботи. |
| Уникати | `anthropic/claude-opus-5` | $5.00 | $25.00 | ~$8.40 (оцінка) | Модель флагманського класу; надмірні витрати для стиснення. |

Рядки з вимірюваними значеннями походять із зафіксованого запуску; рядки з позначкою (оцінка) масштабують той самий мікс токенів за прайс-листовою ціною кожної моделі.

agentmemory виводить попередження під час роботи, коли `OPENROUTER_MODEL` відповідає шаблону преміум-рівня. Встановіть `AGENTMEMORY_SUPPRESS_COST_WARNING=1`, щоб вимкнути це попередження, коли ви вже зробили усвідомлений вибір.

Компроміс якості та вартості для роботи з пам'яттю: стиснення — це завдання підсумовування з відносно м'якими вимогами до якості (підсумок повторно читає агент, а не користувач). DeepSeek V4 Flash / V4 Pro / Qwen3-Coder потрапляють у межі похибки округлення порівняно з Sonnet у цьому завданні, коштуючи при цьому в 10-70× менше. Зберігайте моделі преміум-рівня для запитів, які ви читаєте самостійно.

Джерела: [ціни OpenRouter на Claude Sonnet 5](https://openrouter.ai/anthropic/claude-sonnet-5), [DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash-0731), [примітки щодо цін DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/).

### Пам'ять для кількох агентів (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

У мультиагентних конфігураціях, де декілька ролей використовують один сервер agentmemory (architect / developer / reviewer / researcher / support-agent), `AGENT_ID` позначає кожен запис роллю, яка його зробила. `AGENTMEMORY_AGENT_SCOPE` контролює, чи пригадування фільтрується за цим тегом.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

Два режими:

| Режим | Позначає записи | Фільтрує пригадування | Коли використовувати |
|------|------------|---------------|-------------|
| `shared` (за замовчуванням) | так | ні | Контекст між агентами з журналом аудиту. Architect бачить, що зазначив developer, але кожен рядок записує, хто це сказав. |
| `isolated` | так | так | Сувора відокремленість. Architect ніколи не бачить спостережень / записів пам'яті / сесій developer. |

Що позначається, коли встановлено `AGENT_ID`: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. Роль проходить шлях від `api::session::start` → `mem::observe` → `mem::compress` → KV.

Що фільтрується в ізольованому режимі: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Кожен ендпоінт приймає `?agentId=<role>` для перевизначення для конкретного запиту та `?agentId=*`, щоб повністю вийти зі скоупу змінної середовища. `/memories` також приймає `?includeOrphans=true`, щоб показати записи пам'яті до появи AGENT_ID, чий `agentId` не визначено.

Перевизначення для кожного виклику на рівні SDK / REST: кожен змінювальний ендпоінт (`/session/start`, `/remember`) приймає поле `agentId` у тілі запиту, яке переважає над змінною середовища. Корисно для рантаймів, що маршрутизують багато ролей через один серверний процес. Інструмент MCP `memory_save` надає те саме поле `agentId`, автономний stdio-сервер передає як `agentId`, так і `project`, а збережені записи пам'яті несуть `agentId` у пошуковий індекс, тож пошук у межах скоупу агента охоплює як записи пам'яті, так і спостереження.

Коли `AGENT_ID` не встановлено, пам'ять залишається без скоупу (застаріла поведінка, без тегів, без фільтрів).

### Порти

agentmemory + iii-engine за замовчуванням прив'язують чотири порти. Якщо перезапуск завершується помилкою `port in use`, ця таблиця підкаже, який процес шукати.

| Порт | Процес | Призначення | Перевизначення через env |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | Внутрішній воркер потоків (використовується agentmemory + переглядачем) | `III_STREAM_PORT` (пріоритетно) або застарілий `III_STREAMS_PORT` |
| `3113` | agentmemory | Переглядач у реальному часі (`http://localhost:3113`) | `III_VIEWER_PORT` або `AGENTMEMORY_VIEWER_URL` для URL, що повідомляється |
| `49134` | iii-engine | WebSocket; тут реєструються воркери, через нього проходить телеметрія OTel | `III_ENGINE_PORT` або `III_ENGINE_URL` |

`--port <N>` змінює якір REST і виводить потоки `N+1`, переглядач `N+2` та WebSocket двигуна `N+46023`, але лише там, де відповідний явний порт чи URL вище не встановлено. Це не створює ізольований простір імен життєвого циклу. Використовуйте `--instance 1` для другого демона; він використовує якір 3211, за замовчуванням `3211/3212/3213/49234`, і отримує окремий каталог даних і життєвого циклу `instance-1`. Інстанси від 1 до 50 дотримуються того самого шаблону.

Закріплений двигун запускається з `--no-update-check` (без пошуку оновлень чи порад безпеки проти GitHub під час завантаження) і з вимкненою анонімною телеметрією використання iii: agentmemory встановлює `III_TELEMETRY_ENABLED=false` для двигуна, який він породжує, якщо ви самі не експортували цю змінну, і вбудований compose-файл робить те саме.

Очищення застарілих процесів, коли порти залишаються зайнятими після аварійного завершення:

```bash
# macOS / Linux — find whatever is on each port and kill it
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` коректно прибирає як воркер, так і pid-файл двигуна під час штатного нативного завершення роботи. У режимі Docker вона зливає нативний воркер, зупиняє саме той перевірений контейнер двигуна і зберігає як контейнер, так і його монтування `/data` для безвтратного перезапуску; наступний запуск перевіряє і відновлює той самий контейнер. Видалення на основі Docker потребує `agentmemory remove --keep-data`: ця команда видаляє спільні файли, якими керує agentmemory, зберігаючи перевірений контейнер, його монтування даних і запис життєвого циклу, потрібний для їхнього відновлення. Руйнівне видалення даних Docker навмисно залишено на оператора після резервного копіювання. CLI також відмовляється приймати у власність або сигналізувати власникам портів Docker чи VM (Docker backend, vpnkit, colima) як нативному двигуну, якщо не передано `--force`. Ручне очищення вище призначене лише для випадку після аварійного завершення, коли жодного pid-файлу не залишилося.

### Файл конфігурації

Розмістіть конфігурацію рантайму agentmemory в `~/.agentmemory/.env`, а не експортуйте змінні в кожній оболонці. Якщо переглядач показує підказку налаштування, таку як `export ANTHROPIC_API_KEY=...`, скопіюйте її в цей файл як `ANTHROPIC_API_KEY=...` без префіксу `export`, потім перезапустіть agentmemory.

Змінні середовища процесу все ще працюють і мають пріоритет над значеннями у файлі.

На Windows той самий файл розташовано в `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

Щоб протестувати з підпискою Claude Code Pro/Max замість API-ключа, підключіться явно:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

Стиснення спостережень, написане LLM, потребує обох рядків: доступу до постачальника LLM (включно з цим явним запасним варіантом через підписку) та `AGENTMEMORY_AUTO_COMPRESS=true`. Сам лише постачальник залишає типовий шлях синтетичного стиснення без змін.

Консолідація (вузли графа, уроки, кристали) увімкнена за замовчуванням, коли налаштовано постачальника LLM. Явно відмовтеся за допомогою `CONSOLIDATION_ENABLED=false`, якщо хочете роботи без LLM. Видобування графа — це окремий прапорець:

```env
GRAPH_EXTRACTION_ENABLED=true
# CONSOLIDATION_ENABLED=false   # opt out of auto-consolidation
```

### Змінні середовища

Створіть `~/.agentmemory/.env`:

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

138 ендпоінтів на порту `3111`. REST API за замовчуванням прив'язується до `127.0.0.1`. Захищені ендпоінти вимагають `Authorization: Bearer <secret>`, а ендпоінти синхронізації mesh вимагають явно встановленого `AGENTMEMORY_SECRET` на обох сторонах.

**Автентифікація увімкнена за замовчуванням.** Коли `AGENTMEMORY_SECRET` не встановлено (ні в оболонці, ні в `~/.agentmemory/.env`), сервер генерує випадковий секрет під час першого запуску та зберігає його в `~/.agentmemory/secret` з режимом `0600`. Кожен вбудований клієнт зчитує його звідти, коли спілкується з локальним сервером: CLI, переглядач, хуки в `plugin/scripts`, MCP-сервер та шим `@agentmemory/mcp`, конфігурації, записані `agentmemory connect`, а також вбудовані інтеграції OpenCode, Pi, OpenClaw, Hermes та спостерігача за файловою системою. Збережений секрет надсилається лише на loopback-URL (`localhost`, `127.0.0.0/8`, `::1`). Явний `AGENTMEMORY_SECRET` завжди переважає, і віддаленим клієнтам все одно потрібно його встановити. Docker та точки входу `deploy/` уже генерують і експортують власний секрет. Щоб викликати API вручну:

```bash
curl -H "Authorization: Bearer $(cat ~/.agentmemory/secret)" http://localhost:3111/agentmemory/health
```

**Правила запитів для записів.** Запити `POST`, `PUT`, `PATCH` і `DELETE` до REST API та переглядача повинні надсилати `Content-Type: application/json` (параметр `charset` допустимий), коли вони несуть тіло, а заголовок `Origin`, якщо присутній, має бути loopback-джерелом для налаштованого порту REST чи переглядача або бути перелічений у `VIEWER_ALLOWED_ORIGINS` (через кому, наприклад `https://memory.example.com`). Клієнти, що не надсилають заголовок `Origin` (CLI, хуки, MCP, curl, сервер-до-сервера), не впливають на це. Переглядач також приймає власне джерело.

**Шляхи до файлів.** Ендпоінти, що читають або записують файли (`/compress-file`, `/replay/import-jsonl`, `/graph/import-graphify`), приймають лише шляхи в межах `~/.agentmemory`, каталогу даних інстансу або каталогу, перелічений у `AGENTMEMORY_IMPORT_ROOT` (розділяйте декілька через `:`, або `;` на Windows). `/replay/import-jsonl` також приймає свій типовий `~/.claude/projects`. `/obsidian/export` залишається в межах `AGENTMEMORY_EXPORT_ROOT`, а `/migrate` — в межах `~/.agentmemory`. Символічні посилання розв'язуються перед кожною перевіркою.

**Очищення секретів.** API-ключі, bearer-токени, блоки приватних ключів PEM та облікові дані, вбудовані в URL (`scheme://user:password@host`), видаляються перед збереженням тексту, на кожному шляху запису: спостереження, remember, evolve, слоти, уроки, дії, ескізи, сигнали, контрольні точки, імпорти, відтворення jsonl, синхронізація mesh, спільний доступ команди, вивід стиснення та підсумків, кристали й вузли графа.

<details>
<summary>Основні ендпоінти</summary>

| Метод | Шлях | Опис |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Перевірка стану здоров'я (завжди публічна) |
| `GET` | `/agentmemory/status` | Що не так і як це виправити (HTML для браузерів, JSON в інших випадках) |
| `GET` | `/agentmemory/viewer/snapshot` | Усе, що показує переглядач, в одній відповіді |
| `POST` | `/agentmemory/session/start` | Почати сесію + отримати контекст |
| `POST` | `/agentmemory/session/end` | Завершити сесію |
| `POST` | `/agentmemory/observe` | Захопити спостереження (див. доставку захоплення нижче) |
| `GET` | `/agentmemory/capture` | Вхідна скринька захоплення, dead letters та офлайн-спул |
| `POST` | `/agentmemory/capture/retry` | Повторити невдалі захоплення (dead-letter) |
| `POST` | `/agentmemory/capture/drain` | Надіслати локальний офлайн-спул зараз |
| `POST` | `/agentmemory/smart-search` | Гібридний пошук |
| `POST` | `/agentmemory/context` | Згенерувати контекст |
| `POST` | `/agentmemory/remember` | Зберегти в довгострокову пам'ять |
| `POST` | `/agentmemory/forget` | Видалити спостереження |
| `POST` | `/agentmemory/enrich` | Контекст файлу + записи пам'яті + помилки |
| `GET` | `/agentmemory/profile` | Профіль проєкту |
| `GET` | `/agentmemory/export` | Експортувати всі дані |
| `POST` | `/agentmemory/import` | Імпортувати з JSON |
| `POST` | `/agentmemory/graph/query` | Запит графа знань |
| `POST` | `/agentmemory/graph/compact` | Обрізати завелике походження графа |
| `POST` | `/agentmemory/team/share` | Поширити серед команди |
| `GET` | `/agentmemory/audit` | Журнал аудиту |

Повний перелік ендпоінтів: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

**Доставка захоплення.** Хуки надсилають кожне спостереження один раз на `POST /agentmemory/observe` з `eventId`. Це власний id хоста для виклику, якщо корисне навантаження має такий (наприклад, `tool_use_id` Claude Code), інакше — хеш сесії, типу хука, назви інструменту, вхідних і вихідних даних та часової метки хоста. Сервер записує подію у вхідну скриньку захоплення в хранилищі стану, зберігає спостереження, потім видаляє запис зі скриньки. Код статусу повідомляє, що сталося:

| Статус | поле `status` | Значення |
|---|---|---|
| `201` | `accepted` | Збережено. `observationId` — нове спостереження. |
| `202` | `accepted` (`state: "retrying"`) | Прийнято, але збереження не вдалося. Сервер повторює спробу, також після перезапуску. |
| `200` | `duplicate` | Цей `eventId` уже прийнято раніше. `observationId` — наявне спостереження; нічого нового не зберігається. |
| `400` / `422` | `rejected` | Некоректне корисне навантаження, або збереження остаточно не вдалося (подія зберігається як dead letter). |
| `503` | `rejected` (`retryable: true`) | Вхідна скринька переповнена (`AGENTMEMORY_CAPTURE_INBOX_MAX`). Хуки заносять подію в спул і надсилають її пізніше. |

Невдалі події повторюються кожні `AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS` (10 с) з подвоюваним відступом, до `AGENTMEMORY_CAPTURE_MAX_ATTEMPTS` (5). Події, що все ще не вдаються, залишаються у вхідній скриньці як dead letters, перелічуються на `/agentmemory/status` і сторінці Health переглядача, і можуть бути повторені через `POST /agentmemory/capture/retry` (`{"eventId": "..."}` або `{"all": true}`). Прийняті id подій пам'ятаються протягом `AGENTMEMORY_CAPTURE_DEDUP_HOURS` (168 годин, щонайбільше `AGENTMEMORY_CAPTURE_EVENTS_MAX` id), тож хук, відтворений після таймауту чи перезапуску, зберігається один раз, тоді як два окремі виклики інструменту з власними id хоста зберігаються двічі, навіть якщо їхній вміст ідентичний. Коли спостереження видаляється (forget, видалення сесії, витіснення, автозабування або імпорт, що замінює сховище), його подія позначається як видалена до видалення самого спостереження, тож відтворення цієї події в тому самому вікні відповідається як дублікат і нічого не зберігає. Хранилище стану записує на диск кожні 2 секунди, тож відповідена подія може ще якусь мить залишатися лише в пам'яті. Щоб покрити це, кожна відповідь `2xx` також несе `bootId` сервера (новий під час кожного запуску), `acceptedAt` і `durableAfterMs` (інтервал збереження плюс 1.5 с для файлового сховища, 1.5 с для redis, де стійкість — налаштування оператора). Хуки тримають подію в локальному спулі, доки не минув цей проміжок, і видаляють її під час наступного виклику без додаткового запиту. Якщо `bootId` змінився на той момент, сервер перезапустився, тож хук надсилає подію знову з тим самим `eventId`; подія, яка таки дістала диск, не зберігається двічі. Сервер також сам надсилає такі події під час запуску і кожного інтервалу повторення, тож перезапуск нічого не втрачає, навіть якщо надалі жоден хук не запускається. Старіші хуки ігнорують додаткові поля, а нові хуки проти старішого сервера відкидають подію на `2xx`, як і раніше.

Коли сервер не працює, не відповідає вчасно або повертає 5xx, хук додає спостереження до локального файлу спулу, `<data dir>/capture-spool/<host>-<port>.jsonl` (перевизначте папку через `AGENTMEMORY_CAPTURE_SPOOL_DIR`). Файл приватний для вашого користувача (режим 600), секрети редагуються так само, як їх редагує сервер, він містить щонайбільше `AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES` (5 МіБ) і відкидає записи, старіші за `AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS` (168). Коли він переповнений, нові записи відкидаються і підраховуються, і `/agentmemory/status` повідомляє про це. Хук все одно завершується з кодом 0 у межах свого часового лімиту і не додає запиту, коли сервер справний. Спул надсилається під час наступного запуску і першим хуком, що знову дістається сервера, у фоновому процесі, тож агент не чекає. Id подій роблять це безпечним: спостереження, яке таки надійшло до таймауту, не зберігається двічі. `npx @agentmemory/agentmemory capture` показує спул і вхідну скриньку сервера, `--drain` надсилає спул зараз, а `GET /agentmemory/capture` повертає те саме як JSON. Встановіть `AGENTMEMORY_CAPTURE_SPOOL=false`, щоб вимкнути спул.

**Компактування походження графа.** Кожен вузол і ребро графа знань зберігає id 32 найновіших спостережень, з яких він походить. Сховища, записані до появи цього обмеження, можуть містити тисячі id на гарячий вузол, що сповільнює пошук у графі та переглядач або призводить до падіння воркера. agentmemory виправляє це самостійно: під час першого запуску після оновлення він обрізає кожен вузол, ребро, заміщене ребро (темпоральну історію графа) та кешований знімок до межі у фоновому режимі, невеликими фрагментами з паузою між ними, тож пошук, захоплення та переглядач продовжують працювати. Він зберігає свій прогрес, відновлюється після перезапуску і більше не запускається після завершення. `/agentmemory/status` і сторінка Health переглядача показують це як очікування, виконання (з поточним скоупом і позицією), завершено або не вдалося. Встановіть `AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false`, щоб вимкнути це.

Щоб запустити це вручну, викличте `POST /agentmemory/graph/compact`. Він обходить індекси імен та ключів ребер, замість перелічування кожного вузла і ребра, і безпечний для повторного запуску. Коли він обрізає id, він записує запис аудиту `graph_compact`.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{}'
```

На великому сховищі, або коли виклик повертає 504, запускайте це фрагментами. Надішліть `scope` (`nodes`, `edges` або `history`), `offset` і `limit`, потім викличте знову з поверненим `nextOffset`, доки він не стане `null`. Зробіть це для `nodes`, `edges` та `history`, і завершіть одним викликом `{"scope":"snapshot"}`, тому що фрагментований запуск не торкається кешованого знімка.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"nodes","offset":0,"limit":200}'
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"snapshot"}'
```

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Розробка" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 2,600+ tests
npm run test:integration  # API tests (requires running services)
```

**Передумови:** Node.js >= 20 з npm/npx; [iii-engine](https://iii.dev/docs) v0.22.1 або Docker. Автоматичне встановлення двигуна на macOS/Linux також вимагає `curl`, POSIX `sh` та `tar`; нативний Windows використовує вручну встановлений закріплений `iii.exe`, WSL2 або Docker Desktop.

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="Ліцензія" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
