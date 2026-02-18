# Pipeline Refactor Architecture Document

## 文档信息

- **版本**: v2.0
- **日期**: 2026-02-18
- **作者**: Cron Job Engineer
- **项目**: 湾区美食地图 - ETL Pipeline Refactor

## 1. 架构概述

### 1.1 重构目标

- **幂等性**: 所有操作可重复执行，不会产生副作用
- **可靠性**: 完整的错误处理和故障恢复机制
- **可观测性**: 详细的日志记录和监控告警
- **可维护性**: 模块化设计，易于扩展和维护

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Daily Master Job                          │
│                    (scripts/etl/daily_master_job.sh)             │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Phase 1    │→│  Phase 2    │→│  Phase 3    │              │
│  │ Collection  │  │ Processing  │  │ Reporting   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Pipeline       │    │   Backup         │    │   Monitor        │
│   Orchestrator   │    │   Manager        │    │   Module         │
│   (Node.js)      │    │   (Bash)         │    │   (Node.js)      │
└────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     Data Storage        │
                    │  ┌─────┐ ┌─────┐       │
                    │  │L1   │ │L2   │       │
                    │  │L3   │ │State│       │
                    │  └─────┘ └─────┘       │
                    └─────────────────────────┘
```

## 2. 组件详解

### 2.1 Daily Master Job (daily_master_job.sh)

**职责**: 每日任务的主控脚本

**设计原则**:
- 幂等性: 使用锁文件防止重复运行
- 容错性: 每个阶段都有错误处理
- 可恢复性: 支持从断点恢复

**执行阶段**:

| 阶段 | 任务 | 超时 | 关键性 |
|------|------|------|--------|
| Pre-flight | 环境检查、磁盘空间 | 5min | 是 |
| Phase 1 | 数据采集、递归搜索、互动更新 | 60min | 是 |
| Phase 2 | 备份、安全合并、质量修复 | 30min | 是 |
| Phase 3 | 报告生成、数据验证、清理 | 15min | 否 |

**日志文件**:
- `logs/daily_YYYY-MM-DD.log` - 主执行日志
- `logs/daily_YYYY-MM-DD.error.log` - 错误日志
- `logs/audit_YYYY-MM-DD.log` - 审计日志
- `logs/metrics_YYYY-MM-DD.json` - 执行指标

### 2.2 Pipeline Orchestrator (pipeline_orchestrator.js)

**职责**: DAG风格的任务编排

**特性**:
- 任务依赖管理
- 断点续传 (checkpoint/resume)
- 失败重试 (指数退避)
- 并行/串行执行控制

**任务阶段**:

```javascript
{
  data_collection: {
    tasks: ['analyze_daily', 'update_engagement', 'batch_collection'],
    dependsOn: [],
    timeout: 60
  },
  data_processing: {
    tasks: ['quality_fix', 'apply_corrections', 'sync_ui'],
    dependsOn: ['data_collection'],
    timeout: 30
  },
  validation: {
    tasks: ['integrity_check', 'quality_metrics'],
    dependsOn: ['data_processing'],
    timeout: 15
  }
}
```

**状态文件**: `data/state/orchestrator_checkpoint.json`

### 2.3 Backup Manager (backup_manager.sh)

**职责**: 三级备份策略

**备份策略**:

| 级别 | 类型 | 保留时间 | 触发条件 | 用途 |
|------|------|----------|----------|------|
| L1 | 实时 | 48小时 | 数据变更 | 即时恢复 |
| L2 | 每日 | 14天 | 定时任务 | 日常恢复 |
| L3 | 归档 | 6个月 | 每周/每月 | 长期归档 |

**备份内容**:
- 主数据库 (restaurant_database.json)
- UI版本 (restaurant_database_v5_ui.json)
- 配置文件
- 原始数据摘要

**存储位置**:
- `data/backup/level1_realtime/`
- `data/backup/level2_daily/`
- `data/backup/level3_archive/`

### 2.4 Monitor Module (monitor.js)

**职责**: 多维度监控和告警

**监控维度**:

1. **数据新鲜度 (Freshness)**
   - 检查数据库文件修改时间
   - 检查记录最新更新时间
   - 阈值: 警告 25小时, 严重 48小时

2. **数据质量 (Quality)**
   - 必填字段完整性
   - 评分计算 (0-100)
   - 阈值: 最低 70, 目标 85

3. **管道健康 (Health)**
   - 检查执行状态
   - 检测运行超时
   - 检查失败历史

4. **系统资源 (Resources)**
   - 磁盘空间
   - 原始文件数量
   - 阈值: 最小 2GB

**告警机制**:
- 分级告警 (INFO/WARNING/CRITICAL)
- 告警冷却 (30分钟)
- Discord Webhook 集成
- 日志记录

## 3. 数据流

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Sources   │────→│   Raw Data  │────→│  Processed  │
│             │     │   (raw/)    │     │   Data      │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                       ┌────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Master Database │
              │  (restaurant_    │
              │   database.json) │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│  UI Version│ │  Backup    │ │  Reports   │
│  (v5_ui)   │ │  (L1/L2/L3)│ │  (daily)   │
└────────────┘ └────────────┘ └────────────┘
```

