import type {
  LicensingLicenseKeyRevealCapability,
  LicensingLicenseKeyRevealInput,
  LicensingLicenseKeyRevealResult,
} from "../contracts/license-key-reveal.contract";
import type { LicensingClock } from "./licensing-clock";
import type { LicensingLicenseKeyDecrypter } from "./license-key-decrypter";
import type { LicensingLicenseKeyRevealRepository } from "./license-key-reveal-repository";

export function createLicensingLicenseKeyRevealCapability(input: {
  readonly repository: LicensingLicenseKeyRevealRepository;
  readonly decrypter: LicensingLicenseKeyDecrypter;
  readonly clock: LicensingClock;
}): LicensingLicenseKeyRevealCapability {
  return Object.freeze({
    async reveal(
      request: LicensingLicenseKeyRevealInput,
    ): Promise<LicensingLicenseKeyRevealResult> {
      const license = await input.repository.findByIdAndAccount({
        licenseId: request.licenseId,
        accountId: request.accountId,
      });
      if (!license) return { status: "REJECTED", code: "NOT_FOUND" };
      if (!license.keyCiphertext) {
        return { status: "REJECTED", code: "LICENSE_KEY_UNAVAILABLE" };
      }

      const plaintext = input.decrypter.decrypt(license.keyCiphertext);
      const recorded = await input.repository.recordSuccessfulReveal({
        licenseId: request.licenseId,
        accountId: request.accountId,
        actorPrincipalId: request.actorPrincipalId,
        revealedAt: input.clock.now(),
      });
      if (recorded.status === "NOT_FOUND") {
        return { status: "REJECTED", code: "NOT_FOUND" };
      }

      return {
        status: "REVEALED",
        licenseId: request.licenseId,
        licenseKey: plaintext,
        keyRevealedAt: recorded.keyRevealedAt,
        firstReveal: recorded.firstReveal,
        event: {
          type: "CUSTOMER_REVEALED",
          metadata: { actorId: request.actorPrincipalId },
        },
      };
    },
  });
}
