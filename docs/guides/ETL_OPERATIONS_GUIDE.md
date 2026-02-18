# ETL Pipeline v2.0 - 运维文档

## 概述

本文档描述了湾区美食地图项目的每日自动化ETL管道系统，包括：

- 每日主任务脚本 (`daily_master_job.sh`)
- 管道编排器 (`pipeline_orchestrator.js`)
- 备份管理系统 (`backup_manager.sh`)
- 监控告警模块 (`monitor.js`)

## 快速开始

### 1. 基本操作

```bash
# 查看帮助
./etl help

# 运行每日任务
./etl daily

# 查看系统健康
./etl doctor

# 查看最新日志
./etl logs
```

### 2. 运行检查

```bash
# 运行所有监控检查
./etl monitor check --all

# 检查特定项目
./etl monitor check --freshness  # 数据新鲜度
./etl monitor check --quality    # 数据质量
./etl monitor check --health     # 管道健康
```

## 系统架构

### 组件关系

```
┌─────────────────────────────────────────────────────────────┐
│                    Daily Master Job                         │
│                   (daily_master_job.sh)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
┌──────────────────┐ ┌──────────┐ ┌────────────────┐
│ Pipeline         │ │ Backup   │ │ Monitor        │
│ Orchestrator     │ │ Manager  │ │                │
│ (orchestrator.js)│ │ (backup) │ │ (monitor.js)   │
└────────┬─────────┘ └────┬─────┘ └───────┬────────┘
         │                │               │
         ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Storage                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Current     │  │ Backup      │  │ State               │  │
│  │ (v5_ui.json)│  │ (L1/L2/L3)  │  │ (checkpoints)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 详细组件说明

### 1. Daily Master Job (`daily_master_job.sh`)

每日主任务脚本，协调所有ETL操作。

**阶段：**

1. **Pre-flight Checks** - 环境检查和初始化
2. **Phase 1: Data Collection** - 数据采集
   - 分析每日数据
   - 递归搜索
   - 更新帖子互动数据
   - 批处理收集
3. **Phase 2: Data Processing** - 数据处理
   - 创建备份
   - 安全合并
   - 质量修复
   - 应用修正
4. **Phase 3: Post-processing** - 后处理
   - 生成报告
   - 数据验证
   - 清理旧备份

**使用方法：**

```bash
# 正常运行
bash scripts/etl/daily_master_job.sh

# 检查配置
bash scripts/etl/daily_master_job.sh --check

# 从断点恢复
bash scripts/etl/daily_master_job.sh --resume

# 查看状态
bash scripts/etl/daily_master_job.sh --status
```

**日志文件：**

- `logs/daily_YYYY-MM-DD.log` - 主执行日志
- `logs/daily_YYYY-MM-DD.error.log` - 错误日志
- `logs/audit_YYYY-MM-DD.log` - 审计日志
- `logs/metrics_YYYY-MM-DD.json` - 执行指标

### 2. Pipeline Orchestrator (`pipeline_orchestrator.js`)

DAG风格的任务编排器，支持断点续传和失败重试。

**任务阶段：**

| 阶段 | 描述 | 依赖 | 超时 |
|------|------|------|------|
| data_collection | 数据采集 | - | 60分钟 |
| data_processing | 数据处理 | data_collection | 30分钟 |
| validation | 数据验证 | data_processing | 15分钟 |
| reporting | 报告生成 | validation | 10分钟 |

**使用方法：**

```bash
# 运行完整管道
node scripts/etl/pipeline_orchestrator.js run

# 从指定阶段开始
node scripts/etl/pipeline_orchestrator.js run --phase=data_processing

# 仅运行指定阶段
node scripts/etl/pipeline_orchestrator.js run --phase=data_processing --single

# 从断点恢复
node scripts/etl/pipeline_orchestrator.js resume

# 查看状态
node scripts/etl/pipeline_orchestrator.js status

