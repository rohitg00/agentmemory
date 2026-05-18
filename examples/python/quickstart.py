"""Minimal agentmemory usage via iii-sdk.

Prerequisites:
    pip install iii-sdk
    npx -y @agentmemory/agentmemory  # daemon at ws://localhost:49134

Run:
    python examples/python/quickstart.py
"""

from iii import register_worker


def main() -> None:
    iii = register_worker("ws://localhost:49134")
    iii.connect()

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


if __name__ == "__main__":
    main()
