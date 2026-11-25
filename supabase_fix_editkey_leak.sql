-- ============================================================
-- キャラページ工房 ― edit_key 漏れ防止の修正SQL
-- supabase_update_noaccount.sql を実行したあとに、1回だけ実行してください。
--
-- 問題：公開ページを読むための権限が列単位ではなく表全体に付いていたため、
-- 送り方を工夫すると edit_key（編集用の合言葉）まで読めてしまう状態でした。
-- 修正：読める列を edit_key 以外に限定します。
-- 編集用の読み書きは合言葉チェック付きの関数（RPC）経由なので影響ありません。
-- ============================================================

revoke select on public.pages from anon, authenticated;

grant select (
  id, owner, title, author_name, intro, template, ui_template,
  open_fx, back_fx, theme_color, bg_image, world_text, about_text,
  characters, is_public, created_at, updated_at
) on public.pages to anon, authenticated;
