-- ============================================================
-- キャラページ工房 ― Supabase セットアップ用SQL
-- Supabase の画面で「SQL Editor」を開いて、この内容を全部貼って
-- 「Run」を押すだけでOKです。手順は SETUP.md を見てください。
-- ============================================================

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  author_name text not null default '',
  intro text not null default '',
  template text not null default 'afterimage',
  ui_template text not null default 'record',
  open_fx text not null default 'glitch',
  back_fx text not null default 'closed',
  theme_color text not null default '#c8102e',
  bg_image text,
  world_text text not null default '',
  about_text text not null default '',
  characters jsonb not null default '[]'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 更新日時を自動で更新する
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pages_touch_updated_at on public.pages;
create trigger pages_touch_updated_at
  before update on public.pages
  for each row execute function public.touch_updated_at();

-- 行レベルの安全設定（RLS）をオンにする
alter table public.pages enable row level security;

-- ポリシー（貼り直しても大丈夫なように、先に消してから作ります）
drop policy if exists "public can read public pages" on public.pages;
drop policy if exists "users can read own pages" on public.pages;
drop policy if exists "users can insert own pages" on public.pages;
drop policy if exists "users can update own pages" on public.pages;
drop policy if exists "users can delete own pages" on public.pages;

-- 誰でも、公開中のページを読める
create policy "public can read public pages"
  on public.pages for select
  using (is_public = true);

-- ログインした人は、自分のページ（非公開も含む）を読める
create policy "users can read own pages"
  on public.pages for select
  using (auth.uid() = owner);

-- 自分のページだけ作れる
create policy "users can insert own pages"
  on public.pages for insert
  with check (auth.uid() = owner);

-- 自分のページだけ直せる
create policy "users can update own pages"
  on public.pages for update
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- 自分のページだけ消せる
create policy "users can delete own pages"
  on public.pages for delete
  using (auth.uid() = owner);
