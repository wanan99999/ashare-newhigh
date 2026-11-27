# 创新高热点

https://wanan99999.github.io/ashare-newhigh/

每个交易日收盘后（GitHub Actions，北京 15:50 起），用新浪全 A 快照判断**历史新高 / 250 日新高**，按上传的概念表归类：新高数量前 5、涨幅前 5、近 5 日热度、本月概况、概念详情。

- 上传概念表：网站「上传概念」页（Wind 导出 Excel：B 代码、C 简称、D 概念；B2 导出日期）→ `inbox/` → `scripts/ingest.py` → `web/data/concepts/<日期>.json`（每版从导出日起生效）。
- 剔除名单：`config/exclude.txt`（上传页可直接编辑）。
- 流程：`scripts/run.py` = ingest → daily（交易日 15:05 后）→ build（全量重算汇总，几秒）。
- 滚动状态（每只股票的历史最高价、近 250 日最高价）存在 `state` 分支，每次覆盖、不留历史。
- 本机一次性：`_work/fetch_hist.py` 抓全历史前复权日线，`scripts/backfill.py 2026-01-01` 建 state 并回补（标「回补」）。
