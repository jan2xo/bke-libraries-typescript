export interface IdentityPasswordVerifier {
  verify(passwordHash: string, password: string): Promise<boolean>;
}
