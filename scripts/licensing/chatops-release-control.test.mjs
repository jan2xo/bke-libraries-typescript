import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeLicensingChatOpsCommand } from './chatops-release-control.mjs';

const main = 'c'.repeat(40);
const nowMs = Date.parse('2026-11-12T06:25:00Z');
function fixture(body = '/bke certify licensing-v0.10.0 sha=' + main) {
  const timestamp = new Date(nowMs - 15000).toISOString();
  return {
    event: {
      eventName: 'issue_comment', action: 'created', repository: 'jan2xo/bke-libraries-typescript',
      senderId: 163499503, senderLogin: 'jan2xo', issueNumber: 100, issueId: 6344112785,
      commentId: 6816324960, commentBody: body,
    },
    comment: {
      id: 6816324960, body, issueUrl: 'https://api.github.com/repos/jan2xo/bke-libraries-typescript/issues/100',
      user: { id: 163499503, login: 'jan2xo' }, authorAssociation: 'OWNER',
      createdAt: timestamp, updatedAt: timestamp,
    },
    issue: { number: 100, id: 6344112785, state: 'open', isPullRequest: false, ownerLogin: 'jan2xo' },
    currentMainSha: main, nowMs,
  };
}
function reject(mutate, code, body) {
  const p = fixture(body);
  mutate(p);
  assert.throws(() => authorizeLicensingChatOpsCommand(p),
    { message: 'LICENSING_CHATOPS_' + code });
}
describe('owner-only licensing release ChatOps', () => {
  it('accepts an exact read-only version-pinned certification command', () => {
    const value = authorizeLicensingChatOpsCommand(fixture());
    assert.deepEqual(value, { intent: 'READ_ONLY_READINESS', expectedMainSha: main,
      targetWorkflow: 'licensing-release-readiness.yml', authorizationCommentId: 6816324960 });
    assert.equal(Object.isFrozen(value), true);
  });
  it('accepts only exact v0.10.0 immutable publication syntax', () => {
    const p = fixture('/bke publish licensing-v0.10.0 sha=' + main +
      ' readiness=43170000000 immutable=confirmed');
    assert.deepEqual(authorizeLicensingChatOpsCommand(p), {
      intent: 'OWNER_AUTHORIZED_GITHUB_RELEASE', expectedMainSha: main,
      readinessRunId: 43170000000, releaseTag: 'licensing-v0.10.0',
      targetWorkflow: 'licensing-release-publication.yml', authorizationCommentId: 6816324960,
    });
  });
  it('rejects different repo, sender and event type', () => {
    reject(p => { p.event.repository = 'other/repo'; }, 'EVENT_NOT_AUTHORIZED');
    reject(p => { p.event.senderId = 17; }, 'EVENT_NOT_AUTHORIZED');
    reject(p => { p.event.eventName = 'pull_request'; }, 'EVENT_NOT_AUTHORIZED');
    reject(p => { p.event.action = 'edited'; }, 'EVENT_NOT_AUTHORIZED');
    reject(p => { p.event.commentId++; }, 'EVENT_NOT_AUTHORIZED');
  });
  it('rejects a different issue, PR or deleted control ledger', () => {
    reject(p => { p.issue.id = 99; }, 'ISSUE_NOT_ALLOWED');
    reject(p => { p.issue.isPullRequest = true; }, 'ISSUE_NOT_ALLOWED');
    reject(p => { p.issue.state = 'closed'; }, 'ISSUE_NOT_ALLOWED');
  });
  it('rejects non-owner comment even if webhook sender appears owner', () => {
    reject(p => { p.comment.user.id = 100; }, 'COMMENT_NOT_OWNER');
    reject(p => { p.comment.authorAssociation = 'COLLABORATOR'; }, 'COMMENT_NOT_OWNER');
    reject(p => { p.comment.issueUrl = 'https://api.github.com/repos/a/b/issues/100'; }, 'COMMENT_NOT_OWNER');
  });
  it('rejects event/comment mismatch or altered commands', () => {
    reject(p => { p.comment.body += ' '; }, 'COMMENT_CHANGED');
    reject(p => { p.event.commentBody += ' '; }, 'COMMENT_CHANGED');
    reject(p => { p.comment.updatedAt = new Date(nowMs).toISOString(); }, 'COMMENT_EDITED_OR_CLOCK_INVALID');
  });
  it('rejects stale and future comments', () => {
    reject(p => { const t = new Date(nowMs - 601000).toISOString(); p.comment.createdAt = t; p.comment.updatedAt = t; }, 'COMMENT_EXPIRED');
    reject(p => { const t = new Date(nowMs + 1000).toISOString(); p.comment.createdAt = t; p.comment.updatedAt = t; }, 'COMMENT_EXPIRED');
  });
  it('rejects stale and noncanonical main SHA', () => {
    reject(p => { p.currentMainSha = 'd'.repeat(40); }, 'STALE_MAIN');
    reject(p => { p.currentMainSha = 'main'; }, 'MAIN_SHA_INVALID');
  });
  it('rejects shell injection, extra fields, unsupported releases and false confirmations', () => {
    reject(() => {}, 'UNSUPPORTED_COMMAND', '/bke certify licensing-v0.10.0 sha=' + main + '; echo pwn');
    reject(() => {}, 'UNSUPPORTED_COMMAND', '/bke certify licensing-v0.10.0 sha=' + main + '\nfoo');
    reject(() => {}, 'UNSUPPORTED_COMMAND', '/bke publish licensing-v0.11.0 sha=' + main + ' readiness=4317 immutable=confirmed');
    reject(() => {}, 'UNSUPPORTED_COMMAND', '/bke publish licensing-v0.10.0 sha=' + main + ' readiness=4317 immutable=false');
    reject(() => {}, 'UNSUPPORTED_COMMAND', '/bke publish licensing-v0.10.0 sha=' + main + ' readiness=0 immutable=confirmed');
  });
  it('rejects overflow run identifiers', () => {
    reject(() => {}, 'RUN_ID_INVALID', '/bke publish licensing-v0.10.0 sha=' + main +
      ' readiness=9999999999999999 immutable=confirmed');
  });
});
