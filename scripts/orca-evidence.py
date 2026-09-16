#!/usr/bin/env python3
"""Capture the GUI evidence the OrcaRouter integration's PR needs.

This is a *generator*, not a fixture: it boots the real agentmemory worker
(`node dist/cli.mjs`), drives the real viewer SPA in Chromium, reads every
assertion back out of the live DOM, and writes `orca-evidence/` — which is
gitignored, because evidence must be produced by the verification run and never
shipped inside the patch.

Usage (from the repository root):

    ORCAROUTER_API_KEY=sk-orca-... python3 scripts/orca-evidence.py

The key is only used the way a user's key is used: the worker puts it behind
`/agentmemory/orcarouter/status` and the live `GET /v1/models` discovery path,
and the viewer renders it masked. Nothing here prints it.

Before the browser opens, the run also performs the authoritative chat catalog
request itself — an authenticated `GET <apiBase>/v1/models?capability=chat` on
the worker's own configured API origin — and requires every model the chat
selector rendered to come back from that response. That is what makes
`automation.catalog_source` a checked fact rather than a hard-coded string.

Environment:
    ORCAROUTER_API_KEY        required; without it the catalog is a fallback list
                              and the run is not evidence, so we exit early.
    ORCA_EVIDENCE_CHROMIUM    path to the browser binary (default /usr/bin/chromium)
    ORCA_EVIDENCE_OUT         output directory (default <repo>/orca-evidence)
    ORCA_EVIDENCE_SKIP_BUILD  set to 1 to reuse an existing dist/
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("ORCA_EVIDENCE_OUT", ROOT / "orca-evidence"))
CHROMIUM = os.environ.get("ORCA_EVIDENCE_CHROMIUM", "/usr/bin/chromium")
# The authoritative chat catalog: the same `GET /v1/models` the provider code
# reads, narrowed to the capability the chat selector needs. `main()` fetches
# this exact URL on the API origin the running worker resolved and records what
# it actually hit in `automation.catalog_url_fetched`.
CATALOG_SOURCE = "https://api.orcarouter.ai/v1/models?capability=chat"
CHAT_CATALOG_PATH = "/v1/models"
CHAT_CATALOG_QUERY = "capability=chat"
VIEWPORT = {"width": 1280, "height": 900}

results = {}


def log(message: str) -> None:
    print(f"[orca-evidence] {message}", flush=True)


def pick_ports() -> tuple[int, int, int]:
    """A free REST / streams / viewer port triplet.

    The engine port is derived from the REST port as `rest + 46023` and the
    engine parses it as a u16, so the REST anchor has to stay low enough that
    the whole quartet fits. The OS-assigned ephemeral range does not, which is
    why this walks a fixed low range instead of asking the kernel.
    """
    for rest in range(3111, 19000):
        ports = (rest, rest + 1, rest + 2, rest + 46023)
        sockets = []
        try:
            for port in ports:
                sock = socket.socket()
                sock.bind(("127.0.0.1", port))
                sockets.append(sock)
        except OSError:
            continue
        finally:
            for sock in sockets:
                sock.close()
        if len(sockets) == len(ports):
            return rest, rest + 1, rest + 2
    raise RuntimeError("no free port quartet below 65536")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def http_status(url: str, token: str | None = None, timeout: float = 2.0):
    request = urllib.request.Request(url)
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()
    except Exception:
        return None, b""


def wait_for(url: str, token: str | None, deadline: float) -> bytes | None:
    while time.time() < deadline:
        status, body = http_status(url, token)
        if status == 200:
            return body
        time.sleep(0.5)
    return None


def fetch_chat_catalog(api_base_url: str, api_key: str) -> tuple[str, list[str]]:
    """Fetch the authoritative chat catalog the way the provider does.

    Uses the API origin the running worker resolved (so an explicit
    `ORCA_API_BASE_URL` override is honoured) and the user's own key, exactly
    like `src/orcarouter/catalog.ts`. Returns `(url, sorted model ids)`.
    """
    url = f"{api_base_url.rstrip('/')}{CHAT_CATALOG_PATH}?{CHAT_CATALOG_QUERY}"
    request = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = json.loads(response.read())
    records = body.get("data") if isinstance(body, dict) else body
    if not isinstance(records, list):
        raise RuntimeError("the chat catalog response carried no model list")
    ids = [r["id"] for r in records if isinstance(r, dict) and isinstance(r.get("id"), str)]
    if not ids:
        raise RuntimeError("the chat catalog response listed no usable models")
    return url, sorted(ids)


def build() -> None:
    if os.environ.get("ORCA_EVIDENCE_SKIP_BUILD") == "1" and (ROOT / "dist" / "cli.mjs").exists():
        log("reusing existing dist/ (ORCA_EVIDENCE_SKIP_BUILD=1)")
        return
    log("building the worker (npm run build)")
    subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True)


class Worker:
    """The real agentmemory worker, in a throwaway HOME so no developer state
    and no credential is left behind."""

    def __init__(self, secret: str, rest_port: int, streams_port: int, viewer_port: int):
        self.secret = secret
        self.rest_port = rest_port
        self.streams_port = streams_port
        self.viewer_port = viewer_port
        self.home = Path(tempfile.mkdtemp(prefix="agentmemory-orca-evidence-"))
        self.log_path = self.home / "worker.log"
        self.proc: subprocess.Popen | None = None

    @property
    def viewer_url(self) -> str:
        return f"http://127.0.0.1:{self.viewer_port}/"

    @property
    def rest_url(self) -> str:
        return f"http://127.0.0.1:{self.rest_port}/agentmemory"

    def start(self, timeout: float = 300.0) -> None:
        env = dict(os.environ)
        env.update(
            {
                "HOME": str(self.home),
                "USERPROFILE": str(self.home),
                "AGENTMEMORY_SECRET": self.secret,
                "III_REST_PORT": str(self.rest_port),
                "III_VIEWER_PORT": str(self.viewer_port),
                "III_STREAM_PORT": str(self.streams_port),
                "AGENTMEMORY_AUTO_COMPRESS": "false",
                "CONSOLIDATION_ENABLED": "false",
                "AUTO_FORGET_ENABLED": "false",
                "LESSON_DECAY_ENABLED": "false",
            }
        )
        handle = self.log_path.open("wb")
        self.proc = subprocess.Popen(
            ["node", "dist/cli.mjs", "--verbose"],
            cwd=ROOT,
            env=env,
            stdout=handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        deadline = time.time() + timeout
        if wait_for(self.viewer_url, None, deadline) is None:
            raise RuntimeError(
                "the viewer never came up; worker log tail:\n" + self.tail()
            )
        body = wait_for(f"{self.rest_url}/orcarouter/status", self.secret, deadline)
        if body is None:
            raise RuntimeError(
                "the REST API never answered /orcarouter/status; worker log tail:\n"
                + self.tail()
            )
        status = json.loads(body)
        if not status.get("configured"):
            raise RuntimeError(
                "the worker started without an OrcaRouter credential, so the "
                "settings screen would only show the unconfigured state — not "
                "evidence. Set ORCAROUTER_API_KEY."
            )
        log(
            f"worker up: viewer {self.viewer_url} · rest :{self.rest_port} · "
            f"provider credential {status.get('keyMasked')} "
            f"({status.get('origin')})"
        )

    def tail(self, lines: int = 40) -> str:
        try:
            return "\n".join(
                self.log_path.read_text(errors="replace").splitlines()[-lines:]
            )
        except Exception:
            return "(no log)"

    def stop(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            try:
                os.killpg(os.getpgid(self.proc.pid), signal.SIGTERM)
                self.proc.wait(timeout=25)
            except Exception:
                try:
                    os.killpg(os.getpgid(self.proc.pid), signal.SIGKILL)
                except Exception:
                    pass
        # The throwaway HOME holds the credential the worker was handed, so it
        # is deleted rather than archived.
        shutil.rmtree(self.home, ignore_errors=True)


def geometry(page, capability):
    """Measure the open listbox against its trigger, in CSS pixels."""
    return page.evaluate(
        """(cap) => {
            const trigger = document.getElementById('orca-trigger-' + cap);
            const panel = document.getElementById('orca-panel-' + cap);
            const list = document.getElementById('orca-list-' + cap);
            if (!trigger || !panel) return null;
            const t = trigger.getBoundingClientRect();
            const p = panel.getBoundingClientRect();
            const cs = getComputedStyle(panel);
            const items = list ? list.querySelectorAll('.orca-combo-option') : [];
            const options = [];
            let visibleItems = 0;
            for (const it of items) {
                options.push(it.getAttribute('data-value'));
                const r = it.getBoundingClientRect();
                // An option the screenshot cannot show is not evidence.
                if (r.top >= 0 && r.bottom <= window.innerHeight &&
                    r.height > 0 && r.width > 0) visibleItems++;
            }
            return {
                open: !panel.hidden && trigger.getAttribute('aria-expanded') === 'true',
                itemCount: items.length,
                visibleItems: visibleItems,
                options: options,
                background: cs.backgroundColor,
                backgroundOpaque: !/rgba\\(.*,\\s*0(\\.0+)?\\)$/.test(cs.backgroundColor),
                borderWidth: cs.borderTopWidth + ' ' + cs.borderRightWidth + ' ' +
                             cs.borderBottomWidth + ' ' + cs.borderLeftWidth,
                borderStyle: cs.borderTopStyle,
                panelRightDelta: Math.abs(t.right - p.right),
                panelWidth: p.width,
                triggerWidth: t.width,
                panelHeight: p.height,
            };
        }""",
        capability,
    )


def frame_trigger(page, capability, target_y=300):
    """Scroll the settings view so the trigger sits at a fixed offset, leaving
    room for the listbox below it. The settings panel is its own scroll
    container (`.view { overflow-y: auto }`), so scrolling `window` does
    nothing — without this the panel opens under the fold and the screenshot
    shows an empty strip instead of the options."""
    page.evaluate(
        """([cap, y]) => {
            const el = document.getElementById('orca-trigger-' + cap);
            const scroller = el.closest('.view');
            if (!scroller) return;
            const top = el.getBoundingClientRect().top -
                        scroller.getBoundingClientRect().top + scroller.scrollTop;
            scroller.scrollTop = Math.max(0, top - y);
        }""",
        [capability, target_y],
    )
    page.wait_for_timeout(250)


def open_combo(page, capability):
    """Open one listbox, with the other panels closed first."""
    if page.get_attribute(f"#orca-trigger-{capability}", "aria-expanded") != "true":
        page.click(f"#orca-trigger-{capability}")
    page.wait_for_selector(f"#orca-list-{capability} .orca-combo-option", timeout=30_000)
    page.wait_for_timeout(250)


def close_combo(page, capability):
    if page.get_attribute(f"#orca-trigger-{capability}", "aria-expanded") == "true":
        page.click(f"#orca-trigger-{capability}")
        page.wait_for_timeout(150)


def capture(worker: Worker) -> None:
    from playwright.sync_api import sync_playwright

    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=CHROMIUM,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=1,
        )
        context.add_init_script(
            "try { sessionStorage.setItem('agentmemory-viewer-token', '%s'); }"
            " catch (e) {}" % worker.secret
        )
        page = context.new_page()
        page.goto(worker.viewer_url, wait_until="domcontentloaded")

        # --- Settings tab -----------------------------------------------------
        page.click('button[data-tab="settings"]')
        page.wait_for_selector("#orca-api-key", timeout=30_000)
        page.wait_for_selector("#orca-connect", timeout=30_000)
        # Wait for the model catalogs to arrive so the shot is not a loading state.
        page.wait_for_function(
            """() => {
                const m = document.getElementById('orca-meta-chat');
                return m && /models\\s*·/.test(m.textContent || '');
            }""",
            timeout=60_000,
        )
        page.wait_for_timeout(500)

        # --- assert: both auth entries visible, key masked, controls enabled --
        auth = page.evaluate(
            """() => {
                const keyPanel = document.querySelector('[data-orca-method="api-key"]');
                const pkcePanel = document.querySelector('[data-orca-method="pkce"]');
                const keyInput = document.getElementById('orca-api-key');
                const saveBtn = document.getElementById('orca-save-key');
                const connectBtn = document.getElementById('orca-connect');
                const statusEl = document.querySelector('.orca-status-line');
                const body = document.body.innerText;
                const keyRects = [keyInput, saveBtn, connectBtn].map((e) => {
                    const r = e.getBoundingClientRect();
                    return { w: r.width, h: r.height, x: r.x, y: r.y };
                });
                const kp = keyPanel.getBoundingClientRect();
                const pp = pkcePanel.getBoundingClientRect();
                return {
                    apiKeyVisible: !!keyPanel && kp.width > 0 && kp.height > 0,
                    pkceVisible: !!pkcePanel && pp.width > 0 && pp.height > 0,
                    sideBySide: kp.x + kp.width <= pp.x + 2,
                    apiKeyLabelVisible: !!keyPanel &&
                        /OrcaRouter\\s*-\\s*API/.test(keyPanel.textContent || ''),
                    pkceLabelVisible: !!pkcePanel &&
                        /OrcaRouter\\s*-\\s*Auth/.test(pkcePanel.textContent || ''),
                    connectLabelVisible: !!pkcePanel &&
                        /Connect with OrcaRouter/.test(pkcePanel.textContent || ''),
                    apiKeyInputType: keyInput.type,
                    secretMasked: /sk-orca\\u2026/.test(statusEl ? statusEl.textContent : ''),
                    ready: /Ready/.test(statusEl ? statusEl.textContent : ''),
                    controlsEnabled: !saveBtn.disabled && !connectBtn.disabled,
                    controlBoxes: keyRects,
                    fullKeyAbsent: !/sk-orca-[A-Za-z0-9]{10,}/.test(body),
                    logoLoaded: [...document.querySelectorAll('.orca-method-logo')]
                        .every((i) => i.complete && i.naturalWidth > 0),
                };
            }"""
        )
        results["auth_methods"] = auth

        page.screenshot(path=str(OUT / "auth-methods.png"))

        # --- chat dropdown ----------------------------------------------------
        frame_trigger(page, "chat")
        open_combo(page, "chat")
        chat_geo = geometry(page, "chat")
        results["text_dropdown"] = chat_geo
        page.screenshot(path=str(OUT / "text-model-dropdown.png"))
        close_combo(page, "chat")

        # --- multimodal dropdown ---------------------------------------------
        frame_trigger(page, "multimodal")
        open_combo(page, "multimodal")
        mm_geo = geometry(page, "multimodal")
        results["multimodal_dropdown"] = mm_geo
        page.screenshot(path=str(OUT / "multimodal-model-dropdown.png"))

        # --- an incompatible selection must be cleared ------------------------
        page.click("#orca-list-multimodal .orca-combo-option")  # pick a vision model
        results["picked_multimodal"] = page.evaluate(
            "() => document.getElementById('orca-value-multimodal').textContent"
        )

        # A catalog reload can drop the model that is currently selected (the
        # provider changed, or the relay no longer offers it). The selector must
        # clear the stale id rather than keep sending it. This drives the app's
        # own render path with a shrunken option list, which is exactly what
        # runs after a refresh.
        results["stale_selection"] = page.evaluate(
            """() => {
                const combo = document.querySelector('[data-orca-capability="multimodal"]');
                const cap = combo.getAttribute('data-orca-capability');
                const before = document.getElementById('orca-value-' + cap).textContent;
                const entry = state.orcarouter.catalogs[cap];
                const kept = entry.options.filter(
                    (m) => m.id !== document.getElementById('orca-value-' + cap).textContent
                );
                state.orcarouter.catalogs[cap] = Object.assign({}, entry, {
                    options: kept,
                    filtered: kept.length,
                });
                orcaRenderModelFields();
                const valueEl = document.getElementById('orca-value-' + cap);
                const stillListed = kept.some((m) => m.id === document.getElementById('orca-value-' + cap).textContent);
                return {
                    before: before,
                    selectedAfter: state.orcarouter.selected[cap],
                    displayedAfter: valueEl.textContent,
                    placeholderShown: valueEl.classList.contains('placeholder'),
                    staleIdRetained: state.orcarouter.selected[cap] === before,
                    stillListed: stillListed,
                };
            }"""
        )

        browser.close()


def gates() -> list[str]:
    problems: list[str] = []

    def need(cond, msg):
        if not cond:
            problems.append(msg)

    a = results["auth_methods"]
    need(a["apiKeyVisible"], "api-key entry not visible")
    need(a["pkceVisible"], "pkce entry not visible")
    need(a["sideBySide"], "API Key and PKCE entries are not side by side")
    need(a["apiKeyLabelVisible"], "'OrcaRouter - API' label missing")
    need(a["pkceLabelVisible"], "'OrcaRouter - Auth' label missing")
    need(a["connectLabelVisible"], "'Connect with OrcaRouter' button missing")
    need(a["apiKeyInputType"] == "password", "API key field is not a password field")
    need(a["secretMasked"], "status line does not show a masked key")
    need(a["ready"], "status line does not report a ready credential")
    need(a["controlsEnabled"], "a control is disabled on a ready install")
    need(a["fullKeyAbsent"], "a full sk-orca- key is rendered in the page")
    need(a["logoLoaded"], "the self-hosted OrcaRouter logo did not load")

    c = results["text_dropdown"]
    need(c and c["open"], "chat listbox did not open")
    need(c and c["itemCount"] > 1, "chat listbox has no real options")
    need(c and c["visibleItems"] > 1, "chat options are not visible in the screenshot")
    need(c and c["backgroundOpaque"], "chat panel background is not opaque")
    need(c and c["borderStyle"] != "none", "chat panel has no border")
    need(c and c["panelRightDelta"] <= 2, "chat panel is not aligned to its trigger")
    need(
        c and all("/" in o for o in c["options"]),
        "a chat option is not a vendor/model id",
    )

    m = results["multimodal_dropdown"]
    need(m and m["open"], "multimodal listbox did not open")
    need(m and m["itemCount"] >= 1, "multimodal listbox has no real options")
    need(
        m and m["visibleItems"] == m["itemCount"],
        "not every multimodal option is visible in the screenshot",
    )
    need(m and m["backgroundOpaque"], "multimodal panel background is not opaque")
    need(m and m["panelRightDelta"] <= 2, "multimodal panel is not aligned to its trigger")
    need(
        m and set(m["options"]).issubset(set(c["options"])),
        "multimodal options are not a subset of the chat options",
    )
    need(
        m and len(m["options"]) < len(c["options"]),
        "multimodal filter did not narrow the chat list",
    )

    s = results["stale_selection"]
    need(s["before"] in m["options"], "the multimodal selection was not a real option")
    need(s["staleIdRetained"] is False, "a stale multimodal selection was not cleared")
    need(s["selectedAfter"] == "", "the cleared selection did not become empty")
    need(s["placeholderShown"], "no placeholder was shown after clearing the selection")
    return problems


def main() -> int:
    api_key = (os.environ.get("ORCAROUTER_API_KEY") or "").strip()
    if not api_key:
        log("ORCAROUTER_API_KEY is not set — refusing to produce evidence that")
        log("would only show the unconfigured provider or the outage fallback.")
        return 2

    rest_port, streams_port, viewer_port = pick_ports()
    secret = secrets.token_hex(16)
    worker = Worker(secret, rest_port, streams_port, viewer_port)
    build()
    try:
        worker.start()
        # Ask the worker which API origin it actually resolved, so an explicit
        # `ORCA_API_BASE_URL` override is reflected in the catalog we check
        # against instead of being silently reported as the public default.
        status = json.loads(
            wait_for(f"{worker.rest_url}/orcarouter/status", secret, time.time() + 30)
            or b"{}"
        )
        api_base_url = ((status.get("origins") or {}).get("apiBaseUrl")) or (
            "https://api.orcarouter.ai"
        )
        catalog_url, live_ids = fetch_chat_catalog(api_base_url, api_key)
        results["catalog"] = {"url": catalog_url, "ids": live_ids}
        log(f"authoritative chat catalog: {len(live_ids)} models from {catalog_url}")
        capture(worker)
    finally:
        worker.stop()

    problems = gates()
    c = results["text_dropdown"]
    m = results["multimodal_dropdown"]
    a = results["auth_methods"]
    live_ids = results["catalog"]["ids"]
    live_set = set(live_ids)

    # The selector has to be showing the live catalog, not a seed: every
    # rendered option must be in the authoritative response, and a live chat
    # catalog this endpoint serves non-empty must have produced options at all.
    if not set(c["options"]).issubset(live_set):
        problems.append(
            "chat options are not a subset of the live chat catalog: "
            + ", ".join(sorted(set(c["options"]) - live_set))
        )
    # `catalog_source` is only meaningful if the URL we actually fetched is the
    # one it names. An API-origin override means this run is not official
    # evidence, so say so instead of labelling an override as the public relay.
    if results["catalog"]["url"] != CATALOG_SOURCE:
        problems.append(
            f"catalog was fetched from {results['catalog']['url']}, "
            f"not the authoritative {CATALOG_SOURCE}"
        )

    manifest = {
        "automation": {
            "framework": "playwright",
            "driver": "python-playwright",
            "script": "scripts/orca-evidence.py",
            "chromium": CHROMIUM,
            "passed": not problems,
            "catalog_source": CATALOG_SOURCE,
            "catalog_url_fetched": results["catalog"]["url"],
            "catalog_model_count": len(c["options"]) if c else 0,
            "image_model_count": len(m["options"]) if m else 0,
            "captured_at": os.environ.get(
                "ORCA_EVIDENCE_DATE", datetime.now(timezone.utc).strftime("%Y-%m-%d")
            ),
            "viewer": worker.viewer_url,
        },
        "artifacts": [
            {
                "kind": "auth-methods",
                "path": "auth-methods.png",
                "sha256": sha256(OUT / "auth-methods.png"),
                "width": VIEWPORT["width"],
                "height": VIEWPORT["height"],
                "ui": {
                    "api_key_visible": a["apiKeyVisible"],
                    "pkce_visible": a["pkceVisible"],
                    "secret_masked": a["secretMasked"],
                    "controls_enabled": a["controlsEnabled"],
                },
            },
            {
                "kind": "text-model-dropdown",
                "path": "text-model-dropdown.png",
                "sha256": sha256(OUT / "text-model-dropdown.png"),
                "width": VIEWPORT["width"],
                "height": VIEWPORT["height"],
                "ui": {
                    "dropdown_open": c["open"],
                    "item_count": c["itemCount"],
                    "opaque_background": c["backgroundOpaque"],
                    "visible_border": c["borderStyle"] != "none",
                    "trigger_panel_right_delta": round(c["panelRightDelta"], 2),
                    "options": c["options"],
                },
            },
            {
                "kind": "multimodal-model-dropdown",
                "path": "multimodal-model-dropdown.png",
                "sha256": sha256(OUT / "multimodal-model-dropdown.png"),
                "width": VIEWPORT["width"],
                "height": VIEWPORT["height"],
                "ui": {
                    "dropdown_open": m["open"],
                    "item_count": m["itemCount"],
                    "opaque_background": m["backgroundOpaque"],
                    "visible_border": m["borderStyle"] != "none",
                    "trigger_panel_right_delta": round(m["panelRightDelta"], 2),
                    "options": m["options"],
                },
            },
        ],
        "filtered_options": {
            "chat": c["options"] if c else [],
            "multimodal_image": m["options"] if m else [],
        },
        "live_catalog": live_ids,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    summary = {
        key: value
        for key, value in results.items()
        if key in {"picked_multimodal", "stale_selection"}
    }
    summary["chat_models"] = manifest["automation"]["catalog_model_count"]
    summary["image_models"] = manifest["automation"]["image_model_count"]
    print(json.dumps(summary, indent=2))
    if problems:
        print("\nFAILED GATES:", file=sys.stderr)
        for problem in problems:
            print(" -", problem, file=sys.stderr)
        return 1
    log(f"all GUI gates passed; evidence written to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
