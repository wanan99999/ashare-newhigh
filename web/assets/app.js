/* 创新高热点 · 前端（纯静态，读 data/*.json） */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const app = $("#app");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = () => "?t=" + Math.floor(Date.now() / 60000);           // 1 分钟内复用缓存
  const cache = {};
  async function J(path, fresh) {
    if (!fresh && cache[path]) return cache[path];
    const p = fetch("data/" + path + T()).then(r => { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); });
    cache[path] = p; p.catch(() => delete cache[path]); return p;
  }
  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  let MODE = store.get("nh-mode", "h") === "w" ? "w" : "h";
  const COL = () => (MODE === "h" ? 2 : 3);
  const MODE_NAME = m => (m === "h" ? "历史新高" : "250日新高");
  const pct = (x, d = 2) => x == null ? "—" : (x > 0 ? "+" : "") + Number(x).toFixed(d) + "%";
  const cls = x => (x > 0 ? "up" : x < 0 ? "dn" : "flat");
  const WK = "日一二三四五六";
  const wk = d => "周" + WK[new Date(d + "T12:00:00Z").getUTCDay()];
  const md = d => +d.slice(5, 7) + "月" + +d.slice(8, 10) + "日";
  const cap = x => x >= 1000 ? (x / 1000).toFixed(2) + "千亿" : x.toFixed(x >= 100 ? 0 : 1) + "亿";
  const go = h => { location.hash = h; };

  let IDX = null;
  async function index(fresh) { IDX = await J("days.json", fresh); return IDX; }
  const dayList = () => IDX.days.map(x => x[0]);

  // ---------------- 路由 ----------------
  async function route() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const p = h.split("/");
    try {
      await index();
      if (!IDX.latest) { app.innerHTML = '<div class="loading">还没有数据。</div>'; return; }
      if (p[0] === "c" && p[1] && p[2]) return await concept(p[1], p.slice(2).join("/"));
      const d = p[0] === "d" && dayList().includes(p[1]) ? p[1] : IDX.latest;
      return await home(d, p[2] === "m" && p[3] ? p[3] : null);
    } catch (e) {
      app.innerHTML = '<div class="loading">数据加载失败：' + esc(e.message) + '，<a href="javascript:location.reload()">刷新重试</a></div>';
    }
  }
  addEventListener("hashchange", () => { route(); });

  // ---------------- 公共片段 ----------------
  function dateBar(d, base) {
    const L = dayList(), i = L.indexOf(d);
    const opts = L.slice().reverse().map(x => `<option value="${x}"${x === d ? " selected" : ""}>${x} ${wk(x)}</option>`).join("");
    return `<div class="datebar">
      <div class="dnav"><button data-go="${i > 0 ? base + L[i - 1] : ""}" ${i > 0 ? "" : "disabled"} aria-label="前一天">‹ 前一天</button>
      <select aria-label="选择日期" data-sel="${esc(base)}">${opts}</select>
      <button data-go="${i < L.length - 1 ? base + L[i + 1] : ""}" ${i < L.length - 1 ? "" : "disabled"} aria-label="后一天">后一天 ›</button></div>
      <div class="seg" role="group" aria-label="新高口径"><button data-mode="h" class="${MODE === "h" ? "on" : ""}">历史新高</button><button data-mode="w" class="${MODE === "w" ? "on" : ""}">250日新高</button></div>
    </div>`;
  }
  function bindCommon(rerender) {
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => b.dataset.go && go(b.dataset.go));
    app.querySelectorAll("[data-sel]").forEach(s => s.onchange = () => go(s.dataset.sel + s.value));
    app.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { MODE = b.dataset.mode; store.set("nh-mode", MODE); rerender(); });
    app.querySelectorAll("[data-c]").forEach(b => b.onclick = e => { e.preventDefault(); go("c/" + b.dataset.d + "/" + encodeURIComponent(b.dataset.c)); });
  }
  async function dayData(d) {
    const D = await J("d/" + d + ".json");
    const [V, U] = await Promise.all([J("concepts/" + D.v + ".json"), J("stocks.json")]);
    if (!D.st) { D.st = []; for (let i = 0; i < D.n; i++) if (D.c[i] != null) D.st.push([U.codes[i], U.names[i], D.c[i], D.p[i], D.m[i], D.f[i]]); }
    if (!V._kept) {
      V._kept = new Set(V.kept);
      V._id = {}; V.concepts.forEach((n, i) => { V._id[n] = i; });
    }
    const cs = new Map(D.cs.map(c => [c[0], c]));
    const st = new Map(D.st.map(s => [s[0], s]));
    return { D, V, cs, st };
  }
  const keptOf = (V, code) => (V.map[code] || []).filter(i => V._kept.has(i));

  // 柱状图（SVG），bars: [{v, label, key, on}]
  function bars(list, h, opt = {}) {
    const n = list.length; if (!n) return "";
    const W = 600, max = Math.max(1, ...list.map(x => x.v)), bw = W / n;
    let s = `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(opt.label || "")}">`;
    list.forEach((x, i) => {
      const bh = Math.max(x.v ? 2 : 0, (x.v / max) * (h - (opt.pad || 14)));
      s += `<rect class="b" data-k="${esc(x.key || "")}" x="${(i * bw + bw * 0.14).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${x.on ? "var(--up)" : "var(--bar)"}"><title>${esc(x.label)}</title></rect>`;
    });
    return s + "</svg>";
  }

  // ---------------- 首页 ----------------
  let monthSel = null;
  async function home(d, mSel) {
    const { D, V, cs, st } = await dayData(d);
    const col = COL(), names = V.concepts, mk = D.mkt;
    const nhList = MODE === "h" ? D.nh : D.nh250;
    const nhSet = new Set(nhList.map(x => x[0]));
    const topIds = new Set((D.top[MODE] || []).map(x => x[0]));
    const other = MODE === "h" ? mk.nh250 : mk.nh;
    const sh = D.idx.sh000001 || [], cy = D.idx.sz399006 || [];
    // 近 40 个交易日新高数
    const L = IDX.days, i0 = L.findIndex(x => x[0] === d), sl = L.slice(Math.max(0, i0 - 39), i0 + 1);
    const spark = bars(sl.map(x => ({ v: x[MODE === "h" ? 1 : 2], key: x[0], on: x[0] === d, label: x[0] + "：" + x[MODE === "h" ? 1 : 2] + " 只" })), 56, { label: "近40个交易日新高家数" });

    const card = (t, k) => {
      const c = cs.get(t[0]); if (!c) return "";
      const n = c[col], inC = nhList.filter(x => (V.map[x[0]] || []).includes(t[0])).map(x => st.get(x[0])).filter(Boolean).sort((a, b) => b[3] - a[3]);
      const tag = t[2] ? '<span class="tag new">新进榜</span>' : t[1] > 1 ? `<span class="tag">连续上榜 ${t[1]} 天</span>` : '<span class="tag">今日上榜</span>';
      return `<button class="tc" data-c="${esc(names[t[0]])}" data-d="${d}"><span class="rk">TOP ${k + 1}</span><span class="nm">${esc(names[t[0]])}</span>
        <span class="n">${n}<small> 只新高 · 占 ${Math.round(n / c[1] * 100)}%</small></span>
        <span class="w ${cls(c[4])}">加权 ${pct(c[4])}</span>${tag}
        <span class="stk">${inC.slice(0, 4).map(s => esc(s[1])).join("、")}${inC.length > 4 ? " 等" : ""}</span></button>`;
    };
    const rowC = (cid, k, v, sub, barPct, dn) => `<button class="row" data-c="${esc(names[cid] || cid)}" data-d="${d}"><span class="rk">${k + 1}</span>
      <span><span class="nm">${esc(names[cid] || cid)}</span> <span class="sub">${sub}</span>${barPct != null ? `<div class="bar"><i class="${dn ? "d" : ""}" style="width:${Math.min(100, Math.abs(barPct)).toFixed(0)}%"></i></div>` : ""}</span>
      <span class="v ${typeof v === "number" ? cls(v) : ""}">${typeof v === "number" ? pct(v) : v}</span></button>`;
    const gmax = Math.max(1, ...D.gain.map(i => Math.abs(cs.get(i)[4])), ...D.lose.map(i => Math.abs(cs.get(i)[4])));
    const gainRows = (ids, dn) => ids.map((i, k) => { const c = cs.get(i); return rowC(i, k, c[4], `成分 ${c[1]} · 上涨 ${c[5]} · 新高 ${c[col]}`, Math.abs(c[4]) / gmax * 100, dn); }).join("");
    const hot = (D.hot[MODE] || []);
    const hmax = Math.max(1, ...hot.map(x => x[2]));
    const hotRows = hot.map((x, k) => { const c = cs.get(x[0]); return rowC(x[0] >= 0 ? x[0] : x[1], k, x[2] + " 次", `今日 ${c ? c[col] : 0} 只`, x[2] / hmax * 100); }).join("");

    app.innerHTML = `
      ${dateBar(d, "d/")}
      <section class="lead">
        <div>
          <div class="eyebrow">${md(d)} ${wk(d)}${D.gen ? '<span class="badge gen" title="由历史行情回补计算，概念用首版概念表">回补数据</span>' : ""}<span class="badge">概念表 ${D.v}</span></div>
          <div class="big"><span class="num">${nhList.length}</span><span class="u">只个股创${MODE_NAME(MODE)}</span></div>
          <div class="big-sub">${MODE === "h" ? "250日新高" : "历史新高"} ${other} 只 · 全市场 ${mk.n} 只</div>
        </div>
        <div>
          <div class="kv">
            <div><b class="up">${mk.lu}</b><span>涨停</span></div>
            <div><b><span class="up">${mk.up}</span><span class="flat">/</span><span class="dn">${mk.down}</span></b><span>上涨 / 下跌</span></div>
            <div><b class="${cls(sh[1])}">${pct(sh[1])}</b><span>上证指数</span></div>
            <div><b class="${cls(cy[1])}">${pct(cy[1])}</b><span>创业板指</span></div>
          </div>
          <div class="spark"><div class="spark-h"><span>近 ${sl.length} 个交易日新高家数</span><span>点柱子看那一天</span></div>${spark}</div>
        </div>
      </section>

      <section class="card"><div class="sec-h"><h2>新高数量前 5 的热点概念</h2><span class="sec-note">${MODE_NAME(MODE)} · 加权 = 按流通市值加权的当日涨跌（估算）</span></div>
        <div class="top5">${(D.top[MODE] || []).map(card).join("") || '<div class="empty">今天没有概念有新高股票</div>'}</div></section>

      <div class="grid2">
        <section class="card"><div class="sec-h"><h2 id="gl-t">当日涨幅前 5 的热点概念</h2><div class="seg" role="group" aria-label="涨幅或跌幅"><button data-gl="g" class="on">涨幅</button><button data-gl="l">跌幅</button></div></div>
          <div class="rows" id="gl">${gainRows(D.gain)}</div><p class="sec-note">只算成分股不少于 ${IDX.rules.gain_min} 只的概念</p></section>
        <section class="card"><div class="sec-h"><h2>近 5 日热度榜</h2><span class="sec-note">5 天累计新高次数 · ${MODE_NAME(MODE)}</span></div>
          <div class="rows">${hotRows || '<div class="empty">暂无</div>'}</div></section>
      </div>

      <section class="card" id="month"><div class="loading">本月概况加载中…</div></section>

      <section class="card" id="all"><div class="sec-h"><h2>当日全部${MODE_NAME(MODE)}股票</h2><span class="sec-note">${nhList.length} 只 · 红色概念 = 今日热点前 5</span></div>
        <div class="tools" id="chips"></div><div id="tbl"></div></section>`;
    bindCommon(() => home(d, monthSel));
    app.querySelectorAll(".spark .b").forEach(b => b.onclick = () => go("d/" + b.dataset.k));
    app.querySelectorAll("[data-gl]").forEach(b => b.onclick = () => {
      app.querySelectorAll("[data-gl]").forEach(x => x.classList.toggle("on", x === b));
      const g = b.dataset.gl === "g";
      $("#gl-t").textContent = "当日" + (g ? "涨幅" : "跌幅") + "前 5 的热点概念";
      $("#gl").innerHTML = gainRows(g ? D.gain : D.lose, !g); bindCommon(() => home(d, monthSel));
    });
    // 全部新高股票表
    const rows = nhList.map(x => { const s = st.get(x[0]) || [x[0], "", 0, 0, 0, 0]; return { code: x[0], name: s[1], close: s[2], pct: s[3], cap: s[4], lim: s[5] & 1, over: (x[1] / x[2] - 1) * 100, streak: x[3], cps: keptOf(V, x[0]) }; });
    const top5 = (D.top[MODE] || []).map(t => t[0]);
    stockTable($("#tbl"), $("#chips"), rows, V, d, topIds, top5);
    // 本月概况
    const months = IDX.months;
    monthSel = mSel && months.includes(mSel) ? mSel : d.slice(0, 7);
    monthBlock($("#month"), monthSel, d);
  }

  // 股票表：rows [{code,name,close,pct,cap,lim,over,streak,cps}]
  function stockTable(box, chipBox, rows, V, d, hotIds, chipIds, opt = {}) {
    let sortK = opt.sort || "pct", asc = false, filt = null, q = "", limit = 60;
    const names = V.concepts;
    if (chipBox) {
      chipBox.innerHTML = `<button class="chip on" data-f="">全部</button>` + (chipIds || []).map(i => `<button class="chip" data-f="${i}">${esc(names[i])}</button>`).join("") +
        `<input type="search" placeholder="搜代码 / 名称 / 概念" aria-label="搜索">`;
      chipBox.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { chipBox.querySelectorAll("[data-f]").forEach(x => x.classList.toggle("on", x === b)); filt = b.dataset.f === "" ? null : +b.dataset.f; draw(); });
      $("input", chipBox).oninput = e => { q = e.target.value.trim(); draw(); };
    }
    const cols = [["name", "股票"], ["close", "收盘"], ["pct", "涨跌幅"]].concat(opt.noNh ? [] : [["over", "比前高"], ["streak", "连续"]]).concat([["cap", "流通市值"], ["cps", "所属热点概念"]]);
    function draw() {
      let r = rows;
      if (filt != null) r = r.filter(x => x.cps.includes(filt));
      if (q) r = r.filter(x => x.code.includes(q) || x.name.includes(q) || x.cps.some(i => names[i].includes(q)));
      r = r.slice().sort((a, b) => { const k = sortK === "cps" ? "pct" : sortK; const va = a[k], vb = b[k]; return (va < vb ? -1 : va > vb ? 1 : 0) * (asc ? 1 : -1); });
      const shown = r.slice(0, limit);
      box.innerHTML = r.length ? `<div class="tbl-wrap"><table><thead><tr>${cols.map(c => `<th data-k="${c[0]}" class="${c[0] === "cps" ? "nosort" : ""}${c[0] === sortK ? " on" + (asc ? " asc" : "") : ""}">${c[1]}</th>`).join("")}</tr></thead><tbody>` +
        shown.map(x => `<tr class="${x.nh ? "nh" : ""}"><td class="s">${esc(x.name)}<span class="code">${x.code.slice(2)}</span></td><td>${x.close.toFixed(2)}</td><td class="${cls(x.pct)}">${pct(x.pct)}${x.lim ? " 停" : ""}</td>` +
          (opt.noNh ? "" : `<td>${x.over == null ? "—" : "+" + x.over.toFixed(1) + "%"}</td><td>${x.streak == null ? "—" : x.streak + " 天"}</td>`) +
          `<td>${cap(x.cap)}</td><td class="cps">${x.cps.slice().sort((a, b) => hotIds.has(b) - hotIds.has(a)).slice(0, 6).map(i => `<a href="#/c/${d}/${encodeURIComponent(names[i])}" class="${hotIds.has(i) ? "hot" : ""}">${esc(names[i])}</a>`).join(" · ")}${x.cps.length > 6 ? " …" : ""}</td></tr>`).join("") +
        `</tbody></table></div>` + (r.length > limit ? `<div class="more"><button>显示全部 ${r.length} 只</button></div>` : "") : '<div class="empty">没有符合的股票</div>';
      box.querySelectorAll("th[data-k]").forEach(th => th.onclick = () => { const k = th.dataset.k; if (k === "cps") return; if (k === sortK) asc = !asc; else { sortK = k; asc = k === "name"; } draw(); });
      const m = $(".more button", box); if (m) m.onclick = () => { limit = 1e9; draw(); };
    }
    draw();
  }

  // 本月概况
  async function monthBlock(box, m, d) {
    const months = IDX.months, i = months.indexOf(m);
    let M;
    try { M = await J("m/" + m + ".json"); } catch (e) { box.innerHTML = '<div class="empty">本月数据加载失败</div>'; return; }
    const k = MODE === "h" ? 1 : 2, vals = M.days.map(x => x[k]);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const mx = M.days.reduce((a, x) => (x[k] > (a ? a[k] : -1) ? x : a), null);
    const chart = bars(M.days.map(x => ({ v: x[k], key: x[0], on: x[0] === d, label: x[0] + "：" + x[k] + " 只，第一热点 " + (MODE === "h" ? x[8] : x[9]) })), 150, { label: "本月每日新高家数", pad: 10 });
    const hot = (M.hot[MODE] || []).slice(0, 10), hmax = Math.max(1, ...hot.map(x => x[1]));
    const lastDay = M.days.length ? M.days[M.days.length - 1][0] : d;
    const link = n => `data-c="${esc(n)}" data-d="${lastDay}"`;
    const [yy, mm] = m.split("-");
    box.innerHTML = `<div class="mhead"><h2 class="sec-h" style="margin:0"><span style="font-family:var(--serif);font-size:20px">本月概况</span></h2>
        <div class="mnav"><button data-m="${months[i - 1] || ""}" ${i > 0 ? "" : "disabled"} aria-label="上个月">‹</button><b>${yy}年${+mm}月</b><button data-m="${months[i + 1] || ""}" ${i < months.length - 1 ? "" : "disabled"} aria-label="下个月">›</button></div></div>
      <div class="mkv">
        <div><b>${M.n}</b><span>交易日</span></div>
        <div><b>${avg.toFixed(0)}</b><span>日均${MODE_NAME(MODE)}</span></div>
        <div><b>${mx ? mx[k] : 0}</b><span>最多一天 ${mx ? md(mx[0]) : ""}</span></div>
        <div><b class="${cls(M.sh)}">${pct(M.sh)}</b><span>上证本月</span></div>
        <div><b class="${cls(M.cy)}">${pct(M.cy)}</b><span>创业板本月</span></div>
      </div>
      <div class="mchart"><div class="spark-h"><span>每日${MODE_NAME(MODE)}家数</span><span>点柱子看那一天</span></div>${chart}
        <div class="spark-h num"><span>${M.days.length ? md(M.days[0][0]) : ""}</span><span>${M.days.length ? md(lastDay) : ""}</span></div></div>
      <div class="grid2" style="margin-top:14px">
        <div><div class="sec-h"><h2 style="font-size:17px">本月热点概念</h2><span class="sec-note">上榜天数 = 进当日新高前 5 的天数</span></div>
          <div class="rows">${hot.map((x, j) => `<button class="row" ${link(x[0])}><span class="rk">${j + 1}</span><span><span class="nm">${esc(x[0])}</span> <span class="sub">累计新高 ${x[2]} 次 · 本月 <span class="${cls(x[3])}">${pct(x[3], 1)}</span></span><div class="bar"><i style="width:${(x[1] / hmax * 100).toFixed(0)}%"></i></div></span><span class="v">${x[1]} 天</span></button>`).join("") || '<div class="empty">暂无</div>'}</div></div>
        <div><div class="sec-h"><h2 style="font-size:17px">本月涨幅前 5</h2><span class="sec-note">按日加权涨跌连乘</span></div>
          <div class="rows">${M.gain.slice(0, 5).map((x, j) => `<button class="row" ${link(x[0])}><span class="rk">${j + 1}</span><span><span class="nm">${esc(x[0])}</span> <span class="sub">新高 ${MODE === "h" ? x[2] : x[3]} 次</span></span><span class="v ${cls(x[1])}">${pct(x[1], 1)}</span></button>`).join("")}</div>
          <div class="sec-h" style="margin-top:12px"><h2 style="font-size:17px">本月跌幅前 5</h2></div>
          <div class="rows">${M.lose.slice(0, 5).map((x, j) => `<button class="row" ${link(x[0])}><span class="rk">${j + 1}</span><span><span class="nm">${esc(x[0])}</span></span><span class="v ${cls(x[1])}">${pct(x[1], 1)}</span></button>`).join("")}</div></div>
      </div>`;
    box.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { if (b.dataset.m) { monthSel = b.dataset.m; monthBlock(box, b.dataset.m, d); } });
    box.querySelectorAll(".mchart .b").forEach(b => b.onclick = () => go("d/" + b.dataset.k + "/m/" + m));
    box.querySelectorAll("[data-c]").forEach(b => b.onclick = () => go("c/" + b.dataset.d + "/" + encodeURIComponent(b.dataset.c)));
  }

  // ---------------- 概念详情 ----------------
  async function concept(d, name) {
    if (!dayList().includes(d)) d = IDX.latest;
    const { D, V, cs, st } = await dayData(d);
    const cid = V._id[name], col = COL();
    const c = cid != null ? cs.get(cid) : null;
    const members = cid == null ? [] : D.st.filter(s => (V.map[s[0]] || []).includes(cid));
    const nhMap = new Map((MODE === "h" ? D.nh : D.nh250).map(x => [x[0], x]));
    const rank = (D.top[MODE] || []).findIndex(t => t[0] === cid);
    const t = rank >= 0 ? D.top[MODE][rank] : null;
    const excludedNote = cid != null && !V._kept.has(cid) ? '<span class="badge">已在剔除名单里</span>' : "";
    const rowOf = s => { const x = nhMap.get(s[0]); return { code: s[0], name: s[1], close: s[2], pct: s[3], cap: s[4], lim: s[5] & 1, over: x ? (x[1] / x[2] - 1) * 100 : null, streak: x ? x[3] : null, nh: !!x, cps: keptOf(V, s[0]) }; };
    const nhRows = members.filter(s => nhMap.has(s[0])).map(rowOf), allRows = members.map(rowOf);
    const hotIds = new Set((D.top[MODE] || []).map(x => x[0]));
    app.innerHTML = `
      <a class="back" href="#/d/${d}">返回 ${md(d)} 首页</a>
      ${dateBar(d, "c/").replace(/data-go="c\/([\d-]+)"/g, (m0, x) => `data-go="c/${x}/${encodeURIComponent(name)}"`).replace('data-sel="c/"', `data-sel="c/" data-name="${esc(name)}"`)}
      <section class="chead"><div class="eyebrow">${md(d)} ${wk(d)} · 热点概念${D.gen ? ' <span class="badge gen">回补数据</span>' : ""} ${excludedNote}
        ${t ? `<span class="tag ${t[2] ? "new" : ""}">新高榜第 ${rank + 1}${t[2] ? " · 新进榜" : " · 连续 " + t[1] + " 天"}</span>` : ""}</div>
        <h1>${esc(name)}</h1>
        <div class="ckv">
          <div><b class="up">${c ? c[col] : 0}</b><span>${MODE_NAME(MODE)}</span></div>
          <div><b>${c ? c[MODE === "h" ? 3 : 2] : 0}</b><span>${MODE === "h" ? "250日新高" : "历史新高"}</span></div>
          <div><b class="${cls(c && c[4])}">${c ? pct(c[4]) : "—"}</b><span>加权涨跌（估算）</span></div>
          <div><b>${c ? c[5] : 0}<span class="flat">/${members.length}</span></b><span>上涨 / 成分</span></div>
          <div><b class="up">${c ? c[6] : 0}</b><span>涨停</span></div>
        </div></section>
      <section class="card"><div class="sec-h"><h2>截至当日 60 个交易日走势</h2><div class="legend"><span><i style="background:var(--bar)"></i>每日${MODE_NAME(MODE)}家数</span><span><i style="background:var(--up)"></i>概念累计涨跌（加权估算）</span></div></div><div class="tchart" id="tchart"><div class="loading">加载中…</div></div></section>
      <section class="card"><div class="sec-h"><h2>当日${MODE_NAME(MODE)}股票</h2><span class="sec-note">${nhRows.length} 只</span></div><div id="t1"></div></section>
      <section class="card"><div class="sec-h"><h2>全部成分股</h2><span class="sec-note">${members.length} 只 · 左边红线 = 当日新高</span></div><div class="tools" id="t2c"></div><div id="t2"></div></section>`;
    bindCommon(() => concept(d, name));
    app.querySelectorAll("[data-sel][data-name]").forEach(s => s.onchange = () => go("c/" + s.value + "/" + encodeURIComponent(name)));
    stockTable($("#t1"), null, nhRows, V, d, hotIds, [], { sort: "pct" });
    stockTable($("#t2"), $("#t2c"), allRows, V, d, hotIds, [], { sort: "pct", noNh: false });
    // 走势
    try {
      const L = dayList(), e = L.indexOf(d), win = L.slice(Math.max(0, e - 59), e + 1);
      const ms = [...new Set(win.map(x => x.slice(0, 7)))];
      const parts = await Promise.all(ms.map(m => J("t/" + m + ".json")));
      const TR = { dates: [], c: { [name]: [] } }; let any = false;
      parts.forEach(P => P.dates.forEach((dd, j) => { if (dd >= win[0] && dd <= d) { TR.dates.push(dd); const v = P.c[name] ? P.c[name][j] : 0; TR.c[name].push(v || null); if (v) any = true; } }));
      const s = any ? TR.c[name] : null, box = $("#tchart");
      if (!s) { box.innerHTML = '<div class="empty">这段时间没有数据</div>'; return; }
      const k = MODE === "h" ? 0 : 1, W = 600, H = 190, top = 14, bot = 20, n = TR.dates.length, bw = W / n;
      const nh = s.map(x => (x ? x[k] : 0)), mx = Math.max(1, ...nh);
      let lv = 100; const line = s.map(x => (lv *= 1 + ((x ? x[2] : 0) / 100)));
      const lo = Math.min(...line, 100), hi = Math.max(...line, 100), sp = hi - lo || 1;
      const yL = v => top + (1 - (v - lo) / sp) * (H - top - bot - 30);
      let g = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="新高家数与累计涨跌">`;
      nh.forEach((v, i) => { const bh = (v / mx) * 60; g += `<rect class="b" data-k="${TR.dates[i]}" x="${(i * bw + bw * .15).toFixed(1)}" y="${(H - bot - bh).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${TR.dates[i] === d ? "var(--up)" : "var(--bar)"}"><title>${TR.dates[i]}：新高 ${v} 只，涨跌 ${pct(s[i] ? s[i][2] : 0)}</title></rect>`; });
      g += `<polyline fill="none" stroke="var(--up)" stroke-width="2" vector-effect="non-scaling-stroke" points="${line.map((v, i) => ((i + .5) * bw).toFixed(1) + "," + yL(v).toFixed(1)).join(" ")}"/>`;
      g += `<line x1="0" x2="${W}" y1="${yL(100).toFixed(1)}" y2="${yL(100).toFixed(1)}" stroke="var(--rule)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/></svg>`;
      const chg = (line[line.length - 1] / 100 - 1) * 100;
      box.innerHTML = g + `<div class="spark-h num"><span>${md(TR.dates[0])}</span><span>60 天累计 <b class="${cls(chg)}">${pct(chg, 1)}</b></span><span>${md(TR.dates[n - 1])}</span></div>`;
      box.querySelectorAll(".b").forEach(b => b.onclick = () => go("c/" + b.dataset.k + "/" + encodeURIComponent(name)));
    } catch (e) { $("#tchart").innerHTML = '<div class="empty">走势加载失败</div>'; }
  }

  // 回到顶部
  const tt = $("#totop");
  if (tt) { const f = () => tt.classList.toggle("on", scrollY > 400); addEventListener("scroll", f, { passive: true }); f(); tt.onclick = () => scrollTo({ top: 0, behavior: "smooth" }); }
  route();
})();
