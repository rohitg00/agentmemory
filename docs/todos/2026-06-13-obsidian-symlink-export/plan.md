# Obsidian Symlink Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the repo-local feature-loop/TDD workflow. The checkbox steps below are the original implementation-plan snapshot; final progress and review status are tracked in `todo.md`.

**Goal:** Prevent Obsidian export from writing outside `AGENTMEMORY_EXPORT_ROOT` through pre-existing symlinks while preserving normal exports under the export root.

**Architecture:** Harden the boundary inside `mem::obsidian-export`. Resolve the export root to a canonical real path, reject symlinked components in the export path, create missing directories one segment at a time, verify each export directory remains inside the canonical root, and write files with a no-follow final-open helper.

**Tech Stack:** TypeScript ESM, Node `fs/promises`, Node `fs.constants`, Vitest.

Plan status: implemented and verified. The local prep-merge branch is staged for commit; no push, deploy, or remote merge was performed.

---

## File Map

- Modify `src/functions/obsidian-export.ts`
  - Replace lexical-only `resolveVaultDir()` with async export path preparation.
  - Add helpers for containment, safe directory creation, and safe file writes.
  - Replace direct `writeFile()` calls with the safe write helper.
- Modify `test/obsidian-export.test.ts`
  - Extend the mocked `node:fs/promises` module for new helpers.
  - Keep existing unit coverage for formatting and validation.
- Create `test/obsidian-export-symlink.test.ts`
  - Use the real filesystem to prove normal exports work and symlink escapes fail.
- Update `docs/todos/2026-06-13-obsidian-symlink-export/todo.md`
  - Track progress, verification, and residual risks.

No spec file exists; the source of truth is the current delegated user request, the validated finding evidence, and this task record.

## Task 1: Add Failing Regression Tests

**Files:**
- Modify: `test/obsidian-export.test.ts`
- Create: `test/obsidian-export-symlink.test.ts`

- [ ] **Step 1: Extend the mocked unit test filesystem**

Update the existing `vi.mock("node:fs/promises", ...)` in `test/obsidian-export.test.ts` so it can support the planned production helpers:

```ts
const realFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");

vi.mock("node:fs/promises", async () => ({
  mkdir: vi.fn(async (dir: string) => {
    createdDirs.add(dir);
  }),
  writeFile: vi.fn(async (path: string, content: string) => {
    writtenFiles.set(path, content);
  }),
  realpath: vi.fn(async (path: string) => path),
  lstat: vi.fn(async () => ({
    isDirectory: () => true,
    isSymbolicLink: () => false,
  })),
  open: vi.fn(async (path: string) => ({
    writeFile: async (content: string) => {
      writtenFiles.set(path, content);
    },
    close: async () => {},
  })),
  constants: realFs.constants,
}));
```

If `constants` must come from `node:fs`, import it in production from `node:fs` and omit it from this mock.

- [ ] **Step 2: Add a real-filesystem symlink test file**

Create `test/obsidian-export-symlink.test.ts` with local mock helpers copied from the existing Obsidian export test, but do not mock `node:fs/promises`. Use `mkdtemp`, `mkdir`, `readFile`, `symlink`, `writeFile`, `rm`, and `access` from the real filesystem.

Add these tests:

```ts
it("exports normally into a real vault under the export root", async () => {
  // create tmp export root
  // set AGENTMEMORY_EXPORT_ROOT to that root
  // seed one memory
  // call mem::obsidian-export with vaultDir inside root
  // assert success and read vault/memories/mem_real.md
});

it("rejects a symlinked vaultDir that points outside the export root", async () => {
  // create export root and outside dir
  // symlink root/vault -> outside
  // seed one memory
  // call export with vaultDir root/vault
  // assert success false
  // assert outside/memories/mem_escape.md does not exist
});

it("rejects a symlinked export subdirectory that points outside the export root", async () => {
  // create real root/vault and outside dir
  // symlink root/vault/memories -> outside
  // seed one memory
  // call export with vaultDir root/vault
  // assert success false or no exported memory
  // assert outside/mem_escape.md does not exist
});

it("does not follow a final markdown-file symlink", async () => {
  // create root/vault/memories and outside target file
  // symlink root/vault/memories/mem_link.md -> outside/target.md
  // seed memory id mem_link
  // call export
  // assert outside/target.md content remains unchanged
});
```

- [ ] **Step 3: Run focused tests and capture RED**

Run:

```bash
npm test -- test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts
```

Expected before implementation: at least one new symlink regression fails because the current code follows symlinks or writes outside the root. If dependencies are missing, run the repo's CI-style install sequence before retrying:

```bash
npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund
npm ci --legacy-peer-deps --no-audit --no-fund
```

Do not keep `package-lock.json` as task-owned output unless the repo explicitly starts tracking it.

## Task 2: Harden Export Path Preparation

**Files:**
- Modify: `src/functions/obsidian-export.ts`

- [ ] **Step 1: Replace imports**

Change:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
```

to:

```ts
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
```

- [ ] **Step 2: Add containment helpers**

Add helpers near `getExportRoot()`:

```ts
function isInsideRoot(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!!rel && !rel.startsWith("..") && !rel.includes(`${sep}..`) && !resolve(rel).startsWith(sep));
}

