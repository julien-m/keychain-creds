import { execFile } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";

const PROJECT_ROOT = join(import.meta.dirname, "../..");
const CLI_PATH = join(PROJECT_ROOT, "dist/cli.js");
const MOCK_PATH = join(PROJECT_ROOT, "tests/fixtures/security-mock.js");

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function createMockKeychainPath(): string {
  return join(tmpdir(), `creds-test-${randomBytes(4).toString("hex")}.json`);
}

export function cleanupMockKeychain(path: string): void {
  if (existsSync(path)) {
    try { unlinkSync(path); } catch {}
  }
}

export function runCLI(
  args: string[],
  opts: {
    mockKeychainPath?: string;
    stdin?: string;
    locked?: boolean;
    env?: Record<string, string>;
  } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      CREDS_SECURITY_BIN: MOCK_PATH,
      ...(opts.mockKeychainPath ? { MOCK_KEYCHAIN_PATH: opts.mockKeychainPath } : {}),
      ...(opts.locked ? { MOCK_KEYCHAIN_LOCKED: "1" } : {}),
      ...(opts.env || {}),
    };

    const child = execFile(
      "node",
      [CLI_PATH, ...args],
      { env, timeout: 10_000 },
      (error, stdout, stderr) => {
        const exitCode = error?.code
          ? (typeof error.code === "number" ? error.code : 1)
          : 0;
        resolve({ stdout, stderr, exitCode: (error as any)?.status ?? exitCode });
      },
    );

    if (opts.stdin !== undefined) {
      child.stdin?.write(opts.stdin);
      child.stdin?.end();
    }
  });
}
