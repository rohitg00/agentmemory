export interface TriggerRegistration {
  type: string;
  function_id: string;
  config: Record<string, unknown>;
}

export interface ObserverSource {
  function_id: string;
  args?: Record<string, unknown>;
}

export type HttpRegistration =
  | { transport: "trigger"; registration: TriggerRegistration }
  | {
      transport: "observer";
      source: ObserverSource;
      target: string;
      options?: Record<string, unknown>;
    };

function routeIdentity(row: HttpRegistration): string {
  const args = row.transport === "trigger" ? row.registration.config : row.source.args;
  const method = args?.[row.transport === "trigger" ? "http_method" : "method"] ?? "GET";
  const path = args?.[row.transport === "trigger" ? "api_path" : "path"];
  const target = row.transport === "trigger" ? row.registration.function_id : row.target;
  if (typeof method !== "string" || !method || typeof path !== "string" || !path || !target) {
    throw new Error("Incomplete HTTP registration");
  }
  return JSON.stringify([method.toUpperCase(), path]);
}

export function createHttpRegistrationRecorder() {
  const rows: HttpRegistration[] = [];
  return {
    recordTrigger(registration: TriggerRegistration): void {
      if (registration.type === "http") {
        rows.push({ transport: "trigger", registration: structuredClone(registration) });
      }
    },
    recordObserver(source: ObserverSource, target: string, options?: Record<string, unknown>): void {
      if (source.function_id === "http::on-request") {
        rows.push(structuredClone({ transport: "observer", source, target, options }));
      }
    },
    snapshot(): HttpRegistration[] {
      if (rows.length === 0) throw new Error("No HTTP registrations captured");
      const seen = new Set<string>();
      for (const row of rows) {
        const identity = routeIdentity(row);
        if (seen.has(identity)) throw new Error(`Duplicate HTTP registration: ${identity}`);
        seen.add(identity);
      }
      return structuredClone(rows);
    },
  };
}
