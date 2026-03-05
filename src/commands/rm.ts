import { deletePassword } from "../core/keychain.js";
import { writeStderr } from "../core/stdio.js";
import { toService, validateEntry, defaultAccount } from "../core/validation.js";

export async function rmCommand(
  entry: string,
  opts: { account?: string; timeoutMs?: number },
): Promise<void> {
  const validEntry = validateEntry(entry);
  const account = opts.account || defaultAccount();
  const service = toService(validEntry);

  await deletePassword(service, account, opts.timeoutMs);
  writeStderr(`Removed ${validEntry}`);
}
