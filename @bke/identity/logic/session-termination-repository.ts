export interface IdentitySessionTerminationRepository {
  terminateSessionByTokenHash(tokenHash: string, terminatedAt: Date): Promise<void>;
}
