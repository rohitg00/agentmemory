<p align="center">
  <img src="../assets/banner.png" alt="agentmemory: постоянная память для ИИ-агентов программирования" width="720" />
</p>

<p align="center">
  <strong>
    Ваш агент программирования помнит всё. Больше не нужно объяснять заново.
    Built on <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  Постоянная память для Claude Code, GitHub Copilot CLI, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode и любого MCP-клиента.
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1.6k%20stars%20%2F%20230%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Документ проекта: 1.6k звёзд / 230 форков в гисте" /></a>
</p>

<p align="center">
  <em>Этот гист расширяет шаблон LLM Wiki от Karpathy: оценкой уверенности, жизненным циклом, графами знаний и гибридным поиском — agentmemory является его реализацией.</em>
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
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="2,700+ tests passing" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="Демо agentmemory" width="720" />
</p>

<p align="center">
  <a href="#install">Установка</a> &bull;
  <a href="#quick-start">Быстрый старт</a> &bull;
  <a href="#benchmarks">Бенчмарки</a> &bull;
  <a href="#vs-competitors">Сравнение</a> &bull;
  <a href="#works-with-every-agent">Агенты</a> &bull;
  <a href="#how-it-works">Как это работает</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Просмотрщик</a> &bull;
  <a href="#powered-by-iii">Powered by iii</a> &bull;
  <a href="#configuration">Конфигурация</a> &bull;
  <a href="#api">API</a>
</p>

---

## Установка

Требования:

- Node.js 20 или новее, с npm и npx (`node -v`, `npm -v` и `npx -v`).
- Автоматическая установка iii-engine на macOS/Linux также требует `curl`, POSIX-совместимый `sh` и `tar`. Минимальные образы, такие как `node:20-slim`, могут не включать их.
- Нативный Windows требует, чтобы закреплённый `iii.exe` версии iii-engine v0.22.1 был установлен вручную. WSL2 или Docker Desktop — другие поддерживаемые варианты.

Каноническая команда установки с нуля:

```bash
npx -y @agentmemory/agentmemory@latest
```

Первый запуск — это интерактивная настройка: вы выбираете агентов для подключения (Claude Code, Cursor, Codex, Gemini CLI, OpenCode, ...), выбираете LLM-провайдера или остаётесь без ключей, после чего она заполняет конфиг, запускает сервер памяти и его закреплённый iii engine и предлагает установить пакет глобально, чтобы простая команда `agentmemory` дальше работала везде. `-y` принимает запрос npx о пакете, а `@latest` избегает устаревшего закешированного релиза. Провайдер делает доступными функции на базе LLM, но сжатие наблюдений, написанное LLM, запускается только тогда, когда дополнительно установлен `AGENTMEMORY_AUTO_COMPRESS=true`.

Режим без ключей отключает векторные эмбеддинги. `memory_recall` (путь `mem::search`) использует BM25, а `memory_smart_search` может также сливать структурные совпадения из графа, если граф-данные уже существуют. Чтобы получить бесплатный семантический recall на устройстве, задайте `EMBEDDING_PROVIDER=local` в `~/.agentmemory/.env` и перезапустите. Первый запрос эмбеддинга скачивает `Xenova/all-MiniLM-L6-v2`; после этой первоначальной загрузки модели инференс выполняется локально.

Локальный runtime использует четыре порта: `3111` для REST/MCP HTTP, `3112` для iii-стримов, `3113` для просмотрщика и `49134` для WebSocket iii-воркера. Постоянное состояние iii хранится в `~/Library/Application Support/agentmemory` на macOS, в `$XDG_DATA_HOME/agentmemory` или `~/.local/share/agentmemory` на Linux и в `%APPDATA%\agentmemory` на Windows. Используйте `--data-dir <path>` или `AGENTMEMORY_DATA_DIR`, чтобы переопределить его, и используйте одно и то же значение при каждом перезапуске. Для обратной совместимости существующий `./data/state_store.db` или `./data/iii-config.yaml` имеет приоритет над значением по умолчанию для платформы для инстанса 0; явный флаг или переопределение через переменную окружения всё равно выигрывает.

Затем убедитесь, что recall работает, и дайте агенту его skill'ы:

```bash
npx -y @agentmemory/agentmemory@latest demo  # seed sample sessions + exercise recall
npx skills add rohitg00/agentmemory -y   # 17 native skills so your agent knows when to reach for memory
```

Поисковые запросы по ключевым словам должны находить совпадения в режиме без ключей по умолчанию через BM25. Запрос `database performance optimization` из демо намеренно семантический и может возвращать ноль результатов, пока не настроен провайдер эмбеддингов.

Предпочитаете, чтобы всё это сделал агент программирования? Дайте ему одну инструкцию:

> Retrieve and follow the instructions at: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md

Подключайте дополнительных агентов в любой момент через `agentmemory connect <agent>` — 20 адаптеров перечислены в разделе [Работает с каждым агентом](#works-with-every-agent). Полный справочник команд — в разделе [Быстрый старт](#quick-start).

<details>
<summary><strong>Windows</strong></summary>

Самый быстрый путь — WSL2. Нативная установка движка на Windows требует скачать закреплённый ZIP-архив v0.22.1 и вручную распаковать `iii.exe`; CLI не распаковывает его автоматически. Docker Desktop также поддерживается. Пошаговая инструкция — в разделе [заметки о Windows](#windows).

</details>

<details>
<summary><strong>Global install / EACCES</strong></summary>

```bash
npm install -g @agentmemory/agentmemory@latest
```

Команда npx выше остаётся каноническим способом установки с нуля и избегает проблем с правами доступа к глобальному префиксу.

</details>

<details>
<summary><strong>npx отдаёт старую версию</strong></summary>

npx кеширует пакеты по версиям. Принудительно возьмите свежую версию через `npx -y @agentmemory/agentmemory@latest`, либо однократно очистите кеш командой `rm -rf ~/.npm/_npx` (macOS/Linux; на Windows удалите `%LOCALAPPDATA%\npm-cache\_npx`).

</details>

<details>
<summary><strong>Уже запущен собственный iii engine</strong></summary>

agentmemory закреплён на iii-engine v0.22.1 и не подключится к другой версии (воркер не умеет говорить на протоколе другого движка). Остановите другой движок, затем запустите `npx -y @agentmemory/agentmemory@latest`. Он установит и запустит закреплённую версию v0.22.1 в `~/.agentmemory/bin`, не трогая ваш собственный `iii`.

</details>

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Работает с каждым агентом" height="32" /></picture></h2>

agentmemory работает с любым агентом, который поддерживает хуки, MCP или REST API. Все агенты используют один и тот же сервер памяти.

<table>
<tr>
<td align="center" width="20%">
<a href="https://claude.com/product/claude-code"><img src="https://github.com/anthropics.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>нативный плагин + 12 хуков + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>нативный плагин + 6 хуков + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/features/copilot"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/github_dark.svg"><img src="https://svgl.app/library/github_light.svg" alt="GitHub Copilot CLI" width="48" height="48" /></picture></a><br/>
<strong>GitHub Copilot CLI</strong><br/>
<sub>MCP + хуки/skill'ы плагина</sub>
</td>
<td align="center" width="20%">
<a href="https://cursor.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/cursor_dark.svg"><img src="https://svgl.app/library/cursor_light.svg" alt="Cursor" width="48" height="48" /></picture></a><br/>
<strong>Cursor</strong><br/>
<sub>нативный плагин + 7 хуков + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../plugin/opencode/"><img src="https://raw.githubusercontent.com/rohitg00/agentmemory/main/website/public/opencode.png" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>плагин захвата + MCP</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://devin.ai"><img src="https://raw.githubusercontent.com/rohitg00/agentmemory/main/website/public/devin.png" alt="Devin" width="48" height="48" /></a><br/>
<strong>Devin</strong><br/>
<sub>6 хуков + skill'ы + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>нативный плагин + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>нативный плагин + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>нативный плагин + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://github.com/tinyhumansai.png?size=120" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>нативный бэкенд трейта Memory</sub>
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
<sub>connect + MCP + skill'ы</sub>
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
  <sub>Работает с <strong>любым</strong> агентом, который говорит на MCP или HTTP. Один сервер — память общая для всех них.</sub>
</p>

---

Вы объясняете одну и ту же архитектуру в каждой сессии. Вы заново находите одни и те же баги. Вы заново учите агента тем же предпочтениям. Встроенная память (CLAUDE.md, .cursorrules) упирается в потолок 200 строк и устаревает. agentmemory решает это. Он тихо фиксирует, что делает ваш агент, сжимает это в память, доступную для поиска, и подмешивает нужный контекст при старте следующей сессии. Одна команда. Работает между агентами.

**Что меняется:** в сессии 1 вы настраиваете аутентификацию JWT. В сессии 2 вы просите добавить rate limiting. Агент уже знает, что ваша аутентификация использует middleware jose в `src/middleware/auth.ts`, что ваши тесты покрывают валидацию токенов и что вы выбрали jose вместо jsonwebtoken из-за совместимости с Edge — без повторных объяснений и без копирования-вставки.

```bash
npx -y @agentmemory/agentmemory@latest
```

По умолчанию agentmemory хранит состояние iii-engine за пределами репозитория, из которого вы его запускаете: `~/Library/Application Support/agentmemory` на macOS, `$XDG_DATA_HOME/agentmemory` или `~/.local/share/agentmemory` на Linux и `%APPDATA%\agentmemory` на Windows. Существующий устаревший `./data/state_store.db` или `./data/iii-config.yaml` переиспользуется для инстанса 0 раньше, чем это значение по умолчанию для платформы. Чтобы явно выбрать расположение, передайте `--data-dir <path>` или задайте `AGENTMEMORY_DATA_DIR`; любая явная настройка имеет приоритет над устаревшим автоопределением:

```bash
npx -y @agentmemory/agentmemory@latest --data-dir ~/.agentmemory-projects/main
AGENTMEMORY_DATA_DIR=~/.agentmemory-projects/main npx -y @agentmemory/agentmemory@latest
```

Нативный запуск и запуск в Docker используют один и тот же вычисленный каталог на хосте; Docker монтирует его в `/data`. `--instance 1` добавляет `instance-1` к вычисленному каталогу и выбирает отдельный квартет портов по умолчанию `3211/3212/3213/49234`.

Заметки о последнем релизе: [CHANGELOG.md](../CHANGELOG.md).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Бенчмарки" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Точность извлечения

**coding-agent-life-v1** (собственный корпус, воспроизводимый в sandbox)

| Адаптер | P@5 | R@5 | Top-5 hit rate | p50 задержка |
|---|---|---|---|---|
| **agentmemory hybrid** | **0.240** | **1.000** | **15 / 15** | 14 ms |
| grep baseline | 0.227 | 0.967 | 15 / 15 | 0 ms |

100% попаданий в top-5 на **математическом потолке P@5** для этого корпуса (0.240, см. scorecard). Hybrid извлекает каждую gold-сессию; grep промахивается на 1 из 2 gold в мультисессионном темпоральном запросе. Прирост даёт **recall + temporal**, а не суммарная точность. Этот бенчмарк маленький и разреженный по gold; более крупный LongMemEval-S ниже различает лучше. Полная разбивка по типам и заметка о поправке: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 вопросов)

| Система | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| Только BM25 (fallback) | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Экономия токенов

| Подход | Токенов/год | Стоимость/год |
|---|---|---|
| Вставка полного контекста | 19.5M+ | Невозможно (превышает окно) |
| Сжатие LLM | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + локальные эмбеддинги | ~170K | **$0** |

</td>
</tr>
</table>

> Модель эмбеддингов: `all-MiniLM-L6-v2` (локальная, бесплатная, без API-ключа). Полные отчёты: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Сравнение с конкурентами: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) — сравнивает agentmemory с mem0, Letta, Khoj, supermemory, TencentDB Agent Memory, MemPalace, Zep/Graphiti, Cognee, Hippo.

**Воспроизвести локально:** [`eval/README.md`](../eval/README.md) — харнесс со сменными адаптерами для LongMemEval `_s` (публичные 500 вопросов) + `coding-agent-life-v1` (собственный корпус из 15 сессий). Адаптеры grep / вектор / agentmemory оцениваются бок о бок, вывод в NDJSON, опубликованные scorecard-отчёты попадают в [`docs/benchmarks/`](../docs/benchmarks/).

