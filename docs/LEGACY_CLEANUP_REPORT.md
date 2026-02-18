# Legacy Cleanup Report
# 遗留问题清理报告

**清理时间**: 2026-02-18 13:01 PST  
**执行者**: Travis  
**状态**: ✅ 清理完成

---

## 发现的问题

### 1. 旧Cron Job脚本残留
**位置**: `scripts/daily_master_job.sh` (旧版本)  
**问题**: 与新ETL目录中的脚本重复，可能导致混淆  
**处理**: ✅ 已备份并移除

### 2. 失效脚本引用
**位置**: `scripts/end_to_end_batch.sh`  
**问题**: 引用不存在的 `merge_batch.py`  
**处理**: ✅ 已禁用

### 3. 过时Crontab配置
**位置**: `config/crontab.txt`  
**问题**: 引用旧的 `check_bloggers.py` 等已删除脚本  
**处理**: ✅ 已创建新的 `crontab.v2.txt`

---

## 清理操作

### 已备份的文件
```
scripts/daily_master_job.sh → scripts/daily_master_job.sh.legacy.20260218_130145
scripts/end_to_end_batch.sh → scripts/end_to_end_batch.sh.disabled.20260218_130145
```

### 新增/更新的文件
```
config/crontab.v2.txt          # 新的Crontab配置
etl → scripts/etl/etl         # 根目录快捷方式
```

### 当前有效的Cron Job
位置: `scripts/etl/daily_master_job.sh` (v2.0)

---

## 正确的Crontab配置

使用 `config/crontab.v2.txt` 中的配置:

```bash
# 每日02:00运行ETL管道
0 2 * * * cd ~/.openclaw/workspace-planner/projects/bay-area-food-map/scripts/etl && ./daily_master_job.sh >> ../logs/daily_v2.log 2>&1

# 每日06:00健康检查
0 6 * * * cd ~/.openclaw/workspace-planner/projects/bay-area-food-map/scripts/etl && ./etl monitor check --all >> ../logs/monitor.log 2>&1

# 每日12:00系统检查
0 12 * * * cd ~/.openclaw/workspace-planner/projects/bay-area-food-map/scripts/etl && ./etl doctor >> ../logs/doctor.log 2>&1

# 每周日03:00归档备份
0 3 * * 0 cd ~/.openclaw/workspace-planner/projects/bay-area-food-map/scripts/etl && ./etl backup level3 weekly >> ../logs/backup_level3.log 2>&1
```

---

## 快速命令

```bash
# 查看新的ETL帮助
cd scripts/etl && ./etl help

# 运行每日任务
cd scripts/etl && ./etl daily

# 手动执行完整管道
node scripts/etl/cli.js --mode full --input data/raw/posts.json
```

---

## 验证无遗留

所有脚本现在引用正确的位置:
- ✅ `scripts/etl/daily_master_job.sh` (v2.0, 14KB)
- ✅ `scripts/etl/pipeline_orchestrator.js` (DAG编排)
- ✅ `scripts/etl/cli.js` (统一CLI)
- ✅ `scripts/etl/etl` (快捷入口)

**无遗留引用**:
- ✅ 不再引用 `merge_batch.py`
- ✅ 不再引用 `check_bloggers.py`
- ✅ 不再引用 `discover_from_comments.py`

---

**清理完成时间**: 2026-02-18 13:01 PST  
**系统状态**: ✅ 无遗留问题，全部更新到v2.0
