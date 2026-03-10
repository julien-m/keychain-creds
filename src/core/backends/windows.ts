import { execFile, spawn } from "node:child_process";

import type { Backend } from "./types.js";
import { CredsError, EXIT } from "../errors.js";
import { resolveExec } from "./exec.js";

const DEFAULT_TIMEOUT = 10_000;
const PS = process.env.CREDS_PS_BIN || "powershell.exe";
const PS_ARGS_DEFAULT = ["-NoProfile", "-NonInteractive", "-Command"];

// When using a mock (.js file), we don't prepend PowerShell-specific args
const PS_ARGS = PS.endsWith(".js") ? [] : PS_ARGS_DEFAULT;

const CRED_TYPE = `
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class CredManager {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredRead(string target, int type, int flags, out IntPtr credential);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredWrite(ref CREDENTIAL credential, int flags);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredDelete(string target, int type, int flags);

    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr buffer);

    public static string Read(string target) {
        IntPtr ptr;
        if (!CredRead(target, 1, 0, out ptr)) {
            int err = Marshal.GetLastWin32Error();
            if (err == 1168) throw new Exception("NOT_FOUND");
            if (err == 5) throw new Exception("ACCESS_DENIED");
            throw new Exception("WIN32_ERROR:" + err);
        }
        try {
            var cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            if (cred.CredentialBlobSize <= 0) return "";
            return Marshal.PtrToStringUni(cred.CredentialBlob, cred.CredentialBlobSize / 2);
        } finally {
            CredFree(ptr);
        }
    }

    public static void Write(string target, string user, string secret) {
        byte[] bytes = Encoding.Unicode.GetBytes(secret);
        var cred = new CREDENTIAL();
        cred.Type = 1;
        cred.TargetName = target;
        cred.UserName = user;
        cred.CredentialBlobSize = bytes.Length;
        cred.CredentialBlob = Marshal.AllocHGlobal(bytes.Length);
        cred.Persist = 2;
        try {
            Marshal.Copy(bytes, 0, cred.CredentialBlob, bytes.Length);
            if (!CredWrite(ref cred, 0)) {
                int err = Marshal.GetLastWin32Error();
                if (err == 5) throw new Exception("ACCESS_DENIED");
                throw new Exception("WIN32_ERROR:" + err);
            }
        } finally {
            Marshal.FreeHGlobal(cred.CredentialBlob);
        }
    }

    public static void Delete(string target) {
        if (!CredDelete(target, 1, 0)) {
            int err = Marshal.GetLastWin32Error();
            if (err == 1168) throw new Exception("NOT_FOUND");
            if (err == 5) throw new Exception("ACCESS_DENIED");
            throw new Exception("WIN32_ERROR:" + err);
        }
    }
}
"@
`;

function mapWindowsError(stderr: string): CredsError {
  const msg = stderr.trim();

  if (msg.includes("NOT_FOUND")) {
    return new CredsError("Entry not found in Credential Manager", EXIT.NOT_FOUND);
  }

  if (msg.includes("ACCESS_DENIED")) {
    return new CredsError(
      "Credential Manager access denied",
      EXIT.KEYCHAIN_DENIED,
    );
  }

  return new CredsError(
    `Credential Manager error: ${msg}`,
    EXIT.UNEXPECTED,
  );
}

function runPs(
  script: string,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<string> {
  const [bin, resolvedArgs] = resolveExec(PS, [...PS_ARGS, script]);
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      resolvedArgs,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(mapWindowsError(stderr || error.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function runPsWithStdin(
  script: string,
  stdin: string,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<string> {
  const [bin, resolvedArgs] = resolveExec(PS, [...PS_ARGS, script]);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, resolvedArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(mapWindowsError("Operation timed out"));
    }, timeoutMs);

    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(mapWindowsError(err.message));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(mapWindowsError(stderr || `Process exited with code ${code}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

export const windowsBackend: Backend = {
  async getPassword(
    service: string,
    account: string,
    timeoutMs?: number,
  ): Promise<string> {
    const script = `${CRED_TYPE}
try {
  $result = [CredManager]::Read("${escapePs(service)}")
  [Console]::Out.Write($result)
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}`;
    const result = await runPs(script, timeoutMs);
    return result;
  },

  async setPassword(
    service: string,
    account: string,
    secret: string,
    timeoutMs?: number,
  ): Promise<void> {
    const script = `${CRED_TYPE}
try {
  $secret = [Console]::In.ReadToEnd()
  [CredManager]::Write("${escapePs(service)}", "${escapePs(account)}", $secret)
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}`;
    await runPsWithStdin(script, secret, timeoutMs);
  },

  async deletePassword(
    service: string,
    account: string,
    timeoutMs?: number,
  ): Promise<void> {
    const script = `${CRED_TYPE}
try {
  [CredManager]::Delete("${escapePs(service)}")
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}`;
    await runPs(script, timeoutMs);
  },
};

function escapePs(value: string): string {
  return value
    .replace(/`/g, "``")
    .replace(/"/g, '`"')
    .replace(/\$/g, "`$")
    .replace(/\0/g, "`0")
    .replace(/\n/g, "`n")
    .replace(/\r/g, "`r")
    .replace(/\t/g, "`t");
}
