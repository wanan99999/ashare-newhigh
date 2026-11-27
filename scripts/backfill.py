# 本机一次性：用全历史前复权日线（_work/hist/*.pkl）建立 state，并回补 START 起每天的数据（标「回补」）
# 用法：python scripts/backfill.py 2026-01-01
import os
import pickle
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa
import daily

WORK = os.path.join(ROOT, "_work")


def main(start):
    import pandas as pd
    for k in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"):
        os.environ.pop(k, None)
    import akshare as ak
    snap = pickle.load(open(os.path.join(WORK, "snap_codes.pkl"), "rb"))
    names = {r["symbol"]: r["name"] for r in snap}
    # 指数：交易日历 + 涨跌
    IX = {}
    for s in ("sh000001", "sz399001", "sz399006"):
        d = ak.stock_zh_index_daily(symbol=s)
        d["date"] = pd.to_datetime(d["date"]).dt.strftime("%Y-%m-%d")
        d = d.set_index("date")["close"].astype(float)
        IX[s] = d
    cal = [x for x in IX["sh000001"].index if x >= start]
    print("回补交易日", len(cal), cal[0], "→", cal[-1], flush=True)
    # 个股：按日期取 high/close/vol/流通股本
    rows = {}
    for code in names:
        fp = os.path.join(WORK, "hist", code + ".pkl")
        if not os.path.exists(fp):
            continue
        df = pickle.load(open(fp, "rb"))
        if df is None or not len(df):
            continue
        df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
        rows[code] = df.set_index("date")[["high", "close", "volume", "outstanding_share"]].astype(float)
    print("个股历史", len(rows), flush=True)
    # 初始状态：start 之前的全部历史
    S = dict(date=None, codes={})
    for code, df in rows.items():
        pre = df[df.index < start]
        if not len(pre):
            continue
        S["codes"][code] = [float(pre["close"].iloc[-1]), float(pre["high"].max()), int(len(pre)), 0, 0,
                            [float(x) for x in pre["high"].iloc[-WIN:]]]
    by_day = {d: {} for d in cal}
    for code, df in rows.items():
        sub = df[df.index >= start]
        for d, r in zip(sub.index, sub.itertuples(index=False)):
            if d in by_day:
                by_day[d][code] = r
    for n, d in enumerate(cal):
        snap_d = []
        for code in names:
            c = S["codes"].get(code)
            r = by_day[d].get(code)
            if r is None:
                if c:  # 已上市但当天没数据 = 停牌
                    snap_d.append(dict(code=code, name=names[code], close=0, pre=c[0], high=0, vol=0, nmc=0))
                continue
            pre = c[0] if c else r.close
            snap_d.append(dict(code=code, name=names[code], close=r.close, pre=pre, high=r.high, vol=r.volume,
                               nmc=r.close * r.outstanding_share / 1e4))
        idx = {}
        for s, ser in IX.items():
            i = ser.index.get_loc(d)
            idx[s] = [round(ser.iloc[i], 2), round((ser.iloc[i] / ser.iloc[i - 1] - 1) * 100, 2)]
        out = daily.step(S, snap_d, d, idx, gen=True)
        jsave(os.path.join(DAY_DIR, d + ".json"), pack_day(out))
        if n % 20 == 0 or n == len(cal) - 1:
            print(d, "股票", len(out["st"]), "历史新高", len(out["nh"]), "250日新高", len(out["nh250"]), flush=True)
    daily.save_state(S)
    print("state 已保存，日期", S["date"])


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "2026-01-01")
