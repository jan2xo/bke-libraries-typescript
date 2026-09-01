export interface AccountsInvitationTokenHasher {
  hash(rawToken: string): string;
}
