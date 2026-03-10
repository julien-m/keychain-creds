import { execFile } from "node:child_process";

import type { Backend } from "./types.js";
import { mapSecurityError } from "../errors.js";

const SECURITY_BIN = process.env.CREDS_SECURITY_BIN || "security";
const DEFAULT_TIMEOUT = 10_000;

function run(
  args: string[],
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      SECURITY_BIN,
      args,
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

const HEX_RE = /^[0-9a-fA-F]+$/;

function decodeHexIfNeeded(raw: string): string {
  if (raw.length >= 2 && raw.length % 2 === 0 && HEX_RE.test(raw)) {
    try {
      const decoded = Buffer.from(raw, "hex").toString("utf-8");
      if (!decoded.includes("\uFFFD") && /^[\x20-\x7E\t\n\r]+$/.test(decoded)) {
        return decoded;
      }
    } catch {
      // Not valid hex, return as-is
    }
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
    const { stdout } = await run(
      [
        "find-generic-password",
        "-s", service,
        "-a", account,
        "-w",
      ],
      timeoutMs,
    );
    const raw = stdout.replace(/\n$/, "");
    return decodeHexIfNeeded(raw);
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
