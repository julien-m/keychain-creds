export interface Backend {
  getPassword(
    service: string,
    account: string,
    timeoutMs?: number,
  ): Promise<string>;

  setPassword(
    service: string,
    account: string,
    secret: string,
    timeoutMs?: number,
  ): Promise<void>;

  deletePassword(
    service: string,
    account: string,
    timeoutMs?: number,
  ): Promise<void>;
}
