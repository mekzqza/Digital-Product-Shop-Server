import { Router } from 'express';
import {
  q, HttpError, hashPassword, checkPassword, createSession, deleteSession, requireAuth, audit,
  sendMail, signLink, verifyLink,
} from './lib.js';

const MAX_FAILS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHOP = 'ร้านสินค้าดิจิทัล';

// Links in emails come from PUBLIC_URL (docker-compose.yml); the Host header is only the local-dev fallback.
// A forged Host on /forgot would otherwise mail the victim a working reset link that points at the attacker's site.
const site = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
const link = (req, path, kind, u, ttlSec) => `${site(req)}${path}?${new URLSearchParams(signLink(kind, u, ttlSec))}`;

// One mail per account per minute, claimed in a single UPDATE so parallel requests can't both send.
// ponytail: per-account only. Add nginx limit_req on /api/auth/ if someone scripts sign-ups to burn the Gmail quota.
const claimMail = async (userId) => (await q(
  `UPDATE users SET mail_sent_at = now()
   WHERE id = $1 AND (mail_sent_at IS NULL OR mail_sent_at < now() - interval '1 minute')`, [userId])).rowCount > 0;

// No user-typed text (name) in these bodies: anyone can register someone else's address, and the name would
// turn the shop's mailbox into a way to send them arbitrary text.
const sendVerify = (req, u) => sendMail(u.email, `ยืนยันอีเมลของคุณ — ${SHOP}`,
  `กดลิงก์นี้เพื่อยืนยันอีเมลสำหรับบัญชี${SHOP}ของคุณ (ใช้ได้ 24 ชั่วโมง)\n\n${link(req, '/api/auth/verify', 'verify', u, 86400)}\n\n`
  + 'หากคุณไม่ได้สมัครสมาชิก ไม่ต้องทำอะไร');

