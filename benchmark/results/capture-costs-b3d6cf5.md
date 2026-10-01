Commit `b3d6cf50026655233f11c2273b898af0ca82cf03`, darwin 25.2.0 arm64, Apple M1 Max x10, 65536.00 MiB RAM, Node v22.22.0, iii 0.22.1.

### Disk retention

| profile | N | logical obs | fixed | after capture | growth/obs | source | summary | index | diagnostic | config | stream | queue | failed delivery |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| keyless #1 | 100 | 100 | 5.8 KiB | 393.6 KiB | 3.9 KiB | 295.6 KiB | 0 B | 5.4 KiB | 3.9 KiB | 1.9 KiB | 86.8 KiB | 0 B | 0 B |
| embed #1 | 100 | 100 | 6.1 KiB | 765.3 KiB | 7.6 KiB | 295.4 KiB | 0 B | 377.4 KiB | 4.2 KiB | 1.9 KiB | 86.4 KiB | 0 B | 0 B |
| embed-llm #1 | 100 | 100 | 6.1 KiB | 658.1 KiB | 6.5 KiB | 273.7 KiB | 0 B | 378.1 KiB | 4.4 KiB | 1.9 KiB | 0 B | 0 B | 0 B |
| keyless #2 | 100 | 100 | 6.1 KiB | 393.9 KiB | 3.9 KiB | 295.6 KiB | 0 B | 5.4 KiB | 4.2 KiB | 1.9 KiB | 86.8 KiB | 0 B | 0 B |
| embed #2 | 100 | 100 | 6.1 KiB | 757.1 KiB | 7.5 KiB | 295.4 KiB | 0 B | 369.2 KiB | 4.2 KiB | 1.9 KiB | 86.4 KiB | 0 B | 0 B |
| embed-llm #2 | 100 | 100 | 5.8 KiB | 666.0 KiB | 6.6 KiB | 273.7 KiB | 0 B | 386.3 KiB | 4.1 KiB | 1.9 KiB | 0 B | 0 B | 0 B |
| keyless #1 | 1000 | 1000 | 6.1 KiB | 3.56 MiB | 3.6 KiB | 3.08 MiB | 0 B | 49.2 KiB | 4.2 KiB | 1.9 KiB | 435.8 KiB | 0 B | 0 B |
| embed #1 | 1000 | 1000 | 6.1 KiB | 3.91 MiB | 4.0 KiB | 3.07 MiB | 0 B | 411.4 KiB | 4.2 KiB | 1.9 KiB | 433.9 KiB | 0 B | 0 B |
| embed-llm #1 | 1000 | 1000 | 5.8 KiB | 3.29 MiB | 3.4 KiB | 2.86 MiB | 0 B | 432.1 KiB | 4.1 KiB | 1.9 KiB | 0 B | 0 B | 0 B |
| keyless #2 | 1000 | 1000 | 5.8 KiB | 3.56 MiB | 3.6 KiB | 3.08 MiB | 0 B | 49.2 KiB | 3.9 KiB | 1.9 KiB | 435.8 KiB | 0 B | 0 B |
| embed #2 | 1000 | 1000 | 6.1 KiB | 3.91 MiB | 4.0 KiB | 3.07 MiB | 0 B | 419.6 KiB | 4.2 KiB | 1.9 KiB | 433.9 KiB | 0 B | 0 B |
| embed-llm #2 | 1000 | 1000 | 5.8 KiB | 3.30 MiB | 3.4 KiB | 2.86 MiB | 0 B | 440.3 KiB | 4.1 KiB | 1.9 KiB | 0 B | 0 B | 0 B |
| keyless #1 | 10000 | 10000 | 6.1 KiB | 32.05 MiB | 3.3 KiB | 31.12 MiB | 0 B | 501.1 KiB | 4.2 KiB | 1.9 KiB | 438.4 KiB | 0 B | 0 B |
| embed #1 | 10000 | 10000 | 5.8 KiB | 32.37 MiB | 3.3 KiB | 31.10 MiB | 0 B | 853.9 KiB | 4.2 KiB | 1.9 KiB | 436.4 KiB | 0 B | 0 B |
| embed-llm #1 | 10000 | 10000 | 5.8 KiB | 29.91 MiB | 3.1 KiB | 29.02 MiB | 0 B | 909.9 KiB | 4.4 KiB | 1.9 KiB | 0 B | 0 B | 0 B |
| embed-llm #2 | 10000 | 10000 | 6.1 KiB | 29.88 MiB | 3.1 KiB | 29.02 MiB | 0 B | 881.3 KiB | 4.4 KiB | 1.9 KiB | 0 B | 0 B | 0 B |

