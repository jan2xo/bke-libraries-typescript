import type { IdentityPasswordChangeCapability } from "../contracts/password-change.contract";
import type {
  IdentityPasswordChangeSessionCapability,
  IdentityPasswordChangeSessionInput,
  IdentityPasswordChangeSessionResult,
} from "../contracts/password-change-session.contract";
import type { IdentitySessionIssuanceCapability } from "../contracts/session.contract";

export function createIdentityPasswordChangeSessionCapability(
  passwordChange: IdentityPasswordChangeCapability,
  sessionIssuance: IdentitySessionIssuanceCapability,
): IdentityPasswordChangeSessionCapability {
  return Object.freeze({
    async changeAndReissue(
      input: IdentityPasswordChangeSessionInput,
    ): Promise<IdentityPasswordChangeSessionResult> {
      const changed = await passwordChange.change({
        sessionToken: input.sessionToken,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
      if (changed.status !== "CHANGED") {
        return changed;
      }

      const issued = await sessionIssuance.issue({
        userId: changed.userId,
        authenticationMethod: changed.replacementAuthenticationMethod,
        userAgentSummary: input.userAgentSummary,
        networkHint: input.networkHint,
      });
      if (issued.status !== "ISSUED") {
        return {
          status: "CHANGED_SESSION_NOT_ISSUED",
          userId: changed.userId,
          code: issued.code,
        };
      }

      return {
        status: "CHANGED",
        userId: changed.userId,
        token: issued.token,
        session: issued.session,
      };
    },
  });
}
