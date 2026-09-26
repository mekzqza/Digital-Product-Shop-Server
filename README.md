# Digital Product Shop (โหลดเลย)

ร้านขายสินค้าดิจิทัล (อีบุ๊ก เทมเพลต ซอร์สโค้ด คอร์ส ไฟล์กราฟิก) ชำระเงินผ่าน Stripe (test mode)
ใช้ backend API ตัวเดียวกันทั้งเว็บ, แอปมือถือ (MIT App Inventor) และ desktop

- **Backend:** Node.js 24 + Express 5 + PostgreSQL 17 — `src/`
- **Frontend:** Next.js 15 — `web/`
- **Deploy:** docker compose บน VPS, nginx reverse proxy → `https://digital-product-shop.sukpat.dev`

## โครงสร้าง

```
db/schema.sql          ตารางทั้งหมด (รันอัตโนมัติครั้งแรกที่สร้าง volume ของ Postgres)
src/app.js             Express app, error handler, mount routes
src/lib.js             DB pool, hash รหัสผ่าน, session token, signed download URL
src/auth.js            สมัคร / ล็อกอิน / ล็อกอินแอดมิน / logout / me
src/shop.js            สินค้า, ตะกร้า, checkout, Stripe webhook, คำสั่งซื้อ, คลัง, ดาวน์โหลด
src/admin.js           แดชบอร์ด, จัดการสินค้า (อัปโหลดไฟล์), คำสั่งซื้อ, คืนเงิน
test/                  node:test
web/app/(shop)/        หน้าลูกค้า [1]–[9] (mobile-first + desktop)
web/app/admin/         หน้าแอดมิน [10]–[14] (desktop ≥1280px เท่านั้น)
```

## ติดตั้งบน server

```bash
git clone https://github.com/mekzqza/Digital-Product-Shop-Server.git
cd Digital-Product-Shop-Server
cp .env.example .env        # เติมค่าจริง (ดูตารางด้านล่าง)
docker compose up -d --build
curl http://localhost/api/health   # ผ่าน nginx → {"ok":true}
```

| ตัวแปร | ความหมาย |
|---|---|
| `POSTGRES_PASSWORD` | รหัสผ่าน DB |
| `APP_SECRET` | ใช้เซ็นลิงก์ดาวน์โหลด — สุ่มด้วย `openssl rand -hex 32` (ไม่ตั้ง = API ดาวน์โหลดไม่ทำงาน) |
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` จากหน้า webhook ของ Stripe |
| `NEXT_PUBLIC_STRIPE_PK` | `pk_test_…` — ฝังตอน build หน้าเว็บ เปลี่ยนแล้วต้อง `docker compose build web` |

### nginx

```nginx
location /api/ {
  proxy_pass http://api:4000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 500m;          # ไฟล์สินค้าใหญ่สุด 500 MB
}
location / {
  proxy_pass http://web:3000;
}
```

### Stripe webhook

Stripe Dashboard (Test mode) → Developers → Webhooks → Add endpoint

- URL: `https://digital-product-shop.sukpat.dev/api/stripe/webhook`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`

สถานะ PAID / FAILED มาจาก webhook เท่านั้น — ถ้าจ่ายแล้ว order ค้าง PENDING ให้เช็กตรงนี้ก่อน

### สร้างแอดมิน

ไม่มีหน้าสมัครแอดมิน สมัครเป็นลูกค้าก่อนแล้วเปลี่ยน role ใน DB:

```bash
docker compose exec db psql -U shop -c "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

แล้วเข้า `/admin/login`

### ทดสอบการจ่ายเงิน

- สำเร็จ: `4242 4242 4242 4242` · วันหมดอายุอนาคตใดก็ได้ · CVC 3 หลักใดก็ได้
- ถูกปฏิเสธ: `4000 0000 0000 0002`

## พัฒนาในเครื่อง

```bash
npm install && npm test                       # backend unit test
npm run dev                                   # ต้องมี .env + Postgres
cd web && npm install
API_ORIGIN=http://localhost:4000 npm run dev  # proxy /api ไปที่ backend
```

## API (สรุป)

ทุก endpoint อยู่ใต้ `/api` · auth ใช้ `Authorization: Bearer <token>` (ไม่ใช้ cookie เพื่อให้ App Inventor ใช้ได้)
error ตอบเป็น `{ "error": "ข้อความ", ...extra }` · validation ตอบ 422 พร้อม `errors: { field: msg }`

| Method | Path | Auth | หมายเหตุ |
|---|---|---|---|
| POST | `/auth/register` | – | `{name,email,password}` → `{token,user}` |
| POST | `/auth/login` | – | `{email,password,remember}` · ผิด 5 ครั้งล็อก 15 นาที (423) |
| POST | `/auth/admin/login` | – | รหัสถูกแต่ไม่ใช่แอดมิน → 403 |
| POST | `/auth/logout` · GET `/auth/me` | user | `me` คืน `cartCount` ด้วย |
| GET | `/products?q&category&min&max&sort&page` | – | sort: `newest` `price_asc` `price_desc` |
| GET | `/products/:id` | optional | มี `owned_since`, `in_cart`, `related` |
| GET · POST · DELETE | `/cart` · `/cart/:productId` | user | POST `{productId}` หรือ `{productIds:[]}` |
| POST | `/checkout` | user | `{productIds?}` (ไม่ส่ง = ทั้งตะกร้า) → `{orderNo,clientSecret}` |
| GET | `/orders?status&year` · `/orders/:orderNo` | user | year เป็น พ.ศ. |
| GET | `/library` | user | เฉพาะ order ที่ PAID |
| POST | `/library/:itemId/download` | user | ใช้สิทธิ์ 1 ครั้ง (สูงสุด 5) → signed URL อายุ 5 นาที |
| GET | `/files/:itemId?exp&sig` | ลายเซ็น | ลิงก์ที่ได้จากข้อบน |
| POST | `/stripe/webhook` | Stripe | |
| GET | `/admin/stats?days&bucket` | admin | |
| GET · POST | `/admin/products` | admin | POST เป็น multipart: fields + `cover` (jpg/png) + `file` (zip/pdf/mp4) |
| PATCH | `/admin/products` | admin | bulk `{ids,status}` |
| GET · PUT · DELETE | `/admin/products/:id` | admin | ลบสินค้าที่มีคนซื้อแล้ว → 409 `{buyers}` |
| GET | `/admin/orders?q&status&from&to&page` · `/admin/orders/:orderNo` | admin | |
| POST | `/admin/orders/:orderNo/refund` | admin | เฉพาะ PAID → REFUNDED (ตัดสิทธิ์ดาวน์โหลด) |

## แอปมือถือ (App Inventor)

- เก็บ token จาก `/auth/login` แล้วส่ง header `Authorization: Bearer …` ทุก request
- WebViewer ดาวน์โหลดไฟล์เองไม่ได้: หน้าเว็บเรียก `window.AppInventor.setWebViewString(url)`
  → ในแอปเพิ่ม block `WebViewer.WebViewStringChange` → `ActivityStarter` (Action `android.intent.action.VIEW`, DataUri = ค่าที่ได้) เพื่อเปิดใน Chrome

## ยังไม่ได้ทำ

ลืมรหัสผ่าน · Google OAuth · โค้ดส่วนลด · ส่งออก CSV · ส่งใบเสร็จซ้ำ / ใบเสร็จ PDF · แกลเลอรีภาพตัวอย่าง · ตัวเล่นคอร์ส · rich text editor (ตอนนี้ใช้ textarea + Markdown)
