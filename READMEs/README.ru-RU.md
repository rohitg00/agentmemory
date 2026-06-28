<p align="center">
  <img src="../assets/banner.png" alt="agentmemory — Постоянная память для ИИ-агентов программирования" width="720" />
</p>

<p align="center">
  <strong>
    Ваш агент программирования помнит всё. Больше не нужно объяснять заново.
    Built on <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  Постоянная память для Claude Code, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode и любого MCP-клиента.
</p>

<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.es-ES.md">Español</a> |
  <a href="README.tr-TR.md">Türkçe</a> |
  Русский |
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1200%20stars%20%2F%20172%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Документ проекта: 1200 звёзд / 172 форка в гисте" /></a>
</p>

<p align="center">
  <em>Этот gist расширяет шаблон LLM Wiki от Karpathy: confidence-оценкой, жизненным циклом, графами знаний и гибридным поиском — agentmemory является его реализацией.</em>
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
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="53 MCP tools" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 auto hooks" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="0 external DBs" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="950+ tests passing" height="38" /></picture>
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
  <a href="#iii-console">iii Console</a> &bull;
  <a href="#powered-by-iii">Powered by iii</a> &bull;
  <a href="#configuration">Конфигурация</a> &bull;
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

Или через `npx` (без установки):

```bash
npx @agentmemory/agentmemory
```

Внимание: npx кеширует пакеты по версиям. Если простой `npx @agentmemory/agentmemory` выдаёт более старый релиз, принудительно возьмите свежий через `npx -y @agentmemory/agentmemory@latest` или однократно очистите кеш: `rm -rf ~/.npm/_npx` (macOS/Linux; на Windows удалите `%LOCALAPPDATA%\npm-cache\_npx`). Начиная с v0.9.16+, при первом запуске npx предлагает поставить пакет глобально прямо в строке — после этого простая команда `agentmemory` будет работать повсюду.

Полный список опций — в разделе [Быстрый старт](#quick-start) ниже. Привязка конкретного агента — в разделе [Работает с каждым агентом](#works-with-every-agent).

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Работает с каждым агентом" height="32" /></picture></h2>

agentmemory работает с любым агентом, поддерживающим хуки, MCP или REST API. Все агенты используют один и тот же сервер памяти.

<table>
<tr>
<td align="center" width="12.5%">
<a href="https://claude.com/product/claude-code"><img src="https://matthiasroder.com/content/images/2026/01/Claude.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>нативный плагин + 12 хуков + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>нативный плагин + 6 хуков + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>нативный плагин + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>нативный плагин + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>нативный плагин + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://raw.githubusercontent.com/tinyhumansai/openhuman/main/app/src-tauri/icons/128x128.png" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>нативный бэкенд трейта Memory</sub>
</td>
<td align="center" width="12.5%">
<a href="https://cursor.com"><img src="https://www.freelogovectors.net/wp-content/uploads/2025/06/cursor-logo-freelogovectors.net_.png" alt="Cursor" width="48" height="48" /></a><br/>
<strong>Cursor</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP-сервер</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<a href="https://github.com/opencode-ai/opencode"><img src="https://github.com/opencode-ai.png?size=120" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>22 хука + MCP + плагин</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
<td align="center" width="12.5%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="12.5%">
<a href="https://windsurf.com"><img src="https://exafunction.github.io/public/brand/windsurf-black-symbol.svg?size=120" alt="Windsurf" width="48" height="48" /></a><br/>
<strong>Windsurf</strong><br/>
<sub>MCP-сервер</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP-сервер</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>Работает с <strong>любым</strong> агентом, который говорит на MCP или HTTP. Один сервер — общая память для всех.</sub>
</p>

---

Вы заново объясняете архитектуру в каждой сессии. Вы заново находите те же баги. Вы заново обучаете агента тем же предпочтениям. Встроенная память (CLAUDE.md, .cursorrules) упирается в 200 строк и устаревает. agentmemory это решает. Он тихо собирает то, что делает ваш агент, сжимает это в индексируемую память и подмешивает нужный контекст при старте следующей сессии. Одна команда. Работает между агентами.

**Что меняется:** В сессии 1 вы настраиваете JWT-аутентификацию. В сессии 2 просите добавить rate limiting. Агент уже знает, что аутентификация использует middleware jose в `src/middleware/auth.ts`, что ваши тесты покрывают валидацию токенов, и что вы выбрали jose, а не jsonwebtoken, из-за совместимости с Edge. Никаких повторных объяснений. Никакого копирования-вставки. Агент просто *знает*.

```bash
npx @agentmemory/agentmemory
```

> **Новое в v0.9.0** — Лендинг по адресу [agent-memory.dev](https://agent-memory.dev), коннектор файловой системы (`@agentmemory/fs-watcher`), автономный MCP теперь проксирует к работающему серверу, поэтому хуки и просмотрщик согласованы, политика аудита кодифицирована для каждого пути удаления, проверка состояния больше не помечает `memory_critical` на маленьких Node-процессах. Полные заметки в [CHANGELOG.md](../CHANGELOG.md#090--2026-04-18).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Бенчмарки" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Точность извлечения

**coding-agent-life-v1** (внутренний корпус, воспроизводимо в sandbox)

| Адаптер | P@5 | R@5 | Top-5 hit rate | p50-задержка |
|---|---|---|---|---|
| **agentmemory hybrid** | **0.578** | **0.967** | **15 / 15** | 14 мс |
| Базовый grep | 0.267 | 0.967 | 15 / 15 | 0 мс |

100 % попаданий в top-5. **2,2×** выше точность, чем у grep-базы, на тех же входах. Полная разбивка по типам: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 вопросов)

| Система | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| Fallback только BM25 | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Экономия токенов

| Подход | Токенов в год | Стоимость в год |
|---|---|---|
| Вставлять весь контекст | 19,5М+ | Невозможно (выходит за окно) |
| LLM-резюме | ~650K | ~500 $ |
| **agentmemory** | **~170K** | **~10 $** |
| agentmemory + локальные эмбеддинги | ~170K | **0 $** |

</td>
</tr>
</table>

> Модель эмбеддингов: `all-MiniLM-L6-v2` (локальная, бесплатная, без API-ключа). Полные отчёты: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). Сравнение с конкурентами: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) — agentmemory против mem0, Letta, Khoj, claude-mem, Hippo.

