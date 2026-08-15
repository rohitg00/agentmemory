---
name: agentmemory-sync
description: Sync with the agentmemory long-term memory at task start/end. Use when starting a new task, recalling past work, finishing a task, needing cross-session context, or reviewing what was done.
---
# agentmemory memory sync

1. At task start: call mcp__agentmemory__memory_recall with the task keywords + project path, format=compact, to bring relevant history into context.
2. During the task: when you learn something durable (decision/fix/preference/convention), call memory_save immediately (type=fact, concepts: 2-5 keywords).
3. At task end: call memory_save with a short outcome summary (type=insight), and confirm the session is registered via memory_sessions.
4. For large handoffs: call memory_smart_search with expandIds for graph-diffusion recall, or use memory_lesson_save/memory_lesson_recall for lessons.
