import { getPassword } from "../core/keychain.js";
import { writeStdout } from "../core/stdio.js";
import { toService, validateEntry, defaultAccount } from "../core/validation.js";
import { CredsError, EXIT } from "../core/errors.js";

const ENV_VAR_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

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
    if (!ENV_VAR_RE.test(envVar)) {
      throw new CredsError(`Invalid environment variable name: ${envVar}`, EXIT.USAGE);
    }
    writeStdout(`${envVar}=${shellQuote(value)}`, !!opts.noNewline);
    return;
  }

  writeStdout(value, !!opts.noNewline);
}
