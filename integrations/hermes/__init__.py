"""
agentmemory memory provider for Hermes Agent.

Drop this folder into ~/.hermes/plugins/agentmemory/
or install via: hermes plugin install agentmemory

Requires agentmemory server running: npx @agentmemory/agentmemory
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import URLError

try:
    from agent.memory_provider import MemoryProvider
except ImportError:
    from abc import ABC, abstractmethod

    class MemoryProvider(ABC):
        @property
        @abstractmethod
        def name(self) -> str: ...
        @abstractmethod
        def is_available(self) -> bool: ...
        @abstractmethod
        def initialize(self, session_id: str, **kwargs: Any) -> None: ...
        @abstractmethod
        def get_tool_schemas(self) -> list[dict]: ...
        @abstractmethod
        def handle_tool_call(self, name: str, args: dict) -> str: ...
        def get_config_schema(self) -> list[dict]: return []
        def save_config(self, values: dict, hermes_home: str) -> None: pass
        def system_prompt_block(self) -> str: return ""
        def prefetch(self, query: str, **kwargs: Any) -> str: return ""
        def queue_prefetch(self, query: str, **kwargs: Any) -> None: pass
        def sync_turn(self, user: str, assistant: str, **kwargs: Any) -> None: pass
        def on_session_end(self, messages: list, **kwargs: Any) -> None: pass
        def on_pre_compress(self, messages: list, **kwargs: Any) -> None: pass
        def on_memory_write(self, action: str, target: str, content: str, **kwargs: Any) -> None: pass
        def shutdown(self, **kwargs: Any) -> None: pass


DEFAULT_BASE_URL = "http://localhost:3111"
TIMEOUT = 5

# agentmemory's documented runtime config lives at ~/.agentmemory/.env.
# When agentmemory is launched as a systemd user service (or any other
# process manager that loads that file directly), those values never
# reach an interactive shell. `hermes memory status` then reads
# os.environ in the Hermes CLI process, finds AGENTMEMORY_URL /
# AGENTMEMORY_SECRET unset, and reports the plugin as "Missing" even
# though the service is healthy and live sessions can use it (#250).
#
# Preload the file at plugin-import time using os.environ.setdefault so
# we never override anything the user explicitly set in the shell. The
# preload is best-effort and silent on any failure (file absent,
# unreadable, malformed) — the plugin falls back to its existing default
# (http://localhost:3111) and Hermes status reflects that.
def _preload_agentmemory_dotenv() -> None:
    candidates: list[Path] = []
    home = os.environ.get("HOME")
    if home:
        candidates.append(Path(home) / ".agentmemory" / ".env")
    xdg_config = os.environ.get("XDG_CONFIG_HOME")
    if xdg_config:
        candidates.append(Path(xdg_config) / "agentmemory" / ".env")
    for path in candidates:
        try:
            if not path.is_file():
                continue
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key:
                    os.environ.setdefault(key, value)
        except (OSError, UnicodeDecodeError):
            continue


_preload_agentmemory_dotenv()


def _validate_url(base: str) -> bool:
    from urllib.parse import urlparse
    parsed = urlparse(base)
    return parsed.scheme in ("http", "https")


def _api(base: str, path: str, body: dict | None = None, method: str = "POST", secret: str = "") -> dict | None:
    if not _validate_url(base):
        return None
    url = f"{base}/agentmemory/{path}"
    headers = {"Content-Type": "application/json"}
    auth = secret or os.environ.get("AGENTMEMORY_SECRET", "")
    if auth:
        headers["Authorization"] = f"Bearer {auth}"

    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode())
    except (URLError, TimeoutError, json.JSONDecodeError):
        return None


def _api_bg(base: str, path: str, body: dict | None = None) -> None:
    t = threading.Thread(target=_api, args=(base, path, body), daemon=True)
    t.start()


class AgentMemoryProvider(MemoryProvider):

    @property
    def name(self) -> str:
        return "agentmemory"

    def is_available(self) -> bool:
        base = os.environ.get("AGENTMEMORY_URL", DEFAULT_BASE_URL)
        if not _validate_url(base):
            return False
        try:
            req = Request(f"{base}/agentmemory/health", method="GET")
            with urlopen(req, timeout=2):
                return True
        except Exception:
            return False

    def initialize(self, session_id: str, **kwargs: Any) -> None:
        self._base = os.environ.get("AGENTMEMORY_URL", DEFAULT_BASE_URL)
        self._session_id = session_id
        self._project = kwargs.get("cwd", os.getcwd())

        _api(self._base, "session/start", {
            "sessionId": session_id,
            "project": self._project,
            "cwd": self._project,
        })

    def get_config_schema(self) -> list[dict]:
        return [
            {
                "key": "url",
                "description": "agentmemory server URL",
                "default": DEFAULT_BASE_URL,
                "env_var": "AGENTMEMORY_URL",
            },
            {
                "key": "secret",
                "description": "agentmemory auth secret (optional)",
                "secret": True,
                "required": False,
                "env_var": "AGENTMEMORY_SECRET",
            },
        ]

    def save_config(self, values: dict, hermes_home: str) -> None:
        config_path = Path(hermes_home) / "agentmemory.json"
        config_path.write_text(json.dumps(values, indent=2))

    def system_prompt_block(self) -> str:
        result = _api(self._base, "context", {
            "sessionId": self._session_id,
            "project": self._project,
        })
        if result and result.get("context"):
            return result["context"]
        return ""

    def prefetch(self, query: str, **kwargs: Any) -> str:
        result = _api(self._base, "smart-search", {
            "query": query,
            "limit": 5,
        })
        if not result or not result.get("results"):
            return ""

        lines = []
        for r in result["results"][:5]:
            obs = r.get("observation", r)
            title = obs.get("title", "")
            narrative = obs.get("narrative", "")
            if title:
                lines.append(f"- {title}: {narrative[:200]}")
        return "\n".join(lines) if lines else ""

    def queue_prefetch(self, query: str, **kwargs: Any) -> None:
        _api_bg(self._base, "smart-search", {"query": query, "limit": 3})

    def get_tool_schemas(self) -> list[dict]:
        return [
            {
                "name": "memory_recall",
                "description": "Search agentmemory for past observations by keyword",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "limit": {"type": "integer", "description": "Max results", "default": 10},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "memory_save",
                "description": "Save an insight, decision, or pattern to long-term memory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string", "description": "What to remember"},
                        "type": {
                            "type": "string",
                            "enum": ["pattern", "preference", "architecture", "bug", "workflow", "fact"],
                            "description": "Memory type",
                        },
                    },
                    "required": ["content"],
                },
            },
            {
                "name": "memory_search",
                "description": "Hybrid semantic + keyword search across all memories",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 5},
                    },
                    "required": ["query"],
                },
            },
        ]

    def handle_tool_call(self, name: str, args: dict) -> str:
        # Hermes stores the return value as the tool result `content` in the
        # session history. Anthropic-protocol providers reject non-string
        # content with a 400 on the next request, so always serialize to a
        # JSON string here — matches what agentmemory's main MCP server does
        # in src/mcp/standalone.ts (`{ type: "text", text: JSON.stringify(...) }`).
        if name == "memory_recall":
            result = _api(self._base, "search", {
                "query": args["query"],
                "limit": args.get("limit", 10),
            })
            if not result:
                return json.dumps({"results": []})
            items = []
            for r in result.get("results", []):
                obs = r.get("observation", r)
                items.append({
                    "title": obs.get("title", ""),
                    "type": obs.get("type", ""),
                    "narrative": obs.get("narrative", ""),
                    "importance": obs.get("importance", 0),
                    "timestamp": obs.get("timestamp", ""),
                })
            return json.dumps({"results": items})

        if name == "memory_save":
            result = _api(self._base, "remember", {
                "content": args["content"],
                "type": args.get("type", "fact"),
            })
            return json.dumps(result or {"success": False})

        if name == "memory_search":
            result = _api(self._base, "smart-search", {
                "query": args["query"],
                "limit": args.get("limit", 5),
            })
            if not result:
                return json.dumps({"results": []})
            items = []
            for r in result.get("results", []):
                obs = r.get("observation", r)
                items.append({
                    "title": obs.get("title", ""),
                    "narrative": obs.get("narrative", "")[:300],
                    "score": r.get("combinedScore", r.get("score", 0)),
                })
            return json.dumps({"results": items})

        return json.dumps({"error": f"Unknown tool: {name}"})

    def sync_turn(self, user: str, assistant: str, **kwargs: Any) -> None:
        _api_bg(self._base, "observe", {
            "hookType": "post_tool_use",
            "sessionId": kwargs.get("session_id", self._session_id),
            "project": self._project,
            "cwd": self._project,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "data": {
                "tool_name": "conversation",
                "input": user[:500],
                "output": assistant[:2000],
            },
        })

    def on_session_end(self, messages: list, **kwargs: Any) -> None:
        _api(self._base, "session/end", {
            "sessionId": kwargs.get("session_id", self._session_id),
        })

    def on_pre_compress(self, messages: list, **kwargs: Any) -> None:
        result = _api(self._base, "context", {
            "sessionId": kwargs.get("session_id", self._session_id),
            "project": self._project,
        })
        if result and result.get("context"):
            messages.insert(0, {
                "role": "user",
                "content": f"[agentmemory context before compaction]\n{result['context']}",
            })

    def on_memory_write(self, action: str, target: str, content: str, **kwargs: Any) -> None:
        if action in ("add", "update") and content:
            _api_bg(self._base, "remember", {
                "content": content,
                "type": "fact",
            })

    def shutdown(self, **kwargs: Any) -> None:
        pass


def register(ctx: Any) -> None:
    ctx.register_memory_provider(AgentMemoryProvider())
