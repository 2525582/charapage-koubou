// ============================================================
// キャラページ工房 ― メインアプリ
// アカウント登録はありません。公開すると「編集用リンク」が発行され、
// そのリンクがあれば後から直せます（同じ端末では自動で覚えています）。
// config.js が空なら DEMO モード（localStorage）、
// Supabase の URL と anon key が入っていれば本番モードで動きます。
// 本番モードでは、保存は合言葉チェック付きの関数（RPC）経由だけです。
// ============================================================
(function () {
  "use strict";
  var CFG = window.CHARAPAGE_CONFIG || {};
  var DEMO = !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  var sb = null;
  if (!DEMO && window.supabase) {
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }
  var esc = window.KoubouViewer.esc;

  // 公開ページを読む時に使う列（edit_key は絶対に含めない）
  var PUBLIC_COLS = "id,title,author_name,intro,template,ui_template,open_fx,back_fx,theme_color,bg_image,world_text,about_text,characters,is_public,created_at,updated_at";

  // ---------------- 状態 ----------------
  var state = {
    editingId: null,       // 編集中のページid（null=新規）
    editingKey: null,      // 編集中ページの編集用キー
    draft: null,           // 編集中データ
    activeChar: 0
  };

  function newChar(n) {
    return {
      id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: "", reading: "", en_name: "", record_no: "RECORD " + ("00" + n).slice(-3),
      image: "", gallery: [], color: "#c8102e", catchphrase: "", quotes: "",
      age: "", gender: "", height: "", personality: "", setting: "",
      likes: "", dislikes: "", danger: "", relations: "",
      custom_fields: [], hidden_fields: []
    };
  }
  function newDraft() {
    return {
      title: "", author_name: "", intro: "", theme_color: "#c8102e",
      bg_image: "", world_text: "", about_text: "",
      template: "afterimage", ui_template: "record",
      open_fx: "glitch", back_fx: "closed", is_public: true,
      characters: [newChar(1)]
    };
  }
  function genHex(n) {
    var s = "";
    while (s.length < n) s += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
    return s.slice(0, n);
  }

  // ---------------- 保存レイヤー ----------------
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  };

  // この端末で作ったページの記録 { id, edit_key, title }
  function getMyPages() { return LS.get("cpk_my_pages", []); }
  function upsertMyPage(id, key, title) {
    var list = getMyPages().filter(function (e) { return e.id !== id; });
    list.unshift({ id: id, edit_key: key, title: title || "" });
    LS.set("cpk_my_pages", list);
  }
  function removeMyPage(id) {
    LS.set("cpk_my_pages", getMyPages().filter(function (e) { return e.id !== id; }));
  }

  function toPayload(p) {
    return {
      title: p.title, author_name: p.author_name, intro: p.intro,
      template: p.template, ui_template: p.ui_template, open_fx: p.open_fx, back_fx: p.back_fx,
      theme_color: p.theme_color, bg_image: p.bg_image || null,
      world_text: p.world_text, about_text: p.about_text,
      characters: p.characters, is_public: p.is_public
    };
  }
  function fromRow(r) {
    return {
      id: r.id, title: r.title, author_name: r.author_name, intro: r.intro,
      template: r.template, ui_template: r.ui_template, open_fx: r.open_fx, back_fx: r.back_fx,
      theme_color: r.theme_color, bg_image: r.bg_image || "", world_text: r.world_text,
      about_text: r.about_text, characters: r.characters || [], is_public: r.is_public,
      created_at: r.created_at ? new Date(r.created_at).getTime() : 0,
      updated_at: r.updated_at ? new Date(r.updated_at).getTime() : 0
    };
  }

  var Store = {
    // --- 読む（公開ページ） ---
    listPublic: function () {
      if (DEMO) {
        return Promise.resolve(LS.get("cpk_pages", []).filter(function (p) { return p.is_public; })
          .sort(function (a, b) { return b.created_at - a.created_at; }).map(demoClone));
      }
      return sb.from("pages").select(PUBLIC_COLS).eq("is_public", true)
        .order("created_at", { ascending: false })
        .then(function (r) { if (r.error) throw r.error; return r.data.map(fromRow); });
    },
    getPage: function (id) {
      if (DEMO) {
        var p = LS.get("cpk_pages", []).filter(function (x) { return x.id === id; })[0];
        return Promise.resolve(p ? demoClone(p) : null);
      }
      return sb.from("pages").select(PUBLIC_COLS).eq("id", id).single()
        .then(function (r) { if (r.error) return null; return fromRow(r.data); });
    },
    // --- 作る：{ id, edit_key } が返る ---
    createPage: function (page) {
      if (DEMO) {
        var pages = LS.get("cpk_pages", []);
        var now = Date.now();
        var rec = JSON.parse(JSON.stringify(page));
        rec.id = "p" + now.toString(36) + genHex(6);
        rec.edit_key = genHex(32) + genHex(32);
        rec.created_at = now; rec.updated_at = now;
        pages.push(rec);
        LS.set("cpk_pages", pages);
        upsertMyPage(rec.id, rec.edit_key, rec.title);
        return Promise.resolve({ id: rec.id, edit_key: rec.edit_key });
      }
      return sb.rpc("create_page", { payload: toPayload(page) }).then(function (r) {
        if (r.error) throw r.error;
        var d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        if (!d || !d.id || !d.edit_key) throw new Error("公開に失敗しました");
        upsertMyPage(d.id, d.edit_key, page.title);
        return d;
      });
    },
    // --- 編集用に読む：キーが合った時だけ返る ---
    getForEdit: function (id, key) {
      if (DEMO) {
        var p = LS.get("cpk_pages", []).filter(function (x) { return x.id === id && x.edit_key === key; })[0];
        return Promise.resolve(p ? demoClone(p) : null);
      }
      return sb.rpc("get_page_for_edit", { p_id: id, p_key: key }).then(function (r) {
        if (r.error) throw r.error;
        if (!r.data) return null;
        var row = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        return fromRow(row);
      });
    },
    // --- 直す：キーが合えば true ---
    updatePage: function (id, key, page) {
      if (DEMO) {
        var pages = LS.get("cpk_pages", []);
        for (var i = 0; i < pages.length; i++) {
          if (pages[i].id === id && pages[i].edit_key === key) {
            var rec = JSON.parse(JSON.stringify(page));
            rec.id = id; rec.edit_key = key;
            rec.created_at = pages[i].created_at; rec.updated_at = Date.now();
            pages[i] = rec;
            LS.set("cpk_pages", pages);
            upsertMyPage(id, key, rec.title);
            return Promise.resolve(true);
          }
        }
        return Promise.resolve(false);
      }
      return sb.rpc("update_page", { p_id: id, p_key: key, payload: toPayload(page) }).then(function (r) {
        if (r.error) throw r.error;
        if (r.data === true) upsertMyPage(id, key, page.title);
        return r.data === true;
      });
    },
    // --- 消す：キーが合えば true ---
    deletePage: function (id, key) {
      if (DEMO) {
        var before = LS.get("cpk_pages", []);
        var after = before.filter(function (p) { return !(p.id === id && p.edit_key === key); });
        if (after.length === before.length) return Promise.resolve(false);
        LS.set("cpk_pages", after);
        removeMyPage(id);
        return Promise.resolve(true);
      }
      return sb.rpc("delete_page", { p_id: id, p_key: key }).then(function (r) {
        if (r.error) throw r.error;
        if (r.data === true) removeMyPage(id);
        return r.data === true;
      });
    }
  };
  function demoClone(p) {
    var c = JSON.parse(JSON.stringify(p));
    delete c.edit_key;
    return c;
  }

  // ---------------- 画像の縮小 ----------------
  function fileToDataURL(file, cb) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var max = 1200, w = img.width, h = img.height;
      var scale = Math.min(1, max / Math.max(w, h));
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      var canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      cb(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = function () { URL.revokeObjectURL(url); alert("画像を読み込めませんでした"); };
    img.src = url;
  }

  // ---------------- ルーティング ----------------
  var views = ["home", "editor", "mypage", "page", "preview"];
  function show(name) {
    views.forEach(function (v) {
      document.getElementById("view-" + v).hidden = v !== name;
    });
    window.scrollTo(0, 0);
  }
  function route() {
    var hash = location.hash || "#/";
    var mv = hash.match(/^#\/view\/(.+)$/);
    if (mv) { openViewer(decodeURIComponent(mv[1])); return; }
    var me = hash.match(/^#\/edit\/([^\/]+)\/(.+)$/);
    if (me) { openEditorWithKey(decodeURIComponent(me[1]), decodeURIComponent(me[2])); return; }
    if (hash.indexOf("#/editor") === 0) { openEditor(); return; }
    if (hash.indexOf("#/mypage") === 0) { openMyPage(); return; }
    show("home"); loadGallery();
  }
  function shareLink(id) {
    return location.origin + location.pathname + "#/view/" + id;
  }
  function editLink(id, key) {
    return location.origin + location.pathname + "#/edit/" + id + "/" + key;
  }
  function copyText(text, doneEl) {
    function done() { if (doneEl) { doneEl.hidden = false; setTimeout(function () { doneEl.hidden = true; }, 2000); } }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { prompt("リンクをコピーしてください", text); });
    } else { prompt("リンクをコピーしてください", text); }
  }
  function startNewPage() {
    state.editingId = null; state.editingKey = null;
    state.draft = newDraft(); state.activeChar = 0;
    hidePublishResult();
    if ((location.hash || "").indexOf("#/editor") === 0) { openEditor(); }
    else location.hash = "#/editor";
  }

  // ---------------- ホーム（一覧） ----------------
  function thumbOf(p) {
    for (var i = 0; i < (p.characters || []).length; i++) if (p.characters[i].image) return p.characters[i].image;
    return p.bg_image || "";
  }
  var TPL_LABELS = {
    afterimage: "AFTERIMAGE風", abyss: "ABYSS風", sacred: "セイクリッド風",
    neon: "ネオン風", wa: "和風"
  };
  function cardHTML(p) {
    var t = thumbOf(p);
    return '<a class="page-card" href="#/view/' + p.id + '">' +
      (t ? '<img src="' + t + '" alt="">' : '<span class="page-card-noimg">' + esc((p.title || "?").slice(0, 2)) + "</span>") +
      '<span class="page-card-title">' + esc(p.title || "UNTITLED") + "</span>" +
      '<span class="page-card-author">by ' + esc(p.author_name || "") + "</span>" +
      '<span class="page-card-meta">' + (TPL_LABELS[p.template] || "AFTERIMAGE風") + " ／ キャラ " + (p.characters || []).length + "人</span></a>";
  }
  var galleryCache = [];
  function loadGallery() {
    Store.listPublic().then(function (pages) {
      galleryCache = pages; renderGallery(document.getElementById("gallery-search").value || "");
    }).catch(function (e) { console.error(e); });
  }
  function renderGallery(q) {
    q = q.trim().toLowerCase();
    var list = galleryCache.filter(function (p) {
      return !q || (p.title || "").toLowerCase().indexOf(q) > -1 || (p.author_name || "").toLowerCase().indexOf(q) > -1;
    });
    document.getElementById("gallery-grid").innerHTML = list.map(cardHTML).join("");
    document.getElementById("gallery-empty").hidden = list.length > 0;
  }

  // ---------------- ビューア ----------------
  var currentViewId = null;
  function openViewer(id) {
    currentViewId = id;
    show("page");
    var root = document.getElementById("page-root");
    root.innerHTML = '<p class="note">読み込み中…</p>';
    Store.getPage(id).then(function (p) {
      if (!p) { root.innerHTML = '<p class="note">ページが見つかりませんでした。非公開か、削除された可能性があります。</p>'; return; }
      if (!p.is_public) { root.innerHTML = '<p class="note">このページは非公開です。</p>'; return; }
      window.KoubouViewer.renderPage(root, p);
    });
  }

  // ---------------- 自分のページ ----------------
  function openMyPage() {
    show("mypage");
    var entries = getMyPages();
    var box = document.getElementById("mypage-list");
    document.getElementById("mypage-empty").hidden = entries.length > 0;
    box.innerHTML = entries.length ? '<p class="note">読み込み中…</p>' : "";
    if (!entries.length) return;
    Promise.all(entries.map(function (e) {
      return Store.getForEdit(e.id, e.edit_key).then(function (p) {
        return { entry: e, page: p };
      }).catch(function () { return { entry: e, page: null }; });
    })).then(function (results) {
      box.innerHTML = "";
      results.forEach(function (res) {
        var e = res.entry, p = res.page;
        var wrap = document.createElement("div");
        wrap.className = "mypage-item";
        if (!p) {
          wrap.innerHTML = '<div class="page-card"><span class="page-card-title">' + esc(e.title || "（タイトル不明）") + "</span>" +
            '<span class="page-card-meta">見つかりませんでした。削除されたか、編集用リンクが違う可能性があります。</span></div>' +
            '<div class="mypage-actions"><button data-a="forget" class="btn btn-ghost btn-danger">この端末の記録を消す</button></div>';
          wrap.querySelector('[data-a="forget"]').addEventListener("click", function () {
            removeMyPage(e.id); openMyPage();
          });
          box.appendChild(wrap);
          return;
        }
        wrap.innerHTML = cardHTML(p) +
          '<div class="mypage-actions">' +
          '<span class="note">' + (p.is_public ? "公開中" : "非公開") + "</span>" +
          '<button data-a="edit" class="btn btn-ghost">編集</button>' +
          '<button data-a="toggle" class="btn btn-ghost">' + (p.is_public ? "非公開にする" : "公開する") + "</button>" +
          '<button data-a="copy" class="btn btn-ghost">公開リンクをコピー</button>' +
          '<button data-a="copyedit" class="btn btn-ghost">編集用リンクをコピー</button>' +
          '<button data-a="del" class="btn btn-ghost btn-danger">削除</button></div>';
        wrap.querySelector('[data-a="edit"]').addEventListener("click", function () {
          location.hash = "#/edit/" + p.id + "/" + e.edit_key;
          if ((location.hash || "") === "#/edit/" + p.id + "/" + e.edit_key) route();
        });
        wrap.querySelector('[data-a="toggle"]').addEventListener("click", function () {
          var np = JSON.parse(JSON.stringify(p));
          np.is_public = !p.is_public;
          Store.updatePage(p.id, e.edit_key, np).then(function (ok) {
            if (ok) openMyPage(); else alert("切り替えに失敗しました。編集用リンクが違う可能性があります。");
          });
        });
        wrap.querySelector('[data-a="copy"]').addEventListener("click", function () { copyText(shareLink(p.id), null); });
        wrap.querySelector('[data-a="copyedit"]').addEventListener("click", function () { copyText(editLink(p.id, e.edit_key), null); });
        wrap.querySelector('[data-a="del"]').addEventListener("click", function () {
          if (!confirm("このページを削除しますか？ 元に戻せません。")) return;
          Store.deletePage(p.id, e.edit_key).then(function (ok) {
            if (ok) openMyPage(); else alert("削除に失敗しました。編集用リンクが違う可能性があります。");
          });
        });
        box.appendChild(wrap);
      });
    });
  }

  // ---------------- 編集画面 ----------------
  function $(id) { return document.getElementById(id); }
  function bindDraft() {
    var d = state.draft;
    $("f-title").value = d.title; $("f-author").value = d.author_name;
    $("f-intro").value = d.intro; $("f-theme-color").value = d.theme_color || "#c8102e";
    $("f-world").value = d.world_text; $("f-about").value = d.about_text;
    $("f-template").value = d.template; $("f-ui-template").value = d.ui_template;
    $("f-open-fx").value = d.open_fx; $("f-back-fx").value = d.back_fx;
    $("f-is-public").checked = !!d.is_public;
    $("bg-preview").innerHTML = d.bg_image ? '<img src="' + d.bg_image + '" alt=""><button class="btn btn-ghost" id="bg-clear">背景画像を消す</button>' : "";
    var bc = $("bg-clear"); if (bc) bc.addEventListener("click", function () { d.bg_image = ""; bindDraft(); });
    renderCharTabs(); renderCharEditor();
  }
  function readSiteFields() {
    var d = state.draft; if (!d) return;
    d.title = $("f-title").value; d.author_name = $("f-author").value;
    d.intro = $("f-intro").value; d.theme_color = $("f-theme-color").value;
    d.world_text = $("f-world").value; d.about_text = $("f-about").value;
    d.template = $("f-template").value; d.ui_template = $("f-ui-template").value;
    d.open_fx = $("f-open-fx").value; d.back_fx = $("f-back-fx").value;
    d.is_public = $("f-is-public").checked;
  }
  function openEditor() {
    if (!state.draft) { state.draft = newDraft(); state.editingId = null; state.editingKey = null; }
    show("editor"); bindDraft();
    $("editor-status").textContent = state.editingId
      ? "保存済みのページを編集中です。直したら「公開する」か「下書き保存」を押してください。"
      : "新しいページを作っています。登録はいりません。";
  }
  function openEditorWithKey(id, key) {
    if (state.editingId === id && state.editingKey === key && state.draft) { openEditor(); return; }
    show("editor");
    state.draft = null; state.editingId = null; state.editingKey = null;
    hidePublishResult();
    $("editor-status").textContent = "読み込み中…";
    $("char-tabs").innerHTML = ""; $("char-editor").innerHTML = "";
    Store.getForEdit(id, key).then(function (p) {
      if (!p) {
        $("editor-status").textContent = "この編集用リンクでは開けませんでした。リンクが違うか、ページが削除された可能性があります。";
        return;
      }
      state.editingId = p.id; state.editingKey = key;
      state.draft = p; state.activeChar = 0;
      upsertMyPage(p.id, key, p.title);
      bindDraft();
      $("editor-status").textContent = "保存済みのページを編集中です。直したら「公開する」か「下書き保存」を押してください。";
    }).catch(function (e) {
      $("editor-status").textContent = "読み込みに失敗しました：" + (e.message || e);
    });
  }

  function renderCharTabs() {
    var d = state.draft;
    var box = $("char-tabs"); box.innerHTML = "";
    d.characters.forEach(function (ch, i) {
      var b = document.createElement("button");
      b.className = "char-tab" + (i === state.activeChar ? " active" : "");
      b.textContent = (i + 1) + ". " + (ch.name || "無名");
      b.addEventListener("click", function () { readCharForm(); state.activeChar = i; renderCharTabs(); renderCharEditor(); });
      box.appendChild(b);
    });
  }

  var STD_FIELDS = [
    ["age", "年齢"], ["gender", "性別"], ["height", "身長"],
    ["personality", "性格"], ["setting", "設定文"], ["likes", "好きなもの"],
    ["dislikes", "苦手なもの"], ["danger", "危険度・クラス"], ["relations", "相関"], ["quotes", "セリフ集"]
  ];
  function renderCharEditor() {
    var d = state.draft;
    var ch = d.characters[state.activeChar];
    if (!ch) { $("char-editor").innerHTML = ""; return; }
    var hidden = ch.hidden_fields || [];
    var h = "";
    h += '<div class="char-head">' +
      '<button class="btn btn-ghost" id="ch-up">↑ 上へ</button>' +
      '<button class="btn btn-ghost" id="ch-down">↓ 下へ</button>' +
      '<button class="btn btn-ghost btn-danger" id="ch-del">このキャラを削除</button></div>';
    h += '<label>名前 <input id="c-name" type="text" value="' + esc(ch.name) + '"></label>';
    h += '<label>読み <input id="c-reading" type="text" value="' + esc(ch.reading) + '"></label>';
    h += '<label>英名 <input id="c-en" type="text" value="' + esc(ch.en_name) + '"></label>';
    h += '<label>番号 <input id="c-record" type="text" value="' + esc(ch.record_no) + '"></label>';
    h += '<label>イメカラー <input id="c-color" type="color" value="' + esc(ch.color || "#c8102e") + '"></label>';
    h += '<label>メイン画像 <input id="c-image" type="file" accept="image/*"></label>';
    h += '<div class="thumb-row">' + (ch.image ? '<img src="' + ch.image + '" alt="">' : "") + "</div>";
    h += '<label>ギャラリー画像（追加分） <input id="c-gallery" type="file" accept="image/*" multiple></label>';
    h += '<div class="thumb-row" id="c-gallery-thumbs">' + (ch.gallery || []).map(function (g, gi) {
      return '<span class="thumb-item"><img src="' + g + '" alt=""><button class="btn btn-ghost" data-gdel="' + gi + '">消す</button></span>';
    }).join("") + "</div>";
    h += '<label>キャッチコピー <input id="c-catch" type="text" value="' + esc(ch.catchphrase) + '"></label>';
    h += '<label>セリフ集（1行に1つ） <textarea id="c-quotes" rows="3">' + esc(ch.quotes) + "</textarea></label>";
    h += '<div class="grid2">' +
      '<label>年齢 <input id="c-age" type="text" value="' + esc(ch.age) + '"></label>' +
      '<label>性別 <input id="c-gender" type="text" value="' + esc(ch.gender) + '"></label>' +
      '<label>身長 <input id="c-height" type="text" value="' + esc(ch.height) + '"></label>' +
      '<label>危険度・クラス <input id="c-danger" type="text" value="' + esc(ch.danger) + '" placeholder="例：CLASS S ／ 危険度 HIGH"></label></div>';
    h += '<label>性格 <textarea id="c-personality" rows="2">' + esc(ch.personality) + "</textarea></label>";
    h += '<label>設定文 <textarea id="c-setting" rows="5">' + esc(ch.setting) + "</textarea></label>";
    h += '<label>好きなもの <input id="c-likes" type="text" value="' + esc(ch.likes) + '"></label>';
    h += '<label>苦手なもの <input id="c-dislikes" type="text" value="' + esc(ch.dislikes) + '"></label>';
    h += '<label>相関（関係） <textarea id="c-relations" rows="2" placeholder="例：○○とは双子の姉妹／△△とはライバル">' + esc(ch.relations) + "</textarea></label>";

    h += '<fieldset class="mini-block"><legend>使わない項目を隠す</legend><div class="hide-grid">' +
      STD_FIELDS.map(function (f) {
        return '<label class="check-row"><input type="checkbox" data-hide="' + f[0] + '"' + (hidden.indexOf(f[0]) > -1 ? " checked" : "") + "> " + f[1] + "を隠す</label>";
      }).join("") + "</div></fieldset>";

    h += '<fieldset class="mini-block"><legend>自由項目（項目の名前を自分で作れます）</legend><div id="custom-list">';
    (ch.custom_fields || []).forEach(function (f, fi) {
      h += '<div class="custom-row">' +
        '<input type="text" data-cf-label="' + fi + '" value="' + esc(f.label) + '" placeholder="項目名（例：能力の代償）">' +
        '<textarea data-cf-value="' + fi + '" rows="2" placeholder="内容">' + esc(f.value) + "</textarea>" +
        '<label class="check-row"><input type="checkbox" data-cf-hidden="' + fi + '"' + (f.hidden ? " checked" : "") + "> 隠す</label>" +
        '<button class="btn btn-ghost btn-danger" data-cf-del="' + fi + '">削除</button></div>';
    });
    h += '</div><button class="btn btn-ghost" id="cf-add">＋ 自由項目を追加</button></fieldset>';

    $("char-editor").innerHTML = h;

    $("ch-up").addEventListener("click", function () { moveChar(-1); });
    $("ch-down").addEventListener("click", function () { moveChar(1); });
    $("ch-del").addEventListener("click", function () {
      if (d.characters.length <= 1) { alert("キャラは最低1人必要です"); return; }
      if (!confirm("このキャラを削除しますか？")) return;
      d.characters.splice(state.activeChar, 1);
      state.activeChar = Math.max(0, state.activeChar - 1);
      renderCharTabs(); renderCharEditor();
    });
    $("c-image").addEventListener("change", function (e) {
      if (e.target.files[0]) fileToDataURL(e.target.files[0], function (u) { readCharForm(); ch.image = u; renderCharEditor(); });
    });
    $("c-gallery").addEventListener("change", function (e) {
      var files = Array.prototype.slice.call(e.target.files);
      if (!files.length) return;
      readCharForm();
      var pending = files.length;
      files.forEach(function (f) {
        fileToDataURL(f, function (u) { ch.gallery.push(u); if (--pending === 0) renderCharEditor(); });
      });
    });
    $("char-editor").querySelectorAll("[data-gdel]").forEach(function (b) {
      b.addEventListener("click", function () { readCharForm(); ch.gallery.splice(Number(b.getAttribute("data-gdel")), 1); renderCharEditor(); });
    });
    $("cf-add").addEventListener("click", function () {
      readCharForm(); ch.custom_fields.push({ label: "", value: "", hidden: false }); renderCharEditor();
    });
    $("char-editor").querySelectorAll("[data-cf-del]").forEach(function (b) {
      b.addEventListener("click", function () { readCharForm(); ch.custom_fields.splice(Number(b.getAttribute("data-cf-del")), 1); renderCharEditor(); });
    });
  }

  function moveChar(dir) {
    var d = state.draft, i = state.activeChar, j = i + dir;
    if (j < 0 || j >= d.characters.length) return;
    readCharForm();
    var t = d.characters[i]; d.characters[i] = d.characters[j]; d.characters[j] = t;
    state.activeChar = j; renderCharTabs(); renderCharEditor();
  }

  function readCharForm() {
    var d = state.draft; if (!d) return;
    var ch = d.characters[state.activeChar]; if (!ch) return;
    var g = function (id) { var el = $(id); return el ? el.value : ""; };
    ch.name = g("c-name"); ch.reading = g("c-reading"); ch.en_name = g("c-en");
    ch.record_no = g("c-record"); ch.color = g("c-color") || ch.color;
    ch.catchphrase = g("c-catch"); ch.quotes = g("c-quotes");
    ch.age = g("c-age"); ch.gender = g("c-gender"); ch.height = g("c-height");
    ch.danger = g("c-danger"); ch.personality = g("c-personality");
    ch.setting = g("c-setting"); ch.likes = g("c-likes"); ch.dislikes = g("c-dislikes");
    ch.relations = g("c-relations");
    ch.hidden_fields = Array.prototype.map.call(
      document.querySelectorAll("[data-hide]:checked"), function (el) { return el.getAttribute("data-hide"); });
    ch.custom_fields = (ch.custom_fields || []).map(function (f, fi) {
      var l = document.querySelector('[data-cf-label="' + fi + '"]');
      var v = document.querySelector('[data-cf-value="' + fi + '"]');
      var hd = document.querySelector('[data-cf-hidden="' + fi + '"]');
      return { label: l ? l.value : f.label, value: v ? v.value : f.value, hidden: hd ? hd.checked : f.hidden };
    });
  }

  function collectDraft() { readSiteFields(); readCharForm(); return state.draft; }

  // ---------------- 保存・公開 ----------------
  function hidePublishResult() {
    var box = $("publish-result");
    if (box) { box.hidden = true; box.innerHTML = ""; }
  }
  function showSaveResult(id, key, published) {
    var box = $("publish-result");
    var pub = shareLink(id), edt = editLink(id, key);
    box.innerHTML =
      '<h3>' + (published ? "公開しました" : "保存しました") + "</h3>" +
      '<div class="link-row"><span class="link-label">公開リンク</span>' +
      '<input type="text" readonly value="' + esc(pub) + '">' +
      '<button class="btn btn-ghost" data-copy="' + esc(pub) + '">コピー</button></div>' +
      '<div class="link-row"><span class="link-label">編集用リンク</span>' +
      '<input type="text" readonly value="' + esc(edt) + '">' +
      '<button class="btn btn-ghost" data-copy="' + esc(edt) + '">コピー</button></div>' +
      '<p class="note">編集用リンクは、別の端末からこのページを直すための唯一の合言葉です。なくさないように、メモやブックマークに保存してください。同じ端末なら「自分のページ」からも直せます。</p>' +
      (DEMO ? '<p class="note">※DEMOモードなので、これらのリンクはこの端末の中でだけ使えます。</p>' : "");
    box.hidden = false;
    box.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () { copyText(b.getAttribute("data-copy"), null); });
    });
  }

  function saveDraft(publish) {
    if (!state.draft) { alert("先にページの内容を作ってください"); return; }
    var d = collectDraft();
    if (!d.title) { alert("サイトのタイトルを入れてください"); return; }
    var page = JSON.parse(JSON.stringify(d));
    delete page.id; delete page.edit_key;
    if (publish) { page.is_public = $("f-is-public").checked; }
    else { page.is_public = false; }
    $("editor-status").textContent = "保存中…";
    var done = function (id, key) {
      state.editingId = id; state.editingKey = key;
      state.draft.id = id;
      upsertMyPage(id, key, page.title);
      $("editor-status").textContent = publish ? "公開しました。下のリンクからシェアできます。" : "下書きを保存しました（非公開です）。";
      showSaveResult(id, key, publish);
      if (publish) loadGallery();
    };
    if (state.editingId && state.editingKey) {
      Store.updatePage(state.editingId, state.editingKey, page).then(function (ok) {
        if (!ok) { alert("保存に失敗しました。編集用リンクが違う可能性があります。"); return; }
        done(state.editingId, state.editingKey);
      }).catch(function (e) { alert("保存に失敗しました：" + e.message); });
    } else {
      Store.createPage(page).then(function (res) {
        done(res.id, res.edit_key);
      }).catch(function (e) { alert("保存に失敗しました：" + e.message); });
    }
  }

  // ---------------- 初期化 ----------------
  document.addEventListener("DOMContentLoaded", function () {
    if (DEMO) document.getElementById("demo-banner").hidden = false;
    // ?view=<id> 形式のリンクも受け付ける
    var q = new URLSearchParams(location.search);
    if (q.get("view")) location.hash = "#/view/" + q.get("view");

    $("gallery-search").addEventListener("input", function (e) { renderGallery(e.target.value); });
    $("nav-create").addEventListener("click", function (e) { e.preventDefault(); startNewPage(); });
    var heroCreate = $("hero-create");
    if (heroCreate) heroCreate.addEventListener("click", function (e) { e.preventDefault(); startNewPage(); });
    $("btn-new-from-mypage").addEventListener("click", function () { startNewPage(); });
    $("btn-add-char").addEventListener("click", function () {
      if (!state.draft) return;
      readCharForm();
      state.draft.characters.push(newChar(state.draft.characters.length + 1));
      state.activeChar = state.draft.characters.length - 1;
      renderCharTabs(); renderCharEditor();
    });
    ["f-title", "f-author", "f-intro", "f-world", "f-about"].forEach(function (id) {
      $(id).addEventListener("change", readSiteFields);
    });
    $("f-bg-image").addEventListener("change", function (e) {
      if (e.target.files[0]) fileToDataURL(e.target.files[0], function (u) { state.draft.bg_image = u; bindDraft(); });
    });
    $("btn-save-draft").addEventListener("click", function () { saveDraft(false); });
    $("btn-publish").addEventListener("click", function () { saveDraft(true); });
    $("btn-preview").addEventListener("click", function () {
      if (!state.draft) return;
      var d = collectDraft();
      show("preview");
      window.KoubouViewer.renderPage($("preview-root"), JSON.parse(JSON.stringify(d)));
    });
    // プレビューはハッシュを変えずに開くので、「編集に戻る」はハッシュではなく
    // 直接 show("editor") で戻す（下書きはメモリに残っているのでそのまま復元される）
    $("btn-back-edit").addEventListener("click", function () { show("editor"); });
    $("btn-copy-link").addEventListener("click", function () {
      if (currentViewId) copyText(shareLink(currentViewId), $("copy-done"));
    });

    route();
    window.addEventListener("hashchange", route);
  });
})();
