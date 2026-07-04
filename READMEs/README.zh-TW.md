<p align="center">
  <img src="../assets/banner.png" alt="agentmemory — 為 AI 編碼代理提供持久化記憶" width="720" />
</p>

<p align="center">
  <strong>
    讓你的編碼代理記住一切。不再重複解釋。
    Built on <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  為 Claude Code、Cursor、Gemini CLI、Codex CLI、Hermes、OpenClaw、pi、OpenCode 以及任何 MCP 用戶端提供持久化記憶。
</p>

<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  繁體中文 |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.es-ES.md">Español</a> |
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1200%20stars%20%2F%20172%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Design doc: 1200 stars / 172 forks on the gist" /></a>
</p>

<p align="center">
  <em>這份 gist 以信心評分、生命週期管理、知識圖譜和混合搜尋擴展了 Karpathy 的 LLM Wiki 模式:agentmemory 就是其實作。</em>
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
  <img src="../assets/demo.gif" alt="agentmemory demo" width="720" />
</p>

<p align="center">
  <a href="#install">安裝</a> &bull;
  <a href="#quick-start">快速開始</a> &bull;
  <a href="#benchmarks">基準測試</a> &bull;
  <a href="#vs-competitors">對比競品</a> &bull;
  <a href="#works-with-every-agent">代理</a> &bull;
  <a href="#how-it-works">運作原理</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">檢視器</a> &bull;
  <a href="#iii-console">iii 主控台</a> &bull;
  <a href="#powered-by-iii">由 iii 驅動</a> &bull;
  <a href="#configuration">設定</a> &bull;
  <a href="#api">API</a>
</p>

---

## 安裝

```bash
npm install -g @agentmemory/agentmemory          # 一次安裝 — 全域可用 `agentmemory` 指令
# 如果在 macOS/Linux 的系統 Node 上遇到 EACCES,請重試:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                                      # 在 :3111 啟動記憶伺服器
agentmemory demo                                 # 注入範例會話並驗證召回
agentmemory connect claude-code                  # 連接你的代理(也支援: codex, cursor, gemini-cli, ...)
```

或透過 `npx`(無需安裝):

```bash
npx @agentmemory/agentmemory
```

提醒 — npx 會依版本快取。若裸 `npx @agentmemory/agentmemory` 指令執行的是舊版,強制使用最新版 `npx -y @agentmemory/agentmemory@latest`,或一次性清除快取 `rm -rf ~/.npm/_npx`(macOS/Linux;Windows 上刪除 `%LOCALAPPDATA%\npm-cache\_npx`)。從 v0.9.16+ 起,首次 npx 執行會以行內方式提示你全域安裝,之後裸 `agentmemory` 指令在任何地方都能用。