function lexicalVaultDir(vaultDir?: string): { root: string; vaultDir: string } | null {
  const root = getExportRoot();
  const resolved = resolve(vaultDir || join(root, "vault"));
  if (resolved === root || resolved.startsWith(root + sep)) {
    return { root, vaultDir: resolved };
  }
  return null;
}
```

If the `resolve(rel).startsWith(sep)` check is too opaque, replace it with `!isAbsolute(rel)` by importing `isAbsolute`.

- [ ] **Step 3: Add a symlink-rejecting directory preparer**

Add an async helper:

```ts
async function ensureRealDirectoryInsideRoot(dir: string, root: string, canonicalRoot: string): Promise<string> {
  if (!isInsideRoot(dir, root)) {
    throw new Error(`export path must be inside ${root}`);
  }

  const segments = relative(root, dir).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`export path cannot contain symlinks: ${current}`);
      }
      if (!stat.isDirectory()) {
        throw new Error(`export path component is not a directory: ${current}`);
      }
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ENOENT") {
        await mkdir(current);
        continue;
      }
      throw err;
    }
  }

  const canonicalDir = await realpath(dir);
  if (!isInsideRoot(canonicalDir, canonicalRoot)) {
    throw new Error(`export path must stay inside ${root}`);
  }
  return canonicalDir;
}
```

- [ ] **Step 4: Add export root/vault preparation**

Add:

```ts
async function prepareVaultDir(vaultDir?: string): Promise<{ root: string; canonicalRoot: string; vaultDir: string }> {
  const lexical = lexicalVaultDir(vaultDir);
  if (!lexical) {
    throw new Error(`vaultDir must be inside ${getExportRoot()}`);
  }

  await mkdir(lexical.root, { recursive: true });
  const rootStat = await lstat(lexical.root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`export root must be a real directory: ${lexical.root}`);
  }

  const canonicalRoot = await realpath(lexical.root);
  const canonicalVault = await ensureRealDirectoryInsideRoot(lexical.vaultDir, lexical.root, canonicalRoot);
  return { root: lexical.root, canonicalRoot, vaultDir: canonicalVault };
}
```

## Task 3: Harden Export Writes

**Files:**
- Modify: `src/functions/obsidian-export.ts`

- [ ] **Step 1: Add a safe write helper**

Add:

```ts
async function writeExportFile(filepath: string, content: string, root: string, canonicalRoot: string): Promise<void> {
  const parent = dirname(filepath);
  await ensureRealDirectoryInsideRoot(parent, root, canonicalRoot);

  const fd = await open(
    filepath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await fd.writeFile(content);
  } finally {
    await fd.close();
  }
}
```

- [ ] **Step 2: Replace handler path setup**

Replace:

```ts
const vaultDir = resolveVaultDir(data.vaultDir);
if (!vaultDir) {
  return {
    success: false,
    error: `vaultDir must be inside ${getExportRoot()}`,
  };
}
```

with:

```ts
let preparedVault: { root: string; canonicalRoot: string; vaultDir: string };
try {
  preparedVault = await prepareVaultDir(data.vaultDir);
} catch (err) {
  return {
    success: false,
    error: err instanceof Error ? err.message : String(err),
  };
}
const { root, canonicalRoot, vaultDir } = preparedVault;
```

- [ ] **Step 3: Replace recursive directory creation**

Replace:

```ts
await Promise.all(
  Object.values(dirs).map((dir) => mkdir(dir, { recursive: true })),
);
```

with:

```ts
await Promise.all(
  Object.values(dirs).map((dir) => ensureRealDirectoryInsideRoot(dir, root, canonicalRoot)),
);
```

- [ ] **Step 4: Replace writes**

Replace each direct `writeFile(...)` with `writeExportFile(..., root, canonicalRoot)`:

```ts
await writeExportFile(filepath, memoryToMd(m), root, canonicalRoot);
await writeExportFile(filepath, lessonToMd(l), root, canonicalRoot);
await writeExportFile(filepath, crystalToMd(c), root, canonicalRoot);
await writeExportFile(filepath, sessionToMd(s), root, canonicalRoot);
await writeExportFile(join(vaultDir, "MOC.md"), moc, root, canonicalRoot);
```

## Task 4: Verify and Simplify

**Files:**
- Modify: `docs/todos/2026-06-13-obsidian-symlink-export/todo.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- test/obsidian-export.test.ts test/obsidian-export-symlink.test.ts
```

Expected: both Obsidian export test files pass.

- [ ] **Step 2: Run relevant suite**

Run:

```bash
npm test
npm run build
```

Expected: repo unit suite and build pass. If full suite fails outside the touched surface, capture exact failing tests and rerun the focused checks.

- [ ] **Step 3: Run required security gates**

Because this task changes security-sensitive filesystem handling, run:

```bash
semgrep scan --config p/default --error --metrics=off .
gitleaks detect --source . --redact
```

If a commit is created, stage only intended files and run:

```bash
gitleaks protect --staged --redact
```

- [ ] **Step 4: Focused simplification pass**

Review only the touched code and tests. Remove duplicated helper logic if it does not weaken the boundary. Preserve APIs, error contracts, storage, auth, routing, and filesystem boundary behavior.

- [ ] **Step 5: Update the task state**

Record:
- final files changed;
- test and scanner commands with pass/fail evidence;
- Sprint Contract and matrix status;
- residual TOCTOU/hard-link risks if still present.

## Plan Self-Review

- Spec coverage: the plan covers validity consensus, symlinked vault escape, symlinked subdirectory escape, final-file symlink, normal export compatibility, and required verification.
- Placeholder scan: no unresolved placeholders are present.
- Type consistency: all new helpers are local to `src/functions/obsidian-export.ts`; REST/MCP wrappers continue delegating unchanged.
