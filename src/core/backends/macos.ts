import { execFile } from "node:child_process";

import type { Backend } from "./types.js";
import { mapSecurityError } from "../errors.js";
import { resolveExec } from "./exec.js";

const SECURITY_BIN = process.env.CREDS_SECURITY_BIN || "security";
const DEFAULT_TIMEOUT = 10_000;

function run(
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string }> {
  const [bin, resolvedArgs] = resolveExec(SECURITY_BIN, args);
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      resolvedArgs,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(mapSecurityError(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

const SECURITY_HEX_RE = /^0x([0-9a-fA-F]+)$/;

function unescapeSecurityQuotedValue(value: string): string {
  return value.replace(/\\(["\\])/g, "$1");
}

function parseSecurityPassword(stderr: string): string {
  const line = stderr.split(/\r?\n/).find((entry) => entry.startsWith("password: "));
  if (!line) return "";
  const raw = line.slice("password: ".length);
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return unescapeSecurityQuotedValue(raw.slice(1, -1));
  }
  const hexMatch = raw.match(SECURITY_HEX_RE);
  if (hexMatch && hexMatch[1].length % 2 === 0) {
    return Buffer.from(hexMatch[1], "hex").toString("utf-8");
  }
  return raw;
}

export const macosBackend: Backend = {
  async setPassword(
    service: string,
    account: string,
    secret: string,
    timeoutMs?: number,
  ): Promise<void> {
    // Note: macOS `security` CLI requires -w <password> as an argument.
    // There is no stdin mode. The secret is briefly visible in the process
    // list. Avoiding this would require the Security Framework C API.
    await run(
      [
        "add-generic-password",
        "-s", service,
        "-a", account,
        "-w", secret,
        "-U",
      ],
      timeoutMs,
    );
  },

  async getPassword(
    service: string,
    account: string,
    timeoutMs?: number,
  ): Promise<string> {
    const { stderr } = await run(
      [
        "find-generic-password",
        "-s", service,
        "-a", account,
        "-g",
      ],
      timeoutMs,
    );
    return parseSecurityPassword(stderr);
  },

  async deletePassword(
    service: string,
    account: string,
    timeoutMs?: number,
  ): Promise<void> {
    await run(
      [
        "delete-generic-password",
        "-s", service,
        "-a", account,
      ],
      timeoutMs,
    );
  },
};
