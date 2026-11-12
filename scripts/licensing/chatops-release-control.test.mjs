import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeLicensingChatOpsCommand, authorizeDelegatedLicensingPublication, authorizeDelegatedLicensingDraftRecovery } from './chatops-release-control.mjs';

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


describe('independent owner authorization inside delegated publisher', () => {
  function delegated() {
    const p = fixture('/bke publish licensing-v0.10.0 sha=' + main +
      ' readiness=43170000000 immutable=confirmed');
    return {
      actor: 'github-actions[bot]',
      authorizationCommentId: '6816324960',
      comment: p.comment,
      issue: p.issue,
      expectedMainSha: main,
      readinessRunId: 43170000000,
      nowMs,
    };
  }
  function fail(mutate, code) {
    const value = delegated();
    mutate(value);
    assert.throws(() => authorizeDelegatedLicensingPublication(value),
      { message: 'LICENSING_CHATOPS_' + code });
  }
  it('allows direct owner invocation but forbids arbitrary comment delegation', () => {
    assert.equal(authorizeDelegatedLicensingPublication({
      ...delegated(), actor: 'jan2xo', authorizationCommentId: '',
    }).authorization, 'DIRECT_GITHUB_OWNER');
    fail(v => { v.actor = 'random-bot'; }, 'BOT_DELEGATION_NOT_AUTHORIZED');
    fail(v => { v.authorizationCommentId = ''; }, 'BOT_DELEGATION_NOT_AUTHORIZED');
    assert.throws(() => authorizeDelegatedLicensingPublication({
      ...delegated(), actor: 'jan2xo',
    }), { message: 'LICENSING_CHATOPS_DIRECT_OWNER_DELEGATION_NOT_ALLOWED' });
  });
  it('accepts a fresh exact owner comment but never labels it direct owner', () => {
    const result = authorizeDelegatedLicensingPublication(delegated());
    assert.deepEqual(result, {
      authorization: 'VERIFIED_OWNER_COMMENT', authorizationCommentId: 6816324960,
      expectedMainSha: main, readinessRunId: 43170000000,
    });
    assert.equal(Object.isFrozen(result), true);
  });
  it('rejects manipulated issue or comment identity', () => {
    fail(v => { v.issue.id += 1; }, 'DELEGATED_ISSUE_OR_COMMENT_INVALID');
    fail(v => { v.comment.id++; }, 'DELEGATED_ISSUE_OR_COMMENT_INVALID');
    fail(v => { v.comment.user.id = 22; }, 'DELEGATED_COMMENT_NOT_OWNER');
    fail(v => { v.comment.issueUrl = 'https://api.github.com/repos/fork/repo/issues/100'; },
      'DELEGATED_COMMENT_NOT_OWNER');
  });
  it('rejects any changed release, SHA, run ID or confirmation', () => {
    fail(v => { v.readinessRunId++; }, 'DELEGATED_COMMAND_MISMATCH');
    fail(v => { v.expectedMainSha = 'f'.repeat(40); }, 'DELEGATED_COMMAND_MISMATCH');
    fail(v => { v.comment.body += '\nextra'; }, 'DELEGATED_COMMAND_MISMATCH');
    fail(v => { v.comment.body = v.comment.body.replace('immutable=confirmed', 'immutable=false'); },
      'DELEGATED_COMMAND_MISMATCH');
  });
  it('rejects stale, edited, future and invalid timestamp proofs', () => {
    fail(v => { v.comment.updatedAt = new Date(nowMs).toISOString(); }, 'DELEGATED_COMMENT_EDITED');
    fail(v => { const t = new Date(nowMs - 601000).toISOString(); v.comment.createdAt = t; v.comment.updatedAt = t; },
      'DELEGATED_COMMAND_EXPIRED');
    fail(v => { const t = new Date(nowMs + 1000).toISOString(); v.comment.createdAt = t; v.comment.updatedAt = t; },
      'DELEGATED_COMMAND_EXPIRED');
  });
});


describe('authenticated one-time failed-draft recovery command', () => {
  const recoverBody = '/bke recover licensing-v0.10.0 sha=' + main + ' immutable=confirmed';
  function delegated() {
    const p = fixture(recoverBody);
    return {
      actor: 'github-actions[bot]', authorizationCommentId: String(p.comment.id),
      comment: p.comment, issue: p.issue, expectedMainSha: main, nowMs,
    };
  }
  function reject(mutate, code) {
    const p = delegated();
    mutate(p);
    assert.throws(() => authorizeDelegatedLicensingDraftRecovery(p),
      { message: 'LICENSING_CHATOPS_' + code });
  }
  it('parses only fixed v0.10.0 recovery command and no arbitrary release operation', () => {
    const p = fixture(recoverBody);
    assert.deepEqual(authorizeLicensingChatOpsCommand(p), {
      intent: 'OWNER_AUTHORIZED_DRAFT_RECOVERY',
      expectedMainSha: main, releaseTag: 'licensing-v0.10.0',
      targetWorkflow: 'licensing-release-recovery.yml', authorizationCommentId: 6816324960,
    });
    const verified = authorizeDelegatedLicensingDraftRecovery(delegated());
    assert.equal(verified.authorization, 'VERIFIED_OWNER_DRAFT_RECOVERY');
    assert.equal(verified.originalDraftId, 442576730);
    assert.equal(verified.originalReleaseTargetSha, 'b39fa5cc28c94c87a40a420e80f387c176564144');
    assert.equal(Object.isFrozen(verified), true);
  });
  it('rejects unknown operations, versions and false immutability', () => {
    const cases = [
      recoverBody.replace('v0.10.0', 'v0.10.1'),
      recoverBody.replace('immutable=confirmed', 'immutable=unknown'),
      recoverBody + ' extra',
      recoverBody + '\nsecond line',
    ];
    for (const body of cases)
      assert.throws(() => authorizeLicensingChatOpsCommand(fixture(body)),
        { message: 'LICENSING_CHATOPS_UNSUPPORTED_COMMAND' });
  });
  it('rejects untrusted actors, forged owner and wrong issue', () => {
    reject(p => { p.actor = 'jan2xo'; }, 'RECOVERY_BOT_AUTHORIZATION_INVALID');
    reject(p => { p.authorizationCommentId = ''; }, 'RECOVERY_BOT_AUTHORIZATION_INVALID');
    reject(p => { p.comment.user.id = 1; }, 'RECOVERY_COMMENT_NOT_OWNER');
    reject(p => { p.issue.id += 1; }, 'RECOVERY_ISSUE_OR_COMMENT_INVALID');
    reject(p => { p.comment.id += 1; }, 'RECOVERY_ISSUE_OR_COMMENT_INVALID');
  });
  it('refuses different new main, edited and expired owner comments', () => {
    reject(p => { p.expectedMainSha = 'f'.repeat(40); }, 'RECOVERY_COMMAND_MISMATCH');
    reject(p => { p.comment.updatedAt = new Date(nowMs).toISOString(); }, 'RECOVERY_COMMAND_EDITED');
    reject(p => { const t = new Date(nowMs - 601000).toISOString(); p.comment.createdAt = t; p.comment.updatedAt = t; }, 'RECOVERY_COMMAND_EXPIRED');
  });
});
