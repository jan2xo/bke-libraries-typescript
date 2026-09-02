export interface LicensingLicenseKeyDecrypter {
  decrypt(ciphertext: string): string;
}
