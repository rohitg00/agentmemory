<p align="center">
  <img src="../assets/banner.png" alt="agentmemory — AI コーディングエージェントのための永続メモリ" width="720" />
</p>

<p align="center">
  <strong>
    コーディングエージェントがすべてを記憶します。もう説明し直す必要はありません。
    Built on <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  Claude Code、Cursor、Gemini CLI、Codex CLI、Hermes、OpenClaw、pi、OpenCode、そしてあらゆる MCP クライアントのための永続メモリ。
</p>

<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  日本語 |
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
  <em>この gist は Karpathy の LLM Wiki パターンを信頼度スコア、ライフサイクル管理、ナレッジグラフ、ハイブリッド検索で拡張します。agentmemory はその実装です。</em>
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
  <a href="#install">インストール</a> &bull;
  <a href="#quick-start">クイックスタート</a> &bull;
  <a href="#benchmarks">ベンチマーク</a> &bull;
  <a href="#vs-competitors">競合比較</a> &bull;
  <a href="#works-with-every-agent">エージェント</a> &bull;
  <a href="#how-it-works">仕組み</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">ビューワー</a> &bull;
  <a href="#iii-console">iii コンソール</a> &bull;
  <a href="#powered-by-iii">Powered by iii</a> &bull;
  <a href="#configuration">設定</a> &bull;
  <a href="#api">API</a>
</p>

---

## インストール

```bash
npm install -g @agentmemory/agentmemory          # 一度のインストール — PATH 上に `agentmemory` が使えるようになる
# macOS/Linux のシステム Node で EACCES が出る場合は次を試してください:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                                      # :3111 でメモリサーバーを起動
agentmemory demo                                 # サンプルセッションを投入してリコールを実証
agentmemory connect claude-code                  # エージェントを接続 (他にも codex, cursor, gemini-cli, ...)
```

または `npx` で(インストール不要):

```bash
npx @agentmemory/agentmemory
```

注意 — npx はバージョン単位でキャッシュします。素の `npx @agentmemory/agentmemory` が古いリリースを返す場合は、`npx -y @agentmemory/agentmemory@latest` で最新を強制するか、`rm -rf ~/.npm/_npx`(macOS/Linux。Windows では `%LOCALAPPDATA%\npm-cache\_npx` を削除)で一度キャッシュをクリアしてください。v0.9.16+ では初回 npx 実行時にインラインでグローバルインストールを促されるので、それ以降は素の `agentmemory` コマンドがどこでも動きます。

