"""Minimal agentmemory usage via iii-sdk.

Prerequisites:
    pip install iii-sdk==0.25.0
    npx -y @agentmemory/agentmemory  # daemon at ws://127.0.0.1:49134

Run:
    python examples/python/quickstart.py
"""

import os
from iii import InitOptions, register_worker


def main() -> None:
    iii = register_worker(
        os.environ.get("AGENTMEMORY_III_URL", "ws://127.0.0.1:49134"),
        InitOptions(namespace=os.environ.get("AGENTMEMORY_III_NAMESPACE", "agentmemory-3111")),
    )
    try:
        iii.trigger(
            {
                "function_id": "mem::remember",
                "payload": {
                    "project": "demo",
                    "title": "auth-stack",
                    "content": "Service uses HMAC bearer tokens; refresh every 24h.",
                    "concepts": ["auth", "hmac", "refresh"],
                },
            }
        )

        hits = iii.trigger(
            {
                "function_id": "mem::smart-search",
                "payload": {
                    "project": "demo",
                    "query": "how do tokens refresh",
                    "limit": 5,
                },
            }
        )

        for memory in hits.get("results", []):
            print(f"[{memory.get('score', 0):.3f}] {memory.get('title')}: {memory.get('content')}")
    finally:
        iii.shutdown()


if __name__ == "__main__":
    main()
