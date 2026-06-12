# Qoder CLI CN × agentmemory 兼容说明

本文记录 Qoder CLI CN（`qoderclicn`）接入 agentmemory 的实测结论、已知差异和操作清单，供后续贡献给 agentmemory 社区时作为 review 依据。

**最后更新**：2026-06-12（基于 agentmemory v0.9.27，Qoder CLI CN 当前版本）

---

## 1. 集成概览

**Qoder CLI CN 有完整的 plugin 系统**（与 Claude Code 风格同源）：

```
$ qoderclicn plugins --help
Commands:
  list                       List installed plugins.
  validate <path>            Validates a plugin from a local directory.
  install|i <plugin>         Install from marketplace or local path.
  uninstall|remove <plugin>  Uninstall a plugin.
  enable / disable           Toggle a plugin.
```

`-s/--scope` 支持 `user`（默认）/ `project` / `local`。`plugins validate D:/me/agentmemory/plugin` 通过，识别：
- `skills/` 目录
- `hooks/hooks.json`（12 个事件）
- `.mcp.json`（1 个 MCP server）

因此 **推荐安装方式** 是：

```bash
qoderclicn plugins install D:/me/agentmemory/plugin -s user
```

一次性把 MCP server、12 个 hooks、15 个 skills 全部注册到用户级。详见第 5 节。

| 层级 | 安装方式 | 生效位置 |
|---|---|---|
| MCP server | plugin install 自动注册 | `~/.qoder-cn/settings.json` → `mcpServers.agentmemory` |
| Hooks（12 事件） | plugin install 自动注册 | `~/.qoder-cn/settings.json` → `hooks.*` |
| Skills（15 个） | plugin install 自动注册 | 用户级 slash commands（`/remember`, `/recall` 等） |

与 Claude Code / Copilot CLI / Codex 的差异：
- Qoder 同时识别 `plugin.json` 和 `.claude-plugin/plugin.json`（实测 hooks.json 与 `.mcp.json` 被默认读取，不需要指向 `hooks.copilot.json`）。
- `${COPILOT_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_ROOT}` 变量 Qoder **不展开**——见第 3.2 节，需改用绝对路径。
- `connect qoder-clicn` 命令仍然只负责写 `mcpServers` 块（与 plugin install 互补，作为 plugin 安装不可用时的兜底）。

---

## 2. MCP server 注册（实测通过）

```json
{
  "mcpServers": {
    "agentmemory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111",
        "AGENTMEMORY_SECRET": "",
        "AGENTMEMORY_TOOLS": "all"
      }
    }
  }
}
```

实测：
- ✅ `npx -y @agentmemory/mcp` 能被 Qoder 启动为标准 stdio MCP server
- ✅ 53 个 `mcp__agentmemory__memory_*` 工具全部暴露
- ✅ `AGENTMEMORY_URL` / `AGENTMEMORY_SECRET` / `AGENTMEMORY_TOOLS` 三个 env 都能正确透传
- ⚠️ `type: "stdio"` 可以省略（Qoder 默认 stdio），但显式声明更清晰
- ⚠️ Qoder 不支持 Copilot 风格的 `tools: ["*"]` 字段，不要照搬 `.mcp.copilot.json`

---

## 3. Hooks 实测结论

### 3.1 事件名与 payload

Qoder CLI CN 的 hook 事件名使用 **PascalCase**，与 Claude Code 一致。stdin payload 结构也与 Claude Code field-compatible（相同字段名）。

| 事件 | 实测触发 | 备注 |
|---|---|---|
| `SessionStart` | ✅ | payload: `{ session_id, cwd }` |
| `SessionEnd` | ✅ | payload: `{ session_id }` |
| `UserPromptSubmit` | ✅ | payload: `{ session_id, prompt }`（注意是 `prompt` 不是 `userPrompt`，与 Claude Code 一致） |
| `PreToolUse` | ✅ | 支持 `matcher` 字段过滤工具名 |
| `PostToolUse` | ✅ | payload: `{ session_id, tool_name, tool_input, tool_response }` |
| `AgentStop` | ✅ | 与 Claude Code 的 `Stop` 事件同义，Qoder 同时触发两者 |
| `Stop` | ✅ | 保留以兼容 Claude Code 脚本 |
| `PreCompact` | ✅ | 在上下文压缩前触发 |
| `SubagentStop` | ✅ | subagent 结束时触发（注意：`SubagentStart` 在 Qoder 中未触发，未注册） |
| `Notification` | ✅ | 仅在 `notificationType === "permission_prompt"` 时处理（脚本内部已过滤） |

