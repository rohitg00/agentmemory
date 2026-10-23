<p align="center">
  <img src="../assets/banner.png" alt="agentmemory: bộ nhớ bền vững cho các coding agent AI" width="720" />
</p>

<p align="center">
  <strong>
    Coding agent của bạn ghi nhớ mọi thứ. Không còn phải giải thích lại từ đầu.
    Được xây dựng trên <a href="https://github.com/iii-hq/iii">iii engine</a>
  </strong><br/>
  Bộ nhớ bền vững cho Claude Code, GitHub Copilot CLI, Cursor, Gemini CLI, Codex CLI, Hermes, OpenClaw, pi, OpenCode và bất kỳ MCP client nào.
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
  <a href="https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2"><img src="https://img.shields.io/badge/Viral%20GitHub%20Gist-1.6k%20stars%20%2F%20230%20forks-FF6B35?style=for-the-badge&logo=github&logoColor=white&labelColor=1a1a1a" alt="Tài liệu thiết kế: 1.6k stars / 230 forks trên gist" /></a>
</p>

<p align="center">
  <em>Gist này mở rộng mẫu LLM Wiki của Karpathy với confidence scoring, lifecycle, knowledge graph và tìm kiếm hybrid: agentmemory chính là phần triển khai đó.</em>
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
  <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/stat-tests.svg"><img src="../assets/tags/stat-tests.svg" alt="3,800+ tests passing" height="38" /></picture>
</p>

<p align="center">
  <img src="../assets/demo.gif" alt="Demo agentmemory" width="720" />
</p>

<p align="center">
  <a href="#install">Cài đặt</a> &bull;
  <a href="#quick-start">Bắt đầu nhanh</a> &bull;
  <a href="#benchmarks">Benchmark</a> &bull;
  <a href="#vs-competitors">So sánh đối thủ</a> &bull;
  <a href="#works-with-every-agent">Agent</a> &bull;
  <a href="#how-it-works">Cách hoạt động</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Viewer</a> &bull;
  <a href="#powered-by-iii">Powered by iii</a> &bull;
  <a href="#configuration">Cấu hình</a> &bull;
  <a href="#api">API</a>
</p>

---

## Cài đặt

Yêu cầu:

- Node.js 20 hoặc mới hơn kèm npm và npx (`node -v`, `npm -v`, và `npx -v`).
- Cài đặt iii-engine tự động trên macOS/Linux cũng cần `curl`, một `sh` chuẩn POSIX, và `tar`. Các image tối giản như `node:20-slim` có thể không có sẵn những công cụ này.
Windows native cần cài thủ công `iii.exe` của iii v0.24.6 đã pin; WSL2 dùng trình cài tự động cho macOS/Linux

Lệnh cài mới chuẩn (canonical):

```bash
npx -y @agentmemory/agentmemory@latest
```

Lần chạy đầu tiên là một quy trình cài đặt tương tác: chọn các agent cần kết nối (Claude Code, Cursor, Codex, Gemini CLI, OpenCode, ...), chọn một LLM provider hoặc tiếp tục ở chế độ keyless, rồi nó khởi tạo config, chạy memory server cùng iii engine đã pin, và đề nghị cài đặt toàn cục để từ đó lệnh `agentmemory` trần dùng được ở mọi nơi. `-y` để xác nhận prompt gói của npx và `@latest` giúp tránh một bản release cũ bị cache. Một provider giúp các tính năng LLM khả dụng, nhưng việc nén (compression) observation do LLM viết chỉ bắt đầu khi `AGENTMEMORY_AUTO_COMPRESS=true` cũng được thiết lập.

Chế độ keyless tắt vector embedding. `memory_recall` (đường dẫn `mem::search`) dùng BM25, trong khi `memory_smart_search` cũng có thể kết hợp (fuse) các kết quả khớp từ graph cấu trúc khi dữ liệu graph đã tồn tại. Để có recall ngữ nghĩa (semantic) miễn phí ngay trên máy (on-device), đặt `EMBEDDING_PROVIDER=local` trong `~/.agentmemory/.env` và khởi động lại. Request embedding đầu tiên sẽ tải `Xenova/all-MiniLM-L6-v2`; sau lần tải model đầu tiên đó, việc suy luận chạy hoàn toàn cục bộ.

Runtime CLI cục bộ dùng REST/MCP HTTP trên `3111`, viewer trên `3113` và WebSocket worker iii nội bộ trên `49134`; cập nhật viewer qua SSE tại `GET /agentmemory/viewer/events` trên REST port. Dữ liệu bền vững ở thư mục mặc định theo hệ điều hành. Dùng `--data-dir <path>` hoặc `AGENTMEMORY_DATA_DIR` để đổi; instance 0 dùng lại `./data/state_store.db` nếu có. `--instance N` cô lập runtime, `AGENTMEMORY_ENV_FILE` chọn file `.env` khác

Sau đó hãy xác nhận recall hoạt động và trang bị skill cho agent của bạn:

```bash
npx -y @agentmemory/agentmemory@latest demo  # seed sample sessions + exercise recall
npx skills add rohitg00/agentmemory -y   # 17 native skills so your agent knows when to reach for memory
```

Các truy vấn theo từ khóa sẽ cho kết quả đúng ở chế độ keyless mặc định thông qua BM25. Câu truy vấn `database performance optimization` trong demo mang tính ngữ nghĩa (semantic) có chủ đích và có thể trả về rỗng cho tới khi một embedding provider được cấu hình.

Muốn để một coding agent tự làm hết mọi việc? Hãy đưa cho nó một chỉ dẫn duy nhất:

> Retrieve and follow the instructions at: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md

