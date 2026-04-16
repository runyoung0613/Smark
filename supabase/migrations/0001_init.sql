-- Smark cloud schema (Supabase Postgres)
-- Execute in Supabase SQL editor (or via migrations).

-- 1) Articles
create table if not exists public.articles (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at timestamptz,
  device_id text,
  origin text
);

create index if not exists articles_user_updated_idx on public.articles (user_id, updated_at desc);
create index if not exists articles_user_deleted_idx on public.articles (user_id, deleted_at);

-- 2) Highlights
create table if not exists public.highlights (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  start integer not null,
  "end" integer not null,
  quote text not null,
  note text,
  in_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at timestamptz,
  device_id text,
  origin text
);

create index if not exists highlights_user_article_idx on public.highlights (user_id, article_id);
create index if not exists highlights_user_updated_idx on public.highlights (user_id, updated_at desc);
create index if not exists highlights_user_deleted_idx on public.highlights (user_id, deleted_at);

-- 3) Quick cards
create table if not exists public.quick_cards (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null,
  back text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at timestamptz,
  device_id text,
  origin text
);

create index if not exists quick_cards_user_updated_idx on public.quick_cards (user_id, updated_at desc);
create index if not exists quick_cards_user_deleted_idx on public.quick_cards (user_id, deleted_at);

-- 4) Optional: perses_settings (non-sensitive settings only)
create table if not exists public.perses_settings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz,
  deleted_at timestamptz
);

create index if not exists perses_settings_user_updated_idx on public.perses_settings (user_id, updated_at desc);

