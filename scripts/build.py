# 由每日原始数据生成网页要用的汇总：概念统计、榜单、连续上榜、月度汇总、走势、索引
# 每次都全量重算（剔除名单或概念表改了也能立即生效），几秒钟
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

TOP = 5            # 榜单前几
GAIN_MIN = 10      # 涨幅榜：成分股至少 10 只
HOT_N = 10         # 近 5 日热度榜显示前 10
TREND_DAYS = 60


def wavg(items):
    s = w = 0.0
    for pct, nmc in items:
        base = nmc / (1 + pct / 100) if pct > -99 else 0
        s += base * pct; w += base
    return round(s / w, 2) if w > 0 else 0.0


def main():
    R = load_rules()
    versions = concept_versions()
    if not versions:
        print("还没有概念表"); return
    V = {}
    for v in versions:
        obj = jload(os.path.join(CON_DIR, v + ".json"))
        kept = [i for i, c in enumerate(obj["concepts"]) if not excluded(c, R)]
        if obj.get("kept") != kept:
            obj["kept"] = kept
            jsave(os.path.join(CON_DIR, v + ".json"), obj)
        ks = set(kept)
        V[v] = dict(names=obj["concepts"], map={k: [i for i in ids if i in ks] for k, ids in obj["map"].items()}, kept=ks)
    days = day_files()
    U = jload(STOCKS, None) or dict(codes=[], names=[])
    streak = {"h": defaultdict(int), "w": defaultdict(int)}
    hist5 = {"h": [], "w": []}            # 最近 5 天每个概念的新高家数 {name: n}
    index_days, month = [], defaultdict(list)
    trend = []                            # [(day, {name: (nh, nh250, wpct)})]
    for day in days:
        fp = os.path.join(DAY_DIR, day + ".json")
        D = jload(fp)
        v = version_for(day, versions)
        cv = V[v]
        names = cv["names"]
        nhset = {x[0] for x in D["nh"]}
        nwset = {x[0] for x in D["nh250"]}
        agg = defaultdict(lambda: [0, 0, 0, [], 0, 0])   # size, nh, nh250, [(pct,nmc)], nup, nlu
        mk = dict(n=0, up=0, down=0, flat=0, lu=0, ld=0, susp=0)
        for code, nm, close, pct, nmc, flag in unpack_st(D, U):
            mk["n"] += 1
            if flag & 4:
                mk["susp"] += 1
            elif pct > 0:
                mk["up"] += 1
            elif pct < 0:
                mk["down"] += 1
            else:
                mk["flat"] += 1
            mk["lu"] += flag & 1
            mk["ld"] += (flag & 2) >> 1
            for cid in cv["map"].get(code, ()):
                a = agg[cid]
                a[0] += 1
                if code in nhset: a[1] += 1
                if code in nwset: a[2] += 1
                if not flag & 4: a[3].append((pct, nmc))
                if pct > 0: a[4] += 1
                if flag & 1: a[5] += 1
        mk["nh"], mk["nh250"] = len(D["nh"]), len(D["nh250"])
        cs = []
        for cid, a in agg.items():
            if a[0] >= 3:
                cs.append([cid, a[0], a[1], a[2], wavg(a[3]), a[4], a[5]])
        byname = {names[c[0]]: c for c in cs}
        top, hot = {}, {}
        for mode, col in (("h", 2), ("w", 3)):
            rk = sorted((c for c in cs if c[col] > 0), key=lambda c: (-c[col], -c[col] / c[1], -c[4]))[:TOP]
            cur = {names[c[0]] for c in rk}
            for n in list(streak[mode]):
                if n not in cur: streak[mode][n] = 0
            prev5 = hist5[mode]
            seen_before = set().union(*[set(k for k, x in h.items() if x) for h in prev5]) if prev5 else set()
            out = []
            for c in rk:
                n = names[c[0]]
                streak[mode][n] += 1
                out.append([c[0], streak[mode][n], 0 if n in seen_before else 1])
            top[mode] = out
            hist5[mode] = (prev5 + [{names[c[0]]: c[col] for c in cs}])[-5:]
            tot = defaultdict(int)
            for h in hist5[mode]:
                for n, x in h.items(): tot[n] += x
            hot[mode] = [[byname[n][0] if n in byname else -1, n, s] for n, s in sorted(tot.items(), key=lambda t: -t[1])[:HOT_N] if s > 0]
        gain = [c[0] for c in sorted((c for c in cs if c[1] >= GAIN_MIN), key=lambda c: -c[4])[:TOP]]
        lose = [c[0] for c in sorted((c for c in cs if c[1] >= GAIN_MIN), key=lambda c: c[4])[:TOP]]
        D.update(v=v, mkt=mk, cs=cs, top=top, hot=hot, gain=gain, lose=lose)
        jsave(fp, D)
        idx = D.get("idx", {})
        sh, cy = idx.get("sh000001", [None, None]), idx.get("sz399006", [None, None])
        t1 = {m: (names[top[m][0][0]] if top[m] else "") for m in ("h", "w")}
        index_days.append([day, mk["nh"], mk["nh250"], 1 if D.get("gen") else 0, t1["h"], t1["w"], mk["lu"]])
        month[day[:7]].append(dict(day=day, mk=mk, sh=sh, cy=cy, top=top, names=names, cs=cs))
        trend.append((day, {names[c[0]]: (c[2], c[3], c[4]) for c in cs}))
    # 月度汇总
    months = sorted(month)
    for m in months:
        rows = month[m]
        out = dict(month=m, days=[], hot={}, gain=[], n=len(rows))
        cum_sh = cum_cy = 1.0
        agg = defaultdict(lambda: dict(dh=0, dw=0, nh=0, nw=0, ret=1.0, size=0, nd=0))
        for r in rows:
            mk = r["mk"]
            t1h = r["names"][r["top"]["h"][0][0]] if r["top"]["h"] else ""
            t1w = r["names"][r["top"]["w"][0][0]] if r["top"]["w"] else ""
            out["days"].append([r["day"], mk["nh"], mk["nh250"], mk["lu"], mk["up"], mk["down"], r["sh"][1], r["cy"][1], t1h, t1w])
            if r["sh"][1] is not None: cum_sh *= 1 + r["sh"][1] / 100
            if r["cy"][1] is not None: cum_cy *= 1 + r["cy"][1] / 100
            th = {x[0] for x in r["top"]["h"]}; tw = {x[0] for x in r["top"]["w"]}
            for c in r["cs"]:
                a = agg[r["names"][c[0]]]
                a["nh"] += c[2]; a["nw"] += c[3]; a["ret"] *= 1 + c[4] / 100; a["size"] += c[1]; a["nd"] += 1
                if c[0] in th: a["dh"] += 1
                if c[0] in tw: a["dw"] += 1
        out["sh"] = round((cum_sh - 1) * 100, 2); out["cy"] = round((cum_cy - 1) * 100, 2)
        for mode, dk, nk in (("h", "dh", "nh"), ("w", "dw", "nw")):
            lst = sorted(((n, a) for n, a in agg.items() if a[nk] > 0), key=lambda t: (-t[1][dk], -t[1][nk]))[:15]
            out["hot"][mode] = [[n, a[dk], a[nk], round((a["ret"] - 1) * 100, 2)] for n, a in lst]
        g = sorted(((n, a) for n, a in agg.items() if a["nd"] and a["size"] / a["nd"] >= GAIN_MIN), key=lambda t: -t[1]["ret"])
        out["gain"] = [[n, round((a["ret"] - 1) * 100, 2), a["nh"], a["nw"]] for n, a in g[:10]]
        out["lose"] = [[n, round((a["ret"] - 1) * 100, 2), a["nh"], a["nw"]] for n, a in g[-5:][::-1]]
        jsave(os.path.join(MON_DIR, m + ".json"), out)
    # 概念走势：按月存（t/<月>.json），概念详情页按需取最近 60 个交易日
    bym = defaultdict(list)
    for d, x in trend:
        bym[d[:7]].append((d, x))
    for m, tr in bym.items():
        names_m = sorted({n for _, x in tr for n in x})
        T = dict(dates=[d for d, _ in tr], c={})
        for n in names_m:
            T["c"][n] = [list(x[n]) if n in x else 0 for _, x in tr]
        jsave(os.path.join(DATA, "t", m + ".json"), T)
    old_trend = os.path.join(DATA, "trend.json")
    if os.path.exists(old_trend):
        os.remove(old_trend)
    jsave(os.path.join(DATA, "days.json"), dict(latest=days[-1] if days else None, days=index_days, months=months,
                                                 versions=versions, built=bj_now().strftime("%Y-%m-%d %H:%M"),
                                                 rules=dict(min_age=MIN_AGE, win=WIN, top=TOP, gain_min=GAIN_MIN)))
    print("汇总完成：%d 天，%d 个月，概念表 %d 版" % (len(days), len(months), len(versions)))


if __name__ == "__main__":
    main()
