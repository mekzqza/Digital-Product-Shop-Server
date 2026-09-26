import { Router } from 'express';
import { q, HttpError, hashPassword, checkPassword, createSession, deleteSession, requireAuth, audit } from './lib.js';

const MAX_FAILS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  return { token, user: { id: u.id, email: u.email, name: u.name, role: u.role } };
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
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING id, email, name, role`,
      [email.trim().toLowerCase(), name.trim(), await hashPassword(password)]);
    if (!rows[0]) throw new HttpError(409, 'อีเมลนี้ถูกใช้แล้ว', { errors: { email: 'อีเมลนี้ถูกใช้แล้ว' } });
    res.status(201).json({ token: await createSession(rows[0].id, 1), user: rows[0] });
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