## 4. 故障处理

### 4.1 故障类型

| 类型 | 场景 | 处理策略 |
|------|------|----------|
| 可恢复错误 | 网络超时、API限流 | 指数退避重试 |
| 非关键错误 | 次要任务失败 | 记录警告，继续执行 |
| 关键错误 | 数据库损坏 | 停止管道，触发告警 |
| 系统错误 | 磁盘满、OOM | 清理资源，重试 |

### 4.2 恢复流程

```
1. 检测故障
   ↓
2. 记录状态到 checkpoint
   ↓
3. 发送告警通知
   ↓
4. 如果是可恢复错误 → 自动重试
   ↓
5. 如果重试失败 → 等待人工介入
   ↓
6. 人工修复后 → ./etl pipeline resume
```

### 4.3 备份恢复

**快速恢复**:
```bash
# 从最新备份恢复
./etl backup restore latest

# 从指定备份恢复
./etl backup restore data/backup/level2_daily/daily_20260218.tar.gz
```

**灾难恢复**:
```bash
# 1. 确认当前数据损坏
./etl doctor

# 2. 查看可用备份
./etl backup list

# 3. 验证备份完整性
./etl backup verify

# 4. 执行恢复
./etl backup restore latest

# 5. 验证恢复结果
./etl monitor check --all
```

## 5. Cron 配置

### 5.1 推荐配置

```bash
# 每日凌晨2点运行主任务
0 2 * * * cd /path/to/project && ./etl daily >> logs/cron.log 2>&1

# 每小时检查监控
0 * * * * cd /path/to/project && ./etl monitor check --all >> logs/monitor.log 2>&1

# 每日凌晨1点清理
0 1 * * * cd /path/to/project && ./etl backup cleanup >> logs/cleanup.log 2>&1

# 每周日凌晨3点归档
0 3 * * 0 cd /path/to/project && ./etl backup level3 weekly >> logs/archive.log 2>&1

# 每月1日凌晨4点月度归档
0 4 1 * * cd /path/to/project && ./etl backup level3 monthly >> logs/archive.log 2>&1
```

## 6. 扩展开发

### 6.1 添加新阶段

在 `pipeline_orchestrator.js` 中:

```javascript
const PIPELINE = {
  // ... existing phases
  my_new_phase: {
    name: 'My New Phase',
    dependsOn: ['data_processing'],
    timeout: 20,
    tasks: [
      { id: 'my_task', name: 'My Task', cmd: ['node', 'scripts/my.js'], critical: true }
    ]
  }
};
```

### 6.2 添加新监控检查

在 `monitor.js` 中:

```javascript
class MyChecker extends Checker {
  check() {
    // 实现检查逻辑
    if (condition) {
      this.add('ok', 'All good');
    } else {
      this.add('warning', 'Need attention');
    }
    return this.results;
  }
}
```

## 7. 运维清单

### 7.1 每日检查

- [ ] 检查昨日日志: `./etl logs`
- [ ] 检查监控状态: `./etl monitor check --all`
- [ ] 检查磁盘空间: `./etl doctor`

### 7.2 每周检查

- [ ] 验证备份完整性: `./etl backup verify`
- [ ] 检查备份状态: `./etl backup status`
- [ ] 查看数据质量趋势

### 7.3 每月检查

- [ ] 创建月度归档: `./etl backup level3 monthly`
- [ ] 清理旧日志
- [ ] 审查告警历史

## 8. 参考

### 8.1 文件清单

```
scripts/etl/
├── daily_master_job.sh        # 每日主任务
├── pipeline_orchestrator.js   # 管道编排器
├── backup_manager.sh          # 备份管理器
└── monitor.js                 # 监控模块

项目根目录/
├── etl                        # 快捷命令入口
└── docs/ETL_OPERATIONS_GUIDE.md  # 运维文档
```

### 8.2 状态文件

```
data/state/
├── .daily_job.lock              # 任务锁文件
├── pipeline_state.json          # 管道状态
├── orchestrator_checkpoint.json # 编排器检查点
├── orchestrator_metrics.json    # 执行指标
├── alert_state.json             # 告警状态
└── metrics_history.json         # 指标历史
```

### 8.3 日志文件

```
logs/
├── daily_YYYY-MM-DD.log         # 主执行日志
├── daily_YYYY-MM-DD.error.log   # 错误日志
├── audit_YYYY-MM-DD.log         # 审计日志
├── metrics_YYYY-MM-DD.json      # 执行指标
└── backup_manager.log           # 备份日志
```

## 9. 变更日志

### v2.0 (2026-02-18)

- 重构为模块化架构
- 新增管道编排器 (DAG + checkpoint)
- 实现三级备份策略
- 新增监控告警模块
- 添加快捷命令入口 (./etl)
- 完整的运维文档
