# Data Pipeline 全面审查报告
## Reviewed by Senior Data Engineer
## Date: 2025-02-17

## 🔴 CRITICAL ISSUES (必须立即修复)

### 1. 数据库文件不一致风险
**问题**: Pipeline同时操作多个数据库文件
- `restaurant_database.json` (主文件)
- `restaurant_database_v5_ui.json` (UI版本)
- `restaurant_database_v5_full_content.json` (完整内容)

**风险**: 
- 不同脚本可能读取/写入不同文件
- 修正只应用到其中一个，其他文件仍是旧数据
- 导致UI显示和实际数据不一致

**建议**: 
```bash
# 应该只有一个数据源，其他都是符号链接或构建产物
/data/current/
  └── restaurant_database.json (唯一数据源)
  └── restaurant_database_v5_ui.json -> symlink to above
```

---

### 2. 缺乏事务性保证
**问题**: 如果pipeline中途失败，数据可能处于不一致状态

**示例场景**:
1. Step 3.2: auto_quality_fix.js 合并了重复餐厅
2. Step 3.3: apply_corrections.js 运行前，脚本崩溃
3. 结果: 数据部分修改，但没有corrections标记

**建议**: 实现事务机制
```bash
# 每次运行前备份
cp restaurant_database.json restaurant_database.backup.json

# 所有步骤成功后，才删除备份
# 失败时自动恢复
```

---

### 3. 没有数据血缘追踪
**问题**: 无法追溯某个餐厅数据来自哪个帖子、何时更新

**当前**: 
```json
{
  "name": "鲜味水饺",
  "total_engagement": 4852
  // 不知道这个数据何时计算、是否最新
}
```

**建议**:
```json
{
  "name": "鲜味水饺",
  "data_lineage": {
    "last_updated": "2025-02-17T11:30:00Z",
    "updated_by": "daily_master_job",
    "source_posts": ["post_id_1", "post_id_2"],
    "engagement_calculated_at": "2025-02-17T11:35:00Z"
  }
}
```

---

## 🟡 HIGH PRIORITY ISSUES (强烈建议修复)

### 4. 缺乏数据质量监控
**问题**: 没有自动检测数据异常的机制

**需要的监控**:
- 每日新增餐厅数量异常波动 (昨天+2，今天+50?)
- Engagement数值异常 (突然变成负数?)
- 重复餐厅比例 (超过10%应报警)
- Google匹配成功率下降

**建议**: 添加监控脚本
```javascript
// data_quality_monitor.js
if (newRestaurantsCount > 20) {
  alert('今日新增餐厅过多，可能存在误报');
}
if (duplicateRatio > 0.1) {
  alert('重复餐厅比例过高: ' + duplicateRatio);
}
```

---

### 5. 没有增量更新机制
**问题**: 每次corrections.json更新，都要重新运行整个pipeline

**当前流程**:
1. 修改corrections.json
2. 等待明天11:00 AM pipeline运行
3. 或者手动运行apply_corrections.js

**建议**: 文件变更监听
```bash
# 使用inotify或fswatch
# corrections.json 修改后，立即触发apply_corrections.js
```

---

### 6. 缺乏回滚机制
**问题**: 如果auto_quality_fix.js产生了错误合并，如何撤销？

**当前**: 没有历史版本，无法回滚

**建议**:
```bash
# 保留最近7天的版本
data/archive/
  ├── restaurant_database_20250217_110000.json
  ├── restaurant_database_20250216_110000.json
  └── ...

# 回滚脚本
./scripts/rollback.sh 20250216_110000
```

---

### 7. 单点故障风险
**问题**: 所有数据在一个JSON文件中

**风险**:
- 文件损坏 = 全部数据丢失
- 并发写入可能损坏文件
- 文件变大后读写性能下降

**建议**: 
```
考虑迁移到SQLite或轻量级数据库
或至少分片存储:
/data/restaurants/
  ├── r001.json
  ├── r002.json
  └── ...
```

---

## 🟢 MEDIUM PRIORITY ISSUES (建议优化)

### 8. 缺乏数据验证Schema
**问题**: 没有强制检查数据格式

**可能的错误**:
- `google_rating` 应该是数字，但有人写成字符串 "4.5"
- `location.lat` 超出有效范围 (-90, 90)
- 必填字段缺失

**建议**: JSON Schema验证
```javascript
const schema = {
  type: 'object',
  required: ['id', 'name'],
  properties: {
    google_rating: { type: 'number', minimum: 0, maximum: 5 }
  }
};
```

---

### 9. 没有A/B测试能力
**问题**: 无法对比不同匹配算法的效果

**场景**: 想测试新的Google匹配算法，但不敢直接替换

**建议**: 
```
restaurant_database.json (当前生产版本)
restaurant_database_experiment.json (新版本)
# 对比两个版本的数据质量差异
```

---

### 10. 日志过于分散
**问题**: 每天产生多个日志文件
```
logs/daily_20250217.log
logs/bloggers.log
logs/comments.log
logs/recursive.log
logs/quality_fix.log
logs/corrections.log
...
```

**难以**: 
- 追踪某个餐厅的完整生命周期
- 排查问题需要打开多个文件

**建议**: 结构化日志 + 集中存储
```json
{
  "timestamp": "2025-02-17T11:30:00Z",
  "restaurant_id": "r013",
  "event": "google_match_updated",
  "old_value": "...",
  "new_value": "...",
  "source": "auto_quality_fix"
}
```

---

## 🔵 LOW PRIORITY (锦上添花)

### 11. 缺少数据可视化
- 每日新增餐厅趋势图
- 重复餐厅比例变化
- Engagement增长曲线

### 12. 没有自动化测试
- 每次修改脚本后，应该自动跑测试用例
- 确保不会破坏现有功能

### 13. 缺乏文档
- 数据字段含义
- Pipeline架构图
- 故障排查指南

---

## 📊 总结

| 优先级 | 数量 | 关键问题 |
|--------|------|----------|
| 🔴 Critical | 3 | 文件不一致、无事务、无血缘 |
| 🟡 High | 4 | 无监控、无增量、无回滚、单点故障 |
| 🟢 Medium | 3 | 无Schema、无A/B测试、日志分散 |
| 🔵 Low | 3 | 可视化、测试、文档 |

**最紧急修复**:
1. 统一数据库文件（消除不一致风险）
2. 添加事务备份机制
3. 添加数据质量监控

**是否需要我立即修复Critical Issues？**
