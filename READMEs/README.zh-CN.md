<p align="center">
  <img src="../assets/banner.png" alt="agentmemory — 为 AI 编码代理提供持久化记忆" width="720" />
</p>

<p align="center">
  <strong>
    让你的编码代理记住一切。不再重复解释。
    Built on <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  为 Claude Code、Cursor、Gemini CLI、Codex CLI、Hermes、OpenClaw、pi、OpenCode 以及任何 MCP 客户端提供持久化记忆。
</p>

<p align="center">
  <a href="../README.md">English</a> |
  简体中文 |
  <a href="README.zh-TW.md">繁體中文</a> |
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
  <em>这份 gist 以置信度评分、生命周期管理、知识图谱和混合搜索扩展了 Karpathy 的 LLM Wiki 模式:agentmemory 就是其实现。</em>
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
  <a href="#install">安装</a> &bull;
  <a href="#quick-start">快速开始</a> &bull;
  <a href="#benchmarks">基准测试</a> &bull;
  <a href="#vs-competitors">对比竞品</a> &bull;
  <a href="#works-with-every-agent">代理</a> &bull;
  <a href="#how-it-works">工作原理</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">查看器</a> &bull;
  <a href="#iii-console">iii 控制台</a> &bull;
  <a href="#powered-by-iii">由 iii 驱动</a> &bull;
  <a href="#configuration">配置</a> &bull;
  <a href="#api">API</a>
</p>

---

## 安装

```bash
npm install -g @agentmemory/agentmemory          # 一次安装 — 全局可用 `agentmemory` 命令
# 如果在 macOS/Linux 的系统 Node 上遇到 EACCES,请重试:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                                      # 在 :3111 启动记忆服务器
agentmemory demo                                 # 注入示例会话并验证召回
agentmemory connect claude-code                  # 连接你的代理(也支持: codex, cursor, gemini-cli, ...)
```

或通过 `npx`(无需安装):

```bash
npx @agentmemory/agentmemory
```

提醒 — npx 会按版本缓存。如果裸 `npx @agentmemory/agentmemory` 命令运行的是旧版本,强制使用最新版 `npx -y @agentmemory/agentmemory@latest`,或一次性清除缓存 `rm -rf ~/.npm/_npx`(macOS/Linux;Windows 上删除 `%LOCALAPPDATA%\npm-cache\_npx`)。从 v0.9.16+ 起,首次 npx 运行会内联提示你全局安装,这样之后裸 `agentmemory` 命令在任何地方都能用。

