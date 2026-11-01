"""
agentmemory memory provider for Hermes Agent.

Install the packaged provider with agentmemory connect hermes.

Requires a running AgentMemory server.
"""

from __future__ import annotations

import hashlib
from contextvars import ContextVar
import ipaddress
import tempfile
import json
import os
import sys
import threading
import subprocess
import time
from pathlib import Path, PurePath
from typing import Any, Callable
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.error import HTTPError, URLError


def _resolve_project(cwd: str) -> str:
    """Canonical project scope, matching the hooks' resolveProject order:
    AGENTMEMORY_PROJECT_NAME env override, git repository basename, cwd basename.
    Keeps Hermes sessions in the same project bucket as every other agent."""
    explicit = (_environment_value("AGENTMEMORY_PROJECT_NAME") or "").strip()
    if explicit:
        return explicit
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir"],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout.strip()
        top, git_dir, common_dir = (out.splitlines() + ["", "", ""])[:3]
        if top:
            return PurePath(_repository_root(cwd, top, git_dir, common_dir)).name
    except Exception:
        pass
    return PurePath(cwd).name or cwd


def _repository_root(cwd: str, top: str, git_dir: str, common_dir: str) -> str:
    """A linked worktree is named by the main checkout owning the shared .git;
    bare repos and submodules keep the toplevel."""
    if not git_dir or not common_dir:
        return top
    physical = os.path.realpath(cwd)
    common = os.path.normpath(os.path.join(physical, common_dir))
    if os.path.normpath(os.path.join(physical, git_dir)) == common:
        return top
    if os.path.basename(common) != ".git":
        return top
    return os.path.dirname(common)


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
_plaintext_bearer_warned = False

def _is_loopback(base: str) -> bool:
    if not _validate_url(base):
        return False
    host = (urlparse(base).hostname or "").lower()
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _validate_url(base: str) -> bool:
    if not isinstance(base, str) or not base or any(char.isspace() for char in base) or "?" in base or "#" in base:
        return False
    try:
        parsed = urlparse(base)
        # .port raises ValueError on a non-numeric or out-of-range port
        _ = parsed.port
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    return bool(parsed.hostname) and not (parsed.username or parsed.password or parsed.query or parsed.fragment)


def _uses_plaintext_bearer_auth(base: str, secret: str = "") -> bool:
    if not secret:
        return False
    parsed = urlparse(base)
    return parsed.scheme == "http" and not _is_loopback(base)


def _plaintext_bearer_auth_message(base: str) -> str:
    return f"agentmemory: AGENTMEMORY_SECRET is configured for plaintext HTTP to {base}. Bearer tokens and memory payloads can be observed on the network; use HTTPS or an SSH tunnel."


def _warn_plaintext_bearer_auth(message: str) -> None:
    print(message, file=sys.stderr)


def _check_plaintext_bearer_guard(
    base: str,
    secret: str = "",
    warn: Callable[[str], None] | None = None,
) -> None:
    global _plaintext_bearer_warned
    if not _uses_plaintext_bearer_auth(base, secret):
        return
    message = _plaintext_bearer_auth_message(base)
    if os.environ.get("AGENTMEMORY_REQUIRE_HTTPS") == "1":
        raise RuntimeError(message)
    if not _plaintext_bearer_warned:
        _plaintext_bearer_warned = True
        (warn or _warn_plaintext_bearer_auth)(message)


def _reset_plaintext_bearer_guard_for_tests() -> None:
    global _plaintext_bearer_warned
    _plaintext_bearer_warned = False


def _usable_secret(value: str | None) -> str:
    trimmed = (value or "").strip()
    if not trimmed or (trimmed.startswith("${") and trimmed.endswith("}")):
        return ""
    return trimmed


def _environment_value(name: str) -> str | None:
    try:
        from agent.secret_scope import get_secret
    except ImportError as error:
        raise RuntimeError("Hermes scoped credential access is unavailable. Update Hermes before enabling AgentMemory.") from error
    return get_secret(name)