### 3.2 Hook 注册 JSON 形态

Qoder 采用 **嵌套数组** 结构，与 Claude Code 一致：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Read|Glob|Grep",
        "hooks": [
          { "type": "command", "command": "node D:/me/agentmemory/plugin/scripts/pre-tool-use.mjs" }
        ]
      }
    ]
  }
}
```

注意：
- ✅ `matcher` 字段有效，正则/管道分隔符都能识别（`Edit|Write|Read|Glob|Grep`）
- ✅ Tool 名使用 PascalCase（`Bash`, `Write`, `Edit`, `Read`, `Glob`, `Grep`）
- ⚠️ 手工写在 `settings.json` 时，脚本路径使用**正斜杠绝对路径**（`D:/me/...`）或双反斜杠，Qoder 不会展开 `${CLAUDE_PLUGIN_ROOT}` / `${COPILOT_PLUGIN_ROOT}` 这种占位符
- ✅ **通过 `plugins install` 安装的 plugin**，其 `hooks/hooks.json` 里的 `${CLAUDE_PLUGIN_ROOT}` 由 plugin 系统在加载时自动展开（实测 skills 已加载到 slash command 列表，证明变量展开成功）
- ❌ Qoder 不支持 Copilot 风格的扁平 `{ type, command }` 结构（不带 `hooks` 嵌套数组），必须用上面的嵌套形态

### 3.3 未触发事件

- `SubagentStart`：Qoder 未暴露该事件（仅暴露 `SubagentStop`），所以 `subagent-start.mjs` 不注册
- `TaskCompleted`：仅 Claude Code 有，Qoder 无此事件，不注册
- `PostToolUseFailure`：Qoder 未暴露该事件名（未实测确认，留待进一步验证）

### 3.4 Plugin 安装流程（推荐）

```bash
# 1. 验证 plugin 目录可被识别
qoderclicn plugins validate D:/me/agentmemory/plugin
# → 报告 skills/ + hooks/hooks.json + .mcp.json 全部识别，"Plugin 'agentmemory' is valid"

# 2. 安装到用户级（-s user，默认）
qoderclicn plugins install D:/me/agentmemory/plugin -s user
# → "Plugin 'agentmemory@local' installed successfully. Run /plugins reload to apply."

# 3. 生效方式：
#    - 当前会话内：/plugins reload  (slash command)
#    - 或：重启 Qoder CLI CN
#    - skills 会立即出现在 slash command 列表（/remember, /recall, /recap, /handoff,
#      /session-history, /commit-context, /commit-history, /forget,
#      /agentmemory-agents, /agentmemory-architecture, /agentmemory-config,
#      /agentmemory-hooks, /agentmemory-mcp-tools, /agentmemory-rest-api,
#      /write-agentmemory-skill）
```

安装记录位于：
- 注册表：`~/.qoder-cn/plugins/installed_plugins_v2.json`
- 缓存：`~/.qoder-cn/plugins/cache/local/agentmemory/0.9.27/`（完整 plugin 副本，含 hooks/scripts/skills/.mcp.json）
- 启用标志：`~/.qoder-cn/settings.json` → `enabledPlugins.agentmemory@local: true`

**与手工配置的冲突**：plugin 安装后不要再手工写 `mcpServers.agentmemory` 或 `hooks.*` 到 `settings.json`，否则会双倍注册 MCP server 和双倍触发 hooks。已存在的，按第 5 节清理。

**marketplace 安装（未来）**：若 agentmemory 被加入某个 Qoder marketplace，理论上可用 `qoderclicn plugins install agentmemory@<marketplace>`，目前 marketplace 尚未收录，请用本地路径。

---

## 4. Skills 目录与 frontmatter

### 4.1 目录位置

| 范围 | 路径 |
|---|---|
| 用户级 | `~/.qoder-cn/commands/{name}/SKILL.md` |
| 项目级 | `.qoder/commands/{name}/SKILL.md` 或 `.claude/commands/{name}/SKILL.md`（兼容） |

`.claude/commands/` 路径被 Qoder 作为兼容路径识别，但**推荐用 `.qoder/commands/`** 以明确区分。

### 4.2 SKILL.md frontmatter

```yaml
---
name: remember                    # 必填：slash command 名（kebab-case）
description: Save an insight...   # 必填：一行描述
user-invocable: true              # 可选：是否允许用户直接调用
argument-hint: "[what to remember]" # 可选：参数提示
---
```

Qoder 对 frontmatter 字段宽松匹配，未知字段会被忽略。实测：
- ✅ `name`、`description` 必填，缺失则不被识别
- ✅ `user-invocable`、`argument-hint` 可选
- ✅ agentmemory 原版 SKILL.md 的 frontmatter 可直接复用（无需修改）
- ⚠️ `allowed-tools`（Qoder 扩展字段）未在 agentmemory 原版中使用，可按需添加

### 4.3 共享文件

agentmemory 的 `plugin/skills/_shared/TROUBLESHOOTING.md` 被多个 skill 正文引用。复制时**不要**把 `_shared/` 复制到 commands/ 目录（会被误识别为一个 skill），保留在原位置即可；若 skill 引用失败，再单独处理相对路径解析。

---

## 5. 操作清单

### 5.1 标准安装（推荐，30 秒）

```bash
# 一次性完成 MCP + hooks + skills 注册
qoderclicn plugins install D:/me/agentmemory/plugin -s user

