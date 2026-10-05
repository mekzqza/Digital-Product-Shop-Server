import path from 'node:path';
import { Router } from 'express';
import Stripe from 'stripe';
import {
  q, HttpError, CATEGORIES, DOWNLOAD_LIMIT, UPLOAD_DIR, optionalAuth, requireAuth,
  signDownload, verifyDownload, page, sendMail, receiptText,
} from './lib.js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_missing');

// Card fields shared by [2] [3] [4] [5].
export const CARD = `p.id, p.name, p.category, p.price, p.compare_at, p.file_types, p.file_size,
  left(p.description, 120) AS excerpt, '/api/covers/' || p.cover AS cover_url`;
const OWNED = `EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p.id AND o.user_id = $USER AND o.status = 'PAID')`;
const owned = (param) => OWNED.replace('$USER', param);

export const shop = Router();

// ---------- [2] storefront / [3] search ----------
// /products?q=&category=&min=&max=&sort=newest|price_asc|price_desc&page=
shop.get('/products', async (req, res) => {
  const { q: term, category, min, max, sort } = req.query;
  const params = [], where = [`p.status = 'PUBLISHED'`];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (term) add('p.name ILIKE ?', `%${term}%`);
  if (min) add('p.price >= ?', Number(min));
  if (max) add('p.price <= ?', Number(max));
  // facet counts for the filter rail ignore the category filter itself
  const facets = await q(`SELECT p.category, count(*)::int AS n FROM products p WHERE ${where.join(' AND ')} GROUP BY 1`, params);
  if (category && CATEGORIES.includes(category)) add('p.category = ?', category);

  const order = { price_asc: 'p.price ASC', price_desc: 'p.price DESC' }[sort] ?? 'p.created_at DESC';
  const { limit, offset, page: pg } = page(req, 24);
  const { rows } = await q(
    `SELECT ${CARD}, count(*) OVER ()::int AS total FROM products p
     WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
  res.json({
    items: rows.map(({ total, ...r }) => r),
    total: rows[0]?.total ?? 0, page: pg,
    categories: Object.fromEntries(facets.rows.map((r) => [r.category, r.n])),
  });
});

// ---------- [4] product detail ----------
shop.get('/products/:id', optionalAuth, async (req, res) => {
  const uid = req.user?.id ?? null;
  const { rows: [p] } = await q(
    `SELECT ${CARD}, p.description, p.version, p.updated_at,
       (SELECT count(*)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.status = 'PAID') AS sold,
       (SELECT o.paid_at FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = p.id AND o.user_id = $2 AND o.status = 'PAID' LIMIT 1) AS owned_since,
       EXISTS (SELECT 1 FROM cart_items WHERE user_id = $2 AND product_id = p.id) AS in_cart
     FROM products p WHERE p.id = $1 AND p.status = 'PUBLISHED'`, [req.params.id, uid]);
  if (!p) throw new HttpError(404, 'ไม่พบสินค้านี้');
  const related = await q(
    `SELECT ${CARD} FROM products p WHERE p.category = $1 AND p.id <> $2 AND p.status = 'PUBLISHED'
       AND ($3::bigint IS NULL OR NOT ${owned('$3')}) ORDER BY p.created_at DESC LIMIT 4`,
    [p.category, p.id, uid]);
  res.json({ ...p, related: related.rows });
});

// ---------- [5] cart (server-side for logged-in users; guests keep it client-side and POST on login) ----------
shop.get('/cart', requireAuth, async (req, res) => {
  const removed = await q(
    `DELETE FROM cart_items c USING products p WHERE c.product_id = p.id AND c.user_id = $1 AND p.status <> 'PUBLISHED'
     RETURNING p.id, p.name`, [req.user.id]);
  const { rows } = await q(
    `SELECT ${CARD} FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.user_id = $1 ORDER BY c.added_at`,
    [req.user.id]);
  res.json({ items: rows, total: rows.reduce((s, r) => s + r.price, 0), removed: removed.rows });
});

shop.post('/cart', requireAuth, async (req, res) => {
  const ids = [].concat(req.body?.productIds ?? req.body?.productId ?? []).map(Number);
  const { rows } = await q(
    `INSERT INTO cart_items (user_id, product_id)
     SELECT $1, p.id FROM products p WHERE p.id = ANY($2) AND p.status = 'PUBLISHED' AND NOT ${owned('$1')}
     ON CONFLICT DO NOTHING RETURNING product_id`, [req.user.id, ids]);
  if (ids.length === 1 && !rows.length) throw new HttpError(409, 'สินค้านี้อยู่ในตะกร้าแล้ว หรือคุณเป็นเจ้าของแล้ว');
  const { rows: [c] } = await q('SELECT count(*)::int AS n FROM cart_items WHERE user_id = $1', [req.user.id]);
  res.status(201).json({ added: rows.map((r) => r.product_id), cartCount: c.n });
});

shop.delete('/cart/:productId', requireAuth, async (req, res) => {
  await q('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
  res.status(204).end();
});

// ---------- [6] checkout: body { productIds? } — omitted = whole cart, given = "ซื้อเลย" ----------
shop.post('/checkout', requireAuth, async (req, res) => {
  const uid = req.user.id;
  let ids = req.body?.productIds?.map(Number);
  if (!ids) ids = (await q('SELECT product_id FROM cart_items WHERE user_id = $1', [uid])).rows.map((r) => r.product_id);

  const { rows: [order] } = await q(
    `WITH p AS (SELECT p.id, p.price FROM products p
                WHERE p.id = ANY($2) AND p.status = 'PUBLISHED' AND NOT ${owned('$1')}),
          o AS (INSERT INTO orders (user_id, total) SELECT $1, sum(price) FROM p HAVING count(*) > 0
                RETURNING id, order_no, total),
          i AS (INSERT INTO order_items (order_id, product_id, price) SELECT o.id, p.id, p.price FROM o, p)
     SELECT * FROM o`, [uid, ids]);
  if (!order) throw new HttpError(400, 'ไม่มีสินค้าที่ชำระเงินได้');

  try {
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(order.total * 100), currency: 'thb',
      receipt_email: req.user.email,
      metadata: { order_no: order.order_no },
      automatic_payment_methods: { enabled: true },
    });
    await q('UPDATE orders SET payment_intent = $1 WHERE id = $2', [pi.id, order.id]);
    res.status(201).json({ orderNo: order.order_no, total: order.total, clientSecret: pi.client_secret });
  } catch (e) {
    await q(`UPDATE orders SET status = 'FAILED', failure_code = 'stripe_error' WHERE id = $1`, [order.id]);
    throw e;
  }
});

// Stripe is the only source of truth for PAID/FAILED ([7]). Mounted with a raw body in app.js.
export async function stripeWebhook(req, res) {
  let ev;
  try {
    ev = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send('bad signature');
  }
  const pi = ev.data.object;
  if (ev.type === 'payment_intent.succeeded') {
    // status <> 'PAID' also covers FAILED → PAID when the buyer retries the same intent with another card
    const { rows: [o] } = await q(
      `UPDATE orders SET status = 'PAID', paid_at = now(), failure_code = NULL
       WHERE payment_intent = $1 AND status IN ('PENDING', 'FAILED') RETURNING id, user_id`, [pi.id]);
    if (o) {
      await q(
        `DELETE FROM cart_items WHERE user_id = $1 AND product_id IN (SELECT product_id FROM order_items WHERE order_id = $2)`,
        [o.user_id, o.id]);
      const { rows: [r] } = await q(
        `SELECT u.email, o.order_no, o.total, o.paid_at, ${ORDER_ITEMS}
         FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [o.id]);
      // not awaited: Stripe wants its 2xx fast. The UPDATE above matches once, so webhook retries can't resend.
      sendMail(r.email, `ใบเสร็จรับเงิน ${r.order_no}`, receiptText(r, `${req.protocol}://${req.get('host')}/library`));
    }
  } else if (ev.type === 'payment_intent.payment_failed') {
    const err = pi.last_payment_error;
    await q(`UPDATE orders SET status = 'FAILED', failure_code = $2 WHERE payment_intent = $1 AND status = 'PENDING'`,
      [pi.id, err?.decline_code ?? err?.code ?? 'payment_failed']);
  }
  res.json({ received: true });
}

