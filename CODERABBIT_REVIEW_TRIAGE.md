# CodeRabbit Review Triage — PR #1050

日期：2026-07-13  
当前复核基线：`52f7200` (`p2-recall-observability-final`)  
CodeRabbit 原 review 范围：`93ae9bc` → `2245597`  

本报告按当前 HEAD 复核旧评论；旧评论没有被直接当作当前代码事实。此次工作不 push、不写远端 issue、不修改 Scheduled Task，也不移动 tag。

## 当前仍有效且本次修复

| 评论 | 当前分类 | 当前证据与处理 |
|---|---|---|
| `mem::context` 丢弃 `limit` | `still-valid` → fixed | `src/functions/context.ts` 未转发调用方 limit，且 Recall Core 用 `limit || 20`；新增 context/Core 回归测试，转发并保留 `limit=0`。 |
| `resolveRecallIdentity` 接受任意 cwd 并同步执行 git | `still-valid` → fixed | 当前路径使用同步 git 且未做可信根约束；改为异步、500ms 超时、显式允许根、realpath/目录/UNC/越界/symlink escape 校验，并对失败降级 unknown。 |
| Git remote 归一化不一致 | `still-valid` → fixed | HTTPS、SSH URL、SCP 旧实现产生不同 fingerprint；统一 hostname、用户信息、默认端口、URL decoding、`.git` 和尾斜杠处理，并覆盖不同 host/owner/repo 不碰撞。 |
| Recall stats 非原子 get/set | `still-valid` → fixed | 选中数、分数总和和 scope mismatch 改用 `state::update` 原子 increment；平均分由缩放整数累加器物化；memory 内容/version/updatedAt 不参与写入。 |
| Viewer dropped count 未完整转义 | `still-valid` → fixed | dropped reason/label/value 的同一路径统一经 `esc(String(...))` 后进入 `innerHTML`，并加入 payload XSS 回归测试。 |

## 其他评论的当前分类

| 评论 | 当前分类 | 说明 |
|---|---|---|
| README 测试数 `1,423` vs `1,500+` | `defer-with-issue` | 当前 README 仍有旧 badge/开发段落数字；不影响运行时，建议文档清理阶段统一从实际测试清单生成。 |
| README endpoint 数 `136` vs 生成 reference `125` | `defer-with-issue` | 评论中的两个数字已过时；当前 README 为 137，生成 reference 为 126，说明仍有计数漂移，但不阻塞本次 P2 代码合并。 |
| `recall_budget.maxSessionSummaries` 错误标签 | `defer-with-issue` | 当前仍可见，影响配置错误诊断一致性，不改变 recall 结果；建议配置/schema 一致性阶段修复。 |
| archive import session ID 一致性 | `defer-with-issue` | 当前 archive import 仍未把解析到的 session ID 贯穿导入路径；建议 archive/replay 一致性阶段修复。 |
| observe rollback image reference decrement | `defer-with-issue` | 当前 rollback 仍有直接删除 image 的路径；可能造成引用计数不一致，但与本次五项 P2 合并阻塞无直接依赖。 |
| pre-compact epoch 错误隔离 | `defer-with-issue` | 当前 epoch 与 context 仍在同一失败边界；建议 hook 可用性/降级阶段修复。 |
| MCP `outputMode` schema | `defer-with-issue` | 当前 registry schema 仍为宽泛 string，server 运行时有校验；建议 MCP schema 收紧阶段修复。 |
| 共享类型整理 | `defer-with-issue` | 当前 `InjectionLedgerEntry` 等类型仍存在模块内定义；属于可维护性整理，不阻塞行为验收。 |
| 重复 checkoutId spread | `defer-with-issue` | 当前 API payload 构造仍有重复 spread；结果通常相同但增加维护风险，建议 API 清理阶段修复。 |
| stale comment / unknown wildcard 说明 | `defer-with-issue` | `remember` 附近注释与当前 scope gate 语义不完全一致；建议 scope 文档/注释阶段修复。 |
| fake timer cleanup | `defer-with-issue` | 当前测试仍手动恢复 timer；建议测试卫生阶段统一 afterEach。 |
| 重复 enum | `defer-with-issue` | 当前 eval schema 与生产类型仍有重复候选枚举；建议 shared-type 阶段整理。 |
| CJK token range | `defer-with-issue` | 当前 token 快路径仍使用有限 Unicode range；建议 tokenizer 正确性阶段扩展并补基准。 |
| trace retention 全量扫描 | `defer-with-issue` | 当前 retention 仍扫描完整 trace 列表；建议存储/索引优化阶段处理。 |
| hydration 串行 KV 读取 | `defer-with-issue` | 当前 hydration 仍按顺序读取；建议启动性能阶段并行化及限流。 |

本次没有发现可安全标为 `already-fixed-after-2245597` 或 `not-applicable` 的上述重点评论；数字评论的具体旧数字虽然已经过时，但其文档漂移问题仍存在，因此按 `defer-with-issue` 记录。

## 非当前合并阻塞问题清单

| 问题 | 影响 | 建议阶段 | 建议 issue 标题 | 是否阻塞当前合并 |
|---|---|---|---|---|
| README 测试数/endpoint 数漂移 | 用户看到的项目规模与生成事实不一致 | docs hygiene | `docs: reconcile README test and endpoint counts` | 否 |
| 配置错误标签 camelCase | 错误路径与 TOML 配置名不一致，降低排障效率 | config consistency | `fix: align recall budget error labels with config keys` | 否 |
| archive import session ID 一致性 | 导入记录可能失去原始 session 关联 | archive/replay | `fix: preserve archive import session identity` | 否 |
| observe rollback image ref decrement | 多引用图片的回滚计数可能不准 | media lifecycle | `fix: decrement image refs during observe rollback` | 否 |
| pre-compact epoch 错误隔离 | epoch 失败可能连带跳过 context | hook resilience | `fix: isolate pre-compact epoch failures` | 否 |
| MCP outputMode schema | 客户端无法从 schema 获得枚举约束 | MCP contract | `fix: constrain memory recall outputMode schema` | 否 |
| duplicate checkoutId spread | API payload 维护风险 | API cleanup | `refactor: remove duplicate checkout identity spread` | 否 |
| stale scope wildcard comment | 注释误导 scope 行为理解 | scope docs | `docs: correct legacy scope wildcard comment` | 否 |
| fake timer cleanup | 测试隔离依赖手动清理 | test hygiene | `test: centralize fake timer cleanup` | 否 |
| duplicate enum/shared types | 类型漂移风险 | type consolidation | `refactor: consolidate recall shared types` | 否 |
| CJK token range | 少数 Unicode CJK 字符估算可能偏差 | tokenizer correctness | `fix: expand CJK token detection coverage` | 否 |
| trace retention full scan | 大规模 trace store 的 sweep 成本 | storage performance | `perf: bound trace retention candidate scan` | 否 |
| serial hydration | 启动/恢复延迟随记录数线性叠加 | startup performance | `perf: parallelize bounded hydration reads` | 否 |

## 本次修复验证范围

新增/更新回归测试覆盖 limit 传播与 `limit=0`、search 与 context budget 分离、prompt hard budget、remote normalization、cwd 安全与异步 git、100 次并发 stats、memory 不变、Viewer XSS payload。benchmark runner 的 in-memory KV stub 也补齐了与生产 `state::update` 对齐的原子操作语义。

不创建远端 issue。tag 建议以最终远端查询结果为准：远端未发现 `p2-recall-observability-final*` 时，建议用户确认后重建本地未 push tag；若旧 tag 已 push，保留旧 tag 并新建 `p2-recall-observability-final.1`。
