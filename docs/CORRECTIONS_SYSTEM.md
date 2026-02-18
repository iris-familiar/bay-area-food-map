# 数据修正系统说明

## 概述

为确保人工修复的数据不会被后续cron job覆盖，我们建立了**持久化修正系统**。

## 核心组件

### 1. 修正记录文件
**路径**: `data/corrections.json`

包含所有需要持久化的修正：
- `restaurant_corrections`: 餐厅Google数据修正
- `id_mapping`: ID映射关系（处理重复ID重分配）
- `matching_rules`: 匹配规则配置

### 2. 修正应用脚本
**路径**: `scripts/apply_corrections.js`

由pipeline在最后一步自动调用，将修正应用到数据库。

### 3. Pipeline集成
**修改文件**: `scripts/cron_daily_v5.sh`

在Step 7（归档前）调用修正脚本，确保：
```
数据采集 → 处理 → 构建数据库 → [应用修正] → 归档
```

## 如何添加新的修正

### 场景1: 修正Google匹配错误

编辑 `data/corrections.json`，在 `restaurant_corrections` 数组中添加：

```json
{
  "id": "r013",
  "name": "鲜味水饺",
  "corrections": {
    "google_place_id": "ChIJ7QMGuJO3j4ARbOM9BefOFFY",
    "google_name": "Umami Dumpling House",
    "address": "Mary Manor Shopping Center, #1, Sunnyvale, CA 94086, USA",
    "google_rating": 4.6,
    "verified": true
  },
  "reason": "用英文名重新搜索匹配"
}
```

### 场景2: 处理重复ID

当发现两个餐厅共享同一个ID时：

1. 在 `id_mapping` 中添加映射关系
2. 为重复的餐厅分配新的ID
3. 分别添加修正记录

示例：
```json
"id_mapping": {
  "r079": { "original_id": "r013", "name": "面面俱到" }
}
```

## 工作原理

### Cron Job执行流程

1. **Step 1-5**: 正常数据采集和处理
2. **Step 6**: 构建数据库（可能覆盖之前的修复）
3. **Step 7**: 调用 `apply_corrections.js`
   - 读取 `corrections.json`
   - 遍历所有修正记录
   - 应用修正到数据库
   - 添加修正标记
4. **Step 8**: 归档最终数据

### 修正优先级

修正数据 > Pipeline自动匹配数据

即使pipeline产生了错误的匹配，修正系统会在最后一步覆盖为正确数据。

## 当前已修正的餐厅

| ID | 名称 | 修正内容 |
|----|------|----------|
| r013 | 鲜味水饺 | Google数据重新匹配 |
| r008 | 重庆铺盖面 | 地址和Google信息修正 |
| r079 | 面面俱到 | 新增Google匹配 |
| r080-r084 | 多家餐厅 | 新增Google数据 |

## 验证修正是否生效

运行以下命令测试：

```bash
node scripts/apply_corrections.js
cat data/current/restaurant_database_v5_ui.json | jq '.restaurants[] | select(.id == "r013") | {name, google_name, address}'
```

## 注意事项

1. **不要直接修改数据库文件** - 所有修正都应通过 `corrections.json`
2. **保留修正历史** - 不要删除旧的修正记录
3. **测试后再提交** - 修改corrections.json后先本地测试
4. **ID稳定性** - 一旦分配了新ID（如r079-r084），不要再次更改

## 未来改进

- [ ] 添加修正版本号，支持历史回滚
- [ ] 建立修正审核流程
- [ ] 自动检测pipeline匹配错误并提醒
- [ ] 将修正规则反馈到matching算法中