完整選項見下方[快速開始](#quick-start)。各代理具體接入見[支援所有代理](#works-with-every-agent)。

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Works with every agent" height="32" /></picture></h2>

agentmemory 相容任何支援 hooks、MCP 或 REST API 的代理。所有代理共享同一個記憶伺服器。

<table>
<tr>
<td align="center" width="12.5%">
<a href="https://claude.com/product/claude-code"><img src="https://matthiasroder.com/content/images/2026/01/Claude.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>原生外掛 + 12 hooks + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>原生外掛 + 6 hooks + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>原生外掛 + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>原生外掛 + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>原生外掛 + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://raw.githubusercontent.com/tinyhumansai/openhuman/main/app/src-tauri/icons/128x128.png" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>原生 Memory trait 後端</sub>
</td>
<td align="center" width="12.5%">
<a href="https://cursor.com"><img src="https://www.freelogovectors.net/wp-content/uploads/2025/06/cursor-logo-freelogovectors.net_.png" alt="Cursor" width="48" height="48" /></a><br/>
<strong>Cursor</strong><br/>
<sub>MCP 伺服器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP 伺服器</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<a href="https://github.com/opencode-ai/opencode"><img src="https://github.com/opencode-ai.png?size=120" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>22 hooks + MCP + 外掛</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP 伺服器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP 伺服器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP 伺服器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
<td align="center" width="12.5%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP 伺服器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://windsurf.com"><img src="https://exafunction.github.io/public/brand/windsurf-black-symbol.svg?size=120" alt="Windsurf" width="48" height="48" /></a><br/>
<strong>Windsurf</strong><br/>
<sub>MCP 伺服器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP 伺服器</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>相容<strong>任何</strong>使用 MCP 或 HTTP 的代理。一個伺服器,所有代理共享記憶。</sub>
</p>

---

你每次會話都在重複解釋同樣的架構。你反覆發現同樣的 bug。你重複教同樣的偏好。內建的記憶(CLAUDE.md、.cursorrules)上限是 200 行而且會過期。agentmemory 解決了這個問題。它在背景靜默捕捉代理的行為,將其壓縮為可搜尋的記憶,並在下次會話開始時注入正確的上下文。一條指令。跨代理工作。

**改變了什麼:** 會話 1 你設定了 JWT 驗證。會話 2 你要求限流。代理已經知道你的驗證使用 `src/middleware/auth.ts` 中的 jose middleware,測試覆蓋了 token 驗證,你選擇 jose 而非 jsonwebtoken 是為了 Edge 相容性。無需重新解釋。無需複製貼上。代理就是*知道*。

```bash
npx @agentmemory/agentmemory
```

> **v0.9.0 新功能** — 著陸頁 [agent-memory.dev](https://agent-memory.dev) 上線,檔案系統連接器(`@agentmemory/fs-watcher`),獨立 MCP 現在代理至執行中的伺服器,使 hooks 和檢視器保持一致,稽核策略在所有刪除路徑上得到統一,健康狀態在小型 Node 行程上不再誤報 `memory_critical`。完整變更見 [CHANGELOG.md](../CHANGELOG.md#090--2026-04-18)。

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### 檢索準確率

**coding-agent-life-v1** (內部語料庫,沙盒可重現)

| 適配器 | P@5 | R@5 | Top-5 命中率 | p50 延遲 |
|---|---|---|---|---|
| **agentmemory 混合** | **0.578** | **0.967** | **15 / 15** | 14 ms |
| grep 基線 | 0.267 | 0.967 | 15 / 15 | 0 ms |

100% Top-5 命中率。在相同輸入下,精確度比 grep 基線高 **2.2×**。完整依類型分解:[`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md)。

**LongMemEval-S** (ICLR 2025,500 個問題)

| 系統 | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| 僅 BM25 回退 | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Token 節省

| 方法 | Token/年 | 成本/年 |
|---|---|---|
| 貼上完整上下文 | 19.5M+ | 不可能(超出窗口) |
| LLM 摘要 | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + 本地嵌入 | ~170K | **$0** |

</td>
</tr>
</table>

> 嵌入模型:`all-MiniLM-L6-v2`(本地、免費、無需 API key)。完整報告:[`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md)、[`benchmark/QUALITY.md`](../benchmark/QUALITY.md)、[`benchmark/SCALE.md`](../benchmark/SCALE.md)。競品比較:[`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) — agentmemory 比較 mem0、Letta、Khoj、claude-mem、Hippo。

**在地重現:** [`eval/README.md`](../eval/README.md) — 適配器可插拔的 harness,支援 LongMemEval `_s`(公開 500 問)+ `coding-agent-life-v1`(內部 15 會話語料)。Grep / 向量 / agentmemory 適配器並排計分,NDJSON 輸出,公開計分卡發布於 [`docs/benchmarks/`](../docs/benchmarks/)。

**搭配 [codegraph](https://github.com/colbymchenry/codegraph)、[Understand Anything](https://github.com/Lum1104/Understand-Anything) 和 [Graphify](https://github.com/safishamsi/graphify) 使用。** 程式碼圖索引、多代理建置流水線,以及跨文件 / PDF / 圖片 / 影片的更廣泛知識圖譜。agentmemory 記住工作內容;這三個專案點亮上下文層其餘部分。組合配方與問題路由表:[`docs/recipes/pairings.md`](../docs/recipes/pairings.md)。

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="vs Competitors" height="32" /></picture></h2>

<table>
<tr>
<th width="20%"></th>
<th width="20%">agentmemory</th>
<th width="20%">mem0 (53K ⭐)</th>
<th width="20%">Letta / MemGPT (22K ⭐)</th>
<th width="20%">內建 (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>類型</strong></td>
<td>記憶引擎 + MCP 伺服器</td>
<td>記憶層 API</td>
<td>完整代理執行階段</td>
<td>靜態檔案</td>
</tr>
<tr>
<td><strong>檢索 R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>自動捕捉</strong></td>
<td>12 hooks(零人工)</td>
<td>手動呼叫 <code>add()</code></td>
<td>代理自編輯</td>
<td>手動編輯</td>
</tr>
<tr>
<td><strong>搜尋</strong></td>
<td>BM25 + 向量 + 圖(RRF 融合)</td>
<td>向量 + 圖</td>
<td>向量(歸檔)</td>
<td>把所有內容載入上下文</td>
</tr>
<tr>
<td><strong>多代理</strong></td>
<td>MCP + REST + 租約 + 訊號</td>
<td>API(無協調)</td>
<td>僅在 Letta 執行階段內部</td>
<td>每個代理一個檔案</td>
</tr>
<tr>
<td><strong>框架鎖定</strong></td>
<td>無(任何 MCP 用戶端)</td>
<td>無</td>
<td>高(必須使用 Letta)</td>
<td>每個代理格式</td>
</tr>
<tr>
<td><strong>外部相依</strong></td>
<td>無(SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + 向量資料庫</td>
<td>無</td>
</tr>
<tr>
<td><strong>記憶生命週期</strong></td>
<td>4 層整合 + 衰減 + 自動遺忘</td>
<td>被動擷取</td>
<td>代理管理</td>
<td>手動清理</td>
</tr>
<tr>
<td><strong>Token 效率</strong></td>
<td>~1,900 tokens/會話 ($10/年)</td>
<td>依整合方式不同</td>
<td>核心記憶位於上下文</td>
<td>240 條觀測達 22K+ tokens</td>
</tr>
<tr>
<td><strong>即時檢視器</strong></td>
<td>是(連接埠 3113)</td>
<td>雲端儀表板</td>
<td>雲端儀表板</td>
<td>無</td>
</tr>
<tr>
<td><strong>自架</strong></td>
<td>是(預設)</td>
<td>選用</td>
<td>選用</td>
<td>是</td>
</tr>
</table>

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Quick Start" height="32" /></picture></h2>

相容性:此版本面向穩定的 `iii-sdk` `^0.11.0` 和 iii-engine v0.11.x。

### 30 秒體驗

```bash
# 終端 1:啟動伺服器
npx @agentmemory/agentmemory

# 終端 2:注入範例資料並查看召回
npx @agentmemory/agentmemory demo
```

`demo` 會注入 3 個真實會話(JWT 驗證、N+1 查詢修正、限流)並對它們執行語義搜尋。你將看到搜尋「資料庫效能最佳化」時找到「N+1 查詢修正」 — 關鍵字比對做不到這一點。

打開 `http://localhost:3113` 即時觀察記憶的建構過程。

### 推薦:全域安裝

`npx` 依版本快取。若你上週執行過 `npx @agentmemory/agentmemory@0.9.14`,裸 `npx @agentmemory/agentmemory` 指令可能會從 `~/.npm/_npx/` 提供過期的 0.9.14 而非最新版。安裝一次後,裸 `agentmemory` 指令處處可用:

```bash
npm install -g @agentmemory/agentmemory
# 如果在 macOS/Linux 的系統 Node 上遇到 EACCES,請重試:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                    # 啟動伺服器(等同 npx 形式)
agentmemory stop               # 停止
agentmemory remove             # 解除安裝所有建立的內容
agentmemory connect claude-code   # 連接一個代理
agentmemory doctor             # 互動式診斷 + 修復提示
```

從 v0.9.16 開始,首次 npx 執行會以行內方式提示你全域安裝 — 回答一次 `Y` 即可。若你跳過,可使用以下任一方式取得最新版本:

```bash
npx -y @agentmemory/agentmemory@latest                 # 強制從 npm 拉取最新(跨平台)
rm -rf ~/.npm/_npx && npx @agentmemory/agentmemory     # 僅 macOS/Linux (POSIX shell)
```

在 Windows / PowerShell 上,等價的快取清除指令是 `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"` — 上面的 `npx -y ...@latest` 形式是跨平台選項。

### 會話重播

agentmemory 紀錄的每個會話都可重播。打開檢視器,選擇 **Replay** 標籤,在時間軸上拖動:提示、工具呼叫、工具結果和回應都以離散事件呈現,支援播放/暫停、速度控制(0.5×–4×)和鍵盤快捷鍵(空白鍵切換,方向鍵單步)。

已有舊的 Claude Code JSONL 紀錄想匯入?

```bash
# 匯入預設 ~/.claude/projects 下的全部內容
npx @agentmemory/agentmemory import-jsonl

# 或匯入單一檔案
npx @agentmemory/agentmemory import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

匯入的會話與原生會話一同出現在 Replay 選擇器中。底層每個條目都透過 `mem::replay::load`、`mem::replay::sessions`、`mem::replay::import-jsonl` 這些 iii 函式路由 — 沒有側通道伺服器。

### 升級 / 維護

當你確實想更新本地執行階段時,使用維護指令:

```bash
npx @agentmemory/agentmemory upgrade
```

警告:此指令會變更目前工作區/執行階段。它可能更新 JavaScript 相依,並拉取固定版本的 Docker 鏡像 `iiidev/iii:0.11.2`。它絕不會安裝未固定版本或更新的 iii 引擎。

實作細節見 `src/cli.ts`(參考 `src/cli.ts:544-595` 附近的 `runUpgrade`)。

### Claude Code(一段話,直接貼上)

```text
Install agentmemory: run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 4 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 53 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113.
```

#### Claude Code 不安裝外掛(MCP-standalone 路徑)

若你直接透過 `~/.claude.json` 連接 agentmemory 的 MCP 伺服器而非使用 `/plugin install`,Claude Code 永遠不會解析 `${CLAUDE_PLUGIN_ROOT}`,你必須把 hook 腳本指向 `~/.claude/settings.json` 中的絕對路徑。這些路徑通常會嵌入 agentmemory 版本號(例如 `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.21/scripts/…`),因此下次升級會靜默破壞所有 hooks。

變通方法:

```bash
agentmemory connect claude-code --with-hooks
```

這會把同樣的 hook 指令合併到 `~/.claude/settings.json`,絕對路徑解析到目前安裝的 `@agentmemory/agentmemory` 套件的 `plugin/` 目錄。升級 agentmemory 後重新執行該指令以重新整理路徑。同一檔案中的使用者條目會被保留;只取代之前的 agentmemory 條目。仍然推薦使用 `/plugin install` 路徑。

對於遠端或受保護的部署,啟動 Claude Code 時設定 `AGENTMEMORY_URL` 和 `AGENTMEMORY_SECRET`。外掛會把這兩個值傳遞給其捆綁的 MCP 伺服器;當 `AGENTMEMORY_URL` 為空時,MCP shim 預設使用 `http://localhost:3111`。

### Codex CLI(Codex 外掛平台)

```bash
# 1. 在另一個終端啟動記憶伺服器
npx @agentmemory/agentmemory

# 2. 註冊 agentmemory 市集並安裝外掛
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Codex 外掛與 Claude Code 外掛同源,來自相同的 `plugin/` 目錄。它註冊:

- `@agentmemory/mcp` 作為 MCP 伺服器(當 `AGENTMEMORY_URL` 指向執行中的 agentmemory 伺服器時,代理全部 51 個工具;若伺服器不可達,本地回退至 7 個工具)
- 6 個生命週期 hooks:`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PreCompact`、`Stop`
- 4 個 skills:`/recall`、`/remember`、`/session-history`、`/forget`

Codex 的 hook 引擎會把 `CLAUDE_PLUGIN_ROOT` 注入 hook 子行程(參見 [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)),因此同樣的 hook 腳本在兩個宿主中都能運作,無需重複實作。Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure 事件僅 Claude Code 支援,Codex 未註冊這些。

#### Codex Desktop:外掛 hooks 目前沒有回應(有變通方法)

`CodexHooks` 和 `PluginHooks` 在 [`codex-rs/features/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs) 中都已穩定且預設啟用,但 Codex Desktop 目前不會派發外掛本地的 `hooks.json`([openai/codex#16430](https://github.com/openai/codex/issues/16430))。MCP 工具仍能運作;只是生命週期觀測缺失。

在上游修正落地前,把同樣的 hook 指令鏡像到全域 `~/.codex/hooks.json`:

```bash
agentmemory connect codex --with-hooks
```

這會在 `~/.codex/hooks.json` 新增一個冪等區塊,引用捆綁腳本的絕對路徑(在使用者範圍下無需 `${CLAUDE_PLUGIN_ROOT}` 展開)。升級 agentmemory 後重新執行同一指令以重新整理路徑。同一檔案中的使用者條目會被保留;只取代之前的 agentmemory 條目。

<details>
<summary><b>OpenClaw(貼上此提示)</b></summary>

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

完整指南:[`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent(貼上此提示)</b></summary>

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

完整指南:[`integrations/hermes/`](../integrations/hermes/)

</details>

### 其他代理

啟動記憶伺服器:`npx @agentmemory/agentmemory`

在使用 `mcpServers` 結構的每個宿主(Cursor、Claude Desktop、Cline、Roo Code、Windsurf、Gemini CLI、OpenClaw)中,agentmemory 條目是**相同的 MCP 伺服器區塊**:

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

**把此條目合併到宿主設定檔現有的 `mcpServers` 物件中** — 不要取代整個檔案。若檔案已有其他伺服器,把 `agentmemory` 作為另一個 key 加在它們旁邊。若完全缺少 `mcpServers`,把整個區塊貼到 `{ "mcpServers": { ... } }` 裡。`${VAR}` 佔位符會在 MCP 伺服器啟動時從 shell 繼承 `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` — 未設定的變數傳空字串,shim 回退到 `http://localhost:3111`。一個接好的條目同時涵蓋本地和遠端(k8s / 反向代理)部署。

| 代理 | 設定檔 | 備註 |
|---|---|---|
| **Cursor** | `~/.cursor/mcp.json` | 合併到 `mcpServers`。網站上也提供一鍵深層連結。 |
| **Claude Desktop** | `claude_desktop_config.json`(Application Support) | 合併到 `mcpServers`。編輯後重新啟動 Claude Desktop。 |
| **Cline / Roo Code / Kilo Code** | Cline MCP 設定(設定 UI → MCP Servers → Edit) | 同樣的 `mcpServers` 區塊。 |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | 同樣的 `mcpServers` 區塊。 |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user`(自動合併)。 |
| **OpenClaw** | OpenClaw MCP 設定 | 同樣的 `mcpServers` 區塊,或使用更深的[記憶外掛](../integrations/openclaw/)。 |
| **Codex CLI(僅 MCP)** | `.codex/config.toml` | TOML 形式:`codex mcp add agentmemory -- npx -y @agentmemory/mcp`,或手動新增 `[mcp_servers.agentmemory]`。 |
| **Codex CLI(完整外掛)** | Codex 外掛市集 | `codex plugin marketplace add rohitg00/agentmemory` 然後 `codex plugin add agentmemory@agentmemory`。註冊 MCP + 6 個生命週期 hooks(SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、PreCompact、Stop)+ 4 個 skills。在 Codex Desktop 上,直到 [openai/codex#16430](https://github.com/openai/codex/issues/16430) 落地之前,還要執行 `agentmemory connect codex --with-hooks` — 那裡的外掛 hooks 目前沒有回應。 |
| **OpenCode(僅 MCP)** | `opencode.json` | 不同結構 — 頂層 `mcp` key,command 是陣列:`{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`。 |
| **OpenCode(完整外掛)** | `plugin/opencode/` | 22 個自動捕捉 hooks,涵蓋會話生命週期、訊息、工具、錯誤。兩個斜線指令(`/recall`、`/remember`)。把 `plugin/opencode/` 複製到你的 OpenCode 工作區並把外掛條目新增到 `opencode.json`。完整 hook 表與差異分析見 [`plugin/opencode/README.md`](../plugin/opencode/README.md)。 |
| **pi** | `~/.pi/agent/extensions/agentmemory` | 複製 [`integrations/pi`](../integrations/pi/) 並重啟 pi。 |
| **Hermes Agent** | `~/.hermes/config.yaml` | 使用更深的[記憶提供者外掛](../integrations/hermes/),設定 `memory.provider: agentmemory`。 |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` 會寫入標準的 `mcpServers` 區塊。Hook 負載與 Claude Code 欄位相容,因此既有的 12 hook 腳本無需修改即可運作 — 透過同一 `settings.json` 的 `hooks` 區段連接它們。 |
| **Antigravity**(取代 Gemini CLI) | `mcp_config.json`(在 Antigravity 的 User 目錄中) | `agentmemory connect antigravity` 會寫入標準的 `mcpServers` 區塊。macOS: `~/Library/Application Support/Antigravity/User/`。Linux: `~/.config/Antigravity/User/`。在 2026-06-18 Gemini CLI 停止服務後使用。 |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` 寫入使用者層級設定。工作區覆寫放在你的程式碼旁的 `.kiro/settings/mcp.json` 中。 |
| **Goose** | Goose MCP 設定 UI | 同樣的 `mcpServers` 區塊。 |
| **Aider** | n/a | 直接呼叫 REST API:`curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`。 |
| **任何代理(32+)** | n/a | `npx skillkit install agentmemory` 自動偵測宿主並合併。 |

**沙箱化的 MCP 用戶端**(Flatpak / Snap / 受限容器)無法存取宿主的 `localhost`:還要在 `env` 區塊中設定 `"AGENTMEMORY_FORCE_PROXY": "1"`,並把 `AGENTMEMORY_URL` 指向沙箱確實能到達的路由(例如你的 LAN IP)。

### 程式化存取(Python / Rust / Node)

agentmemory 把核心操作註冊為 iii 函式(`mem::remember`、`mem::observe`、`mem::context`、`mem::smart-search`、`mem::forget`)。任何擁有 iii SDK 的語言都可以透過 `ws://localhost:49134` 直接呼叫它們 — 無需為每種語言準備獨立的 REST 用戶端。

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

完整範例:[`examples/python/`](../examples/python/)(快速開始 + 觀測/召回流程)。`:3111` 上的 REST 對沒有 iii 執行階段的宿主仍可用。

### 從原始碼建置

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

若 `iii` 已安裝,這會以本地 `iii-engine` 啟動 agentmemory;若 Docker 可用,則回退到 Docker Compose。REST、串流和檢視器預設繫結到 `127.0.0.1`。

手動安裝 `iii-engine`。**agentmemory 目前把 `iii-engine` 釘在 `v0.11.2`** — `v0.11.6` 引入了新的「透過 `iii worker add` 沙盒化一切」模型,agentmemory 尚未為此重構。重構落地後即解除釘版。若你已手動遷移到沙盒模型,可用 `AGENTMEMORY_III_VERSION=<version>` 覆寫。

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSL https://github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-aarch64-apple-darwin.tar.gz | tar -xz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** 把 `aarch64-apple-darwin` 換成 `x86_64-apple-darwin`
- **Linux x64:** 換成 `x86_64-unknown-linux-gnu`
- **Linux arm64:** 換成 `aarch64-unknown-linux-gnu`
- **Windows:** 從 [iii-hq/iii releases v0.11.2](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2) 下載 `iii-x86_64-pc-windows-msvc.zip`,擷取 `iii.exe`,加入 PATH

或使用 Docker(捆綁的 `docker-compose.yml` 會拉取 `iiidev/iii:0.11.2`)。完整文件:[iii.dev/docs](https://iii.dev/docs)。

### Windows

agentmemory 可在 Windows 10/11 執行,但僅 Node.js 套件不夠 — 你還需要 `iii-engine` 執行階段(一個獨立的原生二進位)作為背景行程。官方上游安裝器是 `sh` 指令稿,目前沒有 PowerShell 安裝器或 scoop/winget 套件,因此 Windows 使用者有兩條路徑:

**選項 A — 預建 Windows 二進位(推薦):**

```powershell
# 1. 在瀏覽器打開 https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2
#    (我們釘在 v0.11.2,直到 agentmemory 為 v0.11.6+ 引擎需求的
#     新沙盒模型完成重構)
# 2. 下載 iii-x86_64-pc-windows-msvc.zip
#    (若是 ARM 機器則下載 iii-aarch64-pc-windows-msvc.zip)
# 3. 把 iii.exe 解壓到 PATH 上的某處,或放在:
#    %USERPROFILE%\.local\bin\iii.exe
#    (agentmemory 會自動檢查該位置)
# 4. 驗證:
iii --version
# 應輸出:0.11.2

# 5. 然後照常執行 agentmemory:
npx -y @agentmemory/agentmemory
```

**選項 B — Docker Desktop:**

```powershell
# 1. 安裝 Docker Desktop for Windows
# 2. 啟動 Docker Desktop 並確保引擎執行中
# 3. 執行 agentmemory — 它會自動啟動捆綁的 compose 檔:
npx -y @agentmemory/agentmemory
```

**選項 C — 僅獨立 MCP(無引擎):** 若你只需要 MCP 工具供代理使用,不需要 REST API、檢視器或定時工作,則完全跳過引擎:

```powershell
npx -y @agentmemory/agentmemory mcp
# 或透過 shim 套件:
npx -y @agentmemory/mcp
```

**Windows 診斷:** 若 `npx @agentmemory/agentmemory` 失敗,加 `--verbose` 重新執行以看到實際的引擎 stderr。常見失敗模式:

| 症狀 | 修正 |
|---|---|
| `iii-engine process started` 然後 `did not become ready within 15s` | 引擎啟動當機 — 用 `--verbose` 重新執行,檢查 stderr |
| `Could not start iii-engine` | `iii.exe` 和 Docker 都未安裝。見上面選項 A 或 B |
| 連接埠衝突 | `netstat -ano \| findstr :3111` 查看佔用,然後 kill 或用 `--port <N>` |
| Docker 已安裝但仍跳過回退 | 確保 Docker Desktop 確實在執行(系統匣圖示) |

> 注意:iii **引擎** 是預建的二進位檔,而非 cargo crate — 請勿嘗試以 `cargo install` 安裝它。(iii 的 **SDK** 確實已發布到 crates.io、npm 和 PyPI,但 agentmemory 並不需要它們。)受支援的引擎安裝方式皆固定為 v0.11.2:上述預建的 v0.11.2 二進位、**帶版本固定** 的上游 `sh` 安裝指令稿 `curl -fsSL https://install.iii.dev/iii/main/install.sh | VERSION=0.11.2 sh`(macOS/Linux),以及 Docker 鏡像 `iiidev/iii:0.11.2`。直接執行 `install.sh | sh` 會安裝 **最新** 引擎,而 agentmemory 並不支援該版本 — 請務必傳入 `VERSION=0.11.2`。最簡單的方式:直接執行 `npx @agentmemory/agentmemory`,它會為你把固定版本的引擎取得到 `~/.agentmemory/bin`。

---

<h2 id="deploy">部署</h2>

託管主機的一鍵範本。每個範本都附帶自含的
Dockerfile,從 npm 拉取 `@agentmemory/agentmemory` 並從官方
`iiidev/iii` Docker Hub 鏡像複製 iii 引擎二進位 — 無需
預建 agentmemory 鏡像。持久儲存掛載在
`/data`;首次啟動 entrypoint 用面向部署調校的設定
覆寫 npm 捆綁的 iii 設定(原設定繫結 `127.0.0.1`),
讓其繫結 `0.0.0.0` 並使用絕對 `/data` 路徑,產生
HMAC secret,然後透過 `gosu` 從 `root` 降權到 `node`
再 exec agentmemory CLI。

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

Render 的一鍵部署按鈕要求倉庫根有 `render.yaml`,我們刻意保持根目錄整潔。使用 [`deploy/render/`](../deploy/render/README.md) 中文件化的 Render Blueprint 流程,手動指向倉庫內的藍圖。

完整設定細節(HMAC 擷取、檢視器 SSH 隧道、輪替、備份、
成本下限)見 [`deploy/`](../deploy/README.md):

- [`deploy/fly`](../deploy/fly/README.md) — 單機搭配
  `auto_stop_machines = "stop"`;閒置時最便宜。
- [`deploy/railway`](../deploy/railway/README.md) — Hobby 方案固定費,
  磁碟區在儀表板中設定。
- [`deploy/render`](../deploy/render/README.md) — Blueprint 流程,
  付費方案自動磁碟快照。
- [`deploy/coolify`](../deploy/coolify/README.md) — 透過 [Coolify](https://coolify.io/self-hosted)
  在你自己的 VPS 上自架;同樣的 Docker
  Compose 堆疊,主機與資料都歸你所有。

僅發布連接埠 `3111`。`3113` 上的檢視器在容器內仍繫結到
loopback — 每個範本的 README 都文件化了到達它的
SSH 隧道模式。

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Why agentmemory" height="32" /></picture></h2>

每個編碼代理在會話結束時都會忘記一切。你每次會話的前 5 分鐘都浪費在重新解釋技術堆疊上。agentmemory 在背景執行,徹底消除這一點。

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

### 對比內建代理記憶

每個 AI 編碼代理都自帶內建記憶 — Claude Code 有 `MEMORY.md`、Cursor 有 notepad、Cline 有 memory bank。這些像便利貼。agentmemory 是便利貼背後的可搜尋資料庫。

| | 內建 (CLAUDE.md) | agentmemory |
|---|---|---|
| 規模 | 200 行上限 | 無限 |
| 搜尋 | 把所有內容載入上下文 | BM25 + 向量 + 圖(僅 top-K) |
| Token 成本 | 240 條觀測達 22K+ | ~1,900 tokens(少 92%) |
| 跨代理 | 每個代理一個檔案 | MCP + REST(任何代理) |
| 協調 | 無 | 租約、訊號、動作、例程 |
| 可觀測性 | 手動讀檔 | 連接埠 3113 即時檢視器 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="How It Works" height="32" /></picture></h2>

### 記憶流水線

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

### 4 層記憶整合

靈感來自人腦處理記憶的方式 — 與睡眠時的記憶整合並無不同。

| 層級 | 內容 | 類比 |
|------|------|---------|
| **Working(工作記憶)** | 來自工具使用的原始觀測 | 短期記憶 |
| **Episodic(情節記憶)** | 壓縮後的會話摘要 | 「發生了什麼」 |
| **Semantic(語意記憶)** | 擷取的事實與模式 | 「我知道什麼」 |
| **Procedural(程序記憶)** | 工作流與決策模式 | 「怎麼做」 |

記憶隨時間衰減(Ebbinghaus 曲線)。頻繁存取的記憶會強化。陳舊記憶會自動清除。矛盾會被偵測並解決。

### 捕捉了什麼

| Hook | 捕捉內容 |
|------|----------|
| `SessionStart` | 專案路徑、會話 ID |
| `UserPromptSubmit` | 使用者提示(隱私過濾) |
| `PreToolUse` | 檔案存取模式 + 富化上下文 |
| `PostToolUse` | 工具名、輸入、輸出 |
| `PostToolUseFailure` | 錯誤上下文 |
| `PreCompact` | 在壓縮前重新注入記憶 |
| `SubagentStart/Stop` | 子代理生命週期 |
| `Stop` | 會話結束摘要 |
| `SessionEnd` | 會話完成標記 |

### 關鍵能力

| 能力 | 描述 |
|---|---|
| **自動捕捉** | 每次工具使用都透過 hooks 記錄 — 零人工 |
| **語意搜尋** | BM25 + 向量 + 知識圖譜,RRF 融合 |
| **記憶演化** | 版本控制、覆寫關係、關係圖 |
| **自動遺忘** | TTL 過期、矛盾偵測、重要性驅逐 |
| **隱私優先** | API key、secret、`<private>` 標籤儲存前被剝除 |
| **自癒** | 熔斷器、提供者回退鏈、健康監控 |
| **Claude 橋接** | 與 MEMORY.md 雙向同步 |
| **知識圖譜** | 實體擷取 + BFS 走訪 |
| **團隊記憶** | 團隊成員之間的命名空間共享 + 私有 |
| **引用溯源** | 任意記憶追溯到來源觀測 |
| **Git 快照** | 記憶狀態的版本、回滾、diff |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Search" height="32" /></picture></h2>

三路檢索結合三種訊號:

| 流 | 功用 | 何時啟用 |
|---|---|---|
| **BM25** | 詞幹化關鍵字比對 + 同義詞擴展 | 始終啟用 |
| **Vector(向量)** | 稠密嵌入上的餘弦相似度 | 已設定嵌入提供者 |
| **Graph(圖)** | 透過實體比對進行知識圖譜走訪 | 查詢中偵測到實體 |

透過 Reciprocal Rank Fusion (RRF, k=60) 融合,並按會話多樣化(每個會話最多 3 個結果)。

BM25 開箱即用支援希臘文、西里爾文、希伯來文、阿拉伯文和帶音標拉丁文的分詞。對於中文/日文/韓文記憶,安裝可選分詞器(`npm install @node-rs/jieba tiny-segmenter`)以把 CJK 串切分為詞級 token;若未安裝,agentmemory 會軟回退到整串分詞並在 stderr 印出一次性提示。

### 嵌入提供者

agentmemory 自動偵測你的提供者。為獲得最佳效果,安裝本地嵌入(免費):

```bash
npm install @xenova/transformers
```

| 提供者 | 模型 | 成本 | 備註 |
|---|---|---|---|
| **本地(推薦)** | `all-MiniLM-L6-v2` | 免費 | 離線,比僅 BM25 召回率高 +8pp |
| Gemini | `gemini-embedding-001` | 免費層 | 100+ 語言,768/1536/3072 維 (MRL),2048-token 輸入。取代 `text-embedding-004`([已棄用,2026 年 1 月 14 日下線](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | 最高品質 |
| Voyage AI | `voyage-code-3` | 付費 | 針對程式碼最佳化 |
| Cohere | `embed-english-v3.0` | 免費試用 | 通用 |
| OpenRouter | 任意模型 | 視情況 | 多模型代理 |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP Server" height="32" /></picture></h2>

53 個工具、6 個資源、3 個提示、4 個 skills — 任何代理可用的最全面 MCP 記憶工具組。

> **MCP shim 對比完整伺服器:** 已發布的 `@agentmemory/mcp` 套件是一個薄 shim。**只有當它能透過 `AGENTMEMORY_URL` 連通執行中的 agentmemory 伺服器**(代理模式)時,才暴露完整的 51 工具表面。在沒有可達伺服器的情況下,shim 回退到 7 工具的本地集合(`memory_save`、`memory_recall`、`memory_smart_search`、`memory_sessions`、`memory_export`、`memory_audit`、`memory_governance_delete`)。`AGENTMEMORY_TOOLS=core|all` 環境變數是*伺服器端*旗標 — 在 shim 的 `env` 區塊中設定無效。若在 Cursor / OpenCode / Gemini CLI 中只看到 7 個工具,啟動 `npx @agentmemory/agentmemory`(或 Docker 堆疊)並設定 `AGENTMEMORY_URL=http://localhost:3111`。

### 51 個工具

<details>
<summary>核心工具(始終可用)</summary>

| 工具 | 描述 |
|------|-------------|
| `memory_recall` | 搜尋過去的觀測 |
| `memory_compress_file` | 在保留結構的同時壓縮 markdown 檔 |
| `memory_save` | 儲存洞察、決策或模式 |
| `memory_patterns` | 偵測反覆出現的模式 |
| `memory_smart_search` | 混合語意 + 關鍵字搜尋 |
| `memory_file_history` | 關於特定檔案的過去觀測 |
| `memory_sessions` | 列出最近的會話 |
| `memory_timeline` | 按時間排列的觀測 |
| `memory_profile` | 專案檔案(概念、檔案、模式) |
| `memory_export` | 匯出所有記憶資料 |
| `memory_relations` | 查詢關係圖 |

</details>

<details>
<summary>擴展工具(共 51 — 設定 AGENTMEMORY_TOOLS=all)</summary>

| 工具 | 描述 |
|------|-------------|
| `memory_patterns` | 偵測反覆出現的模式 |
| `memory_timeline` | 按時間排列的觀測 |
| `memory_relations` | 查詢關係圖 |
| `memory_graph_query` | 知識圖譜走訪 |
| `memory_consolidate` | 執行 4 層整合 |
| `memory_claude_bridge_sync` | 與 MEMORY.md 同步 |
| `memory_team_share` | 與團隊成員共享 |
| `memory_team_feed` | 最近共享條目 |
| `memory_audit` | 操作稽核軌跡 |
| `memory_governance_delete` | 帶稽核軌跡的刪除 |
| `memory_snapshot_create` | Git 版本快照 |
| `memory_action_create` | 建立帶相依性的工作項 |
| `memory_action_update` | 更新動作狀態 |
| `memory_frontier` | 依優先序排序的未阻塞動作 |
| `memory_next` | 單一最重要的下一個動作 |
| `memory_lease` | 獨佔動作租約(多代理) |
| `memory_routine_run` | 實例化工作流例程 |
| `memory_signal_send` | 代理之間的訊息 |
| `memory_signal_read` | 帶回執讀取訊息 |
| `memory_checkpoint` | 外部條件閘門 |
| `memory_mesh_sync` | 實例之間 P2P 同步 |
| `memory_sentinel_create` | 事件驅動監視器 |
| `memory_sentinel_trigger` | 外部觸發哨兵 |
| `memory_sketch_create` | 暫時動作圖 |
| `memory_sketch_promote` | 提升為永久 |
| `memory_crystallize` | 緊湊化動作鏈 |
| `memory_diagnose` | 健康檢查 |
| `memory_heal` | 自動修復卡住的狀態 |
| `memory_facet_tag` | 維度:值 標籤 |
| `memory_facet_query` | 依 facet 標籤查詢 |
| `memory_verify` | 追溯來源 |

</details>

### 6 個資源 · 3 個提示 · 4 個 Skills

| 類型 | 名稱 | 描述 |
|------|------|-------------|
| Resource | `agentmemory://status` | 健康、會話數、記憶數 |
| Resource | `agentmemory://project/{name}/profile` | 專案層級智慧 |
| Resource | `agentmemory://memories/latest` | 最新 10 條活躍記憶 |
| Resource | `agentmemory://graph/stats` | 知識圖譜統計 |
| Prompt | `recall_context` | 搜尋並回傳上下文訊息 |
| Prompt | `session_handoff` | 代理之間的交接資料 |
| Prompt | `detect_patterns` | 分析反覆出現的模式 |
| Skill | `/recall` | 搜尋記憶 |
| Skill | `/remember` | 儲存到長期記憶 |
| Skill | `/session-history` | 最近的會話摘要 |
| Skill | `/forget` | 刪除觀測/會話 |

### 獨立 MCP

無需完整伺服器即可執行 — 適用於任何 MCP 用戶端。以下兩種都可以:

```bash
npx -y @agentmemory/agentmemory mcp   # 標準指令(始終可用)
npx -y @agentmemory/mcp                # shim 套件別名
```

或新增到你的代理的 MCP 設定:

大多數代理(Cursor、Claude Desktop、Cline、Roo Code、Windsurf、Gemini CLI):
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

把 `agentmemory` 條目合併到你的宿主既有的 `mcpServers` 物件中,而非取代檔案。對於無法存取宿主 `localhost` 的沙箱用戶端,在 env 區塊中加入 `"AGENTMEMORY_FORCE_PROXY": "1"`,並把 `AGENTMEMORY_URL` 設為沙箱能到達的路由。

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

從倉庫複製外掛檔:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Real-Time Viewer" height="32" /></picture></h2>

在連接埠 `3113` 自動啟動。即時觀測流、會話瀏覽器、記憶瀏覽器、知識圖譜視覺化和健康儀表板。

```bash
open http://localhost:3113
```

檢視器伺服器預設繫結 `127.0.0.1`。REST 提供的 `/agentmemory/viewer` 端點遵循正常的 `AGENTMEMORY_SECRET` bearer-token 規則。CSP 標頭使用每回應 script nonce 並停用行內處理常式屬性(`script-src-attr 'none'`)。

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

`:3113` 上的檢視器展示你的代理**記住了什麼**。[iii 主控台](https://iii.dev/docs/console) 展示你的代理**做了什麼** — 每個記憶操作都是 OpenTelemetry trace,每個 KV 條目都可編輯,每個函式都可呼叫,每個串流都可掛載。同一記憶的兩個視窗:一個面向產品,一個面向引擎。

觀察一次 `memory_smart_search` 觸發,在瀑布圖中看到 BM25 掃描 → 嵌入查找 → RRF 融合 → 重新排序器。在 KV 瀏覽器中編輯卡住的整合計時器。用調整後的負載重播一個 `PostToolUse` hook。釘選 WebSocket 串流,即時觀察觀測落地。

agentmemory 免費提供這一切,因為每個函式、觸發器、狀態範圍、串流都是 iii 原語 — 沒有自訂、沒有需要插樁的地方。

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="iii console Workers page — connected workers including agentmemory instances with live function counts and runtime metadata" width="720" />
  <br/>
  <em>Workers 頁面:每個已連接 worker — 包括 agentmemory 本身 — 顯示 PID、函式數、執行階段和最後在線時間。</em>
</p>

**已經裝好了。** 主控台隨 `iii` 一同發布 — 無需獨立安裝器。

**與 agentmemory 並行啟動:**

```bash
# agentmemory 檢視器佔用連接埠 3113,所以在 3114 執行主控台。
# 引擎 REST (3111)、WebSocket (3112)、bridge (49134) 預設值與 agentmemory 相符。
iii console --port 3114
```

然後打開 `http://localhost:3114`。加 `--enable-flow` 開啟實驗性架構圖頁面。

僅在你已移動引擎端點時才覆寫:

```bash
iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**主控台能做什麼:**

| 頁面 | 用途 |
|------|-----------|
| **Workers** | 查看每個已連接 worker 及其即時指標 — 包括 agentmemory worker 本身。 |
| **Functions** | 直接以 JSON 負載呼叫 agentmemory 的任何函式 — 測試 `memory.recall`、`memory.consolidate`、`graph.query` 無需接入用戶端。 |
| **Triggers** | 重播 HTTP、cron、事件和狀態觸發器 — 手動觸發整合 cron、重試 HTTP 路由、發出狀態變更。 |
| **States** | 完整 CRUD 的 KV 瀏覽器 — 會話、記憶槽位、生命週期計時器、嵌入索引 — 就地編輯值。 |
| **Streams** | 記憶寫入、hook 事件和觀測更新流經 iii 串流時的即時 WebSocket 監視器。 |
| **Queues** | 持久佇列主題 + 死信管理。重播或捨棄失敗的嵌入/壓縮工作。 |
| **Traces** | OpenTelemetry 瀑布/火焰/服務分解視圖。按 `trace_id` 過濾,精確查看單次 `memory.search` 產生了哪些函式、DB 呼叫和嵌入請求。 |
| **Logs** | 結構化 OTEL 日誌,過濾並與 trace/span ID 關聯。 |
| **Config** | 執行階段設定 — 看到引擎正在使用的 workers、提供者和連接埠。 |
| **Flow** | (選用,`--enable-flow`)每個 worker、觸發器和串流的互動式架構圖。 |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="iii console trace waterfall view showing per-span duration" width="720" />
  <br/>
  <em>Traces:每個記憶操作的瀑布/火焰/服務分解。</em>
</p>

**Traces 已開啟:**

`iii-config.yaml` 出廠啟用 `iii-observability` worker(`exporter: memory`、`sampling_ratio: 1.0`、指標 + 日誌)。無需額外設定 — agentmemory 啟動那一刻,每個記憶操作都會發出一個 trace span 和一個主控台可讀的結構化日誌。

若你想改為匯出到 Jaeger/Honeycomb/Grafana Tempo,把 `exporter: memory` 改為 `exporter: otlp` 並依 iii 的可觀測性文件設定收集器端點。

> **提醒:** 主控台本身未強制驗證 — 保持其繫結 `127.0.0.1`(預設)並永遠不要對外暴露。

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory **本身就是一個執行中的 [iii](https://iii.dev) 實例**。函式、觸發器、KV 狀態、串流、OTEL traces — 全部都是 iii 原語。你沒有安裝 Postgres、Redis、Express、pm2 或 Prometheus,因為 iii 取代了它們。

這代表多一條指令就能為 agentmemory 增加一整套新能力。

### 一條指令擴展 agentmemory

```bash
iii worker add iii-pubsub          # 把記憶寫入扇出到每個連接的實例
iii worker add iii-cron            # 排程整合、衰減掃描、快照輪替
iii worker add iii-queue           # 嵌入 + 壓縮工作的持久重試
iii worker add iii-observability   # 每個記憶操作的 OTEL traces(預設開啟)
iii worker add iii-sandbox         # 在隔離 microVM 內執行召回到的程式碼
iii worker add iii-database        # 切換 SQL 後端的狀態適配器
iii worker add mcp                 # 在 agentmemory 的 MCP 旁開設通用 MCP 宿主
```

每個 `iii worker add` 都會把新的函式和觸發器註冊到 agentmemory 正在執行的同一引擎中。檢視器和主控台立即接收 — 無需重新載入、無需新整合、無需新容器。

| `iii worker add` | 在 agentmemory 上獲得的額外能力 |
|---|---|
| [`iii-pubsub`](https://workers.iii.dev/workers/iii-pubsub) | 多實例記憶:每次 `remember` 扇出,每次 `search` 讀取聯集 |
| [`iii-cron`](https://workers.iii.dev/workers/iii-cron) | 排程生命週期 — 夜間整合、週快照、按固定時鐘衰減 |
| [`iii-queue`](https://workers.iii.dev/workers/iii-queue) | 持久重試:失敗的嵌入 + 壓縮工作在重啟後存活,無觀測遺失 |
| [`iii-observability`](https://workers.iii.dev/workers/iii-observability) | 每個函式的 OTEL traces、指標、日誌 — 從第一天起就接入 `iii-config.yaml` |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | `memory_recall` 出來的程式碼在一次性 VM 中執行,不在你的 shell 中 |
| [`iii-database`](https://workers.iii.dev/workers/iii-database) | 當預設的記憶體 KV 不夠用時,SQL 後端狀態適配器 |
| [`mcp`](https://workers.iii.dev/workers/mcp) | 在 agentmemory 的旁邊架設額外 MCP 伺服器,共享同一引擎 |

完整登錄表:[workers.iii.dev](https://workers.iii.dev)。那裡的每個 worker 都透過 agentmemory 所用的同樣原語組合 — 而你已經擁有的 agentmemory 本身就是其中之一。

### iii 取代了什麼

| 傳統堆疊 | agentmemory 使用 |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + 記憶體向量索引 |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | iii engine worker 監管 |
| Prometheus / Grafana | iii OTEL + 健康監控 |
| 自訂外掛系統 | `iii worker add <name>` |

**118 個原始檔 · ~21,800 行程式碼 · 950+ 測試 · 123 個函式 · 34 個 KV 範圍** — 全部基於三種原語。沒有 `agentmemory plugin install`。外掛系統就是 iii 本身。

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Configuration" height="32" /></picture></h2>

### LLM 提供者

agentmemory 從你的環境自動偵測。預設情況下,除非你設定提供者或明確啟用 Claude 訂閱回退,否則不會發起 LLM 呼叫。

| 提供者 | 設定 | 備註 |
|----------|--------|-------|
| **No-op(預設)** | 無需設定 | LLM 驅動的 compress/summarize 被停用。合成 BM25 壓縮 + 召回仍可用。若你以前依賴 Claude 訂閱回退,請見下面的 `AGENTMEMORY_ALLOW_AGENT_SDK`。 |
| Anthropic API | `ANTHROPIC_API_KEY` | 依 token 計費 |
| MiniMax | `MINIMAX_API_KEY` | Anthropic 相容 |
| Gemini | `GEMINI_API_KEY` | 同時啟用嵌入 |
| OpenRouter | `OPENROUTER_API_KEY` | 任意模型 |
| Claude 訂閱回退 | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | 僅按需啟用。會衍生 `@anthropic-ai/claude-agent-sdk` 會話 — 曾導致無限 Stop-hook 遞迴故不再預設。 |

### 成本感知的模型選擇

背景壓縮在每次觀測時執行,模型選擇會顯著影響月支出。擷取的工作負載資料:635 次請求 / 888K tokens / 35 小時活躍使用,基於 2026-05-23 OpenRouter 定價對三個模型評測。

| 等級 | 模型 | 輸入 / 1M | 輸出 / 1M | 35 小時擷取工作負載成本 | 備註 |
|------|-------|------------|-------------|---------------------------|-------|
| 推薦 | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | 壓縮 + 摘要品質穩定,比 Sonnet 便宜 ~10×。 |
| 推薦 | `deepseek/deepseek-chat` | $0.27 | $1.10 | ~$0.40 | 略舊但仍勝任僅壓縮工作負載。 |
| 推薦 | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | 若你的會話多為程式碼,程式碼推理能力強。 |
| 高階 | `anthropic/claude-sonnet-4.6` | $3.00 | $15.00 | ~$5.02 | 品質高但對長期背景工作來說成本昂貴。 |
| 高階 | `openai/gpt-4o` | $2.50 | $10.00 | ~$4.20 | 與 Sonnet 同檔。 |
| 避免 | `anthropic/claude-opus-4.6` | $15.00 | $75.00 | ~$25+ | 推理級模型;用於壓縮屬於巨額超支。 |

當 `OPENROUTER_MODEL` 比對高階層模式時,agentmemory 會印出執行階段警告。在做出知情選擇後,設定 `AGENTMEMORY_SUPPRESS_COST_WARNING=1` 來消音。

記憶工作的品質-成本權衡:壓縮是品質門檻相對寬鬆的摘要任務(代理重新閱讀摘要,而非使用者)。DeepSeek-V4-Pro / Qwen3-Coder 在該任務上與 Sonnet 誤差極小,而成本約低 10×。把高階層模型留給你直接閱讀的查詢。

來源:[OpenRouter Sonnet 4.6 定價](https://openrouter.ai/anthropic/claude-sonnet-4.6/pricing)、[DeepSeek V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro)、[DeepSeek 定價說明](https://api-docs.deepseek.com/quick_start/pricing/)。

### 多代理記憶(`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

在多個角色共享一台 agentmemory 伺服器的多代理設置中(architect / developer / reviewer / researcher / support-agent),`AGENT_ID` 給每次寫入打上發起角色的標籤。`AGENTMEMORY_AGENT_SCOPE` 控制召回是否依該標籤過濾。

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # 選填;預設 "shared"
```

兩種模式:

| 模式 | 標記寫入 | 過濾召回 | 何時使用 |
|------|------------|---------------|-------------|
| `shared`(預設) | 是 | 否 | 跨代理共享上下文且帶稽核軌跡。Architect 能看到 developer 記下了什麼,但每條記錄都標明發言者。 |
| `isolated` | 是 | 是 | 嚴格隔離。Architect 永遠不會看到 developer 的觀測/記憶/會話。 |

設定 `AGENT_ID` 後會被標記的內容:`Session.agentId`、`RawObservation.agentId`、`CompressedObservation.agentId`、`Memory.agentId`。角色從 `api::session::start` → `mem::observe` → `mem::compress` → KV 流轉。

isolated 模式下被過濾的內容:`mem::smart-search`、`/agentmemory/memories`、`/agentmemory/observations`、`/agentmemory/sessions`。每個端點都接受 `?agentId=<role>` 來依請求覆寫,以及 `?agentId=*` 來完全跳過環境範圍。`/memories` 還接受 `?includeOrphans=true` 來浮現 `agentId` 為 undefined 的 pre-AGENT_ID 記憶。

SDK / REST 層的依呼叫覆寫:每個變更端點(`/session/start`、`/remember`)都接受請求體中的 `agentId` 欄位,勝過環境變數。對於在一個伺服器行程中路由多角色的執行階段很有用。

當 `AGENT_ID` 未設定時,記憶保持無範圍(舊行為,無標籤、無過濾)。

### 連接埠

agentmemory + iii-engine 預設繫結四個連接埠。若重啟失敗並顯示 `port in use`,這張表告訴你該查找什麼行程。

| 連接埠 | 行程 | 用途 | 環境覆寫 |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | 內部串流 worker(由 agentmemory + 檢視器消費) | `III_STREAMS_PORT` |
| `3113` | agentmemory | 即時檢視器(`http://localhost:3113`) | `AGENTMEMORY_VIEWER_PORT` |
| `49134` | iii-engine | WebSocket — workers 在此註冊,OTel 遙測在此流過 | `III_ENGINE_URL`(完整 URL,預設 `ws://localhost:49134`) |

當機後連接埠仍被佔用時的陳舊行程清理:

```bash
# macOS / Linux — 找出每個連接埠上的行程並 kill 掉
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` 在優雅關閉時乾淨地回收 worker 和 engine pidfile。上述手動清理僅針對當機後兩個 pidfile 都未留下的情況。

### 設定檔

把 agentmemory 執行階段設定放到 `~/.agentmemory/.env`,而非在每個 shell 中 export 變數。若檢視器顯示像 `export ANTHROPIC_API_KEY=...` 這樣的設定提示,把它複製到該檔案作為 `ANTHROPIC_API_KEY=...`(去掉 `export` 前綴),然後重啟 agentmemory。

行程環境變數仍然有效,優先序高於檔案中的值。

在 Windows 上,同一檔案位於 `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

要用 Claude Code Pro/Max 訂閱而非 API key 測試,明確啟用:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

若想開啟圖或整合特性,在同一檔案中打開:

```env
GRAPH_EXTRACTION_ENABLED=true
CONSOLIDATION_ENABLED=true
```

### 環境變數

建立 `~/.agentmemory/.env`:

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

連接埠 `3111` 上的 124 個端點。REST API 預設繫結 `127.0.0.1`。當 `AGENTMEMORY_SECRET` 已設定時,受保護端點需要 `Authorization: Bearer <secret>`,網狀同步端點要求兩端都設定 `AGENTMEMORY_SECRET`。

<details>
<summary>關鍵端點</summary>

| 方法 | 路徑 | 描述 |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | 健康檢查(始終公開) |
| `POST` | `/agentmemory/session/start` | 開始會話 + 取得上下文 |
| `POST` | `/agentmemory/session/end` | 結束會話 |
| `POST` | `/agentmemory/observe` | 擷取觀測 |
| `POST` | `/agentmemory/smart-search` | 混合搜尋 |
| `POST` | `/agentmemory/context` | 產生上下文 |
| `POST` | `/agentmemory/remember` | 儲存到長期記憶 |
| `POST` | `/agentmemory/forget` | 刪除觀測 |
| `POST` | `/agentmemory/enrich` | 檔案上下文 + 記憶 + bugs |
| `GET` | `/agentmemory/profile` | 專案檔案 |
| `GET` | `/agentmemory/export` | 匯出所有資料 |
| `POST` | `/agentmemory/import` | 從 JSON 匯入 |
| `POST` | `/agentmemory/graph/query` | 知識圖譜查詢 |
| `POST` | `/agentmemory/team/share` | 與團隊共享 |
| `GET` | `/agentmemory/audit` | 稽核軌跡 |

完整端點列表:[`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Development" height="32" /></picture></h2>

```bash
npm run dev               # 熱重新載入
npm run build             # 生產建置
npm test                  # 950+ 測試
npm run test:integration  # API 測試(需要服務執行中)
```

**先決條件:** Node.js >= 20、[iii-engine](https://iii.dev/docs) 或 Docker

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="License" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
