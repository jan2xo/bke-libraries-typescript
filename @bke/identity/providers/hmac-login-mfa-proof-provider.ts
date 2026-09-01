import type { IdentityLoginMfaProofProvider } from "../logic/login-mfa-proof-provider";
import { createHmacEmailMfaProofProvider } from "./hmac-email-mfa-proof-provider";

export function createHmacLoginMfaProofProvider(
  sessionSecret: string,
  mfaEncryptionKey?: string,
): IdentityLoginMfaProofProvider {
  return createHmacEmailMfaProofProvider(sessionSecret, mfaEncryptionKey);
}