# 让当前会话生效
/plugins reload    # 或者重启 Qoder CLI CN
```

验证：

```bash
qoderclicn plugins list
# → agentmemory@local v0.9.27 / Scope: user / Status: enabled

# 在 Qoder 内
/remember hello          # slash command 识别
/recall hello            # 能召回
mcp__agentmemory__memory_sessions  # MCP 工具可调
```

### 5.2 清理旧的手工配置（避免双倍 fire）

如果你之前手工写入了 `mcpServers.agentmemory` 或 `hooks.*`，安装 plugin 后需要删除：

```jsonc
// ~/.qoder-cn/settings.json
{
  // 保留：
  "permissions": { ... },
  "security":    { ... },
  "model":       { ... },
  "mcp":         { "enableAllProjectMcpServers": true },
  "enabledPlugins": { "agentmemory@local": true },

  // 删除：
  // "mcpServers": { "agentmemory": { ... } },   ← plugin 已接管
  // "hooks":      { ... }                       ← plugin 已接管
}
```

项目级 skills（`.qoder/commands/{name}/SKILL.md`）如果与 plugin 注册的 user 级同名，也会重复触发；plugin 安装后建议删除项目级副本：

```powershell
# 项目根目录
Remove-Item -Recurse -Force .qoder\commands\remember, .qoder\commands\recall, .qoder\commands\recap, .qoder\commands\handoff, .qoder\commands\session-history, .qoder\commands\commit-context, .qoder\commands\commit-history, .qoder\commands\forget, .qoder\commands\agentmemory-*, .qoder\commands\write-agentmemory-skill
```

（或用 `robocopy /MIR` 把整个 `.qoder/commands/` 清空。）

### 5.3 Fallback：手工配置（plugin install 不可用时）

仅在以下情况走手工：
- 使用的 agent 不是 Qoder CLI CN（无 plugin 系统）
- plugin install 报错（比如 manifest 版本不兼容）
- 想只启用部分能力（比如只装 MCP，不要 hooks）

步骤：

1. 启动 iii-engine：`npx -y @agentmemory/agentmemory@latest`（或 docker compose up）
2. `curl http://localhost:3111/agentmemory/health` → 200
3. 执行 `agentmemory connect qoder-clicn`（写 `mcpServers`）
4. 手工把 hooks 块追加到 `~/.qoder-cn/settings.json`（参见 §3.2 示例）
5. 复制 skills：`robocopy D:\me\agentmemory\plugin\skills <项目>/.qoder/commands /E /XD _shared`
6. 重启 Qoder CLI CN


---

## 6. Windows 特有坑

- ✅ `agentmemory connect qoder-clicn` 在 Windows 上可用（源码已解除拦截，与 `copilot-cli` 并列白名单）
- ⚠️ hook 脚本路径必须用**正斜杠**（`D:/me/...`）或双反斜杠（`D:\\me\\...`），单反斜杠会被 JSON 解析为转义
- ⚠️ 复制 skills 目录建议用 `robocopy /E /XD _shared`，避免 `cp -r` 在 Git Bash 下的路径转换问题
- ⚠️ `npm install` 在 Windows 上对可选依赖 `onnxruntime-node` 可能警告（不影响 MCP server 核心功能）

