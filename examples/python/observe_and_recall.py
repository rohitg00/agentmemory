"""Observation ingest + context rendering at a token budget.

Pattern: send hook-style observations during a coding session, then ask
agentmemory to render the most relevant context back at a fixed token budget.

Prerequisites:
    pip install iii-sdk
    npx -y @agentmemory/agentmemory

Run:
    python examples/python/observe_and_recall.py
"""

from datetime import datetime, timezone
from iii import register_worker


SESSION_ID = "py-example-session-001"
PROJECT = "demo"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    iii = register_worker("ws://localhost:49134")
    iii.connect()

    observations = [
        ("PreToolUse", {"tool": "Bash", "command": "cargo test"}),
        ("PostToolUse", {"tool": "Bash", "exit_code": 0}),
        ("UserPromptSubmit", {"prompt": "refactor auth middleware to use HMAC"}),
    ]

    for hook_type, data in observations:
        iii.trigger(
            {
                "function_id": "mem::observe",
                "payload": {
                    "hookType": hook_type,
                    "sessionId": SESSION_ID,
                    "project": PROJECT,
                    "cwd": "/home/user/service",
                    "timestamp": now_iso(),
                    "data": data,
                },
            }
        )

    context = iii.trigger(
        {
            "function_id": "mem::context",
            "payload": {
                "sessionId": SESSION_ID,
                "project": PROJECT,
                "budget": 2000,
            },
        }
    )

    print(f"Rendered context ({context.get('token_count', 0)} tokens):\n")
    print(context.get("text", ""))


if __name__ == "__main__":
    main()
