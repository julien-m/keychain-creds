import { platform } from "node:os";

export function assertMacOS(): void {
  if (platform() !== "darwin") {
    process.stderr.write("Error: creds requires macOS (Keychain)\n");
    process.exit(1);
  }
}