// Shared by [1] customer login and [14] admin login: 5 fails → locked 15 min, every attempt audited.
async function login(req, { adminOnly }) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const { password, remember } = req.body ?? {};
  if (!email || !password) throw new HttpError(400, 'กรุณากรอกอีเมลและรหัสผ่าน');

  const u = (await q('SELECT * FROM users WHERE email = $1', [email])).rows[0];
  if (u?.locked_until > new Date()) {
    await audit(u.id, 'login_locked', req);
    throw new HttpError(423, 'บัญชีถูกล็อกชั่วคราว', { lockedUntil: u.locked_until });
  }
  if (!u || !(await checkPassword(String(password), u.password_hash))) {
    let attemptsLeft;
    if (u) {
      const { rows: [r] } = await q(
        `UPDATE users SET
           locked_until  = CASE WHEN failed_logins + 1 >= $2 THEN now() + interval '15 minutes' END,
           failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END
         WHERE id = $1 RETURNING failed_logins, locked_until`, [u.id, MAX_FAILS]);
      attemptsLeft = r.locked_until ? 0 : MAX_FAILS - r.failed_logins;
    }
    await audit(u?.id ?? null, adminOnly ? 'admin_login_fail' : 'login_fail', req, email);
    throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', { attemptsLeft });
  }
  await q('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
  if (adminOnly && u.role !== 'admin') {
    await audit(u.id, 'admin_login_forbidden', req);
    throw new HttpError(403, 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบหลังร้าน');
  }
  await audit(u.id, adminOnly ? 'admin_login' : 'login', req);
  const token = await createSession(u.id, remember ? 30 : 1);
  return { token, user: { id: u.id, email: u.email, name: u.name, role: u.role, email_verified: !!u.email_verified_at } };
}

export const auth = Router()
  .post('/register', async (req, res) => {
    const { name, email, password } = req.body ?? {};
    const errors = {};
    if (!String(name ?? '').trim()) errors.name = 'กรุณากรอกชื่อ-นามสกุล';
    if (!EMAIL_RE.test(email ?? '')) errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    if (String(password ?? '').length < 8) errors.password = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
    if (Object.keys(errors).length) throw new HttpError(422, 'ข้อมูลไม่ถูกต้อง', { errors });

    const { rows } = await q(
      `INSERT INTO users (email, name, password_hash, mail_sent_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (email) DO NOTHING RETURNING id, email, name, role`,
      [email.trim().toLowerCase(), name.trim(), await hashPassword(password)]);
    if (!rows[0]) throw new HttpError(409, 'อีเมลนี้ถูกใช้แล้ว', { errors: { email: 'อีเมลนี้ถูกใช้แล้ว' } });
    sendVerify(req, rows[0]); // not awaited: signing up must not wait on (or fail with) SMTP
    res.status(201).json({ token: await createSession(rows[0].id, 1), user: { ...rows[0], email_verified: false } });
  })

  // ---- email verification. Unverified accounts are not blocked from anything: the account page nags instead. ----
  .post('/verify/send', requireAuth, async (req, res) => {
    if (req.user.email_verified) throw new HttpError(409, 'อีเมลนี้ยืนยันแล้ว');
    if (!(await claimMail(req.user.id))) throw new HttpError(429, 'เพิ่งส่งอีเมลไป กรุณารอ 1 นาทีแล้วลองใหม่');
    sendVerify(req, req.user);
    res.status(204).end();
  })
  // The emailed link lands here (a browser GET, so no Bearer) and bounces to the web page with the outcome.
  .get('/verify', async (req, res) => {
    const { u, exp, sig } = req.query;
    const { rows: [user] } = await q('SELECT id, email FROM users WHERE id = $1', [Number(u) || 0]);
    const ok = !!user && verifyLink('verify', user, exp, sig);
    if (ok) await q('UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1', [user.id]);
    res.redirect(`/account?verified=${ok ? 1 : 0}`);
  })

  // ---- password reset ----
  // Always 204: the answer must not reveal whether the address has an account.
  .post('/forgot', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const { rows: [u] } = await q('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
    await audit(u?.id ?? null, 'password_forgot', req, email);
    if (u && await claimMail(u.id)) sendMail(u.email, `ตั้งรหัสผ่านใหม่ — ${SHOP}`,
      `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี${SHOP}ของคุณ กดลิงก์นี้เพื่อตั้งรหัสผ่าน (ใช้ได้ 1 ชั่วโมง และใช้ได้ครั้งเดียว)\n\n`
      + `${link(req, '/reset', 'reset', u, 3600)}\n\nหากคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ`);
    res.status(204).end();
  })
  .post('/reset', async (req, res) => {
    const { u, exp, sig, password } = req.body ?? {};
    if (typeof password !== 'string' || password.length < 8)
      throw new HttpError(422, 'ข้อมูลไม่ถูกต้อง', { errors: { password: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' } });
    const { rows: [user] } = await q('SELECT id, password_hash FROM users WHERE id = $1', [Number(u) || 0]);
    if (!user || !verifyLink('reset', user, exp, sig))
      throw new HttpError(400, 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่');
    // the link only reaches the mailbox owner, so it proves the address too
    await q(
      `UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL,
         email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1`, [user.id, await hashPassword(password)]);
    await q('DELETE FROM sessions WHERE user_id = $1', [user.id]); // whoever was signed in with the old password is out
    await audit(user.id, 'password_reset', req);
    res.status(204).end();
  })
  .post('/login', async (req, res) => res.json(await login(req, { adminOnly: false })))
  .post('/admin/login', async (req, res) => res.json(await login(req, { adminOnly: true })))
  .post('/logout', requireAuth, async (req, res) => {
    await deleteSession(req.get('authorization').slice(7));
    res.status(204).end();
  })
  .get('/me', requireAuth, async (req, res) => {
    const { rows: [c] } = await q('SELECT count(*)::int AS n FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ user: req.user, cartCount: c.n });
  });
