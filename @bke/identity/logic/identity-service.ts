import type {
  IdentityLookupCapability,
  IdentityLookupResult,
} from "../contracts/identity.contract";
import type { IdentityRepository } from "./identity-repository";

async function lookup(
  rawIdentifier: string,
  finder: (identifier: string) => Promise<Awaited<ReturnType<IdentityRepository["findById"]>>>,
): Promise<IdentityLookupResult> {
  const identifier = rawIdentifier.trim();

  if (!identifier) {
    return { status: "FAILED", code: "INVALID_IDENTIFIER" };
  }

  try {
    const principal = await finder(identifier);
    return principal
      ? { status: "FOUND", principal }
      : { status: "NOT_FOUND" };
  } catch {
    return { status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" };
  }
}

export function createIdentityLookupCapability(
  repository: IdentityRepository,
): IdentityLookupCapability {
  return Object.freeze({
    findById(userId: string) {
      return lookup(userId, (identifier) => repository.findById(identifier));
    },
    findByEmail(email: string) {
      return lookup(email, (identifier) => repository.findByEmail(identifier));
    },
  });
}
