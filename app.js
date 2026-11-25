// ============================================================
// キャラページ工房 ― メインアプリ
// config.js が空なら DEMO モード（localStorage）、
// Supabase の URL と anon key が入っていれば本番モードで動きます。
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

  // ---------------- 状態 ----------------
  var state = {
    user: null,            // { id, email }
    editingId: null,       // 編集中のページid（null=新規）
    draft: null,           // 編集中データ
    activeChar: 0,
    authMode: "login"      // login | signup
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

  // ---------------- 保存レイヤー ----------------
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  };

  var Store = {
    // --- 認証 ---
    signUp: function (email, pw) {
      if (DEMO) {
        var users = LS.get("cpk_users", {});
        if (users[email]) return Promise.reject(new Error("このメールアドレスは登録済みです"));
        var id = "u" + Date.now().toString(36);
        users[email] = { id: id, email: email, pw: pw };
        LS.set("cpk_users", users);
        LS.set("cpk_session", { id: id, email: email });
        return Promise.resolve({ id: id, email: email });
      }
      return sb.auth.signUp({ email: email, password: pw }).then(function (r) {
        if (r.error) throw r.error;
        if (!r.data.user) throw new Error("登録に失敗しました");
        return { id: r.data.user.id, email: email };
      });
    },
    signIn: function (email, pw) {
      if (DEMO) {
        var users = LS.get("cpk_users", {});
        var u = users[email];
        if (!u || u.pw !== pw) return Promise.reject(new Error("メールアドレスかパスワードが違います"));
        LS.set("cpk_session", { id: u.id, email: email });
        return Promise.resolve({ id: u.id, email: email });
      }
      return sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
        if (r.error) throw r.error;
        return { id: r.data.user.id, email: email };
      });
    },
    signOut: function () {
      if (DEMO) { localStorage.removeItem("cpk_session"); return Promise.resolve(); }
      return sb.auth.signOut();
    },
    currentUser: function () {
      if (DEMO) return Promise.resolve(LS.get("cpk_session", null));
      return sb.auth.getUser().then(function (r) {
        return r.data && r.data.user ? { id: r.data.user.id, email: r.data.user.email } : null;
      });
    },
    // --- ページ ---
    listPublic: function () {
      if (DEMO) {
        return Promise.resolve(LS.get("cpk_pages", []).filter(function (p) { return p.is_public; })
          .sort(function (a, b) { return b.created_at - a.created_at; }));
      }
      return sb.from("pages").select("*").eq("is_public", true)
        .order("created_at", { ascending: false })
        .then(function (r) { if (r.error) throw r.error; return r.data.map(fromRow); });
    },
    listMine: function (uid) {
      if (DEMO) {
        return Promise.resolve(LS.get("cpk_pages", []).filter(function (p) { return p.owner === uid; })
          .sort(function (a, b) { return b.updated_at - a.updated_at; }));
      }
      return sb.from("pages").select("*").eq("owner", uid)
        .order("updated_at", { ascending: false })
        .then(function (r) { if (r.error) throw r.error; return r.data.map(fromRow); });
    },
    getPage: function (id) {
      if (DEMO) {
        var p = LS.get("cpk_pages", []).filter(function (x) { return x.id === id; })[0];
        return Promise.resolve(p || null);
      }
      return sb.from("pages").select("*").eq("id", id).single()
        .then(function (r) { if (r.error) return null; return fromRow(r.data); });
    },
    savePage: function (page) {
      if (DEMO) {
        var pages = LS.get("cpk_pages", []);
        var now = Date.now();
        if (page.id) {
          for (var i = 0; i < pages.length; i++) {
            if (pages[i].id === page.id) { page.updated_at = now; pages[i] = page; break; }
          }
        } else {
          page.id = "p" + now.toString(36) + Math.random().toString(36).slice(2, 6);
          page.created_at = now; page.updated_at = now;
          pages.push(page);
        }
        LS.set("cpk_pages", pages);
        return Promise.resolve(page);
      }
      var row = toRow(page);
      var q = page.id ? sb.from("pages").update(row).eq("id", page.id).select().single()
                       : sb.from("pages").insert(row).select().single();
      return q.then(function (r) { if (r.error) throw r.error; return fromRow(r.data); });
    },
    deletePage: function (id) {
      if (DEMO) {
        LS.set("cpk_pages", LS.get("cpk_pages", []).filter(function (p) { return p.id !== id; }));
        return Promise.resolve();
      }
      return sb.from("pages").delete().eq("id", id).then(function (r) { if (r.error) throw r.error; });
    }
  };

  function toRow(p) {
    return {
      owner: p.owner, title: p.title, author_name: p.author_name, intro: p.intro,
      template: p.template, ui_template: p.ui_template, open_fx: p.open_fx, back_fx: p.back_fx,
      theme_color: p.theme_color, bg_image: p.bg_image || null,
      world_text: p.world_text, about_text: p.about_text,
      characters: p.characters, is_public: p.is_public
    };
  }
  function fromRow(r) {
    return {
      id: r.id, owner: r.owner, title: r.title, author_name: r.author_name, intro: r.intro,
      template: r.template, ui_template: r.ui_template, open_fx: r.open_fx, back_fx: r.back_fx,
      theme_color: r.theme_color, bg_image: r.bg_image || "", world_text: r.world_text,
      about_text: r.about_text, characters: r.characters || [], is_public: r.is_public,
      created_at: new Date(r.created_at).getTime(), updated_at: new Date(r.updated_at).getTime()
    };
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
  var views = ["home", "login", "editor", "mypage", "page", "preview"];
  function show(name) {
    views.forEach(function (v) {
      document.getElementById("view-" + v).hidden = v !== name;
    });
    window.scrollTo(0, 0);
  }
  function route() {
    var hash = location.hash || "#/";
    var m = hash.match(/^#\/view\/(.+)$/);
    if (m) { openViewer(decodeURIComponent(m[1])); return; }
    if (hash.indexOf("#/editor") === 0) { openEditor(); return; }
    if (hash.indexOf("#/mypage") === 0) { openMyPage(); return; }
    if (hash.indexOf("#/login") === 0) { show("login"); refreshAuthUI(); return; }
    show("home"); loadGallery();
  }
  function shareLink(id) {
    return location.origin + location.pathname + "#/view/" + id;
  }
  function copyText(text, doneEl) {
    function done() { if (doneEl) { doneEl.hidden = false; setTimeout(function () { doneEl.hidden = true; }, 2000); } }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { prompt("リンクをコピーしてください", text); });
    } else { prompt("リンクをコピーしてください", text); }
  }

  // ---------------- ホーム（一覧） ----------------
  function thumbOf(p) {
    for (var i = 0; i < (p.characters || []).length; i++) if (p.characters[i].image) return p.characters[i].image;
    return p.bg_image || "";
  }
  function cardHTML(p) {
    var t = thumbOf(p);
    return '<a class="page-card" href="#/view/' + p.id + '">' +
      (t ? '<img src="' + t + '" alt="">' : '<span class="page-card-noimg">' + esc((p.title || "?").slice(0, 2)) + "</span>") +
      '<span class="page-card-title">' + esc(p.title || "UNTITLED") + "</span>" +
      '<span class="page-card-author">by ' + esc(p.author_name || "") + "</span>" +
      '<span class="page-card-meta">' + (p.template === "abyss" ? "ABYSS風" : "AFTERIMAGE風") + " ／ キャラ " + (p.characters || []).length + "人</span></a>";
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
      if (!p.is_public && (!state.user || state.user.id !== p.owner)) {
        root.innerHTML = '<p class="note">このページは非公開です。</p>'; return;
      }
      window.KoubouViewer.renderPage(root, p);
    });
  }

  // ---------------- マイページ ----------------
  function openMyPage() {
    if (!state.user) { location.hash = "#/login"; return; }
    show("mypage");
    document.getElementById("mypage-user").textContent = "ログイン中：" + state.user.email + (DEMO ? "（DEMOモード：この端末だけの仮アカウントです）" : "");
    Store.listMine(state.user.id).then(function (pages) {
      var box = document.getElementById("mypage-list");
      document.getElementById("mypage-empty").hidden = pages.length > 0;
      box.innerHTML = "";
      pages.forEach(function (p) {
        var wrap = document.createElement("div");
        wrap.className = "mypage-item";
        wrap.innerHTML = cardHTML(p) +
          '<div class="mypage-actions">' +
          '<span class="note">' + (p.is_public ? "公開中" : "非公開") + "</span>" +
          '<button data-a="edit" class="btn btn-ghost">編集</button>' +
          '<button data-a="toggle" class="btn btn-ghost">' + (p.is_public ? "非公開にする" : "公開する") + "</button>" +
          '<button data-a="copy" class="btn btn-ghost">リンクをコピー</button>' +
          '<button data-a="del" class="btn btn-ghost btn-danger">削除</button></div>';
        wrap.querySelector('[data-a="edit"]').addEventListener("click", function () {
          state.editingId = p.id; state.draft = JSON.parse(JSON.stringify(p)); state.activeChar = 0;
          location.hash = "#/editor"; openEditor();
        });
        wrap.querySelector('[data-a="toggle"]').addEventListener("click", function () {
          p.is_public = !p.is_public; Store.savePage(p).then(openMyPage);
        });
        wrap.querySelector('[data-a="copy"]').addEventListener("click", function () { copyText(shareLink(p.id), null); });
        wrap.querySelector('[data-a="del"]').addEventListener("click", function () {
          if (confirm("このページを削除しますか？ 元に戻せません。")) Store.deletePage(p.id).then(openMyPage);
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
    var d = state.draft;
    d.title = $("f-title").value; d.author_name = $("f-author").value;
    d.intro = $("f-intro").value; d.theme_color = $("f-theme-color").value;
    d.world_text = $("f-world").value; d.about_text = $("f-about").value;
    d.template = $("f-template").value; d.ui_template = $("f-ui-template").value;
    d.open_fx = $("f-open-fx").value; d.back_fx = $("f-back-fx").value;
    d.is_public = $("f-is-public").checked;
  }
  function openEditor() {
    if (!state.user) { location.hash = "#/login"; return; }
    if (!state.draft) { state.draft = newDraft(); state.editingId = null; }
    show("editor"); bindDraft();
    $("editor-status").textContent = state.editingId ? "編集中のページです。直したら「公開する」か「下書き保存」を押してください。" : "新しいページを作っています。";
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

    // 使わない項目を隠す
    h += '<fieldset class="mini-block"><legend>使わない項目を隠す</legend><div class="hide-grid">' +
      STD_FIELDS.map(function (f) {
        return '<label class="check-row"><input type="checkbox" data-hide="' + f[0] + '"' + (hidden.indexOf(f[0]) > -1 ? " checked" : "") + "> " + f[1] + "を隠す</label>";
      }).join("") + "</div></fieldset>";

    // 自由項目
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

  function saveDraft(publish) {
    if (!state.user) { location.hash = "#/login"; return; }
    var d = collectDraft();
    if (!d.title) { alert("サイトのタイトルを入れてください"); return; }
    var page = JSON.parse(JSON.stringify(d));
    page.id = state.editingId || undefined;
    page.owner = state.user.id;
    if (publish) page.is_public = $("f-is-public").checked;
    Store.savePage(page).then(function (saved) {
      state.editingId = saved.id;
      state.draft.id = saved.id;
      if (publish) {
        var link = shareLink(saved.id);
        $("editor-status").innerHTML = "";
        $("editor-status").textContent = "公開しました。このリンクでシェアできます：" + link;
        copyText(link, null);
        alert("公開しました！ リンクをコピーしました。\n" + link + (DEMO ? "\n\n※DEMOモードなので、このリンクはこの端末の中でだけ開けます。本当のシェアは保存先を繋いでからです。" : ""));
        loadGallery();
      } else {
        $("editor-status").textContent = "下書きを保存しました。";
      }
    }).catch(function (e) { alert("保存に失敗しました：" + e.message); });
  }

  // ---------------- 認証UI ----------------
  function refreshAuthUI() {
    $("nav-auth").textContent = state.user ? "ログアウト" : "ログイン";
    $("nav-auth").setAttribute("href", state.user ? "#/mypage" : "#/login");
    $("auth-note").textContent = DEMO
      ? "DEMOモードです。アカウントはこの端末の中にだけ作られる仮のものです。本番では保存先に登録されます。"
      : "キャラページ工房のアカウントです。作ったページはマイページからいつでも直せます。";
    $("auth-title").textContent = state.authMode === "login" ? "ログイン" : "新規登録";
    $("auth-submit").textContent = state.authMode === "login" ? "ログインする" : "登録する";
    $("auth-switch").textContent = state.authMode === "login"
      ? "アカウントを持っていない人はこちら（新規登録）"
      : "アカウントを持っている人はこちら（ログイン）";
  }

  // ---------------- 初期化 ----------------
  document.addEventListener("DOMContentLoaded", function () {
    if (DEMO) document.getElementById("demo-banner").hidden = false;
    // ?view=<id> 形式のリンクも受け付ける
    var q = new URLSearchParams(location.search);
    if (q.get("view")) location.hash = "#/view/" + q.get("view");

    $("gallery-search").addEventListener("input", function (e) { renderGallery(e.target.value); });
    $("btn-add-char").addEventListener("click", function () {
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
      var d = collectDraft();
      show("preview");
      window.KoubouViewer.renderPage($("preview-root"), JSON.parse(JSON.stringify(d)));
    });
    $("btn-copy-link").addEventListener("click", function () {
      if (currentViewId) copyText(shareLink(currentViewId), $("copy-done"));
    });
    $("btn-logout").addEventListener("click", function () {
      Store.signOut().then(function () { state.user = null; state.draft = null; refreshAuthUI(); location.hash = "#/"; });
    });
    $("auth-switch").addEventListener("click", function () {
      state.authMode = state.authMode === "login" ? "signup" : "login";
      $("auth-error").hidden = true; refreshAuthUI();
    });
    $("auth-submit").addEventListener("click", function () {
      var email = $("auth-email").value.trim(), pw = $("auth-password").value;
      var err = $("auth-error");
      if (!email || pw.length < 6) { err.textContent = "メールアドレスと、6文字以上のパスワードを入れてください。"; err.hidden = false; return; }
      var fn = state.authMode === "login" ? Store.signIn : Store.signUp;
      fn(email, pw).then(function (u) {
        state.user = u; refreshAuthUI(); location.hash = "#/mypage";
      }).catch(function (e) { err.textContent = e.message || "失敗しました"; err.hidden = false; });
    });
    $("nav-auth").addEventListener("click", function (e) {
      if (state.user) { /* マイページへ（ログアウトはマイページ内） */ }
    });

    Store.currentUser().then(function (u) {
      state.user = u; refreshAuthUI(); route();
    });
    window.addEventListener("hashchange", route);
  });
})();
