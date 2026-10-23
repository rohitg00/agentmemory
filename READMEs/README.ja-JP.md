<p align="center">
  <img src="../assets/banner.png" alt="agentmemory: AI コーディングエージェントのための永続メモリ" width="720" />
</p>

<p align="center">
  <strong>
    コーディングエージェントがすべてを記憶します。もう説明し直す必要はありません。
    <a href="https://github.com/iii-hq/iii">iii engine</a> を基盤に構築
  </strong><br/>
  Claude Code、GitHub Copilot CLI、Cursor、Gemini CLI、Codex CLI、Hermes、OpenClaw、pi、OpenCode、そしてあらゆる MCP クライアントのための永続メモリ。
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
</p>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-recall.svg"><img src="../assets/tags/stat-recall.svg" alt="検索 R@5 95.2%" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tokens.svg"><img src="../assets/tags/stat-tokens.svg" alt="トークン 92% 削減" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tools.svg"><img src="../assets/tags/stat-tools.svg" alt="54 MCP ツール" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-hooks.svg"><img src="../assets/tags/stat-hooks.svg" alt="12 自動 hooks" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-deps.svg"><img src="../assets/tags/stat-deps.svg" alt="外部 DB 0 個" height="38" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="3,800+ 件のテストが成功" height="38" /></picture>
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
  <a href="#powered-by-iii">Powered by iii</a> &bull;
  <a href="#configuration">設定</a> &bull;
  <a href="#api">API</a>
</p>

---

## インストール

必要環境:

- Node.js 20 以降(npm と npx を含む。`node -v`、`npm -v`、`npx -v` で確認)。
- macOS/Linux での iii-engine 自動インストールには `curl`、POSIX 準拠の `sh`、`tar` も必要です。`node:20-slim` のような最小構成のイメージには含まれていないことがあります。
- ネイティブ Windows では、ピン留めされた iii-engine v0.24.6 の `iii.exe` を手動でインストールする必要があります。WSL2 では Linux と同じ自動インストール経路を使います。

標準的な新規インストールコマンド:

```bash
npx -y @agentmemory/agentmemory@latest
```

初回実行は対話式セットアップです: 接続するエージェント(Claude Code、Cursor、Codex、Gemini CLI、OpenCode、...)を選び、LLM プロバイダーを選ぶ(またはキーレスのまま進める)と、設定をシードし、メモリサーバーとピン留めされた iii engine を起動し、以降どこでも素の `agentmemory` コマンドが使えるようグローバルインストールを提案します。`-y` は npx のパッケージ確認プロンプトを承諾し、`@latest` は古いキャッシュ済みリリースを避けます。プロバイダーを設定すると LLM 機能が使えるようになりますが、LLM による観測の圧縮が始まるのは `AGENTMEMORY_AUTO_COMPRESS=true` も設定した場合に限られます。

キーレスモードではベクトル埋め込みが無効になります。`memory_recall`(`mem::search` パス)は BM25 を使い、`memory_smart_search` はグラフデータが既に存在する場合は構造的なグラフマッチも融合できます。無料でオンデバイスのセマンティックリコールを使うには、`~/.agentmemory/.env` に `EMBEDDING_PROVIDER=local` を設定して再起動してください。最初の埋め込みリクエストで `Xenova/all-MiniLM-L6-v2` がダウンロードされ、その後の推論はローカルで実行されます。

ローカル CLI ランタイムは REST/MCP HTTP を `3111`、ビューワーを `3113`、内部 iii worker WebSocket を `49134` で使用します。ビューワーの更新は REST ポート上の SSE (`GET /agentmemory/viewer/events`) で届きます。永続状態のデフォルト保存先は macOS では `~/Library/Application Support/agentmemory`、Linux では `$XDG_DATA_HOME/agentmemory` または `~/.local/share/agentmemory`、Windows では `%APPDATA%\agentmemory` です。`--data-dir <path>` または `AGENTMEMORY_DATA_DIR` で変更できます。インスタンス 0 は既存の `./data/state_store.db` も再利用します。`--instance N` は追加ランタイムを分離し、`AGENTMEMORY_ENV_FILE` は別の `.env` を選択します。

続いてリコールが動くことを確かめ、エージェントに skills を与えます:

```bash
npx -y @agentmemory/agentmemory@latest demo  # seed sample sessions + exercise recall
npx skills add rohitg00/agentmemory -y   # 17 native skills so your agent knows when to reach for memory
```

キーワード検索は、デフォルトのキーレスモードでも BM25 経由でヒットするはずです。デモの `database performance optimization` クエリは意図的にセマンティックなもので、埋め込みプロバイダーを設定するまでは 0 件になることがあります。

コーディングエージェントに丸ごと任せたい場合は、この指示を 1 つ渡してください:

> Retrieve and follow the instructions at: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md