# 重置状态
node scripts/etl/pipeline_orchestrator.js reset
```

**状态文件：**

- `data/state/orchestrator_checkpoint.json` - 执行检查点
- `data/state/orchestrator_metrics.json` - 执行指标

### 3. Backup Manager (`backup_manager.sh`)

三级备份策略实现。

**备份级别：**

| 级别 | 类型 | 保留时间 | 用途 |
|------|------|----------|------|
| Level 1 | 实时 | 48小时 | 数据变更后立即备份 |
| Level 2 | 每日 | 14天 | 完整每日快照 |
| Level 3 | 归档 | 6个月 | 长期归档存储 |

**使用方法：**

```bash
# Level 1: 实时备份
bash scripts/etl/backup_manager.sh level1 data/current/restaurant_database.json snapshot_name

# 创建pre-merge备份
bash scripts/etl/backup_manager.sh pre-merge

# Level 2: 每日备份
bash scripts/etl/backup_manager.sh level2

# Level 3: 归档备份
bash scripts/etl/backup_manager.sh level3 weekly
bash scripts/etl/backup_manager.sh level3 monthly

# 查看备份列表
bash scripts/etl/backup_manager.sh list

# 从最新备份恢复
bash scripts/etl/backup_manager.sh restore latest

# 从指定备份恢复
bash scripts/etl/backup_manager.sh restore /path/to/backup.tar.gz

# 验证备份
bash scripts/etl/backup_manager.sh verify

# 清理旧备份
bash scripts/etl/backup_manager.sh cleanup

# 查看备份状态
bash scripts/etl/backup_manager.sh status
```

**备份位置：**

- `data/backup/level1_realtime/` - 实时备份
- `data/backup/level2_daily/` - 每日备份
- `data/backup/level3_archive/` - 归档备份

### 4. Monitor (`monitor.js`)

多维度监控和告警系统。

**监控维度：**

1. **数据新鲜度** - 检查数据更新时间和时效性
2. **数据质量** - 评估数据完整性和准确性
3. **管道健康** - 跟踪管道执行状态和性能
4. **系统资源** - 磁盘空间、文件数量等

**阈值配置：**

```javascript
{
  freshness: {
    warning: 25,   // 超过25小时警告
    critical: 48   // 超过48小时严重
  },
  quality: {
    min: 70,       // 最低可接受分数
    target: 85,    // 目标分数
    excellent: 95  // 优秀分数
  }
}
```

**使用方法：**

```bash
# 运行所有检查
node scripts/etl/monitor.js check --all

# 检查特定项目
node scripts/etl/monitor.js check --freshness
node scripts/etl/monitor.js check --quality
node scripts/etl/monitor.js check --health
node scripts/etl/monitor.js check --resources

# 启动监控面板（每5分钟检查）
node scripts/etl/monitor.js dashboard

# 查看监控历史
node scripts/etl/monitor.js report
```

**告警配置：**

创建 `config/discord_webhook.url` 文件，内容为 Discord webhook URL，即可启用 Discord 通知。

**状态文件：**

- `data/state/alert_state.json` - 告警状态（防止重复告警）
- `data/state/metrics_history.json` - 指标历史

## 故障排除

### 常见问题

#### 1. 管道卡住或失败

```bash
# 检查状态
./etl pipeline status

# 如果是运行中但卡住超过2小时
# 1. 检查是否有锁文件
ls -la data/state/.daily_job.lock

# 2. 如果有锁，检查进程是否存在
ps aux | grep daily_master_job

# 3. 手动删除锁文件（谨慎）
rm data/state/.daily_job.lock

# 4. 恢复运行
./etl pipeline resume
```

#### 2. 数据质量问题

```bash
# 运行质量检查
./etl monitor check --quality

# 如果分数低于70，运行自动修复
node scripts/auto_quality_fix.js

# 再次检查
./etl monitor check --quality
```

#### 3. 磁盘空间不足

```bash
# 检查磁盘空间
./etl monitor check --resources

# 清理旧备份
./etl backup cleanup

# 清理旧日志
find logs -name "*.log" -mtime +7 -delete

# 清理旧原始文件
find raw -name "feed_*.json" -mtime +30 -delete
```

#### 4. 从备份恢复

```bash
# 方法1: 使用快捷命令
./etl backup restore latest

