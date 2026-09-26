-- Runs once on first `docker compose up` (mounted into /docker-entrypoint-initdb.d).

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')), -- [14] admins set here only
  failed_logins int NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint REFERENCES users,
  action     text NOT NULL,
  detail     text,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  category    text NOT NULL CHECK (category IN ('ebook', 'template', 'source-code', 'online-course', 'design-assets')),
  price       numeric(10,2) NOT NULL CHECK (price > 0),
  compare_at  numeric(10,2),           -- strikethrough price on [4]
  description text NOT NULL DEFAULT '', -- markdown, max 2000 (checked in app)
  cover       text,                    -- filename in UPLOAD_DIR/covers (public)
  file        text,                    -- filename in UPLOAD_DIR/files (private)
  file_name   text,
  file_size   bigint,
  file_types  text,                    -- display string e.g. 'XLSX · PDF'
  version     text,
  status      text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'DRAFT' OR (cover IS NOT NULL AND file IS NOT NULL))
);

CREATE TABLE cart_items (
  user_id    bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  product_id bigint NOT NULL REFERENCES products ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id) -- no qty: 1 per product
);

CREATE SEQUENCE order_seq;
CREATE TABLE orders (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_no       text NOT NULL UNIQUE DEFAULT
                   'ORD-' || (extract(year FROM now())::int + 543) || '-' || lpad(nextval('order_seq')::text, 5, '0'),
  user_id        bigint NOT NULL REFERENCES users,
  status         text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  total          numeric(10,2) NOT NULL,
  payment_intent text UNIQUE,
  failure_code   text,
  paid_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   bigint NOT NULL REFERENCES orders ON DELETE CASCADE,
  product_id bigint NOT NULL REFERENCES products, -- RESTRICT: purchased products can't be deleted
  price      numeric(10,2) NOT NULL,
  downloads  int NOT NULL DEFAULT 0
);

CREATE INDEX ON orders (user_id);
CREATE INDEX ON order_items (order_id);
CREATE INDEX ON order_items (product_id);
