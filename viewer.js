// ============================================================
// キャラページ工房 ― 公開ページの描画と演出
// renderPage(root, page) で、テンプレ×UIテンプレ×演出を再現します。
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

  // ---------- 本体描画 ----------
  function renderPage(root, page) {
    var prefix = uid();
    var chars = page.characters || [];
    var tpl = page.template === "abyss" ? "tpl-abyss" : "tpl-afterimage";
    var ui = "ui-" + (page.ui_template || "record");
    var theme = page.theme_color || "#c8102e";
    var bg = page.bg_image ? 'background-image:linear-gradient(rgba(0,0,0,.72),rgba(0,0,0,.85)),url(' + page.bg_image + ");" : "";

    var menuItems = [
      ["characters", "CHARACTERS", chars.length],
      ["world", "WORLD", null],
      ["gallery", "GALLERY", chars.reduce(function (n, c) { return n + (c.image ? 1 : 0) + (c.gallery || []).length; }, 0)],
      ["quotes", "QUOTES", chars.filter(function (c) { return c.quotes; }).length],
      ["relations", "RELATIONS", chars.filter(function (c) { return c.relations; }).length],
      ["about", "ABOUT", null]
    ];

    var html = "";
    html += '<div class="cs ' + tpl + " " + ui + '" style="--theme:' + esc(theme) + ";" + bg + '">';
    // トップ
    html += '<div class="cs-hero">' +
      '<p class="cs-hero-kicker">' + (page.template === "abyss" ? "INTEGRATED CONTAINMENT TERMINAL" : "CHARACTER ARCHIVE") + "</p>" +
      "<h2>" + esc(page.title || "UNTITLED") + "</h2>" +
      (page.intro ? '<p class="cs-hero-intro">' + nl(page.intro) + "</p>" : "") +
      '<p class="cs-hero-author">by ' + esc(page.author_name || "") + "</p>" +
      '<p class="cs-hud">MODE: VIEW <span class="cs-rec">REC</span> SYNC ' + Math.min(100, chars.length * 25) + "%</p>" +
      "</div>";
    // メニュー（UIテンプレで見た目が変わる）
    html += '<nav class="cs-menu">' + menuItems.map(function (m, i) {
      return '<a href="javascript:void(0)" data-scroll="' + prefix + "-" + m[0] + '">' +
        '<span class="cs-menu-no">' + ("0" + (i + 1)) + "</span>" +
        '<span class="cs-menu-name">' + m[1] + "</span>" +
        (m[2] != null ? '<span class="cs-menu-count">' + m[2] + "</span>" : "") +
        '<span class="cs-menu-open">OPEN</span></a>';
    }).join("") + "</nav>";

    // 一覧と詳細の入れ物
    html += '<div class="cs-listwrap" id="' + prefix + '-characters">';
    html += '<div data-zone="list"><h3 class="cs-sec-title">CHARACTERS</h3><div class="cs-grid">';
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
    html += "</div></div>";
    html += '<div data-zone="detail" hidden></div>';
    html += "</div>";

    // WORLD
    html += '<section class="cs-section" id="' + prefix + '-world"><h3 class="cs-sec-title">WORLD</h3>' +
      (page.world_text ? "<p>" + nl(page.world_text) + "</p>" : '<p class="cs-dim">NO DATA</p>') + "</section>";

    // GALLERY
    var allImgs = [];
    chars.forEach(function (c) { if (c.image) allImgs.push(c.image); (c.gallery || []).forEach(function (g) { allImgs.push(g); }); });
    html += '<section class="cs-section" id="' + prefix + '-gallery"><h3 class="cs-sec-title">GALLERY</h3><div class="cs-gallery">' +
      (allImgs.length ? allImgs.map(function (s) { return '<img src="' + s + '" alt="">'; }).join("") : '<p class="cs-dim">NO IMAGE</p>') +
      "</div></section>";

    // QUOTES
    html += '<section class="cs-section" id="' + prefix + '-quotes"><h3 class="cs-sec-title">QUOTES</h3>';
    chars.forEach(function (c) {
      if (!c.quotes) return;
      html += '<div class="cs-quote-block"><p class="cs-quote-name">' + esc(c.name || "") + "</p>" +
        esc(c.quotes).split("\n").filter(Boolean).map(function (q) { return "<blockquote>" + q + "</blockquote>"; }).join("") + "</div>";
    });
    html += "</section>";

    // RELATIONS
    html += '<section class="cs-section" id="' + prefix + '-relations"><h3 class="cs-sec-title">RELATIONS</h3>';
    var hasRel = false;
    chars.forEach(function (c) {
      if (!c.relations) return; hasRel = true;
      html += '<p class="cs-relation"><strong>' + esc(c.name || "") + "</strong> ― " + nl(c.relations) + "</p>";
    });
    if (!hasRel) html += '<p class="cs-dim">NO DATA</p>';
    html += "</section>";

    // ABOUT
    html += '<section class="cs-section" id="' + prefix + '-about"><h3 class="cs-sec-title">ABOUT</h3>' +
      (page.about_text ? "<p>" + nl(page.about_text) + "</p>" : '<p class="cs-dim">NO DATA</p>') +
      '<p class="cs-dim">AUTHOR: ' + esc(page.author_name || "") + "</p></section>";

    html += "</div>";
    root.innerHTML = html;

    var listZone = root.querySelector('[data-zone="list"]');
    var detailZone = root.querySelector('[data-zone="detail"]');
    var current = null;

    root.querySelectorAll("[data-scroll]").forEach(function (a) {
      a.addEventListener("click", function () {
        var el = document.getElementById(a.getAttribute("data-scroll"));
        if (el) el.scrollIntoView({ behavior: "smooth" });
      });
    });

    root.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ch = chars[Number(btn.getAttribute("data-open"))];
        if (!ch) return;
        current = ch;
        playFx("open", page.open_fx || "glitch", ch.name || "", ch.color || theme, function () {
          listZone.hidden = true;
          detailZone.hidden = false;
          detailZone.innerHTML = renderDetail(page, ch);
          var back = detailZone.querySelector('[data-act="back"]');
          if (back) back.addEventListener("click", function () {
            playFx("back", page.back_fx || "closed", ch.name || "", ch.color || theme, function () {
              detailZone.hidden = true;
              detailZone.innerHTML = "";
              listZone.hidden = false;
              current = null;
            });
          });
          detailZone.scrollIntoView({ behavior: "smooth" });
        });
      });
    });
    return { getCurrent: function () { return current; } };
  }

  window.KoubouViewer = { renderPage: renderPage, playFx: playFx, esc: esc };
})();
