<p align="center">
  <img src="../assets/banner.png" alt="agentmemory: AI コーディングエージェントのための永続メモリ" width="720" />
</p>

<p align="center">
  <strong>
    セッションとエージェントをまたいで使える永続メモリ。
  </strong><br/>
  Claude Code、GitHub Copilot CLI、Cursor、Gemini CLI、Codex CLI、Hermes、OpenClaw、pi、Oh My Pi、DeepSeek Harness、OpenCode、そしてあらゆる MCP クライアントのための永続メモリ。
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1.6k%20stars%20%2F%20230%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="設計ドキュメント: gist で 1.6k スター / 230 フォーク" /></a>
</p>

<p align="center">
  <em>この gist は Karpathy の LLM Wiki パターンを信頼度スコア、ライフサイクル管理、ナレッジグラフ、ハイブリッド検索で拡張したものであり、agentmemory はその実装です。</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentmemory/agentmemory"><img src="https://img.shields.io/npm/v/@agentmemory/agentmemory?color=CB3837&label=npm&style=for-the-badge&logo=npm" alt="npm バージョン" /></a>
  <a href="https://github.com/rohitg00/agentmemory/actions"><img src="https://img.shields.io/github/actions/workflow/status/rohitg00/agentmemory/ci.yml?label=tests&style=for-the-badge&logo=github" alt="CI" /></a>
  <a href="https://github.com/rohitg00/agentmemory/blob/main/LICENSE"><img src="https://img.shields.io/github/license/rohitg00/agentmemory?color=blue&style=for-the-badge" alt="ライセンス" /></a>
  <a href="https://github.com/rohitg00/agentmemory/stargazers"><img src="https://img.shields.io/github/stars/rohitg00/agentmemory?style=for-the-badge&color=yellow&logo=github" alt="スター数" /></a>
  <a href="https://skills.sh/rohitg00/agentmemory"><img src="https://skills.sh/b/rohitg00/agentmemory?style=for-the-badge" alt="skills.sh installs" /></a>
</p>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="54 MCP ツール" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 自動 hooks" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="外部 DB 0 個" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="4,000+ 件のテストが成功" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="agentmemory のデモ" width="720" />
</p>

<p align="center">
  <a href="#install">インストール</a> &bull;
  <a href="#quick-start">クイックスタート</a> &bull;
  <a href="#benchmarks">ベンチマーク</a> &bull;
  <a href="#vs-competitors">競合比較</a> &bull;
  <a href="#works-with-every-agent">エージェント</a> &bull;
  <a href="#how-it-works">仕組み</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">ビューワー</a> &bull;
  <a href="#configuration">設定</a> &bull;
  <a href="#api">API</a>
</p>

---

AgentMemory はコーディングセッションを記録し、過去の判断や修正を検索できる形で保存します。複数のツールから同じメモリを使い、保存内容を確認し、モデルに渡すコンテキストの量を選べます。

<a id="install"></a>

## インストール

必要環境:

- Node.js 20 以降(npm と npx を含む。`node -v`、`npm -v`、`npx -v` で確認)。
- macOS/Linux の自動セットアップには `curl`、POSIX `sh`、`tar` が必要です。
- Windows / WSL2: [Windows](#windows).

標準的な新規インストールコマンド:

```bash
npx -y @agentmemory/agentmemory@latest
```

エージェントとプロバイダー、またはキーレスモードを選びます。セットアップは設定を保存してメモリサーバーを起動し、グローバルインストールを案内します。`-y` は npm の確認を承諾し、`@latest` は最新リリースを選びます。LLM による圧縮にはプロバイダーと `AGENTMEMORY_AUTO_COMPRESS=true` の両方が必要です。

キーレスモードではベクトル埋め込みが無効になります。`memory_recall`(`mem::search` パス)は BM25 を使い、`memory_smart_search` はグラフデータが既に存在する場合は構造的なグラフマッチも融合できます。無料でオンデバイスのセマンティックリコールを使うには、`~/.agentmemory/.env` に `EMBEDDING_PROVIDER=local` を設定して再起動してください。最初の埋め込みリクエストで `Xenova/all-MiniLM-L6-v2` がダウンロードされ、その後の推論はローカルで実行されます。

API は `http://localhost:3111`、ライブビューアーは `http://localhost:3113` です。どちらもデフォルトでループバックにバインドします。設定は `~/.agentmemory/.env` に保存します。 [データの保存](#data-storage).

続いてリコールが動くことを確かめ、エージェントに skills を与えます:

```bash
npx -y @agentmemory/agentmemory@latest demo  # seed sample sessions + exercise recall
npx skills add rohitg00/agentmemory -y   # 17 native skills so your agent knows when to reach for memory
```

キーワード検索は、デフォルトのキーレスモードでも BM25 経由でヒットするはずです。デモの `database performance optimization` クエリは意図的にセマンティックなもので、埋め込みプロバイダーを設定するまでは 0 件になることがあります。

コーディングエージェントに丸ごと任せたい場合は、この指示を 1 つ渡してください:

> Retrieve and follow the instructions at: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md

`agentmemory connect <agent>` で追加できます。[対応する統合](#works-with-every-agent)と[日常のコマンド](#everyday-commands)を参照してください。

<details>
<summary><strong>グローバルインストール / EACCES</strong></summary>

```bash
npm install -g @agentmemory/agentmemory@latest
```

上記の npx コマンドが標準的な新規インストールの方法であり、グローバルプレフィックスの権限問題を回避できます。

</details>

<details>
<summary><strong>npx が古いバージョンを返す</strong></summary>

npx はバージョン単位でキャッシュします。`npx -y @agentmemory/agentmemory@latest` で最新を強制するか、`rm -rf ~/.npm/_npx`(macOS/Linux。Windows では `%LOCALAPPDATA%\npm-cache\_npx` を削除)で一度キャッシュをクリアしてください。

</details>

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Works with every agent" height="32" /></picture></h2>

agentmemory は hooks、MCP、REST API をサポートするあらゆるエージェントで動作します。すべてのエージェントが同じメモリサーバーを共有します。

<table>
<tr>
<td align="center" width="20%">
<a href="https://claude.com/product/claude-code"><img src="https://github.com/anthropics.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>ネイティブプラグイン + 12 hooks + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>ネイティブプラグイン + 6 hooks + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/features/copilot"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/github_dark.svg"><img src="https://svgl.app/library/github_light.svg" alt="GitHub Copilot CLI" width="48" height="48" /></picture></a><br/>
<strong>GitHub Copilot CLI</strong><br/>
<sub>MCP + プラグインの hooks/skills</sub>
</td>
<td align="center" width="20%">
<a href="https://cursor.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/cursor_dark.svg"><img src="https://svgl.app/library/cursor_light.svg" alt="Cursor" width="48" height="48" /></picture></a><br/>
<strong>Cursor</strong><br/>
<sub>ネイティブプラグイン + ライフサイクル hooks + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../plugin/opencode/"><img src="https://raw.githubusercontent.com/rohitg00/agentmemory/main/website/public/opencode.png" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>キャプチャプラグイン + MCP</sub>
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
<sub>ネイティブプラグイン + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>ネイティブプラグイン + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>ネイティブ検索 + キャプチャ + skills</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://github.com/tinyhumansai.png?size=120" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>ネイティブ Memory trait バックエンド</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="20%">
<a href="https://antigravity.google"><img src="https://svgl.app/library/antigravity.svg" alt="Antigravity" width="48" height="48" /></a><br/>
<strong>Antigravity</strong><br/>
<sub>MCP + hooks</sub>
</td>
<td align="center" width="20%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="20%">
<a href="https://www.warp.dev"><img src="https://svgl.app/library/warp.svg" alt="Warp" width="48" height="48" /></a><br/>
<strong>Warp</strong><br/>
<sub>connect + MCP + skills</sub>
</td>
<td align="center" width="20%">
<a href="https://zed.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/zed-logo_dark.svg"><img src="https://svgl.app/library/zed-logo.svg" alt="Zed" width="48" height="48" /></picture></a><br/>
<strong>Zed</strong><br/>
<sub>MCP サーバー</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="20%">
<a href="https://continue.dev"><img src="https://github.com/continuedev.png?size=120" alt="Continue" width="48" height="48" /></a><br/>
<strong>Continue</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="20%">
<a href="https://docs.factory.ai/cli"><img src="https://www.factory.ai/favicon.svg" alt="Droid" width="48" height="48" /></a><br/>
<strong>Droid</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="20%">
<a href="https://kiro.dev"><img src="https://kiro.dev/favicon.ico" alt="Kiro" width="48" height="48" /></a><br/>
<strong>Kiro</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/QwenLM/qwen-code"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/qwen_dark.svg"><img src="https://svgl.app/library/qwen_light.svg" alt="Qwen Code" width="48" height="48" /></picture></a><br/>
<strong>Qwen Code</strong><br/>
<sub>MCP サーバー</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://svgl.app/library/deepseek.svg" alt="DeepSeek Harness" width="48" height="48" /></a><br/>
<strong>DeepSeek Harness</strong><br/>
<sub>ネイティブキャプチャ + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP サーバー</sub>
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
<sub>ネイティブ検索 + キャプチャ + skills + 任意の MCP</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>MCP または HTTP を話す<strong>どんな</strong>エージェントでも動作します。サーバーは 1 つ、メモリは全エージェントで共有。</sub>
</p>

---

<a id="data-storage"></a>

### データの保存

メモリはデフォルトでリポジトリの外に保存されます。インスタンス 0 は既存の `./data/state_store.db` を再利用します。保存先を変えるには `--data-dir <path>` または `AGENTMEMORY_DATA_DIR` を指定し、再起動やアップグレードでも同じ場所を使ってください。

| プラットフォーム | 保存先 |
|---|---|
| macOS | `~/Library/Application Support/agentmemory` |
| Linux | `$XDG_DATA_HOME/agentmemory` / `~/.local/share/agentmemory` |
| Windows | `%APPDATA%\agentmemory` |

```bash
agentmemory --data-dir ~/.agentmemory-projects/main
agentmemory --instance 1
```

`--instance 1` は `instance-1` サブディレクトリと API `3211`、ビューアー `3213` を使います。Redis と移行については[ストレージとバックアップ](../docs/reliability/state-storage.md)を参照してください。

最新のリリースノート: [CHANGELOG.md](../CHANGELOG.md)。

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

最新の検索評価結果、指標の定義、再現手順：

[0.9.31 · 2026-10-28 · strict recall-all@5](../docs/benchmarks/2026-10-28-retrieval-evaluation.md) · [eval/README.md](../eval/README.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="vs Competitors" height="32" /></picture></h2>

製品と導入方法の最新比較（出典付き）：

[AgentMemory / Mem0 / Supermemory / Zep / Letta / Cognee / claude-mem](../benchmark/COMPARISON.md) · 2026-10-28.

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Quick Start" height="32" /></picture></h2>

### 30 秒で試す

```bash
# Terminal 1: start the server
npx -y @agentmemory/agentmemory@latest

# Terminal 2: seed sample data and see recall in action
npx -y @agentmemory/agentmemory@latest demo
```

`demo` は 3 つの現実的なセッション(JWT 認証、N+1 クエリ修正、レート制限)を投入し、それらに対して検索を実行します。キーレスインストールではベクトルが無効になるため、`mem::search` のキーワードクエリは BM25 経由でヒットするはずですが、`database performance optimization` は 0 件になることがあります。グラフデータが存在する場合、`smart-search` はさらに構造的なグラフマッチも返すことがあります。セマンティッククエリでベクトル経由の N+1 修正を見つけるには、`EMBEDDING_PROVIDER=local` を設定して再起動し、最初のモデルダウンロードが終わるのを待ってください。

`http://localhost:3113` を開けばメモリがリアルタイムに構築される様子が見られます。

<a id="validate-a-fresh-install-and-restart-persistence"></a>

### 新規インストールと再起動時の永続性を検証する

サーバーを起動した状態で、ヘルス、ビューアー、ステータスを確認します。

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

`status` はヘルス、プロバイダー、埋め込み、キャプチャ配送、復旧状態を表示します。保護された REST リクエストにはサーバーのシークレットが必要です。明示的な `AGENTMEMORY_SECRET` を使うか、未設定なら生成されたローカルシークレットを読み込みます。

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

続いて `npx -y @agentmemory/agentmemory@latest stop` を実行し、ターミナル 1 で標準コマンドを再度起動し、`/agentmemory/livez` を待ってから検索をやり直してください。プローブはまだ返ってくるはずです。カスタムの `--data-dir` を選んだ場合は、再起動時にも同じディレクトリを渡してください。

<a id="everyday-commands"></a>

### 日常のコマンド

インストールとセットアップは上の[インストール](#install)にあります(初回実行が案内してくれます)。日々の操作:

```bash
agentmemory                    # start the server
agentmemory stop               # stop it cleanly
agentmemory status             # health, providers and recovery state
agentmemory capture            # inspect capture inbox and offline spool
agentmemory capture --drain    # replay queued observations
agentmemory connect <agent>    # connect another agent
agentmemory doctor             # interactive diagnostics + fix prompts
agentmemory remove             # uninstall everything we created
```

### セッションリプレイ

agentmemory が記録するすべてのセッションは再生可能です。ビューワーを開き、**Replay** タブを選択し、タイムラインをスクラブしてください: プロンプト、ツール呼び出し、ツール結果、応答が個別のイベントとして表示され、再生/一時停止、速度コントロール(0.5x〜4x)、キーボードショートカット(スペースで切り替え、矢印でステップ)が使えます。

古い Claude Code の JSONL トランスクリプトを取り込むには:

```bash
# Import everything under the default ~/.claude/projects
npx -y @agentmemory/agentmemory@latest import-jsonl

# Or import a single file
npx -y @agentmemory/agentmemory@latest import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

インポートしたセッションは Replay に表示され、検索用に索引化されます。由来は `import` として記録され、セッション処理で crystal や lessons が生成される場合があります。

> **`import-jsonl` を主なキャプチャ経路として使う場合の注意:** Claude Code の `cleanupPeriodDays`(`~/.claude/settings.json` 内、デフォルト **30**)は、そのウィンドウより古い JSONL トランスクリプトを `~/.claude/projects/` から自動削除します。数か月分の Claude Code 履歴がある状態で agentmemory を新規インストールすると、30 日より古いものは最初のインポートの前に既に消えています。`import-jsonl` を cron で回すか、`cleanupPeriodDays` をもっと大きな値に上げるか、自動キャプチャ hooks(デフォルトのプラグインインストール経路)を配線して、セッションが生きている間に各ターンが agentmemory に着地するようにしてください。そうすれば JSONL のクリーンアップは問題でなくなります。

### アップグレード / メンテナンス

意図的にローカルランタイムを更新したいときは、メンテナンスコマンドを使ってください:

```bash
npx -y @agentmemory/agentmemory@latest upgrade
```

ローカルランタイムを更新し、作業ディレクトリ内の JavaScript 依存関係も更新する場合があります。データをバックアップし、実行前に[アップグレードガイド](../docs/upgrades/iii-0.25.md)を読んでください。

### Claude Code(1 ブロックそのまま貼り付け)

```text
Install agentmemory: run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 17 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 54 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113. Keyless mode disables vectors: `memory_recall` uses BM25, and `memory_smart_search` can also use existing structural graph data. Set `EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env` and restart to opt into on-device semantic recall.
```

#### プラグインをインストールしない Claude Code(MCP スタンドアロン経路)

`/plugin install` を使わず `~/.claude.json` から直接 agentmemory の MCP サーバーを配線する場合、Claude Code は `${CLAUDE_PLUGIN_ROOT}` を一切解決しないため、hook スクリプトを `~/.claude/settings.json` 内の絶対パスに向ける必要があります。これらのパスには通常 agentmemory のバージョンが埋め込まれる(例: `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.22/scripts/…`)ため、次のアップグレードで全 hook が静かに壊れます。

回避策:

```bash
agentmemory connect claude-code --with-hooks
```

同じ hook コマンドを `~/.claude/settings.json` にマージし、現在インストールされている `@agentmemory/agentmemory` パッケージの同梱 `plugin/` ディレクトリに解決された絶対パスを書き込みます。agentmemory をアップグレードしたら、このコマンドを再実行してパスを更新してください。同じファイル内のユーザーエントリは保持され、以前の agentmemory エントリだけが置き換えられます。`/plugin install` の経路が推奨アプローチであることに変わりはありません。
リモートや保護されたデプロイでは、`AGENTMEMORY_URL` と `AGENTMEMORY_SECRET` を設定して Claude Code を起動してください。プラグインはこの両方の値を同梱の MCP サーバーに渡します。`AGENTMEMORY_URL` が空の場合、MCP shim は `http://localhost:3111` にフォールバックします。

### Codex CLI(Codex プラグインプラットフォーム)

```bash
# 1. start the memory server in a separate terminal
npx -y @agentmemory/agentmemory@latest

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Codex プラグインは Claude Code プラグインと同じ `plugin/` ディレクトリから出荷されます。以下を登録します:

- 動作中のデーモンへの同梱の stdio MCP ブリッジ。npm ダウンロードもフォールバックストアも不要です。未リリースのビルドをテストするには[ローカル Codex ガイド](../docs/plugins/codex-local.md)を参照してください。
- 6 つのライフサイクル hooks: `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PreCompact`、`Stop`
- 呼び出し可能な 9 つの skills: `/recall`、`/remember`、`/session-history`、`/forget`、`/recap`、`/handoff`、`/lesson`、`/commit-context`、`/commit-history`、さらにエージェントが必要時に読み込む 8 つのリファレンス skills(memory discipline、MCP ツール、REST API、設定、エージェント、hooks、アーキテクチャ、skill 執筆ガイド)

Codex の hook エンジンは `CLAUDE_PLUGIN_ROOT` を hook のサブプロセスに注入するため([`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs) 参照)、同じ hook スクリプトが重複なく両方のホストで動作します。Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure イベントは Claude Code 専用で、Codex 用には登録されません。

#### Codex hook の信頼と互換性

ネイティブのプラグイン hook ディスパッチは Codex CLI 0.150.1 で検証済みです。キャプチャを期待する前にプラグイン hooks を信頼してください。Desktop の動作は同梱のランタイムに依存します。回避策を有効にする前に `/hooks` を確認し、イベントがキャプチャされたことを確かめてください。

ホストがグローバル hooks を必要とする場合は、コマンドを `~/.codex/hooks.json` に反映させてください。MCP が既に配線済みの場合、現在のコネクタが hook インストールに到達するには `--force` が必要です:

```bash
agentmemory connect codex --with-hooks --force
```

これはグローバル hooks をマージし、agentmemory の MCP エントリを書き換えます。関係のないエントリは保持されます。`--force` を使う前に、カスタムの agentmemory エンドポイント設定を確認してください。アップグレード後は再実行してパスを更新してください。重複キャプチャを避けるため、ネイティブのプラグイン hooks かグローバルコピーのどちらか一方だけを有効にしてください。

### GitHub Copilot CLI

VS Code のエージェントモードでは、[Copilot MCP と自動キャプチャガイド](../docs/plugins/copilot.md#vs-code-copilot-local-agent-sessions)を使用してください。CLI コネクタは VS Code を設定しません。

```bash
# MCP-only wiring
agentmemory connect copilot-cli

# Alternatively, full hooks/skills plugin from the GitHub subdir
copilot plugin install rohitg00/agentmemory:plugin
```

`agentmemory connect copilot-cli` は `mcpServers.agentmemory` を `~/.copilot/mcp-config.json`(`COPILOT_HOME` が設定されている場合は `$COPILOT_HOME/mcp-config.json`)にマージし、既存のサーバーは保持します。ネイティブ Windows では、これが唯一の自動化された `connect` アダプタです。他のすべてのネイティブ Windows エージェントは手動で設定してください。WSL での `connect` は、対象のエージェントが同じ WSL 環境にインストールされている場合にのみ適切です。Copilot は次回起動時または `/mcp` の後に MCP サーバーを認識します。フルの hook/skill 体験が欲しい場合は、プラグインも併せてインストールしてください。

### Cursor

`agentmemory connect cursor` で MCP を設定します。**Settings → Plugins → Add marketplace** から `.cursor-plugin/plugin.json` を含むチェックアウトを選び、agentmemory を有効にして再読み込みしてください。プラグインはライフサイクルのキャプチャ、ワークスペース判定、skills、MCP を提供します。重複を避けるため、プラグインと `~/.cursor/hooks.json` の手動 hooks は片方だけ有効にします。

[Cursor](../integrations/cursor/)

### Pi / Oh My Pi / DeepSeek Harness

```bash
agentmemory connect pi --with-mcp
agentmemory connect omp --with-mcp
agentmemory connect dsh --with-hooks
```

ホストに合うコマンドを選びます。Pi と OMP はネイティブの検索・キャプチャ、オフライン再送、17 skills をインストールし、`--with-mcp` で全ツールを追加します。Pi は `/reload`、OMP は再起動後に `/agentmemory-status` を確認してください。DSH は MCP と同梱のキャプチャプラグインを追加するので、接続後に再起動します。

Pi は `@agentmemory/pi` パッケージとしてもインストールできます。ローカルインストールと npm での提供状況は [Pi ガイド](../integrations/pi/)を参照し、各ホストでは 1 つの方法だけを使ってください。

[Pi](../integrations/pi/) · [Oh My Pi](../integrations/omp/) · [DSH](../docs/dsh.md)

<details>
<summary><b>OpenClaw(このプロンプトを貼り付ける)</b></summary>

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

完全ガイド: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent(このプロンプトを貼り付ける)</b></summary>

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

完全ガイド: [`integrations/hermes/`](../integrations/hermes/)

</details>

<a id="other-agents"></a>

### その他のエージェント

メモリサーバーを起動: `npx -y @agentmemory/agentmemory@latest`

#### `npx skills add` によるネイティブ skills

agentmemory は Claude Code スタイルの `<dir>/SKILL.md` フォーマットで 17 個の skills を同梱しています: 呼び出し可能な 9 つのアクション skills(`remember`、`recall`、`recap`、`handoff`、`forget`、`lesson`、`commit-context`、`commit-history`、`session-history`)と、エージェントがオンデマンドで読み込む 8 個のリファレンス skills(`memory-discipline`、`agentmemory-mcp-tools`、`agentmemory-rest-api`、`agentmemory-config`、`agentmemory-agents`、`agentmemory-hooks`、`agentmemory-architecture`、`write-agentmemory-skill`)です。リファレンス skills はソースから生成されたデータ表を含むため、決してドリフトしません。vercel-labs による [`skills`](https://npmjs.com/package/skills) CLI が、呼び出し元エージェントのネイティブ skill ディレクトリへ 50 以上のエージェント(Claude Code、Cursor、Cline、Continue、Droid、Warp、Codex、Antigravity、Kiro、OpenCode、Goose、Roo、Trae、Windsurf など)にわたって自動インストールします:

```bash
npx skills add rohitg00/agentmemory -y          # auto-detects the calling agent
npx skills add rohitg00/agentmemory -y -a warp  # explicit agent
npx skills add rohitg00/agentmemory -y -a '*'   # install to every installed agent
```

これは `agentmemory connect <agent>` を**補完する**ものです:

Hermes、OpenClaw、Pi、Oh My Pi のコネクターはネイティブ統合と skills を標準でインストールします。MCP は `--with-mcp` で追加します。それ以外のホストでは `npx skills add rohitg00/agentmemory` で skills を追加できます。

skills CLI がまだカバーしていない少数のエージェント(Zed v1.3.x 以前)では、17 個の SKILL.md ファイルをエージェントのネイティブ skill ディレクトリに自分で置いてください。同じフォーマットがどこでも動きます。

#### 標準的な MCP ブロック

agentmemory のエントリは、`mcpServers` の形式を使うすべてのホスト(Cursor、Claude Desktop、Cline、Roo Code、Gemini CLI、OpenClaw)で**同じ MCP サーバーブロック**です:

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

**このエントリをホストの既存の `mcpServers` オブジェクトにマージしてください** — ファイルを置き換えないでください。ファイルに既に他のサーバーがある場合は、その隣に `agentmemory` をもう 1 つのキーとして追加します。`mcpServers` が完全に欠けている場合は、ブロックを `{ "mcpServers": { ... } }` の中に貼り付けてください。`${VAR}` プレースホルダーは、MCP サーバー起動時にシェルから `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` を継承します。未設定の変数は空文字列を渡し、shim は `http://localhost:3111` にフォールバックします。1 つの接続済みエントリで、ローカルとリモート(k8s / リバースプロキシ)の両方のデプロイに対応します。

| エージェント | 設定ファイル | 備考 |
|---|---|---|
| **Cursor(MCP のみ)** | `~/.cursor/mcp.json` | `mcpServers` にマージするか、`agentmemory connect cursor`。ウェブサイトにはワンクリックディープリンクもあります。 |
| **Cursor(フルプラグイン)** | `.cursor-plugin/` | Cursor Marketplace または Settings → Plugins → ローカルチェックアウト。共通の `plugin/scripts/*.mjs` を呼ぶ薄いアダプター経由でライフサイクル hooks を登録し、skills と MCP も提供します。アダプターは Cursor が正確に報告しないワークスペースを解決します。[Cursor](#cursor) を参照してください。Cursor IDE と `cursor-agent` CLI で動作します。 |
| **Claude Desktop** | `claude_desktop_config.json`(Application Support) | `mcpServers` にマージ。編集後は Claude Desktop を再起動してください。 |
| **Cline / Roo Code / Kilo Code** | Cline の MCP 設定(Settings UI → MCP Servers → Edit) | 同じ `mcpServers` ブロック。 |
| **Devin CLI(MCP + hooks)** | `~/.config/devin/config.json` | `agentmemory connect devin` が MCP エントリをマージします。`--with-hooks` は、Devin の小文字のツールマッチャーを使った 6 つのネイティブ自動キャプチャ hooks(SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop、SessionEnd)を追加します。`devin mcp list` と devin 内の `/hooks` で確認してください。 |
| **Devin CLI(フルプラグイン)** | `plugin/.devin-plugin/` | チェックアウトから `devin plugins install ./plugin` を実行すると、17 個の skills すべてが `/agentmemory:<skill>` スラッシュコマンドとして MCP サーバーとともに登録されます。Devin のプラグイン hooks は `SessionStart`/`SessionEnd` を発火できないため、セッション全体をキャプチャするには `connect devin --with-hooks` と組み合わせてください。 |
| **Devin(クラウド)** | Settings → Connections → MCP servers | カスタム MCP(STDIO)を追加: コマンドは `npx`、引数は `-y @agentmemory/mcp@latest`、env にはネットワーク到達可能な agentmemory デプロイを指す `AGENTMEMORY_URL` と `AGENTMEMORY_SECRET`(クラウドセッションは localhost に到達できません — [`deploy/`](../deploy/) 参照)。シークレットは Devin Secrets に保存し、「Test listing tools」で 54 ツールすべてが表示されることを確認してください。 |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user`(自動マージ)。 |
| **GitHub Copilot CLI(MCP のみ)** | `~/.copilot/mcp-config.json` | `agentmemory connect copilot-cli` が `mcpServers.agentmemory` をマージします。Copilot は次回起動時または `/mcp` で認識します。 |
| **GitHub Copilot CLI(フルプラグイン)** | Copilot plugin install | GitHub のサブディレクトリにあるプラグインには `copilot plugin install rohitg00/agentmemory:plugin` を使用。 |
| **OpenClaw** | OpenClaw の MCP 設定 | 同じ `mcpServers` ブロック。より深く統合するには: `openclaw plugins install ./integrations/openclaw` が OpenClaw のメモリスロットを占有します(`memory-core` から自動切り替え)。`plugins.entries.agentmemory.hooks.allowConversationAccess=true` を設定しないと、キャプチャが静かにブロックされます。[`integrations/openclaw`](../integrations/openclaw/) 参照。 |
| **Codex CLI(MCP のみ)** | `.codex/config.toml` | TOML 形式: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`、または `[mcp_servers.agentmemory]` を手動で追加。 |
| **Codex CLI(フルプラグイン)** | Codex plugin marketplace | `codex plugin marketplace add rohitg00/agentmemory` のあと `codex plugin add agentmemory@agentmemory`。MCP + 6 つのライフサイクル hooks + 17 skills を登録します。ホストで hooks を信頼し、キャプチャを確認してください。[Codex のセットアップと検証](../docs/plugins/codex-local.md)を参照。 |
| **OpenCode(MCP のみ)** | `opencode.json` | 異なる形式: トップレベルの `mcp` キー、コマンドは配列: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`。 |
| **OpenCode(フルプラグイン)** | `plugin/opencode/` | セッションのライフサイクル、メッセージ、ツール、エラーをカバーする 22 個の自動キャプチャ hooks。プロジェクトの帰属はセッション単位なので、複数のリポジトリにまたがる 1 つの OpenCode プロセスは、各セッションをそれぞれのプロジェクトに記録します。スラッシュコマンドは 2 つ(`/recall`、`/remember`)。`plugin/opencode/` を OpenCode のワークスペースにコピーし、プラグインエントリを `opencode.json` に追加してください。完全な hook 表とギャップ分析は [`plugin/opencode/README.md`](../plugin/opencode/README.md) 参照。 |
| **pi** | `~/.pi/agent` | `agentmemory connect pi --with-mcp` · ネイティブ検索 + キャプチャ + skills. [Pi](../integrations/pi/) |
| **Oh My Pi (OMP)** | `~/.omp/agent/config.yml` | `agentmemory connect omp --with-mcp` · ネイティブ検索 + キャプチャ + skills. [Oh My Pi](../integrations/omp/) |
| **Hermes Agent** | `~/.hermes/config.yaml` | `cp -r integrations/hermes ~/.hermes/plugins/agentmemory` + `memory.provider: agentmemory` で、6 hooks のメモリプロバイダー(プリフェッチ、ターンキャプチャ、セッション終了、圧縮前処理、MEMORY.md ミラーリング、システムプロンプトブロック)が使えます。`hermes plugins doctor` と `hermes memory status` で検証してください。[`integrations/hermes`](../integrations/hermes/) 参照。 |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` が標準の `mcpServers` ブロックを書き込みます。Hook のペイロードは Claude Code とフィールド互換なので、既存の 12 hook スクリプトは変更なしで動作します。同じ `settings.json` の `hooks` セクションで配線してください。 |
| **Antigravity IDE / 2.0** | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity --with-hooks` が共有のカスタマイズディレクトリに MCP とキャプチャ hooks をインストールします。[Antigravity のセットアップと制限](../docs/plugins/antigravity.md)を参照。 |
| **Antigravity CLI**(`agy`) | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity-cli --with-hooks` は現在の IDE バージョンと同じ MCP と hook の設定を使います。既存のインストールは `--force` で更新してください。[アップグレードノート](../docs/plugins/antigravity.md)を参照。 |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` がユーザーレベルの設定を書き込みます。ワークスペース単位の上書きは、コードの隣にある `.kiro/settings/mcp.json` に書いてください。 |
| **Warp** | `~/.warp/.mcp.json` | `agentmemory connect warp` が標準の `mcpServers` ブロックを書き込みます。Warp は `.claude/skills/` からも skills を自動検出します。Claude Code プラグインをインストールすれば、9 つの agentmemory skills(`remember`、`recall`、`recap`、`handoff`、`forget`、`lesson`、`commit-context`、`commit-history`、`session-history`)が Warp のスラッシュコマンドパレットにネイティブで表示されます。 |
| **Cline(CLI)** | `~/.cline/data/settings/cline_mcp_settings.json` | `agentmemory connect cline` が標準の `mcpServers` ブロックを書き込みます。VS Code 拡張を使う場合は、Cline Settings → MCP Servers → Edit JSON に同じブロックを貼り付けてください。 |
| **Continue.dev** | `~/.continue/config.yaml`(推奨)または `config.json`(レガシー) | `agentmemory connect continue` は設定がなければ `config.yaml` を作成し、既存の `config.json` は更新します。既存の YAML はコメントとアンカーを維持するため書き換えず、`mcpServers:` に貼るブロックを表示します。Continue の `mcpServers` は配列です。 |
| **Zed** | `~/.config/zed/settings.json` | `agentmemory connect zed` は `context_servers`(`mcpServers` ではなく Zed 独自のキー)の下に書き込みます。リモート MCP サーバーは、代わりに `{"url": "..."}` で配線できます。 |
| **Droid(Factory.ai)** | `~/.factory/mcp.json` | `agentmemory connect droid` が標準の `mcpServers` ブロックを書き込みます。プロジェクト単位の上書きは `<repo>/.factory/mcp.json` に書いてください。`--with-hooks` を渡すとネイティブ自動キャプチャが使えます。 |
| **DeepSeek Harness** | `$DSH_HOME/cordis.patch.yml` | `agentmemory connect dsh` で MCP ツールを有効にします。`--with-hooks` を追加すると、AgentMemory 同梱のネイティブキャプチャプラグインを読み込みます。別のプラグインパッケージは不要です。 [DSH](../docs/dsh.md). |
| **Goose** | Goose の MCP 設定 UI | 同じ `mcpServers` ブロック。`goose configure` → Add Extension → MCP を使用。`~/.config/goose/config.yaml` の直接編集もサポートされていますが、スキーマは `mcpServers:` + `command` ではなく `extensions:` + `cmd` を使います。 |
| **Aider** | n/a | [REST API](#validate-a-fresh-install-and-restart-persistence) |
| **対応エージェント** | skills のみ | `npx skills add rohitg00/agentmemory`; インストールする skills と対象のエージェントを選択します。 |

ホストの `localhost` に到達できない**サンドボックス化された MCP クライアント**(Flatpak / Snap /制限の強いコンテナ)では、`env` ブロックに `"AGENTMEMORY_FORCE_PROXY": "1"` も設定し、`AGENTMEMORY_URL` をサンドボックスが実際に到達できるルート(例: あなたの LAN IP)に向けてください。

### プログラムによるアクセス

任意の言語から [REST API](#api)、エージェントから [MCP ツール](#mcp-server)を使えます。REST は JSON と Bearer 認証を使います。[保存と検索の例](#validate-a-fresh-install-and-restart-persistence)を参照してください。ランタイムへ直接接続する例は [Python ガイド](../examples/python/)にあります。

### ソースから

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

`npm start` はインストール済み CLI と同じローカルサーバーを起動します。必要環境は[インストール](#install)を参照してください。API とビューアーは `127.0.0.1` にバインドします。

### Windows

agentmemory は Windows 10/11 で動作します。WSL2 は Linux の経路に従い、ピン留めされたエンジンを自動インストールできます。ネイティブ Windows では、ピン留めされた iii-engine v0.25.0 バイナリを手動でインストールしてください。[iii v0.25.0 リリースページ](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.25.0)から該当アーカイブをダウンロードして checksum を確認し、`iii.exe` を `PATH` に配置します(例: `%USERPROFILE%\.local\bin\iii.exe`)。CLI は Windows ZIP を自動展開しません。

ネイティブ Windows の自動 MCP 接続は `agentmemory connect copilot-cli` のみをサポートします。それ以外のネイティブ Windows エージェントには[その他のエージェント](#other-agents)の手動 MCP ブロックを使用してください。`connect` を WSL 内で実行するのは、対象エージェントも同じ WSL 環境にインストールされている場合に限ります。

**スタンドアロン MCP のみ(エンジンなし)。** REST API、ビューワー、ランタイムサービスが不要で、MCP ツールだけ必要な場合:

```powershell
npx -y @agentmemory/agentmemory@latest mcp
# or
npx -y @agentmemory/mcp
```

`agentmemory doctor` を実行するか、`--verbose` を付けて再起動してください。ポートが使用中なら `--port <N>` または `--instance <N>` を指定します。互換性と復旧は[アップグレードガイド](../docs/upgrades/iii-0.25.md)を参照してください。

---

<h2 id="deploy">デプロイ</h2>

Docker Compose または以下のテンプレートでセルフホストできます。メモリと認証情報は `/data` ボリュームに保存されます。更新時もバックアップした同じボリュームを使ってください。認証、ネットワーク、移行は[デプロイガイド](../deploy/README.md)を参照してください。

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

Render のワンクリックデプロイボタンはリポジトリルートに `render.yaml` を要求しますが、ルートはあえて綺麗なまま保っています。[`deploy/render/`](.././deploy/render/README.md) にドキュメント化された Render Blueprint フローを使い、リポジトリ内のブループリントを手動で指してください。

完全なセットアップ詳細(HMAC キャプチャ、ビューワーの SSH トンネル、ローテーション、バックアップ、コスト下限)は [`deploy/`](.././deploy/README.md) を参照してください:

- [`deploy/fly`](.././deploy/fly/README.md): 単一マシンで
  `auto_stop_machines = "stop"`。アイドル時最安。
- [`deploy/railway`](.././deploy/railway/README.md): Hobby プラン定額、
  ボリュームはダッシュボードで管理。
- [`deploy/render`](.././deploy/render/README.md): Blueprint フロー、
  有料プランで自動ディスクスナップショット。
- [`deploy/coolify`](.././deploy/coolify/README.md): [Coolify](https://coolify.io/self-hosted)
  経由で自前の VPS にセルフホスト。同じ Docker
  Compose スタックを使い、ホストとデータは自分の手元に残ります。

REST は `3111`、ビューアーは `3113` を使います。非公開で運用するか、認証と TLS で保護してください。公開設定と[従来の Docker からの移行](../deploy/README.md#migrating-from-the-legacy-cli-docker-mode)はデプロイガイドを参照してください。

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Why agentmemory" height="32" /></picture></h2>

プロジェクトの知識はチャットや指示ファイルに散らばりがちです。AgentMemory なら、今使っているエージェントから過去の判断、修正、教訓を検索できます。

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

### 組み込みエージェントメモリとの比較

すべての AI コーディングエージェントには組み込みのメモリが付属します — Claude Code には `MEMORY.md`、Cursor には notepad、Cline には memory bank。これらは付箋のようなものです。agentmemory はその付箋の背後にある検索可能なデータベースです。

| | 組み込み (CLAUDE.md) | agentmemory |
|---|---|---|
| 保守 | 手動で管理する指示 | インデックス化されたセッション履歴とメモリ |
| 検索 | すべてをコンテキストにロード | BM25 + ベクトル + グラフ(top-K のみ) |
| クロスエージェント | エージェントごとのファイル | MCP + REST(任意のエージェント) |
| 調整 | なし | リース、シグナル、アクション、ルーチン |
| 可観測性 | 手動でファイルを読む | ポート 3113 のリアルタイムビューワー |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="How It Works" height="32" /></picture></h2>

### メモリパイプライン

```text
PostToolUse hook fires
  -> Stable event ID / durable capture inbox / offline spool
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

### 4 層メモリ統合

人間の脳が記憶を処理する方法(睡眠時の記憶統合を含む)をモデルにしています。

| 層 | 内容 | 例え |
|------|------|---------|
| **Working(作業記憶)** | ツール使用からの生観測 | 短期記憶 |
| **Episodic(エピソード記憶)** | 圧縮されたセッション要約 | 「何が起きたか」 |
| **Semantic(意味記憶)** | 抽出された事実とパターン | 「何を知っているか」 |
| **Procedural(手続き記憶)** | ワークフローと意思決定パターン | 「どうやるか」 |

記憶は時間とともに減衰します(エビングハウス曲線)。頻繁にアクセスされる記憶は強化されます。古い記憶は自動退避されます。矛盾は検出され解決されます。

### 何がキャプチャされるか

この表は Claude Code の hooks を示します。他の統合はホストが提供するイベントを記録します。共通 hooks の自動コンテキスト挿入は `AGENTMEMORY_INJECT_CONTEXT=true` で有効にするオプションです。

| Hook | キャプチャ内容 |
|------|----------|
| `SessionStart` | プロジェクトパス、セッション ID |
| `UserPromptSubmit` | ユーザープロンプト(プライバシーフィルタ済み) |
| `PreToolUse` | ファイルアクセスパターン + 富化されたコンテキスト |
| `PostToolUse` | ツール名、入力、出力 |
| `PostToolUseFailure` | エラーコンテキスト |
| `PreCompact` | コンパクション前にメモリを再注入 |
| `SubagentStart/Stop` | サブエージェントのライフサイクル |
| `Stop` | セッション終了時の要約 |
| `SessionEnd` | セッション完了マーカー |

### 主な機能

| 機能 | 説明 |
|---|---|
| **自動キャプチャ** | ネイティブ統合が対応するセッションとツールのイベントを記録 |
| **セマンティック検索** | BM25 + ベクトル + ナレッジグラフ、RRF 融合 |
| **メモリ進化** | バージョン管理、上書き、関係グラフ |
| **リコール衛生** | 上書き(supersede)されたメモリバージョンは検索インデックスから外れ、KV のバージョンチェーンが全履歴を保持します |
| **近接重複ヒント** | 新しい内容が既存メモリに酷似している場合、保存時に参考情報として `similarTo` の一致を報告します |
| **エージェント別スコープ** | `agentId` が REST、MCP、検索インデックスを貫いて保存とリコールに通り、共有モードと分離モードに対応します |
| **書き込み時の来歴** | すべての観測とメモリが、キャプチャ・保存・インポート時に刻印された不変のオリジンチャネル(user、agent、tool、import、shared)を保持します |
| **自動忘却** | TTL 期限切れ、矛盾検出、重要度退避 |
| **プライバシー優先** | API キー、シークレット、`<private>` タグは保存前に除去 |
| **自己修復** | サーキットブレーカー、プロバイダーフォールバックチェーン、ヘルスモニタ |
| **Claude ブリッジ** | MEMORY.md との双方向同期 |
| **ナレッジグラフ** | エンティティ抽出 + BFS 探索 |
| **チームメモリ** | チームメンバー間で名前空間化された共有 + プライベート |
| **引用の出所追跡** | あらゆるメモリを元の観測まで遡れます |
| **Git スナップショット** | メモリ状態のバージョン管理、ロールバック、diff |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Search" height="32" /></picture></h2>

3 つの信号を組み合わせたトリプルストリーム検索:

| ストリーム | やること | いつ有効か |
|---|---|---|
| **BM25** | 同義語展開付きのステミングされたキーワードマッチ | 常時オン |
| **ベクトル** | 密な埋め込みに対するコサイン類似度 | 埋め込みプロバイダーが設定されているとき |
| **グラフ** | エンティティマッチによるナレッジグラフ探索 | クエリ内にエンティティが検出されたとき |

Reciprocal Rank Fusion(RRF、k=60)で融合し、セッションごとに多様化されます(セッションあたり最大 3 件)。

ベクトルインデックスが構築されている場合、`mem::search`(`memory_recall` の背後)はハイブリッドな BM25 + ベクトルランカーを使います。埋め込みがない場合は BM25 を使います。`smart-search` は、キーレスモードでも、グラフデータが存在する場合は構造的なグラフマッチをさらに融合できます。レッスンのリコールは、クエリごとにコーパス全体をスキャンするのではなく、専用のインメモリ BM25 インデックス上で動作します。上書きされたメモリバージョンはすべてのリコール経路から除外されます。バージョンチェーンがその履歴を保持します。

[0.9.31: `AGENTMEMORY_VECTOR_BACKFILL=all` / `AGENTMEMORY_VECTOR_BACKFILL_MAX`](../docs/reliability/source-and-vector-recovery.md).

BM25 は、ギリシャ語、キリル文字、ヘブライ語、アラビア語、アクセント付きラテン文字をそのままトークン化します。中国語 / 日本語 / 韓国語のメモリについては、オプションのセグメンタ(`npm install @node-rs/jieba tiny-segmenter`)をインストールすると、CJK の文字列を単語レベルのトークンに分割できます。インストールしない場合、agentmemory は文字列全体をそのままトークン化するようソフトにフォールバックし、stderr に 1 回だけヒントを表示します。

### 埋め込みプロバイダー

キーレスインストールではベクトル埋め込みが無効になります: `mem::search` は BM25 を使い、`smart-search` は既存の構造的なグラフデータも使えます。無料のオンデバイスなセマンティック埋め込みにオプトインするには、`~/.agentmemory/.env` に以下を追加して agentmemory を再起動してください:

```env
EMBEDDING_PROVIDER=local
```

通常の npm インストールには、オプションの `@huggingface/transformers` ランタイムが含まれています。最初の埋め込みリクエストで `Xenova/all-MiniLM-L6-v2` がダウンロードされるため、ネットワークアクセスが必要で時間がかかることがあります。それ以降の推論はオンデバイスで実行されます。リモートプロバイダーは、`EMBEDDING_PROVIDER` で上書きされない限り、それぞれのキーから自動検出されます。

| プロバイダー | モデル | コスト | 備考 |
|---|---|---|---|
| **ローカル(推奨オプトイン)** | `all-MiniLM-L6-v2` | 無料 | [`EMBEDDING_PROVIDER=local`](../README.md#embedding-providers) |
| Gemini | `gemini-embedding-001` | 無料枠 | 100+ 言語、768/1536/3072 次元(MRL)、2048 トークン入力。`text-embedding-004`([非推奨、2026 年 1 月 14 日に終了](https://ai.google.dev/gemini-api/docs/deprecations))の後継 |
| OpenAI | `text-embedding-3-small` | [OpenAI](https://openai.com/api/pricing/) | [text-embedding-3-small](https://platform.openai.com/docs/models/text-embedding-3-small) |
| Voyage AI | `voyage-code-3` | 有料 | コードに最適化 |
| Cohere | `embed-english-v3.0` | 無料トライアル | 汎用 |
| OpenRouter | 任意のモデル | 様々 | マルチモデルプロキシ |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP Server" height="32" /></picture></h2>

54 ツール、6 リソース、3 プロンプト、17 skills。

> **MCP shim とフルサーバー:** 公開されている `@agentmemory/mcp` パッケージは薄い shim です。**`AGENTMEMORY_URL` 経由で動作中の agentmemory サーバーに到達できる場合に限り**、完全な 54 ツール群を公開します(プロキシモード)。サーバーに到達できない場合、shim は 7 ツールのローカルセット(`memory_save`、`memory_recall`、`memory_smart_search`、`memory_sessions`、`memory_export`、`memory_audit`、`memory_governance_delete`)にフォールバックします。`AGENTMEMORY_TOOLS=core|all` 環境変数は*サーバー側*のフラグです — shim の `env` ブロックで設定しても効果はありません。Cursor / OpenCode / Gemini CLI で 7 ツールしか見えない場合は、`npx -y @agentmemory/agentmemory@latest`(または Docker スタック)を起動し、`AGENTMEMORY_URL=http://localhost:3111` を設定してください。

### 54 ツール

ツールの公開範囲は小さい順に 3 段階: `AGENTMEMORY_TOOLS=core` は表示を 8 個の必須ツール(`memory_save`、`memory_recall`、`memory_consolidate`、`memory_smart_search`、`memory_sessions`、`memory_diagnose`、`memory_lesson_save`、`memory_reflect`)に絞ります。下の基本セットはレジストリの基盤となる 14 ツール、デフォルト(`AGENTMEMORY_TOOLS=all`)は 54 個すべてを公開します。

<details>
<summary>基本ツール(14)</summary>

| ツール | 説明 |
|------|-------------|
| `memory_recall` | 過去の観測を検索 |
| `memory_compress_file` | 構造を保持したまま markdown ファイルを圧縮 |
| `memory_save` | 洞察、決定、パターンを保存 |
| `memory_file_history` | 特定ファイルに関する過去の観測 |
| `memory_patterns` | 繰り返し現れるパターンを検出 |
| `memory_sessions` | 最近のセッション一覧 |
| `memory_smart_search` | ハイブリッドなセマンティック + キーワード検索 |
| `memory_vision_search` | 画像観測を検索 |
| `memory_timeline` | 時系列の観測 |
| `memory_profile` | プロジェクトプロファイル(概念、ファイル、パターン) |
| `memory_export` | すべてのメモリデータをエクスポート |
| `memory_relations` | 関係グラフを照会 |
| `memory_commit_lookup` | git コミットの背後にあるセッション |
| `memory_commits` | セッションに記録されたコミット |

</details>

<details>
<summary>拡張ツール(全 54、デフォルトの公開範囲)</summary>

| ツール | 説明 |
|------|-------------|
| `memory_patterns` | 繰り返し現れるパターンを検出 |
| `memory_timeline` | 時系列の観測 |
| `memory_relations` | 関係グラフを照会 |
| `memory_graph_query` | ナレッジグラフ探索 |
| `memory_consolidate` | 4 層統合を実行 |
| `memory_claude_bridge_sync` | MEMORY.md と同期 |
| `memory_team_share` | チームメンバーと共有 |
| `memory_team_feed` | 最近の共有アイテム |
| `memory_audit` | 操作の監査証跡 |
| `memory_governance_delete` | 監査証跡付き削除 |
| `memory_snapshot_create` | Git バージョンスナップショット |
| `memory_action_create` | 依存関係付き作業項目を作成 |
| `memory_action_update` | アクションのステータス更新 |
| `memory_frontier` | 優先度順のブロック解除済みアクション |
| `memory_next` | 次に最も重要なアクション 1 つ |
| `memory_lease` | 排他的アクションリース(マルチエージェント) |
| `memory_routine_run` | ワークフロールーチンをインスタンス化 |
| `memory_signal_send` | エージェント間メッセージング |
| `memory_signal_read` | 受領確認付きでメッセージを読む |
| `memory_checkpoint` | 外部条件ゲート |
| `memory_mesh_sync` | インスタンス間 P2P 同期 |
| `memory_sentinel_create` | イベント駆動ウォッチャー |
| `memory_sentinel_trigger` | 外部からセンチネルを発火 |
| `memory_sketch_create` | 一時的なアクショングラフ |
| `memory_sketch_promote` | 永続化に昇格 |
| `memory_crystallize` | アクションチェーンをコンパクト化 |
| `memory_diagnose` | ヘルスチェック |
| `memory_heal` | 詰まった状態を自動修復 |
| `memory_facet_tag` | 次元:値タグ |
| `memory_facet_query` | facet タグで照会 |
| `memory_verify` | 出所を追跡 |

</details>

### 6 リソース · 3 プロンプト · 17 Skills

| 種類 | 名前 | 説明 |
|------|------|-------------|
| Resource | `agentmemory://status` | ヘルス、セッション数、メモリ数 |
| Resource | `agentmemory://project/{name}/profile` | プロジェクト別インテリジェンス |
| Resource | `agentmemory://project/{name}/recent` | プロジェクトの最近の観測 |
| Resource | `agentmemory://memories/latest` | 直近 10 件のアクティブメモリ |
| Resource | `agentmemory://graph/stats` | ナレッジグラフ統計 |
| Resource | `agentmemory://team/{id}/profile` | 共有チームプロファイル |
| Prompt | `recall_context` | 検索してコンテキストメッセージを返す |
| Prompt | `session_handoff` | エージェント間でのハンドオフデータ |
| Prompt | `detect_patterns` | 繰り返し現れるパターンを分析 |
| Skill | `/recall` | メモリを検索 |
| Skill | `/remember` | 長期メモリに保存 |
| Skill | `/session-history` | 最近のセッション要約 |
| Skill | `/forget` | 観測/セッションを削除 |

この表は 4 つのコア skills を示しています。フルセットは 9 個の呼び出し可能な skills と 8 個のリファレンス skills です。上の「ネイティブ skills」セクションを参照してください。

### スタンドアロン MCP

フルサーバーなしで実行 — 任意の MCP クライアント向け。以下のどちらも動きます:

```bash
npx -y @agentmemory/agentmemory@latest mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

またはエージェントの MCP 設定に追加してください:

ほとんどのエージェント(Cursor、Claude Desktop、Cline、Roo Code、Gemini CLI):
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

`agentmemory` エントリは、ファイルを置き換えるのではなく、ホストの既存 `mcpServers` オブジェクトにマージしてください。ホストの `localhost` に到達できないサンドボックスクライアントには、env ブロックに `"AGENTMEMORY_FORCE_PROXY": "1"` を追加し、`AGENTMEMORY_URL` をサンドボックスが到達できるルートに設定してください。

OpenCode(`opencode.json`):
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

リポジトリからプラグインファイルをコピーします:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Real-Time Viewer" height="32" /></picture></h2>

viewer はポート `3113` で自動起動します。接続時に snapshot (`GET /agentmemory/viewer/snapshot`)を 1 回読み込み、その後 REST worker の `/agentmemory/viewer/events` に対する SSE でライブイベントを反映します。メモリ、lesson、observation、audit entry、graph の変更、health 更新が polling やページ再読み込みなしで表示されます。

- **4 グループにまたがる 12 個のタブ**。ライブカウント、ディープリンク(`#memories/<id>`、`#sessions/<id>?obs=<id>`、`#graph/<id>`、`#health/consolidation`)、キーボードショートカット、モバイル用メニューを備えています。
- **Memories:** サーバー側検索、プロジェクト・エージェント・タイプによるフィルタ、バージョンチェーンと単語単位の diff を含む詳細パネル、来歴リンク、id・MCP 呼び出し・curl コマンドのコピーボタン、編集(新しいバージョンとして)、確認付きの forget、一括 forget、JSON エクスポート。
- **Sessions:** 読みやすいツール入出力付きのインラインな観測タイムライン、フィルタとページ送り、各セッションが生んだメモリとレッスン。
- **Graph:** 検索、関係とソースを含むノード詳細、色だけに依存しない凡例、ズームコントロール。
- **Health:** `GET /agentmemory/status` のライブ版。すべての問題にはその修正方法が添えられ、さらにステートバックエンド、インデックス保存の状態、グラフの来歴コンパクション進捗、実際のしきい値付きの統合の説明も表示されます。
- **Audit、Activity、Profile、Replay、Lessons、Actions、Crystals** の各ページ。それぞれ、そのセクションが何なのか、なぜ空なのか、何のコマンドで埋まるのかを示す空状態と、すべての用語・数値に付く `?` の用語集ツールチップがあります。

```bash
open http://localhost:3113
```

ビューワーサーバーはデフォルトで `127.0.0.1` にバインドし、REST API へリクエストを転送する際にサーバーシークレットを添付するため、追加の設定は不要です。REST 経由で提供される `/agentmemory/viewer` エンドポイントは通常のベアラートークン規則に従い、トークンを持たないブラウザをビューワーのポートにリダイレクトします。CSP ヘッダーはレスポンスごとのスクリプト nonce を使い、インラインハンドラ属性を無効化します(`script-src-attr 'none'`)。

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Configuration" height="32" /></picture></h2>

### LLM プロバイダー

agentmemory は環境からプロバイダーを自動検出します。プロバイダーを設定すると LLM ベースの操作が使えるようになりますが、プロバイダーの設定だけでは LLM による観測の圧縮は有効になりません。その経路には、プロバイダーと `AGENTMEMORY_AUTO_COMPRESS=true` の両方が必要です。

| プロバイダー | 設定 | 備考 |
|----------|--------|-------|
| **No-op(デフォルト)** | 設定不要 | LLM ベースの compress/summarize は無効。合成圧縮と BM25 リコールは引き続き動作します。以前 Claude 購読フォールバックに依存していた場合は、下記の `AGENTMEMORY_ALLOW_AGENT_SDK` を参照してください。 |
| Anthropic API | `ANTHROPIC_API_KEY` | トークン単位課金 |
| MiniMax | `MINIMAX_API_KEY` | Anthropic 互換 |
| Gemini | `GEMINI_API_KEY` | 埋め込みも有効化 |
| OpenRouter | `OPENROUTER_API_KEY` | 任意のモデル |
| OpenAI API | `OPENAI_API_KEY` | デフォルト `gpt-5.6-luna`、`OPENAI_MODEL` で上書き |
| **ローカル(Ollama / LM Studio / vLLM / llama.cpp)** | `OPENAI_API_KEY=local` + `OPENAI_BASE_URL=http://localhost:11434/v1`(Ollama)または `http://localhost:1234/v1`(LM Studio)+ `OPENAI_MODEL=<your model>` | OpenAI API 互換なら何でも。コストゼロ、あなたのハードウェアで動作します。下記の[ローカルモデル](#local-models-ollama--lm-studio--vllm)を参照してください。 |
| Claude 購読フォールバック | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | オプトインのみ。`@anthropic-ai/claude-agent-sdk` のセッションを生成します。過去に無限の Stop-hook 再帰を引き起こしたため、もはやデフォルトではありません。 |

<a id="local-models-ollama--lm-studio--vllm"></a>

### ローカルモデル(Ollama / LM Studio / vLLM)

agentmemory は OpenAI API 互換のあらゆるサーバーと通信できるため、`/v1/chat/completions` を公開するものならコード変更なしで動きます。有料キーもクラウドもレート制限もなし。すべてあなたのハードウェア上で動作します。

**Ollama**(デフォルトポート `11434`):

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

**LM Studio**(デフォルトポート `1234`):

LM Studio を開く → Local Server タブ → Start Server。ピッカーから任意のチャットモデル(Qwen 3、gpt-oss、DeepSeek R1 など)を選択します。

```env
# ~/.agentmemory/.env
OPENAI_API_KEY=lmstudio                        # any non-empty string; LM Studio ignores it
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=qwen3-8b                          # match the model name from LM Studio
```

**vLLM / llama.cpp / Text Generation Inference**: 同じ形です。`OPENAI_BASE_URL` をサーバーが公開する URL に向け、`OPENAI_MODEL` をサーバーが受け付ける名前に設定してください。

**メモリ作業向けのモデル選び**: 圧縮と要約は短いタスク(入力 <2K トークン、出力 <500 トークン)なので、7B クラスの instruct モデルで十分です。推奨:

| モデル | サイズ | 理由 |
|-------|------|-----|
| `qwen3:8b` | ~5.2 GB | 16 GB マシンでのバランス型デフォルト。抽出とツール形式のテキストに強い |
| `qwen3:4b` | ~2.6 GB | 最小の現実的な選択肢。圧縮には十分、グラフ抽出はやや弱い |
| `qwen3-coder:30b` | ~19 GB | コード中心のセッションに最良のローカル候補(30B MoE、アクティブ 3.3B)。24〜32 GB ハードウェア向け |
| `gpt-oss:20b` | ~14 GB | 16 GB RAM に収まる強力な汎用モデル |
| `deepseek-r1:8b` | ~5.2 GB | 推論蒸留モデル。遅いが抽出はよりクリーン |

Qwen 3 モデルはデフォルトで思考(thinking)を行い、出力を出す前に推論だけでトークン予算を使い切ることがあります。`AGENTMEMORY_LLM_NOTHINK=1` を設定すると、グラフ抽出プロンプトに `/no_think` が付加されます。抽出結果が空で返る場合は `MAX_TOKENS` を上げてください(16384 で動作します)。

推論クラスのモデル(`<think>` ブロックを持つ `o1` 系)は、ローカルサーバーが表面化しない可能性のある `reasoning` フィールドとともに、空の `content` を返すことがあります。抽出が空で返る場合は、まず非推論モデルに切り替えてください。`OPENAI_REASONING_EFFORT=none` の環境変数でも、OpenAI の推論スキーマを踏襲する Ollama Cloud の thinking モデルの思考を無効化できます。

ローカル埋め込みはオプションの依存としては同梱されていますが、デフォルトでは有効になっていません。`Xenova/all-MiniLM-L6-v2`(384 次元)にオプトインするには `EMBEDDING_PROVIDER=local` を設定してください。最初の埋め込みリクエストでモデルがダウンロードされ、その後の推論はオンデバイスで行われます。この設定もリモートの埋め込みキーもない場合、ベクトルは無効のままで、`mem::search` は BM25 を使い、`smart-search` はそれでも既存のグラフマッチを追加できます。

### コストを意識したモデル選択

まずキーレスでキャプチャとキーワード検索を使えます。`EMBEDDING_PROVIDER=local` は初回ダウンロード後にローカルで意味検索を行います。LLM 圧縮にはプロバイダーと `AGENTMEMORY_AUTO_COMPRESS=true` が必要で、観測ごとにリクエストが発生し得るため現在の料金を確認してください。

`agentmemory status` / http://localhost:3113

### マルチエージェントメモリ(`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

複数のロール(architect / developer / reviewer / researcher / support-agent)が 1 つの agentmemory サーバーを共有するマルチエージェント構成では、`AGENT_ID` がすべての書き込みに、それを行ったロールのタグを付けます。`AGENTMEMORY_AGENT_SCOPE` は、リコールがそのタグでフィルタするかどうかを制御します。

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

2 つのモード:

| モード | 書き込みにタグ | リコールでフィルタ | 使いどころ |
|------|------------|---------------|-------------|
| `shared`(デフォルト) | はい | いいえ | 監査証跡付きのクロスエージェントコンテキスト。Architect は developer のメモを見られますが、各行に発言者が記録されます。 |
| `isolated` | はい | はい | 厳格分離。Architect は developer の観測 / メモリ / セッションを決して見られません。 |

`AGENT_ID` が設定されたときにタグ付けされるもの: `Session.agentId`、`RawObservation.agentId`、`CompressedObservation.agentId`、`Memory.agentId`。ロールは `api::session::start` → `mem::observe` → `mem::compress` → KV を流れます。

isolated モードでフィルタされるもの: `mem::smart-search`、`/agentmemory/memories`、`/agentmemory/observations`、`/agentmemory/sessions`。各エンドポイントはリクエスト単位でオーバーライドする `?agentId=<role>` を受け付け、`?agentId=*` で環境スコープから完全にオプトアウトできます。`/memories` はさらに `?includeOrphans=true` を受け付け、`agentId` が undefined の AGENT_ID 導入前のメモリを浮上させます。

SDK / REST 層での呼び出し単位オーバーライド: すべての変更系エンドポイント(`/session/start`、`/remember`)はリクエストボディに `agentId` フィールドを受け付け、それが環境変数より優先されます。1 つのサーバープロセス経由で多数のロールをルーティングするランタイムに便利です。MCP の `memory_save` ツールも同じ `agentId` フィールドを公開し、スタンドアロンの stdio サーバーは `agentId` と `project` の両方を転送します。保存されたメモリは `agentId` を検索インデックスまで持ち込むため、エージェントスコープの検索は観測だけでなくメモリもカバーします。

`AGENT_ID` が未設定の場合、メモリはスコープなしのままです(従来の挙動、タグなし・フィルタなし)。

### ポート

API とビューアーはデフォルトでループバックにバインドします。

| Port | API / ビューアー | Env |
|---|---|---|
| `3111` | REST / MCP / SSE | `III_REST_PORT` |
| `3113` | ビューアー | `III_VIEWER_PORT` |

`--port <N>` は API ポートを設定し、ビューアーはデフォルトで `N+2` になります。`--instance N` で別のインスタンスを使えます。内部リスナーは非公開にし、外部公開や[旧 Docker からの移行](../deploy/README.md#migrating-from-the-legacy-cli-docker-mode)はデプロイガイドに従ってください。

### ストレージ backend: file (デフォルト) と Redis

別のデータベースサービスは不要. Redis: `AGENTMEMORY_STATE_BACKEND=redis` + `AGENTMEMORY_REDIS_URL`. 変更しても既存のメモリは自動移行されません。 [データの保存](../docs/reliability/state-storage.md).

### 設定ファイル

毎回 shell で変数を export する代わりに、agentmemory のランタイム設定を `~/.agentmemory/.env` に記述してください。viewer が `export ANTHROPIC_API_KEY=...` のような設定ヒントを表示した場合は、`export` を除いてファイルにコピーし、agentmemory を再起動します。別の env ファイルを使うには `AGENTMEMORY_ENV_FILE` を設定してください。

プロセスの環境変数も引き続き有効で、ファイル内の値より優先されます。

Windows では、同じファイルが `%USERPROFILE%\.agentmemory\.env` にあります:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

API キーの代わりに Claude Code Pro/Max の購読でテストするには、明示的にオプトインしてください:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

LLM による観測の圧縮には両方の行が必要です: LLM プロバイダーへのアクセス(この明示的な購読フォールバックを含む)と `AGENTMEMORY_AUTO_COMPRESS=true` です。プロバイダーだけでは、デフォルトの合成圧縮の経路がそのまま残ります。

統合(グラフノード、レッスン、クリスタル)は、LLM プロバイダーが設定されていれば常にデフォルトでオンです。LLM なしで運用したい場合は、`CONSOLIDATION_ENABLED=false` で明示的にオプトアウトしてください。グラフ抽出は別のフラグです:

```env
GRAPH_EXTRACTION_ENABLED=true
# CONSOLIDATION_ENABLED=false   # opt out of auto-consolidation
```

### 環境変数

`~/.agentmemory/.env`:

```env
EMBEDDING_PROVIDER=local

# AGENTMEMORY_INJECT_CONTEXT=true

# AGENTMEMORY_AUTO_COMPRESS=true

# AGENTMEMORY_TOOLS=core

# AUTO_FORGET_ENABLED=false
# LESSON_DECAY_ENABLED=false
# INSIGHT_DECAY_ENABLED=false
```

完全な設定一覧は [`.env.example`](../.env.example) にあります。プロバイダー、キャプチャのフィルター、保持期間、ストレージ、チーム設定を含みます。`AGENTMEMORY_ENV_FILE` で別ファイルを選べます。変更後は再起動してください。値を設定した `.env` や Bearer シークレットをコミットしないでください。

---

<h2 id="api"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-api.svg"><img src="../assets/tags/section-api.svg" alt="API" height="32" /></picture></h2>

ポート `3111` 上の 146 エンドポイント。REST API はデフォルトで `127.0.0.1` にバインドします。保護されたエンドポイントは `Authorization: Bearer <secret>` を要求し、mesh sync エンドポイントは両ピアで明示的に設定された `AGENTMEMORY_SECRET` を要求します。

認証はデフォルトで有効です。`AGENTMEMORY_SECRET` が未設定なら、CLI は初回起動時にランダムなシークレットを `~/.agentmemory/secret` に保存し、選択したデータディレクトリの `secret` にも複製します。権限は `0600` です。同梱クライアントはローカル接続時にこの共通ファイルを優先し、保存されたシークレットを送るのはループバック URL だけです。明示的な `AGENTMEMORY_SECRET` が優先され、リモート接続には環境変数で指定します。Docker デプロイは独自のシークレットを生成します。

```bash
curl -H "Authorization: Bearer $(cat ~/.agentmemory/secret)" http://localhost:3111/agentmemory/health
```

**書き込みリクエストの規則。** REST API とビューワーへの `POST`、`PUT`、`PATCH`、`DELETE` のリクエストは、ボディを伴う場合は常に `Content-Type: application/json`(`charset` パラメータがあっても構いません)を送る必要があり、`Origin` ヘッダーが存在する場合は、設定された REST またはビューワーのポートのループバックオリジンであるか、`VIEWER_ALLOWED_ORIGINS`(カンマ区切り、例: `https://memory.example.com`)に列挙されている必要があります。`Origin` ヘッダーを送らないクライアント(CLI、hooks、MCP、curl、サーバー間通信)は影響を受けません。ビューワーは自分自身のオリジンも受け付けます。

**ファイルパス。** ファイルを読み書きするエンドポイント(`/compress-file`、`/replay/import-jsonl`、`/graph/import-graphify`)は、`~/.agentmemory` 配下、インスタンスのデータディレクトリ配下、または `AGENTMEMORY_IMPORT_ROOT` に列挙されたディレクトリ配下(複数指定は `:` 区切り、Windows では `;`)のパスのみを受け付けます。`/replay/import-jsonl` は、デフォルトの `~/.claude/projects` も受け付けます。`/obsidian/export` は `AGENTMEMORY_EXPORT_ROOT` の中、`/migrate` は `~/.agentmemory` の中に留まります。シンボリックリンクは、各チェックの前に解決されます。

**シークレットのスクラビング。** API キー、ベアラートークン、PEM 秘密鍵ブロック、URL に埋め込まれた認証情報(`scheme://user:password@host`)は、すべての書き込み経路(観測、remember、evolve、slots、レッスン、アクション、スケッチ、シグナル、チェックポイント、インポート、jsonl リプレイ、mesh sync、チーム共有、圧縮・要約の出力、クリスタル、グラフノード)で、テキストが保存される前にマスクされます。

<details>
<summary>主要エンドポイント</summary>

| メソッド | パス | 説明 |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | ヘルスチェック(常に公開) |
| `GET` | `/agentmemory/status` | 何が問題で、どう直すか(ブラウザには HTML、それ以外には JSON) |
| `GET` | `/agentmemory/viewer/snapshot` | ビューワーが表示するすべてを 1 レスポンスで |
| `POST` | `/agentmemory/session/start` | セッション開始 + コンテキスト取得 |
| `POST` | `/agentmemory/session/end` | セッション終了 |
| `POST` | `/agentmemory/observe` | 観測のキャプチャ(配送の詳細は下記のキャプチャ配送を参照) |
| `GET` | `/agentmemory/capture` | キャプチャの受信箱、デッドレター、オフラインスプール |
| `POST` | `/agentmemory/capture/retry` | デッドレターになったキャプチャを再試行 |
| `POST` | `/agentmemory/capture/drain` | ローカルのオフラインスプールを今すぐ送信 |
| `POST` | `/agentmemory/smart-search` | ハイブリッド検索 |
| `POST` | `/agentmemory/context` | コンテキストを生成 |
| `POST` | `/agentmemory/remember` | 長期メモリに保存 |
| `POST` | `/agentmemory/forget` | 観測を削除 |
| `POST` | `/agentmemory/enrich` | ファイルコンテキスト + メモリ + バグ |
| `GET` | `/agentmemory/profile` | プロジェクトプロファイル |
| `GET` | `/agentmemory/export` | 全データをエクスポート |
| `POST` | `/agentmemory/import` | JSON からインポート |
| `POST` | `/agentmemory/graph/query` | ナレッジグラフ照会 |
| `POST` | `/agentmemory/graph/compact` | 肥大化したグラフの来歴を整理 |
| `POST` | `/agentmemory/team/share` | チームと共有 |
| `GET` | `/agentmemory/audit` | 監査証跡 |

完全なエンドポイント一覧: [REST API](../plugin/skills/agentmemory-rest-api/REFERENCE.md)

</details>

**キャプチャの配送。** hooks は各観測を `eventId` 付きで 1 回だけ `POST /agentmemory/observe` に送信します。これは、ペイロードに id がある場合(例えば Claude Code の `tool_use_id`)はその呼び出しに対するホスト自身の id であり、そうでない場合はセッション、hook のタイプ、ツール名、入力、出力、ホストのタイムスタンプのハッシュです。サーバーはそのイベントをステートストア内のキャプチャ受信箱に書き込み、観測を保存し、その後受信箱のエントリを削除します。ステータスコードは何が起きたかを表します:

| ステータス | `status` フィールド | 意味 |
|---|---|---|
| `201` | `accepted` | 保存されました。`observationId` は新しい観測です。 |
| `202` | `accepted`(`state: "retrying"`) | 受け付けましたが、保存に失敗しました。サーバーは、再起動後も含めて再試行します。 |
| `200` | `duplicate` | この `eventId` は既に受け付け済みです。`observationId` は既存の観測であり、新たに保存されるものはありません。 |
| `400` / `422` | `rejected` | ペイロードが無効、または保存に完全に失敗しました(そのイベントはデッドレターとして保持されます)。 |
| `503` | `rejected`(`retryable: true`) | 受信箱が満杯です(`AGENTMEMORY_CAPTURE_INBOX_MAX`)。hooks はそのイベントをスプールし、後で送信します。 |

失敗したイベントは、倍々に増えるバックオフで `AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS`(10 秒)ごとに、`AGENTMEMORY_CAPTURE_MAX_ATTEMPTS`(5)回まで再試行されます。それでも失敗し続けるイベントは受信箱にデッドレターとして残り、`/agentmemory/status` とビューワーの Health ページに表示され、`POST /agentmemory/capture/retry`(`{"eventId": "..."}` または `{"all": true}`)で再試行できます。受け付けられたイベント id は `AGENTMEMORY_CAPTURE_DEDUP_HOURS`(168 時間、最大 `AGENTMEMORY_CAPTURE_EVENTS_MAX` 件)の間記憶されるため、タイムアウトや再起動の後に再生された hook は 1 回だけ保存されますが、それぞれが独自のホスト id を持つ 2 つの別のツール呼び出しは、内容が同一であっても 2 回保存されます。観測が削除される(forget、セッション削除、退避、自動忘却、ストアを置き換えるインポート)とき、そのイベントは観測が削除される前に削除済みとマークされるため、同じウィンドウ内でそのイベントが再生されると重複として応答され、何も保存されません。ステートストアは 2 秒ごとにディスクへ書き込むため、応答済みのイベントが一瞬だけメモリ上にしか存在しないことがあります。これに対応するため、すべての `2xx` の応答には、サーバーの `bootId`(起動ごとに新しくなります)、`acceptedAt`、`durableAfterMs`(ファイルストアでは保存間隔 + 1.5 秒、redis では 1.5 秒。永続化自体は運用者の設定によります)も添えられます。hooks は、そのウィンドウが過ぎるまでイベントをローカルのスプールに残し、別のリクエストなしで後続の呼び出し時に削除します。その時点までに `bootId` が変わっていれば、サーバーは再起動しているので、hook は同じ `eventId` でそのイベントを再送します。ディスクに到達済みのイベントが二重に保存されることはありません。サーバー自身も、起動時と各リトライ間隔ごとにそうしたイベントを送信するため、その後に hook が一切動かなくても再起動で何かが失われることはありません。古い hooks はこの追加フィールドを無視し、古いサーバーに対する新しい hooks は、以前と同様 `2xx` でイベントを破棄します。

サーバーがダウンしている、時間内に応答しない、または 5xx を返す場合、hook はその観測をローカルのスプールファイル `<data dir>/capture-spool/<host>-<port>.jsonl` に追記します(フォルダは `AGENTMEMORY_CAPTURE_SPOOL_DIR` で上書きできます)。このファイルはあなたのユーザーに非公開(モード 600)で、シークレットはサーバーが行うのと同じ方法でマスクされ、最大 `AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES`(5 MiB)まで保持し、`AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS`(168)より古いエントリを捨てます。満杯になると、新しいエントリは破棄されカウントされ、`/agentmemory/status` がそれを報告します。サーバーが健全なときは、hook はその時間制限内でそのまま exit 0 し、リクエストは追加されません。スプールは次回起動時、およびサーバーに再び到達できた最初の hook によって、エージェントを待たせないバックグラウンドプロセスで送信されます。イベント id がこれを安全にします: タイムアウト前に到達済みの観測が二重に保存されることはありません。`npx @agentmemory/agentmemory capture` はスプールとサーバーの受信箱を表示し、`--drain` はスプールを今すぐ送信し、`GET /agentmemory/capture` は同じ内容を JSON で返します。スプールをオフにするには `AGENTMEMORY_CAPTURE_SPOOL=false` を設定してください。

**グラフの来歴のコンパクション。** 旧来の来歴データのコンパクションは、旧来のスコープ全体を読み取るため、起動時には延期されます。`/agentmemory/status` は `deferred`、`AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false` の場合は `off` を返します。メンテナンス中に以下の手動コンパクションを実行してください。検索インデックスの移行は別の操作です。[メンテナンスガイド](../docs/reliability/graph-index-migration.md)に従って `agentmemory graph-index migrate --allow-legacy-scan` を使用してください。

手動で実行するには `POST /agentmemory/graph/compact` を呼び出してください。すべてのノードとエッジを列挙するのではなく、名前とエッジキーのインデックスを走査するため、再実行しても安全です。id を切り詰めたときは `graph_compact` の監査エントリを書き込みます。

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" -d '{}'
```

大規模なストアで、あるいは呼び出しが 504 を返す場合は、分割して実行してください。`scope`(`nodes`、`edges`、または `history`)、`offset`、`limit` を送り、返ってきた `nextOffset` が `null` になるまで呼び出しを繰り返します。これを `nodes`、`edges`、`history` それぞれについて行い、最後に `{"scope":"snapshot"}` を 1 回呼んで終えてください。分割実行はキャッシュされたスナップショットには触れないためです。

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" -d '{"scope":"nodes","offset":0,"limit":200}'
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Authorization: Bearer <secret>" -H "Content-Type: application/json" -d '{"scope":"snapshot"}'
```

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Development" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 4,000+ tests
npm run test:integration  # API tests (requires running services)
```

必要環境は[インストール](#install)、開発とリリースの規則は [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="License" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