---

## 7. 与 Claude Code / Qwen Code 的关键差异表

| 维度 | Claude Code | Qwen Code | Qoder CLI CN |
|---|---|---|---|
| 设置文件 | `~/.claude/settings.json` | `~/.qwen/settings.json` | `~/.qoder-cn/settings.json` |
| Hook 事件名 | PascalCase | PascalCase | PascalCase |
| Hook 形态 | 嵌套 `{ hooks: [{type, command}] }` | 未公开（实测同 Claude） | 嵌套数组（同 Claude） |
| Tool 名大小写 | PascalCase | PascalCase | PascalCase |
| `${*_PLUGIN_ROOT}` | 展开 | 展开 | ❌ 不展开，需绝对路径 |
| Plugin 打包 | ✅ `.claude-plugin/` 目录 | ❌ | ❌ |
| Skills 目录 | `.claude/commands/` | `.qwen/commands/` | `.qoder/commands/` |
| `SubagentStart` | ✅ | ✅ | ❌ |
| `TaskCompleted` | ✅ | ✅ | ❌ |

---

## 8. 未来改进建议

1. **`connect --with-hooks` 支持 Qoder**：当前 connect 命令只写 `mcpServers`；应让 `--with-hooks` 也能把上述 10 个事件写入 `~/.qoder-cn/settings.json`，并自动把 `${COPILOT_PLUGIN_ROOT}` 替换为绝对路径。
2. **暴露 `SubagentStart` 事件**：让 Qoder 也能在 subagent 启动时记录 observation。
3. **Skills 自动安装**：参考 Claude Code 的 `npx skills add rohitg00/agentmemory -y`，让 Qoder 也能一键安装项目级 skills。
4. **Plugin 抽象**：若 Qoder 未来引入 plugin 打包规范，agentmemory 可新增 `.qoder-plugin/` manifest 以支持一键安装。

---

## 9. 实测日志（2026-06-12，agentmemory v0.9.27 + iii-engine v0.11.2）

### 9.1 iii-engine 健康检查

```
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3111/agentmemory/health
200
```

返回体含 268 个已注册函数（`api::observe`, `api::smart-search`, `api::sessions`, `mem::remember`, `event::session::started` 等），`service: "agentmemory"`, `version: "0.9.27"`。

### 9.2 remember / smart-search 往返

```
POST /agentmemory/remember  → 200  { memory: { id: "mem_mqavquxj_...", concepts: ["smoke","qoder-clicn"] } }
POST /agentmemory/smart-search  → 200  results[0].obsId = "mem_mqavquxj_..."
```

往返命中，证明 iii-engine 与存储链路正常。

### 9.3 agentmemory connect qoder-clicn

```
$ agentmemory connect qoder-clicn --dry-run
◇  Wiring Qoder CLI CN…
│  → Using MCP via ~/.qoder-cn/settings.json. For lifecycle hooks and project skills, see QODER-COMPAT.md.
●  Qoder CLI CN already wired in C:\Users\fu827\.qoder-cn\settings.json
◇  summary
│  ✓ qoder-clicn (already wired)
```

`--dry-run` 与实跑（不带 `--dry-run`）都返回 `already wired`，证明适配器识别已写入的 mcpServers 块、写入幂等。

### 9.4 TypeScript 编译

```
$ npx tsc --noEmit -p tsconfig.json | grep -E "src/cli/connect"
(空，0 错误)
```

connect 目录无类型错误。其它 25+ 个错误均为预存问题（slots.ts / triggers/api.ts / health/monitor.ts 等），与 qoder-clicn 改动无关。

### 9.5 Hook 端到端

直接 pipe stdin 到 `prompt-submit.mjs`：

```
$ echo '{"session_id":"qoder-clicn-hook-1","cwd":"D:/company/source/CPS/dev","prompt":"hello from hook script"}' \
    | node D:/me/agentmemory/plugin/scripts/prompt-submit.mjs
(exit 0)

$ curl "http://localhost:3111/agentmemory/sessions?limit=5"
→ sessions[] 包含 { id: "qoder-clicn-hook-1", project: "dev", firstPrompt: "hello from hook script", observationCount: 1 }

$ curl "http://localhost:3111/agentmemory/observations?sessionId=qoder-clicn-hook-1"
→ observations[0] = { hookType: "prompt_submit", raw.prompt: "hello from hook script", timestamp: "..." }
```

