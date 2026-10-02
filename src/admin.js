import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { Router } from 'express';
import multer from 'multer';
import { q, HttpError, CATEGORIES, UPLOAD_DIR, requireAdmin, audit, page, toCsv, parseCsv } from './lib.js';
import { stripe, CARD } from './shop.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_DIR, file.fieldname === 'cover' ? 'covers' : 'files')),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.fieldname === 'cover'
      ? /^image\/(jpeg|png)$/.test(file.mimetype)
      : /\.(zip|pdf|mp4)$/i.test(file.originalname);
    cb(ok ? null : new HttpError(422, 'ประเภทไฟล์ไม่รองรับ', { errors: { [file.fieldname]: 'ประเภทไฟล์ไม่รองรับ' } }), ok);
  },
}).fields([{ name: 'cover', maxCount: 1 }, { name: 'file', maxCount: 1 }]);

export const admin = Router();
admin.use(requireAdmin); // [10]–[13]: every route admin-only

// ---------- [10] dashboard: /stats?days=30 ----------
admin.get('/stats', async (req, res) => {
  const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
  const { rows: [s] } = await q(
    `WITH cur AS (SELECT now() - make_interval(days => $1) AS since),
          prev AS (SELECT now() - make_interval(days => $1 * 2) AS since)
     SELECT
       (SELECT coalesce(sum(total), 0) FROM orders, cur WHERE status = 'PAID' AND paid_at >= cur.since) AS sales,
       (SELECT coalesce(sum(total), 0) FROM orders, cur, prev WHERE status = 'PAID' AND paid_at >= prev.since AND paid_at < cur.since) AS sales_prev,
       (SELECT count(*)::int FROM orders, cur WHERE created_at >= cur.since) AS orders,
       (SELECT count(*)::int FROM orders, cur, prev WHERE created_at >= prev.since AND created_at < cur.since) AS orders_prev,
       (SELECT count(*)::int FROM orders, cur WHERE status = 'PAID' AND created_at >= cur.since) AS orders_paid,
       (SELECT count(*)::int FROM orders, cur WHERE status = 'FAILED' AND created_at >= cur.since) AS orders_failed,
       (SELECT count(*)::int FROM orders WHERE status = 'PENDING') AS orders_pending,
       (SELECT count(*)::int FROM products WHERE status = 'PUBLISHED') AS products_published,
       (SELECT count(*)::int FROM products WHERE status = 'DRAFT') AS products_draft,
       (SELECT count(*)::int FROM users, cur WHERE role = 'customer' AND created_at >= cur.since) AS new_users,
       (SELECT count(*)::int FROM users, cur, prev WHERE role = 'customer' AND created_at >= prev.since AND created_at < cur.since) AS new_users_prev`,
    [days]);
  // bucket=day|week|month for the chart tabs
  const bucket = ['day', 'week', 'month'].includes(req.query.bucket) ? req.query.bucket : 'day';
  const series = await q(
    `SELECT date_trunc($2, paid_at) AS t, sum(total) AS sales FROM orders
     WHERE status = 'PAID' AND paid_at >= now() - make_interval(days => $1) GROUP BY 1 ORDER BY 1`, [days, bucket]);
  const recent = await q(
    `SELECT o.order_no, u.email, o.created_at, o.total, o.status,
       (SELECT count(*)::int FROM order_items WHERE order_id = o.id) AS item_count
     FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 5`);
  const top = await q(
    `SELECT p.id, p.name, p.category, count(*)::int AS sold, sum(oi.price) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
     WHERE o.status = 'PAID' AND o.paid_at >= now() - make_interval(days => $1)
     GROUP BY p.id ORDER BY sold DESC, revenue DESC LIMIT 5`, [days]);
  res.json({ ...s, days, series: series.rows, recentOrders: recent.rows, topProducts: top.rows });
});