def _active_home() -> Path:
    try:
        from hermes_constants import get_hermes_home
    except ImportError:
        return Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")
    return Path(get_hermes_home())


def _profile_home() -> Path:
    home = _active_home().expanduser().resolve()
    try:
        from agent.secret_scope import current_secret_scope_home, current_secret_scope, serves_routed_profile
    except ImportError:
        return home
    if serves_routed_profile() and current_secret_scope() is None:
        raise RuntimeError("AgentMemory requires the active Hermes profile secret scope.")
    scoped_home = current_secret_scope_home()
    if scoped_home and Path(scoped_home).expanduser().resolve() != home:
        raise RuntimeError("AgentMemory profile home does not match the active secret scope.")
    return home


def _configuration(hermes_home: str | None = None) -> tuple[str, str]:
    home = _profile_home()
    if hermes_home and Path(hermes_home).expanduser().resolve() != home:
        raise RuntimeError("AgentMemory profile changed. Restart this Hermes session before sending memory requests.")
    try:
        saved = json.loads((home / "agentmemory.json").read_text(encoding="utf-8"))
        if not isinstance(saved, dict):
            saved = {}
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        saved = {}
    saved_url = saved.get("url")
    if not isinstance(saved_url, str):
        saved_url = ""
    base = (_environment_value("AGENTMEMORY_URL") or saved_url or DEFAULT_BASE_URL).rstrip("/")
    return base, _usable_secret(_environment_value("AGENTMEMORY_SECRET"))


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HTTPError(req.full_url, code, "redirect refused", headers, fp)


urlopen = build_opener(_NoRedirect()).open