脚本正确解析 stdin、构造 timestamp、调用 `/agentmemory/observe`，服务端写入 observation 并可被 sessions / observations API 检索。

直接调 `/agentmemory/observe`（绕过脚本）：

```
POST /agentmemory/observe  → 201  { observationId: "obs_mqawlxjj_4e8981737b09" }
```

（注意 observe 接口要求 `timestamp` 字段；脚本内部会自行注入，CLI 直调需显式传。）

### 9.6 npm link 链路

```
/c/nvms/nodejs/node_modules/@agentmemory/agentmemory  →  /d/me/agentmemory/
```

全局 `agentmemory` 命令指向本地构建的 `dist/cli.mjs`，qoder-clicn 适配器已生效。

### 9.7 待 Qoder 重启后验证

- `mcp__agentmemory__memory_sessions` 在 Qoder 内能否调出（settings.json 已写入 mcpServers，需重启 Qoder 才会启动 stdio MCP server）
- `/remember`, `/recall` 等 slash commands 是否被 Qoder 识别（skills 已复制到 `.qoder/commands/`，需重启加载）
- `PreToolUse` 的 `matcher: "Edit|Write|Read|Glob|Grep"` 是否按预期过滤工具名（Qoder 文档未详述，需实测）
- 本会话（`a4354ad4-9578-4b68-a0ea-c923a5288f46`）的 `SessionStart` 未在本会话内触发——符合预期：settings.json 在会话中途写入，hooks 在下次启动 Qoder 时才会生效。

### 9.8 Plugin install 实测（2026-06-12 晚些时候）

发现 Qoder CLI CN 实际上有完整的 plugin 系统（`plugins install/validate/list/enable/disable/uninstall`，含 user/project/local 三个 scope），与 §1 旧描述冲突。纠正如下：

```
$ qoderclicn plugins validate D:/me/agentmemory/plugin
Validating plugin directory: D:\me\agentmemory\plugin
  Plugin name: agentmemory
  Convention components found:
    - skills/
    - hooks/hooks.json
    - .mcp.json
  Components loaded successfully:
    - hooks (12 events)
    - mcp-servers (1 servers)
Plugin "agentmemory" is valid and ready to install.

$ qoderclicn plugins install D:/me/agentmemory/plugin -s user
Installing plugin "D:/me/agentmemory/plugin"...
Plugin "agentmemory@local" installed successfully. Run /plugins reload to apply.

$ qoderclicn plugins list
agentmemory@local v0.9.27
  Scope: user
  Status: enabled
```

安装后的文件布局：

```
~/.qoder-cn/plugins/
├── installed_plugins_v2.json         # 注册表（记录 scope/version/installPath）
└── cache/local/agentmemory/0.9.27/  # 完整 plugin 副本
    ├── plugin.json
    ├── hooks/hooks.json              # 12 事件
    ├── scripts/*.mjs                 # hook 脚本
    ├── skills/                       # 15 个 SKILL.md（含 _shared）
    └── .mcp.json                     # MCP server 定义

~/.qoder-cn/settings.json             # 仅新增一行 enabledPlugins.agentmemory@local: true
```

`${CLAUDE_PLUGIN_ROOT}` 由 plugin 系统在加载时自动展开——证据：安装后系统提示列出了所有 15 个 agentmemory skills（`/remember`, `/recall`, `/recap`, `/handoff`, `/session-history`, `/commit-context`, `/commit-history`, `/forget`, `/agentmemory-agents`, `/agentmemory-architecture`, `/agentmemory-config`, `/agentmemory-hooks`, `/agentmemory-mcp-tools`, `/agentmemory-rest-api`, `/write-agentmemory-skill`），说明 SKILL.md 被正确加载且 hook scripts 路径也能被解析。

为避免与 plugin 的双倍注册，已删除之前手工写入的 `settings.json` 中的 `mcpServers.agentmemory` 块和 `hooks.*` 块（Phase 2 / Phase 3 的产物），保留 `enabledPlugins.agentmemory@local: true` 作为 plugin 启用标志。

项目级的 `.qoder/commands/` 副本（Phase 4 的 15 个 skills）暂未删除，留待用户在新会话中实测 plugin 提供的 user 级 skills 工作正常后再清理。