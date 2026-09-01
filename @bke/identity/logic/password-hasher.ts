export interface IdentityPasswordHasher {
  hash(password: string): Promise<string>;
}
