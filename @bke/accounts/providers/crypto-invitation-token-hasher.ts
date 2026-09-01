import { createHash } from "node:crypto";
import type { AccountsInvitationTokenHasher } from "../logic/invitation-token-hasher";

export function createCryptoAccountsInvitationTokenHasher(): AccountsInvitationTokenHasher {
  return Object.freeze({
    hash: (rawToken: string) => createHash("sha256").update(rawToken).digest("hex"),
  });
}
