-- ============================================================
-- キャラページ工房 ― リンク集（LINKS）の保存先を足すSQL
-- supabase_fix_editkey_leak.sql を実行したあとに、1回だけ実行してください。
-- Supabase の画面で「SQL Editor」を開いて、この内容を全部貼って
-- 「Run」を押すだけでOKです。貼り直しても大丈夫な作りになっています。
--
-- やること：
-- ・pages に links（リンク集）という列を足す。中身は
--   「表示名とURLの組」の並びで、空の場合は [] になります
-- ・公開ページを読む時に links も読めるようにする
--   （edit_key は今まで通り読めません）
-- ・ページを作る／直す関数を、links も一緒に保存できる形に差し替える
--   （合言葉チェックの仕組みは今までと全く同じです）
-- ============================================================

-- 1) 列を足す（すでにある場合は何も起きません）
alter table public.pages add column if not exists links jsonb not null default '[]'::jsonb;

-- 2) 公開ページを読む時に links 列も読めるようにする
-- （読める列を1列ずつ許可しているので、新しい列にも許可が要ります）
grant select (links) on public.pages to anon, authenticated;

-- ============================================================
-- 3) 合言葉チェック付きの関数（RPC）を links 対応に差し替える
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
    characters, links, is_public, edit_key
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
    coalesce(payload->'links', '[]'::jsonb),
    coalesce((payload->>'is_public')::boolean, true),
    v_key
  );
  return jsonb_build_object('id', v_id, 'edit_key', v_key);
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
    links       = coalesce(payload->'links', links),
    is_public   = coalesce((payload->>'is_public')::boolean, is_public)
  where id = p_id
    and edit_key is not null
    and edit_key = p_key;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- 4) 関数を、ログインしていない人も含め全員が使えるようにする
grant execute on function public.create_page(jsonb) to anon, authenticated;
grant execute on function public.update_page(uuid, text, jsonb) to anon, authenticated;
