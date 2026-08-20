-- GIFT City Times — Claude connector (ISOLATED).
-- All tables are new and prefixed `connector_` / `oauth_`. Nothing here touches
-- the existing site tables. Safe to drop as a unit to fully remove the feature.

-- Per-user connector account, linked to the newsletter email identity.
create table if not exists connector_accounts (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,                       -- verified newsletter identity
  created_at    timestamptz default now(),
  streak        int  default 0,
  best_streak   int  default 0,
  points        int  default 0,
  last_brief_on date,                               -- for streak accounting
  interests     jsonb default '[]'::jsonb           -- desk/category focus for personalisation
);

-- One quiz per account per day.
create table if not exists connector_quiz (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references connector_accounts(id) on delete cascade,
  quiz_on       date not null,
  question      text,
  answer        text,
  options       jsonb,
  answered      boolean default false,
  was_correct   boolean,
  created_at    timestamptz default now(),
  unique (account_id, quiz_on)
);

-- OAuth 2.1: dynamically-registered clients (RFC 7591).
create table if not exists oauth_clients (
  client_id     text primary key,
  client_secret text,
  redirect_uris jsonb,
  client_name   text,
  created_at    timestamptz default now()
);

-- Short-lived authorization codes (PKCE).
create table if not exists oauth_codes (
  code           text primary key,
  client_id      text,
  account_id     uuid references connector_accounts(id) on delete cascade,
  redirect_uri   text,
  code_challenge text,
  scope          text,
  expires_at     timestamptz,
  created_at     timestamptz default now()
);

-- Refresh tokens (access tokens are stateless signed JWTs).
create table if not exists oauth_refresh (
  token       text primary key,
  account_id  uuid references connector_accounts(id) on delete cascade,
  client_id   text,
  created_at  timestamptz default now()
);

-- Pending magic-link logins that carry the OAuth request through email verification.
create table if not exists connector_login (
  token          text primary key,
  email          text,
  client_id      text,
  redirect_uri   text,
  code_challenge text,
  state          text,
  scope          text,
  expires_at     timestamptz,
  created_at     timestamptz default now()
);

-- All private: RLS on, no anon policies (service_role bypasses).
alter table connector_accounts enable row level security;
alter table connector_quiz     enable row level security;
alter table oauth_clients       enable row level security;
alter table oauth_codes         enable row level security;
alter table oauth_refresh       enable row level security;
alter table connector_login     enable row level security;
