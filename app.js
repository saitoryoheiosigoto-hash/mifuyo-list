(function () {
  "use strict";

  // ================================================================ backend
  var IS_GAS = typeof google !== "undefined" && google.script && google.script.run;
  // GitHub 版（ホーム画面に追加できる版）は、Google 側の URL をここに入れて読み書きする
  var API_URL = window.API_URL || "";

  function api(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (API_URL) {
      return fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ fn: name, args: args }) })
        .then(function (r) { if (!r.ok) throw new Error("通信に失敗しました（" + r.status + "）"); return r.json(); })
        .then(function (j) { if (!j.ok) throw new Error(j.error || "うまくいきませんでした"); return j.data; },
          function (e) { throw new Error((e && e.message) || "通信に失敗しました。電波を確認してください"); });
    }
    if (IS_GAS) {
      return new Promise(function (resolve, reject) {
        var r = google.script.run.withSuccessHandler(resolve).withFailureHandler(function (e) { reject(e); });
        r[name].apply(r, args);
      });
    }
    return new Promise(function (resolve, reject) {
      setTimeout(function () { try { resolve(Mock[name].apply(null, args)); } catch (e) { reject(e); } }, 150);
    });
  }

  var Mock = window.Mock || {};
  // お試し版（try.html）は Google に保存せず、この端末の中だけで動く。本番と記録が混ざらないよう保存場所の名前を分ける
  var DEMO = !API_URL && !IS_GAS;

  // ================================================================ state
  var STORES = ["上野", "渋谷", "札幌"];
  var S = { view: "home", store: "", entries: [], staff: [], config: null, tab: "pending", q: "", kind: "", item: "", me: "", loaded: false, error: "", openHist: {}, pin: "" };
  function lsGet(k) { if (DEMO) k = "demo." + k; try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { if (DEMO) k = "demo." + k; try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  S.store = lsGet("coinlist.store") || (DEMO ? "上野" : "");
  if (STORES.indexOf(S.store) < 0) S.store = "";
  function meKey() { return "coinlist.me." + S.store; }
  function cacheKey() { return "coinlist.cache." + S.store; }
  S.me = S.store ? lsGet(meKey()) : "";

  function applyData(d, fromCache) {
    if (d.store && d.store !== S.store) return; // 店舗を切り替えた後に届いた古い返事は使わない
    S.entries = d.entries || [];
    S.staff = d.staff || [];
    S.config = d.config;
    S.loaded = true;
    if (!fromCache) {
      S.error = ""; S.stale = false;
      lsSet(cacheKey(), JSON.stringify(d));
    }
    if (S.me && !S.staff.some(function (s) { return s.name === S.me; })) { S.me = ""; lsSet(meKey(), ""); }
    render();
  }
  function errMsg(e) { var m = (e && e.message) || String(e || ""); m = m.replace(/^(Error|Exception):\s*/, ""); return m || "うまくいきませんでした"; }
  // 保存に失敗したとき用：画面は保存前のまま。何が起きたかを出す
  function saveFail(e) { toast("保存できませんでした：" + errMsg(e)); refresh(); }

  var busyEl = document.getElementById("busy");
  function call(name) {
    var args = arguments;
    busyEl.hidden = false;
    return api.apply(null, args).then(function (d) { busyEl.hidden = true; applyData(d); return d; },
      function (e) { busyEl.hidden = true; throw e; });
  }

  // ================================================================ helpers
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDT(iso) { if (!iso) return ""; var d = new Date(iso); if (isNaN(d)) return ""; return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function dayLabel(iso) { var d = new Date(iso); if (isNaN(d)) return ""; return (d.getMonth() + 1) + "月" + d.getDate() + "日（" + "日月火水木金土"[d.getDay()] + "）"; }
  function ageDays(iso) { var d = new Date(iso); if (isNaN(d)) return 0; var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var n = new Date(); var b = new Date(n.getFullYear(), n.getMonth(), n.getDate()); return Math.max(0, Math.round((b - a) / 86400000)); }
  function ageLevel(days) { return days >= 7 ? "late" : days >= 3 ? "warn" : ""; }
  function normId(s) { return String(s || "").replace(/[\s.\-ー－・]/g, ""); }
  function fmtGid(s) { var d = normId(s); return /^[0-9]{8}$/.test(d) ? d.slice(0, 4) + " " + d.slice(4) : d; }
  function fmtNum(n) { return Number(n || 0).toLocaleString("ja-JP"); }
  function isGrantor(n) { return S.staff.some(function (s) { return s.name === n && s.grantor; }); }
  function grantors() { return S.staff.filter(function (s) { return s.grantor; }); }
  function gidRequired(kind, item) { return kind === "coin" || (kind === "ticket" && S.config && S.config.gameIdRequiredTickets.indexOf(item) >= 0); }

  function pill(e) {
    if (e.kind === "coin") return h("span", { class: "pill coin" }, fmtNum(e.amount), h("small", { text: "coin" }));
    if (e.kind === "pt") return h("span", { class: "pill pt" }, fmtNum(e.amount), h("small", { text: "pt" }), h("span", { class: "sub", text: "+POINT" }));
    return h("span", { class: "pill ticket" }, fmtNum(e.amount), h("small", { text: "枚" }), h("span", { class: "sub", text: e.item || "チケット" }));
  }

  // 名前 → 最新の Game ID（入力補助）
  function knownIds() {
    var m = {};
    S.entries.slice().sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); })
      .forEach(function (e) { if (e.target && e.gameId && e.status !== "取消") m[e.target] = e.gameId; });
    return m;
  }

  // ================================================================ toast
  var toastTimer;
  function toast(msg, undo) {
    var t = document.getElementById("toast");
    document.getElementById("toastMsg").textContent = msg;
    var u = document.getElementById("toastUndo");
    u.hidden = !undo;
    u.onclick = undo ? function () { t.hidden = true; undo(); } : null;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, undo ? 7000 : 3500);
  }

  // ================================================================ render
  function render() {
    var pending = S.entries.filter(function (e) { return e.status === "未付与"; });
    var done = S.entries.filter(function (e) { return e.status === "付与済み"; });
    var canceled = S.entries.filter(function (e) { return e.status === "取消"; });
    var np = document.getElementById("nPending");
    np.textContent = pending.length; np.classList.toggle("zero", !pending.length);
    document.getElementById("nDone").textContent = done.length;
    document.getElementById("nCanceled").textContent = canceled.length;
    document.querySelectorAll(".tab").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === S.tab ? "true" : "false"); });
    document.getElementById("meName").textContent = S.me || "未選択";
    document.getElementById("storeName").textContent = S.store || "店舗を選ぶ";
    renderHome(pending);
    document.getElementById("demoNote").hidden = !!(IS_GAS || API_URL);

    var list = document.getElementById("list");
    if (!S.loaded) {
      list.textContent = "";
      if (S.error) list.appendChild(h("div", { class: "status-note err", text: "読み込めませんでした：" + S.error + "（ページを開き直してください）" }));
      else if (S.store) add(list, [h("div", { class: "skeleton" }), h("div", { class: "skeleton" }), h("div", { class: "skeleton" })]);
      return;
    }
    list.textContent = "";
    if (S.error) list.appendChild(h("div", { class: "status-note err", text: "最新の内容を取得できませんでした：" + S.error + "（前回の内容を表示しています）" }));
    else if (S.stale) list.appendChild(h("div", { class: "status-note", text: "前回の内容を表示しています。最新の内容を読み込み中…" }));

    if (!S.staff.length) {
      list.appendChild(h("div", { class: "empty" },
        h("div", { class: "big", text: S.store + "のスタッフを登録しましょう" }),
        h("div", { text: "入力者や付与担当として選ぶ名前を登録します。付与担当にした人だけが「付与した」を押せます。" }),
        h("button", { class: "btn primary", type: "button", onclick: openStaff }, "スタッフを登録する")));
      return;
    }

    var src = S.tab === "pending" ? pending : S.tab === "done" ? done : canceled;
    var q = S.q.trim().toLowerCase();
    if (q) {
      var qd = normId(q);
      src = src.filter(function (e) { return String(e.target || "").toLowerCase().indexOf(q) >= 0 || (qd && normId(e.gameId).indexOf(qd) >= 0); });
    }
    renderFilters(src);
    if (S.kind) src = src.filter(function (e) { return e.kind === S.kind && (S.kind !== "ticket" || !S.item || e.item === S.item); });
    var items = src.slice();
    if (S.tab === "pending") items.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
    else if (S.tab === "done") items.sort(function (a, b) { return String(b.grantedAt).localeCompare(String(a.grantedAt)); });
    else items.sort(function (a, b) { return String(b.canceledAt).localeCompare(String(a.canceledAt)); });

    if (S.tab === "done" && items.length) {
      list.appendChild(h("div", { class: "legend", text: "付与から3か月たった記録は、自動でこの一覧から消えます（スプレッドシートの保管シートに残ります）。" }));
    }
    if (S.tab === "pending" && items.length) {
      list.appendChild(h("div", { class: "legend" },
        h("span", null, h("i", { style: "background:var(--line)" }), "2日以内"),
        h("span", null, h("i", { style: "background:var(--warn)" }), "3日以上"),
        h("span", null, h("i", { style: "background:var(--danger)" }), "7日以上")));
    }

    if (!items.length) {
      var msg = q ? ["見つかりません", "「" + S.q.trim() + "」に当てはまる記録はありません。"]
        : S.kind ? ["当てはまる記録はありません", "絞り込みを「すべて」に戻すと、ほかの記録が表示されます。"]
        : S.tab === "pending" ? (S.entries.length ? ["未付与はありません", "すべて付与済みです。"] : ["まだ登録がありません", "付与できなかった coin・チケット・+POINT は、はじめの画面の「＋ 未付与を登録する」から登録します。"])
        : S.tab === "done" ? ["付与済みはまだありません", "未付与タブで「付与した」を押すと、ここに移ります。付与から3か月たつと自動で消えます。"]
        : ["取消はありません", "書き間違いなどで取り消した記録がここに残ります。"];
      list.appendChild(h("div", { class: "empty" }, h("div", { class: "big", text: msg[0] }), h("div", { text: msg[1] })));
      return;
    }

    var last = null;
    items.forEach(function (e) {
      var basis = S.tab === "pending" ? e.createdAt : S.tab === "done" ? e.grantedAt : e.canceledAt;
      var lbl = (S.tab === "pending" ? "登録 " : S.tab === "done" ? "付与 " : "取消 ") + dayLabel(basis);
      if (lbl !== last) { list.appendChild(h("div", { class: "meta", style: "margin-top:6px;font-weight:700", text: lbl })); last = lbl; }
      list.appendChild(card(e));
    });
  }

  // 種類の絞り込みボタン（1つだけ選択。もう一度押すと解除）
  function renderFilters(src) {
    var fk = document.getElementById("filterKind"), fi = document.getElementById("filterItem");
    function count(fn) { return src.filter(fn).length; }
    fk.textContent = "";
    [["", "すべて"], ["coin", "coin"], ["ticket", "チケット"], ["pt", "+POINT"]].forEach(function (k) {
      var n = k[0] ? count(function (e) { return e.kind === k[0]; }) : src.length;
      fk.appendChild(h("button", { class: "fchip" + (k[0] ? " k-" + k[0] : ""), type: "button", "aria-pressed": S.kind === k[0] ? "true" : "false",
        onclick: function () { S.kind = (S.kind === k[0] || !k[0]) ? "" : k[0]; S.item = ""; render(); } },
        k[1], h("span", { class: "c", text: String(n) })));
    });
    fi.textContent = "";
    fi.hidden = S.kind !== "ticket";
    if (S.kind !== "ticket") return;
    var names = (S.config ? S.config.tickets : []).slice();
    src.forEach(function (e) { if (e.kind === "ticket" && e.item && names.indexOf(e.item) < 0) names.push(e.item); });
    fi.appendChild(h("button", { class: "fchip k-ticket", type: "button", "aria-pressed": !S.item ? "true" : "false", onclick: function () { S.item = ""; render(); } },
      "すべてのチケット"));
    names.forEach(function (n) {
      var c = count(function (e) { return e.kind === "ticket" && e.item === n; });
      fi.appendChild(h("button", { class: "fchip k-ticket", type: "button", "aria-pressed": S.item === n ? "true" : "false",
        onclick: function () { S.item = S.item === n ? "" : n; render(); } }, n, h("span", { class: "c", text: String(c) })));
    });
  }

  function card(e) {
    var days = ageDays(e.createdAt), lvl = ageLevel(days);
    var cls = "card";
    if (e.status === "未付与" && lvl) cls += " age-" + lvl;
    if (e.status === "付与済み") cls += " st-done";
    if (e.status === "取消") cls += " st-canceled";

    var gid = e.gameId
      ? h("button", { class: "gid", type: "button", title: "Game ID をコピー", onclick: function () { copyText(normId(e.gameId)); } },
          h("span", { class: "lbl", text: "ID" }), fmtGid(e.gameId), h("span", { class: "cp", text: "コピー" }))
      : h("span", { class: "gid none", text: "Game ID なし" });
    var idMissing = !e.gameId && gidRequired(e.kind, e.item);
    if (idMissing) gid = h("span", { class: "gid none", text: "Game ID 不明" });

    var tags = h("div", { class: "tags" },
      e.status === "未付与" ? h("span", { class: "tag age " + lvl, text: days === 0 ? "今日" : days + "日経過" }) : null,
      idMissing && e.status === "未付与" ? h("span", { class: "tag missing", text: "Game ID 未確認：修正から追記" }) : null,
      e.reason ? h("span", { class: "tag reason", text: "理由：" + e.reason }) : null);

    // 変更履歴（誰がいつ何をしたか）
    var hist = Array.isArray(e.history) ? e.history : [];
    var lastEdit = hist.filter(function (x) { return x.action === "修正"; }).pop() || null;
    var histBox = null;
    if (hist.length) {
      var open = !!S.openHist[e.id];
      var listEl = h("ol", { class: "hist", hidden: !open }, hist.slice().reverse().map(function (x) {
        return h("li", null,
          h("span", { class: "when", text: fmtDT(x.at) }), " ", h("b", { text: x.by || "" }), " ", h("span", { class: "act", text: x.action || "" }),
          (x.changes && x.changes.length) ? h("ul", null, x.changes.map(function (c) { return h("li", { text: c }); })) : null);
      }));
      var tog = h("button", { class: "histbtn", type: "button", "aria-expanded": open ? "true" : "false", onclick: function () {
        S.openHist[e.id] = !S.openHist[e.id]; listEl.hidden = !S.openHist[e.id];
        tog.setAttribute("aria-expanded", S.openHist[e.id] ? "true" : "false");
        tog.firstChild.textContent = (S.openHist[e.id] ? "▾ " : "▸ ") + "変更履歴（" + hist.length + "件）";
      } }, (open ? "▾ " : "▸ ") + "変更履歴（" + hist.length + "件）");
      histBox = h("div", null, tog, listEl);
    }

    var acts = null;
    if (e.status === "未付与") acts = h("div", { class: "actions" },
      h("button", { class: "btn grant", type: "button", onclick: function () { startGrant(e); } }, "付与した"),
      h("button", { class: "btn ghost", type: "button", onclick: function () { openForm(e); } }, "修正"),
      h("button", { class: "btn ghost", type: "button", onclick: function () { openCancel(e); } }, "取消"));
    else if (e.status === "付与済み") acts = h("div", { class: "actions" },
      h("button", { class: "btn ghost", type: "button", onclick: function () { startUngrant(e); } }, "未付与に戻す"));
    else acts = h("div", { class: "actions" },
      h("button", { class: "btn ghost", type: "button", onclick: function () { needMe(function () { call("restoreEntry", e.id, S.me).then(function () { toast("未付与に戻しました"); }, saveFail); }); } }, "未付与に戻す"));

    return h("article", { class: cls },
      h("div", { class: "row1" }, h("div", { class: "who" }, h("div", { class: "name", text: e.target || "（名前なし）" }), gid), pill(e)),
      tags,
      e.note ? h("div", { class: "note", text: "備考：" + e.note }) : null,
      h("div", { class: "meta" }, h("span", null, "登録 ", h("b", { text: fmtDT(e.createdAt) })), e.createdBy ? h("span", null, "入力者 ", h("b", { text: e.createdBy })) : null,
        lastEdit ? h("span", null, "最終修正 ", h("b", { text: fmtDT(lastEdit.at) + " " + (lastEdit.by || "") })) : null),
      histBox,
      e.status === "付与済み" ? h("div", { class: "result done", text: "✓ 付与済み　" + fmtDT(e.grantedAt) + "　担当 " + (e.grantedBy || "") }) : null,
      e.status === "取消" ? h("div", { class: "result canceled", text: "取消　" + fmtDT(e.canceledAt) + "　" + (e.canceledBy || "") + "　理由：" + (e.cancelReason || "") }) : null,
      acts);
  }

  function copyText(t) {
    function fallback() {
      var ta = h("textarea", { style: "position:fixed;opacity:0;top:0;left:0" }); ta.value = t; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove(); toast(ok ? "Game ID をコピーしました" : "コピーできませんでした。ID を長押しして選択してください");
    }
    try { navigator.clipboard.writeText(t).then(function () { toast("Game ID をコピーしました"); }, fallback); } catch (e) { fallback(); }
  }

  // ================================================================ sheets
  var overlay = document.getElementById("overlay"), sheet = document.getElementById("sheet");
  var sheetDirty = false, sheetLocked = false;
  function openSheet(children, opts) {
    sheet.textContent = ""; add(sheet, children);
    sheetDirty = false; sheetLocked = !!(opts && opts.locked);
    overlay.hidden = false; sheet.scrollTop = 0;
    pushExtra();
  }
  function closeSheet() { overlay.hidden = true; sheet.textContent = ""; sheetDirty = false; sheetLocked = false; if (S.view === "home") dropExtra(); }
  // 入力したら「書きかけ」とみなす
  sheet.addEventListener("input", function () { sheetDirty = true; });
  sheet.addEventListener("click", function (ev) { if (ev.target.closest && ev.target.closest(".choice, .x, .addrow, .stepper button, .quick button")) sheetDirty = true; });
  // 外側を押した・Esc を押したなど、保存せずに閉じようとしたとき
  function requestClose() {
    if (sheetLocked) return;
    if (!sheetDirty) { closeSheet(); return; }
    if (sheet.querySelector(".confirm-bar")) return;
    var bar = h("div", { class: "confirm-bar", role: "alert" },
      h("span", { text: "入力した内容を消して閉じますか？" }),
      h("button", { class: "btn", type: "button", onclick: function () { bar.remove(); } }, "入力を続ける"),
      h("button", { class: "btn danger", type: "button", onclick: closeSheet }, "消して閉じる"));
    sheet.insertBefore(bar, sheet.firstChild);
    sheet.scrollTop = 0;
  }
  overlay.addEventListener("click", function (ev) { if (ev.target === overlay) requestClose(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !overlay.hidden) requestClose(); });

  // ---- あなたは誰？ ----
  function needMe(then) { if (S.me) then(); else openMe(then); }
  function openMe(then) {
    if (!S.staff.length) { openStaff(); return; }
    openSheet([
      h("h2", { id: "sheetTitle", text: "あなたは誰ですか？" }),
      h("p", { class: "lead", text: "この端末で使う名前を選びます。入力者・付与担当として記録されます。" }),
      h("div", { class: "people" }, S.staff.map(function (s) {
        return h("button", { class: "choice", type: "button", "aria-pressed": s.name === S.me ? "true" : "false",
          onclick: function () { S.me = s.name; lsSet(meKey(), s.name); closeSheet(); render(); if (then) then(); } },
          s.name, s.grantor ? h("div", { style: "font-size:11px;font-weight:500", text: "付与担当" }) : null);
      })),
      h("div", { class: "foot" }, h("button", { class: "btn ghost", type: "button", onclick: closeSheet }, "やめる"))
    ]);
  }
  document.getElementById("meBtn").addEventListener("click", function () { openMe(null); });

  // ---- 付与 ----
  function doGrant(e, by) {
    closeSheet();
    call("grant", e.id, by).then(function () {
      toast(e.target + " さんを付与済みにしました", function () { call("ungrant", e.id, by).then(function () { toast("取り消しました"); }, saveFail); });
    }, saveFail);
  }
  function startGrant(e) {
    var gs = grantors();
    if (!gs.length) {
      openSheet([h("h2", { id: "sheetTitle", text: "付与担当がいません" }), h("p", { class: "lead", text: "スタッフの設定で、付与できる人に「付与担当」を付けてください。" }),
        h("div", { class: "foot" }, h("button", { class: "btn ghost", type: "button", onclick: closeSheet }, "閉じる"), h("button", { class: "btn primary", type: "button", onclick: openStaff }, "スタッフの設定"))]);
      return;
    }
    openSheet([
      h("h2", { id: "sheetTitle", text: "誰が付与しましたか？" }),
      h("p", { class: "lead", text: e.target + " さんへの付与を記録します。付与担当だけが選べます。" }),
      h("div", { class: "people" }, gs.map(function (s) { return h("button", { class: "choice", type: "button", onclick: function () { doGrant(e, s.name); } }, s.name, s.name === S.me ? h("div", { style: "font-size:11px;font-weight:500", text: "あなた" }) : null); })),
      h("div", { class: "foot" }, h("button", { class: "btn ghost", type: "button", onclick: closeSheet }, "やめる"))
    ]);
  }
  function startUngrant(e) {
    var by = S.me && isGrantor(S.me) ? S.me : null;
    var gs = grantors();
    openSheet([
      h("h2", { id: "sheetTitle", text: "未付与に戻しますか？" }),
      h("p", { class: "lead", text: e.target + " さんの付与記録を消して、未付与に戻します。付与担当が操作してください。" }),
      h("div", { class: "people" }, gs.map(function (s) {
        return h("button", { class: "choice", type: "button", "aria-pressed": s.name === by ? "true" : "false", onclick: function () {
          closeSheet(); call("ungrant", e.id, s.name).then(function () { toast("未付与に戻しました"); }, saveFail);
        } }, s.name + " が戻す");
      })),
      h("div", { class: "foot" }, h("button", { class: "btn ghost", type: "button", onclick: closeSheet }, "やめる"))
    ]);
  }

  // ---- 取消 ----
  function openCancel(e) {
    needMe(function () {
      var reasons = ["書き間違い", "二重に登録した", "付与の必要がなくなった"];
      var other = h("input", { class: "inp", id: "cancelReason", type: "text", placeholder: "理由を入力", autocomplete: "off" });
      var picked = "";
      var btns = reasons.map(function (r) { return h("button", { class: "choice", type: "button", "aria-pressed": "false", onclick: function () { picked = r; other.value = ""; sync(); } }, r); });
      function sync() { btns.forEach(function (b) { b.setAttribute("aria-pressed", b.textContent === picked ? "true" : "false"); }); }
      other.addEventListener("input", function () { picked = ""; sync(); });
      var err = h("div", { class: "err", hidden: true, text: "理由を選ぶか入力してください" });
      openSheet([
        h("h2", { id: "sheetTitle", text: "この記録を取り消す" }),
        h("p", { class: "lead", text: e.target + " さんの記録を「取消」にします。記録は消えずに取消タブに残ります。" }),
        h("div", { class: "field" }, h("div", { class: "lab" }, "取消の理由", h("span", { class: "req", text: "必須" })), h("div", { class: "choices" }, btns), other, err),
        h("div", { class: "foot" },
          h("span", { class: "meta", text: "取消する人：" + S.me }), h("span", { class: "spacer" }),
          h("button", { class: "btn ghost", type: "button", onclick: closeSheet }, "やめる"),
          h("button", { class: "btn danger", type: "button", onclick: function () {
            var r = picked || other.value.trim();
            if (!r) { err.hidden = false; return; }
            closeSheet();
            call("cancelEntry", e.id, S.me, r).then(function () { toast("取り消しました"); }, saveFail);
          } }, "取り消す"))
      ]);
    });
  }

  // ---- 登録・修正フォーム ----
  function openForm(existing) {
    if (existing) { buildForm(existing); return; } // 修正は保存時に「修正した人」を選ぶ
    needMe(function () { buildForm(existing); });
  }
  function buildForm(existing) {
    var editing = !!existing;
    var cfg = S.config;
    var f = {
      kind: existing ? existing.kind : "",
      item: existing ? existing.item || "" : "",
      editor: "",
      reason: existing ? existing.reason || "" : ""
    };
    var ids = knownIds();
    var names = Object.keys(ids);
    var dl = h("datalist", { id: "knownNames" }, names.map(function (n) { return h("option", { value: n }); }));

    // 対象者の行
    var targets = h("div", { class: "targets" });
    var seq = 0;
    function addRow(name, gid) {
      seq++;
      var n = h("input", { class: "inp", id: "tn" + seq, type: "text", placeholder: "対象者の名前", list: "knownNames", autocomplete: "off", value: name || "", "aria-label": "対象者の名前" });
      var g = h("input", { class: "inp mono", id: "tg" + seq, type: "text", inputmode: "numeric", placeholder: "Game ID", autocomplete: "off", value: gid ? fmtGid(gid) : "", "aria-label": "Game ID" });
      var hint = h("div", { class: "hint", hidden: true });
      // Game ID が分からないとき用（Game ID 必須の種類のときだけ表示）
      var unkBox = h("input", { type: "checkbox", id: "tu" + seq });
      unkBox.checked = !!(editing && existing && !existing.gameId && gidRequired(existing.kind, existing.item));
      function syncUnk() { g.disabled = unkBox.checked; if (unkBox.checked) { g.value = ""; hint.hidden = true; } g.placeholder = unkBox.checked ? "ID不明" : "Game ID"; }
      unkBox.addEventListener("change", syncUnk);
      var unk = h("label", { class: "unk", for: "tu" + seq }, unkBox, "Game ID が分からない（ID不明で登録）");
      var x = editing ? h("span") : h("button", { class: "x", type: "button", "aria-label": "この行を消す", onclick: function () { if (targets.children.length > 1) row.remove(); else { n.value = ""; g.value = ""; hint.hidden = true; unkBox.checked = false; syncUnk(); } } }, "×");
      var row = h("div", { class: "trow" }, n, g, x, unk, hint);
      syncUnk();
      function check() {
        var known = ids[n.value.trim()];
        hint.textContent = "";
        if (!known) { hint.hidden = true; return; }
        if (!g.value.trim()) { g.value = fmtGid(known); unkBox.checked = false; syncUnk(); hint.hidden = true; return; }
        if (normId(g.value) !== normId(known)) {
          hint.hidden = false;
          add(hint, ["前回の Game ID は " + fmtGid(known) + " です。", h("button", { type: "button", onclick: function () { g.value = fmtGid(known); hint.hidden = true; } }, "前回のIDにする")]);
        } else hint.hidden = true;
      }
      n.addEventListener("change", check); n.addEventListener("blur", check); g.addEventListener("blur", check);
      targets.appendChild(row);
      return n;
    }
    if (existing) addRow(existing.target, existing.gameId); else addRow("", "");

    // 付与するもの
    var kindBtns = [["coin", "coin"], ["ticket", "チケット"], ["pt", "+POINT"]].map(function (k) {
      return h("button", { class: "choice k-" + k[0], type: "button", "data-v": k[0], "aria-pressed": "false", onclick: function () { f.kind = k[0]; sync(); } }, k[1]);
    });
    var ticketBtns = cfg.tickets.map(function (t) {
      return h("button", { class: "choice k-ticket", type: "button", "data-v": t, "aria-pressed": "false", onclick: function () { f.item = t; sync(); } }, t);
    });
    var count = h("input", { class: "inp mono", id: "ticketCount", type: "text", inputmode: "numeric", value: existing && existing.kind === "ticket" ? String(existing.amount) : "1", "aria-label": "枚数" });
    function step(d) { var v = parseInt(count.value, 10) || 0; count.value = String(Math.max(1, v + d)); }
    var ticketBox = h("div", { class: "field" },
      h("div", { class: "lab" }, "チケットの種類", h("span", { class: "req", text: "必須" })),
      h("div", { class: "choices" }, ticketBtns),
      h("div", { class: "lab", style: "margin-top:6px" }, "枚数"),
      h("div", { class: "stepper" }, h("button", { type: "button", "aria-label": "1枚減らす", onclick: function () { step(-1); } }, "−"), count, h("button", { type: "button", "aria-label": "1枚増やす", onclick: function () { step(1); } }, "＋"), h("span", { class: "unit", text: "枚" })));

    var amount = h("input", { class: "inp mono", id: "amount", type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "例：15000", value: existing && existing.kind !== "ticket" ? String(existing.amount) : "" });
    var amountUnit = h("span", { class: "unit" });
    var amountLab = h("div", { class: "lab" });
    var amountBox = h("div", { class: "field" }, amountLab, h("div", { class: "amountrow" }, amount, amountUnit),
      h("div", { class: "quick" }, [5000, 10000, 15000, 30000, 50000].map(function (v) { return h("button", { type: "button", onclick: function () { amount.value = String(v); } }, fmtNum(v)); })));

    var gidLab = h("div", { class: "lab" });

    var reasonBtns = cfg.reasons.map(function (t) { return h("button", { class: "choice", type: "button", "data-v": t, "aria-pressed": "false", onclick: function () { f.reason = t; sync(); } }, t); });
    var note = h("input", { class: "inp", id: "note", type: "text", autocomplete: "off", placeholder: "補足があれば", value: existing ? existing.note || "" : "" });
    var editorBtns = editing ? S.staff.map(function (s) {
      return h("button", { class: "choice", type: "button", "data-v": s.name, "aria-pressed": "false", onclick: function () { f.editor = s.name; sync(); } }, s.name);
    }) : [];

    function sync() {
      kindBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === f.kind ? "true" : "false"); });
      ticketBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === f.item ? "true" : "false"); });
      reasonBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === f.reason ? "true" : "false"); });
      editorBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === f.editor ? "true" : "false"); });
      ticketBox.hidden = f.kind !== "ticket";
      amountBox.hidden = !(f.kind === "coin" || f.kind === "pt");
      amountLab.textContent = f.kind === "pt" ? "+POINT の数" : "coin の数";
      amountUnit.textContent = f.kind === "pt" ? "pt" : "coin";
      gidLab.textContent = "";
      var req = f.kind && gidRequired(f.kind, f.item);
      add(gidLab, [editing ? "対象者 / Game ID" : "対象者 / Game ID（同じ内容なら何人でも）", req ? h("span", { class: "req", text: "Game ID 必須" }) : (f.kind ? h("span", { style: "margin-left:4px;font-weight:500", text: "Game ID は任意" }) : null)]);
      targets.querySelectorAll(".unk").forEach(function (el) { el.hidden = !req; });
    }

    var err = h("div", { class: "err", hidden: true });
    var saveBtn = h("button", { class: "btn primary", type: "button" }, editing ? "修正を保存" : "登録する");
    function fail(m) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: "nearest" }); }

    saveBtn.addEventListener("click", function () {
      err.hidden = true;
      var rows = Array.prototype.map.call(targets.querySelectorAll(".trow"), function (r) {
        var ins = r.querySelectorAll("input");
        var u = r.querySelector(".unk input");
        return { target: ins[0].value.trim(), gameId: normId(ins[1].value), gameIdUnknown: !!(u && u.checked) };
      }).filter(function (r) { return r.target || r.gameId; });
      if (!rows.length) return fail("対象者を入れてください");
      if (rows.some(function (r) { return !r.target; })) return fail("名前が空の行があります");
      if (!f.kind) return fail("付与するもの（coin / チケット / +POINT）を選んでください");
      var amt;
      if (f.kind === "ticket") {
        if (!f.item) return fail("チケットの種類を選んでください");
        amt = parseInt(count.value, 10);
        if (!amt || amt < 1) return fail("枚数を入れてください");
      } else {
        amt = parseInt(String(amount.value).replace(/[^0-9]/g, ""), 10);
        if (!amt) return fail(f.kind === "pt" ? "+POINT の数を入れてください" : "coin の数を入れてください");
      }
      if (gidRequired(f.kind, f.item)) {
        var miss = rows.filter(function (r) { return !r.gameId && !r.gameIdUnknown; })[0];
        if (miss) return fail(miss.target + " さんの Game ID を入れてください。分からないときは「Game ID が分からない」にチェックを入れてください");
      }
      if (!f.reason) return fail("未付与の理由を選んでください");
      if (editing && !f.editor) return fail("修正した人を選んでください");
      // reqId：この画面で1回だけ作る番号。電波が悪くて送り直しても、同じ登録が2件にならない
      var p = { store: S.store, reqId: reqId, createdBy: S.me, kind: f.kind, item: f.kind === "ticket" ? f.item : "", amount: amt, reason: f.reason, note: note.value.trim() };
      saveBtn.disabled = true;
      var pr;
      if (editing) { p.target = rows[0].target; p.gameId = rows[0].gameId; p.gameIdUnknown = rows[0].gameIdUnknown; pr = call("updateEntry", existing.id, p, f.editor); }
      else { p.targets = rows; pr = call("addEntries", p); }
      pr.then(function () {
        closeSheet();
        toast(editing ? f.editor + " の修正として記録しました" : rows.length + " 件を未付与として登録しました");
        if (!editing && S.tab !== "pending") { S.tab = "pending"; render(); }
      }, function (er) { saveBtn.disabled = false; fail("保存できませんでした：" + errMsg(er) + "（入力はそのまま残っています。もう一度押せます）"); });
    });
    var reqId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

    openSheet([
      h("h2", { id: "sheetTitle", text: editing ? "記録を修正" : "未付与を登録" }),
      dl,
      h("div", { class: "field" }, h("div", { class: "lab" }, "付与するもの", h("span", { class: "req", text: "必須" })), h("div", { class: "choices kinds" }, kindBtns)),
      ticketBox, amountBox,
      h("div", { class: "field" }, gidLab, targets,
        editing ? null : h("button", { class: "addrow", type: "button", onclick: function () { addRow("", "").focus(); } }, "＋ 対象者を追加")),
      h("div", { class: "field" }, h("div", { class: "lab" }, "未付与の理由", h("span", { class: "req", text: "必須" })), h("div", { class: "choices" }, reasonBtns)),
      h("div", { class: "field" }, h("label", { class: "lab", for: "note", text: "備考" }), note),
      editing ? h("div", { class: "field" }, h("div", { class: "lab" }, "修正した人", h("span", { class: "req", text: "必須" })), h("div", { class: "choices" }, editorBtns)) : null,
      err,
      h("div", { class: "foot" },
        editing ? null : h("span", { class: "meta", text: "入力者：" + S.me }),
        h("span", { class: "spacer" }),
        h("button", { class: "btn ghost", type: "button", onclick: requestClose }, "やめる"), saveBtn)
    ]);
    sync();
  }

  // ---- 店舗を選ぶ ----
  function openStorePicker() {
    var first = !S.store;
    openSheet([
      h("h2", { id: "sheetTitle", text: first ? "どの店舗で使いますか？" : "店舗を切り替える" }),
      h("p", { class: "lead", text: "この端末で覚えます。あとから上の店名を押すと切り替えられます。" }),
      h("div", { class: "people" }, STORES.map(function (st) {
        return h("button", { class: "choice", type: "button", "aria-pressed": st === S.store ? "true" : "false", onclick: function () { closeSheet(); switchStore(st); } }, st);
      })),
      first ? null : h("div", { class: "foot" }, h("button", { class: "btn ghost", type: "button", onclick: closeSheet }, "やめる"))
    ], { locked: first });
  }
  function switchStore(st) {
    S.store = st; lsSet("coinlist.store", st);
    S.me = lsGet(meKey()); S.pin = ""; S.kind = ""; S.item = ""; S.openHist = {};
    S.entries = []; S.staff = []; S.loaded = false; S.error = "";
    showCache();
    render();
    refresh();
  }
  document.getElementById("storeBtn").addEventListener("click", openStorePicker);

  // ---- 設定（暗証番号の確認） ----
  function openStaff() {
    // 開くたびに暗証番号を聞く（入れた人が離れたあとに他の人が開けないように）
    if (S.config && S.config.pinSet) { S.pin = ""; openPin(); return; }
    openSettings();
  }
  function openPin() {
    var inp = h("input", { class: "inp pin-inp", id: "pinInput", type: "password", inputmode: "numeric", autocomplete: "off", maxlength: "8", "aria-label": "暗証番号" });
    var err = h("div", { class: "err", hidden: true });
    var ok = h("button", { class: "btn primary", type: "button" }, "開く");
    function go() {
      var v = inp.value.trim();
      if (!v) { err.textContent = "暗証番号を入れてください"; err.hidden = false; return; }
      ok.disabled = true;
      api("verifyPin", S.store, v).then(function () { S.pin = v; closeSheet(); openSettings(); },
        function (e) { ok.disabled = false; err.textContent = errMsg(e); err.hidden = false; inp.value = ""; inp.focus(); });
    }
    ok.addEventListener("click", go);
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); go(); } });
    openSheet([
      h("h2", { id: "sheetTitle", text: S.store + "の設定" }),
      h("p", { class: "lead", text: "設定を変えるには暗証番号が必要です。" }),
      inp, err,
      h("div", { class: "foot" }, h("button", { class: "btn ghost", type: "button", onclick: closeSheet }, "やめる"), ok)
    ]);
    setTimeout(function () { inp.focus(); }, 60);
  }

  // ---- 設定（スタッフ・チケット・暗証番号） ----
  function openSettings() {
    var rows = S.staff.map(function (s) { return { name: s.name, grantor: s.grantor }; });
    var box = h("div", { class: "staff-list" });
    var err = h("div", { class: "err", hidden: true });
    function draw() {
      box.textContent = "";
      if (!rows.length) box.appendChild(h("div", { class: "meta", text: "まだ誰もいません。下から追加してください。" }));
      rows.forEach(function (r, i) {
        var inp = h("input", { class: "inp", id: "sn" + i, type: "text", value: r.name, autocomplete: "off", "aria-label": "名前" });
        inp.addEventListener("input", function () { r.name = inp.value; });
        var cb = h("input", { type: "checkbox", id: "sg" + i });
        cb.checked = !!r.grantor;
        cb.addEventListener("change", function () { r.grantor = cb.checked; });
        box.appendChild(h("div", { class: "staff-row" }, inp,
          h("label", { class: "toggle", for: "sg" + i }, cb, "付与担当"),
          h("button", { class: "x btn ghost", type: "button", "aria-label": "削除", style: "padding:6px", onclick: function () { rows.splice(i, 1); draw(); } }, "×")));
      });
    }
    draw();
    var newName = h("input", { class: "inp", id: "newStaff", type: "text", placeholder: "名前を入力して追加", autocomplete: "off" });
    function addStaff() { var v = newName.value.trim(); if (!v) return; rows.push({ name: v, grantor: false }); newName.value = ""; draw(); newName.focus(); }
    newName.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); addStaff(); } });

    // チケットの種類
    var trows = (S.config ? S.config.tickets : []).map(function (n) { return { name: n, gameIdRequired: S.config.gameIdRequiredTickets.indexOf(n) >= 0 }; });
    var tbox = h("div", { class: "staff-list" });
    function drawT() {
      tbox.textContent = "";
      trows.forEach(function (r, i) {
        var inp = h("input", { class: "inp", id: "tk" + i, type: "text", value: r.name, autocomplete: "off", "aria-label": "チケット名" });
        inp.addEventListener("input", function () { r.name = inp.value; });
        var cb = h("input", { type: "checkbox", id: "tr" + i });
        cb.checked = !!r.gameIdRequired;
        cb.addEventListener("change", function () { r.gameIdRequired = cb.checked; });
        tbox.appendChild(h("div", { class: "staff-row" }, inp,
          h("label", { class: "toggle", for: "tr" + i }, cb, "ID必須"),
          h("button", { class: "x btn ghost", type: "button", "aria-label": "削除", style: "padding:6px", onclick: function () { trows.splice(i, 1); drawT(); } }, "×")));
      });
    }
    drawT();
    var newTicket = h("input", { class: "inp", id: "newTicket", type: "text", placeholder: "新しいチケット名", autocomplete: "off" });
    function addTicket() { var v = newTicket.value.trim(); if (!v) return; trows.push({ name: v, gameIdRequired: false }); newTicket.value = ""; drawT(); newTicket.focus(); }
    newTicket.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); addTicket(); } });

    // 暗証番号（まだ決まっていなければ必須、決まっていれば変更したいときだけ）
    var pinSet = !!(S.config && S.config.pinSet);
    var newPin = h("input", { class: "inp pin-inp", id: "newPin", type: "password", inputmode: "numeric", autocomplete: "new-password", maxlength: "8", placeholder: pinSet ? "変えるときだけ" : "4〜8桁", "aria-label": "新しい暗証番号" });
    var newPin2 = h("input", { class: "inp pin-inp", id: "newPin2", type: "password", inputmode: "numeric", autocomplete: "new-password", maxlength: "8", placeholder: "もう一度", "aria-label": "新しい暗証番号（確認）" });

    openSheet([
      h("h2", { id: "sheetTitle", text: S.store + "の設定" }),
      h("div", { class: "field" },
        h("div", { class: "lab", text: "スタッフ" }),
        h("p", { class: "lead", style: "margin:0", text: "入力者として選べる名前です。「付与担当」を付けた人だけが「付与した」を押せます。" }),
        box,
        h("div", { class: "amountrow" }, newName, h("button", { class: "btn", type: "button", onclick: addStaff }, "追加"))),
      h("div", { class: "field" },
        h("div", { class: "lab", text: "チケットの種類" }),
        h("p", { class: "lead", style: "margin:0", text: "登録画面に出るチケットです。「ID必須」を付けると Game ID なしでは登録できません。消しても過去の記録は残ります。" }),
        tbox,
        h("div", { class: "amountrow" }, newTicket, h("button", { class: "btn", type: "button", onclick: addTicket }, "追加"))),
      h("div", { class: "field" },
        h("div", { class: "lab" }, pinSet ? "暗証番号を変える" : "この店舗の暗証番号を決める", pinSet ? null : h("span", { class: "req", text: "必須" })),
        h("p", { class: "lead", style: "margin:0", text: pinSet ? "変えないときは空のままにしてください。" : "設定を開くときに使います。4〜8桁の数字で、店舗ごとに別です。" }),
        newPin, newPin2),
      err,
      h("div", { class: "foot" }, h("button", { class: "btn ghost", type: "button", onclick: requestClose }, "やめる"),
        h("button", { class: "btn primary", type: "button", onclick: function () {
          err.hidden = true;
          if (newName.value.trim()) addStaff();
          if (newTicket.value.trim()) addTicket();
          var clean = rows.map(function (r) { return { name: r.name.trim(), grantor: !!r.grantor }; }).filter(function (r) { return r.name; });
          var tclean = trows.map(function (r) { return { name: r.name.trim(), gameIdRequired: !!r.gameIdRequired }; }).filter(function (r) { return r.name; });
          var np = newPin.value.trim(), np2 = newPin2.value.trim();
          function bad(m) { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: "nearest" }); }
          if (!tclean.length) return bad("チケットの種類を1つ以上残してください");
          if (!pinSet && !np) return bad("この店舗の暗証番号を決めてください");
          if (np && !/^[0-9]{4,8}$/.test(np)) return bad("暗証番号は4〜8桁の数字にしてください");
          if (np && np !== np2) return bad("暗証番号が2回とも同じになるように入れてください");
          call("saveSettings", S.store, S.pin, clean, tclean, np).then(function () {
            if (np) S.pin = np;
            closeSheet(); toast("設定を保存しました");
          }, function (er) {
            if (/暗証番号が違います/.test(errMsg(er))) S.pin = "";
            bad("保存できませんでした：" + errMsg(er));
          });
        } }, "保存"))
    ]);
  }
  document.getElementById("staffBtn").addEventListener("click", openStaff);

  // ================================================================ wiring
  // ---- はじめの画面（未付与を見る／未付与を登録する） ----
  function renderHome(pending) {
    document.body.dataset.view = S.view;
    var hc = document.getElementById("homeCount");
    if (!S.loaded) { hc.textContent = S.error ? "読み込めませんでした" : "読み込み中…"; return; }
    if (!pending.length) { hc.textContent = "今は未付与はありません"; return; }
    var late = pending.filter(function (e) { return ageDays(e.createdAt) >= 7; }).length;
    hc.textContent = "";
    add(hc, ["今 ", h("b", { text: String(pending.length) }), " 件", late ? "（7日以上：" + late + " 件）" : ""]);
  }
  function setView(v, fromHistory) {
    if (S.view === v) return;
    S.view = v;
    if (v === "list") { S.tab = "pending"; S.q = ""; S.kind = ""; S.item = ""; document.getElementById("search").value = ""; pushExtra(); }
    else if (!fromHistory && overlay.hidden) dropExtra();
    render(); window.scrollTo(0, 0);
  }
  // ---- スマホの「戻る」（Android の戻るボタン・iPhone のスワイプ） ----
  // はじめの画面を土台にして、一覧や入力画面を開いている間だけ履歴を1つ積む。
  // 入力画面で戻ると、いきなり消さずに「消して閉じますか？」を出す（書きかけでなければそのまま閉じる）。
  var ignorePop = false;
  function hasExtra() { return !!(history.state && history.state.app); }
  function pushExtra() { if (!hasExtra()) { try { history.pushState({ app: 1 }, ""); } catch (e) {} } }
  function dropExtra() { if (hasExtra()) { ignorePop = true; history.back(); } }
  try { if (hasExtra()) history.replaceState(null, ""); } catch (e) {}
  window.addEventListener("popstate", function () {
    if (ignorePop) { ignorePop = false; if (!overlay.hidden || S.view === "list") pushExtra(); return; }
    if (!overlay.hidden) { requestClose(); if (!overlay.hidden || S.view === "list") pushExtra(); return; }
    if (S.view === "list") setView("home", true);
  });
  document.getElementById("goList").addEventListener("click", function () { setView("list"); });
  document.getElementById("goAdd").addEventListener("click", function () { if (!S.staff.length) openStaff(); else openForm(null); });
  document.getElementById("backBtn").addEventListener("click", function () { setView("home"); });

  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () { S.tab = b.dataset.tab; render(); window.scrollTo(0, 0); });
  });
  document.getElementById("search").addEventListener("input", function (ev) { S.q = ev.target.value; render(); });

  function refresh() {
    if (!S.store) return Promise.resolve();
    var st = S.store;
    return api("getData", st).then(function (d) { if (st === S.store) applyData(d); },
      function (e) { if (st === S.store) { S.error = errMsg(e); render(); } });
  }
  // 前回の一覧を先に見せる（新しい内容が届いたら入れ替える）
  function showCache() {
    var raw = lsGet(cacheKey());
    if (!DEMO && raw.indexOf("\"例）") >= 0) return; // お試し版の例が紛れ込んでいたら使わない
    if (!raw) return;
    try { var d = JSON.parse(raw); S.stale = true; applyData(d, true); } catch (e) {}
  }
  if (S.store) { showCache(); render(); refresh(); }
  else openStorePicker();
  // 30秒ごとに最新の内容を取得（画面を開いていて、入力中でないとき）
  setInterval(function () { if (document.visibilityState === "visible" && overlay.hidden && busyEl.hidden) refresh(); }, 30000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && overlay.hidden) refresh(); });
})();
