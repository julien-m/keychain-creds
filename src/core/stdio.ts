export function writeStdout(value: string, noNewline: boolean): void {
  process.stdout.write(noNewline ? value : value + "\n");
}

export function writeStderr(message: string): void {
  process.stderr.write(message + "\n");
}