完整选项见下方[快速开始](#quick-start)。各代理具体接入见[支持所有代理](#works-with-every-agent)。

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Works with every agent" height="32" /></picture></h2>

agentmemory 兼容任何支持 hooks、MCP 或 REST API 的代理。所有代理共享同一个记忆服务器。

<table>
<tr>
<td align="center" width="12.5%">
<a href="https://claude.com/product/claude-code"><img src="https://matthiasroder.com/content/images/2026/01/Claude.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>原生插件 + 12 hooks + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>原生插件 + 6 hooks + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>原生插件 + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>原生插件 + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>原生插件 + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://raw.githubusercontent.com/tinyhumansai/openhuman/main/app/src-tauri/icons/128x128.png" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>原生 Memory trait 后端</sub>
</td>
<td align="center" width="12.5%">
<a href="https://cursor.com"><img src="https://www.freelogovectors.net/wp-content/uploads/2025/06/cursor-logo-freelogovectors.net_.png" alt="Cursor" width="48" height="48" /></a><br/>
<strong>Cursor</strong><br/>
<sub>MCP 服务器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP 服务器</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<a href="https://github.com/opencode-ai/opencode"><img src="https://github.com/opencode-ai.png?size=120" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>22 hooks + MCP + 插件</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP 服务器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP 服务器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP 服务器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
<td align="center" width="12.5%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP 服务器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://windsurf.com"><img src="https://exafunction.github.io/public/brand/windsurf-black-symbol.svg?size=120" alt="Windsurf" width="48" height="48" /></a><br/>
<strong>Windsurf</strong><br/>
<sub>MCP 服务器</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP 服务器</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>兼容<strong>任何</strong>使用 MCP 或 HTTP 的代理。一个服务器,所有代理共享记忆。</sub>
</p>

---

你每次会话都在重复解释同样的架构。你反复发现同样的 bug。你重复教同样的偏好。内建的记忆(CLAUDE.md、.cursorrules)上限是 200 行而且会过时。agentmemory 解决了这个问题。它在后台静默捕获代理的行为,将其压缩为可搜索的记忆,并在下次会话开始时注入正确的上下文。一条命令。跨代理工作。

**改变了什么:** 会话 1 你设置了 JWT 鉴权。会话 2 你要求限流。代理已经知道你的鉴权使用 `src/middleware/auth.ts` 中的 jose 中间件,测试覆盖了 token 校验,你选择 jose 而非 jsonwebtoken 是为了 Edge 兼容性。无需重新解释。无需复制粘贴。代理就是*知道*。

```bash
npx @agentmemory/agentmemory
```

> **v0.9.0 新功能** — 落地页 [agent-memory.dev](https://agent-memory.dev) 上线,文件系统连接器(`@agentmemory/fs-watcher`),独立 MCP 现在代理至正在运行的服务器,使 hooks 和查看器保持一致,审计策略在所有删除路径上得到统一,健康状态在小型 Node 进程上不再误报 `memory_critical`。完整变更见 [CHANGELOG.md](../CHANGELOG.md#090--2026-04-18)。

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### 检索准确率

**coding-agent-life-v1** (内部语料库,沙盒可复现)

| 适配器 | P@5 | R@5 | Top-5 命中率 | p50 延迟 |
|---|---|---|---|---|
| **agentmemory 混合** | **0.578** | **0.967** | **15 / 15** | 14 ms |
| grep 基线 | 0.267 | 0.967 | 15 / 15 | 0 ms |

100% Top-5 命中率。在同一输入下,精度比 grep 基线高 **2.2×**。完整按类型分解:[`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md)。

**LongMemEval-S** (ICLR 2025,500 个问题)

| 系统 | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| 仅 BM25 回退 | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Token 节省

| 方法 | Token/年 | 成本/年 |
|---|---|---|
| 粘贴全部上下文 | 19.5M+ | 不可能(超出窗口) |
| LLM 摘要 | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + 本地嵌入 | ~170K | **$0** |

</td>
</tr>
</table>

> 嵌入模型:`all-MiniLM-L6-v2` (本地、免费、无需 API key)。完整报告:[`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md)、[`benchmark/QUALITY.md`](../benchmark/QUALITY.md)、[`benchmark/SCALE.md`](../benchmark/SCALE.md)。竞品对比:[`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) — agentmemory 对比 mem0、Letta、Khoj、claude-mem、Hippo。

**本地复现:** [`eval/README.md`](../eval/README.md) — 适配器可插拔的 harness,支持 LongMemEval `_s`(公开 500 问)+ `coding-agent-life-v1`(内部 15 会话语料)。Grep / 向量 / agentmemory 适配器并排打分,NDJSON 输出,公开记分卡发布于 [`docs/benchmarks/`](../docs/benchmarks/)。

**搭配 [codegraph](https://github.com/colbymchenry/codegraph)、[Understand Anything](https://github.com/Lum1104/Understand-Anything) 和 [Graphify](https://github.com/safishamsi/graphify) 使用。** 代码图索引、多代理构建流水线,以及跨文档 / PDF / 图像 / 视频的更广泛知识图谱。agentmemory 记住工作内容;这三个项目点亮上下文层的其余部分。组合配方和问题路由表:[`docs/recipes/pairings.md`](../docs/recipes/pairings.md)。

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="vs Competitors" height="32" /></picture></h2>

<table>
<tr>
<th width="20%"></th>
<th width="20%">agentmemory</th>
<th width="20%">mem0 (53K ⭐)</th>
<th width="20%">Letta / MemGPT (22K ⭐)</th>
<th width="20%">内建 (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>类型</strong></td>
<td>记忆引擎 + MCP 服务器</td>
<td>记忆层 API</td>
<td>完整代理运行时</td>
<td>静态文件</td>
</tr>
<tr>
<td><strong>检索 R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>自动捕获</strong></td>
<td>12 hooks (零人工)</td>
<td>手动调用 <code>add()</code></td>
<td>代理自编辑</td>
<td>手动编辑</td>
</tr>
<tr>
<td><strong>搜索</strong></td>
<td>BM25 + 向量 + 图 (RRF 融合)</td>
<td>向量 + 图</td>
<td>向量 (归档)</td>
<td>将所有内容加载到上下文</td>
</tr>
<tr>
<td><strong>多代理</strong></td>
<td>MCP + REST + 租约 + 信号</td>
<td>API (无协调)</td>
<td>仅在 Letta 运行时内部</td>
<td>每代理一个文件</td>
</tr>
<tr>
<td><strong>框架锁定</strong></td>
<td>无 (任何 MCP 客户端)</td>
<td>无</td>
<td>高 (必须使用 Letta)</td>
<td>每代理格式</td>
</tr>
<tr>
<td><strong>外部依赖</strong></td>
<td>无 (SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + 向量数据库</td>
<td>无</td>
</tr>
<tr>
<td><strong>记忆生命周期</strong></td>
<td>4 层整合 + 衰减 + 自动遗忘</td>
<td>被动提取</td>
<td>代理管理</td>
<td>手动清理</td>
</tr>
<tr>
<td><strong>Token 效率</strong></td>
<td>~1,900 tokens/会话 ($10/年)</td>
<td>依集成方式不同</td>
<td>核心记忆位于上下文</td>
<td>240 条观测达 22K+ tokens</td>
</tr>
<tr>
<td><strong>实时查看器</strong></td>
<td>是 (端口 3113)</td>
<td>云端仪表板</td>
<td>云端仪表板</td>
<td>无</td>
</tr>
<tr>
<td><strong>自托管</strong></td>
<td>是 (默认)</td>
<td>可选</td>
<td>可选</td>
<td>是</td>
</tr>
</table>

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Quick Start" height="32" /></picture></h2>

兼容性:此版本面向稳定的 `iii-sdk` `^0.11.0` 和 iii-engine v0.11.x。

### 30 秒体验

```bash
# 终端 1:启动服务器
npx @agentmemory/agentmemory

# 终端 2:注入示例数据并查看召回
npx @agentmemory/agentmemory demo
```

`demo` 会注入 3 个真实会话(JWT 鉴权、N+1 查询修复、限流)并对它们执行语义搜索。你将看到搜索「数据库性能优化」时找到「N+1 查询修复」 — 关键词匹配做不到这一点。

打开 `http://localhost:3113` 即时观察记忆的构建过程。

### 推荐:全局安装

`npx` 按版本缓存。如果你上周运行过 `npx @agentmemory/agentmemory@0.9.14`,裸 `npx @agentmemory/agentmemory` 命令可能会从 `~/.npm/_npx/` 提供过期的 0.9.14 而非最新版本。安装一次后,裸 `agentmemory` 命令处处可用:

```bash
npm install -g @agentmemory/agentmemory
# 如果在 macOS/Linux 的系统 Node 上遇到 EACCES,请重试:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                    # 启动服务器(等同于 npx 形式)
agentmemory stop               # 停止
agentmemory remove             # 卸载所有创建的内容
agentmemory connect claude-code   # 连接一个代理
agentmemory doctor             # 交互式诊断 + 修复提示
```

从 v0.9.16 开始,首次 npx 运行会内联提示你全局安装 — 回答一次 `Y` 即可。如果你跳过,可使用以下任一方式获取最新版:

```bash
npx -y @agentmemory/agentmemory@latest                 # 强制从 npm 拉取最新(跨平台)
rm -rf ~/.npm/_npx && npx @agentmemory/agentmemory     # 仅 macOS/Linux (POSIX shell)
```

在 Windows / PowerShell 上,等价的缓存清除命令是 `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"` — 上面的 `npx -y ...@latest` 形式是跨平台选项。

### 会话回放

agentmemory 记录的每个会话都可回放。打开查看器,选择 **Replay** 标签,在时间线上拖动:提示词、工具调用、工具结果和响应都作为离散事件呈现,支持播放/暂停、速度控制(0.5×–4×)和键盘快捷键(空格切换,箭头单步)。

已有旧的 Claude Code JSONL 记录想导入?

```bash
# 导入默认 ~/.claude/projects 下的全部内容
npx @agentmemory/agentmemory import-jsonl

# 或导入单个文件
npx @agentmemory/agentmemory import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

导入的会话与原生会话一起出现在 Replay 选择器中。底层每个条目都通过 `mem::replay::load`、`mem::replay::sessions`、`mem::replay::import-jsonl` 这些 iii 函数路由 — 没有侧通道服务器。

### 升级 / 维护

当你确实想更新本地运行时时,使用维护命令:

```bash
npx @agentmemory/agentmemory upgrade
```

警告:此命令会变更当前工作空间/运行时。它可能更新 JavaScript 依赖,并拉取固定版本的 Docker 镜像 `iiidev/iii:0.11.2`。它绝不会安装未固定版本或更新的 iii 引擎。

实现细节见 `src/cli.ts`(参考 `src/cli.ts:544-595` 附近的 `runUpgrade`)。

### Claude Code(一段话,直接粘贴)

```text
Install agentmemory: run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 4 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 53 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113.
```

#### Claude Code 不安装插件(MCP-standalone 路径)

如果你直接通过 `~/.claude.json` 连接 agentmemory 的 MCP 服务器而不使用 `/plugin install`,Claude Code 永远不会解析 `${CLAUDE_PLUGIN_ROOT}`,你必须把 hook 脚本指向 `~/.claude/settings.json` 中的绝对路径。这些路径通常会嵌入 agentmemory 版本号(例如 `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.21/scripts/…`),因此下次升级会静默破坏所有 hooks。

变通方法:

```bash
agentmemory connect claude-code --with-hooks
```

这会将同样的 hook 命令合并到 `~/.claude/settings.json`,绝对路径解析到当前安装的 `@agentmemory/agentmemory` 包的 `plugin/` 目录。升级 agentmemory 后重新运行该命令以刷新路径。同一文件中的用户条目会被保留;只替换之前的 agentmemory 条目。仍然推荐使用 `/plugin install` 路径。

对于远程或受保护的部署,启动 Claude Code 时设置 `AGENTMEMORY_URL` 和 `AGENTMEMORY_SECRET`。插件会将两个值传递给其捆绑的 MCP 服务器;当 `AGENTMEMORY_URL` 为空时,MCP shim 默认使用 `http://localhost:3111`。

### Codex CLI(Codex 插件平台)

```bash
# 1. 在单独终端启动记忆服务器
npx @agentmemory/agentmemory

# 2. 注册 agentmemory 市场并安装插件
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Codex 插件与 Claude Code 插件同源,来自相同的 `plugin/` 目录。它注册:

- `@agentmemory/mcp` 作为 MCP 服务器(当 `AGENTMEMORY_URL` 指向运行中的 agentmemory 服务器时,代理全部 51 个工具;若服务器不可达,本地回退至 7 个工具)
- 6 个生命周期 hooks:`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PreCompact`、`Stop`
- 4 个 skills:`/recall`、`/remember`、`/session-history`、`/forget`

Codex 的 hook 引擎会将 `CLAUDE_PLUGIN_ROOT` 注入 hook 子进程(参见 [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)),因此同样的 hook 脚本在两个宿主中都能工作,无需重复实现。Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure 事件仅 Claude Code 支持,Codex 未注册这些。

#### Codex Desktop:插件 hooks 当前无响应(有变通方法)

`CodexHooks` 和 `PluginHooks` 在 [`codex-rs/features/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs) 中都已稳定且默认启用,但 Codex Desktop 当前不会派发插件本地的 `hooks.json`([openai/codex#16430](https://github.com/openai/codex/issues/16430))。MCP 工具仍能工作;只是生命周期观测缺失。

在上游修复落地前,将同样的 hook 命令镜像到全局 `~/.codex/hooks.json`:

```bash
agentmemory connect codex --with-hooks
```

这会在 `~/.codex/hooks.json` 添加一个幂等块,引用捆绑脚本的绝对路径(用户级作用域下无需 `${CLAUDE_PLUGIN_ROOT}` 展开)。升级 agentmemory 后重新运行同一命令以刷新路径。同一文件中的用户条目会被保留;只替换之前的 agentmemory 条目。

<details>
<summary><b>OpenClaw(粘贴此提示)</b></summary>

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
<summary><b>Hermes Agent(粘贴此提示)</b></summary>

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

启动记忆服务器:`npx @agentmemory/agentmemory`

在使用 `mcpServers` 结构的每个宿主(Cursor、Claude Desktop、Cline、Roo Code、Windsurf、Gemini CLI、OpenClaw)中,agentmemory 条目是**相同的 MCP 服务器块**:

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

**将此条目合并到宿主配置文件的现有 `mcpServers` 对象中** — 不要替换整个文件。如果文件已经有其他服务器,把 `agentmemory` 作为另一个 key 加在它们旁边。如果完全缺少 `mcpServers`,把整块粘贴到 `{ "mcpServers": { ... } }` 里。`${VAR}` 占位符会在 MCP 服务器启动时从 shell 继承 `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` — 未设置的变量传空字符串,shim 回退到 `http://localhost:3111`。一个接好的条目同时覆盖本地和远程(k8s / 反代)部署。

| 代理 | 配置文件 | 备注 |
|---|---|---|
| **Cursor** | `~/.cursor/mcp.json` | 合并到 `mcpServers`。网站上也提供一键深链。 |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | 合并到 `mcpServers`。编辑后重启 Claude Desktop。 |
| **Cline / Roo Code / Kilo Code** | Cline MCP 设置 (设置 UI → MCP Servers → Edit) | 同样的 `mcpServers` 块。 |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | 同样的 `mcpServers` 块。 |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user`(自动合并)。 |
| **OpenClaw** | OpenClaw MCP 配置 | 同样的 `mcpServers` 块,或使用更深的[记忆插件](../integrations/openclaw/)。 |
| **Codex CLI (仅 MCP)** | `.codex/config.toml` | TOML 形式:`codex mcp add agentmemory -- npx -y @agentmemory/mcp`,或手动添加 `[mcp_servers.agentmemory]`。 |
| **Codex CLI (完整插件)** | Codex 插件市场 | `codex plugin marketplace add rohitg00/agentmemory` 然后 `codex plugin add agentmemory@agentmemory`。注册 MCP + 6 个生命周期 hooks(SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、PreCompact、Stop)+ 4 个 skills。在 Codex Desktop 上,直到 [openai/codex#16430](https://github.com/openai/codex/issues/16430) 落地之前,还要运行 `agentmemory connect codex --with-hooks` — 那里的插件 hooks 当前无响应。 |
| **OpenCode (仅 MCP)** | `opencode.json` | 不同结构 — 顶层 `mcp` key,command 是数组:`{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`。 |
| **OpenCode (完整插件)** | `plugin/opencode/` | 22 个自动捕获 hooks,覆盖会话生命周期、消息、工具、错误。两个斜杠命令(`/recall`、`/remember`)。将 `plugin/opencode/` 复制到你的 OpenCode 工作空间并把插件条目添加到 `opencode.json`。完整 hook 表和差异分析见 [`plugin/opencode/README.md`](../plugin/opencode/README.md)。 |
| **pi** | `~/.pi/agent/extensions/agentmemory` | 复制 [`integrations/pi`](../integrations/pi/) 并重启 pi。 |
| **Hermes Agent** | `~/.hermes/config.yaml` | 使用更深的[记忆提供者插件](../integrations/hermes/),设置 `memory.provider: agentmemory`。 |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` 会写入标准的 `mcpServers` 块。Hook 负载与 Claude Code 字段兼容,因此现有的 12 hook 脚本无需修改即可工作 — 通过同一 `settings.json` 的 `hooks` 段连接它们。 |
| **Antigravity** (替换 Gemini CLI) | `mcp_config.json`(在 Antigravity 的 User 目录中) | `agentmemory connect antigravity` 会写入标准的 `mcpServers` 块。macOS: `~/Library/Application Support/Antigravity/User/`。Linux: `~/.config/Antigravity/User/`。在 2026-06-18 Gemini CLI 停服后使用。 |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` 写入用户级配置。工作空间覆盖放在你的代码旁的 `.kiro/settings/mcp.json` 中。 |
| **Goose** | Goose MCP 设置 UI | 同样的 `mcpServers` 块。 |
| **Aider** | n/a | 直接调用 REST API:`curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`。 |
| **任何代理 (32+)** | n/a | `npx skillkit install agentmemory` 自动检测宿主并合并。 |

**沙盒化的 MCP 客户端**(Flatpak / Snap / 受限容器)无法访问宿主的 `localhost`:还要在 `env` 块中设置 `"AGENTMEMORY_FORCE_PROXY": "1"`,并把 `AGENTMEMORY_URL` 指向沙盒确实能到达的路由(例如你的 LAN IP)。

### 程序化访问(Python / Rust / Node)

agentmemory 将其核心操作注册为 iii 函数(`mem::remember`、`mem::observe`、`mem::context`、`mem::smart-search`、`mem::forget`)。任何拥有 iii SDK 的语言都可以通过 `ws://localhost:49134` 直接调用它们 — 无需为每种语言准备单独的 REST 客户端。

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

完整示例:[`examples/python/`](../examples/python/)(快速开始 + 观测/召回流程)。`:3111` 上的 REST 对没有 iii 运行时的宿主仍然可用。

### 从源码构建

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

如果已经安装 `iii`,这会以本地 `iii-engine` 启动 agentmemory;如果 Docker 可用,则回退到 Docker Compose。REST、流和查看器默认绑定到 `127.0.0.1`。

手动安装 `iii-engine`。**agentmemory 当前将 `iii-engine` 固定在 `v0.11.2`** — `v0.11.6` 引入了新的「通过 `iii worker add` 沙盒化一切」模型,agentmemory 尚未为此重构。重构落地后即解除固定。如果你已经手动迁移到沙盒模型,可用 `AGENTMEMORY_III_VERSION=<version>` 覆盖。

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSL https://github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-aarch64-apple-darwin.tar.gz | tar -xz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** 把 `aarch64-apple-darwin` 换成 `x86_64-apple-darwin`
- **Linux x64:** 换成 `x86_64-unknown-linux-gnu`
- **Linux arm64:** 换成 `aarch64-unknown-linux-gnu`
- **Windows:** 从 [iii-hq/iii releases v0.11.2](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2) 下载 `iii-x86_64-pc-windows-msvc.zip`,提取 `iii.exe`,加入 PATH

或使用 Docker(捆绑的 `docker-compose.yml` 会拉取 `iiidev/iii:0.11.2`)。完整文档:[iii.dev/docs](https://iii.dev/docs)。

### Windows

agentmemory 可在 Windows 10/11 运行,但仅 Node.js 包不够 — 你还需要 `iii-engine` 运行时(一个独立的原生二进制)作为后台进程。官方上游安装器是 `sh` 脚本,目前没有 PowerShell 安装器或 scoop/winget 包,因此 Windows 用户有两条路径:

**选项 A — 预构建 Windows 二进制(推荐):**

```powershell
# 1. 在浏览器打开 https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2
#    (我们固定在 v0.11.2,直到 agentmemory 为 v0.11.6+ 引擎要求的
#     新沙盒模型完成重构)
# 2. 下载 iii-x86_64-pc-windows-msvc.zip
#    (如果是 ARM 机器则下载 iii-aarch64-pc-windows-msvc.zip)
# 3. 把 iii.exe 解压到 PATH 上的某处,或放在:
#    %USERPROFILE%\.local\bin\iii.exe
#    (agentmemory 会自动检查该位置)
# 4. 验证:
iii --version
# 应输出:0.11.2

# 5. 然后照常运行 agentmemory:
npx -y @agentmemory/agentmemory
```

**选项 B — Docker Desktop:**

```powershell
# 1. 安装 Docker Desktop for Windows
# 2. 启动 Docker Desktop 并确保引擎运行中
# 3. 运行 agentmemory — 它会自动启动捆绑的 compose 文件:
npx -y @agentmemory/agentmemory
```

**选项 C — 仅独立 MCP(无引擎):** 如果你只需要 MCP 工具供代理使用,不需要 REST API、查看器或定时任务,则完全跳过引擎:

```powershell
npx -y @agentmemory/agentmemory mcp
# 或通过 shim 包:
npx -y @agentmemory/mcp
```

**Windows 诊断:** 如果 `npx @agentmemory/agentmemory` 失败,加 `--verbose` 重新运行以看到实际的引擎 stderr。常见失败模式:

| 症状 | 修复 |
|---|---|
| `iii-engine process started` 然后 `did not become ready within 15s` | 引擎启动崩溃 — 用 `--verbose` 重新运行,检查 stderr |
| `Could not start iii-engine` | `iii.exe` 和 Docker 都未安装。见上面选项 A 或 B |
| 端口冲突 | `netstat -ano \| findstr :3111` 查看占用,然后 kill 或用 `--port <N>` |
| Docker 已安装但仍跳过回退 | 确保 Docker Desktop 确实在运行(系统托盘图标) |

> 注意:iii **引擎** 是预构建的二进制文件,而非 cargo crate — 不要尝试用 `cargo install` 安装它。(iii 的 **SDK** 确实已发布到 crates.io、npm 和 PyPI,但 agentmemory 并不需要它们。)受支持的引擎安装方式均固定为 v0.11.2:上面的预构建 v0.11.2 二进制、**带版本固定** 的上游 `sh` 安装脚本 `curl -fsSL https://install.iii.dev/iii/main/install.sh | VERSION=0.11.2 sh`(macOS/Linux),以及 Docker 镜像 `iiidev/iii:0.11.2`。直接运行 `install.sh | sh` 会安装 **最新** 引擎,而 agentmemory 不支持该版本 — 请务必传入 `VERSION=0.11.2`。最简单的方式:直接运行 `npx @agentmemory/agentmemory`,它会为你把固定版本的引擎获取到 `~/.agentmemory/bin`。

---

<h2 id="deploy">部署</h2>

托管主机的一键模板。每个模板都附带自包含的
Dockerfile,从 npm 拉取 `@agentmemory/agentmemory` 并从官方
`iiidev/iii` Docker Hub 镜像复制 iii 引擎二进制 — 无需
预构建 agentmemory 镜像。持久存储挂载在
`/data`;首次启动 entrypoint 用面向部署调优的配置
覆盖 npm 捆绑的 iii 配置(原配置绑定 `127.0.0.1`),
让其绑定 `0.0.0.0` 并使用绝对 `/data` 路径,生成
HMAC secret,然后通过 `gosu` 从 `root` 降权到 `node`
再 exec agentmemory CLI。

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

Render 的一键部署按钮要求仓库根有 `render.yaml`,我们刻意保持根目录整洁。使用 [`deploy/render/`](../deploy/render/README.md) 中文档化的 Render Blueprint 流程,手动指向仓库内的蓝图。

完整设置细节(HMAC 捕获、查看器 SSH 隧道、轮换、备份、
成本下限)见 [`deploy/`](../deploy/README.md):

- [`deploy/fly`](../deploy/fly/README.md) — 单机搭配
  `auto_stop_machines = "stop"`;空闲时最便宜。
- [`deploy/railway`](../deploy/railway/README.md) — Hobby 套餐固定费用,
  卷在仪表板中配置。
- [`deploy/render`](../deploy/render/README.md) — Blueprint 流程,
  付费套餐自动磁盘快照。
- [`deploy/coolify`](../deploy/coolify/README.md) — 通过 [Coolify](https://coolify.io/self-hosted)
  在你自己的 VPS 上自托管;同样的 Docker
  Compose 栈,主机和数据都归你所有。

只发布端口 `3111`。`3113` 上的查看器在容器内仍绑定到
loopback — 每个模板的 README 都文档化了到达它的
SSH 隧道模式。

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Why agentmemory" height="32" /></picture></h2>

每个编码代理在会话结束时都会忘记一切。你每次会话的前 5 分钟都浪费在重新解释技术栈上。agentmemory 在后台运行,完全消除这一点。

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

### 对比内建代理记忆

每个 AI 编码代理都自带内建记忆 — Claude Code 有 `MEMORY.md`,Cursor 有 notepad,Cline 有 memory bank。这些像便利贴。agentmemory 是便利贴背后的可搜索数据库。

| | 内建 (CLAUDE.md) | agentmemory |
|---|---|---|
| 规模 | 200 行上限 | 无限 |
| 搜索 | 把所有内容加载到上下文 | BM25 + 向量 + 图 (仅 top-K) |
| Token 成本 | 240 条观测达 22K+ | ~1,900 tokens(少 92%) |
| 跨代理 | 每代理一个文件 | MCP + REST(任何代理) |
| 协调 | 无 | 租约、信号、动作、例程 |
| 可观测性 | 手动读文件 | 端口 3113 实时查看器 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="How It Works" height="32" /></picture></h2>

### 记忆流水线

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

### 4 层记忆整合

灵感来自人脑处理记忆的方式 — 与睡眠时的记忆整合并无不同。

| 层级 | 内容 | 类比 |
|------|------|---------|
| **Working(工作记忆)** | 来自工具使用的原始观测 | 短期记忆 |
| **Episodic(情景记忆)** | 压缩后的会话摘要 | 「发生了什么」 |
| **Semantic(语义记忆)** | 提取的事实与模式 | 「我知道什么」 |
| **Procedural(程序记忆)** | 工作流与决策模式 | 「怎么做」 |

记忆随时间衰减(Ebbinghaus 曲线)。频繁访问的记忆会强化。陈旧记忆会自动清除。矛盾会被检测并解决。

### 捕获了什么

| Hook | 捕获内容 |
|------|----------|
| `SessionStart` | 项目路径、会话 ID |
| `UserPromptSubmit` | 用户提示词(隐私过滤) |
| `PreToolUse` | 文件访问模式 + 富化上下文 |
| `PostToolUse` | 工具名、输入、输出 |
| `PostToolUseFailure` | 错误上下文 |
| `PreCompact` | 在压缩前重新注入记忆 |
| `SubagentStart/Stop` | 子代理生命周期 |
| `Stop` | 会话结束摘要 |
| `SessionEnd` | 会话完成标记 |

### 关键能力

| 能力 | 描述 |
|---|---|
| **自动捕获** | 每次工具使用都通过 hooks 记录 — 零人工 |
| **语义搜索** | BM25 + 向量 + 知识图谱,RRF 融合 |
| **记忆演化** | 版本控制、覆盖关系、关系图 |
| **自动遗忘** | TTL 过期、矛盾检测、重要性驱逐 |
| **隐私优先** | API key、secret、`<private>` 标签存储前被剥离 |
| **自愈** | 熔断器、提供者回退链、健康监控 |
| **Claude 桥接** | 与 MEMORY.md 双向同步 |
| **知识图谱** | 实体抽取 + BFS 遍历 |
| **团队记忆** | 团队成员之间的命名空间共享 + 私有 |
| **引用溯源** | 任意记忆追溯到源观测 |
| **Git 快照** | 记忆状态的版本、回滚、diff |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Search" height="32" /></picture></h2>

三路检索结合三种信号:

| 流 | 作用 | 何时启用 |
|---|---|---|
| **BM25** | 词干化关键词匹配 + 同义词扩展 | 始终启用 |
| **Vector(向量)** | 稠密嵌入上的余弦相似度 | 配置了嵌入提供者 |
| **Graph(图)** | 通过实体匹配进行知识图谱遍历 | 查询中检测到实体 |

通过 Reciprocal Rank Fusion (RRF, k=60) 融合,并按会话多样化(每会话最多 3 个结果)。

BM25 开箱即用支持希腊语、西里尔语、希伯来语、阿拉伯语和带音标的拉丁文分词。对于中文/日语/韩语记忆,安装可选分词器(`npm install @node-rs/jieba tiny-segmenter`)以把 CJK 串切分为词级 token;不安装的话,agentmemory 会软回退到整串分词并在 stderr 打印一次性提示。

### 嵌入提供者

agentmemory 自动检测你的提供者。为获得最佳效果,安装本地嵌入(免费):

```bash
npm install @xenova/transformers
```

| 提供者 | 模型 | 成本 | 备注 |
|---|---|---|---|
| **本地 (推荐)** | `all-MiniLM-L6-v2` | 免费 | 离线,比仅 BM25 召回率高 +8pp |
| Gemini | `gemini-embedding-001` | 免费层 | 100+ 语言,768/1536/3072 维 (MRL),2048-token 输入。替换 `text-embedding-004`([已弃用,2026 年 1 月 14 日下线](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | 最高质量 |
| Voyage AI | `voyage-code-3` | 付费 | 针对代码优化 |
| Cohere | `embed-english-v3.0` | 免费试用 | 通用 |
| OpenRouter | 任意模型 | 视而定 | 多模型代理 |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP Server" height="32" /></picture></h2>

53 个工具、6 个资源、3 个提示词、4 个 skills — 任何代理可用的最全面 MCP 记忆工具包。

> **MCP shim 对比完整服务器:** 已发布的 `@agentmemory/mcp` 包是一个薄 shim。**只有当它能通过 `AGENTMEMORY_URL` 连通运行中的 agentmemory 服务器**(代理模式)时,才暴露完整的 51 工具表面。在没有可达服务器的情况下,shim 回退到 7 工具的本地集合(`memory_save`、`memory_recall`、`memory_smart_search`、`memory_sessions`、`memory_export`、`memory_audit`、`memory_governance_delete`)。`AGENTMEMORY_TOOLS=core|all` 环境变量是*服务器端*标志 — 在 shim 的 `env` 块中设置无效。如果在 Cursor / OpenCode / Gemini CLI 中只看到 7 个工具,启动 `npx @agentmemory/agentmemory`(或 Docker 栈)并设置 `AGENTMEMORY_URL=http://localhost:3111`。

### 51 个工具

<details>
<summary>核心工具(始终可用)</summary>

| 工具 | 描述 |
|------|-------------|
| `memory_recall` | 搜索过去的观测 |
| `memory_compress_file` | 在保留结构的同时压缩 markdown 文件 |
| `memory_save` | 保存洞察、决策或模式 |
| `memory_patterns` | 检测反复出现的模式 |
| `memory_smart_search` | 混合语义 + 关键词搜索 |
| `memory_file_history` | 关于特定文件的过去观测 |
| `memory_sessions` | 列出最近的会话 |
| `memory_timeline` | 按时间排列的观测 |
| `memory_profile` | 项目档案(概念、文件、模式) |
| `memory_export` | 导出所有记忆数据 |
| `memory_relations` | 查询关系图 |

</details>

<details>
<summary>扩展工具(总 51 — 设置 AGENTMEMORY_TOOLS=all)</summary>

| 工具 | 描述 |
|------|-------------|
| `memory_patterns` | 检测反复出现的模式 |
| `memory_timeline` | 按时间排列的观测 |
| `memory_relations` | 查询关系图 |
| `memory_graph_query` | 知识图谱遍历 |
| `memory_consolidate` | 运行 4 层整合 |
| `memory_claude_bridge_sync` | 与 MEMORY.md 同步 |
| `memory_team_share` | 与团队成员共享 |
| `memory_team_feed` | 最近共享条目 |
| `memory_audit` | 操作审计轨迹 |
| `memory_governance_delete` | 带审计轨迹的删除 |
| `memory_snapshot_create` | Git 版本快照 |
| `memory_action_create` | 创建带依赖的工作项 |
| `memory_action_update` | 更新动作状态 |
| `memory_frontier` | 按优先级排序的未阻塞动作 |
| `memory_next` | 单个最重要的下一动作 |
| `memory_lease` | 独占动作租约(多代理) |
| `memory_routine_run` | 实例化工作流例程 |
| `memory_signal_send` | 代理间消息 |
| `memory_signal_read` | 带回执读取消息 |
| `memory_checkpoint` | 外部条件门 |
| `memory_mesh_sync` | 实例间 P2P 同步 |
| `memory_sentinel_create` | 事件驱动监视器 |
| `memory_sentinel_trigger` | 外部触发哨兵 |
| `memory_sketch_create` | 临时动作图 |
| `memory_sketch_promote` | 提升为永久 |
| `memory_crystallize` | 紧凑化动作链 |
| `memory_diagnose` | 健康检查 |
| `memory_heal` | 自动修复卡住的状态 |
| `memory_facet_tag` | 维度:值 标签 |
| `memory_facet_query` | 按 facet 标签查询 |
| `memory_verify` | 追溯来源 |

</details>

### 6 个资源 · 3 个提示词 · 4 个 Skills

| 类型 | 名称 | 描述 |
|------|------|-------------|
| Resource | `agentmemory://status` | 健康、会话数、记忆数 |
| Resource | `agentmemory://project/{name}/profile` | 项目级智能 |
| Resource | `agentmemory://memories/latest` | 最新 10 条活跃记忆 |
| Resource | `agentmemory://graph/stats` | 知识图谱统计 |
| Prompt | `recall_context` | 搜索并返回上下文消息 |
| Prompt | `session_handoff` | 代理之间的交接数据 |
| Prompt | `detect_patterns` | 分析反复出现的模式 |
| Skill | `/recall` | 搜索记忆 |
| Skill | `/remember` | 保存到长期记忆 |
| Skill | `/session-history` | 最近的会话摘要 |
| Skill | `/forget` | 删除观测/会话 |

### 独立 MCP

无需完整服务器即可运行 — 适用于任何 MCP 客户端。以下两种都可以:

```bash
npx -y @agentmemory/agentmemory mcp   # 规范命令(始终可用)
npx -y @agentmemory/mcp                # shim 包别名
```

或添加到你的代理的 MCP 配置:

大多数代理(Cursor、Claude Desktop、Cline、Roo Code、Windsurf、Gemini CLI):
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

把 `agentmemory` 条目合并到你的宿主现有的 `mcpServers` 对象中,而非替换文件。对于无法访问宿主 `localhost` 的沙盒客户端,在 env 块中添加 `"AGENTMEMORY_FORCE_PROXY": "1"`,并将 `AGENTMEMORY_URL` 设为沙盒能到达的路由。

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

从仓库复制插件文件:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Real-Time Viewer" height="32" /></picture></h2>

在端口 `3113` 自动启动。实时观测流、会话浏览器、记忆浏览器、知识图谱可视化和健康仪表板。

```bash
open http://localhost:3113
```

查看器服务器默认绑定 `127.0.0.1`。REST 提供的 `/agentmemory/viewer` 端点遵循正常的 `AGENTMEMORY_SECRET` bearer-token 规则。CSP 头使用每响应 script nonce 并禁用内联处理器属性(`script-src-attr 'none'`)。

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

`:3113` 上的查看器展示你的代理**记住了什么**。[iii 控制台](https://iii.dev/docs/console) 展示你的代理**做了什么** — 每个记忆操作都是 OpenTelemetry trace,每个 KV 条目都可编辑,每个函数都可调用,每个流都可挂载。同一记忆的两个窗口:一个面向产品,一个面向引擎。

观察一次 `memory_smart_search` 触发,在瀑布图中看到 BM25 扫描 → 嵌入查找 → RRF 融合 → 重排器。在 KV 浏览器中编辑卡住的整合计时器。用调整后的负载重放一个 `PostToolUse` hook。固定 WebSocket 流,实时观察观测落地。

agentmemory 免费提供这一切,因为每个函数、触发器、状态作用域、流都是 iii 原语 — 没有定制,没有需要插桩的地方。

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="iii console Workers page — connected workers including agentmemory instances with live function counts and runtime metadata" width="720" />
  <br/>
  <em>Workers 页面:每个已连接的 worker — 包括 agentmemory 本身 — 显示 PID、函数数、运行时和最后在线时间。</em>
</p>

**已经装好了。** 控制台随 `iii` 一同发布 — 无需单独安装器。

**与 agentmemory 并行启动:**

```bash
# agentmemory 查看器占用端口 3113,所以在 3114 运行控制台。
# 引擎 REST (3111)、WebSocket (3112)、bridge (49134) 默认值与 agentmemory 匹配。
iii console --port 3114
```

然后打开 `http://localhost:3114`。加 `--enable-flow` 开启实验性架构图页面。

仅在你移动了引擎端点时才覆盖:

```bash
iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**控制台能做什么:**

| 页面 | 用途 |
|------|-----------|
| **Workers** | 查看每个已连接 worker 及其实时指标 — 包括 agentmemory worker 本身。 |
| **Functions** | 直接用 JSON 负载调用 agentmemory 的任何函数 — 测试 `memory.recall`、`memory.consolidate`、`graph.query` 无需接入客户端。 |
| **Triggers** | 重放 HTTP、cron、事件和状态触发器 — 手动触发整合 cron、重试 HTTP 路由、发出状态变化。 |
| **States** | 完整 CRUD 的 KV 浏览器 — 会话、记忆槽位、生命周期计时器、嵌入索引 — 就地编辑值。 |
| **Streams** | 记忆写入、hook 事件和观测更新流经 iii 流时的实时 WebSocket 监视器。 |
| **Queues** | 持久队列主题 + 死信管理。重放或丢弃失败的嵌入/压缩任务。 |
| **Traces** | OpenTelemetry 瀑布/火焰/服务分解视图。按 `trace_id` 过滤,精确查看单次 `memory.search` 产生了哪些函数、DB 调用和嵌入请求。 |
| **Logs** | 结构化 OTEL 日志,过滤并与 trace/span ID 关联。 |
| **Config** | 运行时配置 — 看到引擎正在使用的 workers、提供者和端口。 |
| **Flow** | (可选,`--enable-flow`) 每个 worker、触发器和流的交互式架构图。 |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="iii console trace waterfall view showing per-span duration" width="720" />
  <br/>
  <em>Traces:每个记忆操作的瀑布/火焰/服务分解。</em>
</p>

**Traces 已开启:**

`iii-config.yaml` 出厂启用 `iii-observability` worker(`exporter: memory`、`sampling_ratio: 1.0`、指标 + 日志)。无需额外配置 — agentmemory 启动那一刻,每个记忆操作都会发出一个 trace span 和一个控制台可读的结构化日志。

如果你想改为导出到 Jaeger/Honeycomb/Grafana Tempo,把 `exporter: memory` 改为 `exporter: otlp` 并按 iii 的可观测性文档设置收集器端点。

> **提醒:** 控制台本身未强制鉴权 — 保持其绑定 `127.0.0.1`(默认)并永远不要对外暴露。

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory **本身就是一个运行中的 [iii](https://iii.dev) 实例**。函数、触发器、KV 状态、流、OTEL traces — 全部都是 iii 原语。你没有安装 Postgres、Redis、Express、pm2 或 Prometheus,因为 iii 替代了它们。

这意味着多一条命令就能为 agentmemory 增加一整套新能力。

### 一条命令扩展 agentmemory

```bash
iii worker add iii-pubsub          # 把记忆写入扇出到每个连接的实例
iii worker add iii-cron            # 定时整合、衰减扫描、快照轮换
iii worker add iii-queue           # 嵌入 + 压缩任务的持久重试
iii worker add iii-observability   # 每个记忆操作的 OTEL traces(默认开启)
iii worker add iii-sandbox         # 在隔离 microVM 内运行召回到的代码
iii worker add iii-database        # 切换 SQL 后端的状态适配器
iii worker add mcp                 # 在 agentmemory 的 MCP 旁开通用 MCP 宿主
```

每个 `iii worker add` 都会把新的函数和触发器注册到 agentmemory 正在运行的同一引擎中。查看器和控制台立即接收 — 无需重载、无需新集成、无需新容器。

| `iii worker add` | 在 agentmemory 上获得的额外能力 |
|---|---|
| [`iii-pubsub`](https://workers.iii.dev/workers/iii-pubsub) | 多实例记忆:每次 `remember` 扇出,每次 `search` 读取并集 |
| [`iii-cron`](https://workers.iii.dev/workers/iii-cron) | 定时生命周期 — 夜间整合、周快照、按固定时钟衰减 |
| [`iii-queue`](https://workers.iii.dev/workers/iii-queue) | 持久重试:失败的嵌入 + 压缩任务在重启后存活,无观测丢失 |
| [`iii-observability`](https://workers.iii.dev/workers/iii-observability) | 每个函数的 OTEL traces、指标、日志 — 从第一天起就接入 `iii-config.yaml` |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | `memory_recall` 出来的代码在一次性 VM 中运行,不在你的 shell 中 |
| [`iii-database`](https://workers.iii.dev/workers/iii-database) | 当默认的内存 KV 不够用时,SQL 后端状态适配器 |
| [`mcp`](https://workers.iii.dev/workers/mcp) | 在 agentmemory 的旁边架设额外 MCP 服务器,共享同一引擎 |

完整注册表:[workers.iii.dev](https://workers.iii.dev)。那里的每个 worker 都通过 agentmemory 所用的同样原语组合 — 而你已经拥有的 agentmemory 本身就是其中之一。

### iii 替代了什么

| 传统栈 | agentmemory 使用 |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + 内存向量索引 |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | iii engine worker 监管 |
| Prometheus / Grafana | iii OTEL + 健康监控 |
| 自定义插件系统 | `iii worker add <name>` |

**118 个源文件 · ~21,800 行代码 · 950+ 测试 · 123 个函数 · 34 个 KV 作用域** — 全部基于三种原语。没有 `agentmemory plugin install`。插件系统就是 iii 本身。

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Configuration" height="32" /></picture></h2>

### LLM 提供者

agentmemory 从你的环境自动检测。默认情况下,除非你配置提供者或显式启用 Claude 订阅回退,否则不会发起 LLM 调用。

| 提供者 | 配置 | 备注 |
|----------|--------|-------|
| **No-op(默认)** | 无需配置 | LLM 驱动的 compress/summarize 被禁用。合成 BM25 压缩 + 召回仍可用。如果你以前依赖 Claude 订阅回退,请见下面的 `AGENTMEMORY_ALLOW_AGENT_SDK`。 |
| Anthropic API | `ANTHROPIC_API_KEY` | 按 token 计费 |
| MiniMax | `MINIMAX_API_KEY` | Anthropic 兼容 |
| Gemini | `GEMINI_API_KEY` | 同时启用嵌入 |
| OpenRouter | `OPENROUTER_API_KEY` | 任意模型 |
| Claude 订阅回退 | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | 仅按需启用。会派生 `@anthropic-ai/claude-agent-sdk` 会话 — 曾导致无限 Stop-hook 递归故不再默认。 |

### 成本感知的模型选择

后台压缩在每次观测时运行,模型选择会显著影响月度支出。捕获的工作负载数据:635 次请求 / 888K tokens / 35 小时活跃使用,基于 2026-05-23 OpenRouter 定价对三个模型评测。

| 等级 | 模型 | 输入 / 1M | 输出 / 1M | 35 小时捕获工作负载成本 | 备注 |
|------|-------|------------|-------------|---------------------------|-------|
| 推荐 | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | 压缩 + 摘要质量稳定,比 Sonnet 便宜 ~10×。 |
| 推荐 | `deepseek/deepseek-chat` | $0.27 | $1.10 | ~$0.40 | 略旧但仍胜任仅压缩工作负载。 |
| 推荐 | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | 如果你的会话多为代码,代码推理能力强。 |
| 高级 | `anthropic/claude-sonnet-4.6` | $3.00 | $15.00 | ~$5.02 | 质量高但对长期后台工作来说成本昂贵。 |
| 高级 | `openai/gpt-4o` | $2.50 | $10.00 | ~$4.20 | 与 Sonnet 同档。 |
| 避免 | `anthropic/claude-opus-4.6` | $15.00 | $75.00 | ~$25+ | 推理级模型;用于压缩属于巨额超支。 |

当 `OPENROUTER_MODEL` 匹配高级层模式时,agentmemory 会打印运行时警告。在做出知情选择后,设置 `AGENTMEMORY_SUPPRESS_COST_WARNING=1` 来消音。

记忆工作的质量-成本权衡:压缩是质量门槛相对宽松的摘要任务(代理重新阅读摘要,而非用户)。DeepSeek-V4-Pro / Qwen3-Coder 在该任务上与 Sonnet 误差极小,而成本约低 10×。把高级层模型留给你直接阅读的查询。

来源:[OpenRouter Sonnet 4.6 定价](https://openrouter.ai/anthropic/claude-sonnet-4.6/pricing)、[DeepSeek V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro)、[DeepSeek 定价说明](https://api-docs.deepseek.com/quick_start/pricing/)。

### 多代理记忆(`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

在多个角色共享一台 agentmemory 服务器的多代理设置中(architect / developer / reviewer / researcher / support-agent),`AGENT_ID` 给每次写入打上发起角色的标签。`AGENTMEMORY_AGENT_SCOPE` 控制召回是否按该标签过滤。

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # 可选;默认 "shared"
```

两种模式:

| 模式 | 标记写入 | 过滤召回 | 何时使用 |
|------|------------|---------------|-------------|
| `shared`(默认) | 是 | 否 | 跨代理共享上下文且带审计轨迹。Architect 能看到 developer 记下了什么,但每条记录都标明发言者。 |
| `isolated` | 是 | 是 | 严格隔离。Architect 永远不会看到 developer 的观测/记忆/会话。 |

设置 `AGENT_ID` 后会被标记的内容:`Session.agentId`、`RawObservation.agentId`、`CompressedObservation.agentId`、`Memory.agentId`。角色从 `api::session::start` → `mem::observe` → `mem::compress` → KV 流转。

isolated 模式下被过滤的内容:`mem::smart-search`、`/agentmemory/memories`、`/agentmemory/observations`、`/agentmemory/sessions`。每个端点都接受 `?agentId=<role>` 来按请求覆盖,以及 `?agentId=*` 来完全跳过环境作用域。`/memories` 还接受 `?includeOrphans=true` 来浮现 `agentId` 为 undefined 的预-AGENT_ID 记忆。

SDK / REST 层的按调用覆盖:每个修改端点(`/session/start`、`/remember`)都接受请求体中的 `agentId` 字段,胜过环境变量。对于在一个服务器进程中路由多角色的运行时很有用。

当 `AGENT_ID` 未设置时,记忆保持无作用域(遗留行为,无标签、无过滤)。

### 端口

agentmemory + iii-engine 默认绑定四个端口。如果重启失败并显示 `port in use`,这张表告诉你该查找什么进程。

| 端口 | 进程 | 用途 | 环境覆盖 |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | 内部流 worker(由 agentmemory + 查看器消费) | `III_STREAMS_PORT` |
| `3113` | agentmemory | 实时查看器(`http://localhost:3113`) | `AGENTMEMORY_VIEWER_PORT` |
| `49134` | iii-engine | WebSocket — workers 在此注册,OTel 遥测在此流过 | `III_ENGINE_URL`(完整 URL,默认 `ws://localhost:49134`) |

崩溃后端口仍被占用时的陈旧进程清理:

```bash
# macOS / Linux — 查找每个端口上的进程并杀掉
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` 在优雅关闭时干净地回收 worker 和 engine pidfile。上面的手动清理仅针对崩溃后两个 pidfile 都未留下的情况。

### 配置文件

把 agentmemory 运行时配置放到 `~/.agentmemory/.env`,而不是在每个 shell 中 export 变量。如果查看器显示像 `export ANTHROPIC_API_KEY=...` 这样的设置提示,把它复制到该文件中作为 `ANTHROPIC_API_KEY=...`(去掉 `export` 前缀),然后重启 agentmemory。

进程环境变量仍然有效,优先级高于文件中的值。

在 Windows 上,同一文件位于 `%USERPROFILE%\.agentmemory\.env`:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

要用 Claude Code Pro/Max 订阅而非 API key 测试,显式启用:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

如果想开启图或整合特性,在同一文件中打开:

```env
GRAPH_EXTRACTION_ENABLED=true
CONSOLIDATION_ENABLED=true
```

### 环境变量

创建 `~/.agentmemory/.env`:

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

端口 `3111` 上的 124 个端点。REST API 默认绑定 `127.0.0.1`。当 `AGENTMEMORY_SECRET` 已设置时,受保护端点需要 `Authorization: Bearer <secret>`,网状同步端点要求两端都设置 `AGENTMEMORY_SECRET`。

<details>
<summary>关键端点</summary>

| 方法 | 路径 | 描述 |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | 健康检查(始终公开) |
| `POST` | `/agentmemory/session/start` | 开始会话 + 获取上下文 |
| `POST` | `/agentmemory/session/end` | 结束会话 |
| `POST` | `/agentmemory/observe` | 捕获观测 |
| `POST` | `/agentmemory/smart-search` | 混合搜索 |
| `POST` | `/agentmemory/context` | 生成上下文 |
| `POST` | `/agentmemory/remember` | 保存到长期记忆 |
| `POST` | `/agentmemory/forget` | 删除观测 |
| `POST` | `/agentmemory/enrich` | 文件上下文 + 记忆 + bugs |
| `GET` | `/agentmemory/profile` | 项目档案 |
| `GET` | `/agentmemory/export` | 导出所有数据 |
| `POST` | `/agentmemory/import` | 从 JSON 导入 |
| `POST` | `/agentmemory/graph/query` | 知识图谱查询 |
| `POST` | `/agentmemory/team/share` | 与团队共享 |
| `GET` | `/agentmemory/audit` | 审计轨迹 |

完整端点列表:[`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Development" height="32" /></picture></h2>

```bash
npm run dev               # 热重载
npm run build             # 生产构建
npm test                  # 950+ 测试
npm run test:integration  # API 测试(需要服务运行中)
```

**先决条件:** Node.js >= 20、[iii-engine](https://iii.dev/docs) 或 Docker

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="License" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
