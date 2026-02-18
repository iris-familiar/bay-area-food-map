# UI数据格式文档

## 概述

Serving层数据格式专为前端UI优化，支持向后兼容现有index.html，同时提供增强的数据字段。

## 数据文件

| 文件 | 路径 | 描述 |
|------|------|------|
| serving_data.json | `serving/data/serving_data.json` | 完整数据 |
| serving_data_light.json | `serving/data/serving_data_light.json` | 移动端优化轻量版 |
| search_index.json | `serving/data/search_index.json` | 搜索索引 |
| stats.json | `serving/data/stats.json` | 预计算统计 |

## 数据格式

### 根对象

```json
{
  "version": "3.0.0",
  "updated_at": "2026-02-18T12:00:00.000Z",
  "total_count": 79,
  "restaurants": [...],
  "metadata": {
    "source_version": "10.1-1",
    "source_updated": "2026-02-18T10:00:00.000Z",
    "export_time": "2026-02-18T12:00:00.000Z"
  }
}
```

### 餐厅对象 (Restaurant)

```json
{
  "id": "r001",
  "xiaohongshu_id": "r001",
  "name": "留湘小聚",
  "name_en": "",
  "cuisine": "湘菜",
  "area": "Fremont",
  "city": "Fremont",
  "region": "East Bay",
  "address": "2090 Warm Springs Ct Ste 140, Fremont, CA 94539, USA",
  "engagement": 8482,
  "sentiment_score": 0.86,
  "google_rating": 4.2,
  "mention_count": 4,
  "total_engagement": 8482,
  "recommendations": ["傣味香茅草烤鱼", "牛肝菌青椒牛肉炒饭"],
  "recommendations_source": "llm_extracted",
  "post_details": [...],
  "sentiment_details": {
    "positive_mentions": 3,
    "negative_mentions": 0,
    "analyzed_contexts": 3
  },
  "sentiment_confidence": "low",
  "semantic_tags": {
    "scenes": ["group-dining"],
    "vibes": ["authentic", "lively"],
    "practical": ["spicy"]
  },
  "google_place_id": "ChIJ...",
  "verified": false,
  "trend_30d": 0,
  "timeseries": {
    "monthly": [...],
    "last_6m": [...]
  },
  "ui_display": {...},
  "merge_info": {...},
  "updated_at": "2026-02-18T12:00:00.000Z"
}
```

### UI展示字段 (ui_display)

专为前端渲染优化的预计算字段：

```json
{
  "ui_display": {
    "engagement_formatted": "8.5k",
    "sentiment_percentage": 86,
    "sentiment_color": "green",
    "google_rating_color": "blue",
    "region_label": "东湾",
    "cuisine_icon": "🌶️",
    "top_tags": [
      { "type": "sentiment", "label": "口碑极佳", "color": "green" },
      { "type": "engagement", "label": "热门", "color": "orange" }
    ]
  }
}
```

#### 字段说明

| 字段 | 类型 | 描述 |
|------|------|------|
| `engagement_formatted` | string | 格式化的讨论度 (如 "8.5k", "1.2w") |
| `sentiment_percentage` | number | 口碑分数百分比 (0-100) |
| `sentiment_color` | string | 口碑颜色标识: green/blue/orange/gray |
| `google_rating_color` | string | Google评分颜色: green/blue/orange/red/gray |
| `region_label` | string | 区域中文标签 |
| `cuisine_icon` | string | 菜系emoji图标 |
| `top_tags` | array | 顶部展示标签数组 |

### 时间序列数据 (timeseries)

```json
{
  "timeseries": {
    "monthly": [
      { "month": "2024-03", "value": 120 },
      { "month": "2024-04", "value": 350 },
      ...
    ],
    "last_6m": [
      { "month": "2025-09", "value": 520 },
      ...
    ]
  }
}
```

### 帖子详情 (post_details)

```json
{
  "post_details": [
    {
      "post_id": "67ba7dae00000000290119d8",
      "title": "湾区中餐超全超真诚推荐",
      "date": "2025-02-22",
      "engagement": 4149,
      "context": ""
    }
  ]
}
```