### Resident memory and CPU (engine + worker process tree)

| profile | N | empty idle | capture peak | engine peak | worker peak | idle after capture | after recovery | capture CPU s | recovery CPU s |
|---|---|---|---|---|---|---|---|---|---|
| keyless #1 | 100 | 167 MiB | 182 MiB | 56 MiB | 127 MiB | 182 MiB | 190 MiB | 1.01 | 0.06 |
| embed #1 | 100 | 164 MiB | 210 MiB | 57 MiB | 154 MiB | 168 MiB | 161 MiB | 1.1 | 0.03 |
| embed-llm #1 | 100 | 166 MiB | 189 MiB | 57 MiB | 132 MiB | 189 MiB | 159 MiB | 1.12 | 0.06 |
| keyless #2 | 100 | 167 MiB | 204 MiB | 55 MiB | 151 MiB | 163 MiB | 157 MiB | 0.81 | 0.06 |
| embed #2 | 100 | 168 MiB | 186 MiB | 55 MiB | 131 MiB | 167 MiB | 191 MiB | 0.94 | 0.01 |
| embed-llm #2 | 100 | 166 MiB | 211 MiB | 60 MiB | 151 MiB | 177 MiB | 192 MiB | 1.15 | 0.02 |
| keyless #1 | 1000 | 167 MiB | 236 MiB | 82 MiB | 160 MiB | 236 MiB | 225 MiB | 6.24 | 0.02 |
| embed #1 | 1000 | 166 MiB | 246 MiB | 79 MiB | 168 MiB | 241 MiB | 256 MiB | 6.43 | 0.11 |
| embed-llm #1 | 1000 | 167 MiB | 280 MiB | 78 MiB | 202 MiB | 277 MiB | 179 MiB | 7.86 | 0.06 |
| keyless #2 | 1000 | 166 MiB | 243 MiB | 80 MiB | 163 MiB | 243 MiB | 222 MiB | 5.57 | 0.06 |
| embed #2 | 1000 | 165 MiB | 240 MiB | 78 MiB | 162 MiB | 240 MiB | 227 MiB | 6.48 | 0.07 |
| embed-llm #2 | 1000 | 166 MiB | 272 MiB | 80 MiB | 192 MiB | 272 MiB | 245 MiB | 7.76 | 0.14 |
| keyless #1 | 10000 | 167 MiB | 419 MiB | 193 MiB | 229 MiB | 412 MiB | 384 MiB | 51.4 | 0.01 |
| embed #1 | 10000 | 167 MiB | 452 MiB | 181 MiB | 271 MiB | 452 MiB | 401 MiB | 57.91 | 0.07 |
| embed-llm #1 | 10000 | 168 MiB | 673 MiB | 313 MiB | 362 MiB | 673 MiB | 371 MiB | 70.12 | 0.1 |
| embed-llm #2 | 10000 | 167 MiB | 641 MiB | 272 MiB | 369 MiB | 631 MiB | 369 MiB | 69.9 | 0.08 |

### Capture latency

