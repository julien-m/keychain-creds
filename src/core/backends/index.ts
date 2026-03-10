import { platform } from "node:os";

import type { Backend } from "./types.js";
import { CredsError, EXIT } from "../errors.js";

export type { Backend } from "./types.js";

type PlatformName = "macos" | "windows" | "linux";

let cachedBackendPromise: Promise<Backend> | undefined;
let cachedPlatform: PlatformName | undefined;

function detectPlatform(): PlatformName {
  const override = process.env.CREDS_BACKEND;
  if (override) {
    if (override === "macos" || override === "windows" || override === "linux") {
      return override;
    }
    throw new CredsError(
      `Invalid CREDS_BACKEND: "${override}". Must be macos, windows, or linux.`,
      EXIT.USAGE,
    );
  }

  const os = platform();
  switch (os) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    case "linux":
      return "linux";
    default:
      throw new CredsError(
        `Unsupported platform: ${os}. Supported: macOS, Windows, Linux.`,
        EXIT.USAGE,
      );
  }
}

async function loadBackend(name: PlatformName): Promise<Backend> {
  switch (name) {
    case "macos": {
      const { macosBackend } = await import("./macos.js");
      return macosBackend;
    }
    case "windows": {
      const { windowsBackend } = await import("./windows.js");
      return windowsBackend;
    }
    case "linux": {
      const { linuxBackend } = await import("./linux.js");
      return linuxBackend;
    }
  }
}

export function getBackend(): Promise<Backend> {
  if (cachedBackendPromise) return cachedBackendPromise;

  const name = detectPlatform();
  cachedPlatform = name;
  cachedBackendPromise = loadBackend(name);
  return cachedBackendPromise;
}

export function getPlatformName(): PlatformName {
  if (cachedPlatform) return cachedPlatform;
  cachedPlatform = detectPlatform();
  return cachedPlatform;
}
