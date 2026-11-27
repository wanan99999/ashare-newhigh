# 公共工具：路径、北京时间、剔除名单、概念表解析、涨跌停判断
import datetime as dt
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
DATA = os.path.join(WEB, "data")
DAY_DIR = os.path.join(DATA, "d")          # 每日数据
MON_DIR = os.path.join(DATA, "m")          # 每月汇总
CON_DIR = os.path.join(DATA, "concepts")   # 概念表各版本
STATE_DIR = os.path.join(ROOT, "state")    # 历史最高价等滚动状态（单独分支保存，不进 main）
EXCLUDE = os.path.join(ROOT, "config", "exclude.txt")
INBOX = os.path.join(ROOT, "inbox")
SRC_DIR = os.path.join(ROOT, "concepts_src")

MIN_AGE = 60          # 上市不满 60 个交易日的不算新高（新股天天创新高）
WIN = 250             # 「新高」= 250 个交易日内新高


def bj_now():
    return dt.datetime.utcnow() + dt.timedelta(hours=8)


def jload(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def jsave(path, obj, pretty=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        if pretty:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        else:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


# ---------------- 剔除名单 ----------------
def load_rules(path=EXCLUDE):
    R = dict(eq=set(), has=[], tail=[], head=[], keep=set())
    with open(path, encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip().lstrip("﻿")
            if not ln or ln.startswith("#"):
                continue
            for p, k in (("含:", "has"), ("尾:", "tail"), ("头:", "head"), ("含：", "has"), ("尾：", "tail"), ("头：", "head")):
                if ln.startswith(p):
                    v = ln[len(p):].strip()
                    if v:
                        R[k].append(v)
                    break
            else:
                if ln.startswith("保留:") or ln.startswith("保留："):
                    R["keep"].add(ln[3:].strip())
                else:
                    R["eq"].add(ln)
    return R


def excluded(c, R):
    if c in R["keep"]:
        return False
    return (c in R["eq"] or any(x in c for x in R["has"]) or any(c.endswith(x) for x in R["tail"])
            or any(c.startswith(x) for x in R["head"]))


# ---------------- 股票代码 ----------------
def norm_code(raw):
    """'000001.SZ' / 'sz000001' / '000001' → 'sz000001'"""
    s = str(raw).strip().lower()
    m = re.match(r"^(\d{6})\.(sh|sz|bj)$", s)
    if m:
        return m.group(2) + m.group(1)
    m = re.match(r"^(sh|sz|bj)(\d{6})$", s)
    if m:
        return s
    m = re.match(r"^(\d{6})$", s)
    if m:
        c = m.group(1)
        if c.startswith(("6", "9")) and not c.startswith("92"):
            return "sh" + c
        if c.startswith(("4", "8", "92")):
            return "bj" + c
        return "sz" + c
    return None


def limit_pct(code, name):
    """涨跌停幅度"""
    if "ST" in (name or "").upper():
        return 0.05
    c = code[2:]
    if code.startswith("bj"):
        return 0.30
    if c.startswith(("300", "301", "688", "689")):
        return 0.20
    return 0.10


def limit_flags(code, name, pre, close):
    """返回 (涨停, 跌停)"""
    if not pre or not close:
        return False, False
    p = limit_pct(code, name)
    up = round(pre * (1 + p) + 1e-9, 2)
    dn = round(pre * (1 - p) + 1e-9, 2)
    return close >= up - 0.005, close <= dn + 0.005


# ---------------- 概念表（Wind 导出 Excel） ----------------
def parse_concepts_xlsx(path):
    """Wind 导出格式：B 列代码、C 列简称、D 列所属概念（分号分隔）；B2 是导出日期。
    返回 dict(asof, names{code:简称}, members{code:[概念…]})"""
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    asof, members, names = None, {}, {}
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        row = list(row) + [None] * 4
        b, c, d = row[1], row[2], row[3]
        if asof is None and isinstance(b, (dt.date, dt.datetime)):
            asof = (b.date() if isinstance(b, dt.datetime) else b).isoformat()
            continue
        code = norm_code(b) if b else None
        if not code:
            continue
        cps = []
        for x in re.split(r"[;；]", str(d or "")):
            x = x.strip()
            if x and x not in cps:
                cps.append(x)
        members[code] = cps
        names[code] = str(c or "").strip()
    wb.close()
    if len(members) < 1000:
        raise ValueError("只读到 %d 只股票，格式可能不对（需要 B 列代码、C 列简称、D 列概念）" % len(members))
    return dict(asof=asof, names=names, members=members)


def concept_versions():
    """已有概念表版本（日期升序）"""
    if not os.path.isdir(CON_DIR):
        return []
    return sorted(f[:-5] for f in os.listdir(CON_DIR) if re.match(r"^\d{4}-\d{2}-\d{2}\.json$", f))


def version_for(day, versions):
    """某天用哪一版：生效日 ≤ 当天的最后一版；当天之前还没有任何版本时用第一版（回补）"""
    best = None
    for v in versions:
        if v <= day:
            best = v
    return best or (versions[0] if versions else None)


def day_files():
    if not os.path.isdir(DAY_DIR):
        return []
    return sorted(f[:-5] for f in os.listdir(DAY_DIR) if re.match(r"^\d{4}-\d{2}-\d{2}\.json$", f))


# ---------------- 每日数据压缩存储 ----------------
# 股票代码和名称放在 data/stocks.json（只追加，顺序不变）；每天只存与之对齐的数字数组
STOCKS = os.path.join(DATA, "stocks.json")


def pack_day(out):
    U = jload(STOCKS, None) or dict(codes=[], names=[])
    pos = {c: i for i, c in enumerate(U["codes"])}
    for code, name, *_ in out["st"]:
        if code not in pos:
            pos[code] = len(U["codes"]); U["codes"].append(code); U["names"].append(name)
        else:
            U["names"][pos[code]] = name
    n = len(U["codes"])
    c, p, m, f = [None] * n, [None] * n, [None] * n, [None] * n
    for code, name, close, pct, nmc, flag in out["st"]:
        i = pos[code]; c[i], p[i], m[i], f[i] = close, pct, nmc, flag
    jsave(STOCKS, U)
    o = {k: v for k, v in out.items() if k != "st"}
    o.update(n=n, c=c, p=p, m=m, f=f)
    return o


def unpack_st(D, U):
    """→ [[code, name, close, pct, nmc, flag], ...]"""
    if "st" in D:
        return D["st"]
    out = []
    for i in range(D["n"]):
        if D["c"][i] is not None:
            out.append([U["codes"][i], U["names"][i], D["c"][i], D["p"][i], D["m"][i], D["f"][i]])
    return out
