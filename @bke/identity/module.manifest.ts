import type { IdentityModuleManifest } from "./contracts/module.contract";
import { IDENTITY_EMAIL_VERIFICATION_COMPLETION_CAPABILITY_ID } from "./contracts/email-verification-completion.contract";
import { IDENTITY_EMAIL_VERIFICATION_ISSUANCE_CAPABILITY_ID } from "./contracts/email-verification-issuance.contract";
import {
  IDENTITY_LOOKUP_CAPABILITY_ID,
  IDENTITY_PASSWORD_AUTHENTICATION_CAPABILITY_ID,
} from "./contracts/identity.contract";
import { IDENTITY_LOGIN_MFA_CHALLENGE_ISSUANCE_CAPABILITY_ID } from "./contracts/login-mfa-challenge.contract";
import { IDENTITY_LOGIN_MFA_VERIFICATION_CAPABILITY_ID } from "./contracts/login-mfa-verification.contract";
import { IDENTITY_MAGIC_LOGIN_CONSUME_CAPABILITY_ID } from "./contracts/magic-login-consume.contract";
import { IDENTITY_MAGIC_LOGIN_REQUEST_CAPABILITY_ID } from "./contracts/magic-login-request.contract";
import { IDENTITY_MFA_DISABLE_CAPABILITY_ID } from "./contracts/mfa-disable.contract";
import { IDENTITY_MFA_EMERGENCY_ENROLLMENT_CAPABILITY_ID } from "./contracts/mfa-emergency-enrollment.contract";
import { IDENTITY_MFA_ENROLLMENT_COMPLETION_CAPABILITY_ID } from "./contracts/mfa-enrollment-completion.contract";
import { IDENTITY_MFA_ENROLLMENT_START_CAPABILITY_ID } from "./contracts/mfa-enrollment-start.contract";
import { IDENTITY_MFA_RECOVERY_REGENERATION_CAPABILITY_ID } from "./contracts/mfa-recovery-regeneration.contract";
import { IDENTITY_PASSWORD_CHANGE_CAPABILITY_ID } from "./contracts/password-change.contract";
import { IDENTITY_PASSWORD_RESET_COMPLETION_CAPABILITY_ID } from "./contracts/password-reset-completion.contract";
import { IDENTITY_PASSWORD_RESET_REQUEST_CAPABILITY_ID } from "./contracts/password-reset-request.contract";
import { IDENTITY_RECENT_AUTH_CHALLENGE_ISSUANCE_CAPABILITY_ID } from "./contracts/recent-auth-challenge.contract";
import { IDENTITY_RECENT_AUTH_COMPLETION_CAPABILITY_ID } from "./contracts/recent-auth-completion.contract";
import { IDENTITY_SESSION_TERMINATION_CAPABILITY_ID } from "./contracts/session-termination.contract";
import { IDENTITY_SESSION_VALIDATION_CAPABILITY_ID } from "./contracts/session-validation.contract";
import { IDENTITY_SESSION_ISSUANCE_CAPABILITY_ID } from "./contracts/session.contract";

export const identityModuleManifest = Object.freeze({
  moduleId: "identity",
  needs: [],
  provides: [
    IDENTITY_LOOKUP_CAPABILITY_ID,
    IDENTITY_PASSWORD_AUTHENTICATION_CAPABILITY_ID,
    IDENTITY_EMAIL_VERIFICATION_ISSUANCE_CAPABILITY_ID,
    IDENTITY_EMAIL_VERIFICATION_COMPLETION_CAPABILITY_ID,
    IDENTITY_PASSWORD_CHANGE_CAPABILITY_ID,
    IDENTITY_MAGIC_LOGIN_REQUEST_CAPABILITY_ID,
    IDENTITY_MAGIC_LOGIN_CONSUME_CAPABILITY_ID,
    IDENTITY_SESSION_ISSUANCE_CAPABILITY_ID,
    IDENTITY_SESSION_VALIDATION_CAPABILITY_ID,
    IDENTITY_SESSION_TERMINATION_CAPABILITY_ID,
    IDENTITY_LOGIN_MFA_VERIFICATION_CAPABILITY_ID,
    IDENTITY_LOGIN_MFA_CHALLENGE_ISSUANCE_CAPABILITY_ID,
    IDENTITY_MFA_ENROLLMENT_START_CAPABILITY_ID,
    IDENTITY_MFA_ENROLLMENT_COMPLETION_CAPABILITY_ID,
    IDENTITY_MFA_DISABLE_CAPABILITY_ID,
    IDENTITY_MFA_RECOVERY_REGENERATION_CAPABILITY_ID,
    IDENTITY_MFA_EMERGENCY_ENROLLMENT_CAPABILITY_ID,
    IDENTITY_RECENT_AUTH_CHALLENGE_ISSUANCE_CAPABILITY_ID,
    IDENTITY_RECENT_AUTH_COMPLETION_CAPABILITY_ID,
    IDENTITY_PASSWORD_RESET_REQUEST_CAPABILITY_ID,
    IDENTITY_PASSWORD_RESET_COMPLETION_CAPABILITY_ID,
  ],
} satisfies IdentityModuleManifest);
