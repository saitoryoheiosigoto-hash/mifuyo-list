// お試し版（try.html）専用：Google に保存せず、例の記録でこの端末の中だけで動かす
window.Mock = (function () {
    var REASONS = ["残高不足", "忙しくて後回し", "システムの不具合", "その他"];
    function load(k, d) { try { var v = localStorage.getItem("demo." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
    function save(k, v) { try { localStorage.setItem("demo." + k, JSON.stringify(v)); } catch (e) {} }
    var tickets = load("tickets", [
      { name: "スペイディ", gameIdRequired: true }, { name: "JOPT", gameIdRequired: true }, { name: "WPT", gameIdRequired: false },
      { name: "戦国", gameIdRequired: true }, { name: "マスターズ", gameIdRequired: false }, { name: "JGfree", gameIdRequired: true }]);
    var pin = load("pin", "");
    function cfg() {
      return { stores: ["上野", "渋谷", "札幌"], pinSet: !!pin, tickets: tickets.map(function (t) { return t.name; }),
        gameIdRequiredTickets: tickets.filter(function (t) { return t.gameIdRequired; }).map(function (t) { return t.name; }),
        reasons: REASONS };
    }
    function daysAgo(n, h) { var d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 10, 0, 0); return d.toISOString(); }
    var staff = load("staff", null);
    var entries = load("entries", null);
    var SEED_VERSION = 4;
    if (!staff || !entries || load("version", 0) !== SEED_VERSION) seed();

    // お試し用の例（いろいろなパターン）
    function seed() {
      staff = [{ name: "スタッフA", grantor: true }, { name: "スタッフB", grantor: true }, { name: "スタッフC", grantor: false }, { name: "スタッフD", grantor: false }];
      tickets = [
        { name: "スペイディ", gameIdRequired: true }, { name: "JOPT", gameIdRequired: true }, { name: "WPT", gameIdRequired: false },
        { name: "戦国", gameIdRequired: true }, { name: "マスターズ", gameIdRequired: false }, { name: "JGfree", gameIdRequired: true }];
      var E = [];
      function add(name, gid, kind, item, amt, reason, note, d, hr, by) { var e = ex("例）" + name, gid, kind, item, amt, reason, note, daysAgo(d, hr), by); E.push(e); return e; }
      function hist(e, d, hr, by, action, changes) { var at = daysAgo(d, hr); e.history.push({ at: at, by: by, action: action, changes: changes }); e.updatedAt = at; e.updatedBy = by; return at; }
      function granted(e, d, hr, by) { e.status = "付与済み"; e.grantedAt = hist(e, d, hr, by, "付与"); e.grantedBy = by; }
      function canceled(e, d, hr, by, r) { e.status = "取消"; e.canceledAt = hist(e, d, hr, by, "取消", ["理由：" + r]); e.canceledBy = by; e.cancelReason = r; }

      // ---- 未付与：今日〜2日（白） ----
      add("タロウ", "12345678", "ticket", "スペイディ", 2, "忙しくて後回し", "", 0, 21, "スタッフC");
      add("ハナコ", "23456789", "ticket", "スペイディ", 2, "忙しくて後回し", "", 0, 21, "スタッフC");
      add("ケンジ", "34567890", "coin", "", 15000, "残高不足", "", 0, 20, "スタッフA");
      add("とても長いニックネームのお客さんサンプル", "13572468", "coin", "", 5000, "残高不足", "名前が長い例", 0, 19, "スタッフD");
      add("ユウキ", "45678901", "pt", "", 12800, "システムの不具合", "反映されなかった分", 1, 22, "スタッフB");
      add("ミサキ", "56789012", "ticket", "JOPT", 1, "忙しくて後回し", "", 1, 20, "スタッフC");
      add("タロウ", "12345678", "ticket", "戦国", 1, "忙しくて後回し", "", 2, 23, "スタッフD");
      add("ソウタ", "", "ticket", "WPT", 3, "その他", "本人が来店したら渡す", 2, 19, "スタッフA");
      // ---- 未付与：3〜6日（黄色） ----
      add("リナ", "67890123", "coin", "", 33600, "残高不足", "", 3, 21, "スタッフB");
      add("カナタ", "", "coin", "", 20000, "残高不足", "初来店でIDを聞きそびれた", 3, 22, "スタッフD");
      add("ヒロ", "", "ticket", "JOPT", 1, "忙しくて後回し", "", 0, 22, "スタッフC");
      add("ダイチ", "78901234", "ticket", "JGfree", 2, "システムの不具合", "", 3, 20, "スタッフC");
      add("ハルカ", "", "ticket", "マスターズ", 1, "忙しくて後回し", "", 4, 22, "スタッフD");
      var shou = add("ショウ", "89012345", "coin", "", 99900, "残高不足", "", 4, 18, "スタッフC");
      hist(shou, 3, 12, "スタッフA", "修正", ["数量：9990 → 99900"]);
      add("アヤ", "90123456", "pt", "", 5000, "システムの不具合", "", 5, 21, "スタッフB");
      add("ハナコ", "23456789", "ticket", "JOPT", 2, "忙しくて後回し", "", 6, 20, "スタッフA");
      // ---- 未付与：7日以上（赤） ----
      add("コウキ", "11223344", "coin", "", 12150, "残高不足", "残高の補充待ち", 7, 21, "スタッフA");
      add("メイ", "22334455", "ticket", "スペイディ", 2, "忙しくて後回し", "", 8, 22, "スタッフC");
      add("ユウト", "33445566", "ticket", "JOPT", 2, "その他", "大会中に付与できなかった", 9, 23, "スタッフD");
      var sakura = add("サクラ", "44556677", "coin", "", 27390, "残高不足", "", 12, 20, "スタッフB");
      hist(sakura, 11, 15, "スタッフA", "修正", ["Game ID：44556670 → 44556677"]);
      hist(sakura, 10, 16, "スタッフB", "修正", ["備考：（なし） → 本人に連絡済み"]);
      sakura.note = "本人に連絡済み";
      var ken = add("ケンジ", "34567890", "pt", "", 3000, "システムの不具合", "", 15, 19, "スタッフC");
      hist(ken, 13, 20, "スタッフA", "付与"); hist(ken, 13, 21, "スタッフA", "未付与に戻す");

      // ---- 付与済み ----
      granted(add("タロウ", "12345678", "ticket", "スペイディ", 2, "忙しくて後回し", "", 10, 21, "スタッフC"), 8, 20, "スタッフA");
      granted(add("ハナコ", "23456789", "coin", "", 16000, "残高不足", "", 6, 20, "スタッフD"), 5, 21, "スタッフB");
      granted(add("ミサキ", "56789012", "ticket", "WPT", 1, "忙しくて後回し", "", 2, 22, "スタッフC"), 0, 18, "スタッフA");
      granted(add("ユウキ", "45678901", "ticket", "戦国", 1, "システムの不具合", "", 4, 21, "スタッフB"), 1, 20, "スタッフB");
      granted(add("コウキ", "11223344", "pt", "", 8000, "システムの不具合", "", 40, 20, "スタッフA"), 35, 19, "スタッフA");

      // ---- 取消 ----
      canceled(add("リナ", "67890123", "coin", "", 10000, "残高不足", "", 5, 20, "スタッフC"), 5, 21, "スタッフA", "二重に登録した");
      canceled(add("ソウタ", "", "ticket", "JOPT", 1, "忙しくて後回し", "", 3, 22, "スタッフD"), 2, 18, "スタッフB", "書き間違い");

      entries = E;
      save("staff", staff); save("tickets", tickets); save("entries", entries); save("version", SEED_VERSION);
    }
    function ex(target, gid, kind, item, amount, reason, note, at, by) {
      return { id: uid(), status: "未付与", createdAt: at, createdBy: by, target: target, gameId: gid, kind: kind, item: item, amount: amount,
        reason: reason, note: note, grantedAt: null, grantedBy: null, canceledAt: null, canceledBy: null, cancelReason: null, updatedAt: at,
        updatedBy: by, history: [{ at: at, by: by, action: "登録" }] };
    }
    function log(e, by, action, changes) {
      var at = new Date().toISOString();
      e.history = (e.history || []).concat([{ at: at, by: by, action: action, changes: changes }]);
      e.updatedAt = at; e.updatedBy = by;
    }
    var LABELS = { target: "対象者", gameId: "Game ID", kind: "種類", item: "チケット", amount: "数量", reason: "未付与の理由", note: "備考" };
    var KIND_NAMES = { coin: "coin", ticket: "チケット", pt: "+POINT" };
    function show(k, v) { if (v == null) return ""; if (k === "kind") return KIND_NAMES[v] || String(v); return String(v); }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function data() {
      var cut = new Date(); cut.setMonth(cut.getMonth() - 3);
      entries = entries.filter(function (e) { return !(e.status === "付与済み" && e.grantedAt && new Date(e.grantedAt) < cut); });
      save("entries", entries); save("staff", staff); save("tickets", tickets); return { entries: JSON.parse(JSON.stringify(entries)), staff: JSON.parse(JSON.stringify(staff)), config: cfg(), serverTime: new Date().toISOString() }; }
    function find(id) { var e = entries.filter(function (x) { return x.id === id; })[0]; if (!e) throw new Error("記録が見つかりません"); return e; }
    function isStaff(n) { return staff.some(function (s) { return s.name === n; }); }
    function isGrantor(n) { return staff.some(function (s) { return s.name === n && s.grantor; }); }
    return {
      getData: data,
      addEntries: function (p) {
        if (!isStaff(p.createdBy)) throw new Error("あなたの名前を選んでください");
        var now = Date.now();
        p.targets.forEach(function (t, i) {
          entries.push({ id: uid(), status: "未付与", createdAt: new Date(now + i).toISOString(), createdBy: p.createdBy, target: t.target, gameId: t.gameId,
            kind: p.kind, item: p.item || "", amount: Number(p.amount), reason: p.reason || "", note: p.note || "",
            grantedAt: null, grantedBy: null, canceledAt: null, canceledBy: null, cancelReason: null, updatedAt: new Date().toISOString(),
            updatedBy: p.createdBy, history: [{ at: new Date().toISOString(), by: p.createdBy, action: "登録" }] });
        });
        return data();
      },
      updateEntry: function (id, p, by) {
        if (!isStaff(by)) throw new Error("あなたの名前を選んでください");
        var e = find(id), changes = [];
        var next = { target: p.target || "", gameId: p.gameId || "", kind: p.kind, item: p.item || "", amount: Number(p.amount), reason: p.reason || "", note: p.note || "" };
        Object.keys(LABELS).forEach(function (k) { var b = show(k, e[k]), a = show(k, next[k]); if (b !== a) changes.push(LABELS[k] + "：" + (b || "（なし）") + " → " + (a || "（なし）")); });
        if (!changes.length) return data();
        Object.keys(next).forEach(function (k) { e[k] = next[k]; });
        log(e, by, "修正", changes);
        return data();
      },
      grant: function (id, by) { if (!isGrantor(by)) throw new Error(by + " さんは付与担当ではありません"); var e = find(id); if (e.status !== "未付与") throw new Error("この記録はすでに" + e.status + "です"); e.status = "付与済み"; e.grantedAt = new Date().toISOString(); e.grantedBy = by; log(e, by, "付与"); return data(); },
      ungrant: function (id, by) { if (!isGrantor(by)) throw new Error(by + " さんは付与担当ではありません"); var e = find(id); e.status = "未付与"; e.grantedAt = null; e.grantedBy = null; log(e, by, "未付与に戻す"); return data(); },
      cancelEntry: function (id, by, reason) { var e = find(id); e.status = "取消"; e.canceledAt = new Date().toISOString(); e.canceledBy = by; e.cancelReason = reason; log(e, by, "取消", ["理由：" + reason]); return data(); },
      restoreEntry: function (id, by) { var e = find(id); e.status = "未付与"; e.canceledAt = null; e.canceledBy = null; e.cancelReason = null; log(e, by, "取消を戻す"); return data(); },
      verifyPin: function (store, p) { if (!pin) throw new Error("この店舗の暗証番号がまだ決まっていません"); if (p !== pin) throw new Error("暗証番号が違います"); return true; },
      saveSettings: function (store, p, staffList, ticketList, newPin) {
        if (pin && p !== pin) throw new Error("暗証番号が違います");
        if (!pin && !newPin) throw new Error("この店舗の暗証番号を決めてください");
        if (newPin && !/^[0-9]{4,8}$/.test(newPin)) throw new Error("暗証番号は4〜8桁の数字にしてください");
        if (!ticketList.length) throw new Error("チケットの種類を1つ以上残してください");
        staff = staffList; tickets = ticketList; if (newPin) { pin = newPin; save("pin", pin); }
        return data();
      }
    };
  })();

