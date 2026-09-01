export interface AccountsInvitationTokenMaterial {
  readonly rawToken: string;
  readonly tokenHash: string;
}

export interface AccountsInvitationTokenProvider {
  issue(): AccountsInvitationTokenMaterial;
}
