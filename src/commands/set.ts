import { setPassword } from "../core/keychain.js";
import { writeStderr } from "../core/stdio.js";
import { toService, validateEntry, defaultAccount } from "../core/validation.js";
import { CredsError, EXIT } from "../core/errors.js";

export async function setCommand(
  entry: string,
  opts: { account?: string; timeoutMs?: number },
  extraArgs: string[],
): Promise<void> {
  if (extraArgs.length > 0) {
    throw new CredsError(
      "Do not pass the secret as an argument. Use stdin or interactive input.",
      EXIT.USAGE,
    );
  }

  const validEntry = validateEntry(entry);
  const account = opts.account || defaultAccount();
  const service = toService(validEntry);

  let secret: string;

  if (!process.stdin.isTTY) {
    secret = await readStdin();
  } else {
    secret = await readMasked();
  }

  if (secret.length === 0) {
    throw new CredsError("Secret cannot be empty", EXIT.USAGE);
  }

  await setPassword(service, account, secret, opts.timeoutMs);
  writeStderr(`Stored ${validEntry}`);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}

function readMasked(): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stderr.write("Enter secret: ");
    process.stdin.setRawMode!(true);
    process.stdin.resume();

    let secret = "";

    function handler(data: Buffer) {
      const str = data.toString("utf-8");

      for (const c of str) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          process.stdin.setRawMode!(false);
          process.stdin.pause();
          process.stdin.removeListener("data", handler);
          process.stderr.write("\n");
          resolve(secret);
          return;
        }

        if (c === "\u0003") {
          process.stdin.setRawMode!(false);
          process.stdin.pause();
          process.stdin.removeListener("data", handler);
          process.stderr.write("\n");
          reject(new CredsError("Aborted", EXIT.USAGE));
          return;
        }

        if (c === "\u007F" || c === "\b") {
          secret = secret.slice(0, -1);
          continue;
        }

        secret += c;
      }
    }

    process.stdin.on("data", handler);
  });
}
