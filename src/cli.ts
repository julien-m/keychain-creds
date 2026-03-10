import { Command } from "commander";

import { CredsError, EXIT } from "./core/errors.js";
import { writeStderr } from "./core/stdio.js";
import { setCommand } from "./commands/set.js";
import { getCommand } from "./commands/get.js";
import { rmCommand } from "./commands/rm.js";
import { envCommand } from "./commands/env.js";

const program = new Command();

program
  .name("creds")
  .description(
    `Cross-platform credential manager (macOS Keychain, Windows Credential Manager, Linux Secret Service).

Entry format: namespace/env/name
Examples:
  myapp/dev/db_url
  shared/openrouter_api_key

Credential mapping: service = "creds:<entry>", account = $USER

Usage in shell:
  creds set shared/openrouter_api_key          # interactive masked input
  echo -n "sk-xxx" | creds set shared/openrouter_api_key  # piped input
  creds get shared/openrouter_api_key          # prints value to stdout
  OPENROUTER_API_KEY="$(creds get shared/openrouter_api_key)" command ...

Exit codes:
  0 = success
  1 = usage/validation error
  2 = not found
  3 = credential store locked/denied
  4 = unexpected error`,
  )
  .version("1.0.0")
  .option("--account <account>", "Keychain account (default: $USER)")
  .option("--timeout-ms <ms>", "Timeout in milliseconds", "10000")
  .enablePositionalOptions();

program
  .command("set")
  .description("Store a secret (stdin or interactive masked input)")
  .argument("<entry>", "Entry path (namespace/env/name)")
  .action(async (entry: string, _opts: unknown, cmd: Command) => {
    const parent = cmd.parent!;
    const globalOpts = parent.opts();
    const extraArgs = cmd.args.slice(1);
    await setCommand(entry, {
      account: globalOpts.account,
      timeoutMs: globalOpts.timeoutMs ? parseInt(globalOpts.timeoutMs) : undefined,
    }, extraArgs);
  });

program
  .command("get")
  .description("Retrieve a secret (stdout = value only)")
  .argument("<entry>", "Entry path (namespace/env/name)")
  .option("--no-newline", "Omit trailing newline")
  .option("--base64", "Base64-encode the value")
  .option("--json", "Output as JSON: { entry, value }")
  .option("--export <ENV_VAR>", "Output as ENV_VAR=value")
  .action(async (entry: string, opts: Record<string, unknown>, cmd: Command) => {
    const parent = cmd.parent!;
    const globalOpts = parent.opts();
    await getCommand(entry, {
      account: globalOpts.account as string | undefined,
      noNewline: opts.newline === false,
      base64: opts.base64 as boolean | undefined,
      json: opts.json as boolean | undefined,
      export: opts.export as string | undefined,
      timeoutMs: globalOpts.timeoutMs ? parseInt(globalOpts.timeoutMs) : undefined,
    });
  });

program
  .command("rm")
  .description("Remove a secret from Keychain")
  .argument("<entry>", "Entry path (namespace/env/name)")
  .action(async (entry: string, _opts: unknown, cmd: Command) => {
    const parent = cmd.parent!;
    const globalOpts = parent.opts();
    await rmCommand(entry, {
      account: globalOpts.account,
      timeoutMs: globalOpts.timeoutMs ? parseInt(globalOpts.timeoutMs) : undefined,
    });
  });

program
  .command("env")
  .description("Load .env file, resolve creds: references, and run a command")
  .option("--file <path>", "Path to env file", ".env")
  .option("--dry-run", "Show resolved variable names (without values)")
  .argument("[command...]", "Command to run with resolved environment")
  .passThroughOptions()
  .action(async (commandArgs: string[], opts: Record<string, unknown>, cmd: Command) => {
    const parent = cmd.parent!;
    const globalOpts = parent.opts();
    await envCommand(commandArgs, {
      file: opts.file as string | undefined,
      dryRun: opts.dryRun as boolean | undefined,
      account: globalOpts.account as string | undefined,
      timeoutMs: globalOpts.timeoutMs ? parseInt(globalOpts.timeoutMs) : undefined,
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CredsError) {
    writeStderr(`Error: ${err.message}`);
    process.exit(err.exitCode);
  }
  writeStderr(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(EXIT.UNEXPECTED);
});
