# SKILL: Bay Area Food Map

## Description
湾区美食地图 - 一个支持语义搜索的餐厅推荐Web应用

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │  Search UI  │  │  Filters    │  │  Restaurant Grid │    │
│  └──────┬──────┘  └─────────────┘  └──────────────────┘    │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Semantic Search Layer                    │
│  ┌──────────────────┐      ┌──────────────────────────┐    │
│  │  Keyword Match   │ ──▶  │  Scene ID Lookup         │    │
│  │  (约会/聚餐/便宜) │      │  search_mapping.json     │    │
│  └──────────────────┘      └────────────┬─────────────┘    │
└─────────────────────────────────────────┼───────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │ restaurant_db    │  │ search_mapping               │    │
│  │ (restaurants)    │  │ (scene → restaurant IDs)     │    │
│  └──────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Frontend (index.html)
- **Search Input**: 支持关键词搜索
- **Scene Detection**: `findSceneId()` 匹配搜索词到场景
- **Filtering**: 菜系筛选 + 场景筛选组合
- **Sorting**: 口碑优先/热门优先/评分最高/上升趋势

### 2. Search Mapping System
- **YAML Config** (`data/search_mapping.yaml`): 场景定义、关键词列表
- **JSON Mapping** (`data/current/search_mapping.json`): 场景→餐厅ID列表
- **Auto-generation**: 根据semantic_tags自动计算匹配度并排序

### 3. Data Pipeline
- **Source**: restaurant_database.json (含semantic_tags, metrics)
- **Processing**: update-search-mapping.js 自动生成映射
- **Output**: search_mapping.json (供前端直接使用)

## Semantic Search Logic

```javascript
// 搜索流程
userQuery → findSceneId() → sceneId → mappings[sceneId] → sortedRestaurantIds

// 示例
"约会" → "date" → ["r006", "r007", "r019", ...] → 按顺序显示餐厅
```

### Supported Scenes (14个场景)

| 类别 | 场景 | 关键词示例 |
|------|------|-----------|
| 场景 | 约会 | 约会, 浪漫, 情侣, date |
| 场景 | 聚餐 | 聚餐, 聚会, 朋友, group |
| 场景 | 家庭 | 家庭, 带孩子, 亲子, family |
| 场景 | 商务 | 商务, 宴请, business |
| 场景 | 一人食 | 一人, 独自, solo |
| 氛围 | 安静 | 安静, 私密, quiet |
| 氛围 | 热闹 | 热闹, 烟火气, lively |
| 氛围 | 高档 | 高档, 高级, fancy |
| 氛围 | 正宗 | 正宗, 地道, authentic |
| 实用 | 实惠 | 便宜, 性价比, cheap |
| 实用 | 辣味 | 辣, 麻辣, spicy |
| 实用 | 好停车 | 停车, parking |
| 实用 | 不排队 | 不排队, no-wait |
| 实用 | 健康 | 健康, 清淡, healthy |

## Maintenance Workflow

### When to Maintain
- 新增餐厅
- 餐厅semantic_tags更新
- 口碑分数大幅变化
- 用户反馈搜索结果不准确
- 每月定期检查

### How to Maintain

```bash
# 方法1: 使用快捷脚本
cd projects/bay-area-food-map
./maintain.sh

# 方法2: 直接运行
node scripts/update-search-mapping.js
```

### Maintenance Steps

1. **Run Script**: 自动生成新的映射
2. **Review Output**: 检查映射统计和未匹配餐厅
3. **Manual Adjust** (optional): 编辑 `search_mapping.yaml` 调整优先级
4. **Regenerate**: 如有手动修改，重新运行脚本
5. **Test**: 打开 `index.html` 验证关键搜索词
6. **Commit**: git commit 保存变更

### Key Files

| 文件 | 用途 | 编辑方式 |
|------|------|---------|
| `data/search_mapping.yaml` | 场景配置源 | ✅ 手工编辑 |
| `data/current/search_mapping.json` | 前端映射数据 | ❌ 自动生成 |
| `data/current/restaurant_database.json` | 餐厅数据 | ❌ 数据流程生成 |
| `scripts/update-search-mapping.js` | 维护脚本 | ⚠️ 修改规则时编辑 |

## Adding New Scenes

1. Edit `data/search_mapping.yaml`:
```yaml
scenes:
  new_scene:
    name: "新场景"
    keywords: ["关键词1", "关键词2"]
```

2. Update `scripts/update-search-mapping.js`:
```javascript
SCENE_RULES.new_scene = {
  scenes: ['对应tag'],
  vibes: ['对应vibe'],
  minSentiment: 0.6
};
```

3. Run maintenance script

## Data Requirements

### 数据来源政策
**核心原则**: 所有metrics必须从原始数据计算或API获取，**绝不编造**。

#### 1. 原始提取数据 (from Xiaohongshu posts)
| 字段 | 来源 | 验证方法 |
|------|------|----------|
| `name` | 帖子title/desc文本匹配 | 可追溯到具体post文件 |
| `cuisine` | 帖子中明确提到的菜系 | 文本关键词匹配 |
| `total_engagement` | post.interactInfo计算 | likes + comments + collected |
| `mention_count` | sources数组长度 | 与sources.length一致 |
| `post_details` | 原始post元数据 | 包含date, engagement, title |