## 向后兼容

### 现有index.html兼容性

Serving层数据完全兼容现有index.html的字段期望：

| index.html使用 | Serving层提供 | 兼容性 |
|----------------|---------------|--------|
| `restaurants[].id` | ✓ | 完全兼容 |
| `restaurants[].name` | ✓ | 完全兼容 |
| `restaurants[].cuisine` | ✓ | 完全兼容 |
| `restaurants[].city` | ✓ | 兼容 (从area映射) |
| `restaurants[].area` | ✓ | 完全兼容 |
| `restaurants[].region` | ✓ | 完全兼容 |
| `restaurants[].engagement` | ✓ | 完全兼容 |
| `restaurants[].sentiment_score` | ✓ | 完全兼容 |
| `restaurants[].google_rating` | ✓ | 完全兼容 |
| `restaurants[].address` | ✓ | 完全兼容 |
| `restaurants[].recommendations` | ✓ | 完全兼容 |
| `restaurants[].post_details` | ✓ | 完全兼容 |

### 迁移路径

现有UI无需修改即可工作。如需使用新功能：

1. **使用预计算ui_display字段**:
   ```javascript
   // 旧方式
   const sentimentPct = r.sentiment_score ? Math.round(r.sentiment_score * 100) : '-';
   
   // 新方式
   const sentimentPct = r.ui_display.sentiment_percentage;
   ```

2. **使用时间序列图表数据**:
   ```javascript
   const chartData = r.timeseries.monthly;
   ```

## 轻量版格式 (serving_data_light.json)

专为移动端优化的精简格式：

```json
{
  "version": "3.0.0",
  "updated_at": "2026-02-18T12:00:00.000Z",
  "total_count": 79,
  "restaurants": [
    {
      "id": "r001",
      "name": "留湘小聚",
      "cuisine": "湘菜",
      "region": "East Bay",
      "engagement": 8482,
      "sentiment_score": 0.86,
      "google_rating": 4.2,
      "recommendations": ["菜品1", "菜品2", "菜品3"],
      "ui_display": {...}
    }
  ]
}
```

**轻量版vs完整版对比:**

| 特性 | 完整版 | 轻量版 |
|------|--------|--------|
| 文件大小 | ~130KB | ~45KB |
| post_details | 完整(5条) | 无 |
| timeseries | 完整 | 无 |
| sentiment_details | 完整 | 无 |
| semantic_tags | 完整 | 无 |
| 推荐菜品 | 全部 | 最多3个 |

## API响应格式

### 标准响应结构

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-18T12:00:00.000Z",
    "response_time_ms": 12
  }
}
```

### 分页响应

```json
{
  "success": true,
  "data": {
    "restaurants": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 79,
      "total_pages": 4,
      "has_next": true,
      "has_prev": false
    }
  },
  "meta": { ... }
}
```

## 枚举值

### 区域 (Region)

| 值 | 中文标签 |
|-----|----------|
| South Bay | 南湾 |
| East Bay | 东湾 |
| Peninsula | 半岛 |
| San Francisco | 旧金山 |
| Other | 其他 |

### 颜色标识

| 颜色 | 含义 |
|------|------|
| green | 优秀/高分 |
| blue | 良好 |
| orange | 一般 |
| red | 低分/警告 |
| gray | 无数据 |

### 菜系图标

| 菜系 | 图标 |
|------|------|
| 川菜 | 🌶️ |
| 湘菜 | 🌶️ |
| 日料 | 🍣 |
| 韩餐 | 🍲 |
| 中餐 | 🥢 |
| 上海菜 | 🥟 |
| 融合菜 | 🍽️ |
| 西餐 | 🍕 |
| 火锅 | 🍲 |
| 烧烤 | 🍖 |
| 其他 | 🍴 |

## 性能指标

| 操作 | 目标 | 实际 |
|------|------|------|
| 数据加载 | < 50ms | ~30ms |
| 列表查询 | < 100ms | ~20ms |
| 搜索响应 | < 100ms | ~15ms |
| 详情查询 | < 50ms | ~5ms |
| API响应 | < 100ms | ~12ms |