すべてのオプションは下の[クイックスタート](#quick-start)を参照。各エージェント固有の接続は[すべてのエージェントで動作](#works-with-every-agent)を参照。

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Works with every agent" height="32" /></picture></h2>

agentmemory は hooks、MCP、REST API をサポートするあらゆるエージェントで動作します。すべてのエージェントが同じメモリサーバーを共有します。

<table>
<tr>
<td align="center" width="12.5%">
<a href="https://claude.com/product/claude-code"><img src="https://matthiasroder.com/content/images/2026/01/Claude.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>ネイティブプラグイン + 12 hooks + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>ネイティブプラグイン + 6 hooks + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/openclaw/"><img src="https://github.com/openclaw.png?size=120" alt="OpenClaw" width="48" height="48" /></a><br/>
<strong>OpenClaw</strong><br/>
<sub>ネイティブプラグイン + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>ネイティブプラグイン + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>ネイティブプラグイン + MCP</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://raw.githubusercontent.com/tinyhumansai/openhuman/main/app/src-tauri/icons/128x128.png" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>ネイティブ Memory trait バックエンド</sub>
</td>
<td align="center" width="12.5%">
<a href="https://cursor.com"><img src="https://www.freelogovectors.net/wp-content/uploads/2025/06/cursor-logo-freelogovectors.net_.png" alt="Cursor" width="48" height="48" /></a><br/>
<strong>Cursor</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP サーバー</sub>
</td>
</tr>
<tr>
<td align="center" width="12.5%">
<a href="https://github.com/opencode-ai/opencode"><img src="https://github.com/opencode-ai.png?size=120" alt="OpenCode" width="48" height="48" /></a><br/>
<strong>OpenCode</strong><br/>
<sub>22 hooks + MCP + プラグイン</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
<td align="center" width="12.5%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="12.5%">
<a href="https://windsurf.com"><img src="https://exafunction.github.io/public/brand/windsurf-black-symbol.svg?size=120" alt="Windsurf" width="48" height="48" /></a><br/>
<strong>Windsurf</strong><br/>
<sub>MCP サーバー</sub>
</td>
<td align="center" width="12.5%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP サーバー</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>MCP または HTTP を話す<strong>あらゆる</strong>エージェントで動作。サーバー 1 つで、すべてのエージェントがメモリを共有。</sub>
</p>

---

あなたは毎セッション、同じアーキテクチャを説明し直している。同じバグを何度も発見する。同じ好みを繰り返し教える。組み込みのメモリ(CLAUDE.md、.cursorrules)は 200 行で打ち止め、しかも古びていく。agentmemory がこれを解決します。バックグラウンドで静かにエージェントの動きを捕捉し、検索可能なメモリに圧縮し、次のセッションが始まるときに適切なコンテキストを注入します。コマンド 1 つ。エージェント間で動作します。

**何が変わるか:** セッション 1 で JWT 認証をセットアップ。セッション 2 でレート制限を依頼する。エージェントは既に、あなたの認証が `src/middleware/auth.ts` の jose ミドルウェアを使い、テストがトークン検証をカバーし、Edge 互換性のために jsonwebtoken ではなく jose を選んだことを知っています。説明のし直し不要。コピペ不要。エージェントはただ*知っている*。

```bash
npx @agentmemory/agentmemory
```

> **v0.9.0 新機能** — ランディングサイト [agent-memory.dev](https://agent-memory.dev) 公開、ファイルシステムコネクタ(`@agentmemory/fs-watcher`)、スタンドアロン MCP は実行中のサーバーへプロキシすることで hooks とビューワーが整合、削除パス全体で監査ポリシーをコード化、健康チェックは小さな Node プロセスで `memory_critical` を誤検知しなくなりました。詳細は [CHANGELOG.md](../CHANGELOG.md#090--2026-04-18) を参照。

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmarks" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### 検索精度

**coding-agent-life-v1**(社内コーパス、サンドボックスで再現可能)

| アダプタ | P@5 | R@5 | Top-5 ヒット率 | p50 レイテンシ |
|---|---|---|---|---|
| **agentmemory ハイブリッド** | **0.578** | **0.967** | **15 / 15** | 14 ms |
| grep ベースライン | 0.267 | 0.967 | 15 / 15 | 0 ms |

100% Top-5 ヒット率。同じ入力で grep ベースラインより **2.2×** 高い精度。タイプ別の詳細は [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md)。

**LongMemEval-S**(ICLR 2025、500 問)

| システム | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| BM25 のみのフォールバック | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### トークン削減

| 方式 | トークン/年 | コスト/年 |
|---|---|---|
| フルコンテキスト貼付 | 19.5M+ | 不可能(コンテキストウィンドウ超過) |
| LLM 要約 | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + ローカル埋め込み | ~170K | **$0** |

</td>
</tr>
</table>

> 埋め込みモデル:`all-MiniLM-L6-v2`(ローカル、無料、API キー不要)。詳細レポート:[`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md)、[`benchmark/QUALITY.md`](../benchmark/QUALITY.md)、[`benchmark/SCALE.md`](../benchmark/SCALE.md)。競合比較:[`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) — agentmemory vs mem0、Letta、Khoj、claude-mem、Hippo。

**ローカルで再現:** [`eval/README.md`](../eval/README.md) — LongMemEval `_s`(公開 500 問)+ `coding-agent-life-v1`(社内 15 セッションコーパス)向けのアダプタプラガブルハーネス。Grep / vector / agentmemory アダプタを並べてスコアリングし、NDJSON 出力、公開スコアカードは [`docs/benchmarks/`](../docs/benchmarks/) に掲載。

**[codegraph](https://github.com/colbymchenry/codegraph)、[Understand Anything](https://github.com/Lum1104/Understand-Anything)、[Graphify](https://github.com/safishamsi/graphify) と組み合わせて使えます。** コードグラフのインデックス、マルチエージェントビルドパイプライン、ドキュメント / PDF / 画像 / 動画にまたがる広範なナレッジグラフ。agentmemory が作業を覚え、これら 3 つのプロジェクトがコンテキストレイヤーの残りを照らします。レシピと質問ルーティング表:[`docs/recipes/pairings.md`](../docs/recipes/pairings.md)。

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="vs Competitors" height="32" /></picture></h2>

<table>
<tr>
<th width="20%"></th>
<th width="20%">agentmemory</th>
<th width="20%">mem0 (53K ⭐)</th>
<th width="20%">Letta / MemGPT (22K ⭐)</th>
<th width="20%">組み込み (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>種別</strong></td>
<td>メモリエンジン + MCP サーバー</td>
<td>メモリレイヤー API</td>
<td>フルエージェントランタイム</td>
<td>静的ファイル</td>
</tr>
<tr>
<td><strong>検索 R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>自動キャプチャ</strong></td>
<td>12 hooks(手動作業ゼロ)</td>
<td>手動の <code>add()</code> 呼び出し</td>
<td>エージェントが自分で編集</td>
<td>手動編集</td>
</tr>
<tr>
<td><strong>検索</strong></td>
<td>BM25 + ベクトル + グラフ(RRF 融合)</td>
<td>ベクトル + グラフ</td>
<td>ベクトル(アーカイブ)</td>
<td>すべてをコンテキストにロード</td>
</tr>
<tr>
<td><strong>マルチエージェント</strong></td>
<td>MCP + REST + リース + シグナル</td>
<td>API(調整なし)</td>
<td>Letta ランタイム内のみ</td>
<td>エージェントごとにファイル</td>
</tr>
<tr>
<td><strong>フレームワークロックイン</strong></td>
<td>なし(任意の MCP クライアント)</td>
<td>なし</td>
<td>高(Letta 必須)</td>
<td>エージェントごとのフォーマット</td>
</tr>
<tr>
<td><strong>外部依存</strong></td>
<td>なし(SQLite + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + ベクトル DB</td>
<td>なし</td>
</tr>
<tr>
<td><strong>メモリライフサイクル</strong></td>
<td>4 層統合 + 減衰 + 自動忘却</td>
<td>受動的抽出</td>
<td>エージェント管理</td>
<td>手動プルーニング</td>
</tr>
<tr>
<td><strong>トークン効率</strong></td>
<td>~1,900 tokens/セッション ($10/年)</td>
<td>統合方法による</td>
<td>コアメモリがコンテキスト内</td>
<td>240 観測で 22K+ tokens</td>
</tr>
<tr>
<td><strong>リアルタイムビューワー</strong></td>
<td>あり(ポート 3113)</td>
<td>クラウドダッシュボード</td>
<td>クラウドダッシュボード</td>
<td>なし</td>
</tr>
<tr>
<td><strong>セルフホスト</strong></td>
<td>あり(デフォルト)</td>
<td>オプション</td>
<td>オプション</td>
<td>あり</td>
</tr>
</table>

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Quick Start" height="32" /></picture></h2>

互換性:このリリースは安定版の `iii-sdk` `^0.11.0` と iii-engine v0.11.x を対象とします。

### 30 秒で試す

```bash
# ターミナル 1: サーバーを起動
npx @agentmemory/agentmemory

# ターミナル 2: サンプルデータを投入してリコールを確認
npx @agentmemory/agentmemory demo
```

`demo` は 3 つの現実的なセッション(JWT 認証、N+1 クエリ修正、レート制限)を投入し、セマンティック検索を実行します。「database performance optimization」で検索すると「N+1 query fix」が見つかります — キーワード一致ではできない芸当です。

`http://localhost:3113` を開けばメモリがリアルタイムに構築される様子が見られます。

### 推奨:グローバルインストール

`npx` はバージョン単位でキャッシュします。先週 `npx @agentmemory/agentmemory@0.9.14` を実行していた場合、素の `npx @agentmemory/agentmemory` は最新ではなく `~/.npm/_npx/` から古い 0.9.14 を提供することがあります。一度インストールすれば、素の `agentmemory` コマンドがどこでも動きます:

```bash
npm install -g @agentmemory/agentmemory
# macOS/Linux のシステム Node で EACCES が出る場合は次を試してください:
# sudo npm install -g @agentmemory/agentmemory
agentmemory                    # サーバー起動(npx 形式と同じ)
agentmemory stop               # 停止
agentmemory remove             # 作成したものをすべてアンインストール
agentmemory connect claude-code   # エージェントを 1 つ接続
agentmemory doctor             # 対話型診断 + 修正プロンプト
```

v0.9.16 以降、初回 npx 実行時にインラインでグローバルインストールを促されます — 一度 `Y` と答えれば完了です。スキップした場合、以下のいずれかで最新を取得できます:

```bash
npx -y @agentmemory/agentmemory@latest                 # npm から最新を強制(クロスプラットフォーム)
rm -rf ~/.npm/_npx && npx @agentmemory/agentmemory     # macOS/Linux のみ (POSIX shell)
```

Windows / PowerShell では、同等のキャッシュクリアは `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"` です — 上記の `npx -y ...@latest` 形式がクロスプラットフォームの選択肢になります。

### セッションリプレイ

agentmemory が記録するすべてのセッションは再生可能です。ビューワーを開き、**Replay** タブを選択し、タイムラインをスクラブしてください: プロンプト、ツール呼び出し、ツール結果、応答が個別のイベントとして表示され、再生/一時停止、速度コントロール(0.5×–4×)、キーボードショートカット(スペースで切り替え、矢印でステップ)が使えます。

古い Claude Code の JSONL トランスクリプトを取り込みたい?

```bash
# デフォルトの ~/.claude/projects 配下を一括インポート
npx @agentmemory/agentmemory import-jsonl

# あるいは単一ファイルをインポート
npx @agentmemory/agentmemory import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

インポートしたセッションはネイティブのセッションと並んで Replay ピッカーに表示されます。内部では各エントリが `mem::replay::load`、`mem::replay::sessions`、`mem::replay::import-jsonl` の iii functions を経由します — サイドチャネルサーバーはありません。

### アップグレード / メンテナンス

意図的にローカルランタイムを更新したいときは、メンテナンスコマンドを使ってください:

```bash
npx @agentmemory/agentmemory upgrade
```

警告: このコマンドは現在のワークスペース/ランタイムを変更します。JavaScript 依存を更新したり、ピン留めされた Docker イメージ `iiidev/iii:0.11.2` を pull したりすることがあります。ピン留めされていない、あるいは新しい iii エンジンをインストールすることは決してありません。

実装の詳細は `src/cli.ts` を参照(`src/cli.ts:544-595` 付近の `runUpgrade`)。

### Claude Code(1 ブロックそのまま貼り付け)

```text
Install agentmemory: run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 4 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 53 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113.
```

#### プラグインをインストールしない Claude Code(MCP スタンドアロン)

`/plugin install` ではなく `~/.claude.json` から直接 agentmemory の MCP サーバーを配線する場合、Claude Code は `${CLAUDE_PLUGIN_ROOT}` を解決しないため、hook スクリプトを `~/.claude/settings.json` の絶対パスに向ける必要があります。これらのパスには通常 agentmemory のバージョン(例: `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.21/scripts/…`)が埋め込まれるため、次のアップグレードで全 hook が静かに壊れます。

回避策:

```bash
agentmemory connect claude-code --with-hooks
```

同じ hook コマンドを `~/.claude/settings.json` にマージし、現在インストールされている `@agentmemory/agentmemory` パッケージの `plugin/` ディレクトリに解決された絶対パスを書き込みます。agentmemory をアップグレードしたら、このコマンドを再実行してパスを更新してください。同じファイル内のユーザーエントリは保持され、以前の agentmemory エントリだけが置き換えられます。`/plugin install` の経路が推奨アプローチであることに変わりはありません。

リモートや保護されたデプロイでは、`AGENTMEMORY_URL` と `AGENTMEMORY_SECRET` を設定して Claude Code を起動します。プラグインはこの両方の値を同梱の MCP サーバーに渡します。`AGENTMEMORY_URL` が空の場合、MCP shim は `http://localhost:3111` にフォールバックします。

### Codex CLI(Codex プラグインプラットフォーム)

```bash
# 1. 別ターミナルでメモリサーバーを起動
npx @agentmemory/agentmemory

# 2. agentmemory マーケットプレイスを登録してプラグインをインストール
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Codex プラグインは Claude Code プラグインと同じ `plugin/` ディレクトリから出荷されます。以下を登録します:

- `@agentmemory/mcp` を MCP サーバーとして(`AGENTMEMORY_URL` が動作中の agentmemory サーバーを指す場合は 51 ツールすべてをプロキシ、サーバーに到達できない場合はローカルで 7 ツールにフォールバック)
- 6 つのライフサイクル hooks: `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PreCompact`、`Stop`
- 4 つの skills: `/recall`、`/remember`、`/session-history`、`/forget`

Codex の hook エンジンは hook サブプロセスに `CLAUDE_PLUGIN_ROOT` を注入する([`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs))ので、同じ hook スクリプトが両ホストで重複なく動きます。Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure イベントは Claude Code 専用で、Codex には登録されません。

#### Codex Desktop: プラグイン hooks は現在無音(回避策あり)

`CodexHooks` と `PluginHooks` はどちらも [`codex-rs/features/src/lib.rs`](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs) で安定版・デフォルト有効ですが、Codex Desktop ビルドは現在プラグインローカルの `hooks.json` をディスパッチしません([openai/codex#16430](https://github.com/openai/codex/issues/16430))。MCP ツールは引き続き動きますが、ライフサイクル観測だけが欠落します。

上流が修正を出すまでは、同じ hook コマンドをグローバルな `~/.codex/hooks.json` にミラーしてください:

```bash
agentmemory connect codex --with-hooks
```

これは同梱スクリプトへの絶対パスを参照する冪等なブロックを `~/.codex/hooks.json` に追加します(ユーザースコープでは `${CLAUDE_PLUGIN_ROOT}` の展開は不要)。agentmemory をアップグレードしたら同じコマンドを再実行してパスを更新してください。同じファイル内のユーザーエントリは保持され、以前の agentmemory エントリだけが置き換えられます。

<details>
<summary><b>OpenClaw(このプロンプトを貼り付け)</b></summary>

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

詳細ガイド:[`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent(このプロンプトを貼り付け)</b></summary>

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

詳細ガイド:[`integrations/hermes/`](../integrations/hermes/)

</details>

### その他のエージェント

メモリサーバーを起動:`npx @agentmemory/agentmemory`

`mcpServers` シェイプを使うホスト(Cursor、Claude Desktop、Cline、Roo Code、Windsurf、Gemini CLI、OpenClaw)では、agentmemory エントリは**同じ MCP サーバーブロック**です:

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

**このエントリをホストの設定ファイルにある既存の `mcpServers` オブジェクトにマージしてください** — ファイル全体を置き換えないでください。ファイルに既に他のサーバーがある場合は、`agentmemory` をその隣にもう 1 つのキーとして追加します。`mcpServers` が完全に欠落している場合は、ブロックを `{ "mcpServers": { ... } }` の中に貼り付けてください。`${VAR}` プレースホルダーは MCP サーバー起動時にシェルから `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` を継承します — 未設定の変数は空文字列を渡し、shim は `http://localhost:3111` にフォールバックします。1 つの接続済みエントリでローカルとリモート(k8s / リバースプロキシ)両方のデプロイに対応します。

| エージェント | 設定ファイル | 備考 |
|---|---|---|
| **Cursor** | `~/.cursor/mcp.json` | `mcpServers` にマージ。ウェブサイトでワンクリックディープリンクも利用可能。 |
| **Claude Desktop** | `claude_desktop_config.json`(Application Support) | `mcpServers` にマージ。編集後 Claude Desktop を再起動。 |
| **Cline / Roo Code / Kilo Code** | Cline MCP 設定(設定 UI → MCP Servers → Edit) | 同じ `mcpServers` ブロック。 |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | 同じ `mcpServers` ブロック。 |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user`(自動マージ)。 |
| **OpenClaw** | OpenClaw MCP 設定 | 同じ `mcpServers` ブロック、または[より深いメモリプラグイン](../integrations/openclaw/)を使用。 |
| **Codex CLI(MCP のみ)** | `.codex/config.toml` | TOML シェイプ: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`、または `[mcp_servers.agentmemory]` を手動で追加。 |
| **Codex CLI(フルプラグイン)** | Codex プラグインマーケットプレイス | `codex plugin marketplace add rohitg00/agentmemory` のあと `codex plugin add agentmemory@agentmemory`。MCP + 6 つのライフサイクル hooks(SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、PreCompact、Stop)+ 4 つの skills を登録。Codex Desktop では、[openai/codex#16430](https://github.com/openai/codex/issues/16430) が解決するまで `agentmemory connect codex --with-hooks` も実行 — そちらではプラグイン hooks が現在無音。 |
| **OpenCode(MCP のみ)** | `opencode.json` | 異なるシェイプ — トップレベルの `mcp` キー、command は配列: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`。 |
| **OpenCode(フルプラグイン)** | `plugin/opencode/` | 22 個の自動キャプチャ hooks がセッションライフサイクル、メッセージ、ツール、エラーをカバー。2 つのスラッシュコマンド(`/recall`、`/remember`)。`plugin/opencode/` を OpenCode ワークスペースにコピーし、プラグインエントリを `opencode.json` に追加。完全な hook 表とギャップ分析は [`plugin/opencode/README.md`](../plugin/opencode/README.md) を参照。 |
| **pi** | `~/.pi/agent/extensions/agentmemory` | [`integrations/pi`](../integrations/pi/) をコピーして pi を再起動。 |
| **Hermes Agent** | `~/.hermes/config.yaml` | より深い[メモリプロバイダープラグイン](../integrations/hermes/)を使い、`memory.provider: agentmemory` を設定。 |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` が標準の `mcpServers` ブロックを書き込みます。Hook ペイロードは Claude Code とフィールド互換なので、既存の 12 hook スクリプトはそのまま動作 — 同じ `settings.json` の `hooks` セクションで配線してください。 |
| **Antigravity**(Gemini CLI の後継) | `mcp_config.json`(Antigravity の User ディレクトリ内) | `agentmemory connect antigravity` が標準の `mcpServers` ブロックを書き込みます。macOS: `~/Library/Application Support/Antigravity/User/`。Linux: `~/.config/Antigravity/User/`。2026-06-18 の Gemini CLI 終了後に使用。 |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` がユーザーレベル設定を書き込みます。ワークスペースのオーバーライドはコードの横にある `.kiro/settings/mcp.json` に。 |
| **Goose** | Goose MCP 設定 UI | 同じ `mcpServers` ブロック。 |
| **Aider** | n/a | REST API に直接話しかける: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`。 |
| **任意のエージェント(32+)** | n/a | `npx skillkit install agentmemory` がホストを自動検出してマージ。 |

**サンドボックス化された MCP クライアント**(Flatpak / Snap / 制限的なコンテナ)はホストの `localhost` に到達できません: `env` ブロックに `"AGENTMEMORY_FORCE_PROXY": "1"` も設定し、`AGENTMEMORY_URL` をサンドボックスが実際に到達できる経路(例: LAN IP)に向けてください。

### プログラマティックアクセス(Python / Rust / Node)

agentmemory はコア操作を iii functions(`mem::remember`、`mem::observe`、`mem::context`、`mem::smart-search`、`mem::forget`)として登録します。iii SDK を持つあらゆる言語が `ws://localhost:49134` で直接呼び出せます — 言語ごとに REST クライアントを用意する必要はありません。

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

実例:[`examples/python/`](../examples/python/)(クイックスタート + 観測/リコールフロー)。iii ランタイムがないホスト向けに `:3111` の REST も引き続き利用可能。

### ソースから

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

`iii` が既にインストールされていれば、これでローカルの `iii-engine` で agentmemory が起動します。Docker が使える場合は Docker Compose にフォールバックします。REST、ストリーム、ビューワーはデフォルトで `127.0.0.1` にバインドします。

`iii-engine` を手動でインストールしてください。**agentmemory は現在 `iii-engine` を `v0.11.2` にピン留めしています** — `v0.11.6` では `iii worker add` で何でもサンドボックス化する新モデルが導入されましたが、agentmemory はまだそれ向けにリファクタリングされていません。リファクタが完了次第ピンは解除されます。サンドボックスモデルへ手動移行済みなら `AGENTMEMORY_III_VERSION=<version>` でオーバーライドできます。

- **macOS arm64:** `mkdir -p ~/.local/bin && curl -fsSL https://github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-aarch64-apple-darwin.tar.gz | tar -xz -C ~/.local/bin && chmod +x ~/.local/bin/iii`
- **macOS x64:** `aarch64-apple-darwin` を `x86_64-apple-darwin` に置換
- **Linux x64:** `x86_64-unknown-linux-gnu` に置換
- **Linux arm64:** `aarch64-unknown-linux-gnu` に置換
- **Windows:** [iii-hq/iii releases v0.11.2](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2) から `iii-x86_64-pc-windows-msvc.zip` をダウンロード、`iii.exe` を展開し PATH に追加

または Docker を使用(同梱の `docker-compose.yml` が `iiidev/iii:0.11.2` を pull します)。詳細ドキュメント:[iii.dev/docs](https://iii.dev/docs)。

### Windows

agentmemory は Windows 10/11 で動作しますが、Node.js パッケージだけでは不十分で、`iii-engine` ランタイム(別のネイティブバイナリ)もバックグラウンドプロセスとして必要です。公式の上流インストーラは `sh` スクリプトで、今のところ PowerShell インストーラや scoop/winget パッケージは存在しないため、Windows ユーザーには 2 つの経路があります:

**選択肢 A — ビルド済み Windows バイナリ(推奨):**

```powershell
# 1. ブラウザで https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2 を開く
#    (engine v0.11.6+ が要求する新しいサンドボックスモデルへ
#     agentmemory がリファクタリングされるまで v0.11.2 にピン留め)
# 2. iii-x86_64-pc-windows-msvc.zip をダウンロード
#    (ARM マシンの場合は iii-aarch64-pc-windows-msvc.zip)
# 3. iii.exe を PATH 上のどこかに展開、または以下に配置:
#    %USERPROFILE%\.local\bin\iii.exe
#    (agentmemory はこの場所を自動でチェックします)
# 4. 確認:
iii --version
# 出力: 0.11.2

# 5. その後 agentmemory を通常通り起動:
npx -y @agentmemory/agentmemory
```

**選択肢 B — Docker Desktop:**

```powershell
# 1. Docker Desktop for Windows をインストール
# 2. Docker Desktop を起動し、エンジンが動作中であることを確認
# 3. agentmemory を実行 — 同梱の compose ファイルが自動起動します:
npx -y @agentmemory/agentmemory
```

**選択肢 C — スタンドアロン MCP のみ(エンジンなし):** エージェント用に MCP ツールだけが必要で、REST API、ビューワー、cron ジョブが不要なら、エンジンを完全にスキップ:

```powershell
npx -y @agentmemory/agentmemory mcp
# あるいは shim パッケージ経由:
npx -y @agentmemory/mcp
```

**Windows の診断:** `npx @agentmemory/agentmemory` が失敗する場合、`--verbose` 付きで再実行して実際のエンジン stderr を確認してください。よくある失敗パターン:

| 症状 | 修正 |
|---|---|
| `iii-engine process started` のあとに `did not become ready within 15s` | エンジンが起動時にクラッシュ — `--verbose` で再実行し stderr を確認 |
| `Could not start iii-engine` | `iii.exe` も Docker もインストールされていない。上記の選択肢 A または B を参照 |
| ポート競合 | `netstat -ano \| findstr :3111` でバインドを確認、kill するか `--port <N>` を使用 |
| Docker をインストール済みなのにフォールバックがスキップされる | Docker Desktop が実際に動作している(システムトレイアイコン)ことを確認 |

> 注意: iii **エンジン** はビルド済みバイナリであり、cargo クレートではありません — `cargo install` でインストールしようとしないでください。(iii **SDK** は crates.io、npm、PyPI に公開されていますが、agentmemory には不要です。)サポートされるエンジンのインストール方法はすべて v0.11.2 にピン留めされています: 上記のビルド済み v0.11.2 バイナリ、バージョンピン**付き**の上流 `sh` インストールスクリプト `curl -fsSL https://install.iii.dev/iii/main/install.sh | VERSION=0.11.2 sh`(macOS/Linux)、および Docker イメージ `iiidev/iii:0.11.2`。単なる `install.sh | sh` は **最新** のエンジンをインストールしますが、agentmemory はそれをサポートしていません — 必ず `VERSION=0.11.2` を渡してください。最も簡単なのは、`npx @agentmemory/agentmemory` を実行するだけです。これがピン留めされたエンジンを `~/.agentmemory/bin` に取得してくれます。

---

<h2 id="deploy">デプロイ</h2>

マネージドホスト向けのワンクリックテンプレート。それぞれが
自己完結した Dockerfile を提供し、npm から
`@agentmemory/agentmemory` を pull して公式の `iiidev/iii`
Docker Hub イメージから iii engine バイナリをコピーします — 事前に
ビルドした agentmemory イメージは不要です。永続ストレージは
`/data` にマウントされます。初回起動の entrypoint は npm 同梱の
iii 設定(`127.0.0.1` をバインド)をデプロイ向けに調整した
設定(`0.0.0.0` をバインドし絶対 `/data` パスを使用)で上書きし、
HMAC シークレットを生成、そして `gosu` で `root` から `node`
に権限を落としてから agentmemory CLI を exec します。

<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory&path=deploy/fly"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Deploy to fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory&rootDirectory=deploy%2Frailway"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy to Railway" /></a>
</p>

Render のワンクリックデプロイボタンはリポジトリルートに `render.yaml` を要求しますが、ルートをあえて綺麗に保っています。[`deploy/render/`](../deploy/render/README.md) にドキュメント化された Render Blueprint フローを使い、リポジトリ内のブループリントを手動で指してください。

完全なセットアップ詳細(HMAC キャプチャ、ビューワーの SSH トンネル、
ローテーション、バックアップ、コスト下限)は
[`deploy/`](../deploy/README.md) を参照:

- [`deploy/fly`](../deploy/fly/README.md) — 単一マシンで
  `auto_stop_machines = "stop"`、アイドル時最安。
- [`deploy/railway`](../deploy/railway/README.md) — Hobby プラン定額、
  ボリュームはダッシュボードで。
- [`deploy/render`](../deploy/render/README.md) — Blueprint フロー、
  有料プランで自動ディスクスナップショット。
- [`deploy/coolify`](../deploy/coolify/README.md) — [Coolify](https://coolify.io/self-hosted)
  経由で自前 VPS にセルフホスト。同じ Docker Compose
  スタックで、ホストとデータは自分の手元に。

公開されるのはポート `3111` のみです。`3113` のビューワーは
コンテナ内でループバックにバインドされ続けます — 各テンプレートの
README にそこへ到達する SSH トンネルパターンが記載されています。

---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Why agentmemory" height="32" /></picture></h2>

すべてのコーディングエージェントはセッションが終わるとすべてを忘れます。毎セッションの最初の 5 分をスタックの再説明に浪費しています。agentmemory はバックグラウンドで動作し、それを完全になくします。

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
| トークンコスト | 240 観測で 22K+ | ~1,900 tokens(92% 削減) |
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

### 4 層メモリ統合

人間の脳が記憶を処理する方法に着想を得ています — 睡眠時の記憶統合と通じるものがあります。

| 層 | 内容 | 例え |
|------|------|---------|
| **Working(作業記憶)** | ツール使用からの生観測 | 短期記憶 |
| **Episodic(エピソード記憶)** | 圧縮されたセッション要約 | 「何が起きたか」 |
| **Semantic(意味記憶)** | 抽出された事実とパターン | 「何を知っているか」 |
| **Procedural(手続き記憶)** | ワークフローと意思決定パターン | 「どうやるか」 |

記憶は時間とともに減衰(エビングハウス曲線)。頻繁にアクセスされる記憶は強化されます。古い記憶は自動退避。矛盾は検出され解決されます。

### 何をキャプチャするか

| Hook | キャプチャ内容 |
|------|----------|
| `SessionStart` | プロジェクトパス、セッション ID |
| `UserPromptSubmit` | ユーザープロンプト(プライバシーフィルタ済み) |
| `PreToolUse` | ファイルアクセスパターン + コンテキスト富化 |
| `PostToolUse` | ツール名、入力、出力 |
| `PostToolUseFailure` | エラーコンテキスト |
| `PreCompact` | コンパクション前にメモリを再注入 |
| `SubagentStart/Stop` | サブエージェントのライフサイクル |
| `Stop` | セッション終了時の要約 |
| `SessionEnd` | セッション完了マーカー |

### 主な機能

| 機能 | 説明 |
|---|---|
| **自動キャプチャ** | hooks で毎ツール使用を記録 — 手動作業ゼロ |
| **セマンティック検索** | BM25 + ベクトル + ナレッジグラフ、RRF 融合 |
| **メモリ進化** | バージョン管理、上書き、関係グラフ |
| **自動忘却** | TTL 期限切れ、矛盾検出、重要度退避 |
| **プライバシー優先** | API キー、シークレット、`<private>` タグは保存前に除去 |
| **自己修復** | サーキットブレーカー、プロバイダーフォールバックチェーン、ヘルスモニタ |
| **Claude ブリッジ** | MEMORY.md と双方向同期 |
| **ナレッジグラフ** | エンティティ抽出 + BFS 探索 |
| **チームメモリ** | チームメンバー間で名前空間化された共有 + プライベート |
| **引用の出所追跡** | あらゆるメモリを元の観測まで遡れる |
| **Git スナップショット** | メモリ状態のバージョン、ロールバック、diff |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Search" height="32" /></picture></h2>

3 つのシグナルを組み合わせるトリプルストリーム検索:

| ストリーム | 役割 | 起動条件 |
|---|---|---|
| **BM25** | ステミング付きキーワード一致と類義語拡張 | 常時有効 |
| **Vector(ベクトル)** | 密埋め込みのコサイン類似度 | 埋め込みプロバイダー設定時 |
| **Graph(グラフ)** | エンティティ一致によるナレッジグラフ探索 | クエリにエンティティ検出時 |

Reciprocal Rank Fusion (RRF, k=60) で融合し、セッションで多様化(セッションあたり最大 3 件)。

BM25 は箱から出してすぐにギリシャ文字、キリル文字、ヘブライ文字、アラビア文字、アクセント付きラテン文字をトークン化できます。中国語 / 日本語 / 韓国語のメモリには、オプションのセグメンタ(`npm install @node-rs/jieba tiny-segmenter`)をインストールして CJK 連続を単語レベルのトークンに分割してください。インストールしない場合、agentmemory は連続全体をそのままトークン化するソフトフォールバックに切り替わり、stderr に一度だけヒントを出します。

### 埋め込みプロバイダー

agentmemory はプロバイダーを自動検出します。最良の結果を得るには、ローカル埋め込み(無料)をインストール:

```bash
npm install @xenova/transformers
```

| プロバイダー | モデル | コスト | 備考 |
|---|---|---|---|
| **ローカル(推奨)** | `all-MiniLM-L6-v2` | 無料 | オフライン、BM25 単独より召集率 +8pp |
| Gemini | `gemini-embedding-001` | 無料枠 | 100+ 言語、768/1536/3072 次元 (MRL)、2048 トークン入力。`text-embedding-004` の後継([非推奨、2026 年 1 月 14 日に停止](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | 最高品質 |
| Voyage AI | `voyage-code-3` | 有料 | コード向け最適化 |
| Cohere | `embed-english-v3.0` | 無料試用 | 汎用 |
| OpenRouter | 任意のモデル | 場合による | マルチモデルプロキシ |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP Server" height="32" /></picture></h2>

53 ツール、6 リソース、3 プロンプト、4 skills — あらゆるエージェント向けで最も充実した MCP メモリツールキット。

> **MCP shim とフルサーバー:** 公開されている `@agentmemory/mcp` パッケージは薄い shim です。**`AGENTMEMORY_URL` 経由で動作中の agentmemory サーバーに到達できる場合に限り**、完全な 51 ツール群を公開します(プロキシモード)。サーバーに到達できない場合、shim は 7 ツールのローカルセット(`memory_save`、`memory_recall`、`memory_smart_search`、`memory_sessions`、`memory_export`、`memory_audit`、`memory_governance_delete`)にフォールバックします。`AGENTMEMORY_TOOLS=core|all` 環境変数は*サーバー側*のフラグです — shim の `env` ブロックで設定しても効果はありません。Cursor / OpenCode / Gemini CLI で 7 ツールしか見えない場合は、`npx @agentmemory/agentmemory`(または Docker スタック)を起動し、`AGENTMEMORY_URL=http://localhost:3111` を設定してください。

### 51 ツール

<details>
<summary>コアツール(常時利用可能)</summary>

| ツール | 説明 |
|------|-------------|
| `memory_recall` | 過去の観測を検索 |
| `memory_compress_file` | 構造を保持したまま markdown ファイルを圧縮 |
| `memory_save` | 洞察、決定、パターンを保存 |
| `memory_patterns` | 繰り返し現れるパターンを検出 |
| `memory_smart_search` | ハイブリッドなセマンティック + キーワード検索 |
| `memory_file_history` | 特定ファイルに関する過去の観測 |
| `memory_sessions` | 最近のセッション一覧 |
| `memory_timeline` | 時系列の観測 |
| `memory_profile` | プロジェクトプロファイル(概念、ファイル、パターン) |
| `memory_export` | すべてのメモリデータをエクスポート |
| `memory_relations` | 関係グラフを照会 |

</details>

<details>
<summary>拡張ツール(全 51 — AGENTMEMORY_TOOLS=all を設定)</summary>

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
| `memory_routine_run` | ワークフロー ルーチンをインスタンス化 |
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

### 6 リソース · 3 プロンプト · 4 Skills

| 種類 | 名前 | 説明 |
|------|------|-------------|
| Resource | `agentmemory://status` | ヘルス、セッション数、メモリ数 |
| Resource | `agentmemory://project/{name}/profile` | プロジェクト別インテリジェンス |
| Resource | `agentmemory://memories/latest` | 直近 10 件のアクティブメモリ |
| Resource | `agentmemory://graph/stats` | ナレッジグラフ統計 |
| Prompt | `recall_context` | 検索してコンテキストメッセージを返す |
| Prompt | `session_handoff` | エージェント間でのハンドオフデータ |
| Prompt | `detect_patterns` | 繰り返し現れるパターンを分析 |
| Skill | `/recall` | メモリを検索 |
| Skill | `/remember` | 長期メモリに保存 |
| Skill | `/session-history` | 最近のセッション要約 |
| Skill | `/forget` | 観測/セッションを削除 |

### スタンドアロン MCP

フルサーバーなしで実行 — 任意の MCP クライアント向け。以下のどちらも動きます:

```bash
npx -y @agentmemory/agentmemory mcp   # 正規(常時利用可能)
npx -y @agentmemory/mcp                # shim パッケージのエイリアス
```

またはエージェントの MCP 設定に追加:

ほとんどのエージェント(Cursor、Claude Desktop、Cline、Roo Code、Windsurf、Gemini CLI):
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

`agentmemory` エントリはホストの既存 `mcpServers` オブジェクトにマージし、ファイル全体を置き換えないでください。ホストの `localhost` に到達できないサンドボックスクライアントには、env ブロックに `"AGENTMEMORY_FORCE_PROXY": "1"` を追加し、`AGENTMEMORY_URL` をサンドボックスが到達できる経路に設定してください。

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

リポジトリからプラグインファイルをコピー:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Real-Time Viewer" height="32" /></picture></h2>

ポート `3113` で自動起動。ライブ観測ストリーム、セッションエクスプローラ、メモリブラウザ、ナレッジグラフの可視化、ヘルスダッシュボード。

```bash
open http://localhost:3113
```

ビューワーサーバーはデフォルトで `127.0.0.1` にバインドします。REST 経由の `/agentmemory/viewer` エンドポイントは通常の `AGENTMEMORY_SECRET` ベアラートークン規則に従います。CSP ヘッダーはレスポンスごとのスクリプト nonce を使い、インラインハンドラ属性は無効化(`script-src-attr 'none'`)。

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

`:3113` のビューワーはエージェントが**覚えた**ことを見せます。[iii コンソール](https://iii.dev/docs/console)はエージェントが**やった**ことを見せます — 各メモリ操作は OpenTelemetry トレース、各 KV エントリは編集可能、各 function は呼び出し可能、各ストリームは tap 可能。同じメモリへの 2 つの窓: 一方はプロダクト形、もう一方はエンジン形。

`memory_smart_search` の発火を眺め、BM25 スキャン → 埋め込み参照 → RRF 融合 → リランカーをウォーターフォールで見ます。KV ブラウザで詰まった統合タイマーを編集します。調整したペイロードで `PostToolUse` hook を再生します。WebSocket ストリームをピンして観測がライブで着地するのを眺めます。

agentmemory はこれを無料で提供します。すべての function、トリガー、ステートスコープ、ストリームが iii プリミティブだからです — カスタム実装も計装も必要ありません。

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="iii console Workers page — connected workers including agentmemory instances with live function counts and runtime metadata" width="720" />
  <br/>
  <em>Workers ページ: agentmemory 自身を含む、接続中のすべての worker と PID、function 数、ランタイム、最終応答時刻。</em>
</p>

**インストール済みです。** コンソールは `iii` に同梱 — 別途インストーラはありません。

**agentmemory と並行して起動:**

```bash
# agentmemory ビューワーがポート 3113 を握っているので、コンソールは 3114 で実行します。
# エンジン REST (3111)、WebSocket (3112)、bridge (49134) のデフォルトは agentmemory と一致します。
iii console --port 3114
```

その後 `http://localhost:3114` を開きます。`--enable-flow` で実験的なアーキテクチャグラフページを有効化します。

エンジンエンドポイントを移動した場合のみ上書き:

```bash
iii console --port 3114 \
  --engine-port 3111 \
  --ws-port 3112 \
  --bridge-port 49134
```

**コンソールでできること:**

| ページ | 用途 |
|------|-----------|
| **Workers** | agentmemory worker 自身を含む、接続中の各 worker とライブメトリクスを表示。 |
| **Functions** | JSON ペイロードを与えて agentmemory の任意の function を直接呼び出し — クライアントを配線せずに `memory.recall`、`memory.consolidate`、`graph.query` をテストできて便利。 |
| **Triggers** | HTTP、cron、イベント、ステートのトリガーを再生 — 統合 cron を手動で発火、HTTP ルートを再試行、ステート変更を発行。 |
| **States** | フル CRUD の KV ブラウザ — セッション、メモリスロット、ライフサイクルタイマー、埋め込みインデックス — その場で値を編集。 |
| **Streams** | メモリ書き込み、hook イベント、観測更新が iii ストリームを流れる様子をライブで監視する WebSocket モニタ。 |
| **Queues** | 永続キューのトピック + デッドレター管理。失敗した埋め込み / 圧縮ジョブを再生または破棄。 |
| **Traces** | OpenTelemetry のウォーターフォール / フレーム / サービスブレークダウン。`trace_id` でフィルタすれば、単一の `memory.search` がどの function、DB 呼び出し、埋め込みリクエストを生んだか正確にわかります。 |
| **Logs** | 構造化 OTEL ログをフィルタし、trace/span ID と相関付け。 |
| **Config** | ランタイム設定 — エンジンがどの worker、プロバイダー、ポートで動いているか確認。 |
| **Flow** | (オプション、`--enable-flow`)各 worker、トリガー、ストリームの対話型アーキテクチャグラフ。 |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="iii console trace waterfall view showing per-span duration" width="720" />
  <br/>
  <em>Traces: すべてのメモリ操作についてウォーターフォール / フレーム / サービスブレークダウン。</em>
</p>

**Traces は既にオン:**

`iii-config.yaml` は出荷時から `iii-observability` worker を有効化(`exporter: memory`、`sampling_ratio: 1.0`、メトリクス + ログ)。追加設定不要 — agentmemory が起動した瞬間に、すべてのメモリ操作がトレーススパンとコンソールが読み取れる構造化ログを出します。

代わりに Jaeger / Honeycomb / Grafana Tempo へエクスポートしたい場合は、`exporter: memory` を `exporter: otlp` に変更し、iii の可観測性ドキュメントに従ってコレクタエンドポイントを設定してください。

> **注意:** コンソール自身に認証は強制されていません — デフォルトの `127.0.0.1` バインドのままにし、決して公開しないでください。

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory は**それ自体が稼働中の [iii](https://iii.dev) インスタンス**です。function、トリガー、KV ステート、ストリーム、OTEL トレース — すべてが iii プリミティブです。Postgres、Redis、Express、pm2、Prometheus をインストールしなかったのは、iii がそれらを置き換えるからです。

つまり、もう 1 つのコマンドで agentmemory にまったく新しい機能を拡張できます。

### 1 つのコマンドで agentmemory を拡張

```bash
iii worker add iii-pubsub          # メモリ書き込みを接続中のすべてのインスタンスに fan-out
iii worker add iii-cron            # スケジュール統合、減衰スイープ、スナップショットローテーション
iii worker add iii-queue           # 埋め込み + 圧縮ジョブの永続リトライ
iii worker add iii-observability   # すべてのメモリ操作に OTEL トレース(デフォルト オン)
iii worker add iii-sandbox         # リコールしたコードを隔離 microVM 内で実行
iii worker add iii-database        # SQL バックエンドのステートアダプタに切り替え
iii worker add mcp                 # agentmemory MCP の横に汎用 MCP ホストを立てる
```

各 `iii worker add` は新しい function とトリガーを、agentmemory が既に動いているのと同じエンジンに登録します。ビューワーとコンソールがすぐに拾い上げます — リロード不要、新しい統合不要、新しいコンテナ不要。

| `iii worker add` | agentmemory の上に得られるもの |
|---|---|
| [`iii-pubsub`](https://workers.iii.dev/workers/iii-pubsub) | マルチインスタンスメモリ: すべての `remember` が fan-out、すべての `search` が和集合を読む |
| [`iii-cron`](https://workers.iii.dev/workers/iii-cron) | スケジュールされたライフサイクル — 夜間統合、週次スナップショット、固定クロックでの減衰 |
| [`iii-queue`](https://workers.iii.dev/workers/iii-queue) | 永続リトライ: 失敗した埋め込み + 圧縮ジョブが再起動を生き延び、観測は失われない |
| [`iii-observability`](https://workers.iii.dev/workers/iii-observability) | すべての function に OTEL トレース、メトリクス、ログ — 初日から `iii-config.yaml` に配線済み |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | `memory_recall` から出てきたコードはあなたのシェルではなく使い捨て VM 内で実行 |
| [`iii-database`](https://workers.iii.dev/workers/iii-database) | デフォルトのインメモリ KV では足りないときの SQL バックエンドのステートアダプタ |
| [`mcp`](https://workers.iii.dev/workers/mcp) | agentmemory の隣に追加の MCP サーバーを立て、同じエンジンを共有 |

完全なレジストリ:[workers.iii.dev](https://workers.iii.dev)。そこにあるすべての worker は agentmemory が使っているのと同じプリミティブで組み立てられています — そして既に手元にある agentmemory もその 1 つです。

### iii が置き換えるもの

| 従来のスタック | agentmemory が使うもの |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + インメモリベクトルインデックス |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | iii engine worker 監視 |
| Prometheus / Grafana | iii OTEL + ヘルスモニタ |
| カスタムプラグインシステム | `iii worker add <name>` |

**118 ソースファイル · ~21,800 LOC · 950+ テスト · 123 functions · 34 KV スコープ** — すべて 3 つのプリミティブの上に。`agentmemory plugin install` はありません。プラグインシステムは iii そのものです。

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Configuration" height="32" /></picture></h2>

### LLM プロバイダー

agentmemory は環境から自動検出します。デフォルトでは、プロバイダーを設定するか Claude 購読フォールバックに明示的にオプトインしない限り、LLM 呼び出しは行いません。

| プロバイダー | 設定 | 備考 |
|----------|--------|-------|
| **No-op(デフォルト)** | 設定不要 | LLM 駆動の compress/summarize は無効。合成 BM25 圧縮 + リコールは引き続き動作。以前 Claude 購読フォールバックに依存していた場合は、下記の `AGENTMEMORY_ALLOW_AGENT_SDK` を参照。 |
| Anthropic API | `ANTHROPIC_API_KEY` | トークン単位課金 |
| MiniMax | `MINIMAX_API_KEY` | Anthropic 互換 |
| Gemini | `GEMINI_API_KEY` | 埋め込みも有効化 |
| OpenRouter | `OPENROUTER_API_KEY` | 任意のモデル |
| Claude 購読フォールバック | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | オプトインのみ。`@anthropic-ai/claude-agent-sdk` セッションを生成 — 過去に無限の Stop-hook 再帰を引き起こしたため、もはやデフォルトではありません。 |

### コストを意識したモデル選択

バックグラウンド圧縮は観測のたびに走るため、モデル選択は月額支出に大きく効きます。記録されたワークロード: 635 リクエスト / 888K トークン / 35 時間のアクティブ使用、2026-05-23 時点の OpenRouter 価格で 3 モデルを比較。

| 階層 | モデル | 入力 / 1M | 出力 / 1M | 35 時間のワークロードでのコスト | 備考 |
|------|-------|------------|-------------|---------------------------|-------|
| 推奨 | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | 圧縮 + 要約品質が手堅く、Sonnet の約 10 分の 1 のコスト。 |
| 推奨 | `deepseek/deepseek-chat` | $0.27 | $1.10 | ~$0.40 | やや古めだが圧縮のみのワークロードには十分。 |
| 推奨 | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | セッションがコード中心ならコード推論が強い。 |
| プレミアム | `anthropic/claude-sonnet-4.6` | $3.00 | $15.00 | ~$5.02 | 品質は高いが常時稼働のバックグラウンドには高価。 |
| プレミアム | `openai/gpt-4o` | $2.50 | $10.00 | ~$4.20 | Sonnet と同階層。 |
| 回避 | `anthropic/claude-opus-4.6` | $15.00 | $75.00 | ~$25+ | 推論クラスのモデル。圧縮には大幅な過剰支出。 |

agentmemory は `OPENROUTER_MODEL` がプレミアム階層パターンと一致するときランタイム警告を表示します。納得して選んだあとは `AGENTMEMORY_SUPPRESS_COST_WARNING=1` で消音できます。

メモリ作業における品質対コストのトレードオフ: 圧縮は品質のハードルが比較的緩い要約タスクです(要約を読み返すのはエージェントであってユーザーではありません)。DeepSeek-V4-Pro / Qwen3-Coder はこのタスクで Sonnet と誤差範囲に収まる一方、コストは約 10 分の 1 です。プレミアム階層のモデルは、あなたが直接読むクエリに取っておきましょう。

出典:[OpenRouter の Sonnet 4.6 価格](https://openrouter.ai/anthropic/claude-sonnet-4.6/pricing)、[DeepSeek V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro)、[DeepSeek の価格に関する注](https://api-docs.deepseek.com/quick_start/pricing/)。

### マルチエージェントメモリ(`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

複数のロール(architect / developer / reviewer / researcher / support-agent)が 1 つの agentmemory サーバーを共有するマルチエージェント構成では、`AGENT_ID` がすべての書き込みに発信したロールのタグを付けます。`AGENTMEMORY_AGENT_SCOPE` はリコールがそのタグでフィルタするかどうかを制御します。

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # 任意、デフォルトは "shared"
```

2 つのモード:

| モード | 書き込みにタグ | リコールでフィルタ | 使いどころ |
|------|------------|---------------|-------------|
| `shared`(デフォルト) | はい | いいえ | 監査証跡付きのクロスエージェントコンテキスト。Architect は developer のメモを見られるが、各行に発言者が記録されます。 |
| `isolated` | はい | はい | 厳格分離。Architect は developer の観測 / メモリ / セッションを決して見られません。 |

`AGENT_ID` が設定されたときにタグ付けされるもの:`Session.agentId`、`RawObservation.agentId`、`CompressedObservation.agentId`、`Memory.agentId`。ロールは `api::session::start` → `mem::observe` → `mem::compress` → KV を流れます。

isolated モードでフィルタされるもの:`mem::smart-search`、`/agentmemory/memories`、`/agentmemory/observations`、`/agentmemory/sessions`。各エンドポイントはリクエスト単位でオーバーライドする `?agentId=<role>` を受け付け、`?agentId=*` で環境スコープから完全にオプトアウトできます。`/memories` はさらに `?includeOrphans=true` を受け付け、`agentId` が undefined の AGENT_ID 導入前のメモリを浮上させます。

SDK / REST 層での呼び出し単位オーバーライド: すべての変更系エンドポイント(`/session/start`、`/remember`)はリクエストボディに `agentId` フィールドを受け付け、環境変数より優先されます。1 つのサーバープロセス経由で多数のロールをルーティングするランタイムに便利です。

`AGENT_ID` が未設定の場合、メモリはスコープなしのまま(従来の挙動、タグなし・フィルタなし)。

### ポート

agentmemory + iii-engine はデフォルトで 4 つのポートをバインドします。再起動が `port in use` で失敗する場合、この表でどのプロセスを探せばよいか分かります。

| ポート | プロセス | 用途 | 環境変数で上書き |
|------|---------|---------|--------------|
| `3111` | agentmemory | REST API + MCP HTTP + `/agentmemory/health` + `/agentmemory/livez` | `III_REST_PORT` |
| `3112` | iii-engine | 内部ストリーム worker(agentmemory + ビューワーが消費) | `III_STREAMS_PORT` |
| `3113` | agentmemory | リアルタイムビューワー(`http://localhost:3113`) | `AGENTMEMORY_VIEWER_PORT` |
| `49134` | iii-engine | WebSocket — worker はここに登録、OTel テレメトリもここを流れる | `III_ENGINE_URL`(完全 URL、デフォルト `ws://localhost:49134`) |

クラッシュ後にポートが解放されないときの古いプロセス整理:

```bash
# macOS / Linux — 各ポートで動いているものを探して kill
lsof -i :3111,3112,3113,49134
pkill -f agentmemory || true
pkill -f 'iii ' || true

# Windows
netstat -ano | findstr ":3111 :3112 :3113 :49134"
taskkill /F /PID <pid>
```

`agentmemory stop` は正常終了時に worker と engine の pidfile を綺麗に回収します。上の手動クリーンアップは、どちらの pidfile も残っていないクラッシュ後の状態を対象とします。

### 設定ファイル

agentmemory のランタイム設定は、各シェルで変数を export するのではなく `~/.agentmemory/.env` に置いてください。ビューワーが `export ANTHROPIC_API_KEY=...` のようなセットアップヒントを表示したら、これをこのファイルに `ANTHROPIC_API_KEY=...` として(`export` プレフィックスなしで)コピーしてから agentmemory を再起動してください。

プロセスの環境変数も引き続き有効で、ファイルの値より優先されます。

Windows では同じファイルが `%USERPROFILE%\.agentmemory\.env` にあります:

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

API キーの代わりに Claude Code Pro/Max 購読でテストするには、明示的にオプトイン:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

グラフや統合の機能を使いたい場合は同じファイルでオン:

```env
GRAPH_EXTRACTION_ENABLED=true
CONSOLIDATION_ENABLED=true
```

### 環境変数

`~/.agentmemory/.env` を作成:

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

ポート `3111` 上の 124 エンドポイント。REST API はデフォルトで `127.0.0.1` にバインドします。`AGENTMEMORY_SECRET` が設定されている場合、保護されたエンドポイントは `Authorization: Bearer <secret>` を要求し、mesh sync エンドポイントは両ピアで `AGENTMEMORY_SECRET` を要求します。

<details>
<summary>主要エンドポイント</summary>

| メソッド | パス | 説明 |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | ヘルスチェック(常に公開) |
| `POST` | `/agentmemory/session/start` | セッション開始 + コンテキスト取得 |
| `POST` | `/agentmemory/session/end` | セッション終了 |
| `POST` | `/agentmemory/observe` | 観測キャプチャ |
| `POST` | `/agentmemory/smart-search` | ハイブリッド検索 |
| `POST` | `/agentmemory/context` | コンテキスト生成 |
| `POST` | `/agentmemory/remember` | 長期メモリに保存 |
| `POST` | `/agentmemory/forget` | 観測の削除 |
| `POST` | `/agentmemory/enrich` | ファイルコンテキスト + メモリ + bug |
| `GET` | `/agentmemory/profile` | プロジェクトプロファイル |
| `GET` | `/agentmemory/export` | 全データをエクスポート |
| `POST` | `/agentmemory/import` | JSON からインポート |
| `POST` | `/agentmemory/graph/query` | ナレッジグラフ照会 |
| `POST` | `/agentmemory/team/share` | チームと共有 |
| `GET` | `/agentmemory/audit` | 監査証跡 |

完全なエンドポイント一覧:[`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Development" height="32" /></picture></h2>

```bash
npm run dev               # ホットリロード
npm run build             # 本番ビルド
npm test                  # 950+ テスト
npm run test:integration  # API テスト(サービス起動が必要)
```

**前提:** Node.js >= 20、[iii-engine](https://iii.dev/docs) または Docker

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="License" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
