-- YOUSIVAR–Ω · independent PostgreSQL schema (Neon)
--
-- Derived field-by-field from base44/entities/*.jsonc before any Base44 code was
-- touched. Every entity keeps its columns, types, defaults and validation rules;
-- ownership rules from each entity's `rls` block become `user_id` foreign keys
-- enforced by backend/src/middleware/authz.js.
--
-- Conventions
--   * ownership column is `user_id` (was `created_by_id` in Base44)
--   * `created_date`/`updated_date` become `created_at`/`updated_at`
--   * enums are CHECK constraints so the API and the database agree
--   * no Cloudflare database product is used: this file targets Neon Postgres

begin;

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email

-- ----------------------------------------------------------------- users
create table if not exists users (
  id                uuid primary key default gen_random_uuid(),
  email             citext not null unique,
  full_name         text,
  role              text not null default 'user' check (role in ('admin', 'user')),
  password_hash     text,
  email_verified_at timestamptz,
  disabled          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- --------------------------------------------------------------- sessions
-- `id` is the SHA-256 of the cookie token: a database leak never yields a
-- usable session cookie.
create table if not exists sessions (
  id           text primary key,
  user_id      uuid not null references users(id) on delete cascade,
  expires_at   timestamptz not null,
  user_agent   text,
  ip           text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

-- ----------------------------------------------------- single-use tokens
-- Password reset and email verification. Stored hashed, single use, expiring.
create table if not exists auth_tokens (
  id         text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null check (kind in ('password_reset', 'email_verify')),
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists auth_tokens_user_idx on auth_tokens (user_id, kind);

-- ---------------------------------------------------------- conversations
create table if not exists conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  title           text not null,
  model           text,
  archived        boolean not null default false,
  pinned          boolean not null default false,
  message_count   integer not null default 0,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists conversations_user_idx on conversations (user_id, last_message_at desc nulls last);
create index if not exists conversations_archived_idx on conversations (user_id, archived);

-- --------------------------------------------------------------- messages
create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  model           text,
  latency_ms      integer,
  attachments     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages (conversation_id, created_at);
create index if not exists messages_user_idx on messages (user_id);

-- -------------------------------------------------------------- documents
-- Only metadata lives here. Bytes live in object storage (R2 / S3), keyed by
-- storage_key; the API never exposes that key to the browser.
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  name        text not null,
  storage_key text not null,
  mime_type   text,
  size_bytes  bigint,
  status      text not null default 'ready' check (status in ('ready', 'processing', 'failed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists documents_user_idx on documents (user_id, created_at desc);

-- --------------------------------------------------------------- memories
create table if not exists memories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  content    text not null,
  type       text not null default 'fact' check (type in ('preference', 'fact', 'project', 'instruction')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_user_idx on memories (user_id, active);

-- ------------------------------------------------------- model registry
-- Workspace-wide catalogue (read for every signed-in user, written by admins).
create table if not exists ai_models (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null unique,
  label              text not null,
  provider           text,
  description        text,
  context_window     integer,
  supports_vision    boolean not null default false,
  supports_web_search boolean not null default false,
  supports_documents boolean not null default false,
  enabled            boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists ai_models_enabled_idx on ai_models (enabled, sort_order);

-- ----------------------------------------------------- provider accounts
-- Credentials are sealed with AES-256-GCM (APP_ENCRYPTION_KEY) before insert and
-- are never selected by any read route.
create table if not exists provider_accounts (
  id               uuid primary key default gen_random_uuid(),
  service          text not null,
  label            text,
  enabled          boolean not null default true,
  priority         integer not null default 100,
  base_url         text,
  secret_cipher    text,
  key_hint         text,
  status           text not null default 'not_configured'
                     check (status in ('connected', 'invalid', 'not_configured', 'error')),
  status_detail    text,
  checked_at       timestamptz,
  default_model    text,
  models_cache     text[] not null default '{}',
  models_synced_at timestamptz,
  features         text[] not null default '{}',
  temperature      numeric(3, 2),
  max_tokens       integer,
  usage_requests   integer not null default 0,
  usage_errors     integer not null default 0,
  usage_tokens     bigint not null default 0,
  last_latency_ms  integer,
  last_used        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists provider_accounts_service_idx on provider_accounts (service);

-- -------------------------------------------------------------- api keys
-- Developer keys: SHA-256 of the key, never the key itself.
create table if not exists api_keys (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  prefix     text not null,
  hash       text not null unique,
  revoked    boolean not null default false,
  last_used  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists api_keys_user_idx on api_keys (user_id);

-- ------------------------------------------------------------ audit log
create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete set null,
  action      text not null,
  actor_email text,
  model       text,
  latency_ms  integer,
  chars       integer,
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_action_idx on audit_logs (action, created_at desc);
create index if not exists audit_logs_user_idx on audit_logs (user_id, created_at desc);

-- ----------------------------------------------------------- rate limits
-- Fixed-window counters, shared by every worker instance. Replaces the old
-- audit-log scan so abuse control is O(1) instead of O(rows).
create table if not exists rate_limits (
  bucket       text not null,
  subject      text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, subject, window_start)
);

-- ----------------------------------------------------------- maintenance
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array[
    'users', 'conversations', 'messages', 'documents', 'memories',
    'ai_models', 'provider_accounts', 'api_keys'
  ] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t, t
    );
  end loop;
end $$;

commit;