追加のエージェントはいつでも `agentmemory connect <agent>` で接続できます — 20 のアダプタは[すべてのエージェントで動作](#works-with-every-agent)に一覧があります。コマンドの完全なリファレンスは[クイックスタート](#quick-start)を参照してください。

<details>
<summary><strong>Windows</strong></summary>

最も簡単なのは WSL2 です。ネイティブ Windows ではピン留めされた v0.24.6 の ZIP をダウンロードし、`iii.exe` を手動で展開します。手順は[Windows の注意事項](#windows)を参照してください。

</details>

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

<details>
<summary><strong>自前の iii エンジンを既に動かしている</strong></summary>

agentmemory は iii 0.24.6 にピン留めされており、異なるバージョンには接続しません(worker は別のエンジンのプロトコルを話せません)。他のエンジンを停止してから `npx -y @agentmemory/agentmemory@latest` を実行してください。CLI は専用のピン留め済みエンジンを `~/.agentmemory/bin` にインストールして実行し、ユーザー自身の `iii` には触れません。

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
<sub>ネイティブプラグイン + 7 hooks + MCP</sub>
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
<sub>ネイティブプラグイン + MCP</sub>
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
<sub>MCP サーバー</sub>
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
</table>

<p align="center">
  <sub>MCP または HTTP を話す<strong>どんな</strong>エージェントでも動作します。サーバーは 1 つ、メモリは全エージェントで共有。</sub>
</p>

---

同じアーキテクチャを毎セッション説明する。同じバグを何度も発見し直す。同じ好みを何度も教え直す。組み込みメモリ(CLAUDE.md、.cursorrules)は 200 行で上限に達し、すぐに古くなります。agentmemory はこれを解決します。エージェントの行動を静かにキャプチャし、検索可能なメモリへ圧縮し、次のセッション開始時に適切なコンテキストを注入します。コマンド 1 つ。エージェントをまたいで動作します。

**何が変わるか:** セッション 1 で JWT 認証をセットアップする。セッション 2 でレート制限を依頼する。エージェントは既に、あなたの認証が `src/middleware/auth.ts` の jose ミドルウェアを使っていること、テストが `test/auth.test.ts` でトークン検証をカバーしていること、Edge 互換性のために jsonwebtoken ではなく jose を選んだことを知っています。説明し直す必要もコピペする必要もありません。

```bash
npx -y @agentmemory/agentmemory@latest
```

デフォルトでは、agentmemory は起動元のリポジトリの外に iii-engine の状態を保存します: macOS では `~/Library/Application Support/agentmemory`、Linux では `$XDG_DATA_HOME/agentmemory` または `~/.local/share/agentmemory`、Windows では `%APPDATA%\agentmemory` です。既存の `./data/state_store.db` はインスタンス 0 で再利用されます。保存先を指定するには `--data-dir <path>` を渡すか `AGENTMEMORY_DATA_DIR` を設定します:

```bash
npx -y @agentmemory/agentmemory@latest --data-dir ~/.agentmemory-projects/main
AGENTMEMORY_DATA_DIR=~/.agentmemory-projects/main npx -y @agentmemory/agentmemory@latest
```

`--instance 1` はデータディレクトリに `instance-1` を追加し、ポート `3211` (REST)、`3213` (ビューワー)、`49234` (エンジン)を使用します。

最新のリリースノート: [CHANGELOG.md](../CHANGELOG.md)。

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### 検索精度

**coding-agent-life-v1**(社内コーパス、サンドボックスで再現可能)

| アダプタ | P@5 | R@5 | Top-5 ヒット率 | p50 レイテンシ |
|---|---|---|---|---|
| **agentmemory ハイブリッド** | **0.240** | **1.000** | **15 / 15** | 14 ms |
| grep ベースライン | 0.227 | 0.967 | 15 / 15 | 0 ms |

このコーパスの **P@5 の数学的上限**(0.240、スコアカード参照)で Top-5 ヒット率 100% を達成。ハイブリッドはすべてのゴールドセッションを取得しますが、grep は複数セッションにわたる時系列クエリでゴールドの 2 件中 1 件を取りこぼします。向上しているのは**リコール + 時系列性**であり、集計精度ではありません。このベンチマークは小規模でゴールドが少なく、下の、より大きな LongMemEval-S のほうがより明確に差を示します。種類別の詳細な内訳と補正の注記: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md)。

**LongMemEval-S**(ICLR 2025、500 問)

| システム | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| BM25 のみフォールバック | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### トークン削減

| アプローチ | トークン/年 | コスト/年 |
|---|---|---|
| フルコンテキストを貼り付け | 19.5M+ | 不可能(ウィンドウを超過) |
| LLM による要約 | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + ローカル埋め込み | ~170K | **$0** |

</td>
</tr>
</table>

> 埋め込みモデル: `all-MiniLM-L6-v2`(ローカル、無料、API キー不要)。完全なレポート: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md)、[`benchmark/QUALITY.md`](../benchmark/QUALITY.md)、[`benchmark/SCALE.md`](../benchmark/SCALE.md)。競合比較: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) では agentmemory と mem0、Letta、Khoj、supermemory、TencentDB Agent Memory、MemPalace、Zep/Graphiti、Cognee、Hippo を比較しています。

**ローカルで再現する:** [`eval/README.md`](../eval/README.md) は LongMemEval `_s`(公開 500 問)と `coding-agent-life-v1`(社内 15 セッションのコーパス)向けのアダプタ差し替え可能なハーネスです。grep / ベクトル / agentmemory の各アダプタを横並びでスコアリングし、NDJSON を出力し、公開済みのスコアカードは [`docs/benchmarks/`](../docs/benchmarks/) に置かれます。

