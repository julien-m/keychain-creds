#!/usr/bin/env node

// Mock of macOS `security` binary for testing.
// Controlled via env vars:
//   MOCK_SECRET       — the secret to return for find-generic-password
//   MOCK_EXIT_CODE    — exit code to return (default 0)
//   MOCK_STDERR       — stderr message to write before exiting
//   MOCK_STORE        — if "1", accept add-generic-password silently
//   MOCK_DELETE       — if "1", accept delete-generic-password silently

const args = process.argv.slice(2);
const subcommand = args[0];

const mockExitCode = parseInt(process.env.MOCK_EXIT_CODE || "0", 10);
const mockStderr = process.env.MOCK_STDERR || "";
const mockSecret = process.env.MOCK_SECRET || "";

if (mockStderr) {
  process.stderr.write(mockStderr);
}

if (mockExitCode !== 0) {
  process.exit(mockExitCode);
}

if (subcommand === "find-generic-password") {
  process.stdout.write(mockSecret + "\n");
  process.exit(0);
}

if (subcommand === "add-generic-password") {
  // Verify -w flag is present (secret passed as argument to security)
  const wIndex = args.indexOf("-w");
  if (wIndex === -1) {
    process.stderr.write("security: missing -w flag\n");
    process.exit(1);
  }
  process.exit(0);
}

if (subcommand === "delete-generic-password") {
  process.exit(0);
}

process.stderr.write(`security-mock: unknown subcommand ${subcommand}\n`);
process.exit(1);
