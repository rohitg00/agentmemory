export const lifecycleFixture = {
  version: "coding-memory-lifecycle-v1",
  project: "orbit-eval",
  otherProject: "quartz-eval",
  oldPolicy: "Orbit dependency installation policy for development and continuous integration. Keep the dependency graph reproducible on every clean checkout. Review the lockfile when updating libraries. All contributors must use the approved installation command. Approved command: `npm ci`.",
  newPolicy: "Orbit dependency installation policy for development and continuous integration. Keep the dependency graph reproducible on every clean checkout. Review the lockfile when updating libraries. All contributors must use the approved installation command. Approved command: `pnpm install --frozen-lockfile`.",
  otherPolicy: "Quartz dependency installation policy. Approved command: `yarn install --immutable`.",
  disposable: "The temporary kestrel beacon for the preview environment is lavender. Delete this diagnostic note after testing.",
  captured: "Orbit release smoke checks must verify the lighthouse route before deployment.",
};

export function commandFromRetrievedText(texts: string[]): string | null {
  const commands = new Set(texts.flatMap((text) => [...text.matchAll(/Approved command: `([^`]+)`/g)].map((match) => match[1])));
  if (commands.size !== 1) return null;
  const command = [...commands][0];
  return ["npm ci", "pnpm install --frozen-lockfile", "yarn install --immutable"].includes(command) ? command : null;
}