**[codegraph](https://github.com/colbymchenry/codegraph)、[Understand Anything](https://github.com/Lum1104/Understand-Anything)、[Graphify](https://github.com/safishamsi/graphify) と組み合わせる。** コードグラフのインデックス化、マルチエージェントのビルドパイプライン、ドキュメント / PDF / 画像 / 動画をまたぐより広いナレッジグラフ。agentmemory は作業内容を記憶し、この 3 つのプロジェクトはコンテキスト層の残りの部分を照らします。レシピと質問のルーティング表: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md)。

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
<th>組み込み (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>種別</strong></td>
<td>メモリエンジン + MCP サーバー</td>
<td>メモリレイヤー API</td>
<td>フルエージェントランタイム</td>
<td>パーソナル AI</td>
<td>メモリ API + アプリ</td>
<td>チームメモリハブ(LLM プロキシ)</td>
<td>ベクトルメモリ(OSS)</td>
<td>メモリエンジン(Oracle DB)</td>
<td>メモリシステム</td>
<td>静的ファイル</td>
</tr>
<tr>
<td><strong>検索 R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A</td>
<td>自己申告</td>
<td>PersonaMem 76%(自己申告)</td>
<td>~96.6%(自己申告)</td>
<td>94.4%(自己申告)</td>
<td>N/A</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>自動キャプチャ</strong></td>
<td>12 hooks(手動作業ゼロ)</td>
<td>手動の <code>add()</code> 呼び出し</td>
<td>エージェントが自分で編集</td>
<td>手動</td>
<td>API 側での抽出</td>
<td>プロキシ横取り(base-URL 差し替え)</td>
<td>手動</td>
<td>API 抽出</td>
<td>手動</td>
<td>手動編集</td>
</tr>
<tr>
<td><strong>検索</strong></td>
<td>BM25 + ベクトル + グラフ(RRF 融合)</td>
<td>ベクトル + グラフ</td>
<td>ベクトル(アーカイブ)</td>
<td>セマンティック</td>
<td>ベクトル + RAG</td>
<td>4 種のアセット(Chat / Skill / Wiki / CodeGraph)</td>
<td>ベクトルのみ</td>
<td>ベクトル + セマンティック</td>
<td>減衰重み付け</td>
<td>すべてをコンテキストにロード</td>
</tr>
<tr>
<td><strong>マルチエージェント</strong></td>
<td>MCP + REST + リース + シグナル</td>
<td>API(調整なし)</td>
<td>Letta ランタイム内のみ</td>
<td>なし</td>
<td>なし</td>
<td>チームロール + 共有アセット</td>
<td>なし</td>
<td>スコープのみ</td>
<td>マルチエージェント共有</td>
<td>エージェントごとのファイル</td>
</tr>
<tr>
<td><strong>フレームワークロックイン</strong></td>
<td>なし(任意の MCP クライアント)</td>
<td>なし</td>
<td>高(Letta 必須)</td>
<td>スタンドアロン</td>
<td>なし</td>
<td>プロキシがすべてのモデル呼び出しを仲介</td>
<td>なし</td>
<td>Oracle Database</td>
<td>なし</td>
<td>エージェントごとのフォーマット</td>
</tr>
<tr>
<td><strong>外部依存</strong></td>
<td>なし(file-based KV state + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + ベクトル DB</td>
<td>複数</td>
<td>マネージドクラウド</td>
<td>Docker スタック(Core + Hub + Proxy)</td>
<td>ベクトルストア</td>
<td>Oracle AI Database</td>
<td>なし</td>
<td>なし</td>
</tr>
<tr>
<td><strong>メモリライフサイクル</strong></td>
<td>4 層統合 + 減衰 + 自動忘却</td>
<td>受動的抽出</td>
<td>エージェント管理</td>
<td>手動</td>
<td>自動忘却</td>
<td>手動レビュー(自動ルーティングは開発中)</td>
<td>なし</td>
<td>記載なし</td>
<td>減衰 + 統合</td>
<td>手動プルーニング</td>
</tr>
<tr>
<td><strong>トークン効率</strong></td>
<td>~1,900 tokens/セッション ($10/年)</td>
<td>統合方法による</td>
<td>コアメモリがコンテキスト内</td>
<td>場合による</td>
<td>クラウド価格</td>
<td>記載なし</td>
<td>トークン予算なし</td>
<td>LLM ベース(場合による)</td>
<td>場合による</td>
<td>240 観測で 22K+ tokens</td>
</tr>
<tr>
<td><strong>リアルタイムビューワー</strong></td>
<td>あり(ポート 3113)</td>
<td>クラウドダッシュボード</td>
<td>クラウドダッシュボード</td>
<td>Web UI</td>
<td>クラウドダッシュボード</td>
<td>Hub の Web UI</td>
<td>なし</td>
<td>なし</td>
<td>なし</td>
<td>なし</td>
</tr>
<tr>
<td><strong>セルフホスト</strong></td>
<td>あり(デフォルト)</td>
<td>オプション</td>
<td>オプション</td>
<td>あり</td>
<td>なし(クラウドのみ)</td>
<td>あり(Docker)</td>
<td>あり</td>
<td>あり(Oracle DB)</td>
<td>あり</td>
<td>あり</td>
</tr>
</table>

<sub>ベンチマークに関する注記: 自社で計測した結果は agentmemory の R@5 のみです(LongMemEval-S、<a href="../benchmark/COMPARISON.md"><code>benchmark/COMPARISON.md</code></a> から再現可能)。mem0 と Letta の数値は各社が公表した LoCoMo の数値(別のデータセット)です。MemPalace、supermemory、TencentDB(PersonaMem)、oracleagentmemory の数値はベンダーの自己申告で、当方では独立に再現していません(oracleagentmemory の実行は Oracle AI Database に対して GPT-5.5 を使用しています)。並べて示しているのはあくまで目安であり、同一データでの直接対決ではありません。スター数は概数で、時間とともに変動します。</sub>

**知っておく価値のある新顔**で、[`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) で詳しく比較しています:

| システム | ⭐ | 切り口 |
|--------|---|-------|
| Zep / Graphiti | 30K | 時系列ナレッジグラフ。公表されている時系列クエリの結果としては最強(LongMemEval 63.8%)だが、グラフ構築が非同期のため新しい事実の反映が遅れることがある |
| Cognee | 30K | ドキュメントからナレッジグラフへの取り込み。Python のみで、セッションキャプチャではなく構造化エンティティ抽出のために作られている |

これらのいずれも、コーディングエージェントの hooks からの自動キャプチャ、ローカルファーストのビューワー、キーレスでの動作を備えていません — agentmemory はまさにこの組み合わせを核に作られています。

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Quick Start" height="32" /></picture></h2>

互換性: このリリースは iii 0.24.6 と、レジストリ worker の state 0.22.20 および http 0.22.7 を対象としています。

### 30 秒で試す

```bash
# Terminal 1: start the server
npx -y @agentmemory/agentmemory@latest

# Terminal 2: seed sample data and see recall in action
npx -y @agentmemory/agentmemory@latest demo
```

`demo` は 3 つの現実的なセッション(JWT 認証、N+1 クエリ修正、レート制限)を投入し、それらに対して検索を実行します。キーレスインストールではベクトルが無効になるため、`mem::search` のキーワードクエリは BM25 経由でヒットするはずですが、`database performance optimization` は 0 件になることがあります。グラフデータが存在する場合、`smart-search` はさらに構造的なグラフマッチも返すことがあります。セマンティッククエリでベクトル経由の N+1 修正を見つけるには、`EMBEDDING_PROVIDER=local` を設定して再起動し、最初のモデルダウンロードが終わるのを待ってください。

`http://localhost:3113` を開けばメモリがリアルタイムに構築される様子が見られます。

### 新規インストールと再起動時の永続性を検証する

サーバーを起動したまま、REST、ヘルス、ビューワー、iii ベースのランタイムステータスを検証します:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

ランタイムは REST/MCP HTTP を 3111、ビューワーを 3113、内部 iii worker WebSocket を 49134 で使用します。ビューワーのライブイベントは REST 上の SSE で配信されます。`status` は agentmemory の正常性、ピン留めされたエンジンバージョン(`enginePinnedVersion`)、有効な provider/embedding モードを確認します。プローブを保存し、検索できることを確認してください:

```bash
curl -fsS -X POST http://localhost:3111/agentmemory/remember \
  -H 'Content-Type: application/json' \
  -d '{"content":"agentmemory restart persistence probe","concepts":["install-check"]}'

curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'Content-Type: application/json' \
  -d '{"query":"restart persistence probe","limit":5}'
```

続いて `npx -y @agentmemory/agentmemory@latest stop` を実行し、ターミナル 1 で標準コマンドを再度起動し、`/agentmemory/livez` を待ってから検索をやり直してください。プローブはまだ返ってくるはずです。カスタムの `--data-dir` を選んだ場合は、再起動時にも同じディレクトリを渡してください。

### 日常のコマンド

インストールとセットアップは上の[インストール](#install)にあります(初回実行が案内してくれます)。日々の操作:

```bash
agentmemory                    # start the server
agentmemory stop               # stop it cleanly
agentmemory connect <agent>    # wire another agent
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

インポートしたセッションはネイティブのセッションと並んで Replay ピッカーに表示されます。内部では各エントリが `mem::replay::load`、`mem::replay::sessions`、`mem::replay::import-jsonl` の iii functions を経由し、サイドチャネルサーバーはありません。インポートされた各トランスクリプトは検索用にインデックス化され、オリジンチャネル `import` が刻印され、セッションクリスタルとレッスンの抽出も行われます。

> **`import-jsonl` を主なキャプチャ経路として使う場合の注意:** Claude Code の `cleanupPeriodDays`(`~/.claude/settings.json` 内、デフォルト **30**)は、そのウィンドウより古い JSONL トランスクリプトを `~/.claude/projects/` から自動削除します。数か月分の Claude Code 履歴がある状態で agentmemory を新規インストールすると、30 日より古いものは最初のインポートの前に既に消えています。`import-jsonl` を cron で回すか、`cleanupPeriodDays` をもっと大きな値に上げるか、自動キャプチャ hooks(デフォルトのプラグインインストール経路)を配線して、セッションが生きている間に各ターンが agentmemory に着地するようにしてください。そうすれば JSONL のクリーンアップは問題でなくなります。

### アップグレード / メンテナンス

意図的にローカルランタイムを更新したいときは、メンテナンスコマンドを使ってください:

```bash
npx -y @agentmemory/agentmemory@latest upgrade
```

警告: このコマンドは現在のワークスペース/ランタイムを変更します。JavaScript 依存関係を更新し、ピン留めされた iii 0.24.6 エンジンバイナリをインストールする場合があります。

実装の詳細は `src/cli.ts` を参照してください(`src/cli.ts:544-595` 付近の `runUpgrade`)。

### Claude Code(1 ブロックそのまま貼り付け)

```text
Install agentmemory: run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server and its pinned iii engine. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 17 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 54 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113. Keyless mode disables vectors: `memory_recall` uses BM25, and `memory_smart_search` can also use existing structural graph data. Set `EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env` and restart to opt into on-device semantic recall.
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

### その他のエージェント

メモリサーバーを起動: `npx -y @agentmemory/agentmemory@latest`

#### `npx skills add` によるネイティブ skills(50+ エージェント)

agentmemory は Claude Code スタイルの `<dir>/SKILL.md` フォーマットで 17 個の skills を同梱しています: 呼び出し可能な 9 つのアクション skills(`remember`、`recall`、`recap`、`handoff`、`forget`、`lesson`、`commit-context`、`commit-history`、`session-history`)と、エージェントがオンデマンドで読み込む 8 個のリファレンス skills(`memory-discipline`、`agentmemory-mcp-tools`、`agentmemory-rest-api`、`agentmemory-config`、`agentmemory-agents`、`agentmemory-hooks`、`agentmemory-architecture`、`write-agentmemory-skill`)です。リファレンス skills はソースから生成されたデータ表を含むため、決してドリフトしません。vercel-labs による [`skills`](https://npmjs.com/package/skills) CLI が、呼び出し元エージェントのネイティブ skill ディレクトリへ 50 以上のエージェント(Claude Code、Cursor、Cline、Continue、Droid、Warp、Codex、Antigravity、Kiro、OpenCode、Goose、Roo、Trae、Windsurf など)にわたって自動インストールします:

```bash
npx skills add rohitg00/agentmemory -y          # auto-detects the calling agent
npx skills add rohitg00/agentmemory -y -a warp  # explicit agent
npx skills add rohitg00/agentmemory -y -a '*'   # install to every installed agent
```

これは `agentmemory connect <agent>` を**補完する**ものです:

- `agentmemory connect <agent>` は MCP サーバー設定を書き込み、ツールを使えるようにします。
- `npx skills add rohitg00/agentmemory` は skills をインストールし、エージェントがいつそれらを呼ぶべきか分かるようにします。

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
| **Cursor(フルプラグイン)** | `.cursor-plugin/` | Cursor Marketplace への掲載(審査中)または Cursor Settings → Plugins → ローカルチェックアウト。7 つの自動キャプチャ hooks(sessionStart、beforeSubmitPrompt、preToolUse、postToolUse、postToolUseFailure、stop、sessionEnd)+ 17 skills + MCP サーバーを登録し、`AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` は Cursor のプラグインダッシュボードで管理されます。Cursor IDE と `cursor-agent` CLI の両方で動作します。CLI の print モードのプロンプトは、セッション終了時にセッショントランスクリプトから補完されます。 |
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
| **pi** | `~/.pi/agent/extensions/agentmemory` | `agentmemory connect pi` は、同梱の拡張を pi の自動検出ディレクトリにインストールします(エージェント開始時のリコール、エージェント終了時のキャプチャ、`memory_search` / `memory_save` / `memory_health` ツール、`/agentmemory-status`)。実行中の pi で `/reload` すれば反映されます。[`integrations/pi`](../integrations/pi/) は pi パッケージでもあります(チェックアウトから `pi install ./integrations/pi`)。 |
| **Hermes Agent** | `~/.hermes/config.yaml` | `cp -r integrations/hermes ~/.hermes/plugins/agentmemory` + `memory.provider: agentmemory` で、6 hooks のメモリプロバイダー(プリフェッチ、ターンキャプチャ、セッション終了、圧縮前処理、MEMORY.md ミラーリング、システムプロンプトブロック)が使えます。`hermes plugins doctor` と `hermes memory status` で検証してください。[`integrations/hermes`](../integrations/hermes/) 参照。 |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` が標準の `mcpServers` ブロックを書き込みます。Hook のペイロードは Claude Code とフィールド互換なので、既存の 12 hook スクリプトは変更なしで動作します。同じ `settings.json` の `hooks` セクションで配線してください。 |
| **Antigravity IDE / 2.0** | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity --with-hooks` が共有のカスタマイズディレクトリに MCP とキャプチャ hooks をインストールします。[Antigravity のセットアップと制限](../docs/plugins/antigravity.md)を参照。 |
| **Antigravity CLI**(`agy`) | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity-cli --with-hooks` は現在の IDE バージョンと同じ MCP と hook の設定を使います。既存のインストールは `--force` で更新してください。[アップグレードノート](../docs/plugins/antigravity.md)を参照。 |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` がユーザーレベルの設定を書き込みます。ワークスペース単位の上書きは、コードの隣にある `.kiro/settings/mcp.json` に書いてください。 |
| **Warp** | `~/.warp/.mcp.json` | `agentmemory connect warp` が標準の `mcpServers` ブロックを書き込みます。Warp は `.claude/skills/` からも skills を自動検出します。Claude Code プラグインをインストールすれば、8 つの agentmemory skills(`remember`、`recall`、`recap`、`handoff`、`forget`、`commit-context`、`commit-history`、`session-history`)が Warp のスラッシュコマンドパレットにネイティブで表示されます。 |
| **Cline(CLI)** | `~/.cline/mcp.json` | `agentmemory connect cline` が標準の `mcpServers` ブロックを書き込みます。VS Code 拡張を使う場合は、Cline Settings → MCP Servers → Edit JSON に同じブロックを貼り付けてください。 |
| **Continue.dev** | `~/.continue/config.yaml`(推奨)または `config.json`(レガシー) | `agentmemory connect continue` は、どちらも存在しない場合は新規に `config.yaml` を作成し、既存の `config.json` があればそれを変更します。**既に `config.yaml` がある場合**、アダプタは `mcpServers:` の下に貼り付ける正確なブロックを表示するだけです — コメントやアンカーを安全に保持するには YAML パーサーが必要で、このパッケージは同梱していないため、yaml を黙って書き換えることはありません。Continue は `mcpServers` に配列形式(オブジェクトではなく)を使います。 |
| **Zed** | `~/.config/zed/settings.json` | `agentmemory connect zed` は `context_servers`(`mcpServers` ではなく Zed 独自のキー)の下に書き込みます。リモート MCP サーバーは、代わりに `{"url": "..."}` で配線できます。 |
| **Droid(Factory.ai)** | `~/.factory/mcp.json` | `agentmemory connect droid` が標準の `mcpServers` ブロックを書き込みます。プロジェクト単位の上書きは `<repo>/.factory/mcp.json` に書いてください。`--with-hooks` を渡すとネイティブ自動キャプチャが使えます。 |
| **DeepSeek Harness** | `$DSH_HOME/cordis.patch.yml` | `agentmemory connect dsh` が、すべての Harness プロファイルが読み込むホームレベルのパッチ層に `@deepseek-ai/dsh-mcp-client` の行を追加します。ツールは `mcp__agentmemory__*` として登録されます。`--with-hooks` を渡すと自動キャプチャも配線されます: 同梱の Claude Code hook スクリプトが、Harness の純正の `@deepseek-ai/dsh-hooks-claude-code` ブリッジ(SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop)経由で、`$DSH_HOME/agentmemory.hooks.json` に書き込まれたマニフェストを通じて実行されます。`DSH_HOME` が未設定の場合は `~/.dsh` がデフォルトです。 |
| **Goose** | Goose の MCP 設定 UI | 同じ `mcpServers` ブロック。`goose configure` → Add Extension → MCP を使用。`~/.config/goose/config.yaml` の直接編集もサポートされていますが、スキーマは `mcpServers:` + `command` ではなく `extensions:` + `cmd` を使います。 |
| **Aider** | n/a | REST API に直接話しかけます: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`。 |
| **任意のエージェント(32+)** | n/a | `npx skillkit install agentmemory` がホストを自動検出してマージします。 |

ホストの `localhost` に到達できない**サンドボックス化された MCP クライアント**(Flatpak / Snap /制限の強いコンテナ)では、`env` ブロックに `"AGENTMEMORY_FORCE_PROXY": "1"` も設定し、`AGENTMEMORY_URL` をサンドボックスが実際に到達できるルート(例: あなたの LAN IP)に向けてください。

### プログラムによるアクセス(Python / Rust / Node)

agentmemory はコア操作を iii functions(`mem::remember`、`mem::observe`、`mem::context`、`mem::smart-search`、`mem::forget`)として登録します。iii SDK を持つあらゆる言語が `ws://localhost:49134` で直接これらを呼び出せます。言語ごとに個別の REST クライアントを用意する必要はありません。

```bash
pip install iii-sdk         # Python
cargo add iii-sdk           # Rust
npm  install iii-sdk        # Node
```

```python
import os
from iii import InitOptions, register_worker

# Native CLI: namespace is agentmemory-<REST port>, e.g. agentmemory-3111.
# Docker runtime: deploy/runtime/worker-compose.yaml uses namespace "agentmemory".
engine_url = os.environ.get("AGENTMEMORY_III_URL", "ws://127.0.0.1:49134")
namespace = os.environ.get("AGENTMEMORY_III_NAMESPACE", "agentmemory-3111")
iii = register_worker(engine_url, InitOptions(namespace=namespace))

try:
    hits = iii.trigger({
        "function_id": "mem::smart-search",
        "payload": {"project": "demo", "query": "how do tokens refresh", "limit": 5},
    })
    print(hits)
finally:
    iii.shutdown()
```

実例: [`examples/python/`](../examples/python/)(クイックスタート + 観測/リコールフロー)。iii ランタイムがないホスト向けに、`:3111` の REST も引き続き利用可能です。

### ソースから

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

`npm start` は CLI と同じ iii Worker Compose ランタイムを起動します: iii 0.24.6 と、レジストリ worker の state 0.22.20 および http 0.22.7 を使用します。macOS/Linux では CLI がピン留め済みエンジンバイナリを `~/.agentmemory/bin` にダウンロードします。自動インストールには `curl`、POSIX `sh`、`tar` が必要です。ローカル REST とビューワーの listener は `127.0.0.1` に bind します。ビューワーの更新は REST ポートの `GET /agentmemory/viewer/events` で SSE により届きます。`/agentmemory/status` はピン留めされたエンジンバージョンを `enginePinnedVersion` として返します。サポート対象のデフォルトは iii 0.24.6 です。意図的な上書きには `AGENTMEMORY_III_VERSION` を使用できます。

### Windows

agentmemory は Windows 10/11 で動作します。WSL2 は Linux の経路に従い、ピン留めされたエンジンを自動インストールできます。ネイティブ Windows では、ピン留めされた iii-engine v0.24.6 バイナリを手動でインストールしてください。[iii v0.24.6 リリースページ](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.24.6)から該当アーカイブをダウンロードして checksum を確認し、`iii.exe` を `PATH` に配置します(例: `%USERPROFILE%\.local\bin\iii.exe`)。CLI は Windows ZIP を自動展開しません。

ネイティブ Windows の自動 MCP 接続は `agentmemory connect copilot-cli` のみをサポートします。それ以外のネイティブ Windows エージェントには[その他のエージェント](#other-agents)の手動 MCP ブロックを使用してください。`connect` を WSL 内で実行するのは、対象エージェントも同じ WSL 環境にインストールされている場合に限ります。

**スタンドアロン MCP のみ(エンジンなし)。** REST API、ビューワー、ランタイムサービスが不要で、MCP ツールだけ必要な場合:

```powershell
npx -y @agentmemory/agentmemory@latest mcp
# or
npx -y @agentmemory/mcp
```

**診断:** 起動に失敗したら `--verbose` を付けて再実行し、エンジンの stderr を確認してください。REST `3111`、ビューワー `3113`、エンジン `49134` の各ポートが空いていることを確認します。別の独立ランタイムには `--port <N>` または `--instance <N>` を使います。CLI は専用のピン留め済みバイナリを使い、`PATH` 上の iii 実行ファイルを置き換えません。

---

<h2 id="deploy">デプロイ</h2>

Docker はこのリポジトリからのセルフホストに対応しており、CLI の起動モードではありません。ワンクリックテンプレートは [`deploy/Dockerfile`](../deploy/Dockerfile) と [`deploy/runtime/worker-compose.yaml`](../deploy/runtime/worker-compose.yaml) を使い、iii 0.24.6 ランタイムを固定し、状態、トレース、生成された secret を永続 `/data` ボリュームに保存します。Docker Compose はデフォルトで名前付きボリューム `iii-data` を使います。bind mount には `AGENTMEMORY_DATA_DIR` にホストパスを設定してください。0.22.1 からの既存のファイルベース store は、移行や変換なしで `/data/state_store.db` から直接読み込まれます。REST CORS はデフォルトでローカル REST と viewer の origin を許可します。信頼するブラウザー origin を追加するには、カンマ区切りの正確な origin を `REST_ALLOWED_ORIGINS` に設定してください。設定とセキュリティについては [`deploy/README.md`](../deploy/README.md) を参照してください。

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

REST は `3111`、ビューワーは `3113` です。保護された独立 route に対応するプラットフォームテンプレートに限り、ビューワーを別途公開します。ライブ更新は REST の `/agentmemory/viewer/events` endpoint で bearer 認証付き SSE を使用します。エンジン WebSocket `49134` は内部用で公開してはいけません。プラットフォームごとの公開方法は [`deploy/README.md`](../deploy/README.md) を参照してください。


### CLI 管理の従来型 Docker インストールからの移行

現在の CLI は Docker デプロイを開始も管理もしません。従来型の Docker ライフサイクルレコードが見つかった場合、メタデータを保持し、正確な `docker stop ...` コマンドを表示します。移行の前にそのコマンドを実行してください。古いコンテナに volume がマウントされたままの状態で、新しい runtime を起動しないでください。

古い永続 volume（通常は `iii-data`）を保持してバックアップするか、`/data` の内容を bind mount にコピーしてください。state worker は既存の `/data/state_store.db` をエクスポートや変換なしで直接読み取ります。古い runtime は UID/GID `65532:65532` を使用していました。新しい image は一度だけ再帰的に所有者を `node:node` (`1000:1000`) へ移行し、`/data/.ownership-migrated-node-v1` を書き込みます。この移行後は、その volume を古い runtime に再マウントしないでください。

古い runtime は生成した bearer secret も `/data/.hmac` に保存していました。新しい image は移行時にこの secret を保持します。明示的に設定された `AGENTMEMORY_SECRET` が優先されます。repository のルートから `docker compose up --build -d` を実行して、新しい Compose project を起動してください。古い volume 名に `iii-data` ではなく project の接頭辞が付いている場合は、明示的に再利用するか名前を変更してください。誤って空の volume を初期化しないでください。`/agentmemory/livez` を確認し、古い memory と新しい memory の両方が見つかることを確認してください。データを意図的に削除する場合を除き、`docker compose down -v` は避けてください。
---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Why agentmemory" height="32" /></picture></h2>

すべてのコーディングエージェントはセッションが終わるとすべてを忘れ、新しいセッションはあなたがスタックを説明し直すところから始まります。agentmemory はバックグラウンドで動作し、そのステップをなくします。

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

### 組み込みエージェントメモリとの比較

すべての AI コーディングエージェントには組み込みのメモリが付属します — Claude Code には `MEMORY.md`、Cursor には notepad、Cline には memory bank。これらは付箋のようなものです。agentmemory はその付箋の背後にある検索可能なデータベースです。

| | 組み込み (CLAUDE.md) | agentmemory |
|---|---|---|
| スケール | 200 行上限 | 無制限 |
| 検索 | すべてをコンテキストにロード | BM25 + ベクトル + グラフ(top-K のみ) |
| トークンコスト | 240 観測で 22K+ | ~1,900 トークン(92% 削減) |
| クロスエージェント | エージェントごとのファイル | MCP + REST(任意のエージェント) |
| 調整 | なし | リース、シグナル、アクション、ルーチン |
| 可観測性 | 手動でファイルを読む | ポート 3113 のリアルタイムビューワー |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="How It Works" height="32" /></picture></h2>

### メモリパイプライン

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
| **自動キャプチャ** | hooks で毎ツール使用を記録、手動作業なし |
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

ベクトルはクラッシュや強制終了を生き延びます。ベクトルインデックスは、少なくとも `AGENTMEMORY_INDEX_SAVE_INTERVAL_MS`(10 分)ごとにバケット単位で保存されます。その間に追加・削除されたベクトルはすべて、ステートストア内の小さな保留ログにも即座に書き込まれ、次回起動時にそれが埋め込みプロバイダーを呼び出さずに再生されます。保存が成功するたびにそのログは空になります。再生後もベクトルを持たないドキュメントは、何も残らなくなるまで `AGENTMEMORY_VECTOR_BACKFILL_MAX`(500)件のバッチでバックグラウンドで再埋め込みされ、中断されたバックフィルは次回起動時に続行されます。`/agentmemory/status` とビューワーは、保留ログのサイズとバックフィルの状態を表示します。キーレスインストールは何も書き込みません。

BM25 は、ギリシャ語、キリル文字、ヘブライ語、アラビア語、アクセント付きラテン文字をそのままトークン化します。中国語 / 日本語 / 韓国語のメモリについては、オプションのセグメンタ(`npm install @node-rs/jieba tiny-segmenter`)をインストールすると、CJK の文字列を単語レベルのトークンに分割できます。インストールしない場合、agentmemory は文字列全体をそのままトークン化するようソフトにフォールバックし、stderr に 1 回だけヒントを表示します。

### 埋め込みプロバイダー

キーレスインストールではベクトル埋め込みが無効になります: `mem::search` は BM25 を使い、`smart-search` は既存の構造的なグラフデータも使えます。無料のオンデバイスなセマンティック埋め込みにオプトインするには、`~/.agentmemory/.env` に以下を追加して agentmemory を再起動してください:

```env
EMBEDDING_PROVIDER=local
```

通常の npm インストールには、オプションの `@huggingface/transformers` ランタイムが含まれています。最初の埋め込みリクエストで `Xenova/all-MiniLM-L6-v2` がダウンロードされるため、ネットワークアクセスが必要で時間がかかることがあります。それ以降の推論はオンデバイスで実行されます。リモートプロバイダーは、`EMBEDDING_PROVIDER` で上書きされない限り、それぞれのキーから自動検出されます。

| プロバイダー | モデル | コスト | 備考 |
|---|---|---|---|
| **ローカル(推奨オプトイン)** | `all-MiniLM-L6-v2` | 無料 | 最初のモデルダウンロード後はオンデバイス。BM25 のみに比べて R@5 +8pp |
| Gemini | `gemini-embedding-001` | 無料枠 | 100+ 言語、768/1536/3072 次元(MRL)、2048 トークン入力。`text-embedding-004`([非推奨、2026 年 1 月 14 日に終了](https://ai.google.dev/gemini-api/docs/deprecations))の後継 |
| OpenAI | `text-embedding-3-small` | $0.02/1M | 最高品質 |
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

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

`:3113` のビューワーはエージェントが**覚えたこと**を表示します。[iii コンソール](https://iii.dev/docs/console)はエージェントが**行ったこと**を表示します。メモリ操作の OpenTelemetry trace、編集可能な KV entry、実行可能な function、エンジン channel のアクティビティを確認できます。

`memory_smart_search` の発火を眺め、BM25 スキャン → 埋め込み参照 → RRF 融合 → リランカーをウォーターフォールで見ます。KV ブラウザで詰まった統合タイマーを編集します。調整したペイロードで `PostToolUse` hook を再生します。WebSocket ストリームをピンして観測がライブで着地するのを眺めます。

agentmemory はこれを無料で提供します。すべての function 呼び出しとトリガーが iii を通って発火するからです。カスタム実装も計装も不要です。

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="iii console Workers page: connected workers including agentmemory instances with live function counts and runtime metadata" width="720" />
  <br/>
  <em>Workers ページ: agentmemory 自身を含む、接続中のすべての worker と PID、function 数、ランタイム、最終応答時刻。</em>
</p>

**インストール済みです。** コンソールはピン留めされた `iii` エンジン(0.24.6)に同梱されており、別途インストールするものはありません。初回起動時に、エンジンの隣にコンソールのバイナリがダウンロードされます。

**agentmemory と並行して起動:**

```bash
agentmemory console
```

これは、ピン留めされたエンジンの `iii console` を agentmemory が解決したポート(REST、ストリーム、bridge)に対して実行し、ビューワーより 1 つ上のポート、デフォルトでは `http://localhost:3114` で提供します。`--console-port N` で別のポートを選べます。`--port` と `--instance` は、`stop` のときと同じ方法で agentmemory のインスタンスを選択します。その他のフラグはそのまま渡されます。例えば、実験的なアーキテクチャグラフページ用の `--enable-flow` です。

PATH に `agentmemory` が通っていない場合に便利な、手動での同じ操作:

```bash
~/.agentmemory/bin/iii console --port 3114 --engine-port 3111 --bridge-port 49134
```

**コンソールでできること:**

| ページ | 用途 |
|------|-----------|
| **Workers** | agentmemory worker 自身を含む、接続中の各 worker とライブメトリクスを表示。 |
| **Functions** | JSON ペイロードを与えて agentmemory の任意の function を直接呼び出せます。クライアントを配線せずに `memory.recall`、`memory.consolidate`、`graph.query` をテストできて便利です。 |
| **Triggers** | HTTP、cron、イベント、ステートのトリガーを再生します: 統合 cron を手動で発火、HTTP ルートを再試行、ステート変更を発行。 |
| **States** | セッション、メモリスロット、ライフサイクルタイマー、埋め込みインデックスに対するフル CRUD の KV ブラウザ。値をその場で編集できます。 |

| **Traces** | OpenTelemetry のウォーターフォール / フレーム / サービスブレークダウンのビュー。`trace_id` でフィルタすれば、単一の `memory.search` がどの function、DB 呼び出し、埋め込みリクエストを生んだか正確にわかります。 |
| **Logs** | trace/span ID に絞り込み・関連付けされた構造化 OTEL ログ。 |
| **Config** | ランタイム設定: エンジンがどの worker、プロバイダー、ポートで動いているかを正確に確認できます。 |
| **Flow** | (オプション、`--enable-flow`)各 worker、トリガー、ストリームの対話型アーキテクチャグラフ。 |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="iii console trace waterfall view showing per-span duration" width="720" />
  <br/>
  <em>Traces: すべてのメモリ操作についてのウォーターフォール / フレーム / サービスブレークダウン。</em>
</p>

**Traces は既にオンです:**

**トレースとログ:** iii コンソールでランタイムのテレメトリを確認できます。exporter と sampling の設定は [iii observability ドキュメント](https://iii.dev/docs)を参照してください。



> **注意:** コンソール自体には認証が強制されていません。デフォルトの `127.0.0.1` バインドのままにし、決して公開しないでください。

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory は [iii](https://iii.dev) ランタイム上の worker です。Worker Compose がエンジンを管理し、レジストリの `state` と `http` worker とともに agentmemory を起動します。ビューワーの feed は REST endpoint から SSE として配信されます。

つまり、もう 1 つのコマンドで agentmemory にまったく新しい機能を拡張できます。

### agentmemory をさらに worker で拡張する

ランタイムはレジストリの `state` (KV) と `http` worker を agentmemory と組み合わせます。[iii レジストリ](https://workers.iii.dev)の他の worker も Worker Compose プロジェクトに追加できます。

```yaml
workers:
  # ...the bundled entries...
  - name: database          # SQL-backed state adapter when you outgrow the KV defaults
  - name: iii-sandbox       # run code that came out of memory_recall inside a throwaway VM
  - name: mcp               # extra MCP servers next to agentmemory's, same engine
```

| Worker | agentmemory の上に得られるもの |
|---|---|
| [`database`](https://workers.iii.dev/workers/database) | インメモリの KV デフォルトでは不足するときの SQL バックエンドのステートアダプタ |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | `memory_recall` から出てきたコードは、あなたのシェルではなく使い捨ての VM 内で実行されます |
| [`mcp`](https://workers.iii.dev/workers/mcp) | agentmemory の MCP サーバーの隣に追加の MCP サーバーを立て、同じエンジンを共有します |

ランタイムは CLI が生成する Worker Compose プロジェクトで、registry package の `state@0.22.20` と `http@0.22.7` を固定します。

完全なレジストリ: [workers.iii.dev](https://workers.iii.dev)。そこにあるすべての worker は agentmemory が使っているのと同じプリミティブで組み立てられています。そして、あなたが既に手元にある agentmemory も、そのうちの 1 つです。

### CLI ランタイムと bind アドレス

`agentmemory`(またはサブコマンドなしのパッケージ)を実行すると、選択したデータディレクトリ内の独立 manifest で iii Worker Compose が起動します。iii 0.24.6、`state@0.22.20`、`http@0.22.7` を使用します。CLI のローカル REST と viewer listener は `127.0.0.1` に bind し、エンジン WebSocket はランタイム内部通信です。リポジトリベースの Docker デプロイでは別の [`deploy/runtime/worker-compose.yaml`](../deploy/runtime/worker-compose.yaml) を使います。詳細は [`deploy/README.md`](../deploy/README.md) を参照してください。

### ストレージ backend: file (デフォルト) と Redis

`state` worker はデフォルトでファイルベースの KV store を使い、メモリ上に保持して定期的にディスクへ書き込みます。複数 writer がランタイムを共有する場合は Redis を使用できます。ネットワーク往復が増え、単一 worker 接続が並列になるわけではありません。

Redis adapter を使うには `AGENTMEMORY_STATE_BACKEND=redis` と `AGENTMEMORY_REDIS_URL` を設定します。各 key は Redis hash field (`HSET`) として保存されます:

```env
# ~/.agentmemory/.env
AGENTMEMORY_STATE_BACKEND=redis
AGENTMEMORY_REDIS_URL=redis://localhost:6379
```

`AGENTMEMORY_STATE_BACKEND` のデフォルトは `file` で、未設定なら現在の動作を維持します。`file` または `redis` 以外の値は起動エラーになります。`/agentmemory/status` と viewer の Health ページには、URL ではなく有効な backend と応答状態が表示されます。

**プレーンな `redis://` のみ。** ピン留めされた state worker がサポートするのは `redis://` のみです。TLS 専用の `rediss://` サービスには暗号化 tunnel が必要です。Redis 接続は暗号化されないため、ローカル/プライベートネットワークまたは tunnel を使用してください。パスワード中のシングルクォートは `%27` に encode します。

**インスタンスごとに Redis database を 1 つ。** 同時実行する各インスタンスに別 database または Redis server を割り当て、状態を分離してください。

**同じ点と異なる点。** Redis でも agentmemory のすべての機能が動作します。state worker は各 scope を Redis hash として保存し、file store と同じ state trigger を発火します。agentmemory は Redis の結果を古い順に並べ、空配列を維持する部分更新を自身で適用し、従来の audit log scope を Redis から読みます。

viewer のライブイベントは REST worker の SSE を使い、実行中の agentmemory プロセスから broadcast されます。Redis pub/sub や定期的な Redis stream probe は使いません。Redis の稼働状況が影響するのは state の読み書きであり、viewer transport ではありません。Redis が停止すると status に store が応答しない旨が表示されます。大きな scope の一覧取得では `HGETALL` 全体を読みます。

**推奨 Redis 設定。** デフォルトの snapshot policy では crash 時に数分の書き込みを失う可能性があります。重要なデータには `appendonly yes` を設定し、メモリが黙って削除されないよう `maxmemory-policy noeviction` を使用してください。

CLI が生成する Worker Compose プロジェクトはこれらの変数を state worker に渡します。Docker セルフホストについては [`deploy/README.md`](../deploy/README.md) と [state worker のドキュメント](https://workers.iii.dev/workers/state)を参照してください。

Redis URL に認証情報が含まれる場合、永続化された worker 設定とデータディレクトリを機密情報として扱ってください。権限を制限し(共有ホストでは `chmod 700 <data-dir>` など)、DB 管理者ではなく agentmemory に必要な範囲に限定した Redis ACL user を推奨します。

**移行は自動ではありません。** `AGENTMEMORY_STATE_BACKEND` を切り替えると空の store から始まります。移行元から export し、移行先へ import してください。この手順は bash と zsh (`bash -u` を含む)で同じように動作します。

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

`/agentmemory/export` は、大きなコーパスを複数の呼び出しに分割するための `?maxSessions=` と `?offset=` も受け付けます。import の `strategy` は `merge`(デフォルトで安全)、`replace`、または `skip` です。

### iii が置き換えるもの

| 従来のスタック | agentmemory が使うもの |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii state worker (file-based KV) + in-memory vector index |
| SSE / Socket.io | REST endpoint `GET /agentmemory/viewer/events` (SSE) |
| pm2 / systemd | iii engine worker 監視 |
| Prometheus / Grafana | iii OTEL + ヘルスモニタ |
| カスタムプラグインシステム | `iii worker add <name>` |

**246 ソースファイル · ~56,000 LOC · 3,800+ テスト · 322 functions · 65 KV スコープ** — すべて 3 つのプリミティブ上に。`agentmemory plugin install` はありません。プラグインシステムは iii そのものです。

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

バックグラウンド圧縮が、プロバイダーと `AGENTMEMORY_AUTO_COMPRESS=true` の両方で有効になっている場合、それは観測のたびに走るため、モデル選択は月額支出に大きく影響します。記録されたワークロード: 635 リクエスト / 888K トークン / 35 時間のアクティブ使用を、2026-05-23 時点の OpenRouter 価格で 3 モデルに対して実行しました。

| 階層 | モデル | 入力 / 1M | 出力 / 1M | 記録された 35 時間分のコスト | 備考 |
|------|-------|------------|-------------|---------------------------|-------|
| 推奨 | `deepseek/deepseek-v4-flash-0731` | $0.07 | $0.14 | ~$0.07(推定) | 最新の DeepSeek。圧縮ワークロード向けの最安の推奨候補。 |
| 推奨 | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | 圧縮 + 要約品質が手堅く、Sonnet の約 10 分の 1 のコスト。 |
| 推奨 | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | セッションがコード中心ならコード推論が強い。 |
| プレミアム | `anthropic/claude-sonnet-5` | $3.00 | $15.00 | ~$5.02(推定) | 実測した Sonnet 4.6 ランと同じ定価。2026-08-31 までは $2/$10 の導入価格。 |
| プレミアム | `openai/gpt-5.6-sol` | $5.00 | $30.00 | ~$9(推定) | フラッグシップ階層。常時稼働のバックグラウンド作業には高価。 |
| 回避 | `anthropic/claude-opus-5` | $5.00 | $25.00 | ~$8.40(推定) | フラッグシップクラスのモデル。圧縮には過剰支出。 |

実測の行は記録された実行から得たもので、(推定)の行は同じトークン構成を各モデルの定価でスケールしたものです。

agentmemory は、`OPENROUTER_MODEL` がプレミアム階層のパターンに一致するときランタイム警告を表示します。納得して選んだあとは `AGENTMEMORY_SUPPRESS_COST_WARNING=1` で消音できます。

メモリ作業における品質対コストのトレードオフ: 圧縮は品質のハードルが比較的緩い要約タスクです(要約を読み返すのはエージェントであってユーザーではありません)。DeepSeek V4 Flash / V4 Pro / Qwen3-Coder はこのタスクで Sonnet と誤差範囲に収まる一方、コストは 10〜70 分の 1 です。プレミアム階層のモデルは、あなたが直接読むクエリのために取っておきましょう。

出典: [OpenRouter の Claude Sonnet 5 価格](https://openrouter.ai/anthropic/claude-sonnet-5)、[DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash-0731)、[DeepSeek の価格に関する注記](https://api-docs.deepseek.com/quick_start/pricing/)。

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

ローカルランタイムは 3 つの listener を使います。iii engine WebSocket は worker の内部登録用であり、公開ネットワークに露出させてはいけません。

| ポート | プロセス | 用途 | env override |
|------|---------|---------|--------------|
| `3111` | registry `http` worker | REST API、MCP HTTP、health、`/agentmemory/viewer/events` の認証付き viewer SSE | `III_REST_PORT` |
| `3113` | agentmemory | viewer UI と proxy | `III_VIEWER_PORT` |
| `49134` | iii engine | worker 内部 WebSocket | `III_ENGINE_PORT` または `III_ENGINE_URL` |

`--port <N>` は REST port を設定し、明示値がない場合に viewer を `N+2`、engine WebSocket を `N+46023` にします。独立したランタイムには `--instance N` を使ってください。

セルフホストのデプロイでは REST と viewer をデフォルトで `127.0.0.1:3111` と `127.0.0.1:3113` に公開します。ホスト側ポートは `AGENTMEMORY_REST_PORT` と `AGENTMEMORY_VIEWER_PORT` で変更できます。REST CORS はデフォルトで設定済みポートの `http://localhost` と `http://127.0.0.1` を許可します。他の信頼できる browser origin には、カンマ区切りの正確な origin を `REST_ALLOWED_ORIGINS` に設定してください。

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

`~/.agentmemory/.env` を作成してください:

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
# AGENTMEMORY_STATE_SAVE_INTERVAL_MS=2000  # Default file-state save interval: 2000 ms.
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

ポート `3111` 上の 144 エンドポイント。REST API はデフォルトで `127.0.0.1` にバインドします。保護されたエンドポイントは `Authorization: Bearer <secret>` を要求し、mesh sync エンドポイントは両ピアで明示的に設定された `AGENTMEMORY_SECRET` を要求します。

**認証はデフォルトでオンです。** `AGENTMEMORY_SECRET` が(シェルにも `~/.agentmemory/.env` にも)設定されていない場合、サーバーは初回起動時にランダムなシークレットを生成し、モード `0600` で `~/.agentmemory/secret` に保存します。同梱のすべてのクライアント — CLI、ビューワー、`plugin/scripts` 配下の hooks、MCP サーバーと `@agentmemory/mcp` の shim、`agentmemory connect` が書き込む設定、同梱の OpenCode、Pi、OpenClaw、Hermes、ファイルシステムウォッチャーの各統合 — は、ローカルサーバーと話すときにそこから読み取ります。保存されたシークレットは、ループバックの URL(`localhost`、`127.0.0.0/8`、`::1`)にのみ送信されます。明示的な `AGENTMEMORY_SECRET` は常に優先され、リモートクライアントではそれでも設定が必要です。Docker と `deploy/` のエントリポイントは、既に独自のシークレットを生成・export しています。手動で API を呼ぶには:

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

完全なエンドポイント一覧: [`src/triggers/api.ts`](../src/triggers/api.ts)

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

**グラフの来歴のコンパクション。** 各ナレッジグラフのノードとエッジは、その由来となった最新 32 件の観測の id を保持します。この上限ができる前に書き込まれたストアでは、アクセスの多いノード 1 つあたり数千件の id を持つことがあり、グラフ検索とビューワーが遅くなったり、worker が落ちたりします。agentmemory はこれを自力で修正します: アップグレード後の最初の起動時に、すべてのノード、エッジ、上書きされたエッジ(時系列のグラフ履歴)、キャッシュされたスナップショットをバックグラウンドでこの上限まで、間に一時停止を挟んだ小さなスライスで切り詰めるため、検索、キャプチャ、ビューワーは動作を続けられます。進捗は保存され、再起動後も再開され、完了すると二度と実行されません。`/agentmemory/status` とビューワーの Health ページには、保留中、実行中(現在のスコープと位置とともに)、完了、失敗のいずれかとして表示されます。オフにするには `AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false` を設定してください。

手動で実行するには `POST /agentmemory/graph/compact` を呼び出してください。すべてのノードとエッジを列挙するのではなく、名前とエッジキーのインデックスを走査するため、再実行しても安全です。id を切り詰めたときは `graph_compact` の監査エントリを書き込みます。

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{}'
```

大規模なストアで、あるいは呼び出しが 504 を返す場合は、分割して実行してください。`scope`(`nodes`、`edges`、または `history`)、`offset`、`limit` を送り、返ってきた `nextOffset` が `null` になるまで呼び出しを繰り返します。これを `nodes`、`edges`、`history` それぞれについて行い、最後に `{"scope":"snapshot"}` を 1 回呼んで終えてください。分割実行はキャッシュされたスナップショットには触れないためです。

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"nodes","offset":0,"limit":200}'
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"snapshot"}'
```

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Development" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 3,800+ tests
npm run test:integration  # API tests (requires running services)
```

**前提条件:** npm/npx を含む Node.js >= 20。CLI 管理の macOS/Linux engine インストールには `curl`、POSIX `sh`、`tar` も必要です。ネイティブ Windows ではピン留めされた `iii.exe` を手動でインストールするか WSL2 を使用してください。

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="License" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
