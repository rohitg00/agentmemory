# AgentMemory Graph Backfill 实现报告

日期：2026-05-19  
仓库：`E:\works\dtudy\agentmemory-pr`  
目标：让 `http://localhost:3113/#graph` 能从现有历史 memories / observations 回填知识图谱，并用当前 146 条 memory 做只读验证。

## 1. 背景与问题描述

当前运行中的 AgentMemory viewer 在 `#graph` 页面显示：

- `0 nodes`
- `0 edges`
- 但 `/agentmemory/memories?latest=true` 返回 `146` 条 latest memories

进一步确认：

- `/agentmemory/graph/stats` 返回 `totalNodes=0,totalEdges=0`
- `/agentmemory/graph/query` 返回空图
- 旧运行实例中 `/agentmemory/graph/build` 不存在或不可用
- `/agentmemory/graph/extract` 已存在，但它只接受调用方传入 observations，并不会主动扫描历史 memories / observations

因此，根因不是 memory 数据缺失，而是上游 v0.9.20 缺少历史数据批量回填 graph 的实现入口。

## 2. 上游结论

结合上游 repo / changelog / issue / PR 信息：

- Issue #210 / PR #215 只解决了 session end 后自动触发 graph extraction 的一部分问题。
- Issue #505 指出 viewer 的 `Rebuild Graph` 调用了缺失的 `/graph/build`。
- PR #502 仍显示 session end 到 graph extraction 的触发链有缺口。
- v0.9.20 的行为没有提供“把已有 146 条 memories 批量变成 graph”的功能。

结论：上游实现的是“新 session 结束后可能增量抽取”，不是“历史 memory / observation backfill”。

## 3. Agent Team 分工

- `agent1: analyzing`
  - 复现空图。
  - 阅读本地源码和上游信息。
  - 定位缺失点：没有 `mem::graph-build`，没有 `POST /agentmemory/graph/build`，viewer 调用的是缺失 endpoint。

- `agent2: verifier`
  - 挑刺并指出关键风险：
    - 只回填 observations 不够，必须支持 memories。
    - 不能打开页面就写真实 state store。
    - `graph-extract` 合并已有 node 后，edge 可能仍指向临时 node id。
    - API 参数需要校验，避免非法 limit / batchSize / offset。

- `agent3: testing`
  - 只读复现真实环境：
    - latest memories: 146
    - sessions: 44
    - observations: 209
    - graph nodes/edges: 0/0
  - 验证真实 store 不应在测试阶段被写入。

- Leader 审核
  - 合并方案。
  - 补齐 memory source。
  - 确保默认 dry-run。
  - 加测试、打包验证和真实数据离线 dry-run。

## 4. 技术方案

### 4.1 新增 graph build/backfill 管线

新增 `mem::graph-build`，职责是扫描历史数据并分批调用已有 `mem::graph-extract`。

核心策略：

- 默认 `dryRun: true`，只计算计划，不写 graph。
- 支持 source：
  - `observations`
  - `memories`
  - `all`
- 默认 source 为 `all`。
- 默认 memories 只取 `isLatest=true`，避免同一 memory 多版本重复回填。
- 默认 observations 只取 completed sessions，避免 active session 尚未稳定的数据进入 graph。
- 支持 `force`，需要重跑时可以忽略已处理 source id。
- 支持 `batchSize`、`limit`、`offset`、`sessionId`，方便灰度、分批和小范围测试。

### 4.2 graph-extract 合并修复

旧逻辑：

- LLM 解析出 node / edge。
- 如果 node 已存在，会 merge 到已有 node。
- 但 edge 仍可能引用刚解析出来的临时 node id。

修复后：

- 建立 `resolvedNodeIds` 映射。
- 对每个 parsed node，记录它最终落到哪个 persisted node id。
- 写 edge 前，把 `sourceNodeId` / `targetNodeId` remap 到真实 persisted node id。
- 新增真实创建/更新计数：
  - `nodesCreated`
  - `nodesUpdated`
  - `edgesCreated`
  - `edgesUpdated`

### 4.3 新增 REST API

新增：

```http
POST /agentmemory/graph/build
```

行为：

- 默认 dry-run。
- `dryRun=false` 时才写入 graph。
- 支持 query/body 参数：
  - `source`
  - `batchSize`
  - `limit`
  - `offset`
  - `sessionId`
  - `force`
  - `includeActiveSessions`
  - `latestMemoriesOnly`

参数校验：

