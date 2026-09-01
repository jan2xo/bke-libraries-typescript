import type { AccountsExpiredInvitation } from "../contracts/invitation-expiration.contract";

export interface AccountsInvitationExpirationRepository {
  expirePendingAt(now: Date): Promise<readonly AccountsExpiredInvitation[]>;
}
