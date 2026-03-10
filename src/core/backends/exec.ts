/**
 * Resolves executable path for cross-platform mock support.
 * When an override env var points to a .js file, it needs to be run via `node`.
 * Real binaries (security, secret-tool, powershell.exe) are unaffected.
 */
export function resolveExec(bin: string, args: string[]): [string, string[]] {
  if (bin.endsWith(".js")) {
    return ["node", [bin, ...args]];
  }
  return [bin, args];
}
