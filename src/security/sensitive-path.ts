const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(^|[\\/_.-])secret([\\/_.-]|s?$)/i,
  /(^|[\\/_.-])credentials?([\\/_.-]|$)/i,
  /(^|[\\/_.-])private[_-]?key([\\/_.-]|$)/i,
  /(^|[\\/])\.env(\.[\w-]+)?$/i,
  /(^|[\\/_.-])id_rsa([\\/_.-]|$)/i,
  /(^|[\\/])auth[_-]?token([\\/_.-]|$)/i,
  /(^|[\\/])bearer[_-]?token([\\/_.-]|$)/i,
  /(^|[\\/])access[_-]?token([\\/_.-]|$)/i,
  /(^|[\\/])api[_-]?token([\\/_.-]|$)/i,
];

export function isSensitive(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((re) => re.test(path));
}
