import { getBackend } from "./backends/index.js";

export async function setPassword(
  service: string,
  account: string,
  secret: string,
  timeoutMs?: number,
): Promise<void> {
  const backend = await getBackend();
  await backend.setPassword(service, account, secret, timeoutMs);
}

export async function getPassword(
  service: string,
  account: string,
  timeoutMs?: number,
): Promise<string> {
  const backend = await getBackend();
  return backend.getPassword(service, account, timeoutMs);
}

export async function deletePassword(
  service: string,
  account: string,
  timeoutMs?: number,
): Promise<void> {
  const backend = await getBackend();
  await backend.deletePassword(service, account, timeoutMs);
}