**Воспроизведите локально:** [`eval/README.md`](../eval/README.md) — harness с подключаемыми адаптерами для LongMemEval `_s` (публичный, 500 вопросов) и `coding-agent-life-v1` (внутренний корпус из 15 сессий). Адаптеры grep / vector / agentmemory сравниваются бок о бок, вывод NDJSON, опубликованные scorecard'ы попадают в [`docs/benchmarks/`](../docs/benchmarks/).

**Хорошо сочетается с [codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything) и [Graphify](https://github.com/safishamsi/graphify).** Индексация кодового графа, мультиагентные конвейеры сборки и более широкие графы знаний по докам / PDF / изображениям / видео. agentmemory запоминает работу; эти три проекта подсвечивают остальное в слое контекста. Рецепты и таблица маршрутизации вопросов: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="Сравнение с конкурентами" height="32" /></picture></h2>

<table>
<tr>
<th width="20%"></th>
<th width="20%">agentmemory</th>
<th width="20%">mem0 (53K ⭐)</th>
<th width="20%">Letta / MemGPT (22K ⭐)</th>
<th width="20%">Встроенное (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Тип</strong></td>
<td>Движок памяти + MCP-сервер</td>
<td>API уровня памяти</td>
<td>Полноценный агентский runtime</td>
<td>Статический файл</td>
</tr>
<tr>
<td><strong>R@5 при извлечении</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>Н/Д (grep)</td>
</tr>
<tr>
<td><strong>Авто-захват</strong></td>
<td>12 хуков (никаких ручных усилий)</td>
<td>Ручные вызовы <code>add()</code></td>
<td>Агент сам редактирует</td>
<td>Ручное редактирование</td>
</tr>
<tr>
<td><strong>Поиск</strong></td>
<td>BM25 + векторный + граф (RRF-слияние)</td>
<td>Векторный + граф</td>
<td>Векторный (архивный)</td>
<td>Загружает всё в контекст</td>
</tr>
<tr>
<td><strong>Мультиагентность</strong></td>
<td>MCP + REST + lease'ы + сигналы</td>
<td>API (без координации)</td>
<td>Только внутри runtime Letta</td>
<td>Отдельные файлы на агента</td>
</tr>
<tr>
<td><strong>Привязка к фреймворку</strong></td>
<td>Нет (любой MCP-клиент)</td>
<td>Нет</td>
<td>Высокая (нужен Letta)</td>
<td>Формат на агента</td>
</tr>
<tr>
<td><strong>Внешние зависимости</strong></td>
<td>Нет (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + векторная БД</td>
<td>Нет</td>
</tr>
<tr>
<td><strong>Жизненный цикл памяти</strong></td>
<td>4-уровневая консолидация + затухание + авто-забывание</td>
<td>Пассивное извлечение</td>
<td>Управляется агентом</td>
<td>Ручное усечение</td>
</tr>
<tr>
<td><strong>Эффективность по токенам</strong></td>
<td>~1 900 токенов/сессия (10 $/год)</td>
<td>Зависит от интеграции</td>
<td>Core memory в контексте</td>
<td>22K+ токенов при 240 наблюдениях</td>
</tr>
<tr>
<td><strong>Просмотрщик в реальном времени</strong></td>
<td>Да (порт 3113)</td>
<td>Облачная панель</td>
<td>Облачная панель</td>
<td>Нет</td>
</tr>
<tr>
<td><strong>Self-hosted</strong></td>
<td>Да (по умолчанию)</td>
<td>Опционально</td>
<td>Опционально</td>
<td>Да</td>
</tr>
</table>

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Быстрый старт" height="32" /></picture></h2>

Совместимость: этот релиз нацелен на стабильный `iii-sdk` `^0.11.0` и iii-engine v0.11.x.

### Попробуйте за 30 секунд

```bash
# Terminal 1: start the server
npx @agentmemory/agentmemory

# Terminal 2: seed sample data and see recall in action
npx @agentmemory/agentmemory demo
```

`demo` заполняет 3 реалистичные сессии (JWT-аутентификация, исправление N+1-запроса, rate limiting) и запускает по ним семантический поиск. Вы увидите, как находится «N+1 query fix», когда вы ищете «database performance optimization» — keyword-сопоставление так не умеет.

Откройте `http://localhost:3113`, чтобы видеть построение памяти в реальном времени.

### Рекомендуется: глобальная установка

`npx` кеширует пакеты по версиям. Если на прошлой неделе вы запускали `npx @agentmemory/agentmemory@0.9.14`, простой `npx @agentmemory/agentmemory` может выдать застаревшую 0.9.14 из `~/.npm/_npx/`, а не последний релиз. Установите один раз — и команда `agentmemory` будет работать везде:

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

Начиная с v0.9.16, первый запуск npx предлагает установку глобально в той же строке — ответьте `Y` один раз, и готово. Если вы пропустили шаг, воспользуйтесь любым из этих вариантов для свежего скачивания:

```bash
npx -y @agentmemory/agentmemory@latest                 # forces latest from npm (cross-platform)
rm -rf ~/.npm/_npx && npx @agentmemory/agentmemory     # macOS/Linux only (POSIX shell)
```

В Windows / PowerShell эквивалент очистки кеша — `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"`, а вариант выше `npx -y ...@latest` остаётся кросс-платформенным.

### Воспроизведение сессий

Каждую сессию, которую записывает agentmemory, можно воспроизвести. Откройте просмотрщик, выберите вкладку **Replay** и пролистывайте таймлайн: промпты, вызовы инструментов, результаты вызовов и ответы отображаются как отдельные события с play/pause, регулировкой скорости (0,5×–4×) и горячими клавишами (пробел переключает, стрелки — пошаговое перемещение).

Уже есть старые JSONL-расшифровки Claude Code, которые хотите подгрузить?

```bash
# Import everything under the default ~/.claude/projects
npx @agentmemory/agentmemory import-jsonl

# Or import a single file
npx @agentmemory/agentmemory import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

Импортированные сессии появятся в Replay-пикере рядом с нативными. Под капотом каждая запись проходит через iii-функции `mem::replay::load`, `mem::replay::sessions` и `mem::replay::import-jsonl` — никаких побочных серверов.

### Обновление / Обслуживание

Используйте команду обслуживания, когда специально хотите обновить локальный runtime:

```bash
npx @agentmemory/agentmemory upgrade
```

Внимание: команда меняет текущее рабочее окружение / runtime. Она может обновлять JavaScript-зависимости и стянуть закреплённый Docker-образ `iiidev/iii:0.11.2`. Она никогда не устанавливает незакреплённый или более новый движок iii.

Детали реализации — в `src/cli.ts` (см. `runUpgrade` в районе `src/cli.ts:544-595`).

### Claude Code (один блок, вставьте его)

```text
Install agentmemory: run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 4 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 53 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113.
```

#### Claude Code без установки плагина (путь MCP-standalone)

Если подключать MCP-сервер agentmemory через `~/.claude.json` напрямую, минуя `/plugin install`, Claude Code никогда не разрешит `${CLAUDE_PLUGIN_ROOT}`, и в `~/.claude/settings.json` придётся прописывать абсолютные пути к скриптам хуков. Эти пути обычно включают версию agentmemory (например, `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.21/scripts/…`), так что следующее обновление тихо ломает каждый хук.

Обходное решение:

```bash
agentmemory connect claude-code --with-hooks
```

Это вливает те же команды хуков в `~/.claude/settings.json` с абсолютными путями, разрешёнными в каталог `plugin/` текущего установленного пакета `@agentmemory/agentmemory`. После обновления agentmemory запустите команду ещё раз, чтобы освежить пути. Записи пользователя в этом файле сохраняются; заменяются только предыдущие записи agentmemory. Рекомендуемым способом остаётся путь через `/plugin install`.
Для удалённых или защищённых развертываний запускайте Claude Code с заданными `AGENTMEMORY_URL` и `AGENTMEMORY_SECRET`. Плагин пробрасывает обе переменные во встроенный MCP-сервер; если `AGENTMEMORY_URL` пуст, MCP-shim использует `http://localhost:3111`.

### Codex CLI (платформа плагинов Codex)

```bash
# 1. start the memory server in a separate terminal
npx @agentmemory/agentmemory

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Плагин Codex поставляется из того же каталога `plugin/`, что и плагин Claude Code. Он регистрирует:

- `@agentmemory/mcp` как MCP-сервер (проксирует все 51 инструмент, когда `AGENTMEMORY_URL` указывает на работающий сервер agentmemory; локально откатывается к 7 инструментам, если сервер недоступен)
- 6 хуков жизненного цикла: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 4 skill'а: `/recall`, `/remember`, `/session-history`, `/forget`

Хук-движок Codex подставляет `CLAUDE_PLUGIN_ROOT` в подпроцессы хуков (см. [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), поэтому одни и те же скрипты хуков работают на обоих хостах без дублирования. События Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure доступны только в Claude Code и для Codex не регистрируются.

#### Codex Desktop: хуки плагинов сейчас тихие (есть обходное решение)

`CodexHooks` и `PluginHooks` оба стабильны и включены по умолчанию в [`codex-rs/features/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs), но текущие сборки Codex Desktop не диспатчат локальный `hooks.json` плагина ([openai/codex#16430](https://github.com/openai/codex/issues/16430)). Инструменты MCP по-прежнему работают; не хватает только наблюдений жизненного цикла.

Пока upstream не подвезёт фикс, продублируйте те же команды хуков в глобальный `~/.codex/hooks.json`:

```bash
agentmemory connect codex --with-hooks
```

Это добавляет идемпотентный блок в `~/.codex/hooks.json` со ссылками на абсолютные пути к встроенным скриптам (раскрывать `${CLAUDE_PLUGIN_ROOT}` на уровне пользователя не нужно). После обновления agentmemory запустите ту же команду ещё раз, чтобы освежить пути. Записи пользователя в этом файле сохраняются; заменяются только предыдущие записи agentmemory.

<details>
<summary><b>OpenClaw (вставьте этот промпт)</b></summary>

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

Полное руководство: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (вставьте этот промпт)</b></summary>

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

Полное руководство: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Другие агенты

Запустите сервер памяти: `npx @agentmemory/agentmemory`

Запись agentmemory — это **один и тот же блок MCP-сервера** для всех хостов, использующих формат `mcpServers` (Cursor, Claude Desktop, Cline, Roo Code, Windsurf, Gemini CLI, OpenClaw):

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

**Вставьте эту запись в существующий объект `mcpServers`** в файле конфигурации хоста — не заменяйте сам файл. Если там уже есть другие серверы, добавьте `agentmemory` рядом с ними как новый ключ внутри `mcpServers`. Если `mcpServers` отсутствует совсем, вставьте блок внутрь `{ "mcpServers": { ... } }`. Подстановки `${VAR}` наследуют `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` из shell в момент запуска MCP-сервера — незаданные переменные передаются пустыми, и shim откатывается на `http://localhost:3111`. Одна подключённая запись покрывает как локальные, так и удалённые (k8s / reverse-proxied) развертывания.

| Агент | Файл конфигурации | Заметки |
|---|---|---|
| **Cursor** | `~/.cursor/mcp.json` | Добавить в `mcpServers`. Также доступен deeplink в один клик на сайте. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Добавить в `mcpServers`. После правки перезапустить Claude Desktop. |
| **Cline / Roo Code / Kilo Code** | Настройки MCP в Cline (Settings UI → MCP Servers → Edit) | Тот же блок `mcpServers`. |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | Тот же блок `mcpServers`. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (автоматическое слияние). |
| **OpenClaw** | MCP-конфиг OpenClaw | Тот же блок `mcpServers`, либо более глубокий [memory-плагин](../integrations/openclaw/). |
| **Codex CLI (только MCP)** | `.codex/config.toml` | Формат TOML: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, либо добавьте `[mcp_servers.agentmemory]` вручную. |
| **Codex CLI (полный плагин)** | Маркетплейс плагинов Codex | `codex plugin marketplace add rohitg00/agentmemory`, затем `codex plugin add agentmemory@agentmemory`. Регистрирует MCP + 6 хуков жизненного цикла (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop) + 4 skill'а. На Codex Desktop дополнительно запустите `agentmemory connect codex --with-hooks`, пока не зарелизят [openai/codex#16430](https://github.com/openai/codex/issues/16430) — хуки плагина там пока тихие. |
| **OpenCode (только MCP)** | `opencode.json` | Другая форма — корневой ключ `mcp`, команда задаётся массивом: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (полный плагин)** | `plugin/opencode/` | 22 хука авто-захвата по жизненному циклу сессии, сообщениям, инструментам и ошибкам. Две slash-команды (`/recall`, `/remember`). Скопируйте `plugin/opencode/` в свой рабочий каталог OpenCode и добавьте запись плагина в `opencode.json`. Полная таблица хуков и анализ пробелов — в [`plugin/opencode/README.md`](../plugin/opencode/README.md). |
| **pi** | `~/.pi/agent/extensions/agentmemory` | Скопируйте [`integrations/pi`](../integrations/pi/) и перезапустите pi. |
| **Hermes Agent** | `~/.hermes/config.yaml` | Используйте более глубокий [плагин провайдера памяти](../integrations/hermes/) с `memory.provider: agentmemory`. |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` записывает стандартный блок `mcpServers`. Payload хуков по полям совместим с Claude Code, поэтому существующие 12 скриптов хуков работают без изменений — подключите их через секцию `hooks` в том же `settings.json`. |
| **Antigravity** (заменяет Gemini CLI) | `mcp_config.json` (в каталоге User у Antigravity) | `agentmemory connect antigravity` записывает стандартный блок `mcpServers`. macOS: `~/Library/Application Support/Antigravity/User/`. Linux: `~/.config/Antigravity/User/`. Использовать после отключения Gemini CLI 2026-06-18. |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` записывает конфиг на уровне пользователя. Workspace-переопределения — в `.kiro/settings/mcp.json` рядом с кодом. |
| **Goose** | UI настроек MCP в Goose | Тот же блок `mcpServers`. |
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

Это поднимает agentmemory с локальным `iii-engine`, если `iii` уже установлен, либо откатывается к Docker Compose, если есть Docker. REST, стримы и просмотрщик по умолчанию слушают на `127.0.0.1`.

Установите `iii-engine` вручную. **agentmemory сейчас зафиксирован на `iii-engine` `v0.11.2`** — `v0.11.6` вводит новую модель «всё через `iii worker add` в sandbox», под которую agentmemory ещё не отрефакторен. Закрепление снимется, как только рефакторинг будет завершён. Переопределите через `AGENTMEMORY_III_VERSION=<version>`, если вы вручную перешли на sandbox-модель.

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSL https://github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-aarch64-apple-darwin.tar.gz | tar -xz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** замените `aarch64-apple-darwin` на `x86_64-apple-darwin`
- **Linux x64:** замените на `x86_64-unknown-linux-gnu`
- **Linux arm64:** замените на `aarch64-unknown-linux-gnu`
- **Windows:** скачайте `iii-x86_64-pc-windows-msvc.zip` из [iii-hq/iii releases v0.11.2](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2), распакуйте `iii.exe`, добавьте в PATH

Либо используйте Docker (входящий в комплект `docker-compose.yml` тянет `iiidev/iii:0.11.2`). Полная документация: [iii.dev/docs](https://iii.dev/docs).

### Windows

agentmemory работает на Windows 10/11, но одного Node.js-пакета мало — также нужен runtime `iii-engine` (отдельный нативный бинарь) как фоновый процесс. Официальный upstream-установщик — это `sh`-скрипт, на сегодня нет ни PowerShell-установщика, ни пакета scoop/winget, поэтому у пользователей Windows два пути:

**Вариант A — Готовый Windows-бинарь (рекомендуется):**

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

**Вариант B — Docker Desktop:**

```powershell
# 1. Install Docker Desktop for Windows
# 2. Start Docker Desktop and make sure the engine is running
# 3. Run agentmemory — it will auto-start the bundled compose file:
npx -y @agentmemory/agentmemory
```

**Вариант C — только standalone MCP (без движка):** если вам нужны только MCP-инструменты для агента и не нужны REST API, просмотрщик или cron-задачи, пропустите движок целиком:

```powershell
npx -y @agentmemory/agentmemory mcp
# or via the shim package:
npx -y @agentmemory/mcp
```

**Диагностика на Windows:** если `npx @agentmemory/agentmemory` падает, перезапустите с `--verbose`, чтобы увидеть реальный stderr движка. Частые сценарии сбоя:

| Симптом | Что делать |
|---|---|
| `iii-engine process started`, затем `did not become ready within 15s` | Движок упал при старте — перезапустите с `--verbose`, проверьте stderr |
| `Could not start iii-engine` | Не установлены ни `iii.exe`, ни Docker. См. варианты A или B выше |
| Конфликт порта | `netstat -ano \| findstr :3111`, чтобы понять, что занимает порт, затем убить процесс или использовать `--port <N>` |
| Откат на Docker пропускается, хотя Docker установлен | Убедитесь, что Docker Desktop действительно запущен (иконка в трее) |

> Примечание: **движок** iii — это готовый бинарь, а не cargo-крейт, не пытайтесь установить его через `cargo install`. (**SDK** iii опубликованы на crates.io, npm и PyPI, но agentmemory они не нужны.) Поддерживаемые способы установки движка, все закреплены на v0.11.2: готовый бинарь v0.11.2 выше, upstream-`sh`-скрипт **с закреплением версии** `curl -fsSL https://install.iii.dev/iii/main/install.sh | VERSION=0.11.2 sh` (macOS/Linux) и Docker-образ `iiidev/iii:0.11.2`. Простой `install.sh | sh` устанавливает **последний** движок, который agentmemory не поддерживает, — всегда передавайте `VERSION=0.11.2`. Самый простой вариант: просто запустите `npx @agentmemory/agentmemory`, который сам загрузит закреплённый движок в `~/.agentmemory/bin`.

---

<h2 id="deploy">Развёртывание</h2>

Шаблоны в один клик для managed-хостов. Каждый поставляет автономный
Dockerfile, который тянет `@agentmemory/agentmemory` из npm и копирует
бинарь iii engine из официального образа `iiidev/iii` на Docker
Hub — собственный преcобранный образ agentmemory не нужен. Постоянное
хранилище монтируется в `/data`; entrypoint при первом запуске
перезаписывает поставляемый npm'ом iii-конфиг (который слушает на
`127.0.0.1`) на deploy-вариант, слушающий на `0.0.0.0` и
использующий абсолютные пути `/data`, генерирует HMAC-секрет,
а затем понижает привилегии с `root` до `node` через `gosu`
перед запуском CLI agentmemory.

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

Кнопке Render «деплой в один клик» нужен `render.yaml` в корне репозитория, который мы намеренно держим чистым. Используйте схему через Render Blueprint, описанную в [`deploy/render/`](./deploy/render/README.md), чтобы вручную указать на in-repo blueprint.

Полные детали настройки (захват HMAC, SSH-туннель к просмотрщику, ротация, бэкап, нижние пороги стоимости) — в [`deploy/`](./deploy/README.md):

- [`deploy/fly`](./deploy/fly/README.md) — одна машина с
  `auto_stop_machines = "stop"`; дешевле всего в простое.
- [`deploy/railway`](./deploy/railway/README.md) — фиксированный тариф Hobby,
  том в панели.
- [`deploy/render`](./deploy/render/README.md) — поток Blueprint,
  автоматические снапшоты диска на платных тарифах.
- [`deploy/coolify`](./deploy/coolify/README.md) — self-hosted на собственном
  VPS через [Coolify](https://coolify.io/self-hosted); тот же Docker
  Compose-стек, хост и данные у вас.

Публикуется только порт `3111`. Просмотрщик на `3113` остаётся
привязанным к loopback внутри контейнера — в README каждого шаблона
описан паттерн SSH-туннеля, чтобы до него достучаться.

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Зачем agentmemory" height="32" /></picture></h2>

Каждый агент программирования забывает всё, когда сессия заканчивается. Вы тратите первые 5 минут каждой сессии на повторное объяснение своего стека. agentmemory работает в фоне и устраняет это полностью.

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

Каждый ИИ-агент программирования поставляется со встроенной памятью — у Claude Code есть `MEMORY.md`, у Cursor — notepad'ы, у Cline — memory bank. Это работает как стикеры. agentmemory — индексируемая база данных за этими стикерами.

| | Встроенная (CLAUDE.md) | agentmemory |
|---|---|---|
| Масштаб | Потолок в 200 строк | Без ограничений |
| Поиск | Загружает всё в контекст | BM25 + векторный + граф (только top-K) |
| Цена в токенах | 22K+ при 240 наблюдениях | ~1 900 токенов (на 92 % меньше) |
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

### 4-уровневая консолидация памяти

Вдохновлено тем, как мозг человека обрабатывает воспоминания — похоже на консолидацию во время сна.

| Уровень | Что | Аналогия |
|------|------|---------|
| **Working** | Сырые наблюдения от использования инструментов | Кратковременная память |
| **Episodic** | Сжатые краткие итоги сессий | «Что произошло» |
| **Semantic** | Извлечённые факты и закономерности | «Что я знаю» |
| **Procedural** | Workflow'ы и паттерны принятия решений | «Как это сделать» |

Воспоминания затухают со временем (кривая Эббингауза). Часто используемые воспоминания усиливаются. Устаревшие — автоматически вытесняются. Противоречия обнаруживаются и разрешаются.

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
| **Автоматический захват** | Каждое использование инструмента записывается через хуки — никаких ручных усилий |
| **Семантический поиск** | BM25 + векторный + граф знаний со слиянием RRF |
| **Эволюция памяти** | Версионирование, supersession, графы связей |
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

BM25 «из коробки» токенизирует греческий, кириллицу, иврит, арабский и латиницу с диакритикой. Для записей на китайском / японском / корейском поставьте опциональные сегментаторы (`npm install @node-rs/jieba tiny-segmenter`), чтобы CJK-последовательности разбивались на токены уровня слова; без них agentmemory мягко откатывается к токенизации целых последовательностей и выводит одноразовую подсказку в stderr.

### Провайдеры эмбеддингов

agentmemory автоматически определяет вашего провайдера. Для лучших результатов поставьте локальные эмбеддинги (бесплатно):

```bash
npm install @xenova/transformers
```

| Провайдер | Модель | Стоимость | Заметки |
|---|---|---|---|
| **Локально (рекомендуется)** | `all-MiniLM-L6-v2` | Бесплатно | Офлайн, +8 пп recall по сравнению только с BM25 |
| Gemini | `gemini-embedding-001` | Бесплатный тариф | 100+ языков, размерности 768/1536/3072 (MRL), вход 2048 токенов. Заменяет `text-embedding-004` ([устарел, отключение 14 янв. 2026](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | 0,02 $/1M | Высочайшее качество |
| Voyage AI | `voyage-code-3` | Платно | Оптимизирован под код |
| Cohere | `embed-english-v3.0` | Бесплатная пробная версия | Общего назначения |
| OpenRouter | Любая модель | Зависит | Мульти-модельный прокси |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP-сервер" height="32" /></picture></h2>

53 инструмента, 6 ресурсов, 3 промпта и 4 skill'а — самый исчерпывающий MCP-набор для памяти любого агента.

> **MCP-shim против полного сервера:** опубликованный пакет `@agentmemory/mcp` — это тонкий shim. Он раскрывает полную поверхность из 51 инструмента **только если может достучаться до работающего сервера agentmemory** через `AGENTMEMORY_URL` (режим прокси). Если сервер недоступен, shim откатывается к локальному набору из 7 инструментов (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). Переменная окружения `AGENTMEMORY_TOOLS=core|all` — *серверный* флаг; задавать её в блоке `env` shim'а бесполезно. Если в Cursor / OpenCode / Gemini CLI видно только 7 инструментов, запустите `npx @agentmemory/agentmemory` (или Docker-стек) и установите `AGENTMEMORY_URL=http://localhost:3111`.

### 51 инструмент

<details>
<summary>Базовые инструменты (всегда доступны)</summary>

| Инструмент | Описание |
|------|-------------|
| `memory_recall` | Искать в прошлых наблюдениях |
| `memory_compress_file` | Сжимать markdown-файлы с сохранением структуры |
| `memory_save` | Сохранить инсайт, решение или паттерн |
| `memory_patterns` | Выявить повторяющиеся паттерны |
| `memory_smart_search` | Гибридный семантический + keyword-поиск |
| `memory_file_history` | Прошлые наблюдения о конкретных файлах |
| `memory_sessions` | Список последних сессий |
| `memory_timeline` | Хронологические наблюдения |
| `memory_profile` | Профиль проекта (концепции, файлы, паттерны) |
| `memory_export` | Экспортировать все данные памяти |
| `memory_relations` | Запрос к графу связей |

</details>

<details>
<summary>Расширенные инструменты (всего 51 — задайте AGENTMEMORY_TOOLS=all)</summary>

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

### 6 ресурсов · 3 промпта · 4 skill'а

| Тип | Имя | Описание |
|------|------|-------------|
| Ресурс | `agentmemory://status` | Состояние, число сессий, число записей памяти |
| Ресурс | `agentmemory://project/{name}/profile` | Интеллект на уровне проекта |
| Ресурс | `agentmemory://memories/latest` | 10 последних активных записей памяти |
| Ресурс | `agentmemory://graph/stats` | Статистика графа знаний |
| Промпт | `recall_context` | Поиск + возврат контекстных сообщений |
| Промпт | `session_handoff` | Передача данных между агентами |
| Промпт | `detect_patterns` | Анализ повторяющихся паттернов |
| Skill | `/recall` | Поиск по памяти |
| Skill | `/remember` | Сохранение в долговременную память |
| Skill | `/session-history` | Краткие итоги последних сессий |
| Skill | `/forget` | Удаление наблюдений / сессий |

### Standalone MCP

Запуск без полного сервера — для любого MCP-клиента. Подойдёт любое:

```bash
npx -y @agentmemory/agentmemory mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

Или добавьте в MCP-конфиг своего агента:

Большинство агентов (Cursor, Claude Desktop, Cline, Roo Code, Windsurf, Gemini CLI):
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

Автоматически запускается на порту `3113`. Живой поток наблюдений, обозреватель сессий, браузер по памяти, визуализация графа знаний и панель состояния.

```bash
open http://localhost:3113
```

Сервер просмотрщика по умолчанию слушает на `127.0.0.1`. Эндпоинт `/agentmemory/viewer`, отдаваемый REST'ом, подчиняется обычным правилам bearer-токена `AGENTMEMORY_SECRET`. Заголовки CSP используют nonce скрипта на ответ и отключают inline-атрибуты-обработчики (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

Просмотрщик на `:3113` показывает, что ваш агент **запомнил**. [iii console](https://iii.dev/docs/console) показывает, что ваш агент **сделал** — каждая операция памяти как трейс OpenTelemetry, каждая запись KV редактируема, каждая функция вызываема, каждый стрим тэппится. Два окна на одну и ту же память: одно повёрнуто к продукту, другое к движку.

Наблюдайте, как срабатывает `memory_smart_search`, и видите BM25-скан → поиск эмбеддингов → RRF-слияние → reranker в виде waterfall. Отредактируйте зависший таймер консолидации в браузере KV. Воспроизведите хук `PostToolUse` с изменённым payload. Пин WebSocket-стрима — и смотрите, как наблюдения прилетают в реальном времени.

agentmemory отдаёт это бесплатно, потому что каждая функция, триггер, scope состояния и стрим — это примитив iii: ничего самописного, нечего инструментировать.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="Страница Workers в iii console — подключённые воркеры, включая инстансы agentmemory, с живым числом функций и метаданными runtime" width="720" />
  <br/>
  <em>Страница Workers: каждый подключённый воркер — включая сам agentmemory — с PID, количеством функций, runtime и временем последнего появления.</em>
</p>

**Уже установлено.** Console поставляется вместе с `iii` — отдельный установщик не нужен.

**Запускать рядом с agentmemory:**

```bash
# agentmemory viewer holds port 3113, so run the console on 3114.
# Engine REST (3111), WebSocket (3112), and bridge (49134) defaults match agentmemory.
iii console --port 3114
```

Затем откройте `http://localhost:3114`. Добавьте `--enable-flow` для экспериментальной страницы графа архитектуры.

Переопределяйте эндпоинты движка только если вы их перенесли:

```bash
iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**Что можно делать из console:**

| Страница | Зачем |
|------|-----------|
| **Workers** | Видеть каждый подключённый воркер и его живые метрики — включая сам воркер agentmemory. |
| **Functions** | Напрямую вызывать любую функцию agentmemory с JSON-payload — удобно для тестов `memory.recall`, `memory.consolidate`, `graph.query` без подключения клиента. |
| **Triggers** | Воспроизводить HTTP-, cron-, event- и state-триггеры — запустить cron консолидации вручную, повторить HTTP-маршрут, эмитировать изменение состояния. |
| **States** | KV-браузер с полным CRUD — сессии, слоты памяти, lifecycle-таймеры, индекс эмбеддингов — редактирование значений на месте. |
| **Streams** | Живой WebSocket-монитор для записей памяти, событий хуков и обновлений наблюдений по мере их прохождения через iii-стримы. |
| **Queues** | Долговечные топики очередей + управление dead-letter. Повтор или сброс упавших job'ов эмбеддинга / компрессии. |
| **Traces** | Виды waterfall / flame / разбивка по сервисам в OpenTelemetry. Фильтр по `trace_id` показывает, какие функции, обращения к БД и embedding-запросы породил отдельный `memory.search`. |
| **Logs** | Структурированные OTEL-логи, фильтруемые и коррелируемые с trace-/span-ID. |
| **Config** | Конфигурация runtime — какие именно воркеры, провайдеры и порты использует ваш движок. |
| **Flow** | (Опционально, `--enable-flow`) Интерактивный граф архитектуры из всех воркеров, триггеров и стримов. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="Просмотр trace-waterfall в iii console с длительностью каждого span" width="720" />
  <br/>
  <em>Traces: waterfall / flame / разбивка по сервисам для каждой операции памяти.</em>
</p>

**Traces уже включены:**

`iii-config.yaml` поставляется с включённым воркером `iii-observability` (`exporter: memory`, `sampling_ratio: 1.0`, метрики + логи). Дополнительная настройка не нужна — как только agentmemory запускается, каждая операция памяти эмитит trace-span и структурированный лог, который консоль читает.

Если хотите экспортировать в Jaeger/Honeycomb/Grafana Tempo, измените `exporter: memory` на `exporter: otlp` и укажите эндпоинт коллектора согласно документации по observability в iii.

> **Внимание:** на самой console аутентификация не применяется — держите её привязанной к `127.0.0.1` (по умолчанию) и никогда не выставляйте наружу.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory — это **уже работающий инстанс [iii](https://iii.dev)**. Функции, триггеры, KV-состояние, стримы, OTEL-трейсы — всё это примитивы iii. Вы не ставили Postgres, Redis, Express, pm2 или Prometheus, потому что iii их заменяет.

Это значит, что одна дополнительная команда расширяет agentmemory целой новой возможностью.

### Расширить agentmemory одной командой

```bash
iii worker add iii-pubsub          # fan memory writes out to every connected instance
iii worker add iii-cron            # scheduled consolidation, decay sweeps, snapshot rotation
iii worker add iii-queue           # durable retries for embedding + compression jobs
iii worker add iii-observability   # OTEL traces on every memory op (default on)
iii worker add iii-sandbox         # run recalled code inside an isolated microVM
iii worker add iii-database        # swap in a SQL-backed state adapter
iii worker add mcp                 # generic MCP host alongside the agentmemory MCP
```

Каждый `iii worker add` регистрирует новые функции и триггеры в том же движке, где уже работает agentmemory. Просмотрщик и console подхватывают их мгновенно — без перезагрузки, новой интеграции или нового контейнера.

| `iii worker add` | Что получаете сверху к agentmemory |
|---|---|
| [`iii-pubsub`](https://workers.iii.dev/workers/iii-pubsub) | Память на множестве инстансов: каждое `remember` разлетается, каждое `search` читает объединение |
| [`iii-cron`](https://workers.iii.dev/workers/iii-cron) | Жизненный цикл по расписанию — ночная консолидация, еженедельные снапшоты, decay по фиксированному таймеру |
| [`iii-queue`](https://workers.iii.dev/workers/iii-queue) | Надёжные повторы: упавшие job'ы эмбеддинга и компрессии переживают перезапуск, наблюдения не теряются |
| [`iii-observability`](https://workers.iii.dev/workers/iii-observability) | OTEL-трейсы, метрики, логи на каждой функции — подключены в `iii-config.yaml` с первого дня |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | Код, пришедший из `memory_recall`, исполняется внутри одноразовой VM, а не в вашем shell |
| [`iii-database`](https://workers.iii.dev/workers/iii-database) | SQL-адаптер состояния, когда дефолтная in-memory KV уже мала |
| [`mcp`](https://workers.iii.dev/workers/mcp) | Поднять дополнительные MCP-серверы рядом с MCP'ом agentmemory, на одном и том же движке |

Полный реестр: [workers.iii.dev](https://workers.iii.dev). Каждый воркер там собирается из тех же примитивов, что и agentmemory — и тот agentmemory, который у вас уже есть, — один из них.

### Что заменяет iii

| Традиционный стек | agentmemory использует |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + векторный индекс в памяти |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | Супервизия воркеров движка iii |
| Prometheus / Grafana | iii OTEL + монитор состояния |
| Самописные плагинные системы | `iii worker add <name>` |

**118 исходных файлов · ~21 800 LOC · 950+ тестов · 123 функции · 34 KV-scope'а** — всё на трёх примитивах. Никакого `agentmemory plugin install`. Плагинная система — это сам iii.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Конфигурация" height="32" /></picture></h2>

### LLM-провайдеры

agentmemory автоопределяет провайдера по окружению. По умолчанию никакие вызовы LLM не выполняются, пока вы не настроите провайдера или явно не включите fallback на подписку Claude.

| Провайдер | Конфигурация | Заметки |
|----------|--------|-------|
| **No-op (по умолчанию)** | Настройка не нужна | LLM-сжатие/резюме ВЫКЛЮЧЕНО. Синтетическое BM25-сжатие и recall продолжают работать. Если вы раньше полагались на fallback подписки Claude — см. `AGENTMEMORY_ALLOW_AGENT_SDK` ниже. |
| Anthropic API | `ANTHROPIC_API_KEY` | Поминутная (token-based) оплата |
| MiniMax | `MINIMAX_API_KEY` | Совместим с Anthropic |
| Gemini | `GEMINI_API_KEY` | Дополнительно включает эмбеддинги |
| OpenRouter | `OPENROUTER_API_KEY` | Любая модель |
| Fallback на подписку Claude | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Только по согласию. Запускает сессии `@anthropic-ai/claude-agent-sdk` — раньше приводил к неограниченной рекурсии Stop-хука, потому больше не по умолчанию. |

### Выбор модели с учётом стоимости

Фоновое сжатие выполняется на каждом наблюдении, поэтому выбор модели заметно влияет на ежемесячные расходы. Замеренные данные нагрузки: 635 запросов / 888K токенов / 35 часов активного использования, прогон против трёх моделей OpenRouter по ценам на 2026-05-23.

| Уровень | Модель | Вход / 1M | Выход / 1M | Стоимость за зафиксированные 35 ч | Заметки |
|------|-------|------------|-------------|---------------------------|-------|
| Рекомендовано | `deepseek/deepseek-v4-pro` | 0,435 $ | 0,87 $ | ~0,46 $ | Хорошее качество сжатия и резюмирования при стоимости ~10× ниже Sonnet. |
| Рекомендовано | `deepseek/deepseek-chat` | 0,27 $ | 1,10 $ | ~0,40 $ | Постарше, но для рабочих нагрузок только на сжатие по-прежнему годится. |
| Рекомендовано | `qwen/qwen3-coder` | 0,45 $ | 1,80 $ | ~0,55 $ | Сильное code-reasoning, если ваши сессии сильно завязаны на код. |
| Premium | `anthropic/claude-sonnet-4.6` | 3,00 $ | 15,00 $ | ~5,02 $ | Высокое качество, но дорого для постоянной фоновой работы. |
| Premium | `openai/gpt-4o` | 2,50 $ | 10,00 $ | ~4,20 $ | Класс, схожий с Sonnet. |
| Избегать | `anthropic/claude-opus-4.6` | 15,00 $ | 75,00 $ | ~25+ $ | Модель класса reasoning; колоссальный перерасход на сжатие. |

agentmemory выводит runtime-предупреждение, когда `OPENROUTER_MODEL` совпадает с шаблоном premium-уровня. Установите `AGENTMEMORY_SUPPRESS_COST_WARNING=1`, чтобы заглушить его, как только сделаете осознанный выбор.

Компромисс качество/цена для работы с памятью: сжатие — это задача резюмирования с относительно мягкими требованиями к качеству (резюме перечитывает агент, не пользователь). DeepSeek-V4-Pro / Qwen3-Coder ложатся на этой задаче в пределах погрешности от Sonnet, стоя примерно в 10 раз дешевле. Премиум-модели оставляйте для запросов, которые читаете напрямую.

Источники: [цены OpenRouter на Sonnet 4.6](https://openrouter.ai/anthropic/claude-sonnet-4.6/pricing), [DeepSeek V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro), [заметки о ценах DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/).

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

Что фильтруется в режиме `isolated`: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Каждый эндпоинт принимает `?agentId=<role>` для переопределения на конкретный запрос и `?agentId=*`, чтобы полностью выйти из env-scope. `/memories` дополнительно принимает `?includeOrphans=true`, чтобы поднять «доисторические» записи памяти, у которых `agentId` не определён.

Переопределение в самом вызове на уровне SDK / REST: каждый мутирующий эндпоинт (`/session/start`, `/remember`) принимает поле `agentId` в теле запроса, которое выигрывает у env. Полезно для runtime'ов, прогоняющих много ролей через один серверный процесс.

Когда `AGENT_ID` не задан, память остаётся без scope (legacy-поведение: ни тегов, ни фильтров).

### Порты

agentmemory + iii-engine по умолчанию занимают четыре порта. Если перезапуск падает с `port in use`, эта таблица подскажет, какой процесс искать.

| Порт | Процесс | Назначение | Override через env |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | Внутренний streams-воркер (используется agentmemory + просмотрщиком) | `III_STREAMS_PORT` |
| `3113` | agentmemory | Просмотрщик в реальном времени (`http://localhost:3113`) | `AGENTMEMORY_VIEWER_PORT` |
| `49134` | iii-engine | WebSocket — воркеры регистрируются здесь, по нему же течёт OTel-телеметрия | `III_ENGINE_URL` (полный URL, по умолчанию `ws://localhost:49134`) |

Очистка завис­ших процессов, если порты остаются занятыми после падения:

```bash
# macOS / Linux — find whatever is on each port and kill it
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` корректно вычищает и воркер, и pidfile движка при штатном завершении. Ручная очистка выше нужна только в посткрэшевом сценарии, когда ни один pidfile не остался.

### Конфигурационный файл

Помещайте runtime-конфигурацию agentmemory в `~/.agentmemory/.env`, а не экспортируйте переменные в каждой сессии shell. Если просмотрщик показывает подсказку настройки вида `export ANTHROPIC_API_KEY=...`, скопируйте её в этот файл как `ANTHROPIC_API_KEY=...` без префикса `export`, затем перезапустите agentmemory.

Переменные окружения процесса по-прежнему работают и имеют приоритет над значениями из файла.

В Windows тот же файл лежит в `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

Чтобы протестировать с подпиской Claude Code Pro/Max вместо API-ключа, включите её явно:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

В этом же файле включите возможности графа или консолидации, если они нужны:

```env
GRAPH_EXTRACTION_ENABLED=true
CONSOLIDATION_ENABLED=true
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
# leave OFF unless you understand the Stop-hook recursion risk:
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
# AGENTMEMORY_AUTO_COMPRESS=false  # OFF by default. When on,
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

124 эндпоинта на порту `3111`. REST API по умолчанию слушает на `127.0.0.1`. Защищённые эндпоинты требуют `Authorization: Bearer <secret>`, когда установлен `AGENTMEMORY_SECRET`, а эндпоинты mesh-синхронизации требуют `AGENTMEMORY_SECRET` на обоих узлах.

<details>
<summary>Ключевые эндпоинты</summary>

| Метод | Путь | Описание |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Проверка состояния (всегда публична) |
| `POST` | `/agentmemory/session/start` | Запуск сессии + получение контекста |
| `POST` | `/agentmemory/session/end` | Завершение сессии |
| `POST` | `/agentmemory/observe` | Захват наблюдения |
| `POST` | `/agentmemory/smart-search` | Гибридный поиск |
| `POST` | `/agentmemory/context` | Генерация контекста |
| `POST` | `/agentmemory/remember` | Сохранить в долговременную память |
| `POST` | `/agentmemory/forget` | Удалить наблюдения |
| `POST` | `/agentmemory/enrich` | Контекст файла + записи памяти + баги |
| `GET` | `/agentmemory/profile` | Профиль проекта |
| `GET` | `/agentmemory/export` | Экспорт всех данных |
| `POST` | `/agentmemory/import` | Импорт из JSON |
| `POST` | `/agentmemory/graph/query` | Запрос к графу знаний |
| `POST` | `/agentmemory/team/share` | Расшарить в команду |
| `GET` | `/agentmemory/audit` | Аудит-журнал |

Полный список эндпоинтов: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Разработка" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 950+ tests
npm run test:integration  # API tests (requires running services)
```

**Требования:** Node.js >= 20, [iii-engine](https://iii.dev/docs) или Docker

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="Лицензия" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
