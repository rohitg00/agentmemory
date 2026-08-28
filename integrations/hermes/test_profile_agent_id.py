import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).with_name("__init__.py")
SPEC = importlib.util.spec_from_file_location("agentmemory_hermes_provider", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HermesProfileAgentIdTests(unittest.TestCase):
    def test_named_profile_is_sent_on_every_plugin_request(self):
        calls: list[tuple[str, dict]] = []

        def record(_base, path, body=None, method="POST", secret=""):
            calls.append((path, dict(body or {})))
            if path in {"search", "smart-search"}:
                return {"results": []}
            if path == "context":
                return {"context": ""}
            if path == "remember":
                return {"success": True}
            return {}

        def record_bg(_base, path, body=None):
            return record(_base, path, body)

        provider = MODULE.AgentMemoryProvider()
        profile_home = Path("/opt/data/profiles/alpha")

        with patch.dict(os.environ, {"AGENTMEMORY_AGENT_SCOPE": "isolated"}, clear=False), patch.object(
            MODULE, "_api", record
        ), patch.object(MODULE, "_api_bg", record_bg):
            provider.initialize(
                "session-1",
                hermes_home=str(profile_home),
                cwd="/workspace/ALPHA-SelfService",
            )
            provider.system_prompt_block()
            provider.prefetch("architecture")
            provider.queue_prefetch("architecture")
            provider.handle_tool_call("memory_recall", {"query": "architecture"})
            provider.handle_tool_call("memory_save", {"content": "profile marker"})
            provider.handle_tool_call("memory_search", {"query": "marker"})
            provider.sync_turn("user", "assistant", session_id="session-1")
            provider.on_session_end([], session_id="session-1")
            provider.on_pre_compress([], session_id="session-1")
            provider.on_memory_write("add", "memory", "mirrored marker")

        self.assertGreaterEqual(len(calls), 10)
        missing = [path for path, body in calls if body.get("agentId") != "alpha"]
        self.assertEqual(missing, [], json.dumps(calls, indent=2))

    def test_default_home_uses_default_profile_id(self):
        self.assertEqual(MODULE._profile_agent_id("/opt/data"), "default")
        self.assertEqual(
            MODULE._profile_agent_id("/opt/data/profiles/pentester"),
            "pentester",
        )
        self.assertEqual(
            MODULE._profile_agent_id("/opt/data/profiles/Not A Profile"),
            "default",
        )

    def test_ambient_hermes_home_is_not_an_identity_source(self):
        calls: list[tuple[str, dict]] = []

        def record(_base, path, body=None, method="POST", secret=""):
            calls.append((path, dict(body or {})))
            return {}

        provider = MODULE.AgentMemoryProvider()
        with patch.dict(
            os.environ,
            {
                "HERMES_HOME": "/opt/data/profiles/from_env",
                "AGENTMEMORY_AGENT_SCOPE": "isolated",
            },
            clear=False,
        ), patch.object(MODULE, "_api", record):
            provider.initialize("session-ambient", cwd="/workspace/project")

        session_start = next(body for path, body in calls if path == "session/start")
        self.assertEqual(session_start["agentId"], "default")

    def test_shared_mode_tags_writes_without_filtering_reads(self):
        calls: list[tuple[str, dict]] = []

        def record(_base, path, body=None, method="POST", secret=""):
            calls.append((path, dict(body or {})))
            return {"results": []} if path == "smart-search" else {"success": True}

        provider = MODULE.AgentMemoryProvider()
        with patch.dict(os.environ, {"AGENTMEMORY_AGENT_SCOPE": "shared"}, clear=False), patch.object(
            MODULE, "_api", record
        ):
            provider.initialize(
                "session-1",
                hermes_home="/opt/data/profiles/alpha",
                cwd="/workspace/ALPHA-SelfService",
            )
            provider.prefetch("architecture")
            provider.handle_tool_call("memory_save", {"content": "profile marker"})

        by_path = {path: body for path, body in calls}
        self.assertNotIn("agentId", by_path["smart-search"])
        self.assertEqual(by_path["remember"]["agentId"], "alpha")


if __name__ == "__main__":
    unittest.main()
