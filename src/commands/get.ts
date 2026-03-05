import { getPassword } from "../core/keychain.js";
import { writeStdout } from "../core/stdio.js";
import { toService, validateEntry, defaultAccount } from "../core/validation.js";

export async function getCommand(
  entry: string,
  opts: {
    account?: string;
    noNewline?: boolean;
    base64?: boolean;
    json?: boolean;
    export?: string;
    timeoutMs?: number;
  },
): Promise<void> {
  const validEntry = validateEntry(entry);
  const account = opts.account || defaultAccount();
  const service = toService(validEntry);

  let value = await getPassword(service, account, opts.timeoutMs);

  if (opts.base64) {
    value = Buffer.from(value, "utf-8").toString("base64");
  }

  if (opts.json) {
    const output = JSON.stringify({ entry: validEntry, value });
    writeStdout(output, !!opts.noNewline);
    return;
  }

  if (opts.export) {
    const envVar = opts.export;
    writeStdout(`${envVar}=${value}`, !!opts.noNewline);
    return;
  }

  writeStdout(value, !!opts.noNewline);
}
