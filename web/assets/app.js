/* 创新高热点 · 前端（纯静态，读 data/*.json）
   页面：首页 #/ · 日报 #/d/日期 · 月报 #/m/年-月 · 概念 #/c/日期/概念名 */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const app = $("#app");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = () => "?t=" + Math.floor(Date.now() / 60000);
  const cache = {};
  function J(path) {
    if (cache[path]) return cache[path];
    const p = fetch("data/" + path + T()).then(r => { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); });
    cache[path] = p; p.catch(() => delete cache[path]); return p;
  }
  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  let MODE = store.get("nh-mode", "h") === "w" ? "w" : "h";
  const COL = () => (MODE === "h" ? 2 : 3);          // cs 里新高家数所在列
  const DK = () => (MODE === "h" ? 1 : 2);           // days.json 里新高家数所在列
  const TK = () => (MODE === "h" ? 4 : 5);           // days.json 里第一热点所在列
  const MN = m => ((m || MODE) === "h" ? "历史新高" : "250日新高");
  const pct = (x, d = 2) => x == null ? "—" : (x > 0 ? "+" : "") + Number(x).toFixed(d) + "%";
  const cls = x => (x > 0 ? "up" : x < 0 ? "dn" : "flat");
  const wk = d => "周" + "日一二三四五六"[new Date(d + "T12:00:00Z").getUTCDay()];
  const md = d => +d.slice(5, 7) + "月" + +d.slice(8, 10) + "日";
  const ym = m => m.slice(0, 4) + "年" + +m.slice(5, 7) + "月";
  const cap = x => x >= 1000 ? (x / 1000).toFixed(2) + "千亿" : x.toFixed(x >= 100 ? 0 : 1) + "亿";
  const go = h => { location.hash = h; };
  const cLink = (d, n) => "#/c/" + d + "/" + encodeURIComponent(n);

  let IDX = null;
  const dayList = () => IDX.days.map(x => x[0]);

  // ---------------- 路由 ----------------
  async function route() {
    const p = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/");
    try {
      IDX = await J("days.json");
      if (!IDX.latest) { app.innerHTML = '<div class="loading">还没有数据。</div>'; return; }
      let page = "home";
      if (p[0] === "d") { page = "day"; await day(dayList().includes(p[1]) ? p[1] : IDX.latest); }
      else if (p[0] === "m") { page = "month"; await month(IDX.months.includes(p[1]) ? p[1] : IDX.latest.slice(0, 7)); }
      else if (p[0] === "c" && p[1] && p[2]) { page = "day"; await concept(dayList().includes(p[1]) ? p[1] : IDX.latest, p.slice(2).join("/")); }
      else await home();
      $$(".mast-nav a[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === page));
      $$(".mast-nav a[data-nav=day]").forEach(a => a.href = "#/d/" + IDX.latest);
      $$(".mast-nav a[data-nav=month]").forEach(a => a.href = "#/m/" + IDX.latest.slice(0, 7));
    } catch (e) {
      app.innerHTML = '<div class="loading">数据加载失败：' + esc(e.message) + '，<a href="javascript:location.reload()">刷新重试</a></div>';
    }
  }
  addEventListener("hashchange", () => { route(); scrollTo(0, 0); });

  // ---------------- 数据 ----------------
  async function dayData(d) {
    const D = await J("d/" + d + ".json");
    const [V, U] = await Promise.all([J("concepts/" + D.v + ".json"), J("stocks.json")]);
    if (!D.st) { D.st = []; for (let i = 0; i < D.n; i++) if (D.c[i] != null) D.st.push([U.codes[i], U.names[i], D.c[i], D.p[i], D.m[i], D.f[i]]); }
    if (!V._kept) { V._kept = new Set(V.kept); V._id = {}; V.concepts.forEach((n, i) => { V._id[n] = i; }); }
    return { D, V, cs: new Map(D.cs.map(c => [c[0], c])), st: new Map(D.st.map(s => [s[0], s])) };
  }
  const keptOf = (V, code) => (V.map[code] || []).filter(i => V._kept.has(i));
  const nhOf = D => (MODE === "h" ? D.nh : D.nh250);

  // ---------------- 小部件 ----------------
  const modeSeg = () => `<div class="seg" role="group" aria-label="新高口径"><button data-mode="h" class="${MODE === "h" ? "on" : ""}">历史新高</button><button data-mode="w" class="${MODE === "w" ? "on" : ""}">250日新高</button></div>`;
  function bindMode(rerender) { $$("[data-mode]", app).forEach(b => b.onclick = () => { if (MODE === b.dataset.mode) return; MODE = b.dataset.mode; store.set("nh-mode", MODE); rerender(); }); }
  function dateNav(d, mk) {
    const L = dayList(), i = L.indexOf(d);
    const opts = L.slice().reverse().map(x => `<option value="${x}"${x === d ? " selected" : ""}>${x} ${wk(x)}</option>`).join("");
    return `<div class="dnav"><button data-go="${i > 0 ? mk(L[i - 1]) : ""}" ${i > 0 ? "" : "disabled"}>‹ 前一天</button>
      <select aria-label="选择日期" id="dsel">${opts}</select>
      <button data-go="${i < L.length - 1 ? mk(L[i + 1]) : ""}" ${i < L.length - 1 ? "" : "disabled"}>后一天 ›</button></div>`;
  }
  function bindNav(mk) {
    $$("[data-go]", app).forEach(b => b.onclick = () => b.dataset.go && go(b.dataset.go));
    const s = $("#dsel", app); if (s) s.onchange = () => go(mk(s.value));
  }
  function bars(list, h, label, pad = 12) {
    const n = list.length; if (!n) return "";
    const W = 600, max = Math.max(1, ...list.map(x => x.v)), bw = W / n;
    let s = `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">`;
    list.forEach((x, i) => {
      const bh = Math.max(x.v ? 2 : 0, (x.v / max) * (h - pad));
      s += `<rect class="b" data-k="${esc(x.key)}" x="${(i * bw + bw * .14).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw * .72).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${x.on ? "var(--up)" : "var(--bar)"}"><title>${esc(x.label)}</title></rect>`;
    });
    return s + "</svg>";
  }
  // 往期日历：只排周一到周五
  function calendar(m, cur) {
    const rows = IDX.days.filter(x => x[0].startsWith(m));
    if (!rows.length) return '<div class="empty">这个月没有数据</div>';
    const k = DK(), tk = TK(), max = Math.max(1, ...IDX.days.map(x => x[k]));
    const first = new Date(m + "-01T12:00:00Z"), y = first.getUTCFullYear(), mo = first.getUTCMonth();
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const byD = new Map(rows.map(x => [x[0], x]));
    let h = '<div class="cal">' + "一二三四五".split("").map(w => `<div class="ch">周${w}</div>`).join("");
    let started = false;
    for (let dd = 1; dd <= last; dd++) {
      const w = new Date(Date.UTC(y, mo, dd, 12)).getUTCDay();
      if (w === 0 || w === 6) continue;
      if (!started) { h += '<div class="cc x"></div>'.repeat(w - 1); started = true; }
      const ds = m + "-" + String(dd).padStart(2, "0"), r = byD.get(ds);
      if (!r) { h += `<div class="cc x"><span class="cd">${dd}</span><small>${ds > IDX.latest ? "" : "休市"}</small></div>`; continue; }
      const a = Math.min(1, Math.sqrt(r[k] / max));
      h += `<button class="cc${ds === cur ? " cur" : ""}" data-day="${ds}" style="--a:${(a * .55).toFixed(2)}" title="${ds}：${MN()} ${r[k]} 只${r[tk] ? "，第一热点 " + esc(r[tk]) : ""}">
        <span class="cd">${dd}</span><b class="num">${r[k]}</b><small>${esc(r[tk] || "—")}</small></button>`;
    }
    return h + "</div>";
  }
  function bindCal(box) { $$("[data-day]", box).forEach(b => b.onclick = () => go("d/" + b.dataset.day)); }
  const tag = t => t[2] ? '<span class="tag new">新进榜</span>' : t[1] > 1 ? `<span class="tag">连续 ${t[1]} 天</span>` : "";
  function monthStats(M) {
    const k = MODE === "h" ? 1 : 2, v = M.days.map(x => x[k]);
    const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    const mx = M.days.reduce((a, x) => (!a || x[k] > a[k] ? x : a), null);
    return { k, avg, mx };
  }
  const kpiHtml = (s, M) => `
    <div><b class="num">${M.n}</b><span>交易日</span></div>
    <div><b class="num">${s.avg.toFixed(0)}</b><span>日均${MN()}</span></div>
    <div><b class="num">${s.mx ? s.mx[s.k] : 0}</b><span>最多 ${s.mx ? md(s.mx[0]) : ""}</span></div>
    <div><b class="num ${cls(M.sh)}">${pct(M.sh)}</b><span>上证本月</span></div>
    <div><b class="num ${cls(M.cy)}">${pct(M.cy)}</b><span>创业板本月</span></div>`;

  // ---------------- 首页 ----------------
  let homeMonth = null;
  async function home() {
    const d = IDX.latest, { D, V, cs } = await dayData(d);
    const col = COL(), names = V.concepts, mk = D.mkt, nh = nhOf(D);
    const top = D.top[MODE] || [], t1 = top[0] && cs.get(top[0][0]);
    const g1 = D.gain[0] != null ? cs.get(D.gain[0]) : null;
    const sh = D.idx.sh000001 || [], cy = D.idx.sz399006 || [];
    const head = t1 ? `${MN()} ${nh.length} 只，${esc(names[top[0][0]])}领跑` : `今天没有个股创${MN()}`;
    const dek = [t1 ? `${esc(names[top[0][0]])}有 ${t1[col]} 只成分股创新高，加权 ${pct(t1[4])}` : "",
      g1 ? `涨幅最大的概念是${esc(names[D.gain[0]])}（${pct(g1[4])}）` : "", `全市场涨停 ${mk.lu} 家`].filter(Boolean).join("；") + "。";
    const L60 = IDX.days.slice(-60), k = DK();
    const avg20 = IDX.days.slice(-20).reduce((a, x) => a + x[k], 0) / Math.min(20, IDX.days.length);
    const prev = IDX.days.length > 1 ? IDX.days[IDX.days.length - 2][k] : null;
    const mini = (rows, f) => `<ol class="mini">${rows.map(f).join("")}</ol>`;
    const topRows = mini(top, (t, i) => { const c = cs.get(t[0]); return `<li><a href="${cLink(d, names[t[0]])}"><span class="rk">${i + 1}</span><span class="nm">${esc(names[t[0]])}${tag(t)}</span><span class="v"><b class="num">${c[col]}</b> 只</span><span class="w num ${cls(c[4])}">${pct(c[4])}</span></a></li>`; });
    const gainRows = mini(D.gain, (id, i) => { const c = cs.get(id); return `<li><a href="${cLink(d, names[id])}"><span class="rk">${i + 1}</span><span class="nm">${esc(names[id])}<span class="sub">上涨 ${c[5]}/${c[1]}</span></span><span class="v">新高 ${c[col]}</span><span class="w num ${cls(c[4])}">${pct(c[4])}</span></a></li>`; });
    const hot = (D.hot[MODE] || []).slice(0, 5);
    const hotRows = mini(hot, (x, i) => { const c = x[0] >= 0 ? cs.get(x[0]) : null; return `<li><a href="${cLink(d, x[1])}"><span class="rk">${i + 1}</span><span class="nm">${esc(x[1])}</span><span class="v"><b class="num">${x[2]}</b> 次</span><span class="w num">今日 ${c ? c[col] : 0}</span></a></li>`; });
    homeMonth = homeMonth && IDX.months.includes(homeMonth) ? homeMonth : d.slice(0, 7);
    app.innerHTML = `
      <section class="hero">
        <div class="hero-l">
          <div class="eyebrow"><span class="dot"></span>最新 · ${md(d)} ${wk(d)}${D.gen ? '<span class="badge gen">回补数据</span>' : ""}</div>
          <h1>${head}</h1>
          <p class="dek">${dek}</p>
          <div class="hero-act"><a class="btn" href="#/d/${d}">看当日完整日报 ›</a>${modeSeg()}</div>
        </div>
        <div class="hero-r">
          <div class="bignum"><span class="k">今日${MN()}</span><span class="num">${nh.length}</span><span class="s">${prev != null ? `昨日 ${prev} · ` : ""}近 20 日均 ${avg20.toFixed(0)}</span></div>
          <div class="hero-kv">
            <div><b class="num up">${mk.lu}</b><span>涨停</span></div>
            <div><b class="num"><span class="up">${mk.up}</span>/<span class="dn">${mk.down}</span></b><span>涨 / 跌</span></div>
            <div><b class="num ${cls(sh[1])}">${pct(sh[1])}</b><span>上证</span></div>
            <div><b class="num ${cls(cy[1])}">${pct(cy[1])}</b><span>创业板</span></div>
          </div>
        </div>
      </section>

      <div class="grid3">
        <section class="card"><div class="sec-h"><h2>新高热点 前 5</h2><a class="more-l" href="#/d/${d}">日报 ›</a></div>${top.length ? topRows : '<div class="empty">今天没有</div>'}</section>
        <section class="card"><div class="sec-h"><h2>涨幅最大 前 5</h2><a class="more-l" href="#/d/${d}">日报 ›</a></div>${gainRows}</section>
        <section class="card"><div class="sec-h"><h2>近 5 日热度</h2><span class="sec-note">累计新高次数</span></div>${hot.length ? hotRows : '<div class="empty">暂无</div>'}</section>
      </div>

      <section class="card"><div class="sec-h"><h2>新高家数走势</h2><span class="sec-note">近 ${L60.length} 个交易日 · ${MN()} · 点柱子看那一天</span></div>
        <div class="trend">${bars(L60.map(x => ({ v: x[k], key: x[0], on: x[0] === d, label: x[0] + "：" + x[k] + " 只" + (x[TK()] ? "，第一热点 " + x[TK()] : "") })), 140, "近60个交易日新高家数")}</div>
        <div class="axis num"><span>${md(L60[0][0])}</span><span>${md(L60[Math.floor(L60.length / 2)][0])}</span><span>${md(d)}</span></div></section>

      <section class="card" id="msnap"><div class="loading">本月概况加载中…</div></section>

      <section class="card" id="archive"><div class="sec-h"><h2>往期</h2><span class="sec-note">颜色越深新高越多 · 小字 = 当天第一热点 · 点格子看日报</span></div>
        <div class="mtabs" role="tablist">${IDX.months.slice().reverse().map(m => `<button role="tab" data-mt="${m}" class="${m === homeMonth ? "on" : ""}">${ym(m)}</button>`).join("")}</div>
        <div id="calbox">${calendar(homeMonth, d)}</div>
        <div class="axis"><span></span><a class="more-l" id="mrep" href="#/m/${homeMonth}">看${ym(homeMonth)}月报 ›</a></div></section>`;
    bindMode(home);
    $$(".trend .b", app).forEach(b => b.onclick = () => go("d/" + b.dataset.k));
    bindCal($("#calbox"));
    $$("[data-mt]", app).forEach(b => b.onclick = () => {
      homeMonth = b.dataset.mt; $$("[data-mt]", app).forEach(x => x.classList.toggle("on", x === b));
      $("#calbox").innerHTML = calendar(homeMonth, d); bindCal($("#calbox"));
      const a = $("#mrep"); a.href = "#/m/" + homeMonth; a.textContent = "看" + ym(homeMonth) + "月报 ›";
    });
    const m = d.slice(0, 7), M = await J("m/" + m + ".json"), box = $("#msnap");
    if (!box) return;
    const ms = monthStats(M);
    box.innerHTML = `<div class="sec-h"><h2>${ym(m)}概况</h2><a class="more-l" href="#/m/${m}">看月报 ›</a></div>
      <div class="kpis">${kpiHtml(ms, M)}</div>
      <div class="mh3">${(M.hot[MODE] || []).slice(0, 3).map((x, i) => `<a class="mh" href="${cLink(d, x[0])}"><span class="rk">本月热点 ${i + 1}</span><b>${esc(x[0])}</b><span>上榜 ${x[1]} 天 · 新高 ${x[2]} 次 · <span class="${cls(x[3])}">${pct(x[3], 1)}</span></span></a>`).join("")}</div>`;
  }

  // ---------------- 日报 ----------------
  async function day(d) {
    const { D, V, cs, st } = await dayData(d);
    const col = COL(), names = V.concepts, mk = D.mkt, nh = nhOf(D);
    const other = MODE === "h" ? mk.nh250 : mk.nh, sh = D.idx.sh000001 || [], cy = D.idx.sz399006 || [];
    const card = (t, k) => {
      const c = cs.get(t[0]); if (!c) return "";
      const n = c[col], inC = nh.filter(x => (V.map[x[0]] || []).includes(t[0])).map(x => st.get(x[0])).filter(Boolean).sort((a, b) => b[3] - a[3]);
      return `<a class="tc" href="${cLink(d, names[t[0]])}"><span class="rk">TOP ${k + 1}</span><span class="nm">${esc(names[t[0]])}</span>
        <span class="n">${n}<small> 只 · 占 ${Math.round(n / c[1] * 100)}%</small></span>
        <span class="w ${cls(c[4])}">加权 ${pct(c[4])}</span>${tag(t) || '<span class="tag">今日上榜</span>'}
        <span class="stk">${inC.slice(0, 4).map(s => esc(s[1])).join("、")}${inC.length > 4 ? " 等" : ""}</span></a>`;
    };
    const gmax = Math.max(1, ...D.gain.concat(D.lose).map(i => Math.abs(cs.get(i)[4])));
    const glRows = (ids, dn) => ids.map((i, k) => { const c = cs.get(i); return `<a class="row" href="${cLink(d, names[i])}"><span class="rk">${k + 1}</span><span><span class="nm">${esc(names[i])}</span> <span class="sub">成分 ${c[1]} · 上涨 ${c[5]} · 新高 ${c[col]}</span><div class="bar"><i class="${dn ? "d" : ""}" style="width:${(Math.abs(c[4]) / gmax * 100).toFixed(0)}%"></i></div></span><span class="v ${cls(c[4])}">${pct(c[4])}</span></a>`; }).join("");
    const hot = D.hot[MODE] || [], hmax = Math.max(1, ...hot.map(x => x[2]));
    const hotRows = hot.map((x, k) => { const c = x[0] >= 0 ? cs.get(x[0]) : null; return `<a class="row" href="${cLink(d, x[1])}"><span class="rk">${k + 1}</span><span><span class="nm">${esc(x[1])}</span> <span class="sub">今日 ${c ? c[col] : 0} 只</span><div class="bar"><i style="width:${(x[2] / hmax * 100).toFixed(0)}%"></i></div></span><span class="v">${x[2]} 次</span></a>`; }).join("");
    const mkD = x => "d/" + x;
    app.innerHTML = `
      <nav class="crumb"><a href="#/">首页</a><span>›</span><a href="#/m/${d.slice(0, 7)}">${ym(d.slice(0, 7))}</a><span>›</span><b>${md(d)}日报</b></nav>
      <div class="toolbar">${dateNav(d, mkD)}${modeSeg()}</div>
      <section class="lead">
        <div>
          <div class="eyebrow">${md(d)} ${wk(d)}${D.gen ? '<span class="badge gen" title="由历史行情回补，概念用首版概念表">回补数据</span>' : ""}<span class="badge">概念表 ${D.v}</span></div>
          <div class="big"><span class="num">${nh.length}</span><span class="u">只个股创${MN()}</span></div>
          <div class="big-sub">${MN(MODE === "h" ? "w" : "h")} ${other} 只 · 全市场 ${mk.n} 只</div>
        </div>
        <div class="kv">
          <div><b class="up">${mk.lu}</b><span>涨停</span></div>
          <div><b><span class="up">${mk.up}</span>/<span class="dn">${mk.down}</span></b><span>上涨 / 下跌</span></div>
          <div><b class="${cls(sh[1])}">${pct(sh[1])}</b><span>上证指数</span></div>
          <div><b class="${cls(cy[1])}">${pct(cy[1])}</b><span>创业板指</span></div>
        </div>
      </section>
      <section class="card"><div class="sec-h"><h2>新高数量前 5 的热点概念</h2><span class="sec-note">${MN()} · 加权 = 按流通市值加权的当日涨跌（估算）</span></div>
        <div class="top5">${(D.top[MODE] || []).map(card).join("") || '<div class="empty">今天没有概念有新高股票</div>'}</div></section>
      <div class="grid2">
        <section class="card"><div class="sec-h"><h2 id="gl-t">当日涨幅前 5 的热点概念</h2><div class="seg" role="group" aria-label="涨幅或跌幅"><button data-gl="g" class="on">涨幅</button><button data-gl="l">跌幅</button></div></div>
          <div class="rows" id="gl">${glRows(D.gain)}</div><p class="sec-note">只算成分股不少于 ${IDX.rules.gain_min} 只的概念</p></section>
        <section class="card"><div class="sec-h"><h2>近 5 日热度榜</h2><span class="sec-note">5 天累计新高次数</span></div>
          <div class="rows">${hotRows || '<div class="empty">暂无</div>'}</div></section>
      </div>
      <section class="card"><div class="sec-h"><h2>当日全部${MN()}股票</h2><span class="sec-note">${nh.length} 只 · 红色概念 = 今日热点前 5</span></div>
        <div class="tools" id="chips"></div><div id="tbl"></div></section>`;
    bindNav(mkD); bindMode(() => day(d));
    $$("[data-gl]", app).forEach(b => b.onclick = () => {
      $$("[data-gl]", app).forEach(x => x.classList.toggle("on", x === b));
      const g = b.dataset.gl === "g"; $("#gl-t").textContent = "当日" + (g ? "涨幅" : "跌幅") + "前 5 的热点概念"; $("#gl").innerHTML = glRows(g ? D.gain : D.lose, !g);
    });
    const topIds = (D.top[MODE] || []).map(t => t[0]);
    const rows = nh.map(x => { const s = st.get(x[0]) || [x[0], "", 0, 0, 0, 0]; return { code: x[0], name: s[1], close: s[2], pct: s[3], cap: s[4], lim: s[5] & 1, over: (x[1] / x[2] - 1) * 100, streak: x[3], cps: keptOf(V, x[0]) }; });
    stockTable($("#tbl"), $("#chips"), rows, V, d, new Set(topIds), topIds);
  }

  // 股票表
  function stockTable(box, chipBox, rows, V, d, hotIds, chipIds) {
    let sortK = "pct", asc = false, filt = null, q = "", limit = 60;
    const names = V.concepts;
    if (chipBox) {
      chipBox.innerHTML = `<button class="chip on" data-f="">全部</button>` + chipIds.map(i => `<button class="chip" data-f="${i}">${esc(names[i])}</button>`).join("") + `<input type="search" placeholder="搜代码 / 名称 / 概念" aria-label="搜索">`;
      $$("[data-f]", chipBox).forEach(b => b.onclick = () => { $$("[data-f]", chipBox).forEach(x => x.classList.toggle("on", x === b)); filt = b.dataset.f === "" ? null : +b.dataset.f; draw(); });
      $("input", chipBox).oninput = e => { q = e.target.value.trim(); draw(); };
    }
    const cols = [["name", "股票"], ["close", "收盘"], ["pct", "涨跌幅"], ["over", "比前高"], ["streak", "连续"], ["cap", "流通市值"], ["cps", "所属热点概念"]];
    function draw() {
      let r = rows;
      if (filt != null) r = r.filter(x => x.cps.includes(filt));
      if (q) r = r.filter(x => x.code.includes(q) || x.name.includes(q) || x.cps.some(i => names[i].includes(q)));
      r = r.slice().sort((a, b) => { const va = a[sortK] == null ? -1e9 : a[sortK], vb = b[sortK] == null ? -1e9 : b[sortK]; return (va < vb ? -1 : va > vb ? 1 : 0) * (asc ? 1 : -1); });
      const shown = r.slice(0, limit);
      box.innerHTML = r.length ? `<div class="tbl-wrap"><table><thead><tr>${cols.map(c => `<th data-k="${c[0]}" class="${c[0] === "cps" ? "nosort" : ""}${c[0] === sortK ? " on" + (asc ? " asc" : "") : ""}">${c[1]}</th>`).join("")}</tr></thead><tbody>` +
        shown.map(x => `<tr class="${x.nh ? "nh" : ""}"><td class="s">${esc(x.name)}<span class="code">${x.code.slice(2)}</span></td><td>${x.close.toFixed(2)}</td><td class="${cls(x.pct)}">${pct(x.pct)}${x.lim ? " 停" : ""}</td>` +
          `<td>${x.over == null ? "—" : "+" + x.over.toFixed(1) + "%"}</td><td>${x.streak == null ? "—" : x.streak + " 天"}</td><td>${cap(x.cap)}</td>` +
          `<td class="cps">${x.cps.slice().sort((a, b) => hotIds.has(b) - hotIds.has(a)).slice(0, 6).map(i => `<a href="${cLink(d, names[i])}" class="${hotIds.has(i) ? "hot" : ""}">${esc(names[i])}</a>`).join(" · ")}${x.cps.length > 6 ? " …" : ""}</td></tr>`).join("") +
        `</tbody></table></div>` + (r.length > limit ? `<div class="more"><button>显示全部 ${r.length} 只</button></div>` : "") : '<div class="empty">没有符合的股票</div>';
      $$("th[data-k]", box).forEach(th => th.onclick = () => { const k = th.dataset.k; if (k === "cps") return; if (k === sortK) asc = !asc; else { sortK = k; asc = k === "name"; } draw(); });
      const m = $(".more button", box); if (m) m.onclick = () => { limit = 1e9; draw(); };
    }
    draw();
  }

  // ---------------- 月报 ----------------
  async function month(m) {
    const M = await J("m/" + m + ".json"), i = IDX.months.indexOf(m), s = monthStats(M);
    const lastDay = M.days.length ? M.days[M.days.length - 1][0] : IDX.latest;
    const hot = (M.hot[MODE] || []), hmax = Math.max(1, ...hot.map(x => x[1]));
    const row = (x, j, sub, v, vcls, w, dn) => `<a class="row" href="${cLink(lastDay, x[0])}"><span class="rk">${j + 1}</span><span><span class="nm">${esc(x[0])}</span> <span class="sub">${sub}</span>${w != null ? `<div class="bar"><i class="${dn ? "d" : ""}" style="width:${w}%"></i></div>` : ""}</span><span class="v ${vcls || ""}">${v}</span></a>`;
    const gmax = Math.max(1, ...M.gain.concat(M.lose).map(x => Math.abs(x[1])));
    app.innerHTML = `
      <nav class="crumb"><a href="#/">首页</a><span>›</span><b>${ym(m)}月报</b></nav>
      <div class="toolbar"><div class="dnav"><button data-go="${IDX.months[i - 1] ? "m/" + IDX.months[i - 1] : ""}" ${i > 0 ? "" : "disabled"}>‹ 上个月</button>
        <select id="msel" aria-label="选择月份">${IDX.months.slice().reverse().map(x => `<option value="${x}"${x === m ? " selected" : ""}>${ym(x)}</option>`).join("")}</select>
        <button data-go="${IDX.months[i + 1] ? "m/" + IDX.months[i + 1] : ""}" ${i < IDX.months.length - 1 ? "" : "disabled"}>下个月 ›</button></div>${modeSeg()}</div>
      <section class="lead mlead"><div><div class="eyebrow">月报 · 共 ${M.n} 个交易日</div><h1 class="mt">${ym(m)}</h1>
        <p class="dek">${hot.length ? `本月最热的概念是<b>${esc(hot[0][0])}</b>，${hot[0][1]} 天进新高前 5、累计新高 ${hot[0][2]} 次` : "本月没有热点概念"}${M.gain[0] ? `；涨幅最大的是<b>${esc(M.gain[0][0])}</b>（${pct(M.gain[0][1], 1)}）` : ""}。</p></div>
        <div class="kpis">${kpiHtml(s, M)}</div></section>
      <section class="card"><div class="sec-h"><h2>每日${MN()}家数</h2><span class="sec-note">点柱子或格子看那一天</span></div>
        <div class="trend">${bars(M.days.map(x => ({ v: x[s.k], key: x[0], label: x[0] + "：" + x[s.k] + " 只，第一热点 " + (MODE === "h" ? x[8] : x[9]) })), 150, "本月每日新高家数", 10)}</div>
        <div class="axis num"><span>${M.days.length ? md(M.days[0][0]) : ""}</span><span>${md(lastDay)}</span></div>
        <div id="mcal" style="margin-top:14px">${calendar(m, null)}</div></section>
      <div class="grid2">
        <section class="card"><div class="sec-h"><h2>本月热点概念</h2><span class="sec-note">上榜天数 = 进当日新高前 5 的天数</span></div>
          <div class="rows">${hot.map((x, j) => row(x, j, `累计新高 ${x[2]} 次 · 本月 <span class="${cls(x[3])}">${pct(x[3], 1)}</span>`, x[1] + " 天", "", (x[1] / hmax * 100).toFixed(0))).join("") || '<div class="empty">暂无</div>'}</div></section>
        <section class="card"><div class="sec-h"><h2>本月涨幅前 10</h2><span class="sec-note">按日加权涨跌连乘 · 成分 ≥ ${IDX.rules.gain_min} 只</span></div>
          <div class="rows">${M.gain.map((x, j) => row(x, j, `新高 ${MODE === "h" ? x[2] : x[3]} 次`, pct(x[1], 1), cls(x[1]), (Math.abs(x[1]) / gmax * 100).toFixed(0))).join("")}</div>
          <div class="sec-h" style="margin-top:14px"><h2>本月跌幅前 5</h2></div>
          <div class="rows">${M.lose.map((x, j) => row(x, j, `新高 ${MODE === "h" ? x[2] : x[3]} 次`, pct(x[1], 1), cls(x[1]), (Math.abs(x[1]) / gmax * 100).toFixed(0), true)).join("")}</div></section>
      </div>`;
    $$("[data-go]", app).forEach(b => b.onclick = () => b.dataset.go && go(b.dataset.go));
    $("#msel").onchange = e => go("m/" + e.target.value);
    bindMode(() => month(m));
    $$(".trend .b", app).forEach(b => b.onclick = () => go("d/" + b.dataset.k));
    bindCal($("#mcal"));
  }

  // ---------------- 概念详情 ----------------
  async function concept(d, name) {
    const { D, V, cs } = await dayData(d);
    const cid = V._id[name], col = COL(), c = cid != null ? cs.get(cid) : null;
    const members = cid == null ? [] : D.st.filter(s => (V.map[s[0]] || []).includes(cid));
    const nhMap = new Map(nhOf(D).map(x => [x[0], x]));
    const rank = (D.top[MODE] || []).findIndex(t => t[0] === cid), t = rank >= 0 ? D.top[MODE][rank] : null;
    const rowOf = s => { const x = nhMap.get(s[0]); return { code: s[0], name: s[1], close: s[2], pct: s[3], cap: s[4], lim: s[5] & 1, over: x ? (x[1] / x[2] - 1) * 100 : null, streak: x ? x[3] : null, nh: !!x, cps: keptOf(V, s[0]) }; };
    const nhRows = members.filter(s => nhMap.has(s[0])).map(rowOf), allRows = members.map(rowOf);
    const hotIds = new Set((D.top[MODE] || []).map(x => x[0]));
    const mkC = x => "c/" + x + "/" + encodeURIComponent(name);
    app.innerHTML = `
      <nav class="crumb"><a href="#/">首页</a><span>›</span><a href="#/d/${d}">${md(d)}日报</a><span>›</span><b>${esc(name)}</b></nav>
      <div class="toolbar">${dateNav(d, mkC)}${modeSeg()}</div>
      <section class="chead"><div class="eyebrow">${md(d)} ${wk(d)} · 热点概念${D.gen ? ' <span class="badge gen">回补数据</span>' : ""}${cid != null && !V._kept.has(cid) ? ' <span class="badge">在剔除名单里</span>' : ""}
        ${t ? `<span class="tag ${t[2] ? "new" : ""}">新高榜第 ${rank + 1}${t[2] ? " · 新进榜" : " · 连续 " + t[1] + " 天"}</span>` : ""}</div>
        <h1>${esc(name)}</h1>
        <div class="ckv">
          <div><b class="up">${c ? c[col] : 0}</b><span>${MN()}</span></div>
          <div><b>${c ? c[MODE === "h" ? 3 : 2] : 0}</b><span>${MN(MODE === "h" ? "w" : "h")}</span></div>
          <div><b class="${cls(c && c[4])}">${c ? pct(c[4]) : "—"}</b><span>加权涨跌（估算）</span></div>
          <div><b>${c ? c[5] : 0}<small class="flat">/${members.length}</small></b><span>上涨 / 成分</span></div>
          <div><b class="up">${c ? c[6] : 0}</b><span>涨停</span></div>
        </div></section>
      <section class="card"><div class="sec-h"><h2>截至当日 60 个交易日走势</h2><div class="legend"><span><i style="background:var(--bar)"></i>每日${MN()}家数</span><span><i style="background:var(--up)"></i>概念累计涨跌（估算）</span></div></div><div class="tchart" id="tchart"><div class="loading">加载中…</div></div></section>
      <section class="card"><div class="sec-h"><h2>当日${MN()}股票</h2><span class="sec-note">${nhRows.length} 只</span></div><div id="t1"></div></section>
      <section class="card"><div class="sec-h"><h2>全部成分股</h2><span class="sec-note">${members.length} 只 · 左边红线 = 当日新高</span></div><div class="tools" id="t2c"></div><div id="t2"></div></section>`;
    bindNav(mkC); bindMode(() => concept(d, name));
    stockTable($("#t1"), null, nhRows, V, d, hotIds, []);
    stockTable($("#t2"), $("#t2c"), allRows, V, d, hotIds, []);
    try {
      const L = dayList(), e = L.indexOf(d), win = L.slice(Math.max(0, e - 59), e + 1);
      const parts = await Promise.all([...new Set(win.map(x => x.slice(0, 7)))].map(m => J("t/" + m + ".json")));
      const dates = [], s = []; let any = false;
      parts.forEach(P => P.dates.forEach((dd, j) => { if (dd >= win[0] && dd <= d) { dates.push(dd); const v = P.c[name] ? P.c[name][j] : 0; s.push(v || null); if (v) any = true; } }));
      const box = $("#tchart");
      if (!any) { box.innerHTML = '<div class="empty">这段时间没有数据</div>'; return; }
      const k = MODE === "h" ? 0 : 1, W = 600, H = 190, top = 14, bot = 20, n = dates.length, bw = W / n;
      const nh = s.map(x => (x ? x[k] : 0)), mx = Math.max(1, ...nh);
      let lv = 100; const line = s.map(x => (lv *= 1 + ((x ? x[2] : 0) / 100)));
      const lo = Math.min(...line, 100), hi = Math.max(...line, 100), sp = hi - lo || 1;
      const yL = v => top + (1 - (v - lo) / sp) * (H - top - bot - 30);
      let g = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="新高家数与累计涨跌">`;
      nh.forEach((v, i) => { const bh = (v / mx) * 60; g += `<rect class="b" data-k="${dates[i]}" x="${(i * bw + bw * .15).toFixed(1)}" y="${(H - bot - bh).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${dates[i] === d ? "var(--up)" : "var(--bar)"}"><title>${dates[i]}：新高 ${v} 只，涨跌 ${pct(s[i] ? s[i][2] : 0)}</title></rect>`; });
      g += `<polyline fill="none" stroke="var(--up)" stroke-width="2" vector-effect="non-scaling-stroke" points="${line.map((v, i) => ((i + .5) * bw).toFixed(1) + "," + yL(v).toFixed(1)).join(" ")}"/>`;
      g += `<line x1="0" x2="${W}" y1="${yL(100).toFixed(1)}" y2="${yL(100).toFixed(1)}" stroke="var(--rule)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/></svg>`;
      const chg = (line[line.length - 1] / 100 - 1) * 100;
      box.innerHTML = g + `<div class="axis num"><span>${md(dates[0])}</span><span>累计 <b class="${cls(chg)}">${pct(chg, 1)}</b></span><span>${md(dates[n - 1])}</span></div>`;
      $$(".b", box).forEach(b => b.onclick = () => go(mkC(b.dataset.k)));
    } catch (e) { $("#tchart").innerHTML = '<div class="empty">走势加载失败</div>'; }
  }

  const tt = $("#totop");
  if (tt) { const f = () => tt.classList.toggle("on", scrollY > 400); addEventListener("scroll", f, { passive: true }); f(); tt.onclick = () => scrollTo({ top: 0, behavior: "smooth" }); }
  route();
})();
