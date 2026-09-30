const DEFAULT_REST_PORT = 3111;

export function portFlagSuffix(restPort: number, instance: number): string {
  if (instance > 0 && restPort === DEFAULT_REST_PORT + instance * 100) {
    return ` --instance ${instance}`;
  }
  return restPort === DEFAULT_REST_PORT ? "" : ` --port ${restPort}`;
}
