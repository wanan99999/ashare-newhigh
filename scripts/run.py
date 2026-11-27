# 云端入口：处理上传的概念表 → 收盘数据（交易日 15:05 后）→ 重算汇总
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build
import daily
import ingest

if __name__ == "__main__":
    ingest.main()
    if "--no-daily" not in sys.argv:
        try:
            daily.main(force="--force" in sys.argv)
        except Exception as e:  # 行情抓取失败不影响上传的概念表生效
            print("收盘数据失败：%s" % e)
    build.main()
