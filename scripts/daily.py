# 每个交易日收盘后：新浪全 A 快照 → 判断历史新高 / 250 日新高 → web/data/d/<日期>.json，更新 state/
import gzip
import json
import os
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa

H = {"Referer": "https://finance.sina.com.cn", "User-Agent": "Mozilla/5.0"}
NODE = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
STATE = os.path.join(STATE_DIR, "state.json.gz")


def get(url, **kw):
    for k in range(5):
        try:
            r = requests.get(url, headers=H, timeout=30, **kw)
            r.raise_for_status()
            return r
        except Exception as e:
            err = e
            time.sleep(3 + 4 * k)
    raise err


def snapshot():
    rows = []
    for p in range(1, 100):
        d = get(NODE, params=dict(page=p, num=80, sort="symbol", asc=1, node="hs_a", symbol="", _s_r_a="init")).json()
        if not d:
            break
        rows += d
    return rows


def indices():
    t = get("https://hq.sinajs.cn/list=sh000001,sz399001,sz399006").text
    out, day = {}, None
    for ln in t.strip().splitlines():
        k = ln.split("=")[0].split("_")[-1]
        v = ln.split('"')[1].split(",")
        if len(v) < 31:
            continue
        pre, cur = float(v[2]), float(v[3])
        out[k] = [round(cur, 2), round((cur / pre - 1) * 100, 2) if pre else 0]
        if k == "sh000001":
            day = v[30]
    return day, out


def load_state():
    if not os.path.exists(STATE):
        return None
    with gzip.open(STATE, "rt", encoding="utf-8") as f:
        return json.load(f)


def save_state(S):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATE + ".tmp"
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(S, f, separators=(",", ":"))
    os.replace(tmp, STATE)


def step(S, snap, day, idx, gen=False):
    """用一天的快照推进状态，返回当天数据（daily 和 backfill 共用的判断逻辑）"""
    codes = S["codes"]
    st, nh, nh250 = [], [], []
    for r in snap:
        code, name = r["code"], r["name"]
        close, pre, high = r["close"], r["pre"], r["high"]
        vol = r["vol"]
        susp = not vol or not close
        if susp:
            close = pre
        c = codes.get(code)
        if c and pre and c[0] and abs(pre / c[0] - 1) > 1e-4:          # 除权除息：把记下的高点换算成今天的价格口径
            f = pre / c[0]
            c[1] *= f
            c[5] = [x * f for x in c[5]]
        pct = (close / pre - 1) * 100 if pre else 0.0
        up, dn = limit_flags(code, name, pre, close) if not susp else (False, False)
        flag = (1 if up else 0) | (2 if dn else 0) | (4 if susp else 0)
        st.append([code, name, round(close, 3), round(pct, 2), round((r.get("nmc") or 0) / 1e4, 2), flag])
        if susp:
            if c:
                c[0] = close; c[3] = 0; c[4] = 0
            continue
        if not c:
            codes[code] = [close, high, 1, 0, 0, [high]]
            continue
        prior_h, prior_w = c[1], (max(c[5]) if c[5] else 0)
        old = c[2] >= MIN_AGE
        if old and high > prior_h * (1 + 1e-9):
            c[3] += 1
            nh.append([code, round(high, 3), round(prior_h, 3), c[3]])
        else:
            c[3] = 0
        if old and high > prior_w * (1 + 1e-9):
            c[4] += 1
            nh250.append([code, round(high, 3), round(prior_w, 3), c[4]])
        else:
            c[4] = 0
        c[0] = close
        c[1] = max(c[1], high)
        c[2] += 1
        c[5] = (c[5] + [high])[-WIN:]
    S["date"] = day
    return dict(date=day, gen=gen, idx=idx, st=st, nh=nh, nh250=nh250)


def main(force=False):
    now = bj_now()
    day, idx = indices()
    if not day:
        print("取不到指数行情，跳过"); return None
    S = load_state()
    if S is None:
        print("没有 state（需先在本机跑 backfill.py 建立），跳过"); return None
    if S["date"] >= day and not force:
        print("今天（%s）已处理，跳过" % day); return None
    if now.date().isoformat() == day and now.strftime("%H:%M") < "15:05":
        print("还没收盘（北京 %s），跳过" % now.strftime("%H:%M")); return None
    raw = snapshot()
    if len(raw) < 4500:
        print("快照只有 %d 只，数据不全，放弃本次" % len(raw)); return None
    snap = []
    for r in raw:
        f = lambda k: float(r.get(k) or 0)
        snap.append(dict(code=r["symbol"], name=r["name"], close=f("trade"), pre=f("settlement"), high=f("high"),
                         vol=f("volume"), nmc=f("nmc")))
    out = step(S, snap, day, idx)
    jsave(os.path.join(DAY_DIR, day + ".json"), pack_day(out))
    save_state(S)
    print("%s：%d 只，历史新高 %d，250 日新高 %d" % (day, len(snap), len(out["nh"]), len(out["nh250"])))
    return day


if __name__ == "__main__":
    main(force="--force" in sys.argv)