| profile | N | hook p50 ms | hook p95 ms | hook stdout B | observe p50 ms | observe p95 ms | observe p99 ms | errors | capture wall ms | quiesce ms |
|---|---|---|---|---|---|---|---|---|---|---|
| keyless #1 | 100 | 59.61 | 86.23 | 0 | null | null | null | 0 | 6342 | 6016 |
| embed #1 | 100 | 55.15 | 61.55 | 0 | null | null | null | 0 | 5587 | 586281 |
| embed-llm #1 | 100 | 54.57 | 58.8 | 0 | null | null | null | 0 | 5493 | 6006 |
| keyless #2 | 100 | 54.79 | 59.71 | 0 | null | null | null | 0 | 5546 | 6008 |
| embed #2 | 100 | 56.43 | 62.35 | 0 | null | null | null | 0 | 5685 | 6011 |
| embed-llm #2 | 100 | 53.62 | 57.41 | 0 | null | null | null | 0 | 5403 | 7010 |
| keyless #1 | 1000 | 58.68 | 64.57 | 0 | 32.33 | 49.17 | 55.56 | 0 | 9663 | 6020 |
| embed #1 | 1000 | 56.22 | 59.08 | 0 | 36.09 | 49.35 | 57.32 | 0 | 9678 | 6013 |
| embed-llm #1 | 1000 | 53.85 | 56.72 | 0 | 36.31 | 48.24 | 56.34 | 0 | 9350 | 7009 |
| keyless #2 | 1000 | 54.38 | 58.66 | 0 | 29.42 | 41.45 | 47.3 | 0 | 8768 | 6008 |
| embed #2 | 1000 | 54.72 | 57.93 | 0 | 35.7 | 50.15 | 58.18 | 0 | 9550 | 6007 |
| embed-llm #2 | 1000 | 52.59 | 55.02 | 0 | 35.67 | 48.25 | 56.2 | 0 | 9215 | 7040 |
| keyless #1 | 10000 | 53.86 | 56.26 | 0 | 29.12 | 42.9 | 48.15 | 0 | 41216 | 6017 |
| embed #1 | 10000 | 55.01 | 58.22 | 0 | 34.78 | 49 | 56.17 | 0 | 47935 | 9029 |
| embed-llm #1 | 10000 | 52.4 | 56.91 | 0 | 35.57 | 52.02 | 60.88 | 8 | 131514 | 7012 |
| embed-llm #2 | 10000 | 57.43 | 61.65 | 0 | 35.13 | 51.38 | 58.61 | 0 | 48471 | 7018 |

### Startup and recovery

| profile | N | cold ready ms | warm ready ms | recovery ready ms | recovery BM25 rebuild ms (docs) | vectors loaded | vector docs before / after | backfill queued / awaiting opt-in | re-embed requests (inputs) | logical obs before / after | marker hits before / after | source tail before / after |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| keyless #1 | 100 | 1283 | 844 | 865 | 33 (100) | 0 | null / null | 0 / 0 | 0 (0) | 100 / 100 | 50/50 / 50/50 | 50 / 50 |
| embed #1 | 100 | 1247 | 844 | 826 | 32 (100) | 91 | 100 / 100 | 9 / 0 | 1 (9) | 100 / 100 | 9/50 / 9/50 | 50 / 50 |
| embed-llm #1 | 100 | 1568 | 833 | 872 | 19 (100) | 91 | 100 / 91 | 0 / 9 | 0 (0) | 100 / 100 | 8/50 / 8/50 | 50 / 50 |
| keyless #2 | 100 | 1324 | 829 | 839 | 33 (100) | 0 | null / null | 0 / 0 | 0 (0) | 100 / 100 | 50/50 / 50/50 | 50 / 50 |
| embed #2 | 100 | 1270 | 833 | 828 | 30 (100) | 89 | 100 / 99 | 10 / 0 | 1 (10) | 100 / 100 | 9/50 / 9/50 | 50 / 50 |
| embed-llm #2 | 100 | 1148 | 839 | 848 | 21 (100) | 93 | 100 / 99 | 6 / 0 | 1 (6) | 100 / 100 | 8/50 / 9/50 | 50 / 50 |
| keyless #1 | 1000 | 1232 | 826 | 830 | 161 (1000) | 0 | null / null | 0 / 0 | 0 (0) | 1000 / 1000 | 50/50 / 50/50 | 50 / 50 |
| embed #1 | 1000 | 1228 | 816 | 847 | 150 (1000) | 89 | 1000 / 589 | 500 / 0 | 16 (500) | 1000 / 1000 | 0/50 / 0/50 | 50 / 50 |
| embed-llm #1 | 1000 | 1374 | 852 | 965 | 72 (1000) | 93 | 1000 / 93 | 0 / 907 | 0 (0) | 1000 / 1000 | 1/50 / 48/50 | 50 / 50 |
| keyless #2 | 1000 | 1151 | 849 | 1047 | 153 (1000) | 0 | null / null | 0 / 0 | 0 (0) | 1000 / 1000 | 50/50 / 50/50 | 50 / 50 |
| embed #2 | 1000 | 1228 | 848 | 1054 | 149 (1000) | 91 | 1000 / 91 | 0 / 909 | 0 (0) | 1000 / 1000 | 0/50 / 46/50 | 50 / 50 |
| embed-llm #2 | 1000 | 1270 | 833 | 974 | 74 (1000) | 95 | 1000 / 595 | 500 / 0 | 16 (500) | 1000 / 1000 | 1/50 / 0/50 | 50 / 50 |
| keyless #1 | 10000 | 1684 | 827 | 1052 | 1387 (10000) | 0 | null / null | 0 / 0 | 0 (0) | 10000 / 10000 | 50/50 / 50/50 | 50 / 50 |
| embed #1 | 10000 | 1275 | 849 | 1056 | 1392 (10000) | 91 | 10000 / 591 | 500 / 0 | 16 (500) | 10000 / 10000 | 0/50 / 0/50 | 50 / 50 |
| embed-llm #1 | 10000 | 1253 | 851 | 978 | 638 (9999) | 95 | 9999 / 595 | 500 / 0 | 16 (500) | 10000 / 10000 | 0/50 / 0/50 | 50 / 50 |
| embed-llm #2 | 10000 | 1671 | 825 | 865 | 643 (10000) | 88 | 10000 / 588 | 500 / 0 | 16 (500) | 10000 / 10000 | 0/50 / 0/50 | 50 / 50 |

