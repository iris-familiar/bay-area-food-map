# 数据重建报告 v8.1 - 完整版

## 数据规模
- **总餐厅数**: 76家
- **原始帖子**: 82个post文件
- **数据版本**: 8.1-clean

## 数据来源验证

### 1. 核心数据（原始提取）
| 字段 | 来源 | 验证方法 |
|------|------|----------|
| `name` | post title/desc文本匹配 | 可追溯到具体posts |
| `cuisine` | 帖子中提到的菜系 | 文本关键词匹配 |
| `area` | Google Places地址提取 | API返回的真实地址 |
| `total_engagement` | post interactInfo计算 | likes + comments + collected |
| `mention_count` | 统计sources数组长度 | 与sources.length一致 |

### 2. 计算metrics（从原始文本计算）
| 字段 | 计算方法 | 真实性 |
|------|----------|--------|
| `sentiment_score` | 情感分析: 正面词/总词数 | ✅ 基于帖子文本真实计算 |
| `trend_30d` | 最近30天讨论度/总讨论度 × 100 | ✅ 基于日期真实计算 |
| `recommendations` | 从文本提取菜品关键词 | ✅ 基于文本真实提取 |

### 3. Google数据（API验证）
| 字段 | 来源 | 真实性 |
|------|------|--------|
| `google_rating` | Google Places API | ✅ 100%真实 |
| `google_place_id` | Google Places API | ✅ 100%真实 |
| `address` | Google Places API | ✅ 100%真实 |
| `verified` | API验证标记 | ✅ 100%真实 |

## 计算方法详情

### 口碑 (sentiment_score)
```javascript
// 从帖子文本进行情感分析
positiveWords = ['好吃', '不错', '推荐', '喜欢', '爱', '正宗', '美味'...]
negativeWords = ['难吃', '失望', '踩雷', '不好吃', '差'...]

sentiment_score = 0.3 + (positiveCount / totalCount) * 0.7
// 范围: 0.3-0.95
```

### 趋势 (trend_30d)
```javascript
// 基于最近30天的讨论度占比
recentPosts = posts.filter(p => p.date在30天内)
recentEngagement = recentPosts.sum(p => p.engagement)
trend_30d = (recentEngagement / totalEngagement) * 100
// 范围: 0-100
```

### 推荐菜 (recommendations)
```javascript
// 从帖子文本提取菜品关键词
dishKeywords = ['牛肉', '鱼', '鸡', '虾', '面', '饺子'...]
extracted = 在餐厅名附近出现的菜品词
```

## 重要教训

### ❌ 之前的错误
使用了 `fix_data_fields.js` 编造数据：
- sentiment_score = 0.7 + (mentionCount-1) × 0.05 ❌
- trend_30d = mentionCount × 5 ❌
- recommendations = 按菜系硬编码 ❌

### ✅ 现在的做法
所有metrics必须从原始数据**真实计算**，绝不编造。

## QA验证

```bash
# 验证所有数据可追溯
node scripts/verify_provenance.js

# 验证metrics计算方法
node scripts/calculate_real_metrics.js

# 全局QA检查
node qa/global-qa.js
```

## 文件位置

```
data/
├── current/
│   ├── restaurant_database.json          # 主数据库（76家）
│   ├── restaurant_database_v5_ui.json    # UI使用副本
│   └── search_mapping.json               # 语义搜索映射
├── raw/
│   └── v2/
│       └── posts/                        # 82个原始post文件
└── docs/
    ├── DATA_INTEGRITY_LESSON.md          # 数据完整性教训
    └── DATA_REBUILD_REPORT.md            # 本文件
```

## 后续工作

- [ ] 持续监控数据质量
- [ ] 定期验证Google Places数据 freshness
- [ ] 增量更新时保持溯源链

---
**记录时间**: 2026-02-16  
**数据版本**: 8.1-clean  
**餐厅数量**: 76家（全部可追溯）
