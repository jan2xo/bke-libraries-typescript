const REPOSITORY = 'jan2xo/bke-libraries-typescript';
const OWNER_LOGIN = 'jan2xo';
const OWNER_ID = 163499503;
const CONTROL_ISSUE_NUMBER = 100;
const CONTROL_ISSUE_ID = 6344112785;
const ISSUE_URL = "https://api.github.com/repos/" + REPOSITORY + "/issues/" + CONTROL_ISSUE_NUMBER;
const SHA = /^[0-9a-f]{40}$/;
const READINESS = /^\/bke certify licensing-v0\.10\.0 sha=([0-9a-f]{40})$/;
const PUBLICATION = /^\/bke publish licensing-v0\.10\.0 sha=([0-9a-f]{40}) readiness=([1-9][0-9]{0,15}) immutable=confirmed$/;
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
  requireThat(readiness !== null || publication !== null, 'UNSUPPORTED_COMMAND');
  const exactSha = readiness ? readiness[1] : publication[1];
  requireThat(exactSha === currentMainSha, 'STALE_MAIN');
  if (readiness) return Object.freeze({
    intent: 'READ_ONLY_READINESS', expectedMainSha: exactSha,
    targetWorkflow: 'licensing-release-readiness.yml',
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
