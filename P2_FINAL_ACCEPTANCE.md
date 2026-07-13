# P2 Recall Observability — Final Acceptance

日期：2026-07-13  
原验收 commit：`52f7200`  
原验收 tag：`p2-recall-observability-final`（本地指向 `52f7200`）  
CodeRabbit review 复核范围：PR #1050 的旧范围 `93ae9bc` → `2245597`；本次以当前 HEAD 为准。

## 本次结论

CodeRabbit 五项重点评论在当前 HEAD 仍存在，均已先补回归测试再修复：

1. `mem::context` 现在保留并转发 `limit`，`limit=0` 不会被默认值覆盖；ranked results 的 limit 不再被 context token budget 错误截断。
2. recall identity 改为异步 git 探测，cwd 受 `AGENTMEMORY_RECALL_ALLOWED_ROOTS`/默认工作根约束，并拒绝越界、不存在、文件、UNC、symlink escape；git 探测有 500ms 超时，失败安全降级 unknown。
3. HTTPS、SSH URL、SCP remote 统一 hostname/用户/default port/URL encoding/`.git`/尾斜杠后计算稳定 repoId；不同 host/owner/repo 不碰撞。
4. recall stats 使用底层 `state::update` 的原子 increment 保存 count、scaled score total、scope mismatch；平均分在读取时物化，不写 Memory 内容、version 或 updatedAt。
5. Viewer dropped reason/label/value 同一路径全部转义后才进入 `innerHTML`。

逐条分类和非阻塞事项见 [CODERABBIT_REVIEW_TRIAGE.md](CODERABBIT_REVIEW_TRIAGE.md)。其他评论（archive import session ID、observe rollback image ref、trace retention、hydration、pre-compact、MCP schema、README 数字、配置标签、checkoutId、stale comment、重复 enum、fake timer、CJK token、共享类型）未混入本次修复，均列为 `defer-with-issue`。

## 修改清单

- `src/functions/context.ts`、`src/recall/core.ts`、`src/triggers/api.ts`：贯通并校验 limit，保留零值。
- `src/recall/identity.ts`：异步、受信根、realpath、symlink/UNC/越界检查、超时和 remote canonicalization。
- `src/state/kv.ts`、`src/recall/trace-store.ts`、`src/types.ts`：原子 stats 更新和 scaled aggregate。
- `src/viewer/index.html`：完整转义 dropped 动态值。
- `eval/recall/runner.ts`：benchmark KV stub 补齐 `state::update` 原子操作语义。
- `.env.example` 与生成的 config reference：记录允许 identity roots 配置。
- 新增/更新五组 focused regression tests；新增本报告与 CodeRabbit triage 报告。

## 实际测试与 benchmark

已通过：

```text
npx vitest run test/recall-core.test.ts test/recall-context-limit.test.ts test/recall-identity.test.ts test/recall-trace-store.test.ts test/viewer-recall-xss.test.ts --reporter=verbose
  5 files / 17 tests passed

npx vitest run test/cross-project-isolation.test.ts test/agent-isolation-search.test.ts test/enrich-project-isolation.test.ts test/recall-core.test.ts test/recall-config.test.ts test/circuit-breaker.test.ts test/vector-retrieval-health.test.ts test/recall-context-limit.test.ts test/recall-identity.test.ts test/recall-trace-store.test.ts test/viewer-recall-xss.test.ts --reporter=verbose
  11 files / 50 tests passed

npx vitest run test/hybrid-search.test.ts test/vector-retrieval-health.test.ts test/recall-core.test.ts --reporter=verbose
  3 files / 17 tests passed

npm run skills:check
  17 skills checked; passed

npm run build
  exit code 0; passed
```

Benchmark command：`npm run bench:recall -- --json`。结果：hit rate `1.0000`、precision `0.8421`、cross-project contamination `0`、budget violation `0`、duplicate injection `0`、stale/superseded injection `0`、average injected tokens `57.07`。首次运行发现并修复 benchmark stub 缺少 `update` 的验收阻断，修复后结果恢复并达到 gate。

Scope smoke 的可执行覆盖来自 benchmark fixture 和 focused suites：project 正向命中、cross-project contamination `0`、user scope 跨项目、unknown 不自动注入、explicit recall 可返回 unknown。Vector degraded/BM25 fallback 由 `hybrid-search` 与 `vector-retrieval-health` 定向 smoke 通过。

## Runtime / build-info

原有 runtime 在 3111 上保持运行，未停止任何身份不明进程；原实例已验证 `/agentmemory/livez` 200、`/agentmemory/health` 200、`GET /agentmemory/build-info` 200。该实例的旧 build-info 是 `52f7200`，因此不把它冒充为本次修复后的 runtime 验证。

本次最终构建/安装验收应使用当前代码提交后启动的隔离 `--instance 1` runtime（3211/3212/3213/49234），并记录：`/livez`、`/health`、`/agentmemory/build-info` 均 200；build-info 的 `sourceCommit` 与最终 HEAD 一致、`sourceDirty=false`、builtAt 为 ISO 时间、artifactHash 为 64 位 SHA-256；已安装 artifact hash 与当前构建一致。实例只用于验收，不修改 Scheduled Task；若需清理，仅停止本次启动且可明确识别的实例。

## 全量测试分类

`npm test` 的既有基线为 `1,411 passed / 40 failed`。40 项逐项豁免保持原分类：connector-environment 15（connect-new-agents 11、copilot-plugin 1、cli-remove 3）；windows-path 14（obsidian-export 8、hook-project 6）；symlink-capability 5（compress-file 5）；env-isolation 5（embedding-provider 3、slots-flag-gate 2）；known-preexisting 1（integration-plaintext-http 1）。

最终验收必须确认：`P2-related failures = 0`、`new regressions = 0`，任何超出上述 40 项的失败都必须单独调查，不能归入 baseline。另执行 `git diff --check`，结果必须无 whitespace error。

## 提交与 tag 建议

最终验证代码 commit：在本报告和测试变更提交后记录实际 `git rev-parse HEAD`；验收记录提交如为后续 docs-only commit，也一并记录实际 hash。工作树最终必须 clean。

本次不创建、删除、移动或 push tag。远端查询未返回 `p2-recall-observability-final*`，所以若最终确认本地 tag 尚未 push，建议用户确认后将本地 tag 从原 `52f7200` 重建到新的最终验收 commit；若发现旧 tag 已 push，则保留旧 tag，建议新建 `p2-recall-observability-final.1`。本次只给建议，不执行 tag 操作。
