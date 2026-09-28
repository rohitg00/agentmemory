import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { rebuildAllProjectSessionIndexes } from "../state/session-index.js";

export function registerSessionIndexMaintenanceFunction(
  sdk: IIIClient,
  kv: StateKV,
): void {
  sdk.registerFunction(
    "mem::diagnostic::session-index-rebuild",
    async (): Promise<{
      success: true;
      projects: number;
      sessions: number;
    }> => {
      const result = await rebuildAllProjectSessionIndexes(kv);
      return { success: true, ...result };
    },
  );
}
