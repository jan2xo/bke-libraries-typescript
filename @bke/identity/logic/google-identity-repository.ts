import type {IdentityPrincipal} from "../contracts/identity.contract";
export type IdentityGoogleSubjectBindPersistenceResult={readonly status:"BOUND"|"ALREADY_BOUND"|"PRINCIPAL_NOT_FOUND"|"ACCOUNT_NOT_ACTIVE"|"EMAIL_NOT_VERIFIED"|"SUBJECT_ALREADY_BOUND"|"USER_ALREADY_BOUND"};
export interface IdentityGoogleIdentityRepository{
 bindSubject(userId:string,subject:string):Promise<IdentityGoogleSubjectBindPersistenceResult>;
 findPrincipalBySubject(subject:string):Promise<IdentityPrincipal|null>;
}
