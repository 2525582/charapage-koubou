// ============================================================
// キャラページ工房 ― 公開ページの描画と演出
// renderPage(root, page) で、テンプレ×UIテンプレ×演出を再現します。
// 画面構成：表紙（COVER）→ メニュー（MENU）→ 各セクション画面を切り替える方式。
// ============================================================
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function nl(s) { return esc(s).replace(/\n/g, "<br>"); }
  function uid() { return "v" + Math.random().toString(36).slice(2, 9); }

  // ---------- 演出 ----------
  var OPEN_TEXT = {
    glitch: function (n) { return { main: n, sub: "RECORD OPEN" }; },
    connect: function (n) { return { main: "CONNECTING", sub: n }; },
    cover: function (n) { return { main: n, sub: "FILE OPEN" }; },
    flash: function (n) { return { main: n, sub: "" }; },
    page: function (n) { return { main: n, sub: "" }; }
  };
  var BACK_TEXT = {
    closed: function (n) { return { main: "RECORD CLOSED", sub: n }; },
    shutter: function (n) { return { main: "CLOSED", sub: n }; },
    signal: function (n) { return { main: "SIGNAL LOST", sub: "NO RESPONSE" }; },
    fade: function (n) { return { main: n, sub: "" }; },
    page: function (n) { return { main: n, sub: "" }; }
  };

  function playFx(phase, kind, name, color, done) {
    var overlay = document.getElementById("fx-overlay");
    if (!overlay) { done(); return; }
    var map = phase === "open" ? OPEN_TEXT : BACK_TEXT;
    var t = (map[kind] || map.glitch)(name || "");
    document.getElementById("fx-text").textContent = t.main;
    document.getElementById("fx-sub").textContent = t.sub;
    overlay.style.setProperty("--fx-color", color || "#c8102e");
    overlay.hidden = false;
    overlay.className = "fx-show fx-" + phase + "-" + kind;
    // 名前崩壊（RECORD CLOSED）用：文字を1文字ずつspan化してCSSで崩す
    if (phase === "back" && kind === "closed") {
      var sub = document.getElementById("fx-sub");
      sub.innerHTML = esc(name || "").split("").map(function (c) {
        return '<span class="fx-crumble">' + (c === " " ? "&nbsp;" : c) + "</span>";
      }).join("");
    }
    setTimeout(function () {
      overlay.hidden = true;
      overlay.className = "";
      done();
    }, 1000);
  }

  // ---------- 詳細の項目 ----------
  function fieldRow(label, value) {
    if (!value) return "";
    return '<div class="cs-field"><dt>' + esc(label) + '</dt><dd>' + nl(value) + "</dd></div>";
  }

  function renderDetail(page, ch) {
    var hidden = ch.hidden_fields || [];
    function show(key) { return hidden.indexOf(key) === -1; }
    var rows = "";
    if (show("age") || show("gender") || show("height")) {
      var basics = [];
      if (show("age") && ch.age) basics.push("年齢：" + esc(ch.age));
      if (show("gender") && ch.gender) basics.push("性別：" + esc(ch.gender));
      if (show("height") && ch.height) basics.push("身長：" + esc(ch.height));
      if (basics.length) rows += '<div class="cs-field"><dt>BASIC</dt><dd>' + basics.join(" ／ ") + "</dd></div>";
    }
    if (show("personality")) rows += fieldRow("PERSONALITY", ch.personality);
    if (show("likes")) rows += fieldRow("LIKES", ch.likes);
    if (show("dislikes")) rows += fieldRow("DISLIKES", ch.dislikes);
    if (show("danger") && ch.danger) rows += fieldRow("CLASS / DANGER", ch.danger);
    if (show("relations") && ch.relations) rows += fieldRow("RELATIONS", ch.relations);
    (ch.custom_fields || []).forEach(function (f) {
      if (!f.hidden && f.label && f.value) rows += fieldRow(f.label, f.value);
    });

    var gallery = "";
    var imgs = [ch.image].concat(ch.gallery || []).filter(Boolean);
    if (imgs.length > 1) {
      gallery = '<div class="cs-gallery">' + imgs.map(function (src) {
        return '<img src="' + src + '" alt="">';
      }).join("") + "</div>";
    }
    var quotes = "";
    if (show("quotes") && ch.quotes) {
      quotes = '<div class="cs-quotes">' + esc(ch.quotes).split("\n").filter(Boolean).map(function (q) {
        return "<blockquote>" + q + "</blockquote>";
      }).join("") + "</div>";
    }
    return '' +
      '<button class="cs-back" data-act="back">&larr; BACK</button>' +
      '<div class="cs-detail" style="--ch-color:' + esc(ch.color || page.theme_color || "#888") + '">' +
        '<p class="cs-record">' + esc(ch.record_no || "") + "</p>" +
        "<h3>" + esc(ch.name || "NO NAME") + "</h3>" +
        '<p class="cs-reading">' + esc(ch.reading || "") + (ch.en_name ? ' <span class="cs-en">' + esc(ch.en_name) + "</span>" : "") + "</p>" +
        (ch.catchphrase ? '<p class="cs-catch">' + esc(ch.catchphrase) + "</p>" : "") +
        (ch.image ? '<img class="cs-main-img" src="' + ch.image + '" alt="">' : "") +
        '<dl class="cs-fields">' + rows + "</dl>" +
        (show("setting") && ch.setting ? '<div class="cs-setting"><h4>PROFILE</h4><p>' + nl(ch.setting) + "</p></div>" : "") +
        quotes + gallery +
      "</div>";
  }

  // ---------- サイトテンプレ ----------
  var TEMPLATES = {
    afterimage: { cls: "tpl-afterimage", kicker: "CHARACTER ARCHIVE" },
    abyss: { cls: "tpl-abyss", kicker: "INTEGRATED CONTAINMENT TERMINAL" },
    sacred: { cls: "tpl-sacred", kicker: "SACRED ARCHIVE" },
    neon: { cls: "tpl-neon", kicker: "NEON CITY ARCHIVE" },
    wa: { cls: "tpl-wa", kicker: "SCROLL ARCHIVE" },
    pastel: { cls: "tpl-pastel", kicker: "PASTEL ARCHIVE" },
    mono: { cls: "tpl-mono", kicker: "MONOCHROME FILM" },
    game: { cls: "tpl-game", kicker: "GAME ARCHIVE" },
    fantasy: { cls: "tpl-fantasy", kicker: "STORYBOOK ARCHIVE" }
  };
  // 明るいテンプレ（背景画像のオーバーレイを薄くする）
  var LIGHT_TEMPLATES = { sacred: true, wa: true, pastel: true, mono: true, fantasy: true };

  // ---------- 本体描画 ----------
  function renderPage(root, page) {
    var chars = page.characters || [];
    var tplDef = TEMPLATES[page.template] || TEMPLATES.afterimage;
    var tpl = tplDef.cls;
    var isLight = !!LIGHT_TEMPLATES[page.template];
    var ui = "ui-" + (page.ui_template || "record");
    var theme = page.theme_color || "#c8102e";
    var overlay = isLight
      ? "linear-gradient(rgba(250,247,239,.82),rgba(250,247,239,.9))"
      : "linear-gradient(rgba(0,0,0,.72),rgba(0,0,0,.85))";
    var bg = page.bg_image ? "background-image:" + overlay + ",url(" + page.bg_image + ");" : "";

    // リンク集（古いページには links が無いので空で扱う／http(s) のみ採用）
    var links = (page.links || []).filter(function (l) {
      return l && l.url && /^https?:\/\//i.test(l.url);
    });

    // 表紙の背景：ページ背景画像 → 最初のキャラ画像 の順で採用
    var coverImg = page.bg_image || "";
    if (!coverImg) {
      for (var ci = 0; ci < chars.length; ci++) { if (chars[ci].image) { coverImg = chars[ci].image; break; } }
    }
    var coverOverlay = isLight
      ? "linear-gradient(rgba(252,250,244,.55),rgba(252,250,244,.93))"
      : "linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.88))";
    var coverBg = coverImg ? ' style="background-image:' + coverOverlay + ",url(" + esc(coverImg) + ');"' : "";

    var menuItems = [
      ["characters", "CHARACTERS", chars.length],
      ["world", "WORLD", null],
      ["gallery", "GALLERY", chars.reduce(function (n, c) { return n + (c.image ? 1 : 0) + (c.gallery || []).length; }, 0)],
      ["quotes", "QUOTES", chars.filter(function (c) { return c.quotes; }).length],
      ["relations", "RELATIONS", chars.filter(function (c) { return c.relations; }).length],
      ["links", "LINKS", links.length],
      ["about", "ABOUT", null]
    ];

    function backToMenu() {
      return '<button class="cs-back" data-goto="menu">&larr; BACK TO MENU</button>';
    }
    function screenOpen(name, hidden) {
      return '<div class="cs-screen" data-screen="' + name + '"' + (hidden ? " hidden" : "") + ">";
    }

    var html = "";
    html += '<div class="cs ' + tpl + " " + ui + '" style="--theme:' + esc(theme) + ";" + bg + '">';

    // ===== 表紙（COVER） =====
    html += '<div class="cs-screen cs-screen-cover" data-screen="cover">' +
      '<div class="cs-cover-bg"' + coverBg + "></div>" +
      '<div class="cs-hero cs-cover-inner">' +
        '<p class="cs-hero-kicker">' + tplDef.kicker + "</p>" +
        "<h2>" + esc(page.title || "UNTITLED") + "</h2>" +
        (page.intro ? '<p class="cs-hero-intro">' + nl(page.intro) + "</p>" : "") +
        '<p class="cs-hero-author">by ' + esc(page.author_name || "") + "</p>" +
        '<p class="cs-hud">MODE: VIEW <span class="cs-rec">REC</span> SYNC ' + Math.min(100, chars.length * 25) + "%</p>" +
        '<button class="cs-enter" data-enter>ENTER</button>' +
      "</div>" +
    "</div>";

    // ===== メニュー（MENU） =====
    html += screenOpen("menu", true) +
      '<div class="cs-hero cs-hero-mini">' +
        '<p class="cs-hero-kicker">' + tplDef.kicker + "</p>" +
        "<h2>" + esc(page.title || "UNTITLED") + "</h2>" +
        '<p class="cs-hero-author">by ' + esc(page.author_name || "") + "</p>" +
      "</div>" +
      '<nav class="cs-menu">' + menuItems.map(function (m, i) {
        return '<a href="javascript:void(0)" data-goto="' + m[0] + '">' +
          '<span class="cs-menu-no">' + ("0" + (i + 1)) + "</span>" +
          '<span class="cs-menu-name">' + m[1] + "</span>" +
          (m[2] != null ? '<span class="cs-menu-count">' + m[2] + "</span>" : "") +
          '<span class="cs-menu-open">OPEN</span></a>';
      }).join("") + "</nav>" +
    "</div>";

    // ===== キャラ一覧（CHARACTERS） =====
    html += screenOpen("characters", true) + backToMenu() +
      '<h3 class="cs-sec-title">CHARACTERS</h3><div class="cs-grid">';
    chars.forEach(function (ch, idx) {
      html += '<button class="cs-card" data-open="' + idx + '" style="--ch-color:' + esc(ch.color || theme) + '">' +
        '<span class="cs-card-no">' + esc(ch.record_no || ("RECORD " + ("00" + (idx + 1)).slice(-3))) + "</span>" +
        (ch.image ? '<img src="' + ch.image + '" alt="">' : '<span class="cs-card-noimg">NO IMAGE</span>') +
        '<span class="cs-card-name">' + esc(ch.name || "NO NAME") + "</span>" +
        '<span class="cs-card-reading">' + esc(ch.reading || "") + "</span>" +
        (page.template === "abyss" && ch.danger ? '<span class="cs-card-danger">' + esc(ch.danger) + "</span>" : "") +
        (ch.catchphrase ? '<span class="cs-card-catch">' + esc(ch.catchphrase) + "</span>" : "") +
        "</button>";
    });
    html += "</div>" + (chars.length ? "" : '<p class="cs-dim">NO DATA</p>') + "</div>";

    // ===== キャラ詳細（DETAIL：カードを押すと中身が入る） =====
    html += screenOpen("detail", true) + "</div>";

    // ===== WORLD =====
    html += screenOpen("world", true) + backToMenu() +
      '<section class="cs-section"><h3 class="cs-sec-title">WORLD</h3>' +
      (page.world_text ? "<p>" + nl(page.world_text) + "</p>" : '<p class="cs-dim">NO DATA</p>') + "</section></div>";

    // ===== GALLERY =====
    var allImgs = [];
    chars.forEach(function (c) { if (c.image) allImgs.push(c.image); (c.gallery || []).forEach(function (g) { allImgs.push(g); }); });
    html += screenOpen("gallery", true) + backToMenu() +
      '<section class="cs-section"><h3 class="cs-sec-title">GALLERY</h3><div class="cs-gallery">' +
      (allImgs.length ? allImgs.map(function (s) { return '<img src="' + s + '" alt="">'; }).join("") : '<p class="cs-dim">NO IMAGE</p>') +
      "</div></section></div>";

    // ===== QUOTES =====
    html += screenOpen("quotes", true) + backToMenu() +
      '<section class="cs-section"><h3 class="cs-sec-title">QUOTES</h3>';
    var hasQuotes = false;
    chars.forEach(function (c) {
      if (!c.quotes) return;
      hasQuotes = true;
      html += '<div class="cs-quote-block"><p class="cs-quote-name">' + esc(c.name || "") + "</p>" +
        esc(c.quotes).split("\n").filter(Boolean).map(function (q) { return "<blockquote>" + q + "</blockquote>"; }).join("") + "</div>";
    });
    if (!hasQuotes) html += '<p class="cs-dim">NO DATA</p>';
    html += "</section></div>";

    // ===== RELATIONS =====
    html += screenOpen("relations", true) + backToMenu() +
      '<section class="cs-section"><h3 class="cs-sec-title">RELATIONS</h3>';
    var hasRel = false;
    chars.forEach(function (c) {
      if (!c.relations) return; hasRel = true;
      html += '<p class="cs-relation"><strong>' + esc(c.name || "") + "</strong> ― " + nl(c.relations) + "</p>";
    });
    if (!hasRel) html += '<p class="cs-dim">NO DATA</p>';
    html += "</section></div>";

    // ===== LINKS（リンク集） =====
    html += screenOpen("links", true) + backToMenu() +
      '<section class="cs-section"><h3 class="cs-sec-title">LINKS</h3>' +
      '<div class="cs-links-profile">' +
        '<p class="cs-links-title">' + esc(page.title || "UNTITLED") + "</p>" +
        '<p class="cs-links-author">by ' + esc(page.author_name || "") + "</p>" +
        (page.intro ? '<p class="cs-links-intro">' + nl(page.intro) + "</p>" : "") +
      "</div>" +
      (links.length
        ? '<div class="cs-link-list">' + links.map(function (l) {
            return '<a class="cs-link-btn" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + "</a>";
          }).join("") + "</div>"
        : '<p class="cs-dim">NO DATA</p>') +
      '<button class="cs-link-chars" data-goto="characters">キャラ紹介を見る</button>' +
      "</section></div>";

    // ===== ABOUT =====
    html += screenOpen("about", true) + backToMenu() +
      '<section class="cs-section"><h3 class="cs-sec-title">ABOUT</h3>' +
      (page.about_text ? "<p>" + nl(page.about_text) + "</p>" : '<p class="cs-dim">NO DATA</p>') +
      '<p class="cs-dim">AUTHOR: ' + esc(page.author_name || "") + "</p></section></div>";

    html += "</div>";
    root.innerHTML = html;

    // ---------- 画面切り替え ----------
    var csEl = root.querySelector(".cs");
    var screens = {};
    root.querySelectorAll("[data-screen]").forEach(function (el) {
      screens[el.getAttribute("data-screen")] = el;
    });
    var detailScreen = screens.detail;
    var current = null;

    function showScreen(name) {
      Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
      if (csEl) csEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    var enterBtn = root.querySelector("[data-enter]");
    if (enterBtn) enterBtn.addEventListener("click", function () { showScreen("menu"); });

    root.querySelectorAll("[data-goto]").forEach(function (el) {
      el.addEventListener("click", function () { showScreen(el.getAttribute("data-goto")); });
    });

    root.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ch = chars[Number(btn.getAttribute("data-open"))];
        if (!ch) return;
        current = ch;
        playFx("open", page.open_fx || "glitch", ch.name || "", ch.color || theme, function () {
          detailScreen.innerHTML = renderDetail(page, ch);
          showScreen("detail");
          var back = detailScreen.querySelector('[data-act="back"]');
          if (back) back.addEventListener("click", function () {
            playFx("back", page.back_fx || "closed", ch.name || "", ch.color || theme, function () {
              showScreen("characters");
              current = null;
            });
          });
        });
      });
    });
    return { getCurrent: function () { return current; } };
  }

  window.KoubouViewer = { renderPage: renderPage, playFx: playFx, esc: esc };
})();