def _api(base: str, path: str, body: dict | None = None, method: str = "POST", secret: str | None = None) -> dict:
    if not _validate_url(base):
        return {"success": False, "errorCode": "invalid_url", "error": "Configure AGENTMEMORY_URL with an HTTP or HTTPS endpoint without credentials, query or fragment."}
    headers = {"Content-Type": "application/json"}
    auth = _usable_secret(_environment_value("AGENTMEMORY_SECRET")) if secret is None else _usable_secret(secret)
    _check_plaintext_bearer_guard(base, auth)
    if auth:
        headers["Authorization"] = f"Bearer {auth}"
    data = json.dumps(body).encode() if body is not None else None
    req = Request(f"{base.rstrip('/')}/agentmemory/{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=TIMEOUT) as resp:
            result = json.loads(resp.read().decode())
            if not isinstance(result, dict):
                raise ValueError("expected an object")
            return result
    except HTTPError as error:
        error.close()
        if error.code in (401, 403):
            return {"success": False, "errorCode": "authentication", "error": "AgentMemory rejected authentication. Check AGENTMEMORY_SECRET for the configured endpoint."}
        return {"success": False, "errorCode": "http_error", "error": f"AgentMemory returned HTTP {error.code}. Check the configured endpoint; redirects are not followed."}
    except (URLError, TimeoutError, OSError):
        return {"success": False, "errorCode": "unavailable", "error": "AgentMemory is unavailable. Start the server and check AGENTMEMORY_URL."}
    except (ValueError, UnicodeDecodeError):
        return {"success": False, "errorCode": "invalid_response", "error": "AgentMemory returned an invalid JSON object."}


class AgentMemoryProvider(MemoryProvider):

    @property
    def name(self) -> str:
        return "agentmemory"

    def is_available(self) -> bool:
        try:
            return _validate_url(_configuration()[0])
        except RuntimeError:
            return False

    def unavailable_reason(self) -> str:
        try:
            _configuration()
        except RuntimeError as error:
            return str(error)
        return "Set a valid AGENTMEMORY_URL or run hermes memory setup."

    def initialize(self, session_id: str, **kwargs: Any) -> None:
        if not isinstance(session_id, str) or not session_id.strip():
            raise ValueError("AgentMemory requires a non-empty Hermes session ID.")
        self._hermes_home = _profile_home()
        self._base, secret = _configuration(kwargs.get("hermes_home"))
        self._session_id = session_id.strip()
        self._platform = kwargs.get("platform") or "cli"
        self._local = self._platform in ("cli", "oneshot", "tui", "desktop", "acp")
        self._cwd = kwargs.get("cwd")
        if not self._cwd:
            try:
                from agent.runtime_cwd import scope_terminal_cwd
                self._cwd = scope_terminal_cwd()
            except ImportError:
                pass
        self._cwd = self._cwd or (os.getcwd() if self._local else str(self._hermes_home))
        self._project = _resolve_project(self._cwd)
        self._explicit_agent = (_environment_value("AGENTMEMORY_AGENT_ID") or "").strip()
        if self._explicit_agent == "*" or len(self._explicit_agent) > 128:
            raise ValueError("AGENTMEMORY_AGENT_ID must be at most 128 characters and cannot be a wildcard.")
        author = kwargs.get("user_id")
        self._author = ContextVar("agentmemory_author", default=author.strip() if isinstance(author, str) else "")
        self._writes_enabled = kwargs.get("agent_context", "primary") == "primary"
        self._write_lock = threading.RLock()
        self._sessions: dict[str, str] = {}
        self._ended: set[str] = set()
        self._stopped = False
        self._prefetched: tuple[str, str, str, str] | None = None
        _check_plaintext_bearer_guard(self._base, secret)
        if self._agent_id and self._writes_enabled:
            self._start_session()

    @property
    def _agent_id(self) -> str:
        if self._explicit_agent:
            return self._explicit_agent
        author = self._author.get()
        if not author and not self._local:
            return ""
        identity = [str(self._hermes_home), self._platform if author else "local", author]
        return "hermes-" + hashlib.sha256(json.dumps(identity).encode()).hexdigest()[:32]

    def _scoped_session_id(self, session_id: str | None = None) -> str:
        identity = [str(self._hermes_home), self._agent_id, session_id or self._session_id]
        return "hermes-" + hashlib.sha256(json.dumps(identity).encode()).hexdigest()

    def _session_payload(self, session_id: str | None = None) -> dict:
        return {"sessionId": self._scoped_session_id(session_id), "project": self._project, "cwd": self._cwd, "agentId": self._agent_id}

    def _start_session(self, session_id: str | None = None) -> None:
        raw_id = session_id or self._session_id
        scoped_id = self._scoped_session_id(raw_id)
        if scoped_id in self._sessions and scoped_id not in self._ended:
            return
        result = self._request("session/start", self._session_payload(raw_id))
        session = result.get("session")
        if isinstance(session, dict) and session.get("id") == scoped_id:
            self._sessions[scoped_id] = raw_id
            self._ended.discard(scoped_id)

    def _bound_configuration(self) -> tuple[str, str]:
        base, secret = _configuration(str(self._hermes_home))
        explicit_agent = (_environment_value("AGENTMEMORY_AGENT_ID") or "").strip()
        if base != self._base or explicit_agent != self._explicit_agent:
            raise RuntimeError("AgentMemory endpoint or identity changed. Restart this Hermes session before sending memory requests.")
        if not self._agent_id:
            raise RuntimeError("AgentMemory requires a message author for this gateway turn.")
        return base, secret

    def _request(self, path: str, body: dict) -> dict:
        writing = path in ("remember", "evolve", "observe", "session/start", "session/end")
        if writing:
            self._prefetched = None
        try:
            _, secret = self._bound_configuration()
            if writing and (not self._writes_enabled or self._stopped):
                return {"success": False, "errorCode": "read_only_context", "error": "AgentMemory writes are disabled outside the primary active session."}
            result = _api(self._base, path, body, secret=secret)
        except RuntimeError as error:
            result = {"success": False, "errorCode": "configuration_changed", "error": str(error)}
        if result.get("error"):
            print(f"agentmemory: {result['error']}", file=sys.stderr)
        return result

    def on_turn_start(self, turn_number: int, message: str, **kwargs: Any) -> None:
        author = kwargs.get("author_id")
        self._author.set(author.strip() if isinstance(author, str) else "")
        self._prefetched = None

    def get_config_schema(self) -> list[dict]:
        return [
            {
                "key": "url",
                "description": "agentmemory server URL",
                "default": DEFAULT_BASE_URL,
                "env_var": "AGENTMEMORY_URL",
            },
            {
                "key": "project",
                "description": "Project name (optional; defaults to the active workspace)",
                "required": False,
                "env_var": "AGENTMEMORY_PROJECT_NAME",
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
        saved = {"url": values["url"].rstrip("/")} if isinstance(values.get("url"), str) else {}
        if "url" in saved and not _validate_url(saved["url"]):
            raise ValueError("AgentMemory requires an HTTP or HTTPS URL without credentials, query or fragment.")
        config_path = Path(hermes_home) / "agentmemory.json"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(json.dumps(saved, indent=2))

    def system_prompt_block(self) -> str:
        return "Use memory_recall to retrieve relevant saved context and memory_save to retain durable facts. Memory is scoped to this Hermes profile and author by default."

    def prefetch(self, query: str, **kwargs: Any) -> str:
        session_id = kwargs.get("session_id") or self._session_id
        cached = self._prefetched
        self._prefetched = None
        if cached and cached[:3] == (session_id, self._agent_id, query):
            try:
                self._bound_configuration()
                return cached[3]
            except RuntimeError:
                return ""
        result = self._request("smart-search", {"query": query, "limit": 5, "project": self._project, "agentId": self._agent_id, "includeLessons": False})
        rows = result.get("results", [])
        if not isinstance(rows, list):
            return ""
        ids = []
        for item in rows[:5]:
            if not isinstance(item, dict) or not isinstance(item.get("obsId"), str) or not item["obsId"]:
                continue
            reference = {"obsId": item["obsId"]}
            if isinstance(item.get("sessionId"), str) and item["sessionId"]:
                reference["sessionId"] = item["sessionId"]
            if reference not in ids:
                ids.append(reference)
        if ids:
            expanded = self._request("smart-search", {"expandIds": ids, "project": self._project, "agentId": self._agent_id})
            rows = expanded.get("results", [])
        if not isinstance(rows, list):
            return ""
        lines = []
        for item in rows[:5]:
            if not isinstance(item, dict):
                continue
            obs = item.get("observation")
            if not isinstance(obs, dict):
                continue
            title, narrative = obs.get("title"), obs.get("narrative")
            if isinstance(title, str) and isinstance(narrative, str):
                lines.append(f"- {title[:200]}: {narrative[:1000]}")
        return "\n".join(lines)[:6000]

    def queue_prefetch(self, query: str, **kwargs: Any) -> None:
        session_id = kwargs.get("session_id") or self._session_id
        context = self.prefetch(query, session_id=session_id)
        self._prefetched = (session_id, self._agent_id, query, context)

    def get_tool_schemas(self) -> list[dict]:
        return [
            {
                "name": "memory_recall",
                "description": "Search agentmemory for past observations by keyword",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "project": {"type": "string", "description": "Project scope; defaults to the current project"},
                        "agentId": {"type": "string", "description": "Agent identity filter"},
                        "targetLayer": {"type": "string", "enum": ["all", "memory", "observation"]},
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
                        "concepts": {"type": "string", "description": "Comma-separated concepts"},
                        "files": {"type": "string", "description": "Comma-separated relevant file paths"},
                        "project": {"type": "string", "description": "Project scope; defaults to the current project"},
                        "agentId": {"type": "string", "description": "Agent identity owning the memory"},
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
                        "project": {"type": "string", "description": "Project scope; defaults to the current project"},
                        "agentId": {"type": "string", "description": "Agent identity filter"},
                        "targetLayer": {"type": "string", "enum": ["all", "memory", "observation"]},
                        "limit": {"type": "integer", "default": 5},
                    },
                    "required": ["query"],
                },
            },
        ]

    def handle_tool_call(self, name: str, args: dict, **kwargs: Any) -> str:
        if name not in ("memory_recall", "memory_search", "memory_save"):
            return json.dumps({"success": False, "error": f"Unknown tool: {name}"})
        if not isinstance(args, dict):
            return json.dumps({"success": False, "error": "Tool arguments must be an object."})
        key = "content" if name == "memory_save" else "query"
        if not isinstance(args.get(key), str) or not args[key].strip():
            return json.dumps({"success": False, "error": f"{key} must be a non-empty string."})
        payload = {key: args[key], "project": self._project, "agentId": self._agent_id}
        for field in ("project", "agentId"):
            if field in args:
                if not isinstance(args[field], str) or not args[field].strip():
                    return json.dumps({"success": False, "error": f"{field} must be a non-empty string."})
                payload[field] = args[field].strip()
                if field == "agentId" and (payload[field] == "*" or len(payload[field]) > 128):
                    return json.dumps({"success": False, "error": "agentId must be at most 128 characters and cannot be a wildcard."})
        if name == "memory_save":
            kind = args.get("type", "fact")
            if kind not in ("pattern", "preference", "architecture", "bug", "workflow", "fact"):
                return json.dumps({"success": False, "error": "Invalid memory type."})
            payload["type"] = kind
            for field in ("concepts", "files"):
                value = args.get(field, [])
                if isinstance(value, str):
                    value = value.split(",")
                if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
                    return json.dumps({"success": False, "error": f"{field} must be CSV text or an array of strings."})
                payload[field] = list(dict.fromkeys(item.strip() for item in value if item.strip()))
            path = "remember"
        else:
            limit = args.get("limit", 10 if name == "memory_recall" else 5)
            if type(limit) is not int or not 1 <= limit <= 100:
                return json.dumps({"success": False, "error": "limit must be an integer between 1 and 100."})
            payload["limit"] = limit
            if "targetLayer" in args:
                if args["targetLayer"] not in ("all", "memory", "observation"):
                    return json.dumps({"success": False, "error": "Invalid targetLayer."})
                payload["targetLayer"] = args["targetLayer"]
            payload["includeLessons"] = False
            path = "search" if name == "memory_recall" else "smart-search"
        return json.dumps(self._request(path, payload))

    def sync_turn(self, user: str, assistant: str, **kwargs: Any) -> None:
        # Hermes owns the serialized background worker and its context propagation.
        with self._write_lock:
            if self._stopped or not self._writes_enabled:
                return
            author = kwargs.get("turn_author")
            token = None
            if isinstance(author, dict):
                author_id = author.get("id")
                token = self._author.set(author_id.strip() if isinstance(author_id, str) else "")
            try:
                raw_id = kwargs.get("session_id") or self._session_id
                self._start_session(raw_id)
                self._request("observe", {
                    **self._session_payload(raw_id),
                    "hookType": "post_tool_use",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "data": {"tool_name": "conversation", "tool_input": user[:500], "tool_output": assistant[:2000]},
                })
            finally:
                if token is not None:
                    self._author.reset(token)

    def on_session_end(self, messages: list, **kwargs: Any) -> None:
        with self._write_lock:
            raw_id = kwargs.get("session_id") or self._session_id
            for scoped_id, session_id in list(self._sessions.items()):
                if session_id != raw_id or scoped_id in self._ended:
                    continue
                result = self._request("session/end", {"sessionId": scoped_id})
                if result.get("success"):
                    self._ended.add(scoped_id)

    def on_session_switch(self, new_session_id: str, **kwargs: Any) -> None:
        with self._write_lock:
            self._prefetched = None
            if not isinstance(new_session_id, str) or not new_session_id.strip() or new_session_id.strip() == self._session_id:
                return
            self.on_session_end([])
            self._session_id = new_session_id.strip()
            if kwargs.get("cwd"):
                self._cwd = kwargs["cwd"]
                self._project = _resolve_project(self._cwd)
            if self._agent_id and self._writes_enabled:
                self._start_session()

    def on_pre_compress(self, messages: list, **kwargs: Any) -> str:
        query = " ".join(message["content"] for message in messages[-5:] if isinstance(message, dict) and isinstance(message.get("content"), str))
        return self.prefetch(query[-2000:], **kwargs) if query.strip() else ""

    def _mirror_key(self, target: str, content: str) -> str:
        scope = [self._base, self._project, self._agent_id, str(self._hermes_home), target, content]
        return hashlib.sha256(json.dumps(scope).encode()).hexdigest()

    def _write_mirrors(self, path: Path, records: dict[str, str]) -> None:
        fd, temporary = tempfile.mkstemp(prefix=".agentmemory-mirrors-", dir=path.parent)
        try:
            with os.fdopen(fd, "w") as handle:
                json.dump(records, handle)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def on_memory_write(self, action: str, target: str, content: str, metadata: dict | None = None, **kwargs: Any) -> None:
        if action not in ("add", "update", "replace") or not isinstance(content, str) or not content.strip():
            return
        if self._stopped or not self._writes_enabled:
            return
        # Only IDs returned by this provider may be cleaned up after native replacement.
        try:
            self._bound_configuration()
            import fcntl
            self._hermes_home.mkdir(parents=True, exist_ok=True)
            path = self._hermes_home / "agentmemory-mirrors.json"
            with self._write_lock, (self._hermes_home / "agentmemory-mirrors.lock").open("a") as lock:
                if self._stopped or not self._writes_enabled:
                    return
                deadline = time.monotonic() + TIMEOUT
                while True:
                    try:
                        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        break
                    except BlockingIOError:
                        if time.monotonic() >= deadline:
                            raise TimeoutError("native mirror lock deadline reached")
                        time.sleep(0.01)
                try:
                    try:
                        records = json.loads(path.read_text())
                    except FileNotFoundError:
                        records = {}
                    if not isinstance(records, dict) or not all(isinstance(key, str) and isinstance(value, str) for key, value in records.items()):
                        raise ValueError("invalid native mirror ownership file")
                    previous = (metadata or {}).get("previous_content")
                    old_key = self._mirror_key(target, previous) if isinstance(previous, str) and previous else None
                    old_id = records.get(old_key) if old_key else None
                    replacing = action in ("replace", "update")
                    if replacing and old_id:
                        if previous == content:
                            return
                        result = self._request("evolve", {"memoryId": old_id, "newContent": content})
                        if not result.get("success"):
                            print("agentmemory: native replacement could not evolve its previous record; inspect the reported error before retrying.", file=sys.stderr)
                            return
                    else:
                        result = self._request("remember", {"content": content, "type": "fact", "project": self._project, "agentId": self._agent_id})
                    memory = result.get("memory", {})
                    if not result.get("success") or not isinstance(memory, dict):
                        return
                    new_id = memory.get("id")
                    if not isinstance(new_id, str) or not new_id.startswith("mem_") or memory.get("content") != content or memory.get("project") != self._project or memory.get("agentId") != self._agent_id:
                        print("agentmemory: native mirror write did not establish record ownership; replacement tracking was not updated.", file=sys.stderr)
                        return
                    new_key = self._mirror_key(target, content)
                    records[new_key] = new_id
                    if replacing and old_key and old_key != new_key and old_id:
                        records.pop(old_key, None)
                    self._write_mirrors(path, records)
                    if replacing and not old_id:
                        print("agentmemory: native replacement saved; previous record ownership is unavailable, so the previous record could not be superseded.", file=sys.stderr)
                finally:
                    fcntl.flock(lock, fcntl.LOCK_UN)
        except (ImportError, OSError, ValueError, RuntimeError) as error:
            print(f"agentmemory: native memory mirroring could not complete ({type(error).__name__}); check the active Hermes home and retry.", file=sys.stderr)

    def shutdown(self, **kwargs: Any) -> None:
        self._stopped = True
        if self._write_lock.acquire(timeout=TIMEOUT):
            self._write_lock.release()
        else:
            print("agentmemory: shutdown deadline reached while a write is still pending.", file=sys.stderr)


def register(ctx: Any) -> None:
    ctx.register_memory_provider(AgentMemoryProvider())
