import crypto from 'node:crypto';
import { promisify } from 'node:util';
import nodemailer from 'nodemailer';
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

// An account works only once its address is proven (SQL, for any query that aliases users as u).
// Admins are exempt: they are promoted by hand in the DB (README), never by signing up, and locking
// the owner out of /admin over a missing click would be worse than what the rule protects.
export const USABLE = `(u.email_verified_at IS NOT NULL OR u.role = 'admin')`;

async function loadUser(req) {
  const token = bearer(req);
  if (!token) return null;
  // USABLE here too: sessions opened before verification was enforced must stop working, not live out their 30 days
  const { rows } = await q(
    `SELECT u.id, u.email, u.name, u.role, u.created_at, u.email_verified_at IS NOT NULL AS email_verified
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND ${USABLE}`, [sha(token)]);
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

// ---- links in emails: the same HMAC, so no token table ----
// The signed string includes what the link is allowed to change: a reset link dies the moment the password
// changes (single use) and a verify link dies with the address. u = a users row (id, email, password_hash).
const linkKey = (kind, u) => `${kind}:${u.id}:${kind === 'reset' ? u.password_hash : u.email}`;
export const signLink = (kind, u, ttlSec) => ({ u: u.id, ...signDownload(linkKey(kind, u), ttlSec) });
export const verifyLink = (kind, u, exp, sig) => verifyDownload(linkKey(kind, u), exp, sig);

// ---- mail: Gmail SMTP (GMAIL_APP_PASSWORD is a Google "App Password", not the account password) ----
const mailer = process.env.GMAIL_USER ? nodemailer.createTransport({
  service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
}) : null;
if (!mailer) console.warn('GMAIL_USER is not set: no mail is sent, so new accounts can never verify their email and sign in');
// Never rejects: callers don't await it, and a mail failure must not undo a paid order. No GMAIL_USER = no-op.
// ponytail: one try, failures only logged, Gmail caps ~500 mails/day. Add orders.receipt_sent_at + a resend
// endpoint (or a real mail provider) when a lost receipt starts to matter.
export const sendMail = (to, subject, text) => mailer
  ?.sendMail({ from: `Digital Product Shop <${process.env.GMAIL_USER}>`, to, subject, text })
  .catch((e) => console.error('mail failed:', e.message));

// Plain-text receipt body. o = { order_no, total, paid_at: Date, items: [{ name, price }] } (ORDER_ITEMS in shop.js)
export function receiptText(o, libraryUrl) {
  const baht = (n) => `${Number(n).toLocaleString('th-TH')} บาท`;
  // the container runs in UTC: say Bangkok, or a 01:00 payment is dated the day before
  const paid = new Date(o.paid_at).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  return [
    `คำสั่งซื้อ ${o.order_no}`,
    `ชำระเงินเมื่อ ${paid} น.`,
    '',
    ...o.items.map((i) => `- ${i.name}  ${baht(i.price)}`),
    '',
    `ยอดรวม ${baht(o.total)}`,
    '',
    `ดาวน์โหลดสินค้า: ${libraryUrl}`,
  ].join('\n');
}

// ---- CSV (stdlib only; Excel opens it directly) ----
// Excel runs a cell starting with = + - @ as a formula, and names are typed by customers: guard strings with a
// leading ' (numbers stay numbers so -5 is still a number). parseCsv strips the guard again on import.
const FORMULA = '[=+\\-@\\t\\r]';
function csvCell(v) {
  let s = String(v ?? '');
  if (typeof v === 'string' && new RegExp('^' + FORMULA).test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
// BOM so Excel reads Thai as UTF-8, CRLF per RFC 4180. cols come from pg `fields` so an empty table still gets a header.
export const toCsv = (rows, cols) => '\uFEFF' + [cols, ...rows.map((r) => cols.map((c) => r[c]))]
  .map((r) => r.map((v) => csvCell(v instanceof Date ? v.toISOString() : v)).join(',')).join('\r\n');

// First row is the header → array of { header: cell }. Handles quotes, "" escapes, newlines inside quotes, CRLF, BOM.
export function parseCsv(text) {
  const s = text.replace(/^\uFEFF/, ''), rows = [[]];
  let cell = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { rows.at(-1).push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      rows.at(-1).push(cell); cell = ''; rows.push([]);
    } else cell += c;
  }
  rows.at(-1).push(cell);
  const [head, ...body] = rows;
  const unguard = new RegExp(`^'(?=${FORMULA})`);
  return body.filter((r) => r.some((x) => x !== ''))
    .map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').replace(unguard, '')])));
}

export const page = (req, size = 20) => {
  const p = Math.max(1, parseInt(req.query.page) || 1);
  return { limit: size, offset: (p - 1) * size, page: p };
};
