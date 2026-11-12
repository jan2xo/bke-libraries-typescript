const REPOSITORY = 'jan2xo/bke-libraries-typescript';
const OWNER_LOGIN = 'jan2xo';
const OWNER_ID = 163499503;
const CONTROL_ISSUE_NUMBER = 100;
const CONTROL_ISSUE_ID = 6344112785;
const ISSUE_URL = "https://api.github.com/repos/" + REPOSITORY + "/issues/" + CONTROL_ISSUE_NUMBER;
const SHA = /^[0-9a-f]{40}$/;
const READINESS = /^\/bke certify licensing-v0\.10\.0 sha=([0-9a-f]{40})$/;
const PUBLICATION = /^\/bke publish licensing-v0\.10\.0 sha=([0-9a-f]{40}) readiness=([1-9][0-9]{0,15}) immutable=confirmed$/;
const RECOVERY = /^\/bke recover licensing-v0\.10\.0 sha=([0-9a-f]{40}) immutable=confirmed$/;
const MAX_COMMAND_AGE_MS = 10 * 60 * 1000;

function requireThat(test, code) {
  if (!test) throw new Error("LICENSING_CHATOPS_" + code);
}

/**
 * Pure fail-closed authorization for a NEW owner-created comment on the pinned
 * control issue. All source objects must be independently obtained from the
 * GitHub event and GitHub REST API by the caller. No side effects here.
 */
export function authorizeLicensingChatOpsCommand({ event, comment, issue, currentMainSha, nowMs }) {
  requireThat(event && comment && issue, 'INPUT_INVALID');
  requireThat(event.eventName === 'issue_comment' && event.action === 'created' &&
    event.repository === REPOSITORY && event.senderId === OWNER_ID &&
    event.senderLogin === OWNER_LOGIN && event.issueNumber === CONTROL_ISSUE_NUMBER &&
    event.issueId === CONTROL_ISSUE_ID && event.commentId === comment.id,
  'EVENT_NOT_AUTHORIZED');
  requireThat(issue.number === CONTROL_ISSUE_NUMBER && issue.id === CONTROL_ISSUE_ID &&
    issue.state === 'open' && issue.isPullRequest === false &&
    issue.ownerLogin === OWNER_LOGIN, 'ISSUE_NOT_ALLOWED');
  requireThat(comment.issueUrl === ISSUE_URL && comment.user?.id === OWNER_ID &&
    comment.user?.login === OWNER_LOGIN && comment.authorAssociation === 'OWNER',
  'COMMENT_NOT_OWNER');
  requireThat(typeof comment.body === 'string' && comment.body.length < 220 &&
    comment.body.length > 0 && comment.body === event.commentBody,
  'COMMENT_CHANGED');
  requireThat(typeof comment.createdAt === 'string' &&
    comment.updatedAt === comment.createdAt && Number.isFinite(nowMs),
  'COMMENT_EDITED_OR_CLOCK_INVALID');
  const created = Date.parse(comment.createdAt);
  requireThat(Number.isFinite(created) && created <= nowMs &&
    nowMs - created <= MAX_COMMAND_AGE_MS, 'COMMENT_EXPIRED');
  requireThat(typeof currentMainSha === 'string' && SHA.test(currentMainSha),
  'MAIN_SHA_INVALID');
  const readiness = READINESS.exec(comment.body);
  const publication = PUBLICATION.exec(comment.body);
  const recovery = RECOVERY.exec(comment.body);
  requireThat(readiness !== null || publication !== null || recovery !== null, 'UNSUPPORTED_COMMAND');
  const exactSha = readiness ? readiness[1] : publication ? publication[1] : recovery[1];
  requireThat(exactSha === currentMainSha, 'STALE_MAIN');
  if (readiness) return Object.freeze({
    intent: 'READ_ONLY_READINESS', expectedMainSha: exactSha,
    targetWorkflow: 'licensing-release-readiness.yml',
    authorizationCommentId: comment.id,
  });
  if (recovery) return Object.freeze({
    intent: 'OWNER_AUTHORIZED_DRAFT_RECOVERY',
    expectedMainSha: exactSha,
    releaseTag: 'licensing-v0.10.0',
    targetWorkflow: 'licensing-release-recovery.yml',
    authorizationCommentId: comment.id,
  });
  const runId = Number(publication[2]);
  requireThat(Number.isSafeInteger(runId) && runId > 0, 'RUN_ID_INVALID');
  return Object.freeze({
    intent: 'OWNER_AUTHORIZED_GITHUB_RELEASE',
    expectedMainSha: exactSha,
    readinessRunId: runId,
    releaseTag: 'licensing-v0.10.0',
    targetWorkflow: 'licensing-release-publication.yml',
    authorizationCommentId: comment.id,
  });
}


/**
 * Independent second gate inside a bot-dispatched publishing workflow.
 * Does not trust the upstream router, workflow input or bot identity alone.
 * The authorizing GitHub comment is retrieved again from the REST API.
 */
