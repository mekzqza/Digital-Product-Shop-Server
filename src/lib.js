import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

pg.types.setTypeParser(1700, Number); // numeric → JS number (prices fit easily)
export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const q = (sql, params) => db.query(sql, params);

export const CATEGORIES = ['ebook', 'template', 'source-code', 'online-course', 'design-assets'];
export const DOWNLOAD_LIMIT = 5;
export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

// ---- passwords (stdlib scrypt, no bcrypt dep) ----
const scrypt = promisify(crypto.scrypt);
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(pw, salt, 64)).toString('hex')}`;
}
export async function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), await scrypt(pw, salt, 64));
}

// ---- sessions: opaque Bearer tokens (App Inventor can't use cookies) ----
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export async function createSession(userId, days) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q(`INSERT INTO sessions VALUES ($1, $2, now() + make_interval(days => $3))`, [sha(token), userId, days]);
  return token;
}
export const deleteSession = (token) => q('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]);

const bearer = (req) => req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];

async function loadUser(req) {
  const token = bearer(req);
  if (!token) return null;
  const { rows } = await q(
    `SELECT u.id, u.email, u.name, u.role, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha(token)]);
  return rows[0] || null;
}

export const optionalAuth = async (req, res, next) => { req.user = await loadUser(req); next(); };
export const requireAuth = async (req, res, next) => {
  req.user = await loadUser(req);
  if (!req.user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
  next();
};
export const requireAdmin = async (req, res, next) => {
  req.user = await loadUser(req);
  if (!req.user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
  if (req.user.role !== 'admin') throw new HttpError(403, 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบหลังร้าน'); // 403, not 401
  next();
};

export const audit = (userId, action, req, detail = null) =>
  q('INSERT INTO audit_log (user_id, action, detail, ip) VALUES ($1, $2, $3, $4)', [userId, action, detail, req.ip]);

// ---- signed download URLs (HMAC, 5 min) ----
const secret = () => {
  if (!process.env.APP_SECRET) throw new Error('APP_SECRET is not set');
  return process.env.APP_SECRET;
};
export function signDownload(itemId, ttlSec = 300, now = Date.now()) {
  const exp = Math.floor(now / 1000) + ttlSec;
  const sig = crypto.createHmac('sha256', secret()).update(`${itemId}.${exp}`).digest('base64url');
  return { exp, sig };
}
export function verifyDownload(itemId, exp, sig, now = Date.now()) {
  if (!(Number(exp) > now / 1000)) return false;
  const good = crypto.createHmac('sha256', secret()).update(`${itemId}.${exp}`).digest('base64url');
  return typeof sig === 'string' && sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

export const page = (req, size = 20) => {
  const p = Math.max(1, parseInt(req.query.page) || 1);
  return { limit: size, offset: (p - 1) * size, page: p };
};