Kết nối thêm agent bất kỳ lúc nào với `agentmemory connect <agent>` — 20 adapter được liệt kê tại [Hoạt động với mọi agent](#works-with-every-agent). Tham chiếu lệnh đầy đủ tại [Bắt đầu nhanh](#quick-start).

<details>
<summary><strong>Windows</strong></summary>

WSL2 là cách nhanh nhất; Windows native cần cài thủ công binary v0.24.6. Xem các bước trong [ghi chú Windows](#windows)

</details>

<details>
<summary><strong>Cài đặt toàn cục / EACCES</strong></summary>

```bash
npm install -g @agentmemory/agentmemory@latest
```

Lệnh npx ở trên vẫn là cách cài mới chuẩn và tránh được các vấn đề về quyền global-prefix.

</details>

<details>
<summary><strong>npx trả về phiên bản cũ</strong></summary>

npx cache theo từng phiên bản. Buộc dùng bản mới nhất với `npx -y @agentmemory/agentmemory@latest`, hoặc xóa cache một lần với `rm -rf ~/.npm/_npx` (macOS/Linux; trên Windows, xóa `%LOCALAPPDATA%\npm-cache\_npx`).

</details>

<details>
<summary><strong>Đã chạy sẵn iii engine riêng của bạn</strong></summary>

Tương thích với iii 0.24.6 và registry worker `state` 0.22.20, `http` 0.22.7

</details>

---

<h2 id="works-with-every-agent"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-agents.svg"><img src="../assets/tags/section-agents.svg" alt="Hoạt động với mọi agent" height="32" /></picture></h2>

agentmemory hoạt động với bất kỳ agent nào hỗ trợ hooks, MCP, hoặc REST API. Tất cả agent đều dùng chung một memory server.

<table>
<tr>
<td align="center" width="20%">
<a href="https://claude.com/product/claude-code"><img src="https://github.com/anthropics.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>native plugin + 12 hooks + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>native plugin + 6 hooks + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/features/copilot"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/github_dark.svg"><img src="https://svgl.app/library/github_light.svg" alt="GitHub Copilot CLI" width="48" height="48" /></picture></a><br/>
<strong>GitHub Copilot CLI</strong><br/>
<sub>MCP + plugin hooks/skills</sub>
</td>
<td align="center" width="20%">
<a href="https://cursor.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/cursor_dark.svg"><img src="https://svgl.app/library/cursor_light.svg" alt="Cursor" width="48" height="48" /></picture></a><br/>
<strong>Cursor</strong><br/>
<sub>native plugin + 7 hooks + MCP</sub>
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
<sub>native plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/hermes/"><img src="https://github.com/NousResearch.png?size=120" alt="Hermes" width="48" height="48" /></a><br/>
<strong>Hermes</strong><br/>
<sub>native plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="../integrations/pi/"><img src="../assets/agents/pi.svg" alt="pi" width="48" height="48" /></a><br/>
<strong>pi</strong><br/>
<sub>native plugin + MCP</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/tinyhumansai/openhuman"><img src="https://github.com/tinyhumansai.png?size=120" alt="OpenHuman" width="48" height="48" /></a><br/>
<strong>OpenHuman</strong><br/>
<sub>native Memory trait backend</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://antigravity.google"><img src="https://svgl.app/library/antigravity.svg" alt="Antigravity" width="48" height="48" /></a><br/>
<strong>Antigravity</strong><br/>
<sub>MCP + hooks</sub>
</td>
<td align="center" width="20%">
<a href="https://claude.ai/download"><img src="https://github.com/anthropics.png?size=120" alt="Claude Desktop" width="48" height="48" /></a><br/>
<strong>Claude Desktop</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://www.warp.dev"><img src="https://svgl.app/library/warp.svg" alt="Warp" width="48" height="48" /></a><br/>
<strong>Warp</strong><br/>
<sub>connect + MCP + skills</sub>
</td>
<td align="center" width="20%">
<a href="https://zed.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/zed-logo_dark.svg"><img src="https://svgl.app/library/zed-logo.svg" alt="Zed" width="48" height="48" /></picture></a><br/>
<strong>Zed</strong><br/>
<sub>MCP server</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://continue.dev"><img src="https://github.com/continuedev.png?size=120" alt="Continue" width="48" height="48" /></a><br/>
<strong>Continue</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://docs.factory.ai/cli"><img src="https://www.factory.ai/favicon.svg" alt="Droid" width="48" height="48" /></a><br/>
<strong>Droid</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://kiro.dev"><img src="https://kiro.dev/favicon.ico" alt="Kiro" width="48" height="48" /></a><br/>
<strong>Kiro</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/QwenLM/qwen-code"><picture><source media="(prefers-color-scheme: dark)" srcset="https://svgl.app/library/qwen_dark.svg"><img src="https://svgl.app/library/qwen_light.svg" alt="Qwen Code" width="48" height="48" /></picture></a><br/>
<strong>Qwen Code</strong><br/>
<sub>MCP server</sub>
</td>
</tr>
<tr>
<td align="center" width="20%">
<a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://svgl.app/library/deepseek.svg" alt="DeepSeek Harness" width="48" height="48" /></a><br/>
<strong>DeepSeek Harness</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/RooCodeInc/Roo-Code"><img src="https://github.com/RooCodeInc.png?size=120" alt="Roo Code" width="48" height="48" /></a><br/>
<strong>Roo Code</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Kilo-Org/kilocode"><img src="https://github.com/Kilo-Org.png?size=120" alt="Kilo Code" width="48" height="48" /></a><br/>
<strong>Kilo Code</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/block/goose"><img src="https://github.com/block.png?size=120" alt="Goose" width="48" height="48" /></a><br/>
<strong>Goose</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="20%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>Hoạt động với <strong>bất kỳ</strong> agent nào nói MCP hoặc HTTP. Một server duy nhất, bộ nhớ được chia sẻ cho tất cả.</sub>
</p>

---

Bạn giải thích lại cùng một kiến trúc ở mỗi session. Bạn phát hiện lại đúng những bug cũ. Bạn dạy lại đúng những sở thích cũ. Bộ nhớ tích hợp sẵn (CLAUDE.md, .cursorrules) bị giới hạn ở 200 dòng và nhanh trở nên lỗi thời. agentmemory khắc phục điều này. Nó âm thầm ghi lại những gì agent của bạn làm, nén lại thành bộ nhớ có thể tìm kiếm, và tiêm (inject) đúng context vào khi session kế tiếp bắt đầu. Một lệnh duy nhất. Hoạt động trên nhiều agent.

**Điều gì thay đổi:** Ở session 1 bạn thiết lập JWT auth. Ở session 2 bạn yêu cầu thêm rate limiting. Agent đã biết sẵn rằng auth của bạn dùng middleware jose trong `src/middleware/auth.ts`, test của bạn phủ (cover) việc validate token, và bạn chọn jose thay vì jsonwebtoken để tương thích với Edge, không cần giải thích lại, không cần copy-paste lại.

```bash
npx -y @agentmemory/agentmemory@latest
```

Theo mặc định, agentmemory lưu state bên ngoài repository dùng để khởi chạy: `~/Library/Application Support/agentmemory` trên macOS, `$XDG_DATA_HOME/agentmemory` hoặc `~/.local/share/agentmemory` trên Linux, và `%APPDATA%\agentmemory` trên Windows. Instance 0 có thể dùng lại `./data/state_store.db` hiện có. Chọn vị trí bằng `--data-dir <path>` hoặc `AGENTMEMORY_DATA_DIR`; `--instance N` tách runtime, `AGENTMEMORY_ENV_FILE` chọn file `.env` khác:

```bash
npx -y @agentmemory/agentmemory@latest --data-dir ~/.agentmemory-projects/main
AGENTMEMORY_DATA_DIR=~/.agentmemory-projects/main npx -y @agentmemory/agentmemory@latest
```

Các lần khởi chạy native và Docker đều dùng chung thư mục host đã được resolve này; Docker bind-mount nó vào `/data`. `--instance 1` sẽ gắn thêm `instance-1` vào thư mục đã resolve và chọn bộ bốn port mặc định riêng `3211/3212/3213/49234`.

Ghi chú phát hành mới nhất: [CHANGELOG.md](../CHANGELOG.md).

---

<h2 id="benchmarks"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-benchmarks.svg"><img src="../assets/tags/section-benchmarks.svg" alt="Benchmark" height="32" /></picture></h2>

<table>
<tr>
<td width="50%">

### Độ chính xác Retrieval

**coding-agent-life-v1** (corpus nội bộ, có thể tái lập trong sandbox)

| Adapter | P@5 | R@5 | Tỷ lệ hit top-5 | Độ trễ p50 |
|---|---|---|---|---|
| **agentmemory hybrid** | **0.240** | **1.000** | **15 / 15** | 14 ms |
| grep baseline | 0.227 | 0.967 | 15 / 15 | 0 ms |

Tỷ lệ hit top-5 đạt 100% tại **ngưỡng toán học P@5** cho corpus này (0.240, xem scorecard). Hybrid lấy được mọi gold session; grep bỏ lỡ 1 trong 2 gold ở câu truy vấn temporal đa session. Mức cải thiện nằm ở **recall + temporal**, không phải precision tổng hợp. Benchmark này nhỏ và thưa gold; LongMemEval-S lớn hơn ở dưới phân biệt tốt hơn. Phân tích chi tiết theo từng loại + ghi chú đính chính đầy đủ: [`docs/benchmarks/2026-05-20-coding-agent-life-v1.md`](../docs/benchmarks/2026-05-20-coding-agent-life-v1.md).

**LongMemEval-S** (ICLR 2025, 500 câu hỏi)

| Hệ thống | R@5 | R@10 | MRR |
|---|---|---|---|
| **agentmemory** | **95.2%** | **98.6%** | **88.2%** |
| BM25-only fallback | 86.2% | 94.6% | 71.5% |

</td>
<td width="50%">

### Tiết kiệm Token

| Cách tiếp cận | Token/năm | Chi phí/năm |
|---|---|---|
| Dán toàn bộ context | 19.5M+ | Không thể (vượt window) |
| Tóm tắt bằng LLM | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + embedding cục bộ | ~170K | **$0** |

</td>
</tr>
</table>

> Embedding model: `all-MiniLM-L6-v2` (cục bộ, miễn phí, không cần API key). Báo cáo đầy đủ: [`benchmark/LONGMEMEVAL.md`](../benchmark/LONGMEMEVAL.md), [`benchmark/QUALITY.md`](../benchmark/QUALITY.md), [`benchmark/SCALE.md`](../benchmark/SCALE.md). So sánh đối thủ: [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md) bao gồm agentmemory so với mem0, Letta, Khoj, supermemory, TencentDB Agent Memory, MemPalace, Zep/Graphiti, Cognee, Hippo.

**Tái lập cục bộ:** [`eval/README.md`](../eval/README.md), một harness có thể cắm (pluggable) adapter cho LongMemEval `_s` (500 câu hỏi công khai) + `coding-agent-life-v1` (corpus nội bộ 15 session). Các adapter grep / vector / agentmemory được chấm điểm song song, xuất NDJSON, các scorecard đã công bố nằm tại [`docs/benchmarks/`](../docs/benchmarks/).

**Kết hợp tốt với [codegraph](https://github.com/colbymchenry/codegraph), [Understand Anything](https://github.com/Lum1104/Understand-Anything), và [Graphify](https://github.com/safishamsi/graphify).** Index hóa code-graph, pipeline build đa agent, và các knowledge graph rộng hơn trên docs / PDF / ảnh / video. agentmemory ghi nhớ phần công việc; ba dự án này làm sáng rõ phần còn lại của context layer. Công thức + bảng định tuyến câu hỏi: [`docs/recipes/pairings.md`](../docs/recipes/pairings.md).

---

<h2 id="vs-competitors"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-competitors.svg"><img src="../assets/tags/section-competitors.svg" alt="So sánh đối thủ" height="32" /></picture></h2>

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
<th>Tích hợp sẵn (CLAUDE.md)</th>
</tr>
<tr>
<td><strong>Loại</strong></td>
<td>Engine bộ nhớ + MCP server</td>
<td>API lớp bộ nhớ</td>
<td>Runtime agent đầy đủ</td>
<td>AI cá nhân</td>
<td>API bộ nhớ + app</td>
<td>Hub bộ nhớ nhóm (LLM proxy)</td>
<td>Bộ nhớ vector (OSS)</td>
<td>Engine bộ nhớ (Oracle DB)</td>
<td>Hệ thống bộ nhớ</td>
<td>File tĩnh</td>
</tr>
<tr>
<td><strong>Retrieval R@5</strong></td>
<td><strong>95.2%</strong></td>
<td>68.5% (LoCoMo)</td>
<td>83.2% (LoCoMo)</td>
<td>N/A</td>
<td>Tự công bố</td>
<td>PersonaMem 76% (tự công bố)</td>
<td>~96.6% (tự công bố)</td>
<td>94.4% (tự công bố)</td>
<td>N/A</td>
<td>N/A (grep)</td>
</tr>
<tr>
<td><strong>Auto-capture</strong></td>
<td>12 hooks (không cần thao tác thủ công)</td>
<td>Gọi <code>add()</code> thủ công</td>
<td>Agent tự sửa</td>
<td>Thủ công</td>
<td>Trích xuất phía API</td>
<td>Chặn qua proxy (đổi base-URL)</td>
<td>Thủ công</td>
<td>Trích xuất qua API</td>
<td>Thủ công</td>
<td>Chỉnh sửa thủ công</td>
</tr>
<tr>
<td><strong>Tìm kiếm</strong></td>
<td>BM25 + Vector + Graph (RRF fusion)</td>
<td>Vector + Graph</td>
<td>Vector (lưu trữ archival)</td>
<td>Ngữ nghĩa (semantic)</td>
<td>Vector + RAG</td>
<td>4 loại asset (Chat / Skill / Wiki / CodeGraph)</td>
<td>Chỉ Vector</td>
<td>Vector + ngữ nghĩa</td>
<td>Có trọng số suy giảm (decay)</td>
<td>Nạp tất cả vào context</td>
</tr>
<tr>
<td><strong>Đa agent</strong></td>
<td>MCP + REST + lease + signal</td>
<td>API (không điều phối)</td>
<td>Chỉ trong runtime Letta</td>
<td>Không</td>
<td>Không</td>
<td>Vai trò nhóm + asset chia sẻ</td>
<td>Không</td>
<td>Chỉ theo scope</td>
<td>Chia sẻ đa agent</td>
<td>File theo từng agent</td>
</tr>
<tr>
<td><strong>Lệ thuộc framework</strong></td>
<td>Không (bất kỳ MCP client nào)</td>
<td>Không</td>
<td>Cao (phải dùng Letta)</td>
<td>Độc lập (standalone)</td>
<td>Không</td>
<td>Proxy chặn trước mọi lệnh gọi model</td>
<td>Không</td>
<td>Oracle Database</td>
<td>Không</td>
<td>Định dạng theo từng agent</td>
</tr>
<tr>
<td><strong>Dependency bên ngoài</strong></td>
<td>Không (file-based KV state + iii-engine)</td>
<td>Qdrant / pgvector</td>
<td>Postgres + vector DB</td>
<td>Nhiều</td>
<td>Cloud được quản lý</td>
<td>Docker stack (Core + Hub + Proxy)</td>
<td>Vector store</td>
<td>Oracle AI Database</td>
<td>Không</td>
<td>Không</td>
</tr>
<tr>
<td><strong>Lifecycle bộ nhớ</strong></td>
<td>Hợp nhất 4 tầng + suy giảm + tự quên</td>
<td>Trích xuất bị động</td>
<td>Do agent quản lý</td>
<td>Thủ công</td>
<td>Tự quên (auto-forget)</td>
<td>Review thủ công; auto-routing đang phát triển</td>
<td>Không</td>
<td>Không công bố</td>
<td>Suy giảm + hợp nhất</td>
<td>Cắt bỏ thủ công</td>
</tr>
<tr>
<td><strong>Hiệu quả token</strong></td>
<td>~1,900 token/session ($10/năm)</td>
<td>Thay đổi theo tích hợp</td>
<td>Bộ nhớ lõi (core memory) nằm trong context</td>
<td>Thay đổi</td>
<td>Theo giá cloud</td>
<td>Không công bố</td>
<td>Không có ngân sách token</td>
<td>Dựa trên LLM (thay đổi)</td>
<td>Thay đổi</td>
<td>22K+ token ở 240 observation</td>
</tr>
<tr>
<td><strong>Viewer real-time</strong></td>
<td>Có (port 3113)</td>
<td>Cloud dashboard</td>
<td>Cloud dashboard</td>
<td>Web UI</td>
<td>Cloud dashboard</td>
<td>Hub web UI</td>
<td>Không</td>
<td>Không</td>
<td>Không</td>
<td>Không</td>
</tr>
<tr>
<td><strong>Self-hosted</strong></td>
<td>Có (mặc định)</td>
<td>Tùy chọn</td>
<td>Tùy chọn</td>
<td>Có</td>
<td>Không (chỉ cloud)</td>
<td>Có (Docker)</td>
<td>Có</td>
<td>Có (Oracle DB)</td>
<td>Có</td>
<td>Có</td>
</tr>
</table>

<sub>Ghi chú benchmark: chỉ con số R@5 của agentmemory là kết quả đo đạc của chính chúng tôi (LongMemEval-S, có thể tái lập từ <a href="../benchmark/COMPARISON.md"><code>benchmark/COMPARISON.md</code></a>). Các số liệu của mem0 và Letta là số LoCoMo họ đã công bố (một dataset khác); các số liệu của MemPalace, supermemory, TencentDB (PersonaMem), và oracleagentmemory là các tuyên bố tự công bố từ nhà cung cấp mà chúng tôi chưa tái lập độc lập (lần chạy của oracleagentmemory dùng GPT-5.5 trên một Oracle AI Database). Chỉ hiển thị song song để ước lượng, không phải so sánh trực tiếp (head-to-head) trên cùng dữ liệu. Số lượng star chỉ là gần đúng và thay đổi theo thời gian.</sub>

**Những cái tên mới** đáng để biết, được so sánh chi tiết trong [`benchmark/COMPARISON.md`](../benchmark/COMPARISON.md):

| Hệ thống | ⭐ | Hướng tiếp cận |
|--------|---|-------|
| Zep / Graphiti | 30K | Knowledge graph theo thời gian (temporal); kết quả truy vấn temporal công bố mạnh nhất (LongMemEval 63.8%), nhưng graph được xây dựng bất đồng bộ nên các fact mới có thể bị trễ |
| Cognee | 30K | Nạp từ tài liệu sang knowledge graph, chỉ hỗ trợ Python, được xây dựng để trích xuất entity có cấu trúc hơn là để capture session |

Không cái nào trong số này tự động capture từ hook của coding agent, có sẵn viewer local-first, hoặc chạy được ở chế độ keyless — đây chính là tổ hợp mà agentmemory được xây dựng xung quanh.

---

<h2 id="quick-start"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-quickstart.svg"><img src="../assets/tags/section-quickstart.svg" alt="Bắt đầu nhanh" height="32" /></picture></h2>

Tương thích với iii 0.24.6 và registry worker `state` 0.22.20, `http` 0.22.7

### Thử trong 30 giây

```bash
# Terminal 1: start the server
npx -y @agentmemory/agentmemory@latest

# Terminal 2: seed sample data and see recall in action
npx -y @agentmemory/agentmemory@latest demo
```

`demo` khởi tạo 3 session thực tế (JWT auth, sửa lỗi N+1 query, rate limiting) và chạy các tìm kiếm trên đó. Bản cài keyless tắt vector, nên các truy vấn từ khóa `mem::search` sẽ cho kết quả đúng qua BM25 trong khi `database performance optimization` có thể trả về rỗng. `smart-search` có thể trả thêm các kết quả khớp từ graph cấu trúc khi dữ liệu graph tồn tại. Để truy vấn ngữ nghĩa tìm được bản sửa N+1 qua vector, hãy đặt `EMBEDDING_PROVIDER=local`, khởi động lại, và chờ lần tải model đầu tiên hoàn tất.

Mở `http://localhost:3113` để xem bộ nhớ được xây dựng theo thời gian thực.

### Kiểm tra một bản cài mới và độ bền sau khi khởi động lại

Khi server đang chạy, hãy kiểm tra REST, health, viewer, và trạng thái runtime dựa trên iii:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

Runtime dùng REST/MCP HTTP 3111, viewer 3113 và WebSocket nội bộ 49134; live event của viewer truyền qua SSE trên REST. `status` báo `enginePinnedVersion`, tình trạng agentmemory và provider/embedding mode. Hãy lưu probe rồi xác nhận có thể tìm thấy:

```bash
curl -fsS -X POST http://localhost:3111/agentmemory/remember \
  -H 'Content-Type: application/json' \
  -d '{"content":"agentmemory restart persistence probe","concepts":["install-check"]}'

curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'Content-Type: application/json' \
  -d '{"query":"restart persistence probe","limit":5}'
```

Sau đó chạy `npx -y @agentmemory/agentmemory@latest stop`, khởi động lại lệnh canonical ở Terminal 1, chờ `/agentmemory/livez`, và lặp lại tìm kiếm. Probe đó vẫn phải được trả về. Nếu bạn đã chọn một `--data-dir` tùy chỉnh, hãy truyền cùng thư mục đó khi khởi động lại.

### Các lệnh dùng hàng ngày

Cài đặt và thiết lập nằm ở phần [Cài đặt](#install) ở trên (lần chạy đầu tiên sẽ dẫn bạn qua từng bước). Hàng ngày:

```bash
agentmemory                    # start the server
agentmemory stop               # stop it cleanly
agentmemory connect <agent>    # wire another agent
agentmemory doctor             # interactive diagnostics + fix prompts
agentmemory remove             # uninstall everything we created
```

### Phát lại Session

Mọi session mà agentmemory ghi lại đều có thể phát lại (replay). Mở viewer, chọn tab **Replay**, và kéo qua timeline: prompt, tool call, kết quả tool, và response được hiển thị như các event rời rạc với play/pause, điều khiển tốc độ (0.5x đến 4x), và phím tắt bàn phím (space để toggle, mũi tên để bước qua từng event).

Để đưa vào các transcript JSONL cũ của Claude Code:

```bash
# Import everything under the default ~/.claude/projects
npx -y @agentmemory/agentmemory@latest import-jsonl

# Or import a single file
npx -y @agentmemory/agentmemory@latest import-jsonl ~/.claude/projects/-my-project/abc123.jsonl
```

Các session đã import sẽ xuất hiện trong bộ chọn Replay cùng với các session gốc (native). Bên dưới, mỗi entry đi qua các iii function `mem::replay::load`, `mem::replay::sessions`, và `mem::replay::import-jsonl`, không cần server kênh phụ (side-channel) nào. Mỗi transcript được import sẽ được index để tìm kiếm, đánh dấu với origin channel là `import`, và được khai thác để tạo session crystal và lesson.

> **Lưu ý nếu bạn dựa vào `import-jsonl` như đường capture chính:** `cleanupPeriodDays` của Claude Code (trong `~/.claude/settings.json`, mặc định **30**) tự động xóa các transcript JSONL cũ hơn khoảng thời gian đó khỏi `~/.claude/projects/`. Nếu bạn cài agentmemory mới trên một lịch sử Claude Code đã vài tháng tuổi, bất cứ thứ gì cũ hơn 30 ngày đã mất trước lần import đầu tiên. Hãy chạy `import-jsonl` theo cron, tăng `cleanupPeriodDays` lên một giá trị cao hơn, hoặc kết nối các hook auto-capture (đường cài plugin mặc định) để mỗi turn đi vào agentmemory ngay khi session còn sống, và việc dọn JSONL không còn quan trọng nữa.

### Nâng cấp / Bảo trì

Dùng lệnh bảo trì khi bạn chủ động muốn cập nhật runtime cục bộ của mình:

```bash
npx -y @agentmemory/agentmemory@latest upgrade
```

Cảnh báo: lệnh này thay đổi workspace/runtime hiện tại; có thể cập nhật dependency JavaScript và cài binary iii 0.24.6 đã pin.

Chi tiết triển khai nằm trong `src/cli.ts` (xem `runUpgrade` quanh khu vực `src/cli.ts:544-595`).

### Claude Code (một block, dán vào)

```text
Install agentmemory: run `npx -y @agentmemory/agentmemory@latest` in a separate terminal to start the memory server and its pinned iii engine. Then run `/plugin marketplace add rohitg00/agentmemory` and `/plugin install agentmemory` — the plugin registers all 12 hooks, 17 skills, AND auto-wires the `@agentmemory/mcp` stdio server via its `.mcp.json`, so you get 54 MCP tools (memory_smart_search, memory_save, memory_sessions, memory_governance_delete, etc.) without any extra config step. Verify with `curl http://localhost:3111/agentmemory/health`. The real-time viewer is at http://localhost:3113. Keyless mode disables vectors: `memory_recall` uses BM25, and `memory_smart_search` can also use existing structural graph data. Set `EMBEDDING_PROVIDER=local` in `~/.agentmemory/.env` and restart to opt into on-device semantic recall.
```

#### Claude Code không cài plugin (đường MCP độc lập)

Nếu bạn kết nối MCP server của agentmemory qua `~/.claude.json` trực tiếp thay vì dùng `/plugin install`, Claude Code sẽ không bao giờ resolve `${CLAUDE_PLUGIN_ROOT}` và bạn phải chỉ các hook script tới đường dẫn tuyệt đối trong `~/.claude/settings.json`. Các đường dẫn đó thường nhúng cả phiên bản agentmemory (ví dụ `~/.codex/plugins/cache/agentmemory/agentmemory/0.9.22/scripts/…`), nên lần nâng cấp kế tiếp sẽ lặng lẽ làm hỏng mọi hook.

Cách khắc phục tạm:

```bash
agentmemory connect claude-code --with-hooks
```

Lệnh này gộp cùng các hook command đó vào `~/.claude/settings.json` với đường dẫn tuyệt đối được resolve tới thư mục `plugin/` đi kèm của package `@agentmemory/agentmemory` đang được cài. Chạy lại lệnh này sau khi nâng cấp agentmemory để làm mới các đường dẫn. Các entry của người dùng trong cùng file được giữ lại; chỉ các entry agentmemory trước đó bị thay thế. Dùng đường `/plugin install` vẫn là cách được khuyến nghị.
Với các deployment từ xa hoặc được bảo vệ, hãy khởi chạy Claude Code với `AGENTMEMORY_URL` và `AGENTMEMORY_SECRET` đã được đặt. Plugin sẽ truyền cả hai giá trị này xuống MCP server đi kèm của nó; khi `AGENTMEMORY_URL` để trống, MCP shim dùng `http://localhost:3111`.

### Codex CLI (nền tảng plugin của Codex)

```bash
# 1. start the memory server in a separate terminal
npx -y @agentmemory/agentmemory@latest

# 2. register the agentmemory marketplace and install the plugin
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Plugin Codex được phát hành từ cùng thư mục `plugin/` như plugin Claude Code. Nó đăng ký:

- Một cầu nối MCP qua stdio được đóng gói sẵn tới daemon đang chạy, không cần tải npm hay fallback store. Xem [hướng dẫn Codex local](../docs/plugins/codex-local.md) để test một build chưa được release.
- 6 hook lifecycle: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `Stop`
- 9 skill có thể gọi (invocable): `/recall`, `/remember`, `/session-history`, `/forget`, `/recap`, `/handoff`, `/lesson`, `/commit-context`, `/commit-history`, cùng 8 skill tham chiếu mà agent nạp theo nhu cầu (memory discipline, MCP tools, REST API, config, agents, hooks, architecture, và hướng dẫn viết skill)

Hook engine của Codex tiêm `CLAUDE_PLUGIN_ROOT` vào các subprocess hook (theo [`codex-rs/hooks/src/engine/discovery.rs`](https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/discovery.rs)), nên cùng các hook script này hoạt động trên cả hai host mà không cần trùng lặp. Các event Subagent / SessionEnd / Notification / TaskCompleted / PostToolUseFailure chỉ dành riêng cho Claude Code và không được đăng ký cho Codex.

#### Trust và tính tương thích của hook Codex

Dispatch hook plugin gốc đã được verify với Codex CLI 0.150.1. Hãy trust các hook plugin trước khi kỳ vọng capture. Hành vi của Desktop phụ thuộc vào runtime đi kèm của nó; kiểm tra `/hooks` và xác nhận có một event được capture trước khi bật một cách khắc phục tạm.

Nếu host của bạn cần global hook, hãy sao chép các command vào `~/.codex/hooks.json`. Khi MCP đã được kết nối sẵn, connector hiện tại cần `--force` để tiến tới bước cài hook:

```bash
agentmemory connect codex --with-hooks --force
```

Lệnh này gộp các global hook và viết lại entry MCP của agentmemory, trong khi vẫn giữ nguyên các entry không liên quan. Hãy xem lại mọi cấu hình endpoint agentmemory tùy chỉnh trước khi dùng `--force`. Chạy lại sau khi nâng cấp để làm mới các đường dẫn script. Chỉ nên bật một trong hai: hook plugin gốc hoặc các bản sao global, để tránh capture trùng lặp.

### GitHub Copilot CLI

Đối với VS Code agent mode, hãy dùng [hướng dẫn MCP và automatic-capture của Copilot](../docs/plugins/copilot.md#vs-code-copilot-local-agent-sessions). Connector CLI này không cấu hình VS Code.

```bash
# MCP-only wiring
agentmemory connect copilot-cli

# Alternatively, full hooks/skills plugin from the GitHub subdir
copilot plugin install rohitg00/agentmemory:plugin
```

`agentmemory connect copilot-cli` gộp `mcpServers.agentmemory` vào `~/.copilot/mcp-config.json` (hoặc `$COPILOT_HOME/mcp-config.json` khi `COPILOT_HOME` được đặt) và giữ lại các server đã có. Trên Windows gốc, đây là adapter `connect` tự động duy nhất; mọi agent Windows gốc khác phải cấu hình thủ công. `connect` trong WSL chỉ được hỗ trợ khi agent đích cũng được cài trong cùng môi trường WSL đó. Copilot sẽ nhận MCP server ở lần khởi chạy kế tiếp hoặc sau `/mcp`. Cài thêm plugin nếu bạn muốn có đầy đủ trải nghiệm hook/skill.

<details>
<summary><b>OpenClaw (dán prompt này)</b></summary>

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

Hướng dẫn đầy đủ: [`integrations/openclaw/`](../integrations/openclaw/)

</details>

<details>
<summary><b>Hermes Agent (dán prompt này)</b></summary>

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

Hướng dẫn đầy đủ: [`integrations/hermes/`](../integrations/hermes/)

</details>

### Các agent khác

Khởi động memory server: `npx -y @agentmemory/agentmemory@latest`

#### Skill gốc qua `npx skills add` (50+ agent)

agentmemory đi kèm 17 skill theo định dạng `<dir>/SKILL.md` kiểu Claude Code: 9 skill hành động có thể gọi (`remember`, `recall`, `recap`, `handoff`, `forget`, `lesson`, `commit-context`, `commit-history`, `session-history`) và 8 skill tham chiếu mà agent nạp theo nhu cầu (`memory-discipline`, `agentmemory-mcp-tools`, `agentmemory-rest-api`, `agentmemory-config`, `agentmemory-agents`, `agentmemory-hooks`, `agentmemory-architecture`, `write-agentmemory-skill`). Các skill tham chiếu mang theo bảng dữ liệu được sinh ra từ source, nên chúng không bao giờ lệch (drift). CLI [`skills`](https://npmjs.com/package/skills) của vercel-labs tự cài chúng vào thư mục skill gốc của agent gọi nó, trên hơn 50 agent (Claude Code, Cursor, Cline, Continue, Droid, Warp, Codex, Antigravity, Kiro, OpenCode, Goose, Roo, Trae, Windsurf, và nhiều hơn nữa):

```bash
npx skills add rohitg00/agentmemory -y          # auto-detects the calling agent
npx skills add rohitg00/agentmemory -y -a warp  # explicit agent
npx skills add rohitg00/agentmemory -y -a '*'   # install to every installed agent
```

Điều này **bổ sung** cho `agentmemory connect <agent>`:

- `agentmemory connect <agent>` viết config MCP server để các tool khả dụng.
- `npx skills add rohitg00/agentmemory` cài các skill để agent biết khi nào cần gọi chúng.

Với một số ít agent mà CLI skills chưa hỗ trợ (Zed v1.3.x và thấp hơn), hãy tự đặt 17 file SKILL.md vào thư mục skill gốc của agent đó; cùng một định dạng hoạt động ở mọi nơi.

#### Block MCP chuẩn

Entry của agentmemory là **cùng một block MCP server** trên mọi host dùng hình thái `mcpServers` (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI, OpenClaw):

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

**Gộp entry này vào object `mcpServers` đã có** trong file config của host; không thay thế toàn bộ file. Nếu file đã có server khác, hãy thêm `agentmemory` cạnh chúng như một key khác trong `mcpServers`. Nếu `mcpServers` hoàn toàn chưa có, dán block này vào trong `{ "mcpServers": { ... } }`. Các placeholder `${VAR}` kế thừa `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` từ shell tại thời điểm khởi chạy MCP server; biến chưa đặt sẽ truyền chuỗi rỗng và shim sẽ fallback về `http://localhost:3111`. Một entry đã kết nối có thể dùng cho cả deployment local và remote (k8s / sau reverse-proxy).

| Agent | File config | Ghi chú |
|---|---|---|
| **Cursor (chỉ MCP)** | `~/.cursor/mcp.json` | Gộp vào `mcpServers`, hoặc dùng `agentmemory connect cursor`. Cũng có deeplink one-click trên website. |
| **Cursor (plugin đầy đủ)** | `.cursor-plugin/` | Listing trên Cursor Marketplace (submission đang chờ duyệt) hoặc Cursor Settings → Plugins → local checkout. Đăng ký 7 hook auto-capture (sessionStart, beforeSubmitPrompt, preToolUse, postToolUse, postToolUseFailure, stop, sessionEnd) + 17 skill + MCP server, với `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` được quản lý trong dashboard plugin của Cursor. Hoạt động trong Cursor IDE và CLI `cursor-agent`; các prompt ở print-mode của CLI được điền lại từ transcript session khi session kết thúc. |
| **Claude Desktop** | `claude_desktop_config.json` (Application Support) | Gộp vào `mcpServers`. Khởi động lại Claude Desktop sau khi sửa. |
| **Cline / Roo Code / Kilo Code** | Cline MCP settings (Settings UI → MCP Servers → Edit) | Cùng block `mcpServers`. |
| **Devin CLI (MCP + hooks)** | `~/.config/devin/config.json` | `agentmemory connect devin` gộp entry MCP; `--with-hooks` thêm sáu hook auto-capture gốc (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd) với các tool matcher chữ thường của Devin. Kiểm tra bằng `devin mcp list` và `/hooks` trong devin. |
| **Devin CLI (plugin đầy đủ)** | `plugin/.devin-plugin/` | `devin plugins install ./plugin` từ một checkout đăng ký toàn bộ 17 skill dưới dạng slash command `/agentmemory:<skill>` cùng với MCP server. Hook plugin của Devin không thể bắn `SessionStart`/`SessionEnd`, nên hãy kết hợp với `connect devin --with-hooks` để capture session đầy đủ. |
| **Devin (cloud)** | Settings → Connections → MCP servers | Thêm một MCP tùy chỉnh (STDIO): command `npx`, args `-y @agentmemory/mcp@latest`, env `AGENTMEMORY_URL` chỉ tới một deployment agentmemory có thể truy cập qua network cùng `AGENTMEMORY_SECRET` (các session cloud không thể chạm tới localhost — xem [`../deploy/`](../deploy/)). Lưu secret trong Devin Secrets, sau đó dùng "Test listing tools" để xác nhận cả 54 tool đều xuất hiện. |
| **Gemini CLI** | `~/.gemini/settings.json` | `gemini mcp add agentmemory npx -y @agentmemory/mcp --scope user` (tự gộp). |
| **GitHub Copilot CLI (chỉ MCP)** | `~/.copilot/mcp-config.json` | `agentmemory connect copilot-cli` gộp `mcpServers.agentmemory`; Copilot sẽ nhận ở lần khởi chạy kế tiếp hoặc `/mcp`. |
| **GitHub Copilot CLI (plugin đầy đủ)** | Copilot plugin install | `copilot plugin install rohitg00/agentmemory:plugin` để lấy plugin từ subdir GitHub. |
| **OpenClaw** | OpenClaw MCP config | Cùng block `mcpServers`. Sâu hơn: `openclaw plugins install ./integrations/openclaw` chiếm memory slot của OpenClaw (tự chuyển từ `memory-core`); đặt `plugins.entries.agentmemory.hooks.allowConversationAccess=true` nếu không turn capture sẽ bị chặn một cách im lặng. Xem [`integrations/openclaw`](../integrations/openclaw/). |
| **Codex CLI (chỉ MCP)** | `.codex/config.toml` | Hình thái TOML: `codex mcp add agentmemory -- npx -y @agentmemory/mcp`, hoặc thêm `[mcp_servers.agentmemory]` thủ công. |
| **Codex CLI (plugin đầy đủ)** | Codex plugin marketplace | `codex plugin marketplace add rohitg00/agentmemory` sau đó `codex plugin add agentmemory@agentmemory`. Đăng ký MCP + 6 hook lifecycle + 17 skill. Hãy trust các hook và verify việc capture trên host của bạn; xem [hướng dẫn setup và validation Codex](../docs/plugins/codex-local.md). |
| **OpenCode (chỉ MCP)** | `opencode.json` | Hình thái khác: key `mcp` ở cấp cao nhất, command là một array: `{"mcp": {"agentmemory": {"type": "local", "command": ["npx", "-y", "@agentmemory/mcp"], "enabled": true}}}`. |
| **OpenCode (plugin đầy đủ)** | `plugin/opencode/` | 22 hook auto-capture bao phủ lifecycle session, message, tool, lỗi. Attribution project theo từng session, nên một process OpenCode trải trên nhiều repository sẽ ghi mỗi session dưới đúng project của nó. Hai slash command (`/recall`, `/remember`). Copy `plugin/opencode/` vào workspace OpenCode của bạn và thêm entry plugin vào `opencode.json`. Xem [`plugin/opencode/README.md`](../plugin/opencode/README.md) để biết bảng hook đầy đủ + phân tích phần còn thiếu. |
| **pi** | `~/.pi/agent/extensions/agentmemory` | `agentmemory connect pi` cài extension đi kèm vào thư mục auto-discovery của pi (recall khi agent khởi động, capture khi agent kết thúc, các tool `memory_search` / `memory_save` / `memory_health`, `/agentmemory-status`). `/reload` trong một pi đang chạy sẽ nhận nó. [`integrations/pi`](../integrations/pi/) cũng là một package pi (`pi install ./integrations/pi` từ một checkout). |
| **Hermes Agent** | `~/.hermes/config.yaml` | `cp -r integrations/hermes ~/.hermes/plugins/agentmemory` + `memory.provider: agentmemory` cho bạn memory provider 6-hook (prefetch, turn capture, session end, pre-compress, mirror MEMORY.md, system prompt block). Kiểm tra bằng `hermes plugins doctor` và `hermes memory status`. Xem [`integrations/hermes`](../integrations/hermes/). |
| **Qwen Code** | `~/.qwen/settings.json` | `agentmemory connect qwen` viết block `mcpServers` chuẩn. Payload hook tương thích field với Claude Code, nên các script 12-hook hiện có hoạt động không cần sửa đổi; kết nối chúng qua phần `hooks` trong cùng `settings.json`. |
| **Antigravity IDE / 2.0** | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity --with-hooks` cài MCP và capture hook vào thư mục customization chung. Xem [thiết lập và giới hạn của Antigravity](../docs/plugins/antigravity.md). |
| **Antigravity CLI** (`agy`) | `~/.gemini/config/mcp_config.json` | `agentmemory connect antigravity-cli --with-hooks` dùng cùng cấu hình MCP và hook như các phiên bản IDE hiện tại. Các bản cài đặt sẵn có nên refresh bằng `--force`; xem [ghi chú upgrade](../docs/plugins/antigravity.md). |
| **Kiro** | `~/.kiro/settings/mcp.json` | `agentmemory connect kiro` viết config ở cấp user. Các override ở cấp workspace nằm trong `.kiro/settings/mcp.json` cạnh code của bạn. |
| **Warp** | `~/.warp/.mcp.json` | `agentmemory connect warp` viết block `mcpServers` chuẩn. Warp cũng tự phát hiện skill từ `.claude/skills/`; khi plugin Claude Code được cài, 8 skill agentmemory (`remember`, `recall`, `recap`, `handoff`, `forget`, `commit-context`, `commit-history`, `session-history`) sẽ xuất hiện một cách tự nhiên trong bảng slash-command của Warp. |
| **Cline (CLI)** | `~/.cline/mcp.json` | `agentmemory connect cline` viết block `mcpServers` chuẩn. Người dùng extension VS Code: dán cùng block này qua Cline Settings → MCP Servers → Edit JSON. |
| **Continue.dev** | `~/.continue/config.yaml` (ưu tiên) hoặc `config.json` (legacy) | `agentmemory connect continue` tạo mới `config.yaml` từ đầu khi không có file nào tồn tại, hoặc sửa `config.json` đã có. **Nếu bạn đã có `config.yaml`** adapter sẽ in ra đúng block để dán vào dưới `mcpServers:`; nó sẽ không lặng lẽ viết lại yaml của bạn vì việc giữ comment và anchor an toàn cần một YAML parser mà package này không đi kèm. Continue dùng dạng array (không phải object) cho `mcpServers`. |
| **Zed** | `~/.config/zed/settings.json` | `agentmemory connect zed` viết dưới `context_servers` (key riêng của Zed, KHÔNG phải `mcpServers`). Các MCP server remote có thể được kết nối qua `{"url": "..."}` thay thế. |
| **Droid (Factory.ai)** | `~/.factory/mcp.json` | `agentmemory connect droid` viết block `mcpServers` chuẩn. Các override theo project nằm trong `<repo>/.factory/mcp.json`. Truyền `--with-hooks` để có auto-capture gốc. |
| **DeepSeek Harness** | `$DSH_HOME/cordis.patch.yml` | `agentmemory connect dsh` thêm một dòng `@deepseek-ai/dsh-mcp-client` vào patch layer ở cấp home mà mọi Harness profile đều nạp; các tool đăng ký dưới dạng `mcp__agentmemory__*`. Truyền `--with-hooks` để kết nối thêm auto-capture: các hook script Claude Code đi kèm chạy qua bridge chính chủ `@deepseek-ai/dsh-hooks-claude-code` của Harness (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop) qua một manifest được viết vào `$DSH_HOME/agentmemory.hooks.json`. Mặc định là `~/.dsh` khi `DSH_HOME` chưa được đặt. |
| **Goose** | Goose MCP settings UI | Cùng block `mcpServers`; dùng `goose configure` → Add Extension → MCP. Sửa YAML trực tiếp tại `~/.config/goose/config.yaml` cũng được hỗ trợ nhưng schema dùng `extensions:` + `cmd` (không phải `mcpServers:` + `command`). |
| **Aider** | n/a | Gọi trực tiếp REST API: `curl -X POST http://localhost:3111/agentmemory/smart-search -d '{"query": "auth"}'`. |
| **Bất kỳ agent nào (32+)** | n/a | `npx skillkit install agentmemory` tự phát hiện host và gộp. |

**Các MCP client chạy trong sandbox** (Flatpak / Snap / container hạn chế) không thể chạm tới `localhost` của host: hãy đặt thêm `"AGENTMEMORY_FORCE_PROXY": "1"` trong block `env`, và chỉ `AGENTMEMORY_URL` tới một route mà sandbox thực sự chạm tới được (ví dụ IP LAN của bạn).

### Truy cập theo chương trình (Python / Rust / Node)

agentmemory đăng ký các operation lõi của nó dưới dạng iii function (`mem::remember`, `mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). Bất kỳ ngôn ngữ nào có iii SDK đều có thể gọi chúng trực tiếp qua `ws://localhost:49134`, không cần một REST client riêng cho từng ngôn ngữ.

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

Ví dụ hoàn chỉnh: [`examples/python/`](../examples/python/) (quickstart + luồng observation/recall). REST trên `:3111` vẫn khả dụng cho các host không có iii runtime.

### Từ source

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

`npm start` khởi chạy cùng iii Worker Compose như CLI: iii 0.24.6, `state@0.22.20`, `http@0.22.7`. Trên macOS/Linux, CLI tải engine vào `~/.agentmemory/bin`; cần `curl`, POSIX `sh` và `tar` để cài tự động. REST và viewer cục bộ bind vào `127.0.0.1`; cập nhật viewer dùng SSE trên REST. `/agentmemory/status` báo `enginePinnedVersion`; có thể ghi đè pin bằng `AGENTMEMORY_III_VERSION`

### Windows

agentmemory chạy trên Windows 10/11; WSL2 có thể tự cài engine theo quy trình Linux. Windows native cần cài thủ công iii-engine v0.24.6: tải archive từ [trang phát hành iii v0.24.6](https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.24.6), xác minh checksum và đặt `iii.exe` trong `PATH`. CLI không tự giải nén ZIP Windows

Cấu hình MCP tự động trên Windows native chỉ hỗ trợ `agentmemory connect copilot-cli`; agent khác dùng khối MCP thủ công trong [Other agents](#other-agents). Chỉ chạy `connect` trong WSL nếu agent đích cũng cài trong cùng môi trường WSL

**Chỉ dùng MCP độc lập, không có engine.** Nếu không cần REST API, viewer hoặc dịch vụ runtime:

```powershell
npx -y @agentmemory/agentmemory@latest mcp
# or
npx -y @agentmemory/mcp
```

**Chẩn đoán:** Khi khởi động lỗi, chạy lại với `--verbose` để xem engine stderr. Kiểm tra các port `3111`, `3113`, `49134` còn trống; dùng `--port <N>` hoặc `--instance N` để tách runtime. CLI không thay thế `iii` trên `PATH`

---

<h2 id="deploy">Triển khai</h2>

Docker được hỗ trợ để self-host từ repository, không phải chế độ khởi động CLI. [`../deploy/Dockerfile`](../deploy/Dockerfile) và [`../deploy/runtime/worker-compose.yaml`](../deploy/runtime/worker-compose.yaml) dùng runtime iii 0.24.6; lưu state, traces và secret trong volume `/data` bền vững. Named volume mặc định là `iii-data`; đặt `AGENTMEMORY_DATA_DIR` thành đường dẫn host để bind mount. File store từ 0.22.1 được đọc trực tiếp tại `/data/state_store.db`, không cần migration. REST CORS mặc định cho phép origin cục bộ; thêm origin tin cậy bằng `REST_ALLOWED_ORIGINS`. Xem [`../deploy/README.md`](../deploy/README.md).


<p>
  <a href="https://fly.io/launch?repo=https://github.com/rohitg00/agentmemory"><img src="https://img.shields.io/badge/Deploy%20to-fly.io-8b5cf6?style=for-the-badge&logo=fly.io&logoColor=white" alt="Triển khai lên fly.io" /></a>
  <a href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Frohitg00%2Fagentmemory"><img src="https://img.shields.io/badge/Deploy%20to-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Triển khai lên Railway" /></a>
</p>

Nút one-click deploy của Render yêu cầu `render.yaml` ở gốc repository, và chúng tôi chủ đích giữ nó sạch. Hãy dùng luồng Render Blueprint được ghi lại trong [`../deploy/render/`](.././deploy/render/README.md) để chỉ tới blueprint trong repo một cách thủ công.

Chi tiết thiết lập đầy đủ (capture HMAC, SSH tunnel cho viewer, xoay, backup, mức chi phí sàn) nằm trong [`../deploy/`](.././deploy/README.md):

- [`../deploy/fly`](.././deploy/fly/README.md): một máy đơn với
  `auto_stop_machines = "stop"`; rẻ nhất khi idle.
- [`../deploy/railway`](.././deploy/railway/README.md): phí cố định của Hobby plan,
  volume trong dashboard.
- [`../deploy/render`](.././deploy/render/README.md): luồng Blueprint,
  tự động snapshot disk trên các plan trả phí.
- [`../deploy/coolify`](.././deploy/coolify/README.md): self-hosted trên
  VPS riêng của bạn qua [Coolify](https://coolify.io/self-hosted); cùng
  Docker Compose stack, bạn sở hữu cả host và dữ liệu.

Chỉ port `3111` được publish. Viewer trên `3113` vẫn bind vào
loopback bên trong container; README của mỗi template đều ghi lại
pattern SSH-tunnel để chạm tới nó.


### Di chuyển các cài đặt Docker cũ do CLI quản lý

CLI hiện tại không còn khởi chạy hay quản lý các triển khai Docker. Nếu tìm thấy bản ghi vòng đời Docker cũ, CLI sẽ giữ nguyên metadata và in ra chính xác lệnh `docker stop ...`; hãy chạy lệnh đó trước khi di chuyển. Đừng khởi chạy runtime mới khi volume vẫn còn được gắn vào container cũ.

Giữ lại và sao lưu volume lưu trữ lâu dài cũ (thường là `iii-data`), hoặc sao chép nội dung `/data` sang một bind mount. Worker state đọc trực tiếp tệp `/data/state_store.db` hiện có, không cần xuất hay chuyển đổi. Runtime cũ dùng UID/GID `65532:65532`; image mới thực hiện một lần việc di chuyển quyền sở hữu đệ quy sang `node:node` (`1000:1000`) và ghi `/data/.ownership-migrated-node-v1`. Sau khi di chuyển, đừng gắn volume trở lại runtime cũ.

Runtime cũ cũng lưu bearer secret được tạo ra trong `/data/.hmac`. Image mới giữ nguyên secret này trong quá trình di chuyển; `AGENTMEMORY_SECRET` được đặt tường minh sẽ được ưu tiên. Khởi chạy dự án Compose mới từ thư mục gốc của repository bằng lệnh `docker compose up --build -d`. Nếu tên volume cũ có tiền tố của dự án thay vì là `iii-data`, hãy chủ động dùng lại hoặc đổi tên volume đó—đừng vô tình khởi tạo một volume trống. Kiểm tra `/agentmemory/livez` và xác nhận có thể tìm thấy cả memory cũ lẫn mới. Tránh chạy `docker compose down -v` trừ khi bạn chủ ý xóa dữ liệu.
---

<h2 id="why-agentmemory"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-why.svg"><img src="../assets/tags/section-why.svg" alt="Tại sao chọn agentmemory" height="32" /></picture></h2>

Mọi coding agent đều quên hết mọi thứ khi session kết thúc, và mỗi session mới lại bắt đầu bằng việc bạn giải thích lại stack của mình. agentmemory chạy ngầm và loại bỏ hẳn bước đó.

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

### So với bộ nhớ tích hợp sẵn của agent

Mọi AI coding agent đều đi kèm bộ nhớ tích hợp sẵn: Claude Code có `MEMORY.md`, Cursor có notepad, Cline có memory bank. Những thứ này hoạt động như giấy nhớ (sticky note). agentmemory là cơ sở dữ liệu có thể tìm kiếm đứng sau những tờ giấy nhớ đó.

| | Tích hợp sẵn (CLAUDE.md) | agentmemory |
|---|---|---|
| Quy mô | Giới hạn 200 dòng | Không giới hạn |
| Tìm kiếm | Nạp tất cả vào context | BM25 + vector + graph (chỉ top-K) |
| Chi phí token | 22K+ ở 240 observation | ~1,900 token (giảm 92%) |
| Đa agent | File theo từng agent | MCP + REST (mọi agent) |
| Điều phối | Không có | Lease, signal, action, routine |
| Observability | Đọc file thủ công | Viewer real-time trên :3113 |

---

<h2 id="how-it-works"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-how.svg"><img src="../assets/tags/section-how.svg" alt="Cách hoạt động" height="32" /></picture></h2>

### Pipeline bộ nhớ

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

### Hợp nhất bộ nhớ 4 tầng

Lấy cảm hứng từ cách não người xử lý bộ nhớ, kể cả quá trình hợp nhất trong khi ngủ.

| Tầng | Là gì | Tương tự |
|------|------|---------|
| **Working** | Observation thô từ việc dùng tool | Bộ nhớ ngắn hạn |
| **Episodic** | Tóm tắt session đã nén | "Điều gì đã xảy ra" |
| **Semantic** | Fact và pattern đã trích xuất | "Những gì tôi biết" |
| **Procedural** | Workflow và pattern ra quyết định | "Cách làm việc đó" |

Bộ nhớ suy giảm theo thời gian (đường cong Ebbinghaus). Bộ nhớ được truy cập thường xuyên sẽ mạnh lên. Bộ nhớ cũ sẽ tự bị loại bỏ. Các mâu thuẫn được phát hiện và giải quyết.

### Những gì được capture

| Hook | Capture gì |
|------|----------|
| `SessionStart` | Đường dẫn project, session ID |
| `UserPromptSubmit` | Prompt của người dùng (đã lọc privacy) |
| `PreToolUse` | Pattern truy cập file + context đã làm giàu |
| `PostToolUse` | Tên tool, input, output |
| `PostToolUseFailure` | Context lỗi |
| `PreCompact` | Tiêm lại bộ nhớ trước khi compact |
| `SubagentStart/Stop` | Lifecycle của sub-agent |
| `Stop` | Tóm tắt cuối session |
| `SessionEnd` | Dấu hiệu session hoàn tất |

### Khả năng chính

| Khả năng | Mô tả |
|---|---|
| **Capture tự động** | Mọi lần dùng tool đều được ghi lại qua hook, không cần thao tác thủ công |
| **Tìm kiếm ngữ nghĩa** | BM25 + vector + knowledge graph với RRF fusion |
| **Tiến hóa bộ nhớ** | Versioning, supersession, relationship graph |
| **Vệ sinh recall** | Các phiên bản bộ nhớ đã bị supersede rời khỏi search index; chuỗi version trong KV giữ lại toàn bộ lịch sử |
| **Gợi ý near-duplicate** | Khi lưu, hệ thống báo một match tư vấn `similarTo` khi nội dung mới gần giống một bộ nhớ đã có |
| **Scoping theo từng agent** | `agentId` xuyên suốt qua save và recall trên REST, MCP, và search index, ở chế độ shared hoặc isolated |
| **Provenance tại thời điểm ghi** | Mọi observation và memory đều mang một origin channel bất biến (user, agent, tool, import, hoặc shared) được đóng dấu lúc capture, save, và import |
| **Tự quên** | Hết hạn TTL, phát hiện mâu thuẫn, loại bỏ theo độ quan trọng |
| **Privacy là ưu tiên** | API key, secret, tag `<private>` bị loại bỏ trước khi lưu trữ |
| **Tự phục hồi** | Circuit breaker, chuỗi fallback provider, health monitoring |
| **Claude bridge** | Đồng bộ hai chiều với MEMORY.md |
| **Knowledge graph** | Trích xuất entity + duyệt BFS |
| **Bộ nhớ nhóm** | Namespace chia sẻ + riêng tư giữa các thành viên trong team |
| **Provenance trích dẫn** | Truy lại bất kỳ memory nào về đúng observation nguồn |
| **Snapshot Git** | Version, rollback, và diff trạng thái bộ nhớ |

---

<h2 id="search"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-search.svg"><img src="../assets/tags/section-search.svg" alt="Tìm kiếm" height="32" /></picture></h2>

Retrieval ba luồng (triple-stream) kết hợp ba tín hiệu:

| Luồng | Làm gì | Khi nào |
|---|---|---|
| **BM25** | Khớp từ khóa đã stem với mở rộng từ đồng nghĩa | Luôn bật |
| **Vector** | Cosine similarity trên dense embedding | Khi embedding provider được cấu hình |
| **Graph** | Duyệt knowledge graph qua khớp entity | Khi entity được phát hiện trong truy vấn |

Được fuse bằng Reciprocal Rank Fusion (RRF, k=60) và đa dạng hóa theo session (tối đa 3 kết quả mỗi session).

Khi vector index đã có dữ liệu, `mem::search` (đứng sau `memory_recall`) dùng ranker hybrid BM25 + vector. Khi không có embedding, nó dùng BM25. `smart-search` còn có thể fuse thêm các kết quả khớp từ graph cấu trúc khi dữ liệu graph tồn tại, kể cả ở chế độ keyless. Recall cho lesson chạy trên một BM25 index riêng trong memory thay vì quét toàn bộ corpus cho mỗi truy vấn. Các phiên bản memory đã bị supersede bị loại khỏi mọi đường recall; chuỗi version vẫn giữ lại lịch sử của chúng.

Vector sống sót qua một lần crash hoặc force-kill. Vector index được lưu theo bucket, nhiều nhất là mỗi `AGENTMEMORY_INDEX_SAVE_INTERVAL_MS` (10 phút). Mỗi vector được thêm hoặc xóa ở giữa cũng được ghi ngay vào một pending log nhỏ trong state store, và lần khởi động kế tiếp sẽ replay nó mà không cần gọi embedding provider. Mỗi lần save thành công sẽ làm trống log đó. Các document vẫn chưa có vector sau khi replay sẽ được re-embed ở nền theo từng batch `AGENTMEMORY_VECTOR_BACKFILL_MAX` (500) cho tới khi không còn document nào, và một backfill bị dừng sẽ tiếp tục ở lần khởi động kế tiếp. `/agentmemory/status` và viewer hiển thị kích thước pending log và trạng thái backfill. Bản cài keyless không ghi gì cả.

BM25 tokenize được tiếng Hy Lạp, Cyrillic, Hebrew, Ả Rập, và Latin có dấu ngay từ đầu. Với bộ nhớ tiếng Trung / Nhật / Hàn, hãy cài thêm các segmenter tùy chọn (`npm install @node-rs/jieba tiny-segmenter`) để chia các đoạn CJK thành token ở mức từ; nếu không có chúng, agentmemory sẽ lùi nhẹ về tokenize theo cả đoạn và in ra một gợi ý một lần trên stderr.

### Embedding provider

Bản cài keyless tắt vector embedding: `mem::search` dùng BM25, trong khi `smart-search` cũng có thể dùng dữ liệu graph cấu trúc đã có. Để chủ động dùng embedding ngữ nghĩa miễn phí ngay trên máy, hãy thêm dòng này vào `~/.agentmemory/.env` và khởi động lại agentmemory:

```env
EMBEDDING_PROVIDER=local
```

Lần cài npm thông thường đã bao gồm runtime tùy chọn `@huggingface/transformers`. Request embedding đầu tiên sẽ tải `Xenova/all-MiniLM-L6-v2`, nên nó cần truy cập network và có thể mất lâu hơn; các lần inference sau đó chạy ngay trên máy. Các provider remote được tự phát hiện từ key của chúng trừ khi `EMBEDDING_PROVIDER` ghi đè lên.

| Provider | Model | Chi phí | Ghi chú |
|---|---|---|---|
| **Local (khuyến nghị opt-in)** | `all-MiniLM-L6-v2` | Miễn phí | Chạy trên máy sau lần tải model đầu tiên, +8pp recall so với chỉ dùng BM25 |
| Gemini | `gemini-embedding-001` | Free tier | 100+ ngôn ngữ, 768/1536/3072 chiều (MRL), input 2048 token. Thay thế `text-embedding-004` ([đã deprecated, shutdown 14/01/2026](https://ai.google.dev/gemini-api/docs/deprecations)) |
| OpenAI | `text-embedding-3-small` | $0.02/1M | Chất lượng cao nhất |
| Voyage AI | `voyage-code-3` | Trả phí | Tối ưu cho code |
| Cohere | `embed-english-v3.0` | Free trial | Dùng chung (general purpose) |
| OpenRouter | Bất kỳ model nào | Thay đổi | Proxy đa model |

---

<h2 id="mcp-server"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-mcp.svg"><img src="../assets/tags/section-mcp.svg" alt="MCP Server" height="32" /></picture></h2>

54 tool, 6 resource, 3 prompt, và 17 skill.

> **MCP shim so với server đầy đủ:** package `@agentmemory/mcp` đã publish là một shim mỏng. Nó chỉ phơi ra toàn bộ 54 tool **khi nó có thể chạm tới một agentmemory server đang chạy** qua `AGENTMEMORY_URL` (chế độ proxy). Khi không có server nào tiếp cận được, shim sẽ lùi về một bộ 7 tool cục bộ (`memory_save`, `memory_recall`, `memory_smart_search`, `memory_sessions`, `memory_export`, `memory_audit`, `memory_governance_delete`). Biến môi trường `AGENTMEMORY_TOOLS=core|all` là một flag *phía server*; đặt nó trong block `env` của shim không có tác dụng gì. Nếu bạn chỉ thấy 7 tool trong Cursor / OpenCode / Gemini CLI, hãy khởi động `npx -y @agentmemory/agentmemory@latest` (hoặc Docker stack) và đặt `AGENTMEMORY_URL=http://localhost:3111`.

### 54 Tool

Ba mức hiển thị tool, từ nhỏ tới lớn: `AGENTMEMORY_TOOLS=core` thu hẹp hiển thị xuống 8 tool thiết yếu (`memory_save`, `memory_recall`, `memory_consolidate`, `memory_smart_search`, `memory_sessions`, `memory_diagnose`, `memory_lesson_save`, `memory_reflect`); bộ cơ bản dưới đây là 14 tool nền tảng của registry; mặc định (`AGENTMEMORY_TOOLS=all`) phơi ra toàn bộ 54 tool.

<details>
<summary>Tool cơ bản (14)</summary>

| Tool | Mô tả |
|------|-------------|
| `memory_recall` | Tìm kiếm các observation trước đây |
| `memory_compress_file` | Nén file markdown mà vẫn giữ nguyên cấu trúc |
| `memory_save` | Lưu một insight, quyết định, hoặc pattern |
| `memory_file_history` | Các observation trước đây về file cụ thể |
| `memory_patterns` | Phát hiện pattern lặp lại |
| `memory_sessions` | Liệt kê session gần đây |
| `memory_smart_search` | Tìm kiếm hybrid semantic + từ khóa |
| `memory_vision_search` | Tìm kiếm observation dạng ảnh |
| `memory_timeline` | Observation theo trình tự thời gian |
| `memory_profile` | Hồ sơ project (concept, file, pattern) |
| `memory_export` | Export toàn bộ dữ liệu memory |
| `memory_relations` | Truy vấn relationship graph |
| `memory_commit_lookup` | Các session đứng sau một git commit |
| `memory_commits` | Các commit được ghi lại cho một session |

</details>

<details>
<summary>Tool mở rộng (tổng 54, mức hiển thị mặc định)</summary>

| Tool | Mô tả |
|------|-------------|
| `memory_patterns` | Phát hiện pattern lặp lại |
| `memory_timeline` | Observation theo trình tự thời gian |
| `memory_relations` | Truy vấn relationship graph |
| `memory_graph_query` | Duyệt knowledge graph |
| `memory_consolidate` | Chạy hợp nhất 4 tầng |
| `memory_claude_bridge_sync` | Đồng bộ với MEMORY.md |
| `memory_team_share` | Chia sẻ với thành viên team |
| `memory_team_feed` | Các item đã chia sẻ gần đây |
| `memory_audit` | Audit trail các operation |
| `memory_governance_delete` | Xóa có kèm audit trail |
| `memory_snapshot_create` | Snapshot có version Git |
| `memory_action_create` | Tạo work item kèm dependency |
| `memory_action_update` | Cập nhật trạng thái action |
| `memory_frontier` | Các action chưa bị block, xếp theo độ ưu tiên |
| `memory_next` | Action kế tiếp quan trọng nhất |
| `memory_lease` | Lease độc quyền cho action (đa agent) |
| `memory_routine_run` | Khởi tạo instance cho workflow routine |
| `memory_signal_send` | Gửi message giữa các agent |
| `memory_signal_read` | Đọc message kèm receipt |
| `memory_checkpoint` | Gate theo điều kiện bên ngoài |
| `memory_mesh_sync` | Đồng bộ P2P giữa các instance |
| `memory_sentinel_create` | Watcher theo event |
| `memory_sentinel_trigger` | Kích hoạt sentinel từ bên ngoài |
| `memory_sketch_create` | Action graph tạm (ephemeral) |
| `memory_sketch_promote` | Nâng lên vĩnh viễn |
| `memory_crystallize` | Nén các action chain |
| `memory_diagnose` | Kiểm tra sức khỏe |
| `memory_heal` | Tự sửa trạng thái bị kẹt |
| `memory_facet_tag` | Tag dạng dimension:value |
| `memory_facet_query` | Truy vấn theo facet tag |
| `memory_verify` | Truy lại provenance |

</details>

### 6 Resource · 3 Prompt · 17 Skill

| Loại | Tên | Mô tả |
|------|------|-------------|
| Resource | `agentmemory://status` | Health, số session, số memory |
| Resource | `agentmemory://project/{name}/profile` | Intelligence theo từng project |
| Resource | `agentmemory://project/{name}/recent` | Observation gần đây cho một project |
| Resource | `agentmemory://memories/latest` | 10 memory active mới nhất |
| Resource | `agentmemory://graph/stats` | Thống kê knowledge graph |
| Resource | `agentmemory://team/{id}/profile` | Hồ sơ team được chia sẻ |
| Prompt | `recall_context` | Tìm kiếm + trả về các context message |
| Prompt | `session_handoff` | Dữ liệu handoff giữa các agent |
| Prompt | `detect_patterns` | Phân tích pattern lặp lại |
| Skill | `/recall` | Tìm kiếm memory |
| Skill | `/remember` | Lưu vào bộ nhớ dài hạn |
| Skill | `/session-history` | Tóm tắt các session gần đây |
| Skill | `/forget` | Xóa observation/session |

Bảng này chỉ hiển thị 4 skill cốt lõi. Bộ đầy đủ gồm 9 skill có thể gọi cộng 8 skill tham chiếu; xem phần Skill gốc ở trên.

### MCP độc lập

Chạy mà không cần server đầy đủ, cho bất kỳ MCP client nào. Một trong hai cách này đều được:

```bash
npx -y @agentmemory/agentmemory@latest mcp   # canonical (always available)
npx -y @agentmemory/mcp                # shim package alias
```

Hoặc thêm vào config MCP của agent của bạn:

Hầu hết các agent (Cursor, Claude Desktop, Cline, Roo Code, Gemini CLI):
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

Gộp entry `agentmemory` vào object `mcpServers` đã có của host thay vì thay thế toàn bộ file. Với các client chạy sandbox không chạm tới `localhost` của host, thêm `"AGENTMEMORY_FORCE_PROXY": "1"` vào block env và đặt `AGENTMEMORY_URL` tới một route mà sandbox chạm tới được.

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

Copy file plugin từ repo:
```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
cp plugin/opencode/commands/*.md ~/.config/opencode/commands/
```

---

<h2 id="real-time-viewer"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="Viewer Real-Time" height="32" /></picture></h2>

Tự khởi động trên port `3113`. Viewer nạp một snapshot khi nó kết nối (`GET /agentmemory/viewer/snapshot`) rồi áp các event từ live stream: memory mới, lesson, observation, audit entry, thay đổi graph và cập nhật health xuất hiện mà không cần polling hay reload trang. Các request khác duy nhất là những action bạn click, các trang "load more" và tìm kiếm. Khi stream rớt, viewer hiển thị số liệu của nó đã cũ bao lâu, kết nối lại với backoff và resync từ một snapshot.

- **12 tab trong bốn nhóm** với số liệu live, deep link (`#memories/<id>`, `#sessions/<id>?obs=<id>`, `#graph/<id>`, `#health/consolidation`), phím tắt và menu cho mobile.
- **Memories:** tìm kiếm phía server, filter theo project, agent và type, một panel chi tiết với chuỗi version và word diff, link provenance, nút copy cho id, lệnh gọi MCP và một lệnh curl, edit (tạo version mới), forget có xác nhận, forget theo lô và export JSON.
- **Sessions:** một timeline observation nội tuyến với input/output tool dễ đọc, filter và phân trang, cùng các memory và lesson mà mỗi session tạo ra.
- **Graph:** tìm kiếm, chi tiết node với relation và nguồn, một legend không chỉ dựa vào màu sắc, và điều khiển zoom.
- **Health:** phiên bản live của `GET /agentmemory/status`. Mỗi vấn đề đều kèm cách khắc phục, cộng với state backend, trạng thái lưu index, tiến độ compact provenance của graph và một phần giải thích consolidation với các ngưỡng thực tế.
- Các trang **Audit, Activity, Profile, Replay, Lessons, Actions và Crystals**, mỗi trang có một empty state nói rõ phần đó là gì, vì sao nó đang rỗng và lệnh nào sẽ lấp đầy nó, cùng một tooltip glossary `?` trên mỗi thuật ngữ và số liệu.

```bash
open http://localhost:3113
```

Viewer server bind vào `127.0.0.1` theo mặc định và gắn kèm server secret khi nó forward request tới REST API, nên nó không cần setup gì thêm. Endpoint `/agentmemory/viewer` được REST phục vụ tuân theo quy tắc bearer-token bình thường và redirect các browser không có token tới port của viewer. Header CSP dùng một script nonce theo từng response và tắt các inline handler attribute (`script-src-attr 'none'`).

---

<h2 id="iii-console"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-viewer.svg"><img src="../assets/tags/section-viewer.svg" alt="iii Console" height="32" /></picture></h2>

Viewer tại `:3113` cho thấy những gì agent của bạn **đã ghi nhớ**. [iii console](https://iii.dev/docs/console) cho thấy những gì agent của bạn **đã làm**: mọi memory op dưới dạng một OpenTelemetry trace, mọi KV entry có thể sửa, mọi function có thể gọi. Hai cửa sổ trên cùng một bộ nhớ: một có hình dạng product, một có hình dạng engine.

Xem một `memory_smart_search` được bắn ra và theo dõi BM25 scan → embedding lookup → RRF fusion → reranker dưới dạng một waterfall. Sửa một consolidation timer bị kẹt trong KV browser. Replay một hook `PostToolUse` với payload đã chỉnh.

agentmemory có sẵn thứ này miễn phí vì mọi function call và trigger đều bắn qua iii; không có gì custom, không có gì cần instrument.

<p align="center">
  <img src="../assets/iii-console/workers.png" alt="Trang Workers của iii console: các worker đã kết nối bao gồm các instance agentmemory với số lượng function live và metadata runtime" width="720" />
  <br/>
  <em>Trang Workers: mọi worker đã kết nối, kể cả agentmemory, với PID, số function, runtime, và lần thấy cuối.</em>
</p>

**Đã được cài sẵn.** Console đi kèm với `iii` engine đã pin (0.22+); không có gì riêng cần cài thêm. Lần khởi chạy đầu tiên sẽ tải binary console nằm cạnh engine.

**Khởi chạy cùng với agentmemory:**

```bash
agentmemory console
```

Lệnh này chạy `iii console` của engine đã pin dựa trên các port mà agentmemory đã resolve (REST, bridge) và phục vụ nó ở một port cao hơn viewer một đơn vị, mặc định là `http://localhost:3114`. `--console-port N` chọn một port khác; `--port` và `--instance` chọn instance agentmemory giống như cách chúng làm với `stop`; mọi flag khác được truyền thẳng qua, ví dụ `--enable-flow` cho trang architecture-graph thử nghiệm.

Làm tương tự bằng tay, hữu ích khi `agentmemory` không có trong PATH:

```bash
~/.agentmemory/bin/iii console --port 3114 --engine-port 3111 --bridge-port 49134
```

**Những gì bạn có thể làm từ console:**

| Trang | Dùng để |
|------|-----------|
| **Workers** | Xem mọi worker đã kết nối và metric live của nó, kể cả worker agentmemory. |
| **Functions** | Gọi trực tiếp bất kỳ function nào của agentmemory bằng một JSON payload; tiện để test `memory.recall`, `memory.consolidate`, `graph.query` mà không cần kết nối một client. |
| **Triggers** | Replay trigger HTTP, cron, event, và state: bắn cron consolidation thủ công, retry một route HTTP, phát một thay đổi state. |
| **States** | KV browser với CRUD đầy đủ trên session, memory slot, timer lifecycle, và embedding index; sửa giá trị ngay tại chỗ. |
| **Queues** | Topic queue bền vững + quản lý dead-letter. Replay hoặc drop các job embedding / compression bị lỗi. |
| **Traces** | Các view waterfall / flame / service-breakdown của OpenTelemetry. Filter theo `trace_id` để xem chính xác những function, lệnh gọi DB, và request embedding mà một `memory.search` đã tạo ra. |
| **Logs** | Log OTEL có cấu trúc, được filter và liên kết tới trace/span ID. |
| **Config** | Cấu hình runtime: xem chính xác engine của bạn đang chạy với worker, provider, và port nào. |

<p align="center">
  <img src="../assets/iii-console/traces-waterfall.png" alt="Chế độ xem waterfall của trace trong iii console, hiển thị thời lượng theo từng span" width="720" />
  <br/>
  <em>Traces: waterfall / flame / service breakdown cho mọi memory operation.</em>
</p>

**Trace đã được bật sẵn:**

**Tracing và log:** Dùng iii console để kiểm tra telemetry runtime. Xem [tài liệu observability của iii](https://iii.dev/docs) về cấu hình exporter và sampling.


> **Lưu ý:** console bản thân nó không ép buộc auth; hãy giữ nó bind vào `127.0.0.1` (mặc định) và không bao giờ expose nó ra công khai.

---

<h2 id="powered-by-iii"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-architecture.svg"><img src="../assets/tags/section-architecture.svg" alt="Powered by iii" height="32" /></picture></h2>

agentmemory là worker trên runtime [iii](https://iii.dev). Worker Compose quản lý engine và chạy registry worker `state`, `http`; feed viewer được phục vụ bằng SSE qua REST.




Điều đó có nghĩa là chỉ cần thêm một lệnh nữa là mở rộng agentmemory với toàn bộ một khả năng mới.

### Mở rộng agentmemory với nhiều worker hơn

Runtime kết hợp agentmemory với registry worker `state` (KV) và `http`; có thể thêm worker từ [iii registry](https://workers.iii.dev) vào Worker Compose.
```yaml
workers:
  # ...the bundled entries...
  - name: database          # SQL-backed state adapter when you outgrow the KV defaults
  - name: iii-sandbox       # run code that came out of memory_recall inside a throwaway VM
  - name: mcp               # extra MCP servers next to agentmemory's, same engine
```

| Worker | Bạn có thêm gì trên nền agentmemory |
|---|---|
| [`database`](https://workers.iii.dev/workers/database) | Adapter state dựa trên SQL khi bạn vượt quá giới hạn của KV mặc định |
| [`iii-sandbox`](https://workers.iii.dev/workers/iii-sandbox) | Code lấy ra từ `memory_recall` chạy trong một VM dùng một lần, không chạy trên shell của bạn |
| [`mcp`](https://workers.iii.dev/workers/mcp) | Dựng thêm các MCP server cạnh server của agentmemory, chia sẻ cùng engine |


Registry đầy đủ: [workers.iii.dev](https://workers.iii.dev). Mọi worker ở đó đều compose qua đúng những primitive mà agentmemory dùng, và agentmemory mà bạn đang có chính là một trong số đó.

CLI pin registry package `state@0.22.20` và `http@0.22.7` trong Worker Compose.
### Runtime CLI và địa chỉ bind

Chạy `agentmemory` khởi chạy iii Worker Compose với manifest riêng trong data directory đã chọn: iii 0.24.6, `state@0.22.20`, `http@0.22.7`. REST và viewer cục bộ bind vào `127.0.0.1`; WebSocket engine là lưu lượng nội bộ. Docker dùng [`../deploy/runtime/worker-compose.yaml`](../deploy/runtime/worker-compose.yaml); xem [`../deploy/README.md`](../deploy/README.md).

### Storage backend: file (mặc định) so với redis

Worker `state` mặc định dùng KV store dạng file, giữ trong memory và định kỳ ghi xuống disk. Redis dùng được khi nhiều writer chia sẻ runtime nhưng thêm network round trip và không làm một worker connection chạy song song. Đặt `AGENTMEMORY_STATE_BACKEND=redis` và `AGENTMEMORY_REDIS_URL` để dùng Redis adapter của worker `state`, lưu mỗi key thành Redis hash field (`HSET`):

```env
# ~/.agentmemory/.env
AGENTMEMORY_STATE_BACKEND=redis
AGENTMEMORY_REDIS_URL=redis://localhost:6379
```

`AGENTMEMORY_STATE_BACKEND` mặc định là `file`; giá trị khác `file` hoặc `redis` gây lỗi khởi động. `/agentmemory/status` và Health của viewer báo backend đang dùng và trạng thái phản hồi, không hiển thị URL. Chỉ hỗ trợ `redis://` thuần; dịch vụ TLS-only `rediss://` cần tunnel mã hóa. Kết nối Redis không mã hóa, vì vậy hãy dùng mạng cục bộ/riêng hoặc tunnel. Mã hóa dấu nháy đơn trong password Redis thành `%27`.

**Mỗi instance dùng một Redis database riêng.** Cấp database hoặc server Redis riêng cho mỗi instance chạy đồng thời để tách state.

**Điểm giống và khác.** Mọi tính năng agentmemory hoạt động với Redis: sessions, observations, memories, search/index, lessons, graph, audit log, export/import, governance deletes, consolidation status, viewer snapshot và live SSE feed, cùng health monitor. Worker `state` lưu mỗi scope thành Redis hash (`HSET`/`HGET`/`HGETALL`) và phát các state trigger như file store. agentmemory xử lý thứ tự record, partial update dưới per-key lock và kiểm tra audit scope cũ.

Live event của viewer dùng SSE trên REST worker và được broadcast từ process agentmemory đang chạy; không dùng Redis pub/sub hay probe Redis stream định kỳ. Redis ảnh hưởng việc đọc/ghi state, không ảnh hưởng transport viewer. Khi Redis lỗi, status báo state store không phản hồi; scope lớn được đọc toàn bộ bằng `HGETALL`.

**Thiết lập Redis được khuyến nghị.** Snapshot policy mặc định `save 3600 1 300 100 60 10000` có thể làm mất vài phút dữ liệu khi crash. Đặt `appendonly yes` và `maxmemory-policy noeviction`; `allkeys-lru` có thể âm thầm xóa memory khi Redis đầy.

Worker Compose do CLI tạo truyền các biến này cho worker `state`. Với Docker self-host, xem [`../deploy/README.md`](../deploy/README.md) và [tài liệu worker state](https://workers.iii.dev/workers/state). Worker config đã lưu có thể chứa Redis URL và credential; giới hạn quyền data directory (`chmod 700 <data-dir>`) và dùng Redis ACL user có quyền tối thiểu.

**Migration không tự động.** Chuyển `AGENTMEMORY_STATE_BACKEND` bắt đầu từ một store trống ở cả hai phía; không có gì tự copy dữ liệu đã có từ file sang Redis hay ngược lại. Export từ backend bạn đang rời khỏi và import vào backend bạn đang chuyển tới. Đoạn này chạy giống nhau trên cả bash và zsh (kể cả `bash -u`). Một array như `AUTH=(${AGENTMEMORY_SECRET:+-H "Authorization: Bearer $AGENTMEMORY_SECRET"})` thì không: zsh giữ header đó như một từ bị hỏng trong khi bash tách nó thành hai, nên cả hai request đều 401 bất cứ khi nào `AGENTMEMORY_SECRET` được đặt:

```bash
# Set AGENTMEMORY_SECRET to the content of the `secret` file in the server's selected data directory before running these curl commands.

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

`/agentmemory/export` cũng nhận `?maxSessions=` và `?offset=` để chia nhỏ một corpus lớn qua nhiều lệnh gọi; `strategy` khi import là `merge` (an toàn theo mặc định), `replace`, hoặc `skip`.

### iii thay thế cho những gì

| Stack truyền thống | agentmemory dùng |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii state worker (file-based KV) + in-memory vector index |
| SSE / Socket.io | REST endpoint `GET /agentmemory/viewer/events` (SSE) |
| pm2 / systemd | iii engine worker supervision |
| Prometheus / Grafana | iii OTEL + health monitor |
| Hệ thống plugin tùy chỉnh | `iii worker add <name>` |

**246 source files · ~56,000 LOC · 3,800+ tests · 322 functions · 65 KV scopes**, all on three primitives. No `agentmemory plugin install`. The plugin system is iii itself.

---

<h2 id="configuration"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-config.svg"><img src="../assets/tags/section-config.svg" alt="Cấu hình" height="32" /></picture></h2>

### LLM Provider

agentmemory tự phát hiện provider từ environment của bạn. Một provider làm cho các operation dựa trên LLM khả dụng, nhưng chỉ cấu hình provider thôi không kích hoạt việc nén observation do LLM viết. Đường đó cần cả provider và `AGENTMEMORY_AUTO_COMPRESS=true`.

| Provider | Config | Ghi chú |
|----------|--------|-------|
| **No-op (mặc định)** | Không cần config | Compress/summarize dựa trên LLM bị tắt. Nén synthetic và recall BM25 vẫn hoạt động. Xem `AGENTMEMORY_ALLOW_AGENT_SDK` dưới đây nếu bạn từng dựa vào fallback Claude-subscription. |
| Anthropic API | `ANTHROPIC_API_KEY` | Tính phí theo token |
| MiniMax | `MINIMAX_API_KEY` | Tương thích Anthropic |
| Gemini | `GEMINI_API_KEY` | Cũng kích hoạt embedding |
| OpenRouter | `OPENROUTER_API_KEY` | Bất kỳ model nào |
| OpenAI API | `OPENAI_API_KEY` | Mặc định `gpt-5.6-luna`, ghi đè bằng `OPENAI_MODEL` |
| **Local (Ollama / LM Studio / vLLM / llama.cpp)** | `OPENAI_API_KEY=local` + `OPENAI_BASE_URL=http://localhost:11434/v1` (Ollama) hoặc `http://localhost:1234/v1` (LM Studio) + `OPENAI_MODEL=<your model>` | Bất cứ gì tương thích OpenAI-API. Không tốn phí, chạy trên hardware của bạn. Xem [Model cục bộ](#local-models-ollama--lm-studio--vllm) dưới đây. |
| Fallback Claude subscription | `AGENTMEMORY_ALLOW_AGENT_SDK=true` | Chỉ opt-in. Spawn các session `@anthropic-ai/claude-agent-sdk`; trước đây nó từng gây ra đệ quy Stop-hook không giới hạn, nên nó không còn là mặc định. |

### Model cục bộ (Ollama / LM Studio / vLLM)

agentmemory nói chuyện với bất kỳ server tương thích OpenAI-API nào, nên bất cứ gì phơi ra `/v1/chat/completions` đều hoạt động mà không cần sửa code. Không key trả phí, không cloud, không rate limit; chạy hoàn toàn trên hardware của bạn.

**Ollama** (port mặc định `11434`):

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

**LM Studio** (port mặc định `1234`):

Mở LM Studio → tab Local Server → Start Server. Chọn bất kỳ chat model nào trong bộ chọn (Qwen 3, gpt-oss, DeepSeek R1, v.v.).

```env
# ~/.agentmemory/.env
OPENAI_API_KEY=lmstudio                        # any non-empty string; LM Studio ignores it
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=qwen3-8b                          # match the model name from LM Studio
```

**vLLM / llama.cpp / Text Generation Inference**: cùng hình thái. Chỉ `OPENAI_BASE_URL` tới bất kỳ URL mà server của bạn phơi ra và đặt `OPENAI_MODEL` thành một tên mà server của bạn chấp nhận.

**Chọn model cho công việc memory**: compression và summarization là các task ngắn (<2K token vào, <500 token ra) nơi một model instruct 7B là đủ dư. Khuyến nghị:

| Model | Size | Vì sao |
|-------|------|-----|
| `qwen3:8b` | ~5.2 GB | Mặc định cân bằng trên máy 16 GB; mạnh ở extraction và text dạng tool |
| `qwen3:4b` | ~2.6 GB | Lựa chọn nhỏ nhất còn hợp lý; ổn cho compression, yếu hơn ở graph extraction |
| `qwen3-coder:30b` | ~19 GB | Lựa chọn local tốt nhất cho session dạng code (30B MoE, 3.3B active) trên hardware 24-32 GB |
| `gpt-oss:20b` | ~14 GB | Model tổng quát mạnh, vừa với 16 GB RAM |
| `deepseek-r1:8b` | ~5.2 GB | Reasoning distill; chậm hơn nhưng extraction sạch hơn |

Các model Qwen 3 mặc định có suy nghĩ (think) và có thể đốt hết toàn bộ token budget vào reasoning trước khi có bất kỳ output nào. Đặt `AGENTMEMORY_LLM_NOTHINK=1` để thêm `/no_think` vào các prompt graph-extraction, và tăng `MAX_TOKENS` (16384 là ổn) nếu extraction trả về rỗng.

Các model dạng reasoning (kiểu `o1` với block `<think>`) có thể trả về `content` rỗng cùng một field `reasoning` mà server local của bạn có thể không phơi ra. Nếu extraction trả về trống, hãy chuyển sang một model non-reasoning trước. Biến env `OPENAI_REASONING_EFFORT=none` cũng có thể tắt thinking trên các model thinking của Ollama Cloud vốn mirror schema reasoning của OpenAI.

Embedding cục bộ đi kèm như một dependency tùy chọn nhưng không được bật theo mặc định. Đặt `EMBEDDING_PROVIDER=local` để chủ động dùng `Xenova/all-MiniLM-L6-v2` (384 chiều). Request embedding đầu tiên sẽ tải model; inference chạy trên máy sau đó. Nếu không có setting đó hoặc một key embedding remote, vector vẫn bị tắt, `mem::search` dùng BM25, và `smart-search` vẫn có thể thêm các kết quả khớp graph đã có.

### Chọn model theo chi phí

Khi compression nền do LLM viết được bật với cả provider và `AGENTMEMORY_AUTO_COMPRESS=true`, nó chạy trên mọi observation, nên việc chọn model thay đổi đáng kể chi phí hàng tháng. Dữ liệu workload đã ghi lại: 635 request / 888K token / 35 giờ sử dụng active, chạy trên ba model OpenRouter theo giá ngày 2026-05-23.

| Tier | Model | Input / 1M | Output / 1M | Chi phí cho 35h đã ghi lại | Ghi chú |
|------|-------|------------|-------------|---------------------------|-------|
| Khuyến nghị | `deepseek/deepseek-v4-flash-0731` | $0.07 | $0.14 | ~$0.07 (ước tính) | DeepSeek mới nhất; lựa chọn rẻ nhất được khuyến nghị cho workload compression. |
| Khuyến nghị | `deepseek/deepseek-v4-pro` | $0.435 | $0.87 | ~$0.46 | Chất lượng compression + summarization tốt với chi phí thấp hơn Sonnet ~10 lần. |
| Khuyến nghị | `qwen/qwen3-coder` | $0.45 | $1.80 | ~$0.55 | Reasoning về code mạnh nếu session của bạn nặng về code. |
| Cao cấp | `anthropic/claude-sonnet-5` | $3.00 | $15.00 | ~$5.02 (ước tính) | Giá niêm yết giống với lần chạy Sonnet 4.6 đã đo; giá giới thiệu $2/$10 cho tới 2026-08-31. |
| Cao cấp | `openai/gpt-5.6-sol` | $5.00 | $30.00 | ~$9 (ước tính) | Tier flagship; đắt cho công việc nền chạy liên tục. |
| Nên tránh | `anthropic/claude-opus-5` | $5.00 | $25.00 | ~$8.40 (ước tính) | Model lớp flagship; vượt chi phí cho compression. |

Các dòng đã đo đến từ lần chạy đã ghi lại; các dòng (ước tính) scale cùng tỷ lệ token theo giá niêm yết của từng model.

agentmemory in ra một cảnh báo runtime khi `OPENROUTER_MODEL` khớp với pattern tier cao cấp. Đặt `AGENTMEMORY_SUPPRESS_COST_WARNING=1` để tắt tiếng khi bạn đã đưa ra lựa chọn có hiểu biết.

Đánh đổi chất lượng so với chi phí cho công việc memory: compression là một task summarization với ngưỡng chất lượng tương đối thoải mái (agent đọc lại summary, không phải người dùng). DeepSeek V4 Flash / V4 Pro / Qwen3-Coder gần như ngang Sonnet trên task này (chỉ lệch trong sai số làm tròn) trong khi tốn ít hơn 10-70 lần. Hãy dành các model tier cao cấp cho những truy vấn bạn tự đọc trực tiếp.

Nguồn: [giá OpenRouter cho Claude Sonnet 5](https://openrouter.ai/anthropic/claude-sonnet-5), [DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash-0731), [ghi chú giá DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/).

### Bộ nhớ đa agent (`AGENT_ID` + `AGENTMEMORY_AGENT_SCOPE`)

Trong các thiết lập đa agent nơi nhiều role chia sẻ một agentmemory server (architect / developer / reviewer / researcher / support-agent), `AGENT_ID` gắn tag cho mỗi lần write với role đã tạo ra nó. `AGENTMEMORY_AGENT_SCOPE` kiểm soát việc recall có filter theo tag đó hay không.

```env
TEAM_ID=company
USER_ID=engineering-team
AGENT_ID=architect
AGENTMEMORY_AGENT_SCOPE=isolated  # optional; default "shared"
```

Hai chế độ:

| Chế độ | Tag write | Filter recall | Khi nào dùng |
|------|------------|---------------|-------------|
| `shared` (mặc định) | có | không | Context chia sẻ giữa các agent kèm audit trail. Architect có thể thấy những gì developer ghi chú, nhưng mỗi row đều ghi lại ai đã nói điều đó. |
| `isolated` | có | có | Tách biệt nghiêm ngặt. Architect không bao giờ thấy observation / memory / session của developer. |

Những gì bị tag khi `AGENT_ID` được đặt: `Session.agentId`, `RawObservation.agentId`, `CompressedObservation.agentId`, `Memory.agentId`. Role này chảy từ `api::session::start` → `mem::observe` → `mem::compress` → KV.

Những gì bị filter ở chế độ isolated: `mem::smart-search`, `/agentmemory/memories`, `/agentmemory/observations`, `/agentmemory/sessions`. Mỗi endpoint nhận `?agentId=<role>` để ghi đè theo từng request, và `?agentId=*` để bỏ qua scope env hoàn toàn. `/memories` cũng nhận `?includeOrphans=true` để lấy ra các memory từ trước khi có AGENT_ID, có `agentId` là undefined.

Ghi đè theo từng lệnh gọi ở tầng SDK / REST: mọi endpoint mutating (`/session/start`, `/remember`) nhận một field `agentId` trong request body, field này thắng env. Hữu ích cho các runtime định tuyến nhiều role qua một process server. Tool MCP `memory_save` phơi ra cùng field `agentId`, standalone stdio server forward cả `agentId` và `project`, và các memory đã lưu mang `agentId` vào search index, nên search theo scope agent bao phủ cả memory cũng như observation.

Khi `AGENT_ID` chưa được đặt, memory vẫn không có scope (hành vi legacy, không tag, không filter).

### Port

Runtime cục bộ có ba listener. WebSocket engine iii chỉ dùng nội bộ để đăng ký worker, không công khai ra Internet.

| Port | Process | Purpose | Env override |
|------|---------|---------|--------------|
| `3111` | registry `http` worker | REST API, MCP HTTP, health và viewer SSE đã xác thực `/agentmemory/viewer/events` | `III_REST_PORT` |
| `3113` | agentmemory | Viewer UI và proxy | `III_VIEWER_PORT` |
| `49134` | iii engine | WebSocket worker nội bộ | `III_ENGINE_PORT` hoặc `III_ENGINE_URL` |

`--port <N>` đặt REST; mặc định viewer dùng `N+2`, engine dùng `N+46023`. Dùng `--instance N` để cô lập runtime. Self-host mặc định publish `127.0.0.1:3111` và `127.0.0.1:3113`; đổi bằng `AGENTMEMORY_REST_PORT`, `AGENTMEMORY_VIEWER_PORT`. Dùng `REST_ALLOWED_ORIGINS` cho browser origin tin cậy khác.

### File Config

Đặt runtime config trong `~/.agentmemory/.env` thay vì export biến ở mọi shell. Dùng `AGENTMEMORY_ENV_FILE` để chọn env-file khác. Biến môi trường của process được ưu tiên hơn giá trị trong file. Worker Compose do CLI tạo truyền Redis setting tới worker `state`.

```powershell
New-Item -ItemType Directory -Force $HOME\.agentmemory
notepad $HOME\.agentmemory\.env
```

Để test với một subscription Claude Code Pro/Max thay vì một API key, hãy opt-in rõ ràng:

```env
AGENTMEMORY_ALLOW_AGENT_SDK=true
AGENTMEMORY_AUTO_COMPRESS=true
```

Nén observation do LLM viết cần cả hai dòng: quyền truy cập tới một LLM provider (kể cả fallback subscription rõ ràng này) và `AGENTMEMORY_AUTO_COMPRESS=true`. Chỉ riêng một provider sẽ để đường nén synthetic mặc định nguyên tại chỗ.

Consolidation (node graph, lesson, crystal) được bật theo mặc định bất cứ khi nào một LLM provider được cấu hình. Opt-out rõ ràng bằng `CONSOLIDATION_ENABLED=false` nếu bạn muốn hoạt động không-LLM. Graph extraction là một flag riêng:

```env
GRAPH_EXTRACTION_ENABLED=true
# CONSOLIDATION_ENABLED=false   # opt out of auto-consolidation
```

### Biến Môi trường

Tạo `~/.agentmemory/.env`:

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

# Auth (generated in the selected data directory on first start when unset)
# AGENTMEMORY_SECRET=your-secret
# VIEWER_ALLOWED_ORIGINS=https://memory.example.com
# AGENTMEMORY_IMPORT_ROOT=~/projects

# Ports (defaults: 3111 REST API, 3113 viewer)
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

144 endpoint trên port `3111`. REST API bind vào `127.0.0.1` theo mặc định. Các endpoint được bảo vệ cần `Authorization: Bearer <secret>`, và các endpoint mesh sync cần `AGENTMEMORY_SECRET` được đặt rõ ràng trên cả hai phía.

**Xác thực được bật mặc định.** Nếu chưa đặt `AGENTMEMORY_SECRET` (trong shell hoặc `~/.agentmemory/.env`), CLI tạo secret ngẫu nhiên khi khởi động lần đầu và lưu thành `secret`, mode `0600`, trong data directory đã chọn. Client đi kèm đọc secret tại đó khi kết nối server cục bộ; secret chỉ gửi đến loopback URL. Client từ xa cần secret trong environment của chúng. Docker self-host và `deploy/` tự tạo secret. Để gọi API thủ công:


```bash
curl -H "Authorization: Bearer <secret-from-data-dir>" http://localhost:3111/agentmemory/health
```

**Quy tắc request cho các lệnh write.** Các request `POST`, `PUT`, `PATCH` và `DELETE` tới REST API và viewer phải gửi `Content-Type: application/json` (một tham số `charset` thì vẫn ổn) bất cứ khi nào chúng mang theo body, và một header `Origin`, nếu có, phải là một origin loopback cho port REST hoặc viewer đã cấu hình hoặc được liệt kê trong `VIEWER_ALLOWED_ORIGINS` (phân tách bằng dấu phẩy, ví dụ `https://memory.example.com`). Các client không gửi header `Origin` (CLI, hook, MCP, curl, server-to-server) không bị ảnh hưởng. Viewer cũng chấp nhận origin của chính nó.

**Đường dẫn file.** Các endpoint đọc hoặc viết file (`/compress-file`, `/replay/import-jsonl`, `/graph/import-graphify`) chỉ nhận đường dẫn nằm dưới `~/.agentmemory`, thư mục data của instance, hoặc một thư mục được liệt kê trong `AGENTMEMORY_IMPORT_ROOT` (tách nhiều thư mục bằng `:`, hoặc `;` trên Windows). `/replay/import-jsonl` cũng nhận mặc định `~/.claude/projects` của nó. `/obsidian/export` ở trong `AGENTMEMORY_EXPORT_ROOT` và `/migrate` ở trong `~/.agentmemory`. Symlink được resolve trước mỗi lần kiểm tra.

**Scrub secret.** API key, bearer token, block PEM private key và credential nhúng trong URL (`scheme://user:password@host`) đều bị redact trước khi text được lưu, trên mọi đường write: observation, remember, evolve, slot, lesson, action, sketch, signal, checkpoint, import, jsonl replay, mesh sync, team share, output compression và summary, crystal và node graph.

<details>
<summary>Các endpoint chính</summary>

| Method | Path | Mô tả |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Health check (luôn public) |
| `GET` | `/agentmemory/status` | Cái gì đang sai và cách sửa nó (HTML cho browser, JSON cho trường hợp khác) |
| `GET` | `/agentmemory/viewer/snapshot` | Mọi thứ viewer hiển thị, trong một response |
| `POST` | `/agentmemory/session/start` | Bắt đầu session + lấy context |
| `POST` | `/agentmemory/session/end` | Kết thúc session |
| `POST` | `/agentmemory/observe` | Capture observation (xem phần capture delivery dưới đây) |
| `GET` | `/agentmemory/capture` | Capture inbox, dead letter và offline spool |
| `POST` | `/agentmemory/capture/retry` | Retry các capture dead-letter |
| `POST` | `/agentmemory/capture/drain` | Gửi offline spool cục bộ ngay |
| `POST` | `/agentmemory/smart-search` | Tìm kiếm hybrid |
| `POST` | `/agentmemory/context` | Sinh context |
| `POST` | `/agentmemory/remember` | Lưu vào bộ nhớ dài hạn |
| `POST` | `/agentmemory/forget` | Xóa observation |
| `POST` | `/agentmemory/enrich` | Context file + memory + bug |
| `GET` | `/agentmemory/profile` | Hồ sơ project |
| `GET` | `/agentmemory/export` | Export toàn bộ dữ liệu |
| `POST` | `/agentmemory/import` | Import từ JSON |
| `POST` | `/agentmemory/graph/query` | Truy vấn knowledge graph |
| `POST` | `/agentmemory/graph/compact` | Cắt gọn provenance graph quá lớn |
| `POST` | `/agentmemory/team/share` | Chia sẻ với team |
| `GET` | `/agentmemory/audit` | Audit trail |

Danh sách endpoint đầy đủ: [`src/triggers/api.ts`](../src/triggers/api.ts)

</details>

**Capture delivery.** Hook gửi mỗi observation một lần tới `POST /agentmemory/observe` kèm một `eventId`. Đó là id riêng của host cho lệnh gọi này khi payload có sẵn một id (ví dụ `tool_use_id` của Claude Code), nếu không thì là một hash của session, loại hook, tên tool, input, output và timestamp của host. Server viết event vào một capture inbox trong state store, lưu observation, rồi xóa entry trong inbox. Status code nói lên điều gì đã xảy ra:

| Status | Field `status` | Ý nghĩa |
|---|---|---|
| `201` | `accepted` | Đã lưu. `observationId` là observation mới. |
| `202` | `accepted` (`state: "retrying"`) | Đã accept, nhưng lưu thất bại. Server sẽ retry, cả sau một lần restart. |
| `200` | `duplicate` | `eventId` này đã được accept trước đó. `observationId` là observation đã có; không có gì mới được lưu. |
| `400` / `422` | `rejected` | Payload không hợp lệ, hoặc lưu thất bại hẳn (event được giữ lại như một dead letter). |
| `503` | `rejected` (`retryable: true`) | Inbox đã đầy (`AGENTMEMORY_CAPTURE_INBOX_MAX`). Hook sẽ spool event lại và gửi sau. |

Các event thất bại được retry mỗi `AGENTMEMORY_CAPTURE_RETRY_INTERVAL_MS` (10 giây) với backoff tăng dần, tối đa `AGENTMEMORY_CAPTURE_MAX_ATTEMPTS` (5). Các event vẫn thất bại sẽ nằm lại trong inbox như dead letter, được liệt kê trên `/agentmemory/status` và trang Health của viewer, và có thể retry bằng `POST /agentmemory/capture/retry` (`{"eventId": "..."}` hoặc `{"all": true}`). Các event id đã accept được ghi nhớ trong `AGENTMEMORY_CAPTURE_DEDUP_HOURS` (168 giờ, tối đa `AGENTMEMORY_CAPTURE_EVENTS_MAX` id), nên một hook được replay sau một timeout hay một restart chỉ được lưu một lần, trong khi hai lệnh gọi tool riêng biệt với id host riêng của chúng được lưu hai lần dù nội dung giống nhau. Khi một observation bị xóa (forget, xóa session, eviction, auto-forget hoặc một import thay thế store), event của nó được đánh dấu đã xóa trước khi observation bị gỡ, nên một lần replay của event đó trong cùng window được trả lời như một duplicate và không lưu gì cả. State store viết ra disk mỗi 2 giây, nên một event đã được trả lời vẫn có thể chỉ nằm trong memory một khoảnh khắc. Để bù cho điều đó, mỗi câu trả lời `2xx` cũng mang theo `bootId` của server (mới ở mỗi lần khởi động), `acceptedAt` và `durableAfterMs` (interval save cộng 1.5 giây trên file store, 1.5 giây trên redis, nơi độ bền là setting của người vận hành). Hook giữ event trong spool cục bộ cho tới khi window đó trôi qua và xóa nó ở một lệnh gọi sau mà không cần một request khác. Nếu `bootId` đã thay đổi vào lúc đó, server đã restart, nên hook gửi lại event với cùng `eventId`; một event đã chạm tới disk không bị lưu hai lần. Server cũng tự gửi các event như vậy lúc khởi động và ở mỗi retry interval, nên một lần restart không mất gì cả dù không có hook nào chạy sau đó. Các hook cũ bỏ qua các field thêm này, và các hook mới chạy với một server cũ sẽ drop event khi nhận `2xx` như trước.

Khi server down, không trả lời kịp hoặc trả về 5xx, hook sẽ append observation vào một file spool cục bộ, `<data dir>/capture-spool/<host>-<port>.jsonl` (ghi đè thư mục bằng `AGENTMEMORY_CAPTURE_SPOOL_DIR`). File này riêng tư cho user của bạn (mode 600), secret được redact theo đúng cách server redact chúng, nó giữ tối đa `AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES` (5 MiB) và drop các entry cũ hơn `AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS` (168). Khi nó đầy, các entry mới bị drop và được đếm, và `/agentmemory/status` sẽ báo cáo điều đó. Hook vẫn exit 0 trong giới hạn thời gian của nó và không thêm request nào khi server khỏe mạnh. Spool được gửi ở lần khởi động kế tiếp và bởi hook đầu tiên chạm tới server trở lại, trong một process nền để agent không phải chờ. Event id làm cho điều này an toàn: một observation đã đến trước một timeout không bị lưu hai lần. `npx @agentmemory/agentmemory capture` hiển thị spool và inbox của server, `--drain` gửi spool ngay, và `GET /agentmemory/capture` trả về cùng dữ liệu đó dưới dạng JSON. Đặt `AGENTMEMORY_CAPTURE_SPOOL=false` để tắt spool.

**Compact provenance của graph.** Mỗi node và edge của knowledge graph giữ id của 32 observation mới nhất mà nó bắt nguồn từ đó. Các store được viết trước giới hạn đó có thể giữ hàng nghìn id cho mỗi node hot, khiến graph search và viewer chậm hoặc làm worker crash. agentmemory tự sửa điều này: ở lần khởi động đầu tiên sau khi nâng cấp, nó cắt gọn mọi node, edge, edge đã bị supersede (lịch sử graph temporal) và snapshot đã cache xuống đúng giới hạn ở nền, theo từng slice nhỏ có khoảng nghỉ giữa chúng, để search, capture và viewer vẫn hoạt động. Nó lưu tiến độ, resume sau một lần restart và không bao giờ chạy lại khi đã hoàn tất. `/agentmemory/status` và trang Health của viewer hiển thị nó là pending, running (kèm scope và vị trí hiện tại), done hoặc failed. Đặt `AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false` để tắt nó.

Để chạy nó bằng tay, gọi `POST /agentmemory/graph/compact`. Nó duyệt qua các index tên và edge-key thay vì liệt kê mọi node và edge, và an toàn để chạy lại. Khi nó cắt gọn id, nó viết một audit entry `graph_compact`.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{}'
```

Trên một store lớn, hoặc khi lệnh gọi trả về 504, hãy chạy nó theo slice. Gửi `scope` (`nodes`, `edges` hoặc `history`), `offset` và `limit`, rồi gọi lại với `nextOffset` được trả về cho tới khi nó là `null`. Làm điều này cho `nodes`, `edges` và `history`, và kết thúc với một lệnh gọi `{"scope":"snapshot"}`, vì một lần chạy theo slice không chạm tới snapshot đã cache.

```bash
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"nodes","offset":0,"limit":200}'
curl -X POST http://localhost:3111/agentmemory/graph/compact -H "Content-Type: application/json" -d '{"scope":"snapshot"}'
```

---

<h2 id="development"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-development.svg"><img src="../assets/tags/section-development.svg" alt="Phát triển" height="32" /></picture></h2>

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 3,800+ tests
npm run test:integration  # API tests (requires running services)
```

**Yêu cầu:** Node.js >= 20 kèm npm/npx. Cài engine qua CLI trên macOS/Linux cần `curl`, POSIX `sh` và `tar`; Windows native cần cài thủ công `iii.exe` đã pin hoặc dùng WSL2.

<h2 id="license"><picture><source media="(prefers-color-scheme: dark)" srcset="../assets/tags/light/section-license.svg"><img src="../assets/tags/section-license.svg" alt="Giấy phép" height="32" /></picture></h2>

[Apache-2.0](../LICENSE)
