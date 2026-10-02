Commit `cd84e423efe3bf46aea6f2a54233116a1219f000`, darwin 25.2.0 arm64, Apple M1 Max x10, 65536.00 MiB RAM, Node v22.22.0, iii 0.22.1.

### Disk retention

| profile | N | logical obs | fixed | after capture | growth/obs | source | summary | index | diagnostic | config | stream | queue | failed delivery |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| embed+ollama | 100 | 100 | 5.8 KiB | 839.6 KiB | 8.3 KiB | 295.5 KiB | 34.5 KiB | 417.2 KiB | 4.2 KiB | 1.9 KiB | 86.4 KiB | 0 B | 0 B |
| embed-llm+ollama | 100 | 100 | 5.8 KiB | 491.7 KiB | 4.9 KiB | 445.1 KiB | 34.9 KiB | 5.5 KiB | 4.4 KiB | 1.9 KiB | 0 B | 0 B | 0 B |
| embed+ollama | 1000 | 1000 | 6.1 KiB | 7.60 MiB | 7.8 KiB | 3.07 MiB | 34.7 KiB | 4.06 MiB | 4.2 KiB | 1.9 KiB | 433.9 KiB | 0 B | 0 B |
| embed-llm+ollama | 1000 | 1000 | 6.1 KiB | 4.78 MiB | 4.9 KiB | 4.68 MiB | 35.0 KiB | 55.4 KiB | 4.4 KiB | 1.9 KiB | 0 B | 0 B | 0 B |

### Resident memory and CPU (engine + worker process tree)

| profile | N | empty idle | capture peak | engine peak | worker peak | idle after capture | after recovery | capture CPU s | recovery CPU s |
|---|---|---|---|---|---|---|---|---|---|
| embed+ollama | 100 | 168 MiB | 188 MiB | 57 MiB | 131 MiB | 185 MiB | 160 MiB | 2.47 | 0.05 |
| embed-llm+ollama | 100 | 167 MiB | 173 MiB | 53 MiB | 122 MiB | 78 MiB | 157 MiB | 3.05 | 0.08 |
| embed+ollama | 1000 | 167 MiB | 269 MiB | 96 MiB | 173 MiB | 221 MiB | 251 MiB | 12.04 | 0.03 |
| embed-llm+ollama | 1000 | 167 MiB | 186 MiB | 53 MiB | 149 MiB | 109 MiB | 182 MiB | 27.65 | 0.08 |

### Capture latency

| profile | N | hook p50 ms | hook p95 ms | hook stdout B | observe p50 ms | observe p95 ms | observe p99 ms | errors | capture wall ms | quiesce ms |
|---|---|---|---|---|---|---|---|---|---|---|
| embed+ollama | 100 | 218.25 | 233.73 | 0 | NaN | NaN | NaN | 0 | 21894 | 6020 |
| embed-llm+ollama | 100 | 124.02 | 158.25 | 0 | NaN | NaN | NaN | 0 | 13354 | 314723 |
| embed+ollama | 1000 | 149.46 | 380.22 | 0 | 732.32 | 2491.89 | 2842.61 | 0 | 144002 | 6010 |
| embed-llm+ollama | 1000 | 189.81 | 391.22 | 0 | 255.99 | 395.45 | 472.82 | 0 | 50893 | 306309 |

### Startup and recovery

| profile | N | cold ready ms | warm ready ms | recovery ready ms | recovery BM25 rebuild ms (docs) | vectors loaded | vector docs before / after | backfill queued / awaiting opt-in | re-embed requests (inputs) | logical obs before / after | marker hits before / after | source tail before / after |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| embed+ollama | 100 | 2137 | 1150 | 1171 | 66 (100) | 23 | 100 / 100 | 0 / 0 | 0 (0) | 100 / 100 | 23/50 / 23/50 | 50 / 50 |
| embed-llm+ollama | 100 | 1853 | 847 | 1031 | 9 (3) | 0 | 0 / 0 | 0 / 3 | 0 (0) | 100 / 100 | 0/50 / 0/50 | 50 / 50 |
| embed+ollama | 1000 | 1862 | 838 | 847 | 157 (1000) | 535 | 1000 / 1000 | 0 / 0 | 0 (0) | 1000 / 1000 | 14/50 / 14/50 | 50 / 50 |
| embed-llm+ollama | 1000 | 1244 | 943 | 1084 | 24 (1) | 1 | 1 / 1 | 0 / 0 | 0 (0) | 1000 / 1000 | 0/50 / 0/50 | 50 / 50 |

### Provider calls (OpenAI-compatible endpoint seen by the bench)

| profile | N | capture embed req (inputs, repeats) | capture chat req (repeats) | chat prompt tok | chat completion tok | upstream embed s | upstream chat s | provider errors | context-phase embed req | recovery embed req | warm-start embed req |
|---|---|---|---|---|---|---|---|---|---|---|---|
| embed+ollama | 100 | 100 (100, 0) | 0 (0) | 0 | 0 | 9.1 | 0.0 | 0 | 33 | 0 | 0 |
| embed-llm+ollama | 100 | 3 (3, 0) | 100 (0) | 24662 | 6584 | 823.1 | 4192.9 | 72 | 0 | 0 | 0 |
| embed+ollama | 1000 | 1000 (1000, 0) | 0 (0) | 0 | 0 | 141.3 | 0.0 | 0 | 33 | 0 | 0 |
| embed-llm+ollama | 1000 | 1 (1, 0) | 1000 (0) | 9114 | 2583 | 25.8 | 2042.6 | 989 | 33 | 0 | 0 |

### Agent-visible context (server token estimate, not provider billing)

| profile | N | search full B p50 (tok) | compact B p50 (tok) | narrative B p50 (tok) | smart-search B p50 | context B (tok) | SessionStart stdout off / on | PreToolUse stdout off / on |
|---|---|---|---|---|---|---|---|---|
| embed+ollama | 100 | 8690 (2869) | 1720 (551) | 10042 (1905) | 1695 | 36 (0) | 0 / 2230 | 0 / 2177 |
| embed-llm+ollama | 100 | 2211 (715) | 479 (137) | 1800 (339) | 437 | 36 (0) | 0 / 1252 | 0 / 0 |
| embed+ollama | 1000 | 8706 (2872) | 1729 (551) | 10088 (1912) | 1704 | 4535 (1456) | 0 / 4388 | 0 / 2177 |
| embed-llm+ollama | 1000 | 1072 (336) | 272 (68) | 859 (154) | 248 | 36 (0) | 0 / 0 | 0 / 323 |

### Invariants (evidence completeness and default-off injection)

39/39 checks pass.