// ---------- [7] result + [9] order history ----------
const ORDER_ITEMS = `(SELECT coalesce(json_agg(json_build_object(
    'itemId', oi.id, 'productId', p.id, 'name', p.name, 'category', p.category, 'price', oi.price,
    'coverUrl', '/api/covers/' || p.cover, 'fileTypes', p.file_types, 'fileSize', p.file_size,
    'downloads', oi.downloads) ORDER BY oi.id), '[]')
  FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id) AS items`;

shop.get('/orders', requireAuth, async (req, res) => {
  const params = [req.user.id], where = ['o.user_id = $1'];
  if (req.query.status) { params.push(req.query.status); where.push(`o.status = $${params.length}`); }
  if (req.query.year) { // พ.ศ. year, e.g. 2569
    params.push(Number(req.query.year) - 543);
    where.push(`extract(year FROM o.created_at) = $${params.length}`);
  }
  const { rows } = await q(
    `SELECT o.order_no, o.status, o.total, o.failure_code, o.created_at, o.paid_at, o.payment_intent, ${ORDER_ITEMS}
     FROM orders o WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC`, params);
  res.json({ items: rows });
});

shop.get('/orders/:orderNo', requireAuth, async (req, res) => {
  const { rows: [o] } = await q(
    `SELECT o.order_no, o.status, o.total, o.failure_code, o.created_at, o.paid_at, ${ORDER_ITEMS}
     FROM orders o WHERE o.order_no = $1 AND o.user_id = $2`, [req.params.orderNo, req.user.id]);
  if (!o) throw new HttpError(404, 'ไม่พบคำสั่งซื้อ');
  res.json(o); // PENDING = "กำลังตรวจสอบการชำระเงิน": poll until webhook flips it
});

