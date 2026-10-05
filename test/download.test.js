import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signDownload, verifyDownload, signLink, verifyLink } from '../src/lib.js';

process.env.APP_SECRET = 'test-secret';

test('signed download URL: valid, tampered, expired', () => {
  const now = Date.now();
  const { exp, sig } = signDownload(42, 300, now);
  assert.ok(verifyDownload('42', String(exp), sig, now));
  assert.ok(!verifyDownload('43', String(exp), sig, now), 'other item');
  assert.ok(!verifyDownload('42', String(exp + 1), sig, now), 'extended expiry');
  assert.ok(!verifyDownload('42', String(exp), sig, now + 301_000), 'expired');
  assert.ok(!verifyDownload('42', String(exp), undefined, now), 'missing sig');
});

test('email links: tied to the user and to the thing they change', () => {
  const u = { id: '7', email: 'a@b.co', password_hash: 'old' };
  const reset = signLink('reset', u, 3600);
  assert.equal(reset.u, '7');
  assert.ok(verifyLink('reset', u, String(reset.exp), reset.sig));
  assert.ok(!verifyLink('reset', { ...u, password_hash: 'new' }, String(reset.exp), reset.sig), 'dead once the password changes');
  assert.ok(!verifyLink('reset', { ...u, id: '8' }, String(reset.exp), reset.sig), 'other user');
  assert.ok(!verifyLink('verify', u, String(reset.exp), reset.sig), 'a reset link is not a verify link');
  const verify = signLink('verify', u, 86400);
  assert.ok(verifyLink('verify', u, String(verify.exp), verify.sig));
  assert.ok(!verifyLink('verify', { ...u, email: 'x@y.co' }, String(verify.exp), verify.sig), 'other address');
  assert.ok(!verifyLink('reset', u, String(verify.exp), verify.sig), 'a verify link cannot reset a password');
  const old = signLink('reset', u, -1);
  assert.ok(!verifyLink('reset', u, String(old.exp), old.sig), 'expired');
});
