"""Deterministic agentId / project slug resolution for the Hermes agentmemory plugin.

Pure helpers — no Hermes imports, no network. Safe to unit-test and to upstream
into rohitg00/agentmemory integrations/hermes.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Sequence

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")

# Candidate work roots when AGENTMEMORY_WORK_ROOTS is unset. Included only if
# the path exists as a directory after expanduser/resolve.
_AUTO_WORK_ROOT_NAMES = (
    "code",
    "projects",
    "src",
    "work",
    "Developer",  # common macOS layout
    "Repos",
)


def pwd_home() -> str | None:
    """Passwd home for the current uid, or None if unavailable.

    Narrow exceptions: missing ``pwd`` (non-Unix), unknown uid, or broken
    pwd entry attributes — not a blanket ``Exception``.
    """
    try:
        import pwd

        home = pwd.getpwuid(os.getuid()).pw_dir
    except (ImportError, KeyError, AttributeError, OSError, TypeError):
        return None
    if isinstance(home, str) and home.strip():
        return home
    return None


def sanitize_slug(value: str | None) -> str | None:
    """Normalize and validate a project/agentId slug.

    - lower/strip
    - reject path-like values (/, \\, . , ..)
    - map _ → - then collapse repeated hyphens
    - accept only ^[a-z0-9][a-z0-9-]{0,63}$
    """
    if value is None or not isinstance(value, str):
        return None
    s = value.strip().lower()
    if not s or s in {".", ".."}:
        return None
    if "/" in s or "\\" in s or "\x00" in s:
        return None
    s = s.replace("_", "-")
    while "--" in s:
        s = s.replace("--", "-")
    s = s.strip("-")
    if not s or not _SLUG_RE.match(s):
        return None
    return s


def profile_from_hermes_home(hermes_home: str | None) -> str | None:
    """Extract .../profiles/<name> segment as a slug, if present."""
    if not hermes_home or not isinstance(hermes_home, str):
        return None
    try:
        parts = Path(hermes_home).expanduser().resolve().parts
    except (OSError, RuntimeError):
        try:
            parts = Path(hermes_home).expanduser().parts
        except (OSError, RuntimeError):
            return None
    if "profiles" not in parts:
        return None
    i = parts.index("profiles")
    if i + 1 >= len(parts):
        return None
    return sanitize_slug(parts[i + 1])


def _resolve_existing_dir(raw: str) -> Path | None:
    try:
        p = Path(raw).expanduser().resolve()
    except (OSError, RuntimeError):
        return None
    if p.is_dir():
        return p
    return None


def _candidate_homes(
    env: dict[str, str] | None = None,
    *,
    home: str | Path | None = None,
) -> list[Path]:
    """Homes to scan for auto work roots.

    Hermes profile sessions often set HOME to profiles/<name>/home while the
    real user home (with ~/code) lives elsewhere — mirror dotenv preload.
    """
    e = env if env is not None else os.environ
    out: list[Path] = []
    seen: set[str] = set()

    def add(raw: str | Path | None) -> None:
        if raw is None:
            return
        try:
            p = Path(raw).expanduser()
            p = p.resolve()
        except (OSError, RuntimeError):
            try:
                p = Path(str(raw)).expanduser()
            except (OSError, RuntimeError):
                return
        key = str(p)
        if key in seen:
            return
        seen.add(key)
        out.append(p)

    if home is not None:
        add(home)
    add(e.get("HERMES_REAL_HOME"))
    add(e.get("HOME"))
    add(pwd_home())
    try:
        add(Path.home())
    except (OSError, RuntimeError):
        pass
    return out


def load_work_roots(
    env: dict[str, str] | None = None,
    *,
    home: str | Path | None = None,
) -> tuple[Path, ...]:
    """Return trusted work roots for repo-slug detection.

    If AGENTMEMORY_WORK_ROOTS is set (colon-separated on Unix), that list is
    **authoritative** (only existing dirs kept). Otherwise auto-detect common
    directories under real user home(s) that exist.
    """
    e = env if env is not None else os.environ
    explicit = (e.get("AGENTMEMORY_WORK_ROOTS") or "").strip()
    if explicit:
        roots: list[Path] = []
        seen: set[str] = set()
        for seg in explicit.split(":"):
            seg = seg.strip()
            if not seg:
                continue
            p = _resolve_existing_dir(seg)
            if p is None:
                continue
            key = str(p)
            if key in seen:
                continue
            seen.add(key)
            roots.append(p)
        return tuple(roots)

    roots = []
    seen_r: set[str] = set()
    for home_p in _candidate_homes(e, home=home):
        for name in _AUTO_WORK_ROOT_NAMES:
            p = _resolve_existing_dir(str(home_p / name))
            if p is None:
                continue
            key = str(p)
            if key in seen_r:
                continue
            seen_r.add(key)
            roots.append(p)
    return tuple(roots)


def repo_slug_from_workdir(
    workdir: str | None,
    work_roots: Sequence[Path] | None = None,
    *,
    env: dict[str, str] | None = None,
    home: str | Path | None = None,
) -> str | None:
    """If workdir is under <root>/<repo>/..., return sanitized <repo>.

    If workdir equals a work root exactly, return None (not project=code).
    """
    if not workdir:
        return None
    roots = list(work_roots) if work_roots is not None else list(
        load_work_roots(env=env, home=home)
    )
    if not roots:
        return None
    try:
        wd = Path(workdir).expanduser().resolve()
    except (OSError, RuntimeError):
        return None

    roots_sorted = sorted(roots, key=lambda p: len(str(p)), reverse=True)
    for root in roots_sorted:
        try:
            rel = wd.relative_to(root)
        except ValueError:
            continue
        if rel == Path(".") or not rel.parts:
            return None
        return sanitize_slug(rel.parts[0])
    return None


def pick_workdir(
    *,
    kwargs_cwd: str | None = None,
    env: dict[str, str] | None = None,
    work_roots: Sequence[Path] | None = None,
    home: str | Path | None = None,
    getcwd: str | None = None,
) -> str | None:
    """Choose a filesystem workdir for repo detection (not necessarily project slug)."""
    e = env if env is not None else os.environ
    roots = list(work_roots) if work_roots is not None else list(
        load_work_roots(env=e, home=home)
    )

    for c in (kwargs_cwd, e.get("TERMINAL_CWD"), e.get("AGENTMEMORY_WORKDIR")):
        if c and str(c).strip():
            return str(c).strip()

    gc = getcwd
    if gc is None:
        try:
            gc = os.getcwd()
        except OSError:
            gc = None
    if not gc:
        return None

    if repo_slug_from_workdir(gc, work_roots=roots, env=e, home=home) is not None:
        return gc
    try:
        gcp = Path(gc).expanduser().resolve()
        for root in roots:
            if gcp == root:
                return gc
    except (OSError, RuntimeError):
        pass
    return None


def resolve_agent_id(
    *,
    agent_identity: str | None = None,
    hermes_home: str | None = None,
    env_agent_id: str | None = None,
) -> str:
    """Hermes profile name as agentId; default 'default'."""
    for cand in (env_agent_id, agent_identity):
        s = sanitize_slug(cand)
        if s:
            return s
    p = profile_from_hermes_home(hermes_home)
    if p:
        return p
    return "default"


def resolve_project(
    *,
    explicit: str | None = None,
    workdir: str | None = None,
    agent_identity: str | None = None,
    hermes_home: str | None = None,
    env_project: str | None = None,
    env_agent_id: str | None = None,
    work_roots: Sequence[Path] | None = None,
    env: dict[str, str] | None = None,
    home: str | Path | None = None,
) -> str:
    """explicit → env project → repo under work roots → profile agentId."""
    for cand in (explicit, env_project):
        s = sanitize_slug(cand)
        if s:
            return s
    repo = repo_slug_from_workdir(
        workdir, work_roots=work_roots, env=env, home=home
    )
    if repo:
        return repo
    return resolve_agent_id(
        agent_identity=agent_identity,
        hermes_home=hermes_home,
        env_agent_id=env_agent_id,
    )
