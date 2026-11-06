import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

export const REGISTRY = "https://registry.npmjs.org";
export const PACKAGES = {
  agentmemory: { name: "@agentmemory/agentmemory", directory: "." },
  mcp: { name: "@agentmemory/mcp", directory: "packages/mcp" },
  "fs-watcher": { name: "@agentmemory/fs-watcher", directory: "integrations/filesystem-watcher" },
};
const PROVENANCE = "https://slsa.dev/provenance/v1";

export function parsePackages(input = "agentmemory,mcp") {
  const selected = input.split(",").map((value) => value.trim());
  assert(selected.length && selected.every((key) => Object.hasOwn(PACKAGES, key)), "Select only agentmemory,mcp,fs-watcher");
  assert.equal(new Set(selected).size, selected.length, "Duplicate package selection");
  return Object.keys(PACKAGES).filter((key) => selected.includes(key));
}

export function publicationPlan(selected) {
  const needsMain = selected.includes("agentmemory") || selected.includes("mcp");
  return {
    pack: Object.keys(PACKAGES).filter((key) => selected.includes(key) || (needsMain && key !== "fs-watcher")),
    verifyOnly: selected.includes("mcp") && !selected.includes("agentmemory") ? ["agentmemory"] : [],
    publish: selected,
  };
}

class PendingProvenance extends Error {}

async function registryJSON(url, { fetch: request = fetch, sleep: delay = sleep, attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      response = await request(url, { signal: AbortSignal.timeout(15_000), redirect: "error", headers: { accept: "application/json", "cache-control": "no-cache" } });
    } catch (error) {
      if (attempt + 1 === attempts) throw error;
      await delay(1000 * (attempt + 1));
      continue;
    }
    if (response.status === 404) return null;
    if (response.ok) return response.json();
    if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
      await delay(1000 * (attempt + 1));
      continue;
    }
    throw new Error(`Registry request failed: HTTP ${response.status}`);
  }
  throw new Error("Registry request exhausted its attempts");
}

async function verifyBundle(bundle, options) {
  const { verify } = await import("sigstore");
  await verify(bundle, options);
}

export async function verifyPublished(artifact, identity, options = {}) {
  const metadata = await registryJSON(`${REGISTRY}/${encodeURIComponent(artifact.name)}/${encodeURIComponent(artifact.version)}`, options);
  if (metadata === null) return false;
  assert.equal(metadata.name, artifact.name, "Registry package name mismatch");
  assert.equal(metadata.version, artifact.version, "Registry package version mismatch");
  assert.equal(metadata.dist?.integrity, artifact.integrity, `Registry integrity differs from the gated ${artifact.name}@${artifact.version}; existing versions cannot be overwritten`);
  if (!metadata.dist?.attestations?.url) throw new PendingProvenance("Registry artifact has no provenance");
  const url = new URL(metadata.dist.attestations.url);
  assert(url.origin === REGISTRY && url.pathname.startsWith("/-/npm/v1/attestations/") && !url.username && !url.password && !url.search && !url.hash, "Unexpected registry attestation URL");
  const document = await registryJSON(url.href, options);
  const entries = document?.attestations?.filter((entry) => entry.predicateType === PROVENANCE);
  if (!entries?.length) throw new PendingProvenance("Registry artifact has no SLSA v1 provenance");
  assert.equal(entries.length, 1, "Ambiguous provenance statements");
  const bundle = entries[0].bundle;
  await (options.verifyBundle ?? verifyBundle)(bundle, {
    certificateIssuer: "https://token.actions.githubusercontent.com",
    certificateIdentityURI: `https://github.com/${identity.repository}/${identity.workflow}@${identity.ref}`,
    timeout: 15_000,
    retry: { retries: 2 },
  });
  assert.equal(bundle.dsseEnvelope?.payloadType, "application/vnd.in-toto+json", "Unexpected provenance payload type");
  const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  assert.equal(statement._type, "https://in-toto.io/Statement/v1", "Unexpected provenance statement type");
  assert.equal(statement.predicateType, PROVENANCE, "Unexpected provenance predicate");
  assert.equal(statement.subject?.length, 1, "Unexpected provenance subjects");
  assert.equal(statement.subject[0].name, `pkg:npm/${artifact.name.replace(/^@/, "%40")}@${artifact.version}`, "Provenance subject differs from package");
  assert.equal(statement.subject[0].digest?.sha512, artifact.sha512, "Provenance subject digest differs from gated artifact");
  const definition = statement.predicate?.buildDefinition;
  assert.equal(definition?.buildType, "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1", "Unexpected provenance build type");
  assert.deepEqual(definition.externalParameters?.workflow, { repository: `https://github.com/${identity.repository}`, path: identity.workflow, ref: identity.ref }, "Provenance workflow identity differs from this release");
  assert(definition.resolvedDependencies?.some((source) => source.uri === `git+https://github.com/${identity.repository}@${identity.ref}` && source.digest?.gitCommit === identity.sha), "Provenance commit differs from this release");
  assert.equal(statement.predicate.runDetails?.builder?.id, "https://github.com/actions/runner/github-hosted", "Provenance was not built on a GitHub-hosted runner");
  return true;
}

export async function publishSelected(artifacts, identity, options) {
  const existing = [];
  for (const artifact of artifacts) existing.push(await verifyPublished(artifact, identity, options));
  for (const [index, artifact] of artifacts.entries()) {
    if (existing[index]) {
      options.log?.(`Verified existing ${artifact.name}@${artifact.version}`);
      continue;
    }
    await options.publish(artifact);
    let verified = false;
    for (let attempt = 0; attempt < (options.propagationAttempts ?? 24); attempt++) {
      try {
        verified = await verifyPublished(artifact, identity, options);
      } catch (error) {
        if (!(error instanceof PendingProvenance)) throw error;
      }
      if (verified) break;
      await (options.sleep ?? sleep)(5000);
    }
    assert(verified, `${artifact.name}@${artifact.version} did not become verifiable after publication`);
    options.log?.(`Verified published ${artifact.name}@${artifact.version}`);
  }
}