// ---------- [8] library + downloads ----------
shop.get('/library', requireAuth, async (req, res) => {
  const { rows } = await q(
    `SELECT oi.id AS item_id, p.id AS product_id, p.name, p.category, '/api/covers/' || p.cover AS cover_url,
       p.file_types, p.file_size, p.version, o.order_no, o.paid_at,
       oi.downloads, $2::int AS download_limit, o.paid_at + interval '1 year' AS expires_at
     FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
     WHERE o.user_id = $1 AND o.status = 'PAID' ORDER BY o.paid_at DESC`, [req.user.id, DOWNLOAD_LIMIT]);
  res.json({ items: rows });
});

// Spends one download and returns a 5-minute signed URL. Absolute so App Inventor can hand it to Chrome.
shop.post('/library/:itemId/download', requireAuth, async (req, res) => {
  const { rows: [r] } = await q(
    `UPDATE order_items oi SET downloads = downloads + 1 FROM orders o
     WHERE oi.id = $1 AND o.id = oi.order_id AND o.user_id = $2 AND o.status = 'PAID'
       AND o.paid_at + interval '1 year' > now() AND oi.downloads < $3
     RETURNING oi.downloads`, [req.params.itemId, req.user.id, DOWNLOAD_LIMIT]);
  if (!r) throw new HttpError(403, 'ดาวน์โหลดครบจำนวนครั้งแล้ว หรือสิทธิ์หมดอายุ');
  const { exp, sig } = signDownload(req.params.itemId);
  res.json({
    url: `${req.protocol}://${req.get('host')}/api/files/${req.params.itemId}?exp=${exp}&sig=${sig}`,
    downloadsLeft: DOWNLOAD_LIMIT - r.downloads, expiresIn: 300,
  });
});

// No Bearer here: the signature is the auth, because an external browser can't send headers.
shop.get('/files/:itemId', async (req, res) => {
  if (!verifyDownload(req.params.itemId, req.query.exp, req.query.sig)) throw new HttpError(403, 'ลิงก์ดาวน์โหลดหมดอายุ');
  const { rows: [f] } = await q(
    `SELECT p.file, p.file_name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.id = $1`,
    [req.params.itemId]);
  if (!f?.file) throw new HttpError(404, 'ไม่พบไฟล์');
  res.download(path.resolve(UPLOAD_DIR, 'files', f.file), f.file_name);
});
