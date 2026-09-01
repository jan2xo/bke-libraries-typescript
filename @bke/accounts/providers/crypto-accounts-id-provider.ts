import { randomUUID } from "node:crypto";
import type { AccountsIdProvider } from "../logic/accounts-id-provider";

export function createCryptoAccountsIdProvider(): AccountsIdProvider {
  return Object.freeze({
    issue: () => randomUUID(),
  });
}
