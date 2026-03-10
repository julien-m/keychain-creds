#!/usr/bin/env node

// Cross-platform mock for credential backends.
// Replaces: macOS `security`, Linux `secret-tool`, Windows `powershell.exe`
//
// Controlled via env vars:
//   MOCK_SECRET       — the secret to return for get/read/lookup operations
//   MOCK_EXIT_CODE    — exit code to return (default 0)
//   MOCK_STDERR       — raw stderr message to write before exiting
//   MOCK_ERROR        — platform-aware error: "NOT_FOUND" or "ACCESS_DENIED"
//                       Automatically outputs the right stderr for the detected backend.

const args = process.argv.slice(2);
const subcommand = args[0];
const fullArgs = args.join(" ");

const mockExitCode = parseInt(process.env.MOCK_EXIT_CODE || "0", 10);
const mockStderr = process.env.MOCK_STDERR || "";
const mockSecret = process.env.MOCK_SECRET || "";
const mockError = process.env.MOCK_ERROR || "";

// Detect which backend is calling based on the subcommand/args pattern
function detectBackend() {
  if (["find-generic-password", "add-generic-password", "delete-generic-password"].includes(subcommand)) return "macos";
  if (["lookup", "store", "clear"].includes(subcommand)) return "linux";
  if (fullArgs.includes("[CredManager]")) return "windows";
  return "unknown";
}

const ERROR_MESSAGES = {
  NOT_FOUND: {
    macos: "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.\n",
    linux: "No such object in the secret service\n",
    windows: "NOT_FOUND\n",
  },
  ACCESS_DENIED: {
    macos: "security: User interaction is not allowed.\n",
    linux: "Access denied\n",
    windows: "ACCESS_DENIED\n",
  },
};

// --- MOCK_ERROR: platform-aware error simulation ---
if (mockError) {
  const backend = detectBackend();
  const messages = ERROR_MESSAGES[mockError];
  if (messages && messages[backend]) {
    process.stderr.write(messages[backend]);
  }
  process.exit(1);
}

// --- MOCK_STDERR + MOCK_EXIT_CODE: raw error pass-through ---
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
  process.stdin.on("data", () => {});
  process.stdin.on("end", () => process.exit(0));
  process.stdin.resume();
}

else if (subcommand === "clear") {
  process.exit(0);
}

// --- Windows `powershell.exe` mock ---

else if (fullArgs.includes("[CredManager]::Read(")) {
  process.stdout.write(mockSecret);
  process.exit(0);
}

else if (fullArgs.includes("[CredManager]::Write(")) {
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
