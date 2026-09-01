import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { IdentityMagicLoginTokenProvider } from "../logic/magic-login-token-provider";

export function createHmacMagicLoginTokenProvider(
  sessionSecret: string,
): IdentityMagicLoginTokenProvider {
  if (!sessionSecret) {
    throw new Error("Identity session secret is required.");
  }

  const hash = (token: string) =>
    createHmac("sha256", sessionSecret).update(token).digest("hex");

  return Object.freeze({
    issue() {
      const token = randomBytes(32).toString("base64url");
      return {
        tokenId: randomUUID(),
        token,
        tokenHash: hash(token),
      };
    },
    hash,
  });
}