#### 2. 计算metrics (从原始文本真实计算)
| 字段 | 计算方法 | 可追溯性 |
|------|----------|----------|
| `sentiment_score` | 情感分析: 统计正面/负面词占比 | 基于帖子文本 |
| `trend_30d` | 最近30天讨论度/总讨论度 × 100 | 基于post日期分布 |
| `recommendations` | 从帖子文本提取菜品关键词 | 基于文本内容 |

#### 3. API验证数据 (from Google Places)
| 字段 | 来源 | 验证状态 |
|------|------|----------|
| `google_rating` | Google Places API | verified=true |
| `google_place_id` | Google Places API | verified=true |
| `address` | Google Places API | verified=true |
| `area` | 从address字段提取 | API返回的真实城市 |

### 计算方法

```javascript
// 口碑计算 (sentiment_score)
const positiveWords = ['好吃', '不错', '推荐', '喜欢', '爱', '正宗', '美味'...]
const negativeWords = ['难吃', '失望', '踩雷', '不好吃', '差'...]
sentiment_score = 0.3 + (positiveCount / totalCount) * 0.7

// 趋势计算 (trend_30d)
const recentPosts = posts.filter(p => p.date在30天内)
const recentEngagement = recentPosts.sum(p => p.engagement)
trend_30d = (recentEngagement / totalEngagement) * 100

// 推荐菜提取 (recommendations)
const dishKeywords = ['牛肉', '鱼', '鸡', '虾', '面', '饺子'...]
recommendations = 在餐厅名附近出现的菜品词
```

### 餐厅数据Schema
```json
{
  "id": "r001",
  "name": "餐厅名",
  "cuisine": "菜系",
  "area": "城市",
  "verified": true,
  "sources": ["post_id1", "post_id2"],
  "total_engagement": 4852,
  "mention_count": 5,
  "sentiment_score": 0.83,
  "sentiment_details": {
    "positive_mentions": 3,
    "negative_mentions": 0,
    "analyzed_contexts": 3
  },
  "trend_30d": 0,
  "google_rating": 4.2,
  "google_place_id": "ChIJ...",
  "address": "真实地址",
  "recommendations": ["牛肉", "鱼", "饭"],
  "recommendations_source": "extracted",
  "post_details": [...]
}
```

### 错误示例 (禁止做法)
```javascript
// ❌ 错误：编造数据
sentiment_score = 0.7 + (mentionCount - 1) * 0.05  // 假的
trend_30d = mentionCount * 5                        // 假的
recommendations = cuisinePreset[cuisine]           // 假的

// ✅ 正确：从真实数据计算
sentiment_score = calculateFromText(postText)
trend_30d = calculateFromDates(postDates)
recommendations = extractFromText(postText)
```

## Troubleshooting

**搜索无结果**
- 检查关键词是否在 mapping 中
- 检查场景是否有匹配的餐厅
- 检查餐厅是否被 filterAsianRestaurants 过滤

**排序不合理**
- 检查 restaurant_mappings 中的顺序
- 检查口碑分数是否准确
- 手动调整 YAML 中的优先级

**新餐厅搜不到**
- 确认 semantic_tags 完整
- 运行维护脚本
- 检查未匹配餐厅警告

## Best Practices

1. **自动化优先**: 依赖脚本生成，减少手工维护
2. **定期回顾**: 每月检查一次映射效果
3. **渐进优化**: 根据实际搜索日志持续改进
4. **版本控制**: 每次更新后 git commit
5. **测试验证**: 维护后测试关键搜索词

## QA Workflow (质量保证工作流)

每次重大改动后自动运行全局QA验证，确保数据完整性和前后端一致性。

### 架构
```
QA Orchestrator
    ├── Backend QA Agent (数据验证)
    │   ├── 数据文件完整性
    │   ├── Schema验证
    │   ├── 交叉引用检查
    │   └── 统计指标
    ├── Frontend QA Agent (UI验证)
    │   ├── 文件结构检查
    │   ├── HTML元素验证
    │   ├── 数据加载测试
    │   └── JavaScript函数检查
    └── Compare Notes (交叉验证)
        ├── 数据一致性对比
        ├── 问题汇总
        └── 部署建议
```

### 使用方法

```bash
# 运行完整QA
./qa.sh

# 仅后端QA
./qa.sh backend

# 仅前端QA
./qa.sh frontend

# 查看最新报告
./qa.sh report
```

### 触发条件
- ✅ 数据更新后自动运行
- ✅ 代码改动后自动运行
- ✅ 每日定时检查
- ✅ 用户明确要求时

### 报告解读
- **PASSED** ✅ - 全部通过，可以部署
- **PASSED_WITH_WARNINGS** ⚠️ - 有警告但可部署
- **FAILED** ❌ - 关键问题，需修复

### 关键检测项
| 检查项 | 说明 |
|--------|------|
| Data Consistency | 前后端餐厅数量必须匹配 |
| Verification Rate | Google验证覆盖率 |
| Schema Validation | 数据字段完整性 |
| Data Loading | 前端能否成功加载数据 |

## Dependencies

- Node.js (for maintenance scripts)
- js-yaml (npm package)

## Files

- `index.html` - 主应用
- `data/search_mapping.yaml` - 搜索配置
- `data/current/search_mapping.json` - 生成的映射
- `scripts/update-search-mapping.js` - 维护脚本
- `maintain.sh` - 快捷维护脚本
- `docs/MAINTENANCE.md` - 详细维护指南
- `qa.sh` - **QA工作流入口**
- `qa/qa-orchestrator.js` - QA协调器
- `qa/reports/` - QA报告存储
