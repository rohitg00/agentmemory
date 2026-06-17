import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(import.meta.dirname, "..");
const chartRoot = join(root, "deploy", "helm", "agentmemory");

function readChart(relativePath: string): string {
  return readFileSync(join(chartRoot, relativePath), "utf-8");
}

function readRepo(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf-8");
}

describe("agentmemory Helm chart", () => {
  test("ships the expected chart files", () => {
    for (const relativePath of [
      "Chart.yaml",
      "values.yaml",
      "README.md",
      "templates/NOTES.txt",
      "templates/_helpers.tpl",
      "templates/deployment.yaml",
      "templates/ingress.yaml",
      "templates/networkpolicy.yaml",
      "templates/pvc.yaml",
      "templates/secret.yaml",
      "templates/service.yaml",
      "templates/serviceaccount.yaml",
    ]) {
      expect(existsSync(join(chartRoot, relativePath)), `${relativePath} should exist`).toBe(true);
    }
  });

  test("tracks package version and single-writer persistence defaults", () => {
    const packageJson = JSON.parse(readRepo("package.json")) as { version: string };
    const chart = readChart("Chart.yaml");
    const values = readChart("values.yaml");
    const helpers = readChart("templates/_helpers.tpl");

    expect(chart).toContain("apiVersion: v2");
    expect(chart).toContain("type: application");
    expect(chart).toContain(`appVersion: "${packageJson.version}"`);
    expect(values).toMatch(/^replicaCount: 1$/m);
    expect(values).toMatch(/repository: ""/);
    expect(values).toMatch(/enabled: true[\s\S]*accessModes:\n\s+- ReadWriteOnce[\s\S]*mountPath: \/data/);
    expect(values).toMatch(/strategy:\n\s+type: Recreate/);
    expect(helpers).toContain("replicaCount must be 1");
    expect(helpers).toContain("image.repository is required");
  });

  test("exposes only the REST service port by default", () => {
    const service = readChart("templates/service.yaml");
    const deployment = readChart("templates/deployment.yaml");
    const networkPolicy = readChart("templates/networkpolicy.yaml");

    expect(service).toContain("targetPort: http");
    expect(service).toContain("name: http");
    expect(service.match(/- port:/g)).toHaveLength(1);
    expect(service).not.toContain("3112");
    expect(service).not.toContain("3113");
    expect(service).not.toContain("9464");
    expect(service).not.toContain("viewer");
    expect(service).not.toContain("streams");
    expect(service).not.toContain("engine");
    expect(service).not.toContain("49134");
    expect(deployment).toContain("containerPort: 3111");
    expect(deployment).toContain("containerPort: 3113");
    expect(deployment).toContain("containerPort: 49134");
    for (const probe of ["startupProbe", "livenessProbe", "readinessProbe"]) {
      expect(deployment).toContain(`${probe}:`);
    }
    expect(deployment.match(/path: \/agentmemory\/livez/g)).toHaveLength(3);
    expect(networkPolicy).toContain("port: http");
  });

  test("wires HMAC secrets as files and provider secrets as secretKeyRef env vars", () => {
    const deployment = readChart("templates/deployment.yaml");
    const secret = readChart("templates/secret.yaml");
    const values = readChart("values.yaml");

    expect(deployment).toContain("AGENTMEMORY_HMAC_FILE");
    expect(deployment).toContain("/var/run/agentmemory-hmac/hmac");
    expect(deployment).toContain("name: hmac-secret");
    expect(deployment).not.toContain("name: AGENTMEMORY_SECRET");

    for (const envName of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "VOYAGE_API_KEY",
      "OPENROUTER_API_KEY",
    ]) {
      expect(deployment).toContain(`name: ${envName}`);
    }

    expect(deployment.match(/secretKeyRef:/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(deployment).toContain(".Values.secret.existingSecret");
    expect(secret).toContain("stringData:");
    expect(secret).toContain(".Values.secret.agentmemorySecret");
    expect(secret).not.toContain("openaiApiKey");
    expect(values).toMatch(/keys:\n\s+hmac: hmac\n\s+agentmemorySecret: ""\n\nenv:/);
  });

  test("documents image ownership, viewer access, TLS, and persistence limits", () => {
    const chartReadme = readChart("README.md");
    const deployReadme = readRepo("deploy/README.md");

    expect(chartReadme).toContain("Build an image");
    expect(chartReadme).toContain("kubectl port-forward deployment/agentmemory 3113:3113");
    expect(chartReadme).toContain("HTTPS");
    expect(chartReadme).toContain("non-loopback");
    expect(chartReadme).toContain("Helm release metadata");
    expect(chartReadme).toContain("ReadWriteOnce");
    expect(chartReadme).toContain("single-replica");
    expect(deployReadme).toContain("[Kubernetes / Helm](./helm/agentmemory/README.md)");
    expect(deployReadme).toContain("All deployments");
  });
});
