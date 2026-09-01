import type {
  IdentityPasswordResetRequestCapability,
  IdentityPasswordResetRequestInput,
  IdentityPasswordResetRequestResult,
} from "../contracts/password-reset-request.contract";
import type { IdentityPasswordResetRequestRepository } from "./password-reset-request-repository";
import type { IdentityPasswordResetTokenProvider } from "./password-reset-token-provider";

const MAX_EMAIL_LENGTH = 254;
const BASIC_EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 30 * 60 * 1000;

function normalizeEmail(rawEmail: string): string | null {
  const email = rawEmail.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !BASIC_EMAIL_SHAPE.test(email)) {
    return null;
  }
  return email;
}

export function createIdentityPasswordResetRequestCapability(
  repository: IdentityPasswordResetRequestRepository,
  tokenProvider: IdentityPasswordResetTokenProvider,
  clock: () => Date = () => new Date(),
): IdentityPasswordResetRequestCapability {
  return Object.freeze({
    async request(
      input: IdentityPasswordResetRequestInput,
    ): Promise<IdentityPasswordResetRequestResult> {
      const email = normalizeEmail(input.email);
      if (!email) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let principal;
      try {
        principal = await repository.findPrincipalByEmail(email);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      // Preserve enumeration resistance: an unknown address is still accepted,
      // but there is no trusted-boundary delivery material to send.
      if (!principal) {
        return { status: "ACCEPTED", delivery: null };
      }

      let material;
      try {
        material = tokenProvider.issue();
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      try {
        await repository.createToken({
          id: material.tokenId,
          userId: principal.id,
          tokenHash: material.tokenHash,
          expiresAt: new Date(clock().getTime() + TOKEN_TTL_MS),
        });
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      return {
        status: "ACCEPTED",
        delivery: {
          recipientEmail: principal.email,
          token: material.token,
        },
      };
    },
  });
}
