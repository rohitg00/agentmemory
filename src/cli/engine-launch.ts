import { join } from "node:path";

export function runtimeConfigPath(dataDir: string): string {
  return join(dataDir, "iii-config.runtime.yaml");
}

const CREDENTIAL_URL_PATTERN = /:\/\/[^@\s/]*@/g;

export function redactCredentialUrls(text: string): string {
  return text.replace(CREDENTIAL_URL_PATTERN, "://***@");
}
