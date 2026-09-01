import type {
  IdentityMagicLoginRequestCapability,
  IdentityMagicLoginRequestInput,
  IdentityMagicLoginRequestResult,
} from "../contracts/magic-login-request.contract";
import type { IdentityMagicLoginRequestRepository } from "./magic-login-request-repository";
import type { IdentityMagicLoginTokenProvider } from "./magic-login-token-provider";

const MAX_EMAIL_LENGTH = 254;
const BASIC_EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 15 * 60 * 1000;

function normalizeEmail(rawEmail: string): string | null {
  const email = rawEmail.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !BASIC_EMAIL_SHAPE.test(email)) {
    return null;
  }
  return email;
}

export function createIdentityMagicLoginRequestCapability(
  repository: IdentityMagicLoginRequestRepository,
  tokenProvider: IdentityMagicLoginTokenProvider,
  clock: () => Date = () => new Date(),
): IdentityMagicLoginRequestCapability {
  return Object.freeze({
    async request(input: IdentityMagicLoginRequestInput): Promise<IdentityMagicLoginRequestResult> {
      const email = normalizeEmail(input.email);
      if (!email) {
        return { status: "FAILED", code: "INVALID_INPUT" };
      }

      let principal;
      try {
        principal = await repository.findEligibleCustomerByEmail(email);
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }

      // Preserve V1 enumeration resistance and CUSTOMER-only magic login.
      if (!principal) {
        return { status: "ACCEPTED", delivery: null };
      }

      let material;
      try {
        material = tokenProvider.issue();
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      const issuedAt = clock();
      try {
        await repository.replacePendingToken({
          id: material.tokenId,
          identifier: principal.email,
          tokenHash: material.tokenHash,
          expiresAt: new Date(issuedAt.getTime() + TOKEN_TTL_MS),
          replacedAt: issuedAt,
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