- `batchSize` 必须为正整数。
- `limit` 必须为正整数。
- `offset` 必须为非负整数。

### 4.4 新增 CLI

新增命令：

```powershell
agentmemory graph-build
```

默认 dry-run。

写入 graph 需要显式：

```powershell
agentmemory graph-build --source all --apply
```

支持参数：

```powershell
--source observations|memories|all
--batch-size <N>
--limit <N>
--offset <N>
--session-id <id>
--include-active
--force
```

### 4.5 Viewer 行为调整

`#graph` 页面空图时：

- 只调用 dry-run。
- 不自动写真实 graph。

点击 `Rebuild Graph` 按钮时：

- 调用 `{ dryRun: false }`。
- 由用户显式触发真实写入。

## 5. 具体修改文件与代码位置

### 5.1 `src/functions/graph.ts`

文件：`E:\works\dtudy\agentmemory-pr\src\functions\graph.ts`

主要改动：

- 新增 `GraphBuildOptions`
- 新增 `GraphBuildResult`
- 新增 `isGraphBuildSource`
- 新增 `isEligibleObservation`
- 新增 `collectProcessedSourceIds`
- 新增 `mem::graph-build`
- 修复 `mem::graph-extract` 的 edge id remap

关键位置：

- `GraphBuildOptions`：约第 22 行
- `mem::graph-build`：约第 154 行
- `resolvedNodeIds`：约第 342 行
- `nodesCreated` / `edgesCreated` 计数：约第 343 行后
- edge remap：约第 377 行后

### 5.2 `src/triggers/api.ts`

文件：`E:\works\dtudy\agentmemory-pr\src\triggers\api.ts`

主要改动：

- 新增 `api::graph-build`
- 注册 `POST /agentmemory/graph/build`
- 增加 batchSize / limit / offset 参数校验
- 透传 source / force / includeActiveSessions / latestMemoriesOnly

关键位置：

- `api::graph-build`：约第 1251 行
- `/agentmemory/graph/build` trigger：约第 1335 行

### 5.3 `src/cli.ts`

文件：`E:\works\dtudy\agentmemory-pr\src\cli.ts`

主要改动：

- help 中加入 `graph-build`
- `postJsonStrict` 增加 `AGENTMEMORY_SECRET` bearer token
- 新增 option helper：
  - `optionValue`
  - `positiveIntOption`
  - `nonNegativeIntOption`
- 新增 `runGraphBuild`
- 命令表中注册 `"graph-build": runGraphBuild`

关键位置：

- help：约第 141 行
- `runGraphBuild`：约第 2436 行
- command registry：约第 2694 行

### 5.4 `src/viewer/index.html`

文件：`E:\works\dtudy\agentmemory-pr\src\viewer\index.html`

主要改动：

- 空图自动检测调用：

```js
apiPost('graph/build', { dryRun: true })
```

- Rebuild Graph 按钮调用：

```js
apiPost('graph/build', { dryRun: false })
```

关键位置：

- dry-run 探测：约第 1603 行
- apply rebuild：约第 1959 行

### 5.5 `test/graph.test.ts`

文件：`E:\works\dtudy\agentmemory-pr\test\graph.test.ts`

新增覆盖：

- `graph-build` 默认 dry-run
- `graph-build` apply 分批执行
- `graph-build` 默认包含 latest memories
- `graph-extract` 复用 persisted node id
- `api::graph-build` 默认 dry-run

关键位置：

- dry-run test：约第 198 行
- memory source test：约第 260 行
- edge merge id test：约第 285 行
- API dry-run test：约第 301 行

## 6. 测量方案

### 6.1 基线测量

运行中实例基线：

```powershell
Invoke-RestMethod http://localhost:3113/agentmemory/graph/stats
```

结果：

```json
{
  "totalNodes": 0,
  "totalEdges": 0,
  "nodesByType": {},
  "edgesByType": {}
}
```

memory 数量：

```powershell
(Invoke-RestMethod "http://localhost:3113/agentmemory/memories?latest=true").memories.Count
```

结果：

```text
146
```

### 6.2 Dry-run 测量

使用真实 localhost 数据，但写入临时 mock KV，不写真实 state store。

测量结果：

