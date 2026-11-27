# 处理 inbox/ 里上传的概念表 Excel → web/data/concepts/<日期>.json，并记录检查结果
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa


def save_version(info, src_name, effective=None):
    day = effective or info["asof"] or bj_now().date().isoformat()
    allc = []
    idx = {}
    mp = {}
    for code, cps in info["members"].items():
        ids = []
        for c in cps:
            if c not in idx:
                idx[c] = len(allc); allc.append(c)
            ids.append(idx[c])
        mp[code] = ids
    obj = dict(date=day, uploaded=bj_now().strftime("%Y-%m-%d %H:%M"), src=src_name,
               n_stocks=len(mp), concepts=allc, map=mp, kept=[])
    prev = concept_versions()
    prev = [v for v in prev if v != day]
    jsave(os.path.join(CON_DIR, day + ".json"), obj)
    # 检查结果：与上一版比较
    log = jload(os.path.join(CON_DIR, "log.json"), []) or []
    entry = dict(date=day, uploaded=obj["uploaded"], src=src_name, n_stocks=len(mp), n_concepts=len(allc))
    if prev:
        p = jload(os.path.join(CON_DIR, prev[-1] + ".json"))
        a, b = set(p["concepts"]), set(allc)
        entry.update(prev=prev[-1], added=sorted(b - a)[:200], removed=sorted(a - b)[:200],
                     n_added=len(b - a), n_removed=len(a - b),
                     stocks_added=len(set(mp) - set(p["map"])), stocks_removed=len(set(p["map"]) - set(mp)))
    log = [x for x in log if x["date"] != day] + [entry]
    jsave(os.path.join(CON_DIR, "log.json"), sorted(log, key=lambda x: x["date"]), pretty=True)
    return day


def main():
    if not os.path.isdir(INBOX):
        return []
    done = []
    for f in sorted(os.listdir(INBOX)):
        if not f.lower().endswith((".xlsx", ".xlsm")):
            continue
        p = os.path.join(INBOX, f)
        try:
            info = parse_concepts_xlsx(p)
            day = save_version(info, f)
            os.makedirs(SRC_DIR, exist_ok=True)
            shutil.move(p, os.path.join(SRC_DIR, day + ".xlsx"))
            print("概念表已更新：%s（%d 只股票）" % (day, len(info["members"])))
            done.append(day)
        except Exception as e:
            os.makedirs(os.path.join(INBOX, "failed"), exist_ok=True)
            shutil.move(p, os.path.join(INBOX, "failed", f))
            with open(os.path.join(INBOX, "failed", f + ".txt"), "w", encoding="utf-8") as fh:
                fh.write(str(e))
            print("概念表解析失败：%s：%s" % (f, e))
    return done


if __name__ == "__main__":
    main()