export function authorizeDelegatedLicensingPublication({
  actor, authorizationCommentId, comment, issue,
  expectedMainSha, readinessRunId, nowMs,
}) {
  requireThat(typeof expectedMainSha === 'string' && SHA.test(expectedMainSha) &&
    Number.isSafeInteger(readinessRunId) && readinessRunId > 0,
  'DELEGATION_INPUT_INVALID');
  if (actor === OWNER_LOGIN) {
    requireThat(authorizationCommentId === '', 'DIRECT_OWNER_DELEGATION_NOT_ALLOWED');
    return Object.freeze({ authorization: 'DIRECT_GITHUB_OWNER', expectedMainSha, readinessRunId });
  }
  requireThat(actor === 'github-actions[bot]' &&
    typeof authorizationCommentId === 'string' &&
    /^[1-9][0-9]{0,15}$/.test(authorizationCommentId) &&
    Number.isSafeInteger(Number(authorizationCommentId)),
  'BOT_DELEGATION_NOT_AUTHORIZED');
  const id = Number(authorizationCommentId);
  requireThat(comment && issue && comment.id === id &&
    issue.number === CONTROL_ISSUE_NUMBER && issue.id === CONTROL_ISSUE_ID &&
    issue.state === 'open' && !issue.isPullRequest && issue.ownerLogin === OWNER_LOGIN,
  'DELEGATED_ISSUE_OR_COMMENT_INVALID');
  requireThat(comment.user?.id === OWNER_ID && comment.user?.login === OWNER_LOGIN &&
    comment.authorAssociation === 'OWNER' && comment.issueUrl === ISSUE_URL,
  'DELEGATED_COMMENT_NOT_OWNER');
  requireThat(comment.body === '/bke publish licensing-v0.10.0 sha=' +
    expectedMainSha + ' readiness=' + readinessRunId + ' immutable=confirmed',
  'DELEGATED_COMMAND_MISMATCH');
  requireThat(comment.createdAt === comment.updatedAt && Number.isFinite(nowMs),
  'DELEGATED_COMMENT_EDITED');
  const created = Date.parse(comment.createdAt);
  requireThat(Number.isFinite(created) && created <= nowMs &&
    nowMs - created <= MAX_COMMAND_AGE_MS,
  'DELEGATED_COMMAND_EXPIRED');
  return Object.freeze({
    authorization: 'VERIFIED_OWNER_COMMENT',
    authorizationCommentId: id, expectedMainSha, readinessRunId,
  });
}


/**
 * Independently re-authenticate a delegated one-time draft recovery request.
 * Release publication authority is separate from a normal readiness command.
 */
export function authorizeDelegatedLicensingDraftRecovery({
  actor, authorizationCommentId, comment, issue, expectedMainSha, nowMs,
}) {
  requireThat(actor === 'github-actions[bot]' &&
    SHA.test(expectedMainSha) &&
    typeof authorizationCommentId === 'string' &&
    /^[1-9][0-9]{0,15}$/.test(authorizationCommentId) &&
    Number.isSafeInteger(Number(authorizationCommentId)),
  'RECOVERY_BOT_AUTHORIZATION_INVALID');
  const id = Number(authorizationCommentId);
  requireThat(comment && issue &&
    comment.id === id &&
    issue.number === CONTROL_ISSUE_NUMBER && issue.id === CONTROL_ISSUE_ID &&
    issue.state === 'open' && issue.isPullRequest === false &&
    issue.ownerLogin === OWNER_LOGIN,
  'RECOVERY_ISSUE_OR_COMMENT_INVALID');
  requireThat(comment.user?.id === OWNER_ID && comment.user?.login === OWNER_LOGIN &&
    comment.authorAssociation === 'OWNER' && comment.issueUrl === ISSUE_URL,
  'RECOVERY_COMMENT_NOT_OWNER');
  requireThat(comment.body ===
    '/bke recover licensing-v0.10.0 sha=' + expectedMainSha + ' immutable=confirmed',
  'RECOVERY_COMMAND_MISMATCH');
  requireThat(comment.createdAt === comment.updatedAt && Number.isFinite(nowMs),
  'RECOVERY_COMMAND_EDITED');
  const created = Date.parse(comment.createdAt);
  requireThat(Number.isFinite(created) && created <= nowMs &&
    nowMs - created <= MAX_COMMAND_AGE_MS,
  'RECOVERY_COMMAND_EXPIRED');
  return Object.freeze({
    authorization: 'VERIFIED_OWNER_DRAFT_RECOVERY',
    releaseTag: 'licensing-v0.10.0',
    originalDraftId: 442576730,
    originalReleaseTargetSha: 'b39fa5cc28c94c87a40a420e80f387c176564144',
    expectedMainSha,
    authorizationCommentId: id,
  });
}
