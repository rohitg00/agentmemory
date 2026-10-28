#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGES, REGISTRY, parsePackages, publicationPlan, publishSelected, verifyPublished } from "./registry.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function run(command, args, cwd = REPO, capture = false) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", timeout: 1_800_000 });
}

export function releaseIdentity(env, head) {
  const identity = { repository: "rohitg00/agentmemory", workflow: ".github/workflows/publish.yml", ref: env.GITHUB_REF, sha: env.GITHUB_SHA };
  assert.equal(env.GITHUB_REPOSITORY, identity.repository, "Publication must run in the project repository");
  assert(/^[a-f0-9]{40}$/.test(identity.sha ?? ""), "Invalid release commit");
  assert.equal(head, identity.sha, "Checkout differs from the workflow release commit");
  assert(/^refs\/(tags|heads)\/[^\s]+$/.test(identity.ref ?? ""), "Invalid release ref");
  assert.equal(env.GITHUB_WORKFLOW_REF, `${identity.repository}/${identity.workflow}@${identity.ref}`, "Unexpected publication workflow identity");
  return identity;
}

export function artifactDigest(path) {
  const bytes = readFileSync(path);
  const sha512 = createHash("sha512").update(bytes).digest();
  return { integrity: `sha512-${sha512.toString("base64")}`, sha512: sha512.toString("hex") };
}

export function assertGatedArtifacts(manifest, identity) {
  assert.equal(manifest.format, 1, "Unsupported release manifest");
  assert.equal(manifest.gated, true, "Artifacts have not passed the packaged gates");
  assert.deepEqual(manifest.identity, identity, "Gated source differs from this release");
  const selected = parsePackages(manifest.selected.join(","));
  const plan = publicationPlan(selected);
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.key), plan.pack, "Unexpected release artifact selection");
  for (const artifact of manifest.artifacts) {
    assert.equal(artifact.name, PACKAGES[artifact.key].name, "Unexpected release package name");
    assert.deepEqual(artifactDigest(artifact.tarball), { integrity: artifact.integrity, sha512: artifact.sha512 }, `Gated tarball changed: ${artifact.name}`);
  }
  return plan;
}

export function prepareArtifacts({ out, selected, identity, command = run }) {
  const plan = publicationPlan(selected);
  mkdirSync(out);
  const packDirectory = join(out, "pack");
  mkdirSync(packDirectory);
  const artifacts = plan.pack.map((key) => {
    const pkg = PACKAGES[key];
    const directory = resolve(REPO, pkg.directory);
    const source = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    assert.equal(source.name, pkg.name, "Package manifest name mismatch");
    const packed = JSON.parse(command("npm", ["pack", "--json", "--pack-destination", packDirectory], directory, true));
    assert.equal(packed.length, 1, "Expected one packed artifact");
    assert.equal(packed[0].name, source.name, "Packed package name mismatch");
    assert.equal(packed[0].version, source.version, "Packed package version mismatch");
    const tarball = join(packDirectory, packed[0].filename);
    const digest = artifactDigest(tarball);
    assert.equal(packed[0].integrity, digest.integrity, "npm pack integrity mismatch");
    return { key, name: source.name, version: source.version, tarball, ...digest };
  });
  const artifact = (key) => artifacts.find((entry) => entry.key === key);
  if (artifact("agentmemory")) {
    command(process.execPath, [join(REPO, "scripts/release-gate/run.mjs"), "--tarball", artifact("agentmemory").tarball, "--mcp-tarball", artifact("mcp").tarball, "--skip-build", "--out", join(out, "gate")]);
  }
  if (artifact("fs-watcher")) {
    command(process.execPath, [join(REPO, "scripts/release-gate/filesystem-watcher.mjs"), artifact("fs-watcher").tarball]);
  }
  const manifest = { format: 1, identity, selected, artifacts, gated: true };
  assertGatedArtifacts(manifest, identity);
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

async function main(argv) {
  const [mode, ...args] = argv;
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(["--out", "--packages", "--manifest"].includes(args[i]) && args[i + 1] && !Object.hasOwn(opts, args[i]), "Invalid release arguments");
    opts[args[i]] = args[i + 1];
  }
  assert(["prepare", "publish"].includes(mode), "Usage: publish.mjs prepare --out directory [--packages agentmemory,mcp] | publish --manifest file");
  const identity = releaseIdentity(process.env, run("git", ["rev-parse", "HEAD"], REPO, true).trim());
  if (mode === "prepare") {
    assert(opts["--out"] && !opts["--manifest"], "Preparation requires a fresh output directory");
    prepareArtifacts({ out: resolve(opts["--out"]), selected: parsePackages(opts["--packages"]), identity });
    return;
  }
  assert(opts["--manifest"] && !opts["--out"] && !opts["--packages"], "Publication requires only the gated manifest");
  const manifest = JSON.parse(readFileSync(resolve(opts["--manifest"]), "utf8"));
  const plan = assertGatedArtifacts(manifest, identity);
  for (const key of plan.verifyOnly) {
    const artifact = manifest.artifacts.find((entry) => entry.key === key);
    assert(await verifyPublished(artifact, identity), `Publish ${artifact.name}@${artifact.version} before its MCP shim`);
  }
  await publishSelected(manifest.artifacts.filter((artifact) => plan.publish.includes(artifact.key)), identity, {
    log: console.log,
    publish: (artifact) => {
      assertGatedArtifacts(manifest, identity);
      run("npm", ["publish", artifact.tarball, "--provenance", "--access", "public", "--ignore-scripts", "--registry", REGISTRY]);
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
