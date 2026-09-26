import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signDownload, verifyDownload } from '../src/lib.js';

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
