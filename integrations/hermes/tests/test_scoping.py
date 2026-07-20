"""Unit tests for agentmemory Hermes plugin scoping helpers (stdlib unittest)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scoping import (
    load_work_roots,
    pick_workdir,
    profile_from_hermes_home,
    pwd_home,
    repo_slug_from_workdir,
    resolve_agent_id,
    resolve_project,
    sanitize_slug,
)


class TestSanitizeSlug(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(sanitize_slug("Software-Engineer"), "software-engineer")

    def test_underscore_to_hyphen(self):
        self.assertEqual(sanitize_slug("trade_house"), "trade-house")

    def test_collapse_hyphens(self):
        self.assertEqual(sanitize_slug("a__b"), "a-b")

    def test_reject_path(self):
        self.assertIsNone(sanitize_slug("/evil/path"))
        self.assertIsNone(sanitize_slug("foo/bar"))

    def test_reject_junk(self):
        self.assertIsNone(sanitize_slug("BAD slug!!"))
        self.assertIsNone(sanitize_slug(""))
        self.assertIsNone(sanitize_slug(None))
        self.assertIsNone(sanitize_slug("."))

    def test_host(self):
        self.assertEqual(sanitize_slug("host"), "host")


class TestProfileAndRoots(unittest.TestCase):
    def test_profile_segment(self):
        with tempfile.TemporaryDirectory() as td:
            hh = Path(td) / "profiles" / "server-manager"
            hh.mkdir(parents=True)
            self.assertEqual(profile_from_hermes_home(str(hh)), "server-manager")

    def test_auto_detect_code(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            code = home / "code"
            code.mkdir()
            roots = load_work_roots(env={}, home=home)
            self.assertIn(code.resolve(), roots)

    def test_auto_detect_via_real_home_env(self):
        """Skewed HOME still finds ~/code under HERMES_REAL_HOME."""
        with tempfile.TemporaryDirectory() as td:
            real = Path(td) / "real"
            skewed = Path(td) / "skewed"
            real.mkdir()
            skewed.mkdir()
            code = real / "code"
            code.mkdir()
            roots = load_work_roots(
                env={"HOME": str(skewed), "HERMES_REAL_HOME": str(real)},
                home=None,
            )
            self.assertIn(code.resolve(), roots)

    def test_env_roots_authoritative(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            code = home / "code"
            code.mkdir()
            other = home / "other"
            other.mkdir()
            (other / "r1").mkdir()
            roots = load_work_roots(
                env={"AGENTMEMORY_WORK_ROOTS": str(other)},
                home=home,
            )
            self.assertEqual(roots, (other.resolve(),))
            self.assertEqual(
                repo_slug_from_workdir(str(other / "r1"), work_roots=roots),
                "r1",
            )
            self.assertIsNone(
                repo_slug_from_workdir(str(code / "foo"), work_roots=roots)
            )

    def test_repo_under_code(self):
        with tempfile.TemporaryDirectory() as td:
            code = Path(td) / "code"
            repo = code / "trade-house" / "app"
            repo.mkdir(parents=True)
            roots = (code.resolve(),)
            self.assertEqual(
                repo_slug_from_workdir(str(repo), work_roots=roots),
                "trade-house",
            )

    def test_exact_work_root_no_repo(self):
        with tempfile.TemporaryDirectory() as td:
            code = Path(td) / "code"
            code.mkdir()
            roots = (code.resolve(),)
            self.assertIsNone(repo_slug_from_workdir(str(code), work_roots=roots))


class TestResolve(unittest.TestCase):
    def test_profile_when_workdir_is_code_root(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            code = home / "code"
            code.mkdir()
            hh = home / "profiles" / "software-engineer"
            hh.mkdir(parents=True)
            roots = (code.resolve(),)
            self.assertEqual(
                resolve_project(
                    workdir=str(code),
                    agent_identity="software-engineer",
                    hermes_home=str(hh),
                    work_roots=roots,
                ),
                "software-engineer",
            )
            self.assertEqual(
                resolve_agent_id(
                    agent_identity="software-engineer", hermes_home=str(hh)
                ),
                "software-engineer",
            )

    def test_repo_wins(self):
        with tempfile.TemporaryDirectory() as td:
            code = Path(td) / "code"
            repo = code / "trade-house"
            repo.mkdir(parents=True)
            roots = (code.resolve(),)
            self.assertEqual(
                resolve_project(
                    workdir=str(repo),
                    agent_identity="software-engineer",
                    work_roots=roots,
                ),
                "trade-house",
            )

    def test_explicit_host(self):
        self.assertEqual(
            resolve_project(explicit="host", agent_identity="software-engineer"),
            "host",
        )

    def test_explicit_path_falls_back(self):
        self.assertEqual(
            resolve_project(
                explicit="/evil/path", agent_identity="software-engineer"
            ),
            "software-engineer",
        )

    def test_hermes_home_only(self):
        with tempfile.TemporaryDirectory() as td:
            hh = Path(td) / "profiles" / "server-manager"
            hh.mkdir(parents=True)
            self.assertEqual(resolve_agent_id(hermes_home=str(hh)), "server-manager")
            self.assertEqual(resolve_project(hermes_home=str(hh)), "server-manager")

    def test_default(self):
        self.assertEqual(resolve_agent_id(), "default")
        self.assertEqual(resolve_project(), "default")

    def test_pick_workdir_prefers_terminal_cwd(self):
        with tempfile.TemporaryDirectory() as td:
            code = Path(td) / "code"
            code.mkdir()
            wd = pick_workdir(
                kwargs_cwd=None,
                env={"TERMINAL_CWD": str(code / "x")},
                work_roots=(code.resolve(),),
                getcwd=str(td),
            )
            self.assertEqual(wd, str(code / "x"))

    def test_pick_workdir_ignores_home_getcwd(self):
        with tempfile.TemporaryDirectory() as td:
            code = Path(td) / "code"
            code.mkdir()
            wd = pick_workdir(
                env={},
                work_roots=(code.resolve(),),
                getcwd=str(td),
            )
            self.assertIsNone(wd)


class TestPwdHome(unittest.TestCase):
    def test_pwd_home_returns_str_or_none(self):
        home = pwd_home()
        self.assertTrue(home is None or (isinstance(home, str) and home.strip()))


if __name__ == "__main__":
    unittest.main()
