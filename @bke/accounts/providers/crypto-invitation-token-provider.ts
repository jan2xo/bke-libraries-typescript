import { createHash, randomBytes } from "node:crypto";
import type { AccountsInvitationTokenProvider } from "../logic/invitation-token-provider";

export function createCryptoAccountsInvitationTokenProvider(): AccountsInvitationTokenProvider {
  return Object.freeze({
    issue: () => {
      const rawToken = randomBytes(32).toString("base64url");
      return {
        rawToken,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      };
    },
  });
}
