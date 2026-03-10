import { execFile, spawn } from "node:child_process";

import type { Backend } from "./types.js";
import { CredsError, EXIT } from "../errors.js";

const SECRET_TOOL = "secret-tool";
const DEFAULT_TIMEOUT = 10_000;

function mapLinuxError(stderr: string, code?: string): CredsError {
  const msg = stderr.trim().toLowerCase();

  if (code === "ENOENT") {
    return new CredsError(
      "secret-tool not found. Install libsecret-tools (Debian/Ubuntu) or libsecret (Arch).",
      EXIT.UNEXPECTED,
    );
  }

  if (
    msg.includes("no such object") ||
    msg.includes("not found") ||
    msg.includes("no matching")
  ) {
    return new CredsError("Entry not found in Secret Service", EXIT.NOT_FOUND);
  }

  if (
    msg.includes("is not provided") ||
    msg.includes("permission") ||
    msg.includes("access denied") ||
    msg.includes("not allowed")
  ) {
    return new CredsError(
      "Secret Service access denied",
      EXIT.KEYCHAIN_DENIED,
    );
  }

  if (msg.includes("d-bus") || msg.includes("dbus")) {
    return new CredsError(
      "D-Bus session not available. Secret Service requires a running session.",
      EXIT.UNEXPECTED,
    );
  }

  return new CredsError(
    `Secret Service error: ${stderr.trim() || "unknown error"}`,
    EXIT.UNEXPECTED,
  );
}

function run(
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      SECRET_TOOL,
      args,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code;
          reject(mapLinuxError(stderr || error.message, code));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function runWithStdin(
  args: string[],
  stdin: string,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(SECRET_TOOL, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(mapLinuxError("Operation timed out"));
    }, timeoutMs);

    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("error", (err) => {
      clearTimeout(timer);
      const code = (err as NodeJS.ErrnoException).code;
      reject(mapLinuxError(err.message, code));
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (exitCode !== 0) {
        reject(mapLinuxError(stderr || `Process exited with code ${exitCode}`));
        return;
      }
      resolve();
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

export const linuxBackend: Backend = {
  async getPassword(
    service: string,
    account: string,
    timeoutMs?: number,
  ): Promise<string> {
    const stdout = await run(
      ["lookup", "service", service, "account", account],
      timeoutMs,
    );
    const value = stdout.replace(/\n$/, "");
    // secret-tool returns exit 0 with empty stdout when no match found
    if (value.length === 0) {
      throw new CredsError("Entry not found in Secret Service", EXIT.NOT_FOUND);
    }
    return value;
  },

  async setPassword(
    service: string,
    account: string,
    secret: string,
    timeoutMs?: number,
  ): Promise<void> {
    await runWithStdin(
      ["store", "--label", service, "service", service, "account", account],
      secret,
      timeoutMs,
    );
  },

  async deletePassword(
    service: string,
    account: string,
    timeoutMs?: number,
  ): Promise<void> {
    await run(
      ["clear", "service", service, "account", account],
      timeoutMs,
    );
  },
};
