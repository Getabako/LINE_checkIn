-- gym-checkin: Firestore -> Neon PostgreSQL 移行スキーマ
-- ドキュメントIDは Firestore の 20文字ランダムIDをそのまま引き継ぐため text 主キー。
-- 既知フィールドは型付きカラム、未知フィールドは extra(jsonb) に退避する。

CREATE TABLE IF NOT EXISTS users (
  id                    text PRIMARY KEY,
  display_name          text,
  name                  text,
  kana                  text,
  phone                 text,
  mobile                text,
  email                 text,
  postal_code           text,
  address               text,
  gender                text,
  birthday              text,
  occupation            text,
  customer_number       text,
  customer_type         text,
  labora_registered_at  text,
  is_imported           boolean,
  import_source         text,
  line_user_id          text,
  picture_url           text,
  created_at            timestamptz,
  updated_at            timestamptz,
  extra                 jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS users_line_user_id_idx ON users (line_user_id);
CREATE INDEX IF NOT EXISTS users_customer_number_idx ON users (customer_number);
CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone);
CREATE INDEX IF NOT EXISTS users_mobile_idx ON users (mobile);

CREATE TABLE IF NOT EXISTS checkins (
  id                     text PRIMARY KEY,
  user_id                text,
  location               text,
  facility_type          text,
  date                   text,
  start_time             text,
  duration               numeric,
  total_price            numeric,
  original_price         numeric,
  member_discount        numeric,
  member_type_name       text,
  coupon_code            text,
  coupon_id              text,
  coupon_discount        numeric,
  payment_id             text,
  session_id             text,
  payment_method         text,
  is_invoice_payment     boolean,
  skip_remote_lock       boolean,
  remote_lock_failed     boolean,
  pin_code               text,
  status                 text,
  group_id               text,
  recurring_type         text,
  event_id               text,
  has_review             boolean,
  notified               boolean,
  created_by_admin       boolean,
  display_name           text,
  is_test_import         boolean,
  import_source          text,
  labora_reservation_no  text,
  labora_payment_method  text,
  labora_actual_amount   numeric,
  created_at             timestamptz,
  updated_at             timestamptz,
  extra                  jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS checkins_user_id_idx ON checkins (user_id);
CREATE INDEX IF NOT EXISTS checkins_date_idx ON checkins (date);
CREATE INDEX IF NOT EXISTS checkins_group_id_idx ON checkins (group_id);
CREATE INDEX IF NOT EXISTS checkins_event_id_idx ON checkins (event_id);

CREATE TABLE IF NOT EXISTS coupons (
  id              text PRIMARY KEY,
  code            text,
  description     text,
  discount_type   text,
  discount_value  numeric,
  location_filter text,
  valid_from      text,
  valid_until     text,
  max_uses        integer,
  used_count      integer DEFAULT 0,
  is_active       boolean,
  created_at      timestamptz,
  updated_at      timestamptz,
  extra           jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS coupons_code_idx ON coupons (code);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id          text PRIMARY KEY,
  coupon_id   text,
  user_id     text,
  checkin_id  text,
  discount    numeric,
  created_at  timestamptz,
  extra       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_id_idx ON coupon_redemptions (coupon_id);

CREATE TABLE IF NOT EXISTS member_types (
  id                      text PRIMARY KEY,
  code                    text,
  name                    text,
  description             text,
  discount_type           text,
  discount_value          numeric,
  gym_discount_type       text,
  gym_discount_value      numeric,
  training_discount_type  text,
  training_discount_value numeric,
  monthly_fee             numeric,
  monthly_covers_training boolean,
  sort_order              integer,
  is_active               boolean,
  created_at              timestamptz,
  updated_at              timestamptz,
  extra                   jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS user_memberships (
  id             text PRIMARY KEY,
  user_id        text,
  line_user_id   text,
  display_name   text,
  member_type_id text,
  start_date     text,
  end_date       text,
  is_active      boolean,
  withdrawn_at   timestamptz,
  created_at     timestamptz,
  updated_at     timestamptz,
  extra          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS user_memberships_user_id_idx ON user_memberships (user_id);
CREATE INDEX IF NOT EXISTS user_memberships_line_user_id_idx ON user_memberships (line_user_id);

CREATE TABLE IF NOT EXISTS membership_applications (
  id             text PRIMARY KEY,
  user_id        text,
  line_user_id   text,
  display_name   text,
  member_type_id text,
  reason         text,
  status         text,
  reviewed_at    timestamptz,
  reviewed_by    text,
  created_at     timestamptz,
  extra          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS membership_applications_status_idx ON membership_applications (status);

CREATE TABLE IF NOT EXISTS reviews (
  id           text PRIMARY KEY,
  checkin_id   text,
  line_user_id text,
  display_name text,
  rating       integer,
  comment      text,
  created_at   timestamptz,
  extra        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS reviews_checkin_id_idx ON reviews (checkin_id);
CREATE INDEX IF NOT EXISTS reviews_line_user_id_idx ON reviews (line_user_id);

CREATE TABLE IF NOT EXISTS events (
  id            text PRIMARY KEY,
  title         text,
  description   text,
  location      text,
  facility_type text,
  date          text,
  start_time    text,
  end_time      text,
  capacity      integer,
  current_count integer DEFAULT 0,
  price         numeric,
  instructor    text,
  image_url     text,
  is_active     boolean,
  created_at    timestamptz,
  updated_at    timestamptz,
  extra         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS events_date_idx ON events (date);

CREATE TABLE IF NOT EXISTS event_registrations (
  id           text PRIMARY KEY,
  event_id     text,
  user_id      text,
  line_user_id text,
  display_name text,
  status       text,
  paid_amount  numeric,
  created_at   timestamptz,
  extra        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS event_registrations_event_id_idx ON event_registrations (event_id);

CREATE TABLE IF NOT EXISTS schools (
  id                text PRIMARY KEY,
  title             text,
  description       text,
  location          text,
  facility_type     text,
  day_of_week       text,
  start_time        text,
  end_time          text,
  start_date        text,
  end_date          text,
  total_sessions    integer,
  capacity          integer,
  current_count     integer DEFAULT 0,
  price_per_session numeric,
  instructor        text,
  is_active         boolean,
  created_at        timestamptz,
  updated_at        timestamptz,
  extra             jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS school_registrations (
  id           text PRIMARY KEY,
  school_id    text,
  user_id      text,
  line_user_id text,
  display_name text,
  status       text,
  paid_amount  numeric,
  created_at   timestamptz,
  extra        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS school_registrations_school_id_idx ON school_registrations (school_id);

CREATE TABLE IF NOT EXISTS announcements (
  id         text PRIMARY KEY,
  title      text,
  body       text,
  location   text,
  priority   text,
  start_date text,
  end_date   text,
  is_active  boolean,
  created_at timestamptz,
  updated_at timestamptz,
  extra      jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 通知テンプレート / 施設プロフィール / 料金テーブル などスキーマレス設定
CREATE TABLE IF NOT EXISTS settings (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
