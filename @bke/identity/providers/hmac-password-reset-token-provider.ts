import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { IdentityPasswordResetTokenProvider } from "../logic/password-reset-token-provider";

export function createHmacPasswordResetTokenProvider(
  sessionSecret: string,
): IdentityPasswordResetTokenProvider {
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
