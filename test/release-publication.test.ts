import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePackages, publicationPlan, verifyPublished, publishSelected } from "../scripts/release/registry.mjs";
import { artifactDigest, assertGatedArtifacts, prepareArtifacts, releaseIdentity } from "../scripts/release/publish.mjs";

const identity = { repository: "rohitg00/agentmemory", workflow: ".github/workflows/publish.yml", ref: "refs/tags/v0.9.31", sha: "a".repeat(40) };
const bytes = Buffer.from("gated tarball");
const artifact = { key: "agentmemory", name: "@agentmemory/agentmemory", version: "0.9.31", integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`, sha512: createHash("sha512").update(bytes).digest("hex") };
type RegistryMetadata = { name: string; version: string; dist: { integrity: string; attestations?: { url: string } } };
const metadata = (): RegistryMetadata => ({ name: artifact.name, version: artifact.version, dist: { integrity: artifact.integrity, attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/test" } } });
function provenanceStatement() {
  return {
    _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
    subject: [{ name: "pkg:npm/%40agentmemory/agentmemory@0.9.31", digest: { sha512: artifact.sha512 } }],
    predicate: { buildDefinition: {
      buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
      externalParameters: { workflow: { repository: `https://github.com/${identity.repository}`, path: identity.workflow, ref: identity.ref } },
      resolvedDependencies: [{ uri: `git+https://github.com/${identity.repository}@${identity.ref}`, digest: { gitCommit: identity.sha } }],
    }, runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" } } },
  };
}
function attestations(edit: (statement: ReturnType<typeof provenanceStatement>) => void = () => {}) {
  const statement = provenanceStatement();
  edit(statement);
  return { attestations: [{ predicateType: statement.predicateType, bundle: { dsseEnvelope: { payloadType: "application/vnd.in-toto+json", payload: Buffer.from(JSON.stringify(statement)).toString("base64") } } }] };
}
function fetcher(...responses: Array<Response | Error>) {
  return vi.fn(async () => {
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error("unexpected fetch");
    return response;
  });
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const options = { verifyBundle: vi.fn(async () => {}), sleep: async () => {} };

describe("verified release publication", () => {
  it("validates selectors and keeps independent fs-watcher releases opt-in", () => {
    expect(parsePackages(undefined)).toEqual(["agentmemory", "mcp"]);
    expect(parsePackages(" fs-watcher,agentmemory ")).toEqual(["agentmemory", "fs-watcher"]);
    for (const input of ["", "mcp,", "mcp,mcp", "all", "$(publish)"]) expect(() => parsePackages(input)).toThrow();
    expect(publicationPlan(["mcp"])).toEqual({ pack: ["agentmemory", "mcp"], verifyOnly: ["agentmemory"], publish: ["mcp"] });
    expect(publicationPlan(["fs-watcher"])).toEqual({ pack: ["fs-watcher"], verifyOnly: [], publish: ["fs-watcher"] });
  });

  it("accepts an identical artifact only after checking signed provenance identity", async () => {
    const verifyBundle = vi.fn(async () => {});
    expect(await verifyPublished(artifact, identity, { ...options, verifyBundle, fetch: fetcher(json(metadata()), json(attestations())) })).toBe(true);
    expect(verifyBundle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      certificateIssuer: "https://token.actions.githubusercontent.com",
      certificateIdentityURI: `https://github.com/${identity.repository}/${identity.workflow}@${identity.ref}`,
    }));
  });

  it("accepts only a version endpoint 404 as absence", async () => {
    expect(await verifyPublished(artifact, identity, { ...options, fetch: fetcher(json({}, 404)) })).toBe(false);
    for (const status of [401, 403, 500]) {
      await expect(verifyPublished(artifact, identity, { ...options, attempts: 1, fetch: fetcher(json({}, status)) })).rejects.toThrow(`HTTP ${status}`);
    }
  });

  it("retries bounded transient fetch errors without mistaking them for absence", async () => {
    const fetch = fetcher(new Error("connection reset"), json({}, 503), json(metadata()), json(attestations()));
    expect(await verifyPublished(artifact, identity, { ...options, fetch })).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
    await expect(verifyPublished(artifact, identity, { ...options, attempts: 2, fetch: fetcher(json({}, 429), json({}, 429)) })).rejects.toThrow("HTTP 429");
  });

  it("rejects missing provenance even when registry signatures or publish attestations exist", async () => {
    const noProvenance = metadata();
    delete noProvenance.dist.attestations;
    await expect(verifyPublished(artifact, identity, { ...options, fetch: fetcher(json(noProvenance)) })).rejects.toThrow("provenance");
    await expect(verifyPublished(artifact, identity, { ...options, fetch: fetcher(json(metadata()), json({ attestations: [{ predicateType: "publish" }] })) })).rejects.toThrow("provenance");
  });

  it("rejects a conflicting registry artifact without invoking publication", async () => {
    const conflicting = metadata();
    conflicting.dist.integrity = "sha512-other";
    const publish = vi.fn();
    await expect(publishSelected([artifact], identity, { ...options, publish, fetch: fetcher(json(conflicting)) })).rejects.toThrow("integrity");
    expect(publish).not.toHaveBeenCalled();
  });

  it("preflights every selected package before publishing any missing version", async () => {
    const publish = vi.fn();
    await expect(publishSelected([artifact, { ...artifact, name: "@agentmemory/mcp" }], identity, { ...options, publish, fetch: fetcher(json({}, 404), json({}, 403)) })).rejects.toThrow("HTTP 403");
    expect(publish).not.toHaveBeenCalled();
  });

  it.each([
    ["subject", (s: ReturnType<typeof provenanceStatement>) => { s.subject[0].digest.sha512 = "b".repeat(128); }],
    ["commit", (s: ReturnType<typeof provenanceStatement>) => { s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40); }],
    ["workflow", (s: ReturnType<typeof provenanceStatement>) => { s.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/other.yml"; }],
    ["repository", (s: ReturnType<typeof provenanceStatement>) => { s.predicate.buildDefinition.externalParameters.workflow.repository = "https://github.com/attacker/repo"; }],
    ["ref", (s: ReturnType<typeof provenanceStatement>) => { s.predicate.buildDefinition.externalParameters.workflow.ref = "refs/heads/main"; }],
  ])("rejects signed provenance with a different %s", async (_, edit) => {
    await expect(verifyPublished(artifact, identity, { ...options, fetch: fetcher(json(metadata()), json(attestations(edit))) })).rejects.toThrow();
  });

  it("rejects invalid signatures even when every decoded field matches", async () => {
    await expect(verifyPublished(artifact, identity, { ...options, verifyBundle: async () => { throw new Error("invalid signature"); }, fetch: fetcher(json(metadata()), json(attestations())) })).rejects.toThrow("invalid signature");
  });

  it("does not follow an attestation URL to another origin", async () => {
    const redirected = metadata();
    redirected.dist.attestations!.url = "https://attacker.example/attestation";
    const fetch = fetcher(json(redirected));
    await expect(verifyPublished(artifact, identity, { ...options, fetch })).rejects.toThrow("attestation URL");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("skips a legitimate verified rerun without publishing again", async () => {
    const publish = vi.fn();
    await publishSelected([artifact], identity, { ...options, publish, fetch: fetcher(json(metadata()), json(attestations())) });
    expect(publish).not.toHaveBeenCalled();
  });

  it("verifies propagation after publication and tolerates delayed provenance", async () => {
    const noProvenance = metadata();
    delete noProvenance.dist.attestations;
    const publish = vi.fn(async () => {});
    await publishSelected([artifact], identity, { ...options, publish, fetch: fetcher(json({}, 404), json({}, 404), json(noProvenance), json(metadata()), json(attestations())) });
    expect(publish).toHaveBeenCalledExactlyOnceWith(artifact);
  });

  it("fails publication when registry never supplies verified provenance", async () => {
    const publish = vi.fn(async () => {});
    await expect(publishSelected([artifact], identity, { ...options, publish, propagationAttempts: 2, fetch: fetcher(json({}, 404), json({}, 404), json({}, 404)) })).rejects.toThrow("did not become verifiable");
  });
});

describe("exact packaged release artifacts", () => {
  const directories: string[] = [];
  afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
  function output() {
    const root = mkdtempSync(join(tmpdir(), "release-publication-test-"));
    directories.push(root);
    return join(root, "release");
  }
  function commands(gate: (args: string[]) => void = () => {}) {
    return vi.fn((cmd: string, args: string[], cwd: string) => {
      if (cmd !== "npm") { gate(args); return ""; }
      const source = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      const path = join(args[args.indexOf("--pack-destination") + 1], source.name.replace(/[@/]/g, "") + ".tgz");
      writeFileSync(path, source.name);
      return JSON.stringify([{ name: source.name, version: source.version, filename: path.split("/").at(-1), integrity: artifactDigest(path).integrity }]);
    });
  }

  it("binds the checkout to the exact workflow ref and commit for branches and tags", () => {
    for (const ref of ["refs/tags/v0.9.31", "refs/heads/main"]) {
      const env = { GITHUB_REF: ref, GITHUB_SHA: identity.sha, GITHUB_REPOSITORY: identity.repository, GITHUB_WORKFLOW_REF: `${identity.repository}/${identity.workflow}@${ref}` };
      expect(releaseIdentity(env, identity.sha)).toEqual({ ...identity, ref });
      expect(() => releaseIdentity(env, "b".repeat(40))).toThrow("Checkout differs");
      expect(() => releaseIdentity({ ...env, GITHUB_WORKFLOW_REF: `${identity.repository}/other.yml@${ref}` }, identity.sha)).toThrow("workflow identity");
    }
  });

  it("gates both exact CLI and MCP tarballs and retains only those bytes", () => {
    const command = commands();
    const manifest = prepareArtifacts({ out: output(), selected: ["agentmemory", "mcp"], identity, command });
    const gate = command.mock.calls.find(([cmd]) => cmd !== "npm")!;
    expect(gate[1]).toEqual(expect.arrayContaining(["--tarball", manifest.artifacts[0].tarball, "--mcp-tarball", manifest.artifacts[1].tarball]));
    expect(command.mock.calls.filter(([cmd]) => cmd === "npm")).toHaveLength(2);
    expect(assertGatedArtifacts(manifest, identity).publish).toEqual(["agentmemory", "mcp"]);
    writeFileSync(manifest.artifacts[0].tarball, "changed after gate");
    expect(() => assertGatedArtifacts(manifest, identity)).toThrow("Gated tarball changed");
  });

  it("never writes a publishable manifest after a failed gate or an artifact mutation", () => {
    const failed = output();
    expect(() => prepareArtifacts({ out: failed, selected: ["agentmemory"], identity, command: commands(() => { throw new Error("gate failed"); }) })).toThrow("gate failed");
    expect(existsSync(join(failed, "manifest.json"))).toBe(false);
    const changed = output();
    expect(() => prepareArtifacts({ out: changed, selected: ["agentmemory"], identity, command: commands((args) => writeFileSync(args[args.indexOf("--tarball") + 1], "mutated")) })).toThrow("Gated tarball changed");
    expect(existsSync(join(changed, "manifest.json"))).toBe(false);
  });

  it("gates only the independent watcher when selected and preserves prior output on reruns", () => {
    const out = output();
    const command = commands();
    const manifest = prepareArtifacts({ out, selected: ["fs-watcher"], identity, command });
    expect(manifest.artifacts.map((entry: typeof artifact) => entry.key)).toEqual(["fs-watcher"]);
    expect(command.mock.calls.find(([cmd]) => cmd !== "npm")![1][0]).toContain("filesystem-watcher.mjs");
    const before = readFileSync(join(out, "manifest.json"), "utf8");
    expect(() => prepareArtifacts({ out, selected: ["fs-watcher"], identity, command })).toThrow();
    expect(readFileSync(join(out, "manifest.json"), "utf8")).toEqual(before);
  });
});