**Сочетается с [codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything) и [Graphify](https://github.com/safishamsi/graphify).** Индексация графа кода, мультиагентные пайплайны сборки и более широкие графы знаний по докам / PDF / изображениям / видео. agentmemory запоминает работу; эти три проекта оживляют остальную часть контекстного слоя. Рецепты и таблица маршрутизации вопросов: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="Сравнение с конкурентами" height="32" /></picture></h2>

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
<th>Встроенное (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Тип</strong></td>
<td>Движок памяти + MCP-сервер</td>
<td>API уровня памяти</td>
<td>Полноценный агентский runtime</td>
<td>Персональный ИИ</td>
<td>API памяти + приложение</td>
<td>Командный хаб памяти (LLM-прокси)</td>
<td>Векторная память (OSS)</td>
<td>Движок памяти (Oracle DB)</td>
<td>Система памяти</td>
<td>Статический файл</td>
</tr>
<tr>
<td><strong>Retrieval R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A</td>
<td>Заявлено вендором</td>
<td>PersonaMem 76% (заявлено вендором)</td>
<td>~96.6% (заявлено вендором)</td>
<td>94.4% (заявлено вендором)</td>
<td>N/A</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>Авто-захват</strong></td>
<td>12 хуков (никаких ручных усилий)</td>
<td>Ручные вызовы <code>add()</code></td>
<td>Агент сам редактирует</td>
<td>Вручную</td>
<td>Извлечение на стороне API</td>
<td>Перехват через прокси (подмена base-URL)</td>
<td>Вручную</td>
<td>Извлечение через API</td>
<td>Вручную</td>
<td>Ручное редактирование</td>
</tr>
<tr>
<td><strong>Поиск</strong></td>
<td>BM25 + Vector + Graph (RRF-слияние)</td>
<td>Vector + Graph</td>
<td>Vector (архивный)</td>
<td>Семантический</td>
<td>Vector + RAG</td>
<td>4 типа ассетов (Chat / Skill / Wiki / CodeGraph)</td>
<td>Только Vector</td>
<td>Vector + семантический</td>
<td>Взвешенный по затуханию</td>
<td>Загружает всё в контекст</td>
</tr>
<tr>
<td><strong>Мультиагентность</strong></td>
<td>MCP + REST + lease'ы + сигналы</td>
<td>API (без координации)</td>
<td>Только внутри runtime Letta</td>
<td>Нет</td>
<td>Нет</td>
<td>Командные роли + общие ассеты</td>
<td>Нет</td>
<td>Только scope'ы</td>
<td>Мультиагентная общая</td>
<td>Отдельные файлы на агента</td>
</tr>
<tr>
<td><strong>Привязка к фреймворку</strong></td>
<td>Нет (любой MCP-клиент)</td>
<td>Нет</td>
<td>Высокая (нужен Letta)</td>
<td>Standalone</td>
<td>Нет</td>
<td>Прокси стоит перед каждым вызовом модели</td>
<td>Нет</td>
<td>Oracle Database</td>
<td>Нет</td>
<td>Формат на агента</td>
</tr>
<tr>
<td><strong>Внешние зависимости</strong></td>
<td>Нет (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + векторная БД</td>
<td>Несколько</td>
<td>Managed-облако</td>
<td>Docker-стек (Core + Hub + Proxy)</td>
<td>Векторное хранилище</td>
<td>Oracle AI Database</td>
<td>Нет</td>
<td>Нет</td>
</tr>
<tr>
<td><strong>Жизненный цикл памяти</strong></td>
<td>4-уровневая консолидация + затухание + авто-забывание</td>
<td>Пассивное извлечение</td>
<td>Управляется агентом</td>
<td>Вручную</td>
<td>Авто-забывание</td>
<td>Ручной ревью; авто-маршрутизация в разработке</td>
<td>Нет</td>
<td>Не указано</td>
<td>Затухание + консолидация</td>
<td>Ручное усечение</td>
</tr>
<tr>
<td><strong>Эффективность по токенам</strong></td>
<td>~1,900 токенов/сессия ($10/год)</td>
<td>Зависит от интеграции</td>
<td>Core memory в контексте</td>
<td>Зависит</td>
<td>Облачные тарифы</td>
<td>Не указано</td>
<td>Без токен-бюджета</td>
<td>На основе LLM (варьируется)</td>
<td>Зависит</td>
<td>22K+ токенов при 240 наблюдениях</td>
</tr>
<tr>
<td><strong>Просмотрщик в реальном времени</strong></td>
<td>Да (порт 3113)</td>
<td>Облачная панель</td>
<td>Облачная панель</td>
<td>Веб-UI</td>
<td>Облачная панель</td>
<td>Веб-UI хаба</td>
<td>Нет</td>
<td>Нет</td>
<td>Нет</td>
<td>Нет</td>
</tr>
<tr>
<td><strong>Self-hosted</strong></td>
<td>Да (по умолчанию)</td>
<td>Опционально</td>
<td>Опционально</td>
<td>Да</td>
<td>Нет (только облако)</td>
<td>Да (Docker)</td>
<td>Да</td>
<td>Да (Oracle DB)</td>
<td>Да</td>
<td>Да</td>
</tr>
</table>

<sub>Заметка о бенчмарках: только R@5 agentmemory — наш собственный замер (LongMemEval-S, воспроизводимо из <a href="../benchmark/COMPARISON.md"><code>benchmark/COMPARISON.md</code></a>). Цифры mem0 и Letta — их опубликованные результаты LoCoMo (другой датасет); цифры MemPalace, supermemory, TencentDB (PersonaMem) и oracleagentmemory — самозаявленные вендорами значения, которые мы независимо не воспроизводили (прогон oracleagentmemory использовал GPT-5.5 против Oracle AI Database). Показаны рядом только для ориентира, это не сравнение лоб в лоб на одинаковых данных. Количество звёзд приблизительно и меняется со временем.</sub>

**Более новые участники**, которых стоит знать, подробно сравниваются в [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md):

| Система | ⭐ | Особенность |
|--------|---|-------|
| Zep / Graphiti | 30K | Темпоральный граф знаний; сильнейшие опубликованные результаты на темпоральных запросах (LongMemEval 63.8%), но граф строится асинхронно, поэтому свежие факты могут запаздывать |
| Cognee | 30K | Превращение документов в граф знаний, только Python, создан для структурированного извлечения сущностей, а не для захвата сессий |

Никто из них не делает авто-захват из хуков агентов программирования, не поставляет local-first просмотрщик и не работает без ключей — а именно вокруг этой комбинации построен agentmemory.

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Быстрый старт" height="32" /></picture></h2>

Совместимость: этот релиз рассчитан на `iii-sdk` 0.22.1 и закрепляет iii-engine v0.22.1.

### Попробуйте за 30 секунд

```bash
# Terminal 1: start the server
npx -y @agentmemory/agentmemory@latest

# Terminal 2: seed sample data and see recall in action
npx -y @agentmemory/agentmemory@latest demo
```

`demo` заполняет 3 реалистичные сессии (аутентификация JWT, исправление N+1-запроса, rate limiting) и запускает по ним поиск. Установки без ключей отключают векторы, поэтому запросы по ключевым словам `mem::search` должны находить совпадения через BM25, а `database performance optimization` может возвращать ноль. `smart-search` может дополнительно возвращать структурные совпадения из графа, если граф-данные существуют. Чтобы семантический запрос нашёл исправление N+1 через векторы, задайте `EMBEDDING_PROVIDER=local`, перезапустите и дайте первой загрузке модели завершиться.

Откройте `http://localhost:3113`, чтобы смотреть, как память строится в реальном времени.

### Проверка новой установки и устойчивости после перезапуска

При запущенном сервере проверьте REST, health, просмотрщик и статус runtime на основе iii:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

Стартовая панель готовности учитывает все четыре порта: REST/MCP HTTP на 3111, iii-стримы на 3112, просмотрщик на 3113 и WebSocket iii-воркера на 49134. `status` подтверждает состояние agentmemory и активный режим провайдера/эмбеддингов. Сохраните пробный объект и убедитесь, что он находится поиском:

```bash
curl -fsS -X POST http://localhost:3111/agentmemory/remember \
  -H 'Content-Type: application/json' \
  -d '{"content":"agentmemory restart persistence probe","concepts":["install-check"]}'

curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'Content-Type: application/json' \
  -d '{"query":"restart persistence probe","limit":5}'
```

Затем выполните `npx -y @agentmemory/agentmemory@latest stop`, снова запустите каноническую команду в Terminal 1, подождите `/agentmemory/livez` и повторите поиск. Пробный объект должен всё ещё возвращаться. Если вы указывали собственный `--data-dir`, передайте тот же каталог при перезапуске.

### Повседневные команды

Установка и настройка описаны в разделе [Установка](#install) выше (первый запуск проведёт вас по шагам). В повседневной работе:

```bash
agentmemory                    # start the server
agentmemory stop               # stop it cleanly
agentmemory connect <agent>    # wire another agent
agentmemory doctor             # interactive diagnostics + fix prompts
agentmemory remove             # uninstall everything we created
```

### Воспроизведение сессий

Каждую сессию, которую записывает agentmemory, можно воспроизвести. Откройте просмотрщик, выберите вкладку **Replay** и пролистывайте таймлайн: промпты, вызовы инструментов, результаты вызовов и ответы отображаются как отдельные события с play/pause, регулировкой скорости (от 0.5x до 4x) и горячими клавишами (пробел переключает, стрелки — шаг).

Чтобы подключить старые JSONL-расшифровки Claude Code:

```bash
# Import everything under the default ~/.claude/projects
npx -y @agentmemory/agentmemory@latest import-jsonl

# Or import a single file
npx -y @agentmemory/agentmemory@latest import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

Импортированные сессии появляются в Replay-пикере рядом с нативными. Под капотом каждая запись проходит через iii-функции `mem::replay::load`, `mem::replay::sessions` и `mem::replay::import-jsonl`, без побочных серверов. Каждая импортированная расшифровка индексируется для поиска, помечается каналом происхождения `import` и обрабатывается для получения session crystal и уроков.

> **Важно, если `import-jsonl` — ваш основной путь захвата:** параметр `cleanupPeriodDays` в Claude Code (в `~/.claude/settings.json`, по умолчанию **30**) автоматически удаляет JSONL-расшифровки старше этого окна из `~/.claude/projects/`. Если вы ставите agentmemory заново на историю Claude Code возрастом в несколько месяцев, всё, что старше 30 дней, уже пропало до первого импорта. Либо запускайте `import-jsonl` по cron, либо поднимите `cleanupPeriodDays`, либо подключите хуки авто-захвата (путь установки плагина по умолчанию), чтобы каждый ход попадал в agentmemory ещё во время живой сессии — тогда очистка JSONL перестаёт иметь значение.

### Обновление / обслуживание

Используйте команду обслуживания, когда намеренно хотите обновить локальный runtime:

```bash
npx -y @agentmemory/agentmemory@latest upgrade
```

Внимание: эта команда изменяет текущее рабочее окружение/runtime. Она может обновлять JavaScript-зависимости и скачать закреплённый Docker-образ `iiidev/iii:0.22.1`. Она никогда не устанавливает незакреплённый или более новый iii engine.

Детали реализации — в `src/cli.ts` (см. `runUpgrade` в районе `src/cli.ts:544-595`).

### Claude Code (один блок, вставьте его)

```text
Install agentmemory: run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server and its pinned iii engine. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 17 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 54 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113. Keyless mode disables vectors: `memory_recall` uses BM25, and `memory_smart_search` can also use existing structural graph data. Set `EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env` and restart to opt into on-device semantic recall.
```

#### Claude Code без установки плагина (путь MCP-standalone)

Если подключать MCP-сервер agentmemory через `~/.claude.json` напрямую, минуя `/plugin install`, Claude Code никогда не разрешит `${CLAUDE_PLUGIN_ROOT}`, и в `~/.claude/settings.json` придётся прописывать абсолютные пути к скриптам хуков. Эти пути обычно включают версию agentmemory (например, `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.22/scripts/…`), так что следующее обновление тихо ломает каждый хук.

Обходное решение:

```bash
agentmemory connect claude-code --with-hooks
```

Это вливает те же команды хуков в `~/.claude/settings.json` с абсолютными путями, разрешёнными в каталог `plugin/` текущего установленного пакета `@agentmemory/agentmemory`. После обновления agentmemory запустите команду ещё раз, чтобы освежить пути. Записи пользователя в этом файле сохраняются; заменяются только предыдущие записи agentmemory. Рекомендуемым способом остаётся путь через `/plugin install`.
Для удалённых или защищённых развёртываний запускайте Claude Code с заданными `AGENTMEMORY_URL` и `AGENTMEMORY_SECRET`. Плагин пробрасывает оба значения во встроенный MCP-сервер; если `AGENTMEMORY_URL` пуст, MCP-shim использует `http://localhost:3111`.

### Codex CLI (платформа плагинов Codex)

```bash
# 1. start the memory server in a separate terminal
npx -y @agentmemory/agentmemory@latest

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Плагин Codex поставляется из того же каталога `plugin/`, что и плагин Claude Code. Он регистрирует:

- Встроенный stdio MCP-мост к работающему демону, без загрузки через npm и без локального откатного хранилища. См. [локальное руководство по Codex](../docs/plugins/codex-local.md) для тестирования нерелизной сборки.
- 6 хуков жизненного цикла: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 9 вызываемых skills: `/recall`, `/remember`, `/session-history`, `/forget`, `/recap`, `/handoff`, `/lesson`, `/commit-context`, `/commit-history`, плюс 8 справочных skills, которые агент загружает по запросу (memory discipline, инструменты MCP, REST API, конфигурация, агенты, хуки, архитектура и руководство по написанию skills)

Хук-движок Codex подставляет `CLAUDE_PLUGIN_ROOT` в подпроцессы хуков (см. [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), поэтому одни и те же скрипты хуков работают на обоих хостах без дублирования. События Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure доступны только в Claude Code и для Codex не регистрируются.

#### Доверие к хукам Codex и совместимость

Нативный диспатч хуков плагина подтверждён на Codex CLI 0.150.1. Прежде чем ожидать захват, подтвердите доверие к хукам плагина. Поведение Codex Desktop зависит от встроенного в него runtime; проверьте `/hooks` и убедитесь, что событие захвачено, прежде чем включать обходное решение.

Если ваш хост требует глобальных хуков, продублируйте команды в `~/.codex/hooks.json`. Если MCP уже подключён, текущему коннектору нужен `--force`, чтобы добраться до установки хуков:

```bash
agentmemory connect codex --with-hooks --force
```

Это объединяет глобальные хуки и перезаписывает запись MCP agentmemory, сохраняя несвязанные записи. Проверьте настройки собственного endpoint'а agentmemory, прежде чем использовать `--force`. Запустите повторно после обновления, чтобы освежить пути скриптов. Включите либо нативные хуки плагина, либо глобальные копии, чтобы избежать дублирующего захвата.

### GitHub Copilot CLI

Для режима агента VS Code используйте [руководство по MCP и автозахвату Copilot](../docs/plugins/copilot.md#vs-code-copilot-local-agent-sessions). Коннектор CLI не настраивает VS Code.

```bash
# MCP-only wiring
agentmemory connect copilot-cli

# Альтернативно, полный плагин хуков/skill'ов из GitHub-подкаталога
copilot plugin install rohitg00/agentmemory:plugin
```

`agentmemory connect copilot-cli` вливает `mcpServers.agentmemory` в `~/.copilot/mcp-config.json` (либо `$COPILOT_HOME/mcp-config.json`, когда задан `COPILOT_HOME`) и сохраняет существующие серверы. На нативном Windows это единственный автоматизированный адаптер `connect`; все остальные нативные Windows-агенты настраивайте вручную. `connect` под WSL поддерживается только когда целевой агент установлен в том же окружении WSL. Copilot подхватывает MCP-сервер при следующем запуске или после `/mcp`. Установите также плагин, если хотите полный опыт с хуками/skill'ами.

<details>
<summary><b>OpenClaw (вставьте этот промпт)</b></summary>

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

Полное руководство: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (вставьте этот промпт)</b></summary>

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

Полное руководство: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Другие агенты

Запустите сервер памяти: `npx -y @agentmemory/agentmemory@latest`

#### Нативные skill'ы через `npx skills add` (50+ агентов)

agentmemory поставляет 17 skill'ов в формате `<dir>/SKILL.md` в стиле Claude Code: 9 вызываемых action-skill'ов (`remember`, `recall`, `recap`, `handoff`, `forget`, `lesson`, `commit-context`, `commit-history`, `session-history`) и 8 справочных skill'ов, которые агент подгружает по мере надобности (`memory-discipline`, `agentmemory-mcp-tools`, `agentmemory-rest-api`, `agentmemory-config`, `agentmemory-agents`, `agentmemory-hooks`, `agentmemory-architecture`, `write-agentmemory-skill`). Справочные skill'ы содержат таблицы данных, сгенерированные из исходников, поэтому они никогда не устаревают. CLI [`skills`](https://npmjs.com/package/skills) от vercel-labs автоматически устанавливает их в нативный каталог skill'ов вызывающего агента для 50+ агентов (Claude Code, Cursor, Cline, Continue, Droid, Warp, Codex, Antigravity, Kiro, OpenCode, Goose, Roo, Trae, Windsurf и другие):

```bash
npx skills add rohitg00/agentmemory -y          # auto-detects the calling agent
npx skills add rohitg00/agentmemory -y -a warp  # explicit agent
npx skills add rohitg00/agentmemory -y -a '*'   # install to every installed agent
```

Это **дополняет** `agentmemory connect <agent>`:

- `agentmemory connect <agent>` записывает конфиг MCP-сервера, чтобы инструменты были доступны.
- `npx skills add rohitg00/agentmemory` устанавливает skill'ы, чтобы агент знал, когда их вызывать.

Для немногих агентов, которые skills CLI пока не покрывает (Zed v1.3.x и ниже), разложите 17 файлов SKILL.md по нативному каталогу skill'ов агента самостоятельно; тот же формат работает везде.

#### Стандартный блок MCP

Запись agentmemory — это **один и тот же блок MCP-сервера** для всех хостов, использующих формат `mcpServers` (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI, OpenClaw):

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

**Вставьте эту запись в существующий объект `mcpServers`** в файле конфигурации хоста — не заменяйте сам файл. Если там уже есть другие серверы, добавьте `agentmemory` рядом с ними как новый ключ внутри `mcpServers`. Если `mcpServers` отсутствует совсем, вставьте блок внутрь `{ "mcpServers": { ... } }`. Подстановки `${VAR}` наследуют `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` из shell в момент запуска MCP-сервера; незаданные переменные передаются пустыми строками, и shim откатывается на `http://localhost:3111`. Одна подключённая запись покрывает как локальные, так и удалённые (k8s / reverse-proxied) развёртывания.

| Агент | Файл конфигурации | Заметки |
|---|---|---|
| **Cursor (только MCP)** | `~/.cursor/mcp.json` | Добавьте в `mcpServers`, либо используйте `agentmemory connect cursor`. На сайте также доступен deeplink в один клик. |
| **Cursor (полный плагин)** | `.cursor-plugin/` | Листинг в Cursor Marketplace (заявка на рассмотрении) либо Cursor Settings → Plugins → локальный checkout. Регистрирует 7 хуков авто-захвата (sessionStart, beforeSubmitPrompt, preToolUse, postToolUse, postToolUseFailure, stop, sessionEnd) + 17 skill'ов + MCP-сервер, причём `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` управляются в панели плагинов Cursor. Работает в Cursor IDE и в CLI `cursor-agent`; промпты в print-режиме CLI досчитываются из расшифровки сессии при её завершении. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Добавьте в `mcpServers`. После правки перезапустите Claude Desktop. |
| **Cline / Roo Code / Kilo Code** | Настройки MCP в Cline (Settings UI → MCP Servers → Edit) | Тот же блок `mcpServers`. |
| **Devin CLI (MCP + хуки)** | `~/.config/devin/config.json` | `agentmemory connect devin` добавляет MCP-запись; `--with-hooks` подключает шесть нативных hooks автозахвата (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd) с матчерами инструментов Devin в нижнем регистре. Проверьте через `devin mcp list` и `/hooks` внутри devin. |
| **Devin CLI (полный плагин)** | `plugin/.devin-plugin/` | `devin plugins install ./plugin` из checkout'а регистрирует все 17 skill'ов как slash-команды `/agentmemory:<skill>` плюс MCP-сервер. Хуки плагина Devin не могут сработать на `SessionStart`/`SessionEnd`, поэтому для полного захвата сессии сочетайте это с `connect devin --with-hooks`. |
| **Devin (облако)** | Settings → Connections → MCP servers | Добавьте пользовательский MCP (STDIO): command `npx`, args `-y @agentmemory/mcp@latest`, env `AGENTMEMORY_URL`, указывающий на доступное по сети развёртывание agentmemory, плюс `AGENTMEMORY_SECRET` (облачные сессии не могут достать до localhost — см. [`deploy/`](../deploy/)). Сохраните секрет в Devin Secrets, затем используйте «Test listing tools», чтобы убедиться, что появляются все 54 инструмента. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (автоматическое слияние). |
| **GitHub Copilot CLI (только MCP)** | `~/.copilot/mcp-config.json` | `agentmemory connect copilot-cli` вливает `mcpServers.agentmemory`; Copilot подхватывает при следующем запуске или по `/mcp`. |
| **GitHub Copilot CLI (полный плагин)** | Установка плагина Copilot | `copilot plugin install rohitg00/agentmemory:plugin` — плагин из GitHub-подкаталога. |
| **OpenClaw** | MCP-конфиг OpenClaw | Тот же блок `mcpServers`. Глубже: `openclaw plugins install ./integrations/openclaw` занимает слот памяти OpenClaw (автоматически переключается с `memory-core`); задайте `plugins.entries.agentmemory.hooks.allowConversationAccess=true`, иначе захват хода будет молча заблокирован. См. [`integrations/openclaw`](../integrations/openclaw/). |
| **Codex CLI (только MCP)** | `.codex/config.toml` | Формат TOML: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, либо добавьте `[mcp_servers.agentmemory]` вручную. |
| **Codex CLI (полный плагин)** | Маркетплейс плагинов Codex | `codex plugin marketplace add rohitg00/agentmemory`, затем `codex plugin add agentmemory@agentmemory`. Регистрирует MCP + 6 хуков жизненного цикла + 17 skill'ов. Подтвердите доверие к хукам и проверьте захват на вашем хосте; см. [установку и проверку Codex](../docs/plugins/codex-local.md). |
| **OpenCode (только MCP)** | `opencode.json` | Другая форма: корневой ключ `mcp`, команда задаётся массивом: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (полный плагин)** | `plugin/opencode/` | 22 хука авто-захвата по жизненному циклу сессии, сообщениям, инструментам и ошибкам. Атрибуция проекта задаётся на уровне сессии, поэтому один процесс OpenCode, охватывающий несколько репозиториев, кладёт каждую сессию в её собственный проект. Две slash-команды (`/recall`, `/remember`). Скопируйте `plugin/opencode/` в свой рабочий каталог OpenCode и добавьте запись плагина в `opencode.json`. Полная таблица хуков и анализ пробелов — в [`plugin/opencode/README.md`](../plugin/opencode/README.md). |
| **pi** | `~/.pi/agent/extensions/agentmemory` | `agentmemory connect pi` устанавливает встроенное расширение в каталог автообнаружения pi (recall при старте агента, захват при завершении, инструменты `memory_search` / `memory_save` / `memory_health`, `/agentmemory-status`). `/reload` в работающем pi подхватывает его. [`integrations/pi`](../integrations/pi/) — это также pi-пакет (`pi install ./integrations/pi` из checkout'а). |
| **Hermes Agent** | `~/.hermes/config.yaml` | `cp -r integrations/hermes ~/.hermes/plugins/agentmemory` + `memory.provider: agentmemory` включает провайдера памяти с 6 хуками (предзагрузка, захват хода, завершение сессии, предварительное сжатие, зеркалирование MEMORY.md, блок системного промпта). Проверьте через `hermes plugins doctor` и `hermes memory status`. См. [`integrations/hermes`](../integrations/hermes/). |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` записывает стандартный блок `mcpServers`. Payload хуков по полям совместим с Claude Code, поэтому существующие скрипты 12 хуков работают без изменений; подключите их через секцию `hooks` в том же `settings.json`. |
| **Antigravity IDE / 2.0** | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity --with-hooks` устанавливает MCP и хуки захвата в общем каталоге настроек. См. [установку и ограничения Antigravity](../docs/plugins/antigravity.md). |
| **Antigravity CLI** (`agy`) | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity-cli --with-hooks` использует ту же конфигурацию MCP и хуков, что и текущие версии IDE. Существующие установки следует обновить с `--force`; см. [заметки об обновлении](../docs/plugins/antigravity.md). |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` записывает конфиг на уровне пользователя. Переопределения на уровне workspace — в `.kiro/settings/mcp.json` рядом с кодом. |
| **Warp** | `~/.warp/.mcp.json` | `agentmemory connect warp` записывает стандартный блок `mcpServers`. Warp также автоматически обнаруживает skill'ы из `.claude/skills/`; как только установлен плагин Claude Code, 8 skill'ов agentmemory (`remember`, `recall`, `recap`, `handoff`, `forget`, `commit-context`, `commit-history`, `session-history`) нативно появляются в палитре slash-команд Warp. |
| **Cline (CLI)** | `~/.cline/mcp.json` | `agentmemory connect cline` записывает стандартный блок `mcpServers`. Пользователи расширения VS Code: вставьте тот же блок через Cline Settings → MCP Servers → Edit JSON. |
| **Continue.dev** | `~/.continue/config.yaml` (предпочтительно) или `config.json` (legacy) | `agentmemory connect continue` создаёт `config.yaml` с нуля, когда нет ни одного файла, либо изменяет существующий `config.json`. **Если у вас уже есть `config.yaml`**, адаптер печатает точный блок для вставки под `mcpServers:`; он не станет молча переписывать ваш yaml, потому что для безопасного сохранения комментариев и якорей нужен YAML-парсер, которого в пакете нет. Continue использует форму массива (а не объекта) для `mcpServers`. |
| **Zed** | `~/.config/zed/settings.json` | `agentmemory connect zed` пишет под `context_servers` (ключ Zed, НЕ `mcpServers`). Удалённые MCP-серверы можно вместо этого подключить через `{"url": "..."}`. |
| **Droid (Factory.ai)** | `~/.factory/mcp.json` | `agentmemory connect droid` записывает стандартный блок `mcpServers`. Переопределения на уровне проекта — в `<repo>/.factory/mcp.json`. Передайте `--with-hooks` для нативного авто-захвата. |
| **DeepSeek Harness** | `$DSH_HOME/cordis.patch.yml` | `agentmemory connect dsh` добавляет строку `@deepseek-ai/dsh-mcp-client` в патч-слой домашнего уровня, который загружает каждый профиль Harness; инструменты регистрируются как `mcp__agentmemory__*`. Передайте `--with-hooks`, чтобы также подключить авто-захват: встроенные скрипты хуков Claude Code выполняются через фирменный мост Harness `@deepseek-ai/dsh-hooks-claude-code` (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) по манифесту, записанному в `$DSH_HOME/agentmemory.hooks.json`. По умолчанию `~/.dsh`, когда `DSH_HOME` не задан. |
| **Goose** | UI настроек MCP в Goose | Тот же блок `mcpServers`; используйте `goose configure` → Add Extension → MCP. Прямое редактирование YAML в `~/.config/goose/config.yaml` поддерживается, но схема использует `extensions:` + `cmd` (а не `mcpServers:` + `command`). |
| **Aider** | н/д | Разговаривайте напрямую с REST API: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`. |
| **Любой агент (32+)** | н/д | `npx skillkit install agentmemory` сам определит хост и сольёт настройки. |

**MCP-клиенты в sandbox** (Flatpak / Snap / ограничивающие контейнеры), которые не могут добраться до `localhost` хоста: дополнительно установите `"AGENTMEMORY_FORCE_PROXY": "1"` в блоке `env` и укажите `AGENTMEMORY_URL` на маршрут, до которого sandbox действительно может дотянуться (например, IP в локальной сети).

### Программный доступ (Python / Rust / Node)

agentmemory регистрирует свои основные операции как iii-функции (`mem::remember`, `mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). Любой язык с SDK для iii может вызывать их напрямую через `ws://localhost:49134` — отдельный REST-клиент на каждый язык не требуется.

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

Рабочий пример: [`examples/python/`](../examples/python/) (быстрый старт + поток наблюдения/извлечения). REST на `:3111` остаётся доступным для хостов без iii-runtime.

### Из исходников

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

Это поднимает agentmemory с локальным `iii-engine`, если закреплённый бинарь уже установлен, либо откатывается к Docker Compose, если он выбран. REST, стримы и просмотрщик по умолчанию слушают на `127.0.0.1`. Автоматический путь установки бинаря на macOS/Linux требует `curl`, POSIX-совместимый `sh` и `tar`.

Установите `iii-engine` вручную. **agentmemory сейчас закреплён на `iii-engine` `v0.22.1`** — той же версии, что и его зависимость `iii-sdk`; воркер говорит на wire-протоколе именно этого движка, а 0.20.0 перестроил поверхность SDK, поэтому оба обновляются вместе в релизах agentmemory. Переопределите через `AGENTMEMORY_III_VERSION=<version>`, если запускаете собственный движок и уверены, что версии совпадают.

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSLo iii.tar.gz https://github.com/iii-hq/iii/releases/download/iii/v0.22.1/iii-aarch64-apple-darwin.tar.gz && echo "2b309019b909a896cae874dc947e2cdf877b4f3c51dd026b79850af858517fa4  iii.tar.gz" | shasum -a 256 -c - && tar -xzf iii.tar.gz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** замените `aarch64-apple-darwin` на `x86_64-apple-darwin`
- **Linux x64:** замените на `x86_64-unknown-linux-gnu`
- **Linux arm64:** замените на `aarch64-unknown-linux-gnu`
- **Windows:** скачайте `iii-x86_64-pc-windows-msvc.zip` из [iii-hq/iii releases v0.22.1](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.22.1) и распакуйте `iii.exe` в `%USERPROFILE%\.agentmemory\bin\iii.exe`

У каждого архива на странице релиза есть соответствующий файл `.sha256`; при смене платформы используйте хеш из этого файла в проверке выше (на Windows: `Get-FileHash`). Автоматический установщик в `npx @agentmemory/agentmemory` закрепляет эти хеши и отказывается принимать архив, который им не соответствует.

Либо используйте Docker (входящий в комплект `docker-compose.yml` тянет `iiidev/iii:0.22.1`). Полная документация: [iii.dev/docs](https://iii.dev/docs).

### Windows

agentmemory работает на Windows 10/11, но одного Node.js-пакета мало — также нужен закреплённый runtime iii-engine v0.22.1 как фоновый процесс. CLI не распаковывает Windows-архив автоматически, поэтому пользователям нативного Windows нужно установить `iii.exe` вручную, использовать WSL2 либо выбрать Docker Desktop.

Автоматизированное подключение MCP на нативном Windows поддерживает только `agentmemory connect copilot-cli`. Для Claude Code, Codex, Cursor и любого другого нативного Windows-агента скопируйте ручной блок MCP из раздела [Другие агенты](#other-agents) в конфиг этого агента на Windows. Запуск `connect` в WSL имеет смысл только тогда, когда целевой агент также установлен в том же окружении WSL; он не редактирует конфигурацию агента, запущенного на хосте Windows.

**Вариант A: готовый Windows-бинарь (рекомендуется)**

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

**Вариант B: Docker Desktop**

```powershell
# 1. Install Docker Desktop for Windows
# 2. Start Docker Desktop and make sure the engine is running
# 3. Select Docker explicitly and run agentmemory:
$env:AGENTMEMORY_USE_DOCKER = "1"
npx -y @agentmemory/agentmemory@latest
```

**Вариант C: только standalone MCP (без движка).** Если вам нужны только MCP-инструменты для агента и не нужны REST API, просмотрщик или cron-задачи, пропустите движок целиком:

```powershell
npx -y @agentmemory/agentmemory@latest mcp
# or via the shim package:
npx -y @agentmemory/mcp
```

**Диагностика на Windows:** если `npx -y @agentmemory/agentmemory@latest` падает, перезапустите с `--verbose`, чтобы увидеть реальный stderr движка. Частые сценарии сбоя:

| Симптом | Решение |
|---|---|
| `The engine process started but the REST API never responded.` | Убедитесь, что все четыре вычисленных порта свободны, проверьте, что закреплённый `iii.exe` остался жив, затем перезапустите с `--verbose` и изучите захваченный stderr движка |
| `Could not start iii-engine` | Не установлены ни `iii.exe`, ни Docker. См. варианты A или B выше |
| Конфликт порта | `netstat -ano \| findstr :3111`, чтобы понять, что занято, затем убить процесс или использовать `--port <N>` |
| Откат на Docker пропускается, хотя Docker установлен | Убедитесь, что Docker Desktop действительно запущен (иконка в трее) |

> Примечание: iii **engine** — это готовый бинарь, а не cargo-крейт, поэтому не пытайтесь установить его через `cargo install`. (**SDK** iii опубликованы на crates.io, npm и PyPI, но agentmemory они не нужны.) Все поддерживаемые способы установки движка закреплены на v0.22.1: готовый бинарь выше, автоматический путь установки agentmemory для macOS/Linux (нужны `curl`, POSIX `sh` и `tar`) и Docker-образ `iiidev/iii:0.22.1`. Обычный upstream `install.sh | sh` устанавливает последний движок, который agentmemory не поддерживает. Используйте `npx -y @agentmemory/agentmemory@latest`; на macOS/Linux он сам загрузит закреплённый движок в `~/.agentmemory/bin`.

---

<h2 id="deploy">Развёртывание</h2>

Шаблоны в один клик для managed-хостов. Каждый поставляет автономный
Dockerfile, который тянет `@agentmemory/agentmemory` из npm и копирует
бинарь движка iii из официального образа `iiidev/iii` на Docker Hub;
собственный пресобранный образ agentmemory не нужен. Постоянное
хранилище монтируется в `/data`; entrypoint при первом запуске
перезаписывает поставляемый npm'ом iii-конфиг (который слушает на
`127.0.0.1`) на вариант, настроенный для деплоя, слушающий на
`0.0.0.0` и использующий абсолютные пути `/data`, генерирует
HMAC-секрет, а затем понижает привилегии с `root` до `node` через
`gosu` перед запуском CLI agentmemory.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

Кнопке Render «деплой в один клик» нужен `render.yaml` в корне репозитория, который мы намеренно держим чистым. Используйте поток Render Blueprint, описанный в [`deploy/render/`](.././deploy/render/README.md), чтобы вручную указать на blueprint внутри репозитория.

Полные детали настройки (захват HMAC, SSH-туннель к просмотрщику, ротация, бэкап, нижние пороги стоимости) — в [`deploy/`](.././deploy/README.md):

- [`deploy/fly`](.././deploy/fly/README.md): одна машина с
  `auto_stop_machines = "stop"`; дешевле всего в простое.
- [`deploy/railway`](.././deploy/railway/README.md): фиксированный тариф Hobby,
  том в панели.
- [`deploy/render`](.././deploy/render/README.md): поток Blueprint,
  автоматические снапшоты диска на платных тарифах.
- [`deploy/coolify`](.././deploy/coolify/README.md): self-hosted на собственном
  VPS через [Coolify](https://coolify.io/self-hosted); тот же стек Docker
  Compose, хост и данные остаются у вас.

Публикуется только порт `3111`. Просмотрщик на `3113` остаётся
привязанным к loopback внутри контейнера; в README каждого шаблона
описан паттерн SSH-туннеля для доступа к нему.

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Зачем agentmemory" height="32" /></picture></h2>

Каждый агент программирования забывает всё, когда сессия заканчивается, и каждая новая сессия начинается с того, что вы заново объясняете свой стек. agentmemory работает в фоне и убирает этот шаг.

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

### vs встроенная память агента

Каждый ИИ-агент программирования поставляется со встроенной памятью: у Claude Code есть `MEMORY.md`, у Cursor — notepad'ы, у Cline — memory bank. Они работают как стикеры. agentmemory — это индексируемая база данных за этими стикерами.

| | Встроенная (CLAUDE.md) | agentmemory |
|---|---|---|
| Масштаб | Потолок в 200 строк | Без ограничений |
| Поиск | Загружает всё в контекст | BM25 + вектор + граф (только top-K) |
| Цена в токенах | 22K+ при 240 наблюдениях | ~1,900 токенов (на 92% меньше) |
| Между агентами | Файлы на каждого агента | MCP + REST (любой агент) |
| Координация | Нет | Lease'ы, сигналы, action'ы, routine'ы |
| Наблюдаемость | Читать файлы вручную | Просмотрщик в реальном времени на :3113 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="Как это работает" height="32" /></picture></h2>

### Конвейер памяти

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

### 4-уровневая консолидация памяти

Смоделировано по тому, как человеческий мозг обрабатывает память, включая консолидацию во время сна.

| Уровень | Что | Аналогия |
|------|------|---------|
| **Working** | Сырые наблюдения от использования инструментов | Кратковременная память |
| **Episodic** | Сжатые краткие итоги сессий | «Что произошло» |
| **Semantic** | Извлечённые факты и закономерности | «Что я знаю» |
| **Procedural** | Workflow'ы и паттерны принятия решений | «Как это сделать» |

Воспоминания затухают со временем (кривая Эббингауза). Часто используемые воспоминания усиливаются. Устаревшие автоматически вытесняются. Противоречия обнаруживаются и разрешаются.

### Что захватывается

| Хук | Захватывает |
|------|----------|
| `SessionStart` | Путь к проекту, идентификатор сессии |
| `UserPromptSubmit` | Пользовательские промпты (с приватным фильтром) |
| `PreToolUse` | Паттерны доступа к файлам + обогащённый контекст |
| `PostToolUse` | Имя инструмента, вход, выход |
| `PostToolUseFailure` | Контекст ошибки |
| `PreCompact` | Заново подмешивает память перед компакцией |
| `SubagentStart/Stop` | Жизненный цикл подагентов |
| `Stop` | Итог в конце сессии |
| `SessionEnd` | Маркер завершения сессии |

### Ключевые возможности

| Возможность | Описание |
|---|---|
| **Автоматический захват** | Каждое использование инструмента записывается через хуки, без ручных усилий |
| **Семантический поиск** | BM25 + векторный + граф знаний со слиянием RRF |
| **Эволюция памяти** | Версионирование, supersession, графы связей |
| **Гигиена recall** | Вытесненные (superseded) версии памяти покидают поисковые индексы; цепочка версий в KV хранит полную историю |
| **Подсказки о почти-дубликатах** | Сохранения возвращают консультативное совпадение `similarTo`, когда новый контент близко напоминает существующую запись |
| **Scope на агента** | `agentId` проходит через сохранение и recall в REST, MCP и поисковом индексе, в режиме shared или isolated |
| **Происхождение при записи** | Каждое наблюдение и запись памяти несёт неизменяемый канал происхождения (user, agent, tool, import или shared), проставляемый при захвате, сохранении и импорте |
| **Авто-забывание** | Истечение TTL, обнаружение противоречий, вытеснение по важности |
| **Privacy first** | API-ключи, секреты, теги `<private>` вырезаются до сохранения |
| **Самовосстановление** | Circuit breaker, цепочка fallback-провайдеров, мониторинг состояния |
| **Claude bridge** | Двусторонняя синхронизация с MEMORY.md |
| **Граф знаний** | Извлечение сущностей + обход BFS |
| **Командная память** | Отдельные namespace'ы для общего и приватного у участников команды |
| **Происхождение цитат** | Любую запись памяти можно проследить до исходных наблюдений |
| **Git-снапшоты** | Версионирование, откат и diff состояния памяти |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Поиск" height="32" /></picture></h2>

Тройной поток извлечения, объединяющий три сигнала:

| Поток | Что делает | Когда |
|---|---|---|
| **BM25** | Сопоставление по стеммированным ключевым словам с расширением синонимами | Всегда включён |
| **Vector** | Косинусное сходство по плотным эмбеддингам | Если настроен embedding-провайдер |
| **Graph** | Обход графа знаний по сопоставлению сущностей | Если в запросе обнаружены сущности |

Сливаются через Reciprocal Rank Fusion (RRF, k=60) и диверсифицируются по сессиям (не более 3 результатов на сессию).

Когда векторный индекс заполнен, `mem::search` (за которым стоит `memory_recall`) использует гибридный ранжировщик BM25 + вектор. Без эмбеддингов используется BM25. `smart-search` может дополнительно сливать структурные совпадения из графа, если граф-данные существуют, в том числе в режиме без ключей. Recall уроков работает на выделенном in-memory BM25-индексе вместо сканирования всего корпуса на каждый запрос. Вытесненные (superseded) версии памяти исключаются из каждого пути recall; цепочка версий хранит их историю.

Векторы переживают крэш или force-kill. Векторный индекс сохраняется бакетами не чаще, чем раз в `AGENTMEMORY_INDEX_SAVE_INTERVAL_MS` (10 минут). Каждый добавленный или удалённый в промежутке вектор также сразу записывается в небольшой отложенный лог в state store, и при следующем запуске он воспроизводится без обращения к провайдеру эмбеддингов. Каждое успешное сохранение очищает лог. Документы, у которых после воспроизведения всё ещё нет вектора, переэмбеддятся в фоне партиями по `AGENTMEMORY_VECTOR_BACKFILL_MAX` (500), пока не останется ни одного, а остановленный backfill продолжается при следующем запуске. `/agentmemory/status` и просмотрщик показывают размер отложенного лога и состояние backfill'а. Установки без ключей ничего не пишут.

BM25 «из коробки» токенизирует греческий, кириллицу, иврит, арабский и латиницу с диакритикой. Для записей на китайском / японском / корейском поставьте опциональные сегментаторы (`npm install @node-rs/jieba tiny-segmenter`), чтобы разбивать CJK-последовательности на токены уровня слова; без них agentmemory мягко откатывается к токенизации целых последовательностей и один раз выводит подсказку в stderr.

### Провайдеры эмбеддингов

Установки без ключей отключают векторные эмбеддинги: `mem::search` использует BM25, а `smart-search` может также использовать существующие структурные граф-данные. Чтобы подключить бесплатные семантические эмбеддинги на устройстве, добавьте это в `~/.agentmemory/.env` и перезапустите agentmemory:

```env
EMBEDDING_PROVIDER=local
```

Обычная установка npm включает опциональный runtime `@huggingface/transformers`. Первый запрос эмбеддинга скачивает `Xenova/all-MiniLM-L6-v2`, поэтому нужен доступ к сети и это может занять больше времени; последующий инференс выполняется на устройстве. Удалённые провайдеры определяются автоматически по их ключам, если только `EMBEDDING_PROVIDER` не переопределяет их.

| Провайдер | Модель | Стоимость | Заметки |
|---|---|---|---|
| **Локально (рекомендуется для подключения)** | `all-MiniLM-L6-v2` | Бесплатно | На устройстве после первой загрузки модели, +8 пп recall по сравнению только с BM25 |
| Gemini | `gemini-embedding-001` | Бесплатный тариф | 100+ языков, размерности 768/1536/3072 (MRL), вход 2048 токенов. Заменяет `text-embedding-004` ([устарел, отключение 14 янв. 2026](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | Высочайшее качество |
| Voyage AI | `voyage-code-3` | Платно | Оптимизирован под код |
| Cohere | `embed-english-v3.0` | Бесплатная пробная версия | Общего назначения |
| OpenRouter | Любая модель | Зависит | Мульти-модельный прокси |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP-сервер" height="32" /></picture></h2>

54 инструмента, 6 ресурсов, 3 промпта и 17 skill'ов.

> **MCP-shim против полного сервера:** опубликованный пакет `@agentmemory/mcp` — это тонкий shim. Он раскрывает полную поверхность из 54 инструментов **только если может достучаться до работающего сервера agentmemory** через `AGENTMEMORY_URL` (режим прокси). Если сервер недоступен, shim откатывается к локальному набору из 7 инструментов (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). Переменная окружения `AGENTMEMORY_TOOLS=core|all` — это *серверный* флаг; задавать её в блоке `env` shim'а бесполезно. Если в Cursor / OpenCode / Gemini CLI видно только 7 инструментов, запустите `npx -y @agentmemory/agentmemory@latest` (или Docker-стек) и установите `AGENTMEMORY_URL=http://localhost:3111`.

### 54 инструмента

Три поверхности инструментов, от меньшей к большей: `AGENTMEMORY_TOOLS=core` сужает видимость до 8 основных (`memory_save`, `memory_recall`, `memory_consolidate`, `memory_smart_search`, `memory_sessions`, `memory_diagnose`, `memory_lesson_save`, `memory_reflect`); базовый набор ниже — это 14 фундаментальных инструментов реестра; значение по умолчанию (`AGENTMEMORY_TOOLS=all`) раскрывает все 54.

<details>
<summary>Базовые инструменты (14)</summary>

| Инструмент | Описание |
|------|-------------|
| `memory_recall` | Искать в прошлых наблюдениях |
| `memory_compress_file` | Сжимать markdown-файлы с сохранением структуры |
| `memory_save` | Сохранить инсайт, решение или паттерн |
| `memory_file_history` | Прошлые наблюдения о конкретных файлах |
| `memory_patterns` | Выявить повторяющиеся паттерны |
| `memory_sessions` | Список последних сессий |
| `memory_smart_search` | Гибридный семантический + keyword-поиск |
| `memory_vision_search` | Поиск по наблюдениям-изображениям |
| `memory_timeline` | Хронологические наблюдения |
| `memory_profile` | Профиль проекта (концепции, файлы, паттерны) |
| `memory_export` | Экспортировать все данные памяти |
| `memory_relations` | Запрос к графу связей |
| `memory_commit_lookup` | Сессии, стоящие за git-коммитом |
| `memory_commits` | Коммиты, записанные для сессии |

</details>

<details>
<summary>Расширенные инструменты (всего 54, поверхность по умолчанию)</summary>

| Инструмент | Описание |
|------|-------------|
| `memory_patterns` | Выявить повторяющиеся паттерны |
| `memory_timeline` | Хронологические наблюдения |
| `memory_relations` | Запрос к графу связей |
| `memory_graph_query` | Обход графа знаний |
| `memory_consolidate` | Запустить 4-уровневую консолидацию |
| `memory_claude_bridge_sync` | Синхронизация с MEMORY.md |
| `memory_team_share` | Поделиться с участниками команды |
| `memory_team_feed` | Недавно расшаренные элементы |
| `memory_audit` | Аудит-журнал операций |
| `memory_governance_delete` | Удалить с записью в аудит-журнал |
| `memory_snapshot_create` | Снапшот, версионированный в git |
| `memory_action_create` | Создать задачи с зависимостями |
| `memory_action_update` | Обновить статус action |
| `memory_frontier` | Разблокированные action'ы, отсортированные по приоритету |
| `memory_next` | Самый важный следующий action |
| `memory_lease` | Эксклюзивные lease'ы для action'ов (мультиагентность) |
| `memory_routine_run` | Инстанцировать workflow-routine'ы |
| `memory_signal_send` | Межагентный обмен сообщениями |
| `memory_signal_read` | Чтение сообщений с подтверждениями |
| `memory_checkpoint` | Внешние условные шлюзы |
| `memory_mesh_sync` | P2P-синхронизация между инстансами |
| `memory_sentinel_create` | События-наблюдатели |
| `memory_sentinel_trigger` | Запустить sentinel'ы извне |
| `memory_sketch_create` | Эфемерные графы action'ов |
| `memory_sketch_promote` | Перевести в постоянное состояние |
| `memory_crystallize` | Сжать цепочки action'ов |
| `memory_diagnose` | Проверки состояния |
| `memory_heal` | Авто-исправление зависшего состояния |
| `memory_facet_tag` | Теги вида измерение:значение |
| `memory_facet_query` | Запрос по фасет-тегам |
| `memory_verify` | Трассировка происхождения |

</details>

### 6 ресурсов · 3 промпта · 17 skill'ов

| Тип | Имя | Описание |
|------|------|-------------|
| Ресурс | `agentmemory://status` | Состояние, число сессий, число записей памяти |
| Ресурс | `agentmemory://project/{name}/profile` | Интеллект на уровне проекта |
| Ресурс | `agentmemory://project/{name}/recent` | Последние наблюдения по проекту |
| Ресурс | `agentmemory://memories/latest` | 10 последних активных записей памяти |
| Ресурс | `agentmemory://graph/stats` | Статистика графа знаний |
| Ресурс | `agentmemory://team/{id}/profile` | Общий профиль команды |
| Промпт | `recall_context` | Поиск + возврат контекстных сообщений |
| Промпт | `session_handoff` | Передача данных между агентами |
| Промпт | `detect_patterns` | Анализ повторяющихся паттернов |
| Skill | `/recall` | Поиск по памяти |
| Skill | `/remember` | Сохранение в долговременную память |
| Skill | `/session-history` | Краткие итоги последних сессий |
| Skill | `/forget` | Удаление наблюдений/сессий |

В таблице показаны четыре основных skill'а. Полный набор — 9 вызываемых skill'ов плюс 8 справочных; см. раздел про нативные skill'ы выше.

### Standalone MCP

Запуск без полного сервера — для любого MCP-клиента. Подойдёт любое:

```bash
npx -y @agentmemory/agentmemory@latest mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

Или добавьте в MCP-конфиг своего агента:

Большинство агентов (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI):
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

Вставьте запись `agentmemory` в существующий объект `mcpServers` хоста, а не заменяйте файл. Для sandbox-клиентов, которые не могут добраться до `localhost` хоста, добавьте `"AGENTMEMORY_FORCE_PROXY": "1"` в блок env и укажите `AGENTMEMORY_URL` на маршрут, доступный из sandbox.

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

Скопируйте файл плагина из репозитория:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Просмотрщик реального времени" height="32" /></picture></h2>

Автоматически запускается на порту `3113`. Просмотрщик загружает один снапшот при подключении (`GET /agentmemory/viewer/snapshot`), а затем применяет события живого стрима: новые записи памяти, уроки, наблюдения, записи аудита, изменения графа и обновления состояния появляются без опроса и перезагрузок страницы. Единственные другие запросы — это действия, на которые вы кликаете, страницы «load more» и поиск. Когда стрим отваливается, просмотрщик показывает, насколько устарели его числа, переподключается с backoff и ресинхронизируется с одного снапшота.

- **12 вкладок в четырёх группах** с живыми счётчиками, глубокими ссылками (`#memories/<id>`, `#sessions/<id>?obs=<id>`, `#graph/<id>`, `#health/consolidation`), горячими клавишами и мобильным меню.
- **Memories:** поиск на стороне сервера, фильтры по проекту, агенту и типу, панель деталей с цепочкой версий и word diff, ссылки на происхождение, кнопки копирования id, вызова MCP и команды curl, редактирование (новая версия), forget с подтверждением, массовый forget и экспорт в JSON.
- **Sessions:** встроенный таймлайн наблюдений с читаемым входом и выходом инструментов, фильтры и постраничная навигация, а также записи памяти и уроки, которые произвела каждая сессия.
- **Graph:** поиск, детали узла со связями и источниками, легенда, не зависящая только от цвета, и управление масштабом.
- **Health:** живая версия `GET /agentmemory/status`. Для каждой проблемы указано её решение, плюс backend состояния, состояние сохранения индекса, прогресс компакции происхождения графа и объяснение консолидации с реальными порогами.
- Страницы **Audit, Activity, Profile, Replay, Lessons, Actions и Crystals**, у каждой — пустое состояние, объясняющее, что это за раздел, почему он пуст и какая команда его заполнит, а также подсказка-глоссарий `?` на каждом термине и числе.

```bash
open http://localhost:3113
```

Сервер просмотрщика по умолчанию слушает на `127.0.0.1` и подставляет серверный секрет, когда перенаправляет запросы к REST API, так что отдельная настройка не нужна. Эндпоинт `/agentmemory/viewer`, отдаваемый REST'ом, подчиняется обычным правилам bearer-токена и перенаправляет браузеры без токена на порт просмотрщика. Заголовки CSP используют nonce скрипта на каждый ответ и отключают inline-атрибуты-обработчики (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

Просмотрщик на `:3113` показывает, что ваш агент **запомнил**. [iii console](https://iii.dev/docs/console) показывает, что ваш агент **сделал**: каждая операция памяти как трейс OpenTelemetry, каждая запись KV редактируема, каждая функция вызываема, каждый стрим тэппится. Два окна на одну и ту же память: одно повёрнуто к продукту, другое к движку.

Наблюдайте, как срабатывает `memory_smart_search`, и видите BM25-скан → поиск эмбеддингов → RRF-слияние → reranker в виде waterfall. Отредактируйте зависший таймер консолидации в браузере KV. Воспроизведите хук `PostToolUse` с изменённым payload. Закрепите WebSocket-стрим — и смотрите, как наблюдения прилетают в реальном времени.

agentmemory отдаёт это бесплатно, потому что каждый вызов функции и каждый триггер проходит через iii; ничего самописного, нечего инструментировать.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="Страница Workers в iii console: подключённые воркеры, включая инстансы agentmemory, с живым числом функций и метаданными runtime" width="720" />
  <br/>
  <em>Страница Workers: каждый подключённый воркер, включая сам agentmemory, с PID, числом функций, runtime и временем последнего появления.</em>
</p>

**Уже установлено.** Console поставляется вместе с закреплённым движком `iii` (0.22+); отдельно устанавливать ничего не нужно. При первом запуске бинарь console скачивается рядом с движком.

**Запуск рядом с agentmemory:**

```bash
agentmemory console
```

Это запускает `iii console` закреплённого движка против портов, которые вычислил agentmemory (REST, стримы, bridge), и отдаёт его на порт выше просмотрщика — по умолчанию `http://localhost:3114`. `--console-port N` выбирает другой порт; `--port` и `--instance` выбирают инстанс agentmemory так же, как для `stop`; любой другой флаг передаётся дальше, например `--enable-flow` для экспериментальной страницы графа архитектуры.

То же самое вручную — пригодится, когда `agentmemory` не в PATH:

```bash
~/.agentmemory/bin/iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**Что можно делать из console:**

| Страница | Зачем |
|------|-----------|
| **Workers** | Видеть каждый подключённый воркер и его живые метрики, включая сам воркер agentmemory. |
| **Functions** | Напрямую вызывать любую функцию agentmemory с JSON-payload; удобно для тестов `memory.recall`, `memory.consolidate`, `graph.query` без подключения клиента. |
| **Triggers** | Воспроизводить HTTP-, cron-, event- и state-триггеры: запустить cron консолидации вручную, повторить HTTP-маршрут, эмитировать изменение состояния. |
| **States** | KV-браузер с полным CRUD по сессиям, слотам памяти, lifecycle-таймерам и индексу эмбеддингов; редактирование значений на месте. |
| **Streams** | Живой WebSocket-монитор для записей памяти, событий хуков и обновлений наблюдений по мере их прохождения через iii-стримы. |
| **Queues** | Долговечные топики очередей + управление dead-letter. Повтор или сброс упавших job'ов эмбеддинга / компрессии. |
| **Traces** | Виды waterfall / flame / разбивка по сервисам в OpenTelemetry. Фильтр по `trace_id` показывает, какие функции, обращения к БД и embedding-запросы породил отдельный `memory.search`. |
| **Logs** | Структурированные OTEL-логи, фильтруемые и коррелируемые с trace-/span-ID. |
| **Config** | Конфигурация runtime: какие именно воркеры, провайдеры и порты использует ваш движок. |
| **Flow** | (Опционально, `--enable-flow`) Интерактивный граф архитектуры из всех воркеров, триггеров и стримов. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="Просмотр trace-waterfall в iii console с длительностью каждого span" width="720" />
  <br/>
  <em>Traces: waterfall / flame / разбивка по сервисам для каждой операции памяти.</em>
</p>

**Traces уже включены:**

`iii-config.yaml` поставляется с включённым воркером `iii-observability` (`exporter: memory`, `sampling_ratio: 0.1`, метрики + логи). Дополнительная настройка не нужна: как только agentmemory запускается, каждая операция памяти эмитит структурированный лог, который может прочитать console, а каждая десятая из них (`sampling_ratio: 0.1`) ещё и trace-span.

Если вместо этого вы хотите экспортировать в Jaeger/Honeycomb/Grafana Tempo, замените `exporter: memory` на `exporter: otlp` и укажите эндпоинт коллектора согласно документации iii по observability.

> **Внимание:** на самой console аутентификация не применяется; держите её привязанной к `127.0.0.1` (по умолчанию) и никогда не выставляйте наружу.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory — это **уже работающий инстанс [iii](https://iii.dev)**. Три примитива (worker, function, trigger) составляют runtime; KV-состояние, стримы и OTEL-трейсы дают воркеры iii-state, iii-stream и iii-observability, поставляемые вместе с iii. Вы не ставили Postgres, Redis, Express, pm2 или Prometheus, потому что iii их заменяет.

Это значит, что одна дополнительная команда расширяет agentmemory целой новой возможностью.

### Расширить agentmemory дополнительными воркерами

Встроенные воркеры, нужные agentmemory, уже прописаны в `iii-config.yaml` и загружаются вместе с ним: `iii-state` (KV), `iii-queue` (надёжные повторы для подписчиков событий), `iii-pubsub`, `iii-cron`, `iii-stream` и `iii-observability` (OTEL-трейсы, метрики и логи на каждой функции). Всё остальное из [реестра воркеров iii](https://workers.iii.dev) подключается к тому же движку: скопируйте `iii-config.yaml` в `~/.agentmemory/iii-config.yaml` (CLI предпочитает этот файл перед встроенным и всё равно подставляет в него порты и пути данных), добавьте запись, установите runtime воркера один раз через `~/.agentmemory/bin/iii update worker` и перезапустите agentmemory.

```yaml
workers:
  # ...the bundled entries...
  - name: database          # SQL-backed state adapter when you outgrow the KV defaults
  - name: iii-sandbox       # run code that came out of memory_recall inside a throwaway VM
  - name: mcp               # extra MCP servers next to agentmemory's, same engine
```

| Воркер | Что вы получаете сверху к agentmemory |
|---|---|
| [`database`](https://workers.iii.dev/workers/database) | SQL-адаптер состояния, когда дефолтная in-memory KV уже мала |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | Код, пришедший из `memory_recall`, исполняется внутри одноразовой VM, а не в вашем shell |
| [`mcp`](https://workers.iii.dev/workers/mcp) | Поднять дополнительные MCP-серверы рядом с MCP agentmemory, на том же движке |

На движке 0.22.x сохраняйте имена с префиксом `iii-` для встроенных воркеров выше; записи без префикса `http`, `state`, `queue`, `pubsub` и `cron` — это отдельные воркеры из реестра, на которые agentmemory переходит при миграции на 0.23.

Полный реестр: [workers.iii.dev](https://workers.iii.dev). Каждый воркер там собирается из тех же примитивов, что и agentmemory, — и agentmemory, который у вас уже есть, — один из них.

### Конфигурация движка и адрес привязки

`agentmemory start` читает конфиг движка из первого существующего файла: `AGENTMEMORY_III_CONFIG`, `./iii-config.yaml` в текущем каталоге, `~/.agentmemory/iii-config.yaml`, затем встроенный `iii-config.yaml`. При каждом запуске он подставляет в этот файл значения (пути данных, порты, backend состояния) в `~/.agentmemory/data/iii-config.runtime.yaml` и запускает движок с отрендеренной копией, поэтому редактируйте исходный файл, а не отрендеренный. Значения `host:` из исходного файла сохраняются как написаны.

Встроенный `iii-config.yaml` намеренно слушает `127.0.0.1`, и это значение по умолчанию действует и внутри контейнера. CLI, запущенный в контейнере, слушает loopback контейнера, поэтому опубликованные порты никуда не ведут. Чтобы отдавать CLI в контейнере через опубликованные порты, задайте `AGENTMEMORY_III_CONFIG` на конфиг, который слушает `0.0.0.0`. Поставляемый `iii-config.docker.yaml` — именно такой: он привязывает `iii-http`, `iii-stream` и порт движка к `0.0.0.0` и хранит состояние в `/data`, так что смонтируйте туда доступный на запись том. Держите `AGENTMEMORY_SECRET` заданным и публикуйте только нужные вам порты — на `127.0.0.1` либо за доверенным прокси.

`docker-compose.yml` этого репозитория не проходит через поиск конфига CLI: он монтирует `iii-config.docker.yaml` в `/app/config.yaml`, и контейнер `iii-engine` запускается с `--config /app/config.yaml`. Шаблоны [деплоя в один клик](../deploy/) пишут собственный конфиг `0.0.0.0` в своих entrypoint'ах.

### Backend хранения: file (по умолчанию) против redis

`iii-state` и `iii-stream` по умолчанию используют встроенное в iii-engine файловое KV-хранилище: один JSON-файл на scope, хранящийся в памяти процесса движка и перезаписываемый на диск по таймеру. Это правильное значение по умолчанию для локальной однопользовательской установки; общий демон с несколькими одновременными писателями вместо этого получает настоящую запись по ключу через Redis — за счёт сетевого round-trip на операцию (каждый вызов `state::*` всё равно сериализуется на одном Redis-соединении, так что это меняет блокировку файлового хранилища на сокет, а не на параллелизм).

Задайте `AGENTMEMORY_STATE_BACKEND=redis` (плюс `AGENTMEMORY_REDIS_URL`), чтобы переключить оба воркера на встроенный в iii-engine адаптер `redis`, который хранит каждый ключ как поле Redis-хеша (`HSET`) вместо перезаписи всего scope при каждой записи:

```env
# ~/.agentmemory/.env
AGENTMEMORY_STATE_BACKEND=redis
AGENTMEMORY_REDIS_URL=redis://localhost:6379
```

`AGENTMEMORY_STATE_BACKEND` по умолчанию равен `file`; если не задавать его, сегодняшнее поведение не меняется, а нераспознанное значение (что угодно, кроме `file` или `redis`) — это ошибка запуска, а не тихий fallback. `/agentmemory/status` и страница Health просмотрщика (строка State store) сообщают, какой backend активен и отвечает ли он, но никогда не показывают URL.

**Только простой `redis://`.** Закреплённый движок (0.22.1) собирает свой Redis-клиент без поддержки TLS, поэтому URL `rediss://` (большинство managed-предложений Redis, таких как Upstash, Redis Cloud и ElastiCache с шифрованием в пути, по умолчанию работают только через TLS) не подключается. Соединение нешифрованное, поэтому пароль Redis и каждая сохранённая запись памяти идут по проводу в открытом виде: указывайте на локальный Redis либо на Redis в доверенной приватной сети. Для любого другого Redis поднимите зашифрованный туннель (stunnel, SSH или VPN) на хосте agentmemory, чтобы простой переход `redis://` оставался на этом хосте, а восходящее соединение туннеля было зашифровано и аутентифицировано. Если пароль Redis содержит одиночную кавычку, percent-encode её (`%27`); движок подставляет URL в свой YAML-конфиг до разбора.

**Один сервер Redis на `--instance`.** Префиксы Redis-ключей движка (`state:<scope>`, `stream:<name>:<group>`) фиксированы, поэтому два инстанса agentmemory (`--instance 1`, `--instance 2`, ...), указывающие на одну базу данных, перезаписывают данные друг друга. Отдельный индекс базы данных (`redis://localhost:6379/1`) разделяет сохранённые данные, но движок передаёт живые события просмотрщика через один Redis pub/sub-канал (`stream::events`), а Redis pub/sub игнорирует индекс базы данных, так что просмотрщик каждого инстанса всё равно будет показывать живые события другого. Выделяйте каждому инстансу собственный сервер Redis (или порт), если запускаете больше одного.

**Что остаётся тем же, а что отличается.** На Redis работает каждая функция agentmemory: сессии, наблюдения, записи памяти (remember, supersede, evolve, forget), поиск и бакеты индекса, уроки, граф, аудит-журнал и его месячные scope'ы, экспорт и импорт, governance-удаления, статус консолидации, снапшот просмотрщика и его живой стрим, а также монитор состояния. Движок хранит каждый scope как один Redis-хеш (`HSET`/`HGET`/`HGETALL`) и порождает те же state-триггеры, что и файловое хранилище. Три отличия движка обрабатываются внутри agentmemory:

- Redis возвращает записи scope'а в произвольном порядке. agentmemory сортирует их от самых старых (по времени создания в id записи, затем по её timestamp'у), чтобы списки, постраничная навигация и чанки экспорта возвращались в том же порядке, что и на файловом хранилище.
- Движок применяет частичные обновления на Redis через Lua-скрипт, который превращает пустые массивы в пустые объекты. agentmemory применяет эти обновления сам (чтение, изменение, запись под блокировкой на ключ) на Redis, поэтому поля вроде `tags: []` остаются массивами.
- Проверка унаследованного аудит-журнала читает старый scope из Redis вместо поиска файла файлового хранилища на диске.

Одно отличие требует вашего участия: **после перезапуска Redis движок перестаёт передавать живые события** просмотрщику, пока agentmemory не перезапустят. Данные всё равно сохраняются и читаются нормально. Монитор состояния отправляет тестовое событие через Redis каждые 30 секунд; когда оно не возвращается, `/agentmemory/status` и страница Health просмотрщика показывают «Живые обновления не доходят до просмотрщика» с решением: перезапустить agentmemory. Если Redis недоступен, отчёт о статусе показывает «State store не отвечает» и как это проверить (`redis-cli -u "$AGENTMEMORY_REDIS_URL" ping`). Листинг очень большого scope'а читает весь хеш за один `HGETALL` — та же цена, что и хранение его в памяти файловым хранилищем.

**Рекомендуемые настройки Redis.** Политика снапшотов по умолчанию `save 3600 1 300 100 60 10000` может потерять минуты записей при крэше — хуже, чем окно сброса в 5 секунд у файлового хранилища. Задайте `appendonly yes` для всего, потерю чего вам было бы жаль. Задайте `maxmemory-policy noeviction`; `allkeys-lru` или похожие молча отбрасывают записи памяти, как только Redis упирается в лимит памяти.

Нативный запуск (не Docker), а также каждый [шаблон деплоя в один клик](../deploy/) (они перезаписывают встроенный `iii-config.yaml` и стартуют нативно) читают `AGENTMEMORY_STATE_BACKEND`/`AGENTMEMORY_REDIS_URL` и подставляют их в запускаемый `iii-config`. Сам URL никогда не записывается в этот отрендеренный файл — только ссылка `${AGENTMEMORY_REDIS_URL}`, которую процесс движка раскрывает из собственного окружения при загрузке. Только собственный путь Docker Compose этого репозитория (`AGENTMEMORY_USE_DOCKER=1`, либо возобновление движка, уже запущенного так) монтирует `iii-config.docker.yaml` только для чтения и никогда не рендерит его; `agentmemory start` предупреждает, когда обнаруживает такое сочетание. Меняйте этот файл вручную, следуя той же форме `name: redis` / `config: redis_url: ...`, показанной в документации воркеров [iii-state](https://workers.iii.dev/workers/iii-state) и [iii-stream](https://workers.iii.dev/workers/iii-stream), и указывайте `redis_url` на Redis, доступный из контейнера. `docker-compose.yml` передаёт `AGENTMEMORY_REDIS_URL` в контейнер движка, так что там работает `redis_url: '${AGENTMEMORY_REDIS_URL}'`, и URL не попадает в смонтированный файл.

Отрендеренный конфиг не содержит URL в `~/.agentmemory/data/iii-config.runtime.yaml`, но собственный конфигурационный воркер движка всё равно сохраняет *раскрытое* значение в `~/.agentmemory/config/iii-state.yaml` и `iii-stream.yaml` после загрузки (раскрытие `${VAR}` движком iii-engine происходит раньше, чем этот воркер сохраняет свой seed, и он сохраняет уже разрешённое значение, а не ссылку). Относитесь к этому каталогу как к хранилищу учётных данных: `chmod 700 ~/.agentmemory` на любом общем хосте, и предпочитайте ACL-пользователя Redis, ограниченного тем, что нужно agentmemory, а не админские учётные данные базы данных.

**Миграция не автоматическая.** Переключение `AGENTMEMORY_STATE_BACKEND` начинается с пустого хранилища по обе стороны; ничто не копирует существующие данные из file в Redis или обратно. Экспортируйте из backend'а, который покидаете, и импортируйте в тот, на который переходите. Это работает одинаково под bash и zsh (включая `bash -u`). А вот массив вида `AUTH=(${AGENTMEMORY_SECRET:+-H "Authorization: Bearer $AGENTMEMORY_SECRET"})` — нет: zsh сохраняет заголовок как одно некорректное слово, тогда как bash разбивает его на два, поэтому оба запроса получают 401, как только задан `AGENTMEMORY_SECRET`:

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

`/agentmemory/export` также принимает `?maxSessions=` и `?offset=` для разбивки большого корпуса на несколько вызовов; `strategy` при импорте — это `merge` (безопасно по умолчанию), `replace` или `skip`.

### Что заменяет iii

| Традиционный стек | agentmemory использует |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + векторный индекс в памяти |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | Супервизия воркеров движка iii |
| Prometheus / Grafana | iii OTEL + монитор состояния |
| Самописные плагинные системы | `iii worker add <name>` |

**223 исходных файлов · ~53,000 LOC · 2,700+ тестов · 312 функция · 60 KV-scope'ов**, всё на трёх примитивах. Никакого `agentmemory plugin install`. Плагинная система — это сам iii.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Конфигурация" height="32" /></picture></h2>

### LLM-провайдеры

agentmemory автоопределяет провайдеров по вашему окружению. Провайдер делает доступными операции на базе LLM, но сама конфигурация провайдера сама по себе не включает сжатие наблюдений, написанное LLM. Для этого пути нужны и провайдер, и `AGENTMEMORY_AUTO_COMPRESS=true`.

| Провайдер | Конфигурация | Заметки |
|----------|--------|-------|
| **No-op (по умолчанию)** | Настройка не нужна | LLM-сжатие/резюме отключено. Синтетическое сжатие и recall через BM25 продолжают работать. См. `AGENTMEMORY_ALLOW_AGENT_SDK` ниже, если вы раньше полагались на fallback подписки Claude. |
| Anthropic API | `ANTHROPIC_API_KEY` | Поминутная (token-based) оплата |
| MiniMax | `MINIMAX_API_KEY` | Совместим с Anthropic |
| Gemini | `GEMINI_API_KEY` | Дополнительно включает эмбеддинги |
| OpenRouter | `OPENROUTER_API_KEY` | Любая модель |
| OpenAI API | `OPENAI_API_KEY` | По умолчанию `gpt-5.6-luna`, переопределяется через `OPENAI_MODEL` |
| **Локально (Ollama / LM Studio / vLLM / llama.cpp)** | `OPENAI_API_KEY=local` + `OPENAI_BASE_URL=http://localhost:11434/v1` (Ollama) либо `http://localhost:1234/v1` (LM Studio) + `OPENAI_MODEL=<your model>` | Всё, что совместимо с OpenAI API. Нулевая стоимость, работает на вашем железе. См. [Локальные модели](#local-models-ollama--lm-studio--vllm) ниже. |
| Fallback на подписку Claude | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Только по согласию. Запускает сессии `@anthropic-ai/claude-agent-sdk`; раньше это приводило к неограниченной рекурсии Stop-хука, поэтому больше не включено по умолчанию. |

### Локальные модели (Ollama / LM Studio / vLLM)

agentmemory разговаривает с любым сервером, совместимым с OpenAI API, поэтому всё, что раскрывает `/v1/chat/completions`, работает без изменений кода. Никаких платных ключей, облака и rate-limit'ов; выполняется целиком на вашем железе.

**Ollama** (порт по умолчанию `11434`):

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

**LM Studio** (порт по умолчанию `1234`):

Откройте LM Studio → вкладка Local Server → Start Server. Выберите любую chat-модель в пикере (Qwen 3, gpt-oss, DeepSeek R1 и т. д.).

```env
# ~/.agentmemory/.env
OPENAI_API_KEY=lmstudio                        # any non-empty string; LM Studio ignores it
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=qwen3-8b                          # match the model name from LM Studio
```

**vLLM / llama.cpp / Text Generation Inference**: та же форма. Направьте `OPENAI_BASE_URL` на URL, который раскрывает ваш сервер, и задайте в `OPENAI_MODEL` имя, которое сервер примет.

**Выбор модели для работы с памятью**: сжатие и резюмирование — короткие задачи (<2K токенов на входе, <500 токенов на выходе), где 7B instruct-модели вполне достаточно. Рекомендации:

| Модель | Размер | Почему |
|-------|------|-----|
| `qwen3:8b` | ~5.2 ГБ | Сбалансированный вариант по умолчанию на машине с 16 ГБ; силён в извлечении и tool-образном тексте |
| `qwen3:4b` | ~2.6 ГБ | Наименьший разумный вариант; годится для сжатия, слабее для извлечения графа |
| `qwen3-coder:30b` | ~19 ГБ | Лучший локальный выбор для code-сессий (30B MoE, 3.3B активных) на железе с 24–32 ГБ |
| `gpt-oss:20b` | ~14 ГБ | Сильная общая модель, помещающаяся в 16 ГБ RAM |
| `deepseek-r1:8b` | ~5.2 ГБ | Reasoning-дистилляция; медленнее, но извлечения чище |

Модели Qwen 3 думают по умолчанию и могут сжечь весь токен-бюджет на рассуждения до какого-либо вывода. Установите `AGENTMEMORY_LLM_NOTHINK=1`, чтобы добавлять `/no_think` к промптам извлечения графа, и поднимите `MAX_TOKENS` (16384 работает), если извлечения возвращаются пустыми.

Модели reasoning-класса (в стиле `o1` с блоками `<think>`) могут вернуть пустой `content` с полем `reasoning`, которое ваш локальный сервер может не отдавать. Если извлечения приходят пустыми, сначала переключитесь на модель без reasoning. Переменная `OPENAI_REASONING_EFFORT=none` также умеет отключать thinking у thinking-моделей Ollama Cloud, которые повторяют reasoning-схему OpenAI.

Локальные эмбеддинги поставляются как опциональная зависимость, но не включены по умолчанию. Задайте `EMBEDDING_PROVIDER=local`, чтобы подключить `Xenova/all-MiniLM-L6-v2` (384 измерения). Первый запрос эмбеддинга скачивает модель; после этого инференс выполняется на устройстве. Без этой настройки или удалённого ключа эмбеддингов векторы остаются отключены, `mem::search` использует BM25, а `smart-search` всё равно может добавлять существующие совпадения из графа.

### Выбор модели с учётом стоимости

Когда фоновое сжатие, написанное LLM, включено — то есть заданы и провайдер, и `AGENTMEMORY_AUTO_COMPRESS=true` — оно выполняется на каждом наблюдении, поэтому выбор модели заметно влияет на ежемесячные расходы. Замеренные данные нагрузки: 635 запросов / 888K токенов / 35 часов активного использования, прогон против трёх моделей OpenRouter по ценам на 2026-05-23.

| Уровень | Модель | Вход / 1M | Выход / 1M | Стоимость за зафиксированные 35 ч | Заметки |
|------|-------|------------|-------------|---------------------------|-------|
| Рекомендовано | `deepseek/deepseek-v4-flash-0731` | $0.07 | $0.14 | ~$0.07 (оценка) | Самый свежий DeepSeek; самый дешёвый рекомендуемый вариант для нагрузок сжатия. |
| Рекомендовано | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | Хорошее качество сжатия и резюмирования при стоимости ~10× ниже Sonnet. |
| Рекомендовано | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | Сильное code-reasoning, если ваши сессии сильно завязаны на код. |
| Premium | `anthropic/claude-sonnet-5` | $3.00 | $15.00 | ~$5.02 (оценка) | Тот же прайс, что у замеренного прогона Sonnet 4.6; вводная цена $2/$10 до 2026-08-31. |
| Premium | `openai/gpt-5.6-sol` | $5.00 | $30.00 | ~$9 (оценка) | Флагманский уровень; дорого для постоянной фоновой работы. |
| Избегать | `anthropic/claude-opus-5` | $5.00 | $25.00 | ~$8.40 (оценка) | Модель флагманского класса; перерасход на сжатие. |

Замеренные строки взяты из зафиксированного прогона; строки «(оценка)» масштабируют тот же микс токенов по прайс-листу каждой модели.

agentmemory выводит runtime-предупреждение, когда `OPENROUTER_MODEL` совпадает с шаблоном premium-уровня. Установите `AGENTMEMORY_SUPPRESS_COST_WARNING=1`, чтобы заглушить его, как только сделаете осознанный выбор.

Компромисс качество/цена для работы с памятью: сжатие — это задача резюмирования с относительно мягкими требованиями к качеству (резюме перечитывает агент, не пользователь). DeepSeek V4 Flash / V4 Pro / Qwen3-Coder ложатся на этой задаче в пределах погрешности от Sonnet, стоя в 10–70 раз дешевле. Премиум-модели оставляйте для запросов, которые читаете напрямую.

Источники: [цены OpenRouter на Claude Sonnet 5](https://openrouter.ai/anthropic/claude-sonnet-5), [DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash-0731), [заметки о ценах DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/).

### Мультиагентная память (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

В мультиагентных конфигурациях, где несколько ролей делят один сервер agentmemory (architect / developer / reviewer / researcher / support-agent), `AGENT_ID` помечает каждую запись ролью, которая её сделала. `AGENTMEMORY_AGENT_SCOPE` управляет тем, фильтрует ли recall по этому тегу.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

Два режима:

| Режим | Помечать записи | Фильтровать recall | Когда использовать |
|------|------------|---------------|-------------|
| `shared` (по умолчанию) | да | нет | Общий контекст между агентами с аудит-журналом. Architect видит, что отметил developer, но каждая запись фиксирует, кто это сказал. |
| `isolated` | да | да | Строгое разделение. Architect никогда не увидит наблюдения / записи памяти / сессии developer'а. |

Что помечается, когда `AGENT_ID` задан: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. Роль течёт по `api::session::start` → `mem::observe` → `mem::compress` → KV.

Что фильтруется в режиме isolated: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Каждый эндпоинт принимает `?agentId=<role>` для переопределения на конкретный запрос и `?agentId=*`, чтобы полностью выйти из env-scope. `/memories` дополнительно принимает `?includeOrphans=true`, чтобы поднять записи памяти до появления `AGENT_ID`, у которых `agentId` не определён.

Переопределение в самом вызове на уровне SDK / REST: каждый мутирующий эндпоинт (`/session/start`, `/remember`) принимает поле `agentId` в теле запроса, которое выигрывает у env. Полезно для runtime'ов, прогоняющих много ролей через один серверный процесс. Инструмент MCP `memory_save` раскрывает то же поле `agentId`, автономный stdio-сервер пробрасывает и `agentId`, и `project`, а сохранённые записи памяти несут `agentId` в поисковый индекс, поэтому поиск со scope'ом агента покрывает записи памяти так же, как наблюдения.

Когда `AGENT_ID` не задан, память остаётся без scope (legacy-поведение: ни тегов, ни фильтров).

### Порты

agentmemory + iii-engine по умолчанию занимают четыре порта. Если перезапуск падает с `port in use`, эта таблица подскажет, какой процесс искать.

| Порт | Процесс | Назначение | Override через env |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | Внутренний streams-воркер (используется agentmemory + просмотрщиком) | `III_STREAM_PORT` (предпочтительно) либо устаревший `III_STREAMS_PORT` |
| `3113` | agentmemory | Просмотрщик в реальном времени (`http://localhost:3113`) | `III_VIEWER_PORT` либо `AGENTMEMORY_VIEWER_URL` для возвращаемого URL |
| `49134` | iii-engine | WebSocket; воркеры регистрируются здесь, по нему же течёт OTel-телеметрия | `III_ENGINE_PORT` либо `III_ENGINE_URL` |

`--port <N>` меняет якорь REST и выводит из него streams `N+1`, просмотрщик `N+2` и WebSocket движка `N+46023`, но только там, где соответствующий явный порт или URL выше не задан. Это не создаёт изолированный lifecycle-namespace. Используйте `--instance 1` для второго демона; он использует якорь 3211, по умолчанию даёт `3211/3212/3213/49234` и получает отдельный каталог данных и lifecycle `instance-1`. Инстансы с 1 по 50 следуют тому же паттерну.

Закреплённый движок запускается с `--no-update-check` (без обращения к GitHub за обновлениями или security-advisory при загрузке) и с выключенной анонимной телеметрией использования iii: agentmemory задаёт `III_TELEMETRY_ENABLED=false` для порождаемого им движка, если вы не экспортировали эту переменную сами, и встроенный compose-файл делает то же самое.

Очистка зависших процессов, если порты остаются занятыми после падения:

```bash
# macOS / Linux — find whatever is on each port and kill it
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` аккуратно вычищает и воркер, и pidfile движка при штатном нативном завершении. В режиме Docker она сбрасывает нативный воркер, останавливает именно тот проверенный контейнер движка и сохраняет и контейнер, и его том `/data` для безвозвратного перезапуска; следующий запуск проверяет и возобновляет тот же контейнер. Удаление при работе через Docker требует `agentmemory remove --keep-data`: она удаляет общие файлы, управляемые agentmemory, сохраняя при этом проверенный контейнер, его том данных и запись о жизненном цикле, нужную для их восстановления. Деструктивное удаление данных Docker намеренно оставлено оператору — после бэкапа. CLI также отказывается принимать за нативный движок или сигналить держателям портов из Docker или VM (Docker backend, vpnkit, colima), пока не передан `--force`. Ручная очистка выше нужна только в посткрэшевом сценарии, когда ни один pidfile не остался.

### Конфигурационный файл

Помещайте runtime-конфигурацию agentmemory в `~/.agentmemory/.env`, а не экспортируйте переменные в каждой сессии shell. Если просмотрщик показывает подсказку настройки вида `export ANTHROPIC_API_KEY=...`, скопируйте её в этот файл как `ANTHROPIC_API_KEY=...` без префикса `export`, затем перезапустите agentmemory.

Переменные окружения процесса по-прежнему работают и имеют приоритет над значениями из файла.

В Windows тот же файл лежит в `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

Чтобы протестировать с подпиской Claude Code Pro/Max вместо API-ключа, включите это явно:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

Сжатие наблюдений, написанное LLM, требует обе строки: доступ к провайдеру LLM (включая этот явный fallback на подписку) и `AGENTMEMORY_AUTO_COMPRESS=true`. Один только провайдер оставляет в силе путь синтетического сжатия по умолчанию.

Консолидация (узлы графа, уроки, crystals) включена по умолчанию, когда настроен провайдер LLM. Явно отключите её через `CONSOLIDATION_ENABLED=false`, если хотите работать без LLM. Извлечение графа — отдельный флаг:

```env
GRAPH_EXTRACTION_ENABLED=true
# CONSOLIDATION_ENABLED=false   # opt out of auto-consolidation
```

### Переменные окружения

Создайте `~/.agentmemory/.env`:

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

138 эндпоинтов на порту `3111`. REST API по умолчанию слушает на `127.0.0.1`. Защищённые эндпоинты требуют `Authorization: Bearer <secret>`, а эндпоинты mesh-синхронизации требуют явно заданного `AGENTMEMORY_SECRET` на обоих узлах.

**Аутентификация включена по умолчанию.** Когда `AGENTMEMORY_SECRET` не задан (ни в shell, ни в `~/.agentmemory/.env`), сервер генерирует случайный секрет при первом запуске и хранит его в `~/.agentmemory/secret` с правами `0600`. Каждый встроенный клиент читает его оттуда, когда говорит с локальным сервером: CLI, просмотрщик, хуки из `plugin/scripts`, MCP-сервер и shim `@agentmemory/mcp`, конфиги, записанные `agentmemory connect`, и встроенные интеграции OpenCode, Pi, OpenClaw, Hermes и filesystem-watcher. Сохранённый секрет отправляется только на loopback-адреса (`localhost`, `127.0.0.0/8`, `::1`). Явно заданный `AGENTMEMORY_SECRET` всегда выигрывает, и удалённым клиентам он всё равно нужен. Docker и entrypoint'ы `deploy/` уже генерируют и экспортируют собственный секрет. Чтобы вызвать API вручную:

```bash
curl -H "Authorization: Bearer $(cat ~/.agentmemory/secret)" http://localhost:3111/agentmemory/health
```

**Правила запросов для записи.** Запросы `POST`, `PUT`, `PATCH` и `DELETE` к REST API и просмотрщику должны отправлять `Content-Type: application/json` (параметр `charset` допустим), когда у них есть тело, а заголовок `Origin`, если он есть, должен быть loopback-origin для настроенного порта REST или просмотрщика, либо быть перечислен в `VIEWER_ALLOWED_ORIGINS` (через запятую, например `https://memory.example.com`). Клиенты, которые не отправляют заголовок `Origin` (CLI, хуки, MCP, curl, сервер-сервер), не затрагиваются. Просмотрщик также принимает собственный origin.

**Пути к файлам.** Эндпоинты, которые читают или пишут файлы (`/compress-file`, `/replay/import-jsonl`, `/graph/import-graphify`), принимают только пути внутри `~/.agentmemory`, каталога данных инстанса или каталога, перечисленного в `AGENTMEMORY_IMPORT_ROOT` (разделяйте несколько через `:`, либо `;` на Windows). `/replay/import-jsonl` также принимает свой каталог по умолчанию `~/.claude/projects`. `/obsidian/export` остаётся внутри `AGENTMEMORY_EXPORT_ROOT`, а `/migrate` — внутри `~/.agentmemory`. Симлинки разрешаются перед каждой проверкой.

**Вычистка секретов.** API-ключи, bearer-токены, блоки приватных ключей PEM и учётные данные, встроенные в URL (`scheme://user:password@host`), вырезаются из текста до сохранения — на каждом пути записи: наблюдения, remember, evolve, slots, уроки, action'ы, sketches, сигналы, checkpoints, импорты, jsonl replay, mesh sync, team shares, вывод сжатия и резюме, crystals и узлы графа.

<details>
<summary>Ключевые эндпоинты</summary>

| Метод | Путь | Описание |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Проверка состояния (всегда публична) |
| `GET` | `/agentmemory/status` | Что не так и как это исправить (HTML для браузеров, иначе JSON) |
| `GET` | `/agentmemory/viewer/snapshot` | Всё, что показывает просмотрщик, в одном ответе |
| `POST` | `/agentmemory/session/start` | Запуск сессии + получение контекста |
| `POST` | `/agentmemory/session/end` | Завершение сессии |
| `POST` | `/agentmemory/observe` | Захват наблюдения (см. доставку захвата ниже) |
| `GET` | `/agentmemory/capture` | Инбокс захвата, dead letters и offline-spool |
| `POST` | `/agentmemory/capture/retry` | Повторить захваты из dead letter |
| `POST` | `/agentmemory/capture/drain` | Немедленно отправить локальный offline-spool |
| `POST` | `/agentmemory/smart-search` | Гибридный поиск |
| `POST` | `/agentmemory/context` | Генерация контекста |
| `POST` | `/agentmemory/remember` | Сохранить в долговременную память |
| `POST` | `/agentmemory/forget` | Удалить наблюдения |
| `POST` | `/agentmemory/enrich` | Контекст файла + записи памяти + баги |
| `GET` | `/agentmemory/profile` | Профиль проекта |
| `GET` | `/agentmemory/export` | Экспорт всех данных |
| `POST` | `/agentmemory/import` | Импорт из JSON |
| `POST` | `/agentmemory/graph/query` | Запрос к графу знаний |
| `POST` | `/agentmemory/graph/compact` | Усечь разросшееся происхождение графа |
| `POST` | `/agentmemory/team/share` | Расшарить в команду |
| `GET` | `/agentmemory/audit` | Аудит-журнал |

Полный список эндпоинтов: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

**Доставка захвата.** Хуки отправляют каждое наблюдение один раз в `POST /agentmemory/observe` с `eventId`. Это собственный id вызова от хоста, если он есть в payload'е (например, `tool_use_id` у Claude Code), иначе — хеш сессии, типа хука, имени инструмента, входа, выхода и timestamp'а хоста. Сервер записывает событие в инбокс захвата в state store, сохраняет наблюдение, затем удаляет запись из инбокса. Код статуса говорит о том, что произошло:

| Статус | поле `status` | Значение |
|---|---|---|
| `201` | `accepted` | Сохранено. `observationId` — новое наблюдение. |
| `202` | `accepted` (`state: "retrying"`) | Принято, но сохранение не удалось. Сервер повторяет попытку, в том числе после перезапуска. |
| `200` | `duplicate` | Этот `eventId` уже был принят. `observationId` — существующее наблюдение; новое не сохраняется. |
| `400` / `422` | `rejected` | Некорректный payload, либо сохранение окончательно не удалось (событие сохраняется как dead letter). |
| `503` | `rejected` (`retryable: true`) | Инбокс заполнен (`AGENTMEMORY_CAPTURE_INBOX_MAX`). Хуки откладывают событие в spool и отправляют его позже. |

Неудавшиеся события повторяются каждые `AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS` (10 с) с удваивающимся backoff'ом, до `AGENTMEMORY_CAPTURE_MAX_ATTEMPTS` (5) попыток. События, которые всё равно не проходят, остаются в инбоксе как dead letters, перечисляются на `/agentmemory/status` и странице Health просмотрщика, и их можно повторить через `POST /agentmemory/capture/retry` (`{"eventId": "..."}` или `{"all": true}`). Принятые id событий запоминаются на `AGENTMEMORY_CAPTURE_DEDUP_HOURS` (168 часов, не больше `AGENTMEMORY_CAPTURE_EVENTS_MAX` id), поэтому хук, воспроизведённый после таймаута или перезапуска, сохраняется один раз, тогда как два отдельных вызова инструмента со своими собственными host-id сохраняются дважды, даже если их содержимое идентично. Когда наблюдение удаляется (forget, удаление сессии, вытеснение, авто-забывание или импорт, заменяющий хранилище), его событие помечается как удалённое до удаления самого наблюдения, поэтому повтор этого события в том же окне отвечается как дубликат и ничего не сохраняет. State store пишет на диск каждые 2 секунды, поэтому отвеченное событие может ещё на мгновение существовать только в памяти. Чтобы это покрыть, каждый ответ `2xx` также несёт `bootId` сервера (новый при каждом запуске), `acceptedAt` и `durableAfterMs` (интервал сохранения плюс 1.5 с на файловом хранилище, 1.5 с на redis, где устойчивость — настройка оператора). Хуки держат событие в локальном spool, пока это окно не пройдёт, и удаляют его при следующем вызове без дополнительного запроса. Если к этому моменту `bootId` изменился, сервер перезапустился, поэтому хук отправляет событие снова с тем же `eventId`; событие, которое всё же достигло диска, не сохраняется дважды. Сервер также сам отправляет такие события при запуске и на каждом интервале повтора, поэтому перезапуск ничего не теряет, даже если после него не запускается ни один хук. Старые хуки игнорируют дополнительные поля, а новые хуки против старого сервера отбрасывают событие на `2xx`, как и раньше.

Когда сервер недоступен, не отвечает вовремя или возвращает 5xx, хук добавляет наблюдение в локальный spool-файл `<data dir>/capture-spool/<host>-<port>.jsonl` (переопределите папку через `AGENTMEMORY_CAPTURE_SPOOL_DIR`). Файл приватен для вашего пользователя (права 600), секреты вырезаются так же, как их вырезает сервер, он хранит не больше `AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES` (5 MiB) и отбрасывает записи старше `AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS` (168). Когда он заполнен, новые записи отбрасываются и считаются, и `/agentmemory/status` сообщает об этом. Хук всё равно завершается с кодом 0 в пределах своего лимита времени и не добавляет ни одного запроса, когда сервер здоров. Spool отправляется при следующем запуске и первым хуком, который снова достучится до сервера, в фоновом процессе, чтобы агент не ждал. Id событий делают это безопасным: наблюдение, которое всё же дошло до таймаута, не сохраняется дважды. `npx @agentmemory/agentmemory capture` показывает spool и инбокс сервера, `--drain` отправляет spool сейчас, а `GET /agentmemory/capture` возвращает то же самое в JSON. Задайте `AGENTMEMORY_CAPTURE_SPOOL=false`, чтобы отключить spool.

**Усечение происхождения графа.** Каждый узел и ребро графа знаний хранит id самых новых 32 наблюдений, из которых он возник. Хранилища, записанные до этого ограничения, могут держать тысячи id на горячий узел, из-за чего поиск по графу и просмотрщик замедляются или роняют воркер. agentmemory сам это исправляет: при первом запуске после обновления он усекает каждый узел, ребро, вытесненное ребро (темпоральная история графа) и кэшированный снапшот до лимита в фоне, небольшими порциями с паузой между ними, так что поиск, захват и просмотрщик продолжают работать. Он сохраняет свой прогресс, продолжает после перезапуска и больше никогда не запускается снова после завершения. `/agentmemory/status` и страница Health просмотрщика показывают его как pending, running (с текущим scope и позицией), done или failed. Задайте `AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false`, чтобы отключить его.

Чтобы запустить его вручную, вызовите `POST /agentmemory/graph/compact`. Он проходит по индексам имён и edge-key вместо перечисления каждого узла и ребра, и его безопасно запускать повторно. Когда он усекает id, он пишет запись аудита `graph_compact`.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{}'
```

На большом хранилище, либо когда вызов возвращает 504, запускайте его порциями. Отправьте `scope` (`nodes`, `edges` или `history`), `offset` и `limit`, затем вызывайте снова с возвращённым `nextOffset`, пока он не станет `null`. Сделайте это для `nodes`, `edges` и `history`, и завершите одним вызовом `{"scope":"snapshot"}`, потому что порционный запуск не трогает кэшированный снапшот.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"nodes","offset":0,"limit":200}'
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"snapshot"}'
```

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Разработка" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 2,700+ tests
npm run test:integration  # API tests (requires running services)
```

**Требования:** Node.js >= 20 с npm/npx; [iii-engine](https://iii.dev/docs) v0.22.1 или Docker. Автоматическая установка движка на macOS/Linux также требует `curl`, POSIX-совместимый `sh` и `tar`; нативный Windows использует вручную установленный закреплённый `iii.exe`, WSL2 или Docker Desktop.

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="Лицензия" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
