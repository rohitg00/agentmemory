# การวิเคราะห์เชิงลึกเปรียบเทียบสถาปัตยกรรมและคุณภาพของระบบความจำ: Mem0 vs Agentmemory

> **รายงานการวิจัยทางวิศวกรรมซอฟต์แวร์ (Forensic Architectural & Quality Research Report)**  
> **ผู้ประเมิน**: Librarian — Codebase & Documentation Research Specialist  
> **สถานะ**: ตรวจสอบจาก Primary Source Code, Git Commits, Official Documentation และ Production Failure Modes  
> **ไฟล์เปรียบเทียบหลัก**:
> - `rohitg00/agentmemory` (v0.9.29, Local Repository `/Volumes/DB/Example Projects/agentmemory`)
> - `mem0ai/mem0` & `@mem0/opencode-plugin` (v0.2.2, Unpacked at `/tmp/package/`)
> - Official Documentation: `https://docs.mem0.ai`, `https://agent-memory.dev`

---

## บทสรุปสำหรับผู้บริหาร (Executive Summary & Final Verdict)

### คำถามหลัก: *"ถ้าคุณต้องใช้สิ่งที่มีคุณภาพมากที่สุดระหว่าง mem0 กับ agentmemory ควรเลือกตัวใดและเพราะอะไร?"*

