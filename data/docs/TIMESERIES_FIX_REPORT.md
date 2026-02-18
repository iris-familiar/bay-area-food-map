# 时间序列数据映射修正报告

## 执行时间
2026-02-16

## 问题描述
原始数据存在时间序列映射错误：
- 真实帖子日期：2024-06 ~ 2025-08（分散在一年多）
- 之前daily_metrics日期：2026-01-18 ~ 2026-02-16（错误地合成到30天）
- 结果：所有餐厅热度每天相同，趋势为0

## 修正策略
采用双轨策略：
1. **直接匹配**：通过餐厅名称在帖子内容中搜索，直接关联帖子日期
2. **合成生成**：对于无直接匹配的餐厅，基于总engagement和帖子数，在真实日期范围内生成合理分布

## 数据来源
- 帖子详情：82条帖子
- 日期范围：2024-06-10 ~ 2026-01-30
- 涉及日期：49个不同日期

## 处理结果

### 统计概览
| 指标 | 数值 |
|------|------|
| 餐厅总数 | 49 |
| 直接匹配 | 11 (22%) |
| 合成生成 | 38 (78%) |
| 平均时间点数 | 1.7 |
| 最大时间点数 | 9 |

### 时间线最丰富的餐厅
1. 王家味 - 9个时间点
2. 顾湘 - 7个时间点
3. 肖婆婆砂锅 - 5个时间点
4. Z&Y Restaurant - 3个时间点
5. Shanghai Flavor - 3个时间点

### 数据结构
每个餐厅新增 `time_series` 字段：
```json
{
  "time_series": {
    "timeline": [
      {"date": "2024-06-10", "engagement": 45, "posts": 1},
      {"date": "2024-12-15", "engagement": 120, "posts": 2}
    ],
    "first_mentioned": "2024-06-10",
    "peak_discussion_date": "2024-12-15",
    "total_engagement": 245,
    "trend_7d": 15,
    "trend_30d": -5,
    "data_source": "direct_match|synthetic",
    "matched_posts": 2
  }
}
```

## UI更新
1. **卡片视图**：添加mini sparkline图表展示时间线趋势
2. **详情弹窗**：
   - 完整时间线图表
   - 首次提及日期
   - 讨论高峰日期
   - 7天/30天趋势对比
3. **排序功能**：支持按趋势排序

## 文件变更
- `data/current/restaurant_database.json` - 更新版本3.4-timeseries-fixed-v2
- `data/archive/restaurant_database_timeseries_fixed_20260216Txxxx.json` - 备份
- `index.html` - 添加时间序列可视化
- `scripts/fix_timeseries_v3.js` - 数据处理脚本

## 后续优化建议
1. 增加更多帖子数据以提高直接匹配率
2. 实现餐厅名称同义词匹配（如"留湘"= "Ping's Bistro"）
3. 添加季节性趋势分析
4. 实现实时趋势更新
