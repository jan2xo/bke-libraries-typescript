import type {
  IdentitySessionTerminationCapability,
  IdentitySessionTerminationResult,
} from "../contracts/session-termination.contract";
import type { IdentitySessionTerminationRepository } from "./session-termination-repository";
import type { IdentitySessionTokenProvider } from "./session-token-provider";

export function createIdentitySessionTerminationCapability(
  repository: IdentitySessionTerminationRepository,
  tokenProvider: IdentitySessionTokenProvider,
  clock: () => Date = () => new Date(),
): IdentitySessionTerminationCapability {
  return Object.freeze({
    async terminate(token: string): Promise<IdentitySessionTerminationResult> {
      if (!token || !token.trim()) {
        return { status: "NO_SESSION" };
      }

      let tokenHash: string;
      try {
        tokenHash = tokenProvider.hash(token);
      } catch {
        return { status: "FAILED", code: "TOKEN_PROVIDER_UNAVAILABLE" };
      }

      try {
        await repository.terminateSessionByTokenHash(tokenHash, clock());
        // Preserve V1 logout semantics without creating a session-existence oracle:
        // a well-formed token is considered terminated whether or not a live row matched.
        return { status: "TERMINATED" };
      } catch {
        return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
      }
    },
  });
}