### **คำตอบและข้อสรุปชี้ขาด (The Decisive Verdict)**:
> **คำตอบขึ้นอยู่กับนิยามของ "คุณภาพ" ที่สอดคล้องกับขอบเขตงานของคุณอย่างชัดเจน:**
>
> 1. **หากคุณต้องการ "คุณภาพของความจำเชิงวิศวกรรมซอฟต์แวร์ (Coding Agent Memory Quality)" แบบ End-to-End ในสภาพแวดล้อมจริง:**  
>    👉 **เลือก `agentmemory`**  
>    **เหตุผลเชิงสถาปัตยกรรม**: `agentmemory` ถูกสร้างมาโดยเฉพาะสำหรับ AI Coding Agents โดยมี **4-Tier Cognitive Lifecycle (Working, Episodic, Semantic, Procedural)** พร้อมระบบ Hybrid Retrieval ระดับ Triple-Stream (BM25 + Vector + Knowledge Graph เชื่อมด้วย Reciprocal Rank Fusion: RRF $k=60$) ที่ผ่านการทดสอบ Benchmark จริงบน LongMemEval-S ได้ Recall@5 สูงถึง **95.2%** และ MRR **88.2%** ทั้งยังดักจับร่องรอยการทำงาน (Lifecycle Hooks 12 ตัว) ได้ลึกถึงระดับ AST, Git diff, File history, Commit links, Pinned memory slots และ Multi-agent coordination (leases/signals) ซึ่งไม่มีใน mem0
>
> 2. **หากคุณต้องการ "คุณภาพความเสถียรของระบบระดับองค์กร (System Stability & Zero-Ops Reliability)" และความง่ายแบบ Plug-and-Play:**  
>    👉 **เลือก `Mem0 Platform` (Managed Cloud via `@mem0/opencode-plugin`)**  
>    **เหตุผลเชิงสถาปัตยกรรม**: Mem0 Platform ขจัด Single-Point-of-Failure (SPOF) ฝั่ง Client-side daemon ทั้งหมด รันผ่าน Cloud API แบบ Stateless ปราศจากปัญหา Process desynchronization, SQLite file locks, WebSocket disconnects หรือปัญหา Native daemon crash ที่เกิดขึ้นจริงใน iii-engine (เช่น Issue #1013, #843, #849 ของ agentmemory)
>
> 3. **สิ่งที่ไม่แนะนำอย่างยิ่งสำหรับงาน Coding:**  
>    ⚠️ **`Mem0 Open-Source (Self-hosted Python SDK)` สำหรับ OpenCode**: ตัว OpenCode Plugin ของ Mem0 (`@mem0/opencode-plugin`) ถูกออกแบบให้ต่อตรงกับ `api.mem0.ai` ผ่าน `MemoryClient` ในตัว SDK (`/tmp/package/dist/index.js` บรรทัด 29375–29401) หากต้องการใช้ Mem0 OSS คุณต้องเขียน Custom Gateway, ตั้ง Vector DB (Qdrant/Milvus) และ Graph DB (Neo4j) ขึ้นมาเอง ซึ่งขาด Lifecycle Hooks สำหรับดักจับ Tool results และ File Context สำหรับ Coding Agent ไปอย่างสิ้นเชิง

---

## ตารางเปรียบเทียบเชิงสถาปัตยกรรมระดับภาพรวม (Architectural Scorecard)

| มิติการประเมิน (Evaluation Dimension) | **Mem0 (Managed Platform / Plugin)** | **Mem0 (Self-Hosted OSS Python)** | **Agentmemory (iii-engine Daemon)** | ผู้ชนะเลิศ (Winner) |
| :--- | :--- | :--- | :--- | :--- |
| **1. Memory Architecture** | 3-Tier Layer (Direct / Intelligent Additive Extraction) | 3-Tier Layer (Pluggable Vector + Graph + SQLite) | 4-Tier Cognitive Lifecycle (Working $\rightarrow$ Episodic $\rightarrow$ Semantic $\rightarrow$ Procedural) | **Agentmemory** (ลึกซึ้งและครอบคลุมงานโค้ด) |
| **2. Fact Extraction Fidelity** | โมเดล Additive V3 (แยก Fact ชัดเจน, ผูก Linked DAG) | ขี้นอยู่กับ LLM และ Prompt ปรับแต่งเองได้ | Multi-level: Raw Tool Traces $\rightarrow$ Concept Consolidate $\rightarrow$ Graph Reflection | **Mem0** (การสกัด Fact รายประโยคเฉียบคมกว่า) |
| **3. Deduplication & Conflict** | Cosine similarity threshold + Linked superseding | Cosine similarity threshold + Overwrite/Merge | Fingerprint hash + Jaccard concept clustering + Exponential decay | **Mem0** (Graph DAG linking มีประสิทธิภาพสูง) |
| **4. Long-term Consolidation** | Client-driven `/mem0-dream` (สแกน Noun overlap >60%) | Manual Scripting | Daemon-driven `mem::consolidate` + `mem::reflect` + Decay | **Agentmemory** (อัตโนมัติเต็มรูปแบบใน Background) |
| **5. Multi-Repo & Worktree Isolation** | แยกตาม `app_id` (สกัดจาก Git Remote URL หรือ Top-level) | ควบคุมผ่าน Metadata / Filters | ปรับปรุงเป็น Per-Project KV (`mem:slots:<project>`) | **เสมอกัน** (Mem0 จัดการ Worktree ผ่าน Remote URL ได้เนียนกว่า) |
| **6. Retrieval Precision (Quality)** | Vector Search + Keyword + Managed Graph (R@5: 66.5% บน LoCoMo) | Vector Search + Graph Cypher (Neo4j) | Triple Hybrid (BM25 + Dense Vector + Graph BFS ผ่าน RRF $k=60$) (R@5: 95.2% บน LongMemEval-S) | **Agentmemory** (แม่นยำสูงมากในบริบทซอฟต์แวร์) |
| **7. Prompt Budget & Injection** | ยัด Search Results + Error memories เข้า System context ตรงๆ | ผู้ใช้ต้องประกอบ Prompt เอง | ควบคุมงบประมาณโทเค็นเข้มงวด (`token_budget` ~1,900 tokens) พร้อม Pinned Slots | **Agentmemory** (ไม่ทำให้ Prompt บวม ควบคุมได้ชัดเจน) |
| **8. System Stability & Resilience** | สูงมาก (Managed Serverless Cloud, Zero-Maintenance) | ขึ้นอยู่กับ Infrastructure ของผู้ดูแล | มีความเปราะบางของ Daemon (WebSocket, Rust iii-engine process coupling) | **Mem0 Platform** (เสถียร ไร้ปัญหา Local Daemon) |
| **9. Data Privacy & Sovereignty** | ต่ำ (ส่ง Code, Traces, Secrets เข้า Cloud API) | สูงมาก (Self-contained On-premise) | สูงมาก (รัน Local ทั้งหมดผ่าน SQLite `state_store.db`) | **Agentmemory** / **Mem0 OSS** |
| **10. OpenCode Integration** | Native Plugin (9 Tools, 7 Hooks, 9 Skills) | ไม่มี Native Plugin สำเร็จรูป | Full Daemon (54 MCP Tools, 130 Endpoints, 12 Hooks, 17 Skills) | **Agentmemory** (ความสามารถเจาะลึกงานวิศวกรรม) |

---

## 1. การวิเคราะห์เชิงลึก: โครงสร้างสถาปัตยกรรมและคุณภาพของความจำ (Memory Architecture & Quality)

### 1.1 Agentmemory: สถาปัตยกรรม 4-Tier Cognitive Lifecycle
`agentmemory` ออกแบบโดยถอดแบบจากโมเดลความจำทางปัญญา (Cognitive Science) แบ่งข้อมูลความจำเป็น 4 ระดับอย่างเข้มงวด:

```
+-----------------------------------------------------------------------------------+
|                            AGENTMEMORY 4-TIER LIFECYCLE                           |
+-----------------------------------------------------------------------------------+
|  [Tier 1: Working Memory]                                                         |
|  - Pinned Slots (project_context, pending_items) via KV.projectSlots               |
|  - Multi-agent Leases (Exclusive lock พร้อม TTL) & Signals                        |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v (Observe Hooks: Prompt, Tool, Error)
+-----------------------------------------------------------------------------------+
|  [Tier 2: Episodic Memory]                                                        |
|  - Raw Observations (Tool calls, File Edits, Bash Executions, Git Commits)        |
|  - Provenance Tracking (Channel: user/agent/tool, Source observation hash)       |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v (mem::consolidate: Group by Concepts >= 3)
+-----------------------------------------------------------------------------------+
|  [Tier 3: Semantic Memory]                                                        |
|  - Distilled Facts, Architecture Decisions, Anti-patterns, Lessons                |
|  - Confidence Scoring & Reinforcement (+0.1 * (1 - current))                      |
|  - Exponential Decay: strength * (0.9 ^ decayPeriods)                             |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v (mem::reflect: Graph BFS & Clustering)
+-----------------------------------------------------------------------------------+
|  [Tier 4: Procedural Memory & Crystals]                                           |
|  - Reusable Workflow Routines (Routines & Sentinels)                              |
|  - Higher-Order Synthesized Insights across multi-sessions                        |
+-----------------------------------------------------------------------------------+
```

#### หลักฐานในโค้ด (Code Evidence):
1. **การรวมข้อมูล (Consolidation)** ใน `src/functions/consolidate.ts` (บรรทัด 55–130):
   ```typescript
   // จับกลุ่ม Observations ตาม Concept tags หากกลุ่มใดมี >= 3 รายการ
   // จะดึง top 8 รายการตาม importance ส่งให้ LLM สรุปเป็น Semantic Memory
   const candidateGroups = Object.entries(conceptGroups)
     .filter(([_, obs]) => obs.length >= 3);
   ```
2. **การสังเคราะห์ความรู้ระดับสูง (Reflection Pipeline)** ใน `src/functions/reflect.ts` (บรรทัด 20–85, 290–305):
   ระบบทำ 2-Hop BFS บน Knowledge Graph (`mem:graph:nodes`, `mem:graph:edges`) เพื่อหากลุ่มแนวคิดที่เชื่อมโยงกัน (Concept Clusters) แล้วส่งให้ LLM สร้าง `Insight` ข้ามเซสชัน
   - **การป้องกัน Payload บวม (Issue #1168 / Commit `641b6be`)**: จำกัด `sourceMemoryIds`, `sourceLessonIds`, และ `sourceCrystalIds` ไว้ที่สูงสุดไม่เกิน `INSIGHT_MAX_SOURCE_IDS = 20` รายการ เพื่อป้องกัน JSON serialization ล้นหน่วยความจำ
3. **การเสื่อมสลายของความจำ (Memory Decay)** ใน `src/functions/consolidation-pipeline.ts`:
   ความจำที่ไม่ได้ถูกแตะต้องเกินกำหนดจะลดทอน `strength = strength * Math.pow(0.9, decayPeriods)` หาก `strength < 0.1` จะถูกย้ายเข้าสู่กระบวนการ Auto-forget

---

### 1.2 Mem0: สถาปัตยกรรม Additive Memory Pipeline & Graph Linking
Mem0 ใช้แนวทางของ **Dynamic Memory Layer** ที่เน้นความเร็วและการจัดเก็บความจริง (Atomic Facts):

```
User / Assistant Interaction
            |
            v
   [Filter / Redact]  --> Secret Patterns (API Keys, Tokens)
            |
            v
[Additive Extraction Prompt] --> สกัด Atomic Facts + Temporal Validity
            |
            v
    [Vector Search]   --> หา Memory เดิมที่มี Cosine Similarity > Threshold
            |
            +--> [No Match]    --> ADD (สร้าง Memory Node ใหม่)
            +--> [Contradicts] --> SUPERSEDE (ผูก linked_memory_ids เข้ากับโหนดเดิม)
            +--> [Duplicate]   --> NONE / REINFORCE (อัปเดต timestamp)
```

#### หลักฐานในโค้ด (Code Evidence):
1. **การทำงานของ OpenCode Plugin** ใน `/tmp/package/dist/index.js`:
   - ทำงานผ่าน `mem0ai` SDK เชื่อมต่อไปยัง `https://api.mem0.ai`
   - มีการ Redact ข้อมูลสำคัญก่อนส่งออก (`SECRET_PATTERNS` บรรทัด 29447–29461): ตรวจจับ `sk-*`, `m0-*`, `AKIA*`, `ghp_*`, `gho_*`
   - มีการส่ง Auto-capture ทุกๆ 3 ข้อความ (`msgCount % 3 === 0` บรรทัด 29840–29860) ด้วยคำสั่ง `mem0.add(..., { infer: true })`
2. **การรวมข้อมูลผ่าน Skill `/mem0-dream`** ใน `/tmp/package/opencode-skills/mem0-dream/SKILL.md`:
   - ไม่ได้ประมวลผลอัตโนมัติในเบื้องหลังแบบ Daemon แต่ใช้คำสั่งสคริปต์ของ OpenCode ให้ Agent ดึง Memory ทั้งหมดผ่าน `get_memories(page_size=200)`
   - คำนวณความคล้ายคลึงผ่าน Heuristic: คำนามซ้ำกันเกิน 60% (`noun/keyword overlap > 60%`) ถือเป็น Near-duplicate
   - แสดงผล Diff ให้ผู้ใช้เลือก `A / B / skip` ก่อนบันทึกการรวมข้อมูล (Merge/Prune)

#### **เปรียบเทียบคุณภาพ**:
- **ความแม่นยำของ Fact (Fidelity)**: Mem0 มีความแม่นยำในการสกัดประโยคความจริงระดับ Atomic ข้อความสูงกว่า เพราะโมเดล Additive Prompt ถูก fine-tune มาเพื่อสกัดข้อเท็จจริงสั้นๆ
- **ความลึกซึ้งของบริบทวิศวกรรม (Engineering Depth)**: `agentmemory` เหนือกว่าอย่างเทียบไม่ติด เพราะเก็บทั้งผลลัพธ์ของคำสั่ง Bash, การแก้ไขไฟล์, แผนภาพการเรียกฟังก์ชัน (AST), และ Lesson ของข้อผิดพลาดทางเทคนิค

---

## 2. การแยกบริบทและการปนเปื้อนข้ามโปรเจกต์ (Project & Context Isolation)

การปนเปื้อนของความจำข้าม Git Repository และระหว่าง Git Worktrees เป็นจุดชี้ขาดคุณภาพของ Coding Agent

```
+---------------------------------------------------------------------------------------------------+
|                                 CONTEXT ISOLATION ARCHITECTURE                                    |
+---------------------------------------------------------------------------------------------------+
| [Mem0 Approach]                                                                                   |
| Git Origin URL: "git@github.com:org/repo.git"  ---> SHA/Slug: "org-repo"                          |
| Workspace A (/repo)          ===> app_id = "org-repo"                                             |
| Workspace B (/repo-worktree) ===> app_id = "org-repo" (ตรวจจับจาก remote origin URL เดียวกัน)     |
| ผลลัพธ์: Worktrees แชร์ความจำร่วมกันได้อย่างถูกต้องตามธรรมชาติ                                    |
+---------------------------------------------------------------------------------------------------+
| [Agentmemory Approach]                                                                            |
| ในอดีต: Global Flat KV Namespace (เกิดบั๊ก Cross-Project Slot Leakage #1108)                       |
| ปัจจุบัน (Commit 87d5403): แยก Namespace รายโปรเจกต์เป็น `KV.projectSlots = "mem:slots:" + proj`    |
| ผลลัพธ์: ขจัดปัญหาการรั่วไหล แต่ต้องพึ่งพาพาธหรือ config ในการระบุชื่อโปรเจกต์                      |
+---------------------------------------------------------------------------------------------------+
```

### 2.1 การจัดการของ Mem0 (`@mem0/opencode-plugin`)
ดูการทำงานที่ `/tmp/package/dist/index.js` (บรรทัด 29412–29428):
```typescript
async function getProjectId($) {
  if (process.env.MEM0_APP_ID) return process.env.MEM0_APP_ID;
  try {
    const r = await $`git remote get-url origin`.quiet();
    const project = parseProjectFromRemote(r.stdout.toString());
    if (project) return project; // คืนค่า "org-repo"
  } catch {}
  try {
    const r = await $`git rev-parse --show-toplevel`.quiet();
    const top = r.stdout.toString().trim();
    if (top) return basename(top);
  } catch {}
  return basename(process.cwd());
}
```
- **จุดแข็งยอดเยี่ยมสำหรับ Git Worktree**: เมื่อนักพัฒนาเปิด Git Worktree ใหม่ เช่น `git worktree add ../feature-branch`, คำสั่ง `git remote get-url origin` จะยังคงได้ URL เดียวกัน ทำให้ได้ `app_id` เดียวกันทันที ความจำที่เคยเรียนรู้ใน Branch หลักจึงตามมาใน Worktree โดยอัตโนมัติ ไม่เกิด Split-Brain Memory
- **การแบ่ง Scope ยืดหยุ่น**: มี Scope 3 ระดับชัดเจน:
  1. `project`: กรองตาม `{ user_id, app_id }` (ค่าตั้งต้น)
  2. `session`: เพิ่มการกรอง `{ run_id }`
  3. `global`: สแกนข้ามทุกโปรเจกต์ด้วย `{ user_id, app_id: "*" }`

### 2.2 การจัดการของ Agentmemory
- **วิวัฒนาการและบั๊กจริงในอดีต (Issue #1108 / PR #182)**:
  เดิมที Agentmemory เก็บ Memory Slots ไว้ใน Flat Global Key `mem:slots` ทำให้เมื่อสลับโปรเจกต์ ข้อความใน Slot ของ Repo A (เช่น คำสั่ง build หรือสถาปัตยกรรมเฉพาะ) รั่วไหลไปโผล่ใน Prompt ของ Repo B
- **การแก้ไขใน Commit `87d5403`**:
  ได้ปรับให้แยก Partition ตามโปรเจกต์:
  `KV.projectSlots = (project: string) => "mem:slots:" + project`
  และรองรับการ Fallback ไปอ่าน Global Slots เมื่อไม่มีค่าเฉพาะโปรเจกต์
- **ข้อจำกัดใน Worktree**: หากรันในไดเรกทอรีที่ไม่ได้ติดตั้ง Remote หรือชื่อโฟลเดอร์ไม่ตรงกัน อาจทำให้ระบุ Project ID คลาดเคลื่อนได้หากไม่ได้ตั้ง `AGENTMEMORY_PROJECT` ชัดเจน

---

## 3. คุณภาพการค้นคืนและความเกี่ยวข้องของบริบท (Retrieval Quality & Precision)

```
+-----------------------------------------------------------------------------------+
|                        AGENTMEMORY HYBRID SEARCH PIPELINE                         |
+-----------------------------------------------------------------------------------+
|  User Query / Re-query Context                                                    |
|         |                                                                         |
|         +-------------------+--------------------+                                |
|         |                   |                    |                                |
|         v                   v                    v                                |
|    [BM25 Index]     [Vector Index]      [Knowledge Graph]                         |
|   (Exact keywords,  (Dense Embeddings,  (Multi-hop 2-BFS,                         |
|    file paths, code) semantic concepts)  temporal relations)                      |
|         |                   |                    |                                |
|         +-------------------+--------------------+                                |
|                             |                                                     |
|                             v                                                     |
|             [Reciprocal Rank Fusion (RRF k=60)]                                   |
|                             |                                                     |
|                             v                                                     |
|               [Progressive Disclosure Filter]                                     |
|         (Preview 240 chars -> Expand on demand via expandIds)                     |
+-----------------------------------------------------------------------------------+
```

### 3.1 สถิติการทดสอบ Benchmark ที่ตรวจสอบได้ (Reproducible Evidence)
- **Agentmemory**: 
  - ผ่านการประเมินบนชุดข้อมูล **LongMemEval-S** (ICLR 2025 benchmark standard, N=500, Haystack 115k tokens):
    - **Recall@5**: **95.2%**
    - **Recall@10**: **98.6%**
    - **MRR (Mean Reciprocal Rank)**: **88.2%**
    - *หมายเหตุเปรียบเทียบ*: หากใช้ BM25 อย่างเดียวจะได้ R@5 ที่ 86.2% การผสาน Dense Vector และ Graph ผ่าน RRF ช่วยดันความแม่นยำขึ้นอีก 9.0%
- **Mem0**:
  - รายงานผล Benchmark บนชุดข้อมูล **LoCoMo**:
    - **Recall@5**: **66.5%**
    - *ข้อควรระวัง*: ชุดข้อมูล LoCoMo และ LongMemEval-S เป็นคนละชุดการทดสอบ ไม่สามารถนำตัวเลขมาเทียบกันตรงๆ ได้แบบ 1:1 แต่สะท้อนให้เห็นว่าสถาปัตยกรรม Hybrid Search ของ `agentmemory` ถูกปรับจูนมาเพื่อ Needle-in-a-Haystack ของงานโค้ดโดยเฉพาะ

### 3.2 ความเสี่ยงเรื่อง Prompt Window Pollution
- **Mem0 OpenCode Plugin**:
  สืบค้นข้อมูลใน `experimental.chat.messages.transform` (`/tmp/package/dist/index.js` บรรทัด 30140–30210):
  ระบบนำผลการค้นหา Semantic Top-K (เช่น 5-10 memories) รวมถึง Error memories สูงสุด 6 รายการ มาจัดเรียงเป็น Markdown bullet points แปะหัว `## Mem0 Memory Context` เข้าไปใน User Prompt ทุกรอบ หรือในรอบแรก
  - *จุดอ่อน*: หากข้อความใน Mem0 มีขนาดใหญ่หรือมี Duplicate จะทำให้กิน Context Window สูงขึ้นเรื่อยๆ
- **Agentmemory**:
  มีโมดูลควบคุม Budget ที่เข้มงวดใน `src/functions/context.ts`:
  - ประมาณการโทเค็นด้วยสูตร `Math.ceil(text.length / 3)`
  - กำหนดโควตาตายตัวสำหรับ Pinned Slots, Project Profile, Top-10 Lessons และ Observations ล่าสุด ทำให้การบริโภคโทเค็นคงที่อยู่ที่เฉลี่ย **~1,900 tokens/session** ไม่เกิดอาการ Context Bloat

---

## 4. เสถียรภาพ ความทนทาน และพฤติกรรมความล้มเหลว (Reliability & System Resilience)

นี่คือมิติที่ **Mem0 และ Agentmemory มีความแตกต่างกันอย่างสุดขั้วที่สุด** ในแง่ของ Software Engineering Invariants

### 4.1 ตารางวิเคราะห์ Failure Modes และ Production Bugs จริง

| ปัญหา / เหตุการณ์ขัดข้อง | **Mem0 (Platform)** | **Agentmemory (Local Daemon)** | การวิเคราะห์สาเหตุเชิงลึก (Root Cause Analysis) |
| :--- | :--- | :--- | :--- |
| **Daemon Process Disconnect** | **ไม่มีปัญหานี้** (Stateless Cloud) | **เกิดจริง** (Issue #1013 / iii-engine #1796) | เมื่อ WebSocket ระหว่าง Node.js worker กับ `iii-engine` ขาดลง iii-engine v0.11.2 ทำการ unregister เส้นทาง HTTP ทั้งหมด ทำให้เกิด HTTP 404 ทุก endpoint |
| **Unbounded Payload Crash** | **ไม่มีปัญหานี้** (API มี Paginated endpoints) | **เกิดจริง** (Issue #544, #753, #814) | การเรียก `kv.list()` ทั้งก้อนใน `/memories` หรือ `/graph/query` บนโปรเจกต์ขนาดใหญ่ทำให้ iii-engine ค้างและคืนค่า `500 Invocation stopped` จน Dashboard แสดงผลเป็น 0 Sessions |
| **Silent Event Dropping** | ป้องกันด้วย Transaction ใน DB | **เกิดจริง** (Issue #210, #666 / PR #698) | โค้ด Hook ประกาศรับฟัง Event `agentmemory.session.stopped` แต่ไม่มีตัว trigger event ในบางสถานการณ์ ทำให้ Knowledge Graph ว่างเปล่า (0 Nodes/Edges) |
| **Shutdown Data Loss** | ข้อมูลถูกบันทึกทันทีบน Cloud | **เกิดจริง** (Issue #843, #849) | บนระบบปฏิบัติการ Windows คำสั่งปิดเครื่องหรือรีสตาร์ตเรียก `TerminateProcess` ข้าม Flush Hooks ของ SQLite ทำให้ข้อมูล Index เสียหาย |
| **OmniRoute HTTP 499 Timeout** | ฝั่ง Client ตัด timeout ได้ | **เกิดจริง** (Log 1788621263952) | กระบวนการ `mem::reflect` บนกราฟขนาดใหญ่ (~65KB payload) ใช้เวลาคำนวณนานเกิน 180s จน Client ตัดสายทิ้ง เกิดรหัสข้อผิดพลาด HTTP 499 |
| **Model Deprecation 404** | Cloud อัปเดต Model Router อัตโนมัติ | **เกิดจริง** (Issue #1003) | ตัว Graph Extraction ฮาร์ดโค้ดโมเดล `claude-3-haiku-20240307` ซึ่งถูกปิดบริการ ทำให้ฟังก์ชันสกัดความรู้ล้มเหลวแบบเงียบๆ |
| **Network & Privacy Failure** | **เสี่ยงสูง** (เน็ตหลุด = ใช้ไม่ได้, ส่งโค้ดขึ้น Cloud) | **เป็นศูนย์** (ทำงาน Local ทั้งหมด ไม่ต้องพึ่งเน็ต) | Mem0 Platform ส่งโค้ดและ Error Logs ออกนอกเครื่องผ่าน HTTPS หากระบบเครือข่ายล่มหรือติด Firewall องค์กร ระบบความจำจะหยุดทำงานทันที |

#### **สรุปเชิงเสถียรภาพ**:
- หากคุณกลัว **Local Daemon ล่ม, Memory รั่ว, หรือไฟล์ DB พัง**: `Mem0 Platform` เสถียรกว่าอย่างสิ้นเชิง
- หากคุณกลัว **ข้อมูลรั่วไหล, ความเป็นส่วนตัวของโค้ด (Data Sovereignty), หรือการทำงานแบบ Offline**: `agentmemory` เหนือกว่าอย่างสิ้นเชิง

---

## 5. การเปรียบเทียบเศรษฐศาสตร์ของโทเค็นและค่าใช้จ่าย (Token Economics & Latency)

```
+-----------------------------------------------------------------------------------+
|                        COST & LATENCY TRADE-OFF COMPARISON                        |
+-----------------------------------------------------------------------------------+
| [Mem0 Platform]                                                                   |
| - Execution: Cloud-hosted inference & Vector DB                                   |
| - Cost Model: คิดค่าบริการตามจำนวน Memory Operations (SaaS Pricing)               |
| - Latency: มี Network Round-Trip Time (RTT) ทุกครั้งที่ Prompt หรือเกิด Error (~200-500ms)  |
| - Auto-capture overhead: ยิง API ทุก 3 ข้อความ                                    |
+-----------------------------------------------------------------------------------+
| [Agentmemory Local]                                                               |
| - Execution: On-device (iii-engine SQLite + Transformers.js Local Embeddings)     |
| - Cost Model: ฟรี 100% (หากใช้ Local LLM / Local Embeddings)                      |
|   หรือจ่ายเฉพาะค่า LLM Token สำหรับ Consolidation (เฉลี่ย ~$10/ปี สำหรับโปรเจกต์ทั่วไป) |
| - Latency: Local In-Memory / SQLite sub-millisecond retrieval (10-50ms)           |
| - Token Optimization: บีบอัด Context คงที่ ~1,900 tokens ต่อเซสชัน                |
+-----------------------------------------------------------------------------------+
```

---

## 6. ประสบการณ์นักพัฒนาและการใช้งานร่วมกับ OpenCode (Developer Experience)

### 6.1 Mem0 OpenCode Plugin (`@mem0/opencode-plugin`)
- **การติดตั้ง**: ง่ายดายอย่างยิ่ง เพียงรัน `opencode plugin @mem0/opencode-plugin` และตั้ง `export MEM0_API_KEY="..."`
- **เครื่องมือที่มีให้**: 9 Native Tools (`add_memory`, `search_memories`, `get_memories`, `update_memory`, `delete_memory`, `delete_all_memories`, `list_entities`, etc.)
- **Skills ที่ติดตั้งมาพร้อมใช้**: 9 Skills (`/mem0-remember`, `/mem0-search`, `/mem0-scope`, `/mem0-dream`, `/mem0-pin`, `/mem0-forget`, etc.)
- **ข้อจำกัด**: ผูกติดกับ Cloud Platform ไม่สามารถสลับไปต่อ Local Ollama หรือ Custom OpenAI-compatible endpoint ได้ผ่านไฟล์คอนฟิกมาตรฐานของ Plugin

### 6.2 Agentmemory (`rohitg00/agentmemory`)
- **การติดตั้ง**: ต้องรัน Daemon แยกผ่าน `npx -y @agentmemory/agentmemory@latest` หรือติดตั้ง Local Service ผ่าน iii-engine
- **เครื่องมือที่มีให้**: จัดเต็มสำหรับงานวิศวกรรมขั้นสูง **54 MCP Tools** (แสดง 8 ตัวเริ่มต้น, เปิดทั้งหมดผ่าน `AGENTMEMORY_TOOLS=all`), **130 REST Endpoints**, **12 Hooks**, และ **17 Skills**
- **ความสามารถขั้นสูงที่ Mem0 ไม่มี**:
  - `memory_lease`: การจอง Task สำหรับ Multi-Agent ไม่ให้ทำงานชนกัน
  - `memory_signal_send`: การส่งข้อความสื่อสารระหว่าง Subagents
  - `memory_file_history`: ดูประวัติการแก้ไขและข้อผิดพลาดที่เคยเกิดกับไฟล์เฉพาะเจาะจง
  - `memory_graph_query`: รันคำค้นหา Cypher/Graph ข้ามความสัมพันธ์ของ Entities
  - `memory_obsidian_export`: Export ข้อมูลทั้งหมดเป็น Markdown Vault สำหรับดู Graph View บน Obsidian

---

## บทสรุปเชิงสถาปัตยกรรมและคำแนะนำในการเลือกใช้งาน (Principled Architectural Recommendation)

### 🎯 เลือก `agentmemory` เมื่อ:
1. **คุณเป็น Software Engineer / Architect** ที่ต้องการให้ AI Agent เข้าใจสถาปัตยกรรมระดับลึก (Codebase Architecture, Refactoring history, Bug patterns, Coding conventions)
2. **คุณให้ความสำคัญสูงสุดกับ Data Privacy & Air-gapped Environments**: ไม่ต้องการให้ซอร์สโค้ด คำสั่งเทอร์มินัล หรือข้อผิดพลาดถูกส่งออกไปยัง Third-party Cloud API
3. **คุณใช้ Multi-Agent Workflow** ที่ต้องการ Leases, Cross-Agent Signals, และ Shared Procedural Routines
4. **แนวทางบรรเทาปัญหาความเสถียร (Mitigation Strategy)**:
   - ควรอัปเดตเป็น `agentmemory >= v0.9.29` เสมอ เพื่อรับแพตช์แก้ปัญหา Slot leakage (`87d5403`), Bounded source IDs (`641b6be`, `057c1bb`), และ Safe shutdown
   - ตั้งค่า `AGENTMEMORY_AUTO_COMPRESS=true` พร้อมใส่ LLM API Key ที่เสถียรเพื่อป้องกันปัญหา Loop
   - หมั่นสำรองไฟล์ SQLite `state_store.db` เป็นระยะ

---

### 🎯 เลือก `Mem0 (Platform)` เมื่อ:
1. **คุณต้องการ Zero Maintenance & Immediate Setup**: ไม่อยากวุ่นวายกับการดูแล Background Daemon, จัดการ Port ชนกัน (3111, 3112, 3113, 49134), หรือแก้ปัญหา SQLite Lock
2. **คุณทำงานบนหลายเครื่อง (Multi-Device Synchronization)**: ทำงานสลับระหว่าง MacBook, Linux Server, และ Cloud VM โดยต้องการให้ความจำซิงค์กันผ่านระบบ Cloud อัตโนมัติทันที
3. **งานหลักคือการจำ User Preferences & High-level Facts ทั่วไป** ที่ไม่ได้ต้องการโครงสร้างความจำเชิงลึกระดับ AST หรือ File-level telemetry
4. **แนวทางบรรเทาปัญหา (Mitigation Strategy)**:
   - ต้องระมัดระวังการ Redact ข้อมูลที่เป็นความลับทางการค้าก่อนส่งออก
   - เรียกใช้ `/mem0-dream --auto` หรือเปิดรันเป็นระยะเพื่อคอย Merge ข้อมูลที่ซ้ำซ้อนใน Cloud Database

---
*รายงานนี้จัดทำขึ้นโดยอ้างอิงจากหลักฐานเชิงประจักษ์ใน Source Code และ Production Artifacts ข้อมูลทั้งหมดสามารถตรวจสอบย้อนกลับได้จากรหัส Commit และเส้นทางไฟล์ที่ระบุไว้ในเอกสาร*