// ---------- users: /users?q=&role=&page= — read-only, roles are set in the DB (README: สร้างแอดมิน) ----------
admin.get('/users', async (req, res) => {
  const { q: term, role } = req.query;
  const params = [], where = ['true'];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (term) add('(u.email ILIKE ? OR u.name ILIKE ?)', `%${term}%`);
  if (['customer', 'admin'].includes(role)) add('u.role = ?', role);
  const { limit, offset, page: pg } = page(req, 20);
  const { rows } = await q(
    `SELECT u.id, u.email, u.name, u.role, u.created_at,
       (SELECT count(*)::int FROM orders WHERE user_id = u.id AND status = 'PAID') AS paid_orders,
       (SELECT coalesce(sum(total), 0) FROM orders WHERE user_id = u.id AND status = 'PAID') AS total_spent,
       count(*) OVER ()::int AS total
     FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({ items: rows.map(({ total, ...r }) => r), total: rows[0]?.total ?? 0, page: pg });
});

// ---------- [11] product list: /products?q=&category=&status=&sort=&page= ----------
admin.get('/products', async (req, res) => {
  const { q: term, category, status, sort } = req.query;
  const params = [], where = ['true'];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (term) add(`(p.name ILIKE ? OR 'SKU-' || lpad(p.id::text, 5, '0') ILIKE ?)`, `%${term}%`);
  if (CATEGORIES.includes(category)) add('p.category = ?', category);
  if (['DRAFT', 'PUBLISHED'].includes(status)) add('p.status = ?', status);
  const order = { name: 'p.name', price_asc: 'p.price', price_desc: 'p.price DESC' }[sort] ?? 'p.updated_at DESC';
  const { limit, offset, page: pg } = page(req, 20);
  const { rows } = await q(
    `SELECT ${CARD}, 'SKU-' || lpad(p.id::text, 5, '0') AS sku, p.status, p.version, p.file IS NOT NULL AS has_file,
       p.updated_at, count(*) OVER ()::int AS total
     FROM products p WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({ items: rows.map(({ total, ...r }) => r), total: rows[0]?.total ?? 0, page: pg });
});

admin.get('/products/:id', async (req, res) => {
  const { rows: [p] } = await q(
    `SELECT p.*, 'SKU-' || lpad(p.id::text, 5, '0') AS sku, '/api/covers/' || p.cover AS cover_url FROM products p WHERE id = $1`,
    [req.params.id]);
  if (!p) throw new HttpError(404, 'ไม่พบสินค้า');
  res.json(p);
});

// ---------- [12] product form: multipart (fields + optional cover/file) ----------
function validate(b, existing) {
  const errors = {};
  if (!String(b.name ?? '').trim()) errors.name = 'กรุณากรอกชื่อสินค้า';
  if (!CATEGORIES.includes(b.category)) errors.category = 'เลือกหมวดหมู่อย่างน้อย 1 หมวด';
  if (!(Number(b.price) > 0)) errors.price = 'ราคาต้องมากกว่า 0';
  if (String(b.description ?? '').length > 2000) errors.description = 'รายละเอียดยาวเกิน 2,000 ตัวอักษร';
  if (b.status === 'PUBLISHED') {
    if (!existing.cover) errors.cover = 'ต้องมีภาพปกก่อนเผยแพร่';
    if (!existing.file) errors.file = 'ต้องอัปโหลดไฟล์สินค้าก่อนเผยแพร่';
  }
  if (Object.keys(errors).length) throw new HttpError(422, `บันทึกไม่สำเร็จ — มี ${Object.keys(errors).length} ช่องที่ต้องแก้`, { errors });
}

async function saveProduct(req, id) {
  const old = id ? (await q('SELECT * FROM products WHERE id = $1', [id])).rows[0] : {};
  if (id && !old) throw new HttpError(404, 'ไม่พบสินค้า');
  const cover = req.files?.cover?.[0], file = req.files?.file?.[0];
  const merged = { cover: cover?.filename ?? old.cover, file: file?.filename ?? old.file };
  const b = { ...req.body, status: req.body.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT' };
  try {
    validate(b, merged);
  } catch (e) { // don't leave orphaned uploads behind a failed save
    await Promise.all([cover, file].filter(Boolean).map((f) => fs.rm(f.path, { force: true })));
    throw e;
  }
  const vals = [b.name.trim(), b.category, Number(b.price), Number(b.compare_at) || null, b.description ?? '',
    merged.cover, merged.file, file?.originalname ?? old.file_name, file?.size ?? old.file_size,
    b.file_types ?? old.file_types ?? null, b.version ?? old.version ?? null, b.status];
  const { rows: [p] } = id
    ? await q(`UPDATE products SET name=$1, category=$2, price=$3, compare_at=$4, description=$5, cover=$6, file=$7,
                 file_name=$8, file_size=$9, file_types=$10, version=$11, status=$12, updated_at=now()
               WHERE id = $13 RETURNING *`, [...vals, id])
    : await q(`INSERT INTO products (name, category, price, compare_at, description, cover, file, file_name, file_size,
                 file_types, version, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, vals);
  // replaced files are unreachable now
  if (cover && old.cover) await fs.rm(path.join(UPLOAD_DIR, 'covers', old.cover), { force: true });
  if (file && old.file) await fs.rm(path.join(UPLOAD_DIR, 'files', old.file), { force: true });
  await audit(req.user.id, id ? 'product_update' : 'product_create', req, String(p.id));
  return p;
}

admin.post('/products', upload, async (req, res) => res.status(201).json(await saveProduct(req, null)));
admin.put('/products/:id', upload, async (req, res) => res.json(await saveProduct(req, req.params.id)));

// Bulk publish/unpublish from [11] checkboxes: { ids: [], status }
admin.patch('/products', async (req, res) => {
  const status = req.body?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
  const { rows } = await q(
    `UPDATE products SET status = $1, updated_at = now()
     WHERE id = ANY($2) AND ($1 = 'DRAFT' OR (cover IS NOT NULL AND file IS NOT NULL)) RETURNING id`,
    [status, (req.body?.ids ?? []).map(Number)]);
  res.json({ updated: rows.map((r) => r.id) });
});

admin.delete('/products/:id', async (req, res) => {
  const { rows: [p] } = await q('SELECT id, name, cover, file FROM products WHERE id = $1', [req.params.id]);
  if (!p) throw new HttpError(404, 'ไม่พบสินค้า');
  const { rows: [{ buyers }] } = await q(
    `SELECT count(DISTINCT o.user_id)::int AS buyers FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.product_id = $1`, [p.id]);

  // [11]-B: deleting would break buyers' downloads — refuse and let the admin switch to DRAFT instead
  if (buyers > 0) {
    throw new HttpError(409, 'ลบไม่ได้ เพราะมีผู้ซื้อแล้ว — ให้เปลี่ยนเป็น DRAFT แทน', { buyers, suggest: 'DRAFT' });
  }

  await q('DELETE FROM products WHERE id = $1', [p.id]);
  await Promise.all([
    p.cover && fs.rm(path.join(UPLOAD_DIR, 'covers', p.cover), { force: true }),
    p.file && fs.rm(path.join(UPLOAD_DIR, 'files', p.file), { force: true }),
  ]);
  await audit(req.user.id, 'product_delete', req, String(p.id));
  res.status(204).end();
});

// ---------- [13] orders + drawer ----------
// /orders?q=&status=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=
admin.get('/orders', async (req, res) => {
  const { q: term, status, from, to } = req.query;
  const params = [], where = ['true'];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
  if (term) add('(o.order_no ILIKE ? OR u.email ILIKE ?)', `%${term}%`);
  if (['PENDING', 'PAID', 'FAILED', 'REFUNDED'].includes(status)) add('o.status = ?', status);
  if (from) add('o.created_at >= ?::date', from);
  if (to) add(`o.created_at < ?::date + 1`, to);
  const { limit, offset, page: pg } = page(req, 20);
  const { rows } = await q(
    `SELECT o.order_no, u.email, o.created_at, o.total, o.status,
       (SELECT count(*)::int FROM order_items WHERE order_id = o.id) AS item_count, count(*) OVER ()::int AS total_rows
     FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where.join(' AND ')}
     ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  const { rows: [c] } = await q(
    `SELECT count(*) FILTER (WHERE status = 'PENDING')::int AS pending, count(*) FILTER (WHERE status = 'FAILED')::int AS failed FROM orders`);
  res.json({ items: rows.map(({ total_rows, ...r }) => r), total: rows[0]?.total_rows ?? 0, page: pg, counts: c });
});

admin.get('/orders/:orderNo', async (req, res) => {
  const { rows: [o] } = await q(
    `SELECT o.order_no, o.status, o.total, o.failure_code, o.payment_intent, o.created_at, o.paid_at,
       json_build_object('name', u.name, 'email', u.email, 'memberSince', u.created_at,
         'orderCount', (SELECT count(*) FROM orders WHERE user_id = u.id),
         'lifetimeTotal', (SELECT coalesce(sum(total), 0) FROM orders WHERE user_id = u.id AND status = 'PAID')) AS customer,
       (SELECT json_agg(json_build_object('name', p.name, 'category', p.category, 'price', oi.price,
          'coverUrl', '/api/covers/' || p.cover, 'downloads', oi.downloads) ORDER BY oi.id)
        FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id) AS items
     FROM orders o JOIN users u ON u.id = o.user_id WHERE o.order_no = $1`, [req.params.orderNo]);
  if (!o) throw new HttpError(404, 'ไม่พบคำสั่งซื้อ');
  res.json({ ...o, testMode: !process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_'),
    stripeUrl: o.payment_intent && `https://dashboard.stripe.com/test/payments/${o.payment_intent}` });
});

admin.post('/orders/:orderNo/refund', async (req, res) => {
  const { rows: [o] } = await q(`SELECT id, status, payment_intent FROM orders WHERE order_no = $1`, [req.params.orderNo]);
  if (!o) throw new HttpError(404, 'ไม่พบคำสั่งซื้อ');
  if (o.status !== 'PAID') throw new HttpError(409, 'คืนเงินได้เฉพาะคำสั่งซื้อที่ PAID');
  await stripe.refunds.create({ payment_intent: o.payment_intent });
  await q(`UPDATE orders SET status = 'REFUNDED' WHERE id = $1`, [o.id]); // revokes library access
  await audit(req.user.id, 'order_refund', req, req.params.orderNo);
  res.json({ status: 'REFUNDED' });
});

// ---------- import / export: CSV (opens in Excel) or JSON ----------
// /export/products|users|orders?format=csv|json
const EXPORTS = {
  products: `SELECT id, name, category, price, compare_at, description, file_types, version, status, created_at, updated_at
             FROM products ORDER BY id`,
  users: `SELECT u.id, u.email, u.name, u.role, u.created_at,
            count(o.id)::int AS paid_orders, coalesce(sum(o.total), 0) AS total_spent
          FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'PAID' GROUP BY u.id ORDER BY u.id`,
  orders: `SELECT o.order_no, u.email, o.status, o.total, o.created_at, o.paid_at,
             (SELECT string_agg(p.name, ' | ' ORDER BY oi.id) FROM order_items oi JOIN products p ON p.id = oi.product_id
              WHERE oi.order_id = o.id) AS items
           FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC`,
};

admin.get('/export/:what', async (req, res) => {
  const { what } = req.params;
  if (!Object.hasOwn(EXPORTS, what)) throw new HttpError(404, 'not found');
  const ext = req.query.format === 'json' ? 'json' : 'csv';
  // ponytail: whole table in memory — stream with pg-cursor if a table outgrows ~100k rows
  const { rows, fields } = await q(EXPORTS[what]);
  await audit(req.user.id, 'export', req, `${what}.${ext}`); // the users export is personal data
  res.attachment(`${what}-${new Date().toISOString().slice(0, 10)}.${ext}`);
  res.send(ext === 'json' ? JSON.stringify(rows, null, 2) : toCsv(rows, fields.map((f) => f.name)));
});

const IMPORT_COLS = ['name', 'category', 'price', 'compare_at', 'description', 'file_types', 'version'];

// Body is the file's text: CSV with a header row, or a JSON array — same columns as the products export.
// Row without id → new DRAFT (cover/file are uploaded later in [12]); row with id → overwrite the text columns.
// All-or-nothing: every row is validated first, then a single statement writes them.
admin.post('/import/products', express.text({ type: 'text/*', limit: '5mb' }), async (req, res) => {
  let rows = req.body; // already an array when the client sent application/json
  if (typeof rows === 'string') {
    const text = rows.replace(/^\uFEFF/, '').trim();
    try { rows = text.startsWith('[') ? JSON.parse(text) : parseCsv(text); } catch { rows = null; }
  }
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'อ่านไฟล์ไม่ได้ — ต้องเป็น CSV ที่มีแถวหัวตาราง หรือ JSON array');
  rows = rows.map((r) => (r && typeof r === 'object' ? r : {}));

  const idOf = (r) => (r.id == null || r.id === '' ? null : Number(r.id));
  const { rows: found } = await q('SELECT id FROM products WHERE id = ANY($1)', [rows.map(idOf).filter(Number.isSafeInteger)]);
  const known = new Set(found.map((p) => Number(p.id)));

  const errors = [];
  rows.forEach((r, i) => {
    const id = idOf(r);
    let e;
    if (id != null && !known.has(id)) e = { id: `ไม่พบสินค้า id ${r.id}` };
    // an update overwrites every column, so a file missing one would silently blank it
    else if (id != null && IMPORT_COLS.some((c) => !(c in r))) e = { id: `แถวที่มี id ต้องมีครบทุกคอลัมน์: ${IMPORT_COLS.join(', ')}` };
    else try { validate({ ...r, status: null }, {}); } catch (err) { e = err.extra.errors; }
    if (e) errors.push({ row: i + 1, name: r.name, errors: e });
  });
  if (errors.length) {
    throw new HttpError(422, `นำเข้าไม่สำเร็จ — มี ${errors.length} แถวที่ต้องแก้ ยังไม่มีการบันทึกข้อมูล`, { rows: errors.slice(0, 50) });
  }

  const clean = rows.map((r) => ({
    id: idOf(r), name: String(r.name).trim(), category: r.category, price: Number(r.price),
    compare_at: Number(r.compare_at) || null, description: String(r.description ?? ''),
    file_types: r.file_types || null, version: r.version || null,
  }));
  const { rows: [n] } = await q(
    `WITH r AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id bigint, name text, category text, price numeric,
                  compare_at numeric, description text, file_types text, version text)),
          u AS (UPDATE products p SET name = r.name, category = r.category, price = r.price, compare_at = r.compare_at,
                  description = r.description, file_types = r.file_types, version = r.version, updated_at = now()
                FROM r WHERE p.id = r.id RETURNING p.id),
          i AS (INSERT INTO products (name, category, price, compare_at, description, file_types, version)
                SELECT name, category, price, compare_at, description, file_types, version FROM r WHERE id IS NULL RETURNING id)
     SELECT (SELECT count(*)::int FROM i) AS created, (SELECT count(*)::int FROM u) AS updated`, [JSON.stringify(clean)]);
  await audit(req.user.id, 'product_import', req, `created ${n.created}, updated ${n.updated}`);
  res.json(n);
});
