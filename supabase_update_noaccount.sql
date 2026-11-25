-- ============================================================
-- キャラページ工房 ― アカウントなし版への更新SQL
-- supabase_setup.sql を実行したあとに、1回だけ実行してください。
-- Supabase の画面で「SQL Editor」を開いて、この内容を全部貼って
-- 「Run」を押すだけでOKです。貼り直しても大丈夫な作りになっています。
--
-- やること：
-- ・pages に edit_key（編集用の合言葉）の列を足す
-- ・owner を空でもOKにする（アカウントを使わないため）
-- ・古い「ログインした人だけ」ポリシーを消し、
--   見る人は「公開中のページだけ読める」に変える
-- ・書き込みは合言葉チェック付きの関数（RPC）経由だけにし、
--   テーブルへの直接の書き込みはできなくする
-- ============================================================

-- 1) 列の変更
alter table public.pages add column if not exists edit_key text;
alter table public.pages alter column owner drop not null;

-- 2) 行レベルの安全設定（RLS）はオンのまま
alter table public.pages enable row level security;

-- 3) 古いポリシーを全部消す
drop policy if exists "public can read public pages" on public.pages;
drop policy if exists "users can read own pages" on public.pages;
drop policy if exists "users can insert own pages" on public.pages;
drop policy if exists "users can update own pages" on public.pages;
drop policy if exists "users can delete own pages" on public.pages;

-- 4) 見るだけのポリシー：誰でも、公開中のページだけ読める
create policy "public can read public pages"
  on public.pages for select
  using (is_public = true);

-- 5) テーブルへの直接の書き込みを禁止する（関数の経由だけにする）
revoke insert, update, delete on public.pages from anon, authenticated;
grant select on public.pages to anon, authenticated;

-- ============================================================
-- 6) 合言葉チェック付きの関数（RPC）
-- ============================================================

-- ページを作る：id と edit_key を自動で作って返す
drop function if exists public.create_page(jsonb);
create or replace function public.create_page(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_key text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.pages (
    id, owner, title, author_name, intro, template, ui_template,
    open_fx, back_fx, theme_color, bg_image, world_text, about_text,
    characters, is_public, edit_key
  ) values (
    v_id,
    null,
    coalesce(payload->>'title', ''),
    coalesce(payload->>'author_name', ''),
    coalesce(payload->>'intro', ''),
    coalesce(payload->>'template', 'afterimage'),
    coalesce(payload->>'ui_template', 'record'),
    coalesce(payload->>'open_fx', 'glitch'),
    coalesce(payload->>'back_fx', 'closed'),
    coalesce(payload->>'theme_color', '#c8102e'),
    payload->>'bg_image',
    coalesce(payload->>'world_text', ''),
    coalesce(payload->>'about_text', ''),
    coalesce(payload->'characters', '[]'::jsonb),
    coalesce((payload->>'is_public')::boolean, true),
    v_key
  );
  return jsonb_build_object('id', v_id, 'edit_key', v_key);
end;
$$;

-- 編集用にページを読む：合言葉が合った時だけ、行を全部返す
drop function if exists public.get_page_for_edit(uuid, text);
create or replace function public.get_page_for_edit(p_id uuid, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  select to_jsonb(p) into v_row
  from public.pages p
  where p.id = p_id
    and p.edit_key is not null
    and p.edit_key = p_key;
  return v_row;
end;
$$;

-- ページを直す：合言葉が合った時だけ更新する。成功したら true
drop function if exists public.update_page(uuid, text, jsonb);
create or replace function public.update_page(p_id uuid, p_key text, payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.pages set
    title       = coalesce(payload->>'title', title),
    author_name = coalesce(payload->>'author_name', author_name),
    intro       = coalesce(payload->>'intro', intro),
    template    = coalesce(payload->>'template', template),
    ui_template = coalesce(payload->>'ui_template', ui_template),
    open_fx     = coalesce(payload->>'open_fx', open_fx),
    back_fx     = coalesce(payload->>'back_fx', back_fx),
    theme_color = coalesce(payload->>'theme_color', theme_color),
    bg_image    = case when payload ? 'bg_image' then payload->>'bg_image' else bg_image end,
    world_text  = coalesce(payload->>'world_text', world_text),
    about_text  = coalesce(payload->>'about_text', about_text),
    characters  = coalesce(payload->'characters', characters),
    is_public   = coalesce((payload->>'is_public')::boolean, is_public)
  where id = p_id
    and edit_key is not null
    and edit_key = p_key;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- ページを消す：合言葉が合った時だけ消す。成功したら true
drop function if exists public.delete_page(uuid, text);
create or replace function public.delete_page(p_id uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.pages
  where id = p_id
    and edit_key is not null
    and edit_key = p_key;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- 7) 関数を、ログインしていない人も含め全員が使えるようにする
grant execute on function public.create_page(jsonb) to anon, authenticated;
grant execute on function public.get_page_for_edit(uuid, text) to anon, authenticated;
grant execute on function public.update_page(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.delete_page(uuid, text) to anon, authenticated;
