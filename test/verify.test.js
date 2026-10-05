import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.APP_SECRET = 'test-secret';
const { db, signLink } = await import('../src/lib.js');
const { auth } = await import('../src/auth.js');

// A fake users/sessions store behind q(): no Postgres on the dev machine. It answers by SQL prefix, so this
// checks the route logic (who gets a token, in what order things are refused), not the SQL text itself.
const users = [], sessions = new Map();
const usable = (u) => !!u.email_verified_at || u.role === 'admin'; // mirrors USABLE in src/lib.js
db.query = async (sql, p = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.startsWith('INSERT INTO users')) {
    if (users.some((u) => u.email === p[0])) return { rows: [] };
    users.push({ id: users.length + 1, email: p[0], name: p[1], password_hash: p[2], role: 'customer', email_verified_at: null });
    const { id, email, name, role } = users.at(-1);
    return { rows: [{ id, email, name, role }] };
  }
  if (s.startsWith('SELECT u.*')) return { rows: users.filter((u) => u.email === p[0]).map((u) => ({ ...u, usable: usable(u) })) };
  if (s.startsWith('SELECT id, email FROM users WHERE id')) return { rows: users.filter((u) => u.id === p[0]) };
  if (s.startsWith('UPDATE users SET email_verified_at')) { users.find((u) => u.id === p[0]).email_verified_at = new Date(); return { rows: [] }; }
  if (s.startsWith('INSERT INTO sessions')) { sessions.set(p[0], p[1]); return { rows: [] }; }
  if (s.includes('FROM sessions s JOIN users u')) {
    const u = users.find((x) => x.id === sessions.get(p[0]));
    return { rows: u && usable(u) ? [u] : [] };
  }
  if (s.startsWith('UPDATE users SET locked_until')) return { rows: [{ failed_logins: 1, locked_until: null }] };
  if (s.startsWith('SELECT count(*)')) return { rows: [{ n: 0 }] };
  return { rows: [], rowCount: 1 }; // audit_log, failed_logins, mail throttle
};

const app = express().use(express.json()).use('/api/auth', auth)
  .use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message, ...err.extra }));
const server = app.listen(0);
const call = async (path, { body, token } = {}) => {
  const res = await fetch(`http://localhost:${server.address().port}/api/auth${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, location: res.headers.get('location'), data: await res.json().catch(() => null) };
};

test('an account cannot be used until its email is verified', async (t) => {
  t.after(() => server.close());
  const who = { email: 'a@example.com', password: 'password1' };

  const reg = await call('/register', { body: { name: 'A', ...who } });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.token, undefined, 'registering must not sign the account in');

  const early = await call('/login', { body: who });
  assert.deepEqual([early.status, early.data.code], [403, 'email_unverified']);
  const guess = await call('/login', { body: { ...who, password: 'wrong-password' } });
  assert.equal(guess.status, 401, 'a wrong password must not reveal that the address is waiting for verification');

  const link = new URLSearchParams(signLink('verify', users[0], 86400));
  assert.equal((await call(`/verify?${link}`)).location, '/account?verified=1');

  const login = await call('/login', { body: who });
  assert.equal(login.status, 200);
  assert.equal((await call('/me', { token: login.data.token })).status, 200);

  // a session opened before enforcement, on an account that never verified: dead, unless it is an admin's
  users[0].email_verified_at = null;
  assert.equal((await call('/me', { token: login.data.token })).status, 401);
  users[0].role = 'admin';
  assert.equal((await call('/me', { token: login.data.token })).status, 200);
});
