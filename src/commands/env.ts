import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { parseEnvFile } from "../core/envfile.js";
import { getPassword } from "../core/keychain.js";
import { writeStderr } from "../core/stdio.js";
import { toService, defaultAccount } from "../core/validation.js";
import { CredsError, EXIT } from "../core/errors.js";

export async function envCommand(
  commandArgs: string[],
  opts: {
    file?: string;
    dryRun?: boolean;
    account?: string;
    timeoutMs?: number;
  },
): Promise<void> {
  const filePath = resolve(opts.file || ".env");

  if (!existsSync(filePath)) {
    throw new CredsError(`File not found: ${filePath}`, EXIT.USAGE);
  }

  const content = readFileSync(filePath, "utf-8");
  const entries = parseEnvFile(content, opts.file || ".env");

  if (opts.dryRun) {
    for (const entry of entries) {
      const source = entry.credsEntry ? `creds:${entry.credsEntry}` : "literal";
      writeStderr(`${entry.key} (${source})`);
    }
    return;
  }

  if (commandArgs.length === 0) {
    throw new CredsError(
      "No command specified. Usage: creds env [--file .env] -- <command...>",
      EXIT.USAGE,
    );
  }

  const account = opts.account || defaultAccount();
  const resolvedEnv: Record<string, string> = {};

  // Resolve all creds entries in parallel
  const credsEntries = entries.filter((e) => e.credsEntry);
  const resolvedSecrets = await Promise.all(
    credsEntries.map(async (e) => {
      const service = toService(e.credsEntry!);
      const value = await getPassword(service, account, opts.timeoutMs);
      return { key: e.key, value };
    }),
  );

  const secretsMap = new Map(resolvedSecrets.map((s) => [s.key, s.value]));

  for (const entry of entries) {
    if (entry.credsEntry) {
      resolvedEnv[entry.key] = secretsMap.get(entry.key)!;
    } else {
      resolvedEnv[entry.key] = entry.rawValue;
    }
  }

  const [cmd, ...args] = commandArgs;
  const child = spawn(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...resolvedEnv },
  });

  child.on("error", (err) => {
    writeStderr(`Failed to start command: ${err.message}`);
    process.exit(EXIT.UNEXPECTED);
  });

  child.on("close", (code) => {
    process.exit(code ?? EXIT.UNEXPECTED);
  });
}
