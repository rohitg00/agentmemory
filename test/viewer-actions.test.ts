import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

const viewer = readFileSync("src/viewer/index.html", "utf-8");

function extractFunction(name: string): string {
  let start = viewer.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in viewer`);
  if (viewer.slice(start - 6, start) === "async ") start -= 6;
  let depth = 0;
  for (let i = viewer.indexOf("{", start); i < viewer.length; i++) {
    if (viewer[i] === "{") depth++;
    if (viewer[i] === "}") {
      depth--;
      if (depth === 0) return viewer.slice(start, i + 1);
    }
  }
  throw new Error(`function ${name} is not balanced`);
}

describe("viewer actions", () => {
  it("loads every action page for the Actions tab", () => {
    expect(viewer).toMatch(/action: \{ path: 'actions', key: 'actions', allPages: true \}/);
  });

  it("resets selected-action lookup state when reloading actions", () => {
    const resetLoadedKindForReload = new Function(
      "state",
      "store",
      `return ${extractFunction("resetLoadedKindForReload")};`,
    ) as (
      state: { actions: { detailAttemptedId: string; detailRequestFailedId: string } },
      store: { loaded: Record<string, boolean> },
    ) => (kind: string) => void;
    const state = { actions: { detailAttemptedId: "act_selected", detailRequestFailedId: "act_selected" } };
    const store = { loaded: { action: true, lesson: true } };
    const reset = resetLoadedKindForReload(state, store);

    reset("lesson");
    expect(store.loaded.lesson).toBe(false);
    expect(state.actions.detailAttemptedId).toBe("act_selected");

    reset("action");
    expect(store.loaded.action).toBe(false);
    expect(state.actions.detailAttemptedId).toBe("");
    expect(state.actions.detailRequestFailedId).toBe("");
  });

  it("follows action cursors and combines all pages", async () => {
    const loadAllPages = new Function(
      "listOr",
      `return ${extractFunction("loadAllPages")};`,
    )((fallback: unknown[], result: Record<string, unknown>, key: string) => result[key] || fallback) as (
      spec: { path: string; key: string },
      apiGet: (path: string) => Promise<Record<string, unknown>>,
    ) => Promise<Record<string, unknown>>;
    const apiGet = vi.fn()
      .mockResolvedValueOnce({ actions: [{ id: "a" }], nextCursor: "next /?" })
      .mockResolvedValueOnce({ actions: [{ id: "b" }], nextCursor: null });

    const result = await loadAllPages({ path: "actions", key: "actions" }, apiGet);

    expect(apiGet.mock.calls).toEqual([
      ["actions?limit=500"],
      ["actions?limit=500&cursor=next%20%2F%3F"],
    ]);
    expect(result.actions).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("stops the all-pages load when a later page fails", async () => {
    const loadAllPages = new Function(
      "listOr",
      `return ${extractFunction("loadAllPages")};`,
    )((fallback: unknown[], result: Record<string, unknown>, key: string) => result[key] || fallback) as (
      spec: { path: string; key: string },
      apiGet: (path: string) => Promise<Record<string, unknown> | null>,
    ) => Promise<Record<string, unknown> | null>;
    const apiGet = vi.fn()
      .mockResolvedValueOnce({ actions: [{ id: "a" }], nextCursor: "next" })
      .mockResolvedValueOnce(null);

    await expect(loadAllPages({ path: "actions", key: "actions" }, apiGet)).resolves.toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("exposes retry after an action collection load failure while retaining cached rows", () => {
    const ensureLoaded = extractFunction("ensureLoaded");
    const renderActions = extractFunction("renderActions");
    expect(ensureLoaded).toMatch(/if \(result === null\) \{\s*if \(kind === 'action'\) state\.actions\.loadError = true;/);
    expect(ensureLoaded).toMatch(/if \(kind === 'action'\) state\.actions\.loadError = false;/);
    expect(renderActions).toMatch(/var all = entityList\('action'\);\s*if \(!store\.loaded\.action && !all\.length\)/);
    expect(renderActions).toMatch(/data-action="action-list-retry"/);
    expect(renderActions).toMatch(/Showing previously loaded actions/);
    expect(extractFunction("handlePageAction")).toMatch(/action === 'action-list-retry'\) \{ retryActionList\(\); return true; \}/);
  });

  it("continues selected-action lookup when the action list has failed", () => {
    const renderActions = extractFunction("renderActions");
    const renderActionDetail = extractFunction("renderActionDetail");
    expect(renderActions).toMatch(/if \(!store\.loaded\.action && !all\.length\) \{[\s\S]*?renderActionDetail\(\{\}\);\s*return;/);
    expect(renderActionDetail).toMatch(/if \(a\.selectedId && !sel\) \{\s*ensureActionById\(a\.selectedId\);/);
  });

  it("retries the action collection and clears its failed state before loading", async () => {
    const retryActionList = new Function(
      "state",
      "store",
      "renderActions",
      "ensureLoaded",
      `return ${extractFunction("retryActionList")};`,
    ) as (
      state: { actions: { loadError: boolean; selectedId: string; detailAttemptedId: string; detailRequestFailedId: string } },
      store: { loaded: { action: boolean }; loading: { action: Promise<void> | null }; entities: { action: Record<string, unknown> } },
      renderActions: () => void,
      ensureLoaded: (kind: string) => Promise<void>,
    ) => () => Promise<void>;
    const state = { actions: { loadError: true, selectedId: "act_deep_link", detailAttemptedId: "act_deep_link", detailRequestFailedId: "act_deep_link" } };
    const store = { loaded: { action: true }, loading: { action: null }, entities: { action: {} } };
    const renderActions = vi.fn();
    const ensureLoaded = vi.fn(async () => { state.actions.loadError = false; store.loaded.action = true; });

    await retryActionList(state, store, renderActions, ensureLoaded)();

    expect(state.actions.loadError).toBe(false);
    expect(state.actions.detailAttemptedId).toBe("");
    expect(state.actions.detailRequestFailedId).toBe("");
    expect(store.loaded.action).toBe(true);
    expect(ensureLoaded).toHaveBeenCalledWith("action");
    expect(renderActions).toHaveBeenCalledTimes(2);
  });

  it("fetches a selected action by id when it is missing from the loaded list", async () => {
    const loadEnsureActionById = new Function(
      "state",
      "store",
      "apiGet",
      "renderActions",
      `return ${extractFunction("ensureActionById")};`,
    ) as (
      state: { actions: { detailLoading: string; detailAttemptedId: string; detailRequestFailedId: string } },
      store: { entities: { action: Record<string, unknown> } },
      apiGet: (path: string) => Promise<{ success: boolean; action: { id: string } }>,
      renderActions: () => void,
    ) => (id: string) => Promise<void>;
    const action = { id: "act_outside_first_page" };
    const apiGet = vi.fn(async () => ({ success: true, action }));
    const renderActions = vi.fn();
    const state = { actions: { detailLoading: "", detailAttemptedId: "", detailRequestFailedId: "" } };
    const store = { entities: { action: {} } };

    await loadEnsureActionById(state, store, apiGet, renderActions)("act_outside_first_page");

    expect(apiGet).toHaveBeenCalledWith("actions/get?actionId=act_outside_first_page");
    expect(store.entities.action.act_outside_first_page).toBe(action);
    expect(renderActions).toHaveBeenCalledOnce();
  });

  it("allows retrying an action lookup after a request failure", async () => {
    const loadEnsureActionById = new Function(
      "state",
      "store",
      "apiGet",
      "renderActions",
      `return ${extractFunction("ensureActionById")};`,
    ) as (
      state: { actions: { detailLoading: string; detailAttemptedId: string; detailRequestFailedId: string } },
      store: { entities: { action: Record<string, unknown> } },
      apiGet: (path: string) => Promise<{ success: boolean; action: { id: string } } | null>,
      renderActions: () => void,
    ) => (id: string) => Promise<void>;
    const action = { id: "act_outside_first_page" };
    const apiGet = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ success: true, action });
    const renderActions = vi.fn();
    const state = { actions: { detailLoading: "", detailAttemptedId: "", detailRequestFailedId: "" } };
    const store = { entities: { action: {} } };
    const ensureActionById = loadEnsureActionById(state, store, apiGet, renderActions);

    await ensureActionById(action.id);
    expect(state.actions.detailRequestFailedId).toBe(action.id);
    await ensureActionById(action.id);
    expect(apiGet).toHaveBeenCalledOnce();

    const retryActionById = new Function(
      "state",
      "ensureActionById",
      `return ${extractFunction("retryActionById")};`,
    )(state, ensureActionById) as (id: string) => Promise<void>;
    await retryActionById(action.id);

    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(store.entities.action[action.id]).toBe(action);
    expect(state.actions.detailRequestFailedId).toBe("");
  });
});