### Provider calls (fake OpenAI-compatible server)

| profile | N | capture embed req (inputs, repeats) | capture chat req (repeats) | chat prompt tok | chat completion tok | context-phase embed req | recovery embed req | warm-start embed req |
|---|---|---|---|---|---|---|---|---|
| keyless #1 | 100 | 0 (0, 0) | 0 (0) | 0 | 0 | 0 | 0 | 0 |
| embed #1 | 100 | 100 (100, 0) | 0 (0) | 0 | 0 | 33 | 1 | 0 |
| embed-llm #1 | 100 | 100 (100, 0) | 100 (0) | 86427 | 12345 | 33 | 0 | 0 |
| keyless #2 | 100 | 0 (0, 0) | 0 (0) | 0 | 0 | 0 | 0 | 0 |
| embed #2 | 100 | 100 (100, 0) | 0 (0) | 0 | 0 | 33 | 1 | 0 |
| embed-llm #2 | 100 | 100 (100, 0) | 100 (0) | 86427 | 12345 | 33 | 1 | 0 |
| keyless #1 | 1000 | 0 (0, 0) | 0 (0) | 0 | 0 | 0 | 0 | 0 |
| embed #1 | 1000 | 1000 (1000, 0) | 0 (0) | 0 | 0 | 33 | 16 | 0 |
| embed-llm #1 | 1000 | 1000 (1000, 0) | 1000 (0) | 912430 | 124107 | 33 | 0 | 0 |
| keyless #2 | 1000 | 0 (0, 0) | 0 (0) | 0 | 0 | 0 | 0 | 0 |
| embed #2 | 1000 | 1000 (1000, 0) | 0 (0) | 0 | 0 | 33 | 0 | 0 |
| embed-llm #2 | 1000 | 1000 (1000, 0) | 1000 (0) | 912430 | 124107 | 33 | 16 | 0 |
| keyless #1 | 10000 | 0 (0, 0) | 0 (0) | 0 | 0 | 0 | 0 | 0 |
| embed #1 | 10000 | 10000 (10000, 0) | 0 (0) | 0 | 0 | 33 | 16 | 0 |
| embed-llm #1 | 10000 | 9999 (9999, 0) | 9999 (0) | 9211253 | 1250797 | 33 | 16 | 0 |
| embed-llm #2 | 10000 | 10000 (10000, 0) | 10000 (0) | 9211888 | 1250921 | 33 | 16 | 0 |

### Agent-visible context (server token estimate, not provider billing)