```json
{
  "liveMemories": 146,
  "liveSessions": 44,
  "seededObservations": 209,
  "plan": {
    "success": true,
    "dryRun": true,
    "source": "all",
    "sessionsScanned": 8,
    "memoriesScanned": 146,
    "observationsFound": 153,
    "observationsEligible": 153,
    "observationsSkippedExisting": 0,
    "observationsSelected": 153,
    "batchesPlanned": 20,
    "batchesProcessed": 0,
    "nodes": 0,
    "edges": 0,
    "nodesAdded": 0,
    "edgesAdded": 0,
    "errors": []
  }
}
```

解释：

- 146 条 latest memories 会进入回填候选。
- observations 默认只从 completed sessions 读取。
- 默认排除 active sessions，所以 sessionsScanned 是 8，不是 44。
- 最终会形成 153 个候选源项，按 batchSize=8 计划为 20 个批次。

### 6.3 Apply 测量建议

部署新代码并重启 agentmemory 后，建议按以下顺序测量：

1. 先 dry-run：

```powershell
agentmemory graph-build --source all
```

2. 确认候选数量、批次数、错误数。

3. 再 apply：

```powershell
agentmemory graph-build --source all --apply
```

4. 查看 graph stats：

```powershell
Invoke-RestMethod http://localhost:3113/agentmemory/graph/stats
```

5. 打开：

```text
http://localhost:3113/#graph
```

预期：

- nodes > 0
- edges > 0
- viewer graph 不再为空

## 7. 测试报告

### 7.1 单元测试

命令：

```powershell
npm test -- test/graph.test.ts
```

结果：

```text
Test Files  1 passed (1)
Tests       10 passed (10)
```

### 7.2 打包测试

命令：

```powershell
npx tsdown
```

结果：

```text
Build complete
```

说明：

- `tsdown` 核心打包通过。
- `npm run build` 在 Windows 下脚本尾部的 `cp ... || true` 会失败，这是仓库既有跨平台脚本问题，不是本次 graph 代码引入。

### 7.3 Diff 检查

命令：

```powershell
git diff --check
```

结果：

- 无 whitespace error。
- 只有 Windows 下 LF/CRLF 提示。

### 7.4 真实数据安全验证

验证目标：

- 读取真实 localhost 数据。
- 不写真实 `C:\Users\Lenovo\data\state_store.db`。
- 确认 146 条 latest memories 能被 build plan 识别。

结果：

- latest memories: 146
- sessions: 44
- observations: 209
- graph build dry-run selected: 153
- planned batches: 20
- writes to real store: 0

## 8. 当前限制与注意事项

1. 当前 `localhost:3113` 仍运行旧版本。
   - 所以现在 viewer graph 仍然是 0/0。
   - 需要把本仓库新代码部署/安装到正在运行的 agentmemory 后才能生效。

2. 没有在真实 store 上执行 apply。
   - 这是有意为之，避免测试阶段污染你的真实 memory 数据。
   - apply 应由你确认后执行。

3. Graph extraction 依赖 LLM provider。
   - dry-run 不调用 provider。
   - apply 会调用 `mem::graph-extract`，需要当前 graph extraction provider 可用。

4. 默认不处理 active sessions。
   - 这是为了避免仍在写入中的 session 造成重复或不稳定 graph。
   - 如需纳入，可使用 `--include-active`。

## 9. 后续任务推荐

1. 部署并重启本地 agentmemory。
   - 用新源码替换当前运行版本。
   - 再执行 dry-run 和 apply。

2. 修复 Windows build script。
   - 把 `cp ... || true` 替换成跨平台 Node copy 脚本。

3. Viewer 增加 graph-build preview。
   - 空图时显示“可回填 N 条，预计 M 批次”。
   - 避免用户误以为系统卡住。

4. Viewer 增加进度条。
   - apply 时显示当前 batch / total batches。
   - 显示 nodesCreated / edgesCreated。

5. 增加 graph-build integration test。
   - 使用临时 state store。
   - 从 memories 到 graph stats 做完整闭环。

6. 增加失败恢复能力。
   - batch 失败后记录失败 observation ids。
   - 支持从 offset 或 failed ids 继续。

7. 上游提交 PR。
   - 本实现正好覆盖 Issue #505 的 `/graph/build` 缺口。
   - 同时补齐历史 memories backfill，解决用户已有 memory 但 graph 空的问题。

## 10. 建议执行命令

部署新代码后，先运行：

```powershell
agentmemory graph-build --source all
```

确认 dry-run 输出合理后，再运行：

```powershell
agentmemory graph-build --source all --apply
```

然后验证：

```powershell
Invoke-RestMethod http://localhost:3113/agentmemory/graph/stats
```

最后打开：

```text
http://localhost:3113/#graph
```