# 方法2: 使用完整命令
bash scripts/etl/backup_manager.sh restore latest

# 方法3: 从指定备份恢复
bash scripts/etl/backup_manager.sh restore data/backup/level2_daily/daily_20260218.tar.gz
```

### 日志分析

```bash
# 查看今天的日志
tail -f logs/daily_$(date +%Y-%m-%d).log

# 查看错误日志
tail -f logs/daily_$(date +%Y-%m-%d).error.log

# 搜索特定错误
grep -i "error\|fail\|critical" logs/daily_*.log

# 查看审计日志
cat logs/audit_$(date +%Y-%m-%d).log
```

## Cron 配置

### 推荐配置

```bash
# 编辑 crontab
crontab -e

# 添加以下条目

# 每日凌晨2点运行主任务
0 2 * * * cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map && bash scripts/etl/daily_master_job.sh >> logs/cron.log 2>&1

# 每小时运行监控检查
0 * * * * cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map && node scripts/etl/monitor.js check --all >> logs/monitor_cron.log 2>&1

# 每周日凌晨3点创建归档备份
0 3 * * 0 cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map && bash scripts/etl/backup_manager.sh level3 weekly >> logs/backup_cron.log 2>&1

# 每月1日凌晨4点创建月度归档
0 4 1 * * cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map && bash scripts/etl/backup_manager.sh level3 monthly >> logs/backup_cron.log 2>&1

# 每日凌晨1点清理旧备份
0 1 * * * cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map && bash scripts/etl/backup_manager.sh cleanup >> logs/cleanup_cron.log 2>&1
```

## 性能优化

### 调整并发度

在 `pipeline_orchestrator.js` 中修改：

```javascript
const CONFIG = {
  maxConcurrency: 2,  // 根据系统资源调整
  defaultTimeoutMinutes: 30,
  // ...
}
```

### 调整重试配置

```javascript
const CONFIG = {
  maxRetries: 3,
  retryDelayMs: 5000,
  retryBackoffMultiplier: 2,
  // ...
}
```

## 安全注意事项

1. **备份文件权限** - 确保备份文件权限设置为 `600` 或 `640`
2. **Discord Webhook** - 不要将 webhook URL 提交到版本控制
3. **日志清理** - 定期清理包含敏感信息的日志
4. **锁文件** - 手动删除锁文件前务必确认没有相关进程在运行

## 扩展开发

### 添加新的监控检查器

```javascript
// scripts/etl/monitor.js
class MyCustomChecker extends BaseChecker {
  constructor() {
    super('My Custom Check');
  }
  
  async check() {
    // 实现检查逻辑
    if (someCondition) {
      this.addResult('ok', 'Everything is fine');
    } else {
      this.addResult('warning', 'Something needs attention');
    }
    return this.results;
  }
}

// 在 MonitoringEngine 构造函数中添加
this.checkers = [
  // ... existing checkers
  new MyCustomChecker()
];
```

### 添加新的管道阶段

```javascript
// scripts/etl/pipeline_orchestrator.js
const PIPELINE_DEFINITION = {
  // ... existing phases
  my_new_phase: {
    name: 'My New Phase',
    description: 'Description of what this phase does',
    dependsOn: ['previous_phase'],
    parallel: false,
    timeout: 15,
    tasks: [
      {
        id: 'my_task',
        name: 'My Task',
        command: ['node', 'scripts/my_script.js'],
        timeout: 10,
        retryable: true,
        critical: true
      }
    ]
  }
};
```

## 更新日志

### v2.0 (2026-02-18)

- ✨ 全新设计的每日主任务脚本，支持完整错误处理
- ✨ DAG风格的管道编排器，支持断点续传
- ✨ 三级备份策略（实时/每日/归档）
- ✨ 多维度监控告警系统
- ✨ 统一快捷命令 (`./etl`)
- ✨ 完整的运维文档

## 联系与支持

如有问题或建议，请参考项目文档或联系维护团队。
