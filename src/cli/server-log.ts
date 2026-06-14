import {
  appendFileSync,
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

type WritableStream = Pick<NodeJS.WriteStream, "write">;

export function serverLogPath(homeDir = homedir()): string {
  return join(homeDir, ".agentmemory", "logs", "server.log");
}

function chmodPrivate(path: string, mode: number): void {
  if (platform() === "win32") return;
  chmodSync(path, mode);
}

function prepareServerLogFile(logPath: string): void {
  const logDir = dirname(logPath);
  const stateDir = dirname(logDir);
  mkdirSync(stateDir, { recursive: true, mode: PRIVATE_DIR_MODE });
  chmodPrivate(stateDir, PRIVATE_DIR_MODE);

  mkdirSync(logDir, { recursive: true, mode: PRIVATE_DIR_MODE });
  chmodPrivate(logDir, PRIVATE_DIR_MODE);

  const fd = openSync(logPath, "a", PRIVATE_FILE_MODE);
  closeSync(fd);
  chmodPrivate(logPath, PRIVATE_FILE_MODE);
}

export function writeServerLog(chunk: string | Uint8Array, logPath = serverLogPath()): void {
  try {
    prepareServerLogFile(logPath);
    appendFileSync(logPath, chunk, { mode: PRIVATE_FILE_MODE });
  } catch {}
}

let serverLogTeeInstalled = false;

export function resetServerLogTeeForTests(): void {
  serverLogTeeInstalled = false;
}

export function setupServerLogTee(
  options: {
    stdout?: WritableStream;
    stderr?: WritableStream;
    logPath?: string;
    now?: () => Date;
    pid?: number;
  } = {},
): boolean {
  if (serverLogTeeInstalled) return false;
  serverLogTeeInstalled = true;

  const logPath = options.logPath ?? serverLogPath();
  const now = options.now ?? (() => new Date());
  const pid = options.pid ?? process.pid;

  writeServerLog(
    `[agentmemory] --- server process started ${now().toISOString()} pid=${pid} ---\n`,
    logPath,
  );

  teeStream(options.stdout ?? process.stdout, logPath);
  teeStream(options.stderr ?? process.stderr, logPath);
  return true;
}

function teeStream(stream: WritableStream, logPath: string): void {
  const originalWrite = stream.write.bind(stream);
  stream.write = ((chunk: string | Uint8Array, encodingOrCallback?: unknown, callback?: unknown) => {
    writeServerLog(chunk, logPath);
    return originalWrite(
      chunk,
      encodingOrCallback as BufferEncoding,
      callback as ((err?: Error) => void) | undefined,
    );
  }) as typeof stream.write;
}
