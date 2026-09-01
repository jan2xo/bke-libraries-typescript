import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { IdentityEmailMfaChallengeMaterialProvider } from "../logic/email-mfa-challenge-material-provider";

export function createHmacEmailMfaChallengeMaterialProvider(
  sessionSecret: string,
  mfaEncryptionKey?: string,
): IdentityEmailMfaChallengeMaterialProvider {
  if (!sessionSecret) {
    throw new Error("Identity session secret is required.");
  }

  const mfaKey = createHash("sha256")
    .update(mfaEncryptionKey || sessionSecret)
    .digest();

  const hashToken = (token: string) =>
    createHmac("sha256", sessionSecret).update(token).digest("hex");

  const emailOtpForChallenge = (token: string) => {
    const digest = createHmac("sha256", mfaKey)
      .update(`admin-email-otp:${token}`)
      .digest();
    return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
  };

  const hashEmailOtp = (code: string) =>
    createHmac("sha256", mfaKey)
      .update(`admin-email-otp-code:${code.trim().replace(/\s/g, "")}`)
      .digest("hex");

  return Object.freeze({
    issue() {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashToken(token);
      const code = emailOtpForChallenge(token);
      return {
        challengeId: randomUUID(),
        token,
        tokenHash,
        code,
        codeHash: hashEmailOtp(code),
        reference: tokenHash.slice(0, 6).toUpperCase(),
      };
    },
  });
}