| profile | N | search full B p50 (tok) | compact B p50 (tok) | narrative B p50 (tok) | smart-search B p50 | context B (tok) | SessionStart stdout off / on | PreToolUse stdout off / on |
|---|---|---|---|---|---|---|---|---|
| keyless #1 | 100 | 8729 (2881) | 1761 (563) | 10081 (1913) | 1711 | 36 (0) | 0 / 2230 | 0 / 2177 |
| embed #1 | 100 | 8654 (2857) | 1725 (553) | 10050 (1907) | 1700 | 36 (0) | 0 / 2230 | 0 / 2177 |
| embed-llm #1 | 100 | 6494 (2142) | 2141 (693) | 4976 (1072) | 2116 | 36 (0) | 0 / 1005 | 0 / 661 |
| keyless #2 | 100 | 8729 (2881) | 1761 (563) | 10081 (1913) | 1711 | 36 (0) | 0 / 2230 | 0 / 2177 |
| embed #2 | 100 | 8654 (2857) | 1725 (553) | 10050 (1907) | 1700 | 36 (0) | 0 / 2230 | 0 / 2177 |
| embed-llm #2 | 100 | 6494 (2142) | 2141 (693) | 4976 (1072) | 2116 | 36 (0) | 0 / 1005 | 0 / 661 |
| keyless #1 | 1000 | 8733 (2882) | 1762 (567) | 10099 (1918) | 1719 | 4534 (1454) | 0 / 4383 | 0 / 2197 |
| embed #1 | 1000 | 8715 (2877) | 1732 (552) | 10074 (1909) | 1707 | 4535 (1456) | 0 / 4388 | 0 / 2197 |
| embed-llm #1 | 1000 | 6542 (2159) | 2160 (695) | 5022 (1082) | 2135 | 5889 (1934) | 0 / 5806 | 0 / 664 |
| keyless #2 | 1000 | 8733 (2882) | 1762 (567) | 10099 (1918) | 1719 | 4535 (1456) | 0 / 4388 | 0 / 2197 |
| embed #2 | 1000 | 8715 (2877) | 1732 (552) | 10074 (1909) | 1707 | 4535 (1456) | 0 / 4388 | 0 / 2197 |
| embed-llm #2 | 1000 | 6542 (2159) | 2160 (695) | 5022 (1082) | 2135 | 5889 (1934) | 0 / 5806 | 0 / 664 |
| keyless #1 | 10000 | 8747 (2888) | 1793 (575) | 10098 (1922) | 1749 | 4533 (1455) | 0 / 4386 | 0 / 2217 |
| embed #1 | 10000 | 8781 (2898) | 1760 (565) | 10070 (1915) | 1735 | 4533 (1455) | 0 / 4386 | 0 / 2217 |
| embed-llm #1 | 10000 | 6620 (2184) | 2189 (704) | 5092 (1096) | 2164 | 5921 (1944) | 0 / 5838 | 0 / 655 |
| embed-llm #2 | 10000 | 6620 (2184) | 2189 (704) | 5092 (1096) | 2164 | 5921 (1944) | 0 / 5838 | 0 / 655 |

### Invariants (evidence completeness and default-off injection)

144/155 checks pass.

| profile | N | repeat | check | value | limit |
|---|---|---|---|---|---|
| embed-llm | 100 | 1 | vectorDocumentsAfterRecovery | 91 | 100 |
| embed | 100 | 2 | vectorDocumentsAfterRecovery | 99 | 100 |
| embed-llm | 100 | 2 | vectorDocumentsAfterRecovery | 99 | 100 |
| embed | 1000 | 1 | vectorDocumentsAfterRecovery | 589 | 1000 |
| embed-llm | 1000 | 1 | vectorDocumentsAfterRecovery | 93 | 1000 |
| embed | 1000 | 2 | vectorDocumentsAfterRecovery | 91 | 1000 |
| embed-llm | 1000 | 2 | vectorDocumentsAfterRecovery | 595 | 1000 |
| embed | 10000 | 1 | vectorDocumentsAfterRecovery | 591 | 10000 |
| embed-llm | 10000 | 1 | observeErrors | 8 | 0 |
| embed-llm | 10000 | 1 | vectorDocumentsAfterRecovery | 595 | 9999 |
| embed-llm | 10000 | 2 | vectorDocumentsAfterRecovery | 588 | 10000 |

### Budgets

162/162 checks pass.
