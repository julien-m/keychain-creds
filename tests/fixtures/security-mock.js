#!/usr/bin/env node

// Cross-platform mock for credential backends.
// Replaces: macOS `security`, Linux `secret-tool`, Windows `powershell.exe`
//
// Controlled via env vars:
//   MOCK_SECRET       — the secret to return for get/read/lookup operations
//   MOCK_EXIT_CODE    — exit code to return (default 0)
//   MOCK_STDERR       — stderr message to write before exiting

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

// --- macOS `security` subcommands ---

if (subcommand === "find-generic-password") {
  process.stdout.write(mockSecret + "\n");
  process.exit(0);
}

if (subcommand === "add-generic-password") {
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

// --- Linux `secret-tool` subcommands ---

if (subcommand === "lookup") {
  if (mockSecret) {
    process.stdout.write(mockSecret + "\n");
  }
  process.exit(0);
}

if (subcommand === "store") {
  // secret-tool store reads the secret from stdin — consume it then exit
  process.stdin.on("data", () => {});
  process.stdin.on("end", () => process.exit(0));
  process.stdin.resume();
}

else if (subcommand === "clear") {
  process.exit(0);
}

// --- Windows `powershell.exe` mock ---
// The Windows backend sends the PS script as the last argument.
// When CREDS_PS_BIN overrides powershell.exe, PS_ARGS are skipped,
// so the script is passed directly as args[0].
// Detect CredManager operations by pattern matching the script text.

else {
  const fullArgs = args.join(" ");

  if (fullArgs.includes("[CredManager]::Read(")) {
    process.stdout.write(mockSecret);
    process.exit(0);
  }

  if (fullArgs.includes("[CredManager]::Write(")) {
    // The Windows backend sends the secret via stdin
    process.stdin.on("data", () => {});
    process.stdin.on("end", () => process.exit(0));
    process.stdin.resume();
  }

  else if (fullArgs.includes("[CredManager]::Delete(")) {
    process.exit(0);
  }

  else {
    process.stderr.write(`security-mock: unknown command: ${subcommand}\n`);
    process.exit(1);
  }
}
