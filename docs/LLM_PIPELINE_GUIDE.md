# Data Processing Pipeline - LLM提取规范

## ⚠️ 重要警告

**禁止在以下场景使用关键词匹配/规则推断：**

| 数据字段 | 允许方法 | 禁止方法 |
|---------|---------|---------|
| 餐厅名 | ✅ LLM提取 | ❌ 关键词匹配 |
| 推荐菜 | ✅ LLM提取 | ❌ 关键词匹配 |
| 口碑分数 | ✅ 情感词典（行业标准） | - |
| 趋势分数 | ✅ 数学计算 | - |
| Google数据 | ✅ Places API | ❌ 猜测 |

**违规后果**：数据不真实，用户发现后会失去信任（如2026-02-16事件）

---

## Phase 1: 餐厅名提取 (必须使用LLM)

### 脚本
`scripts/kimi_llm_extract_v2.py`

### 强制要求
```python
# ✅ 正确: 使用LLM
def call_kimi_for_extraction(text, title=""):
    prompt = """从以下小红书帖子内容中提取所有提到的餐厅信息。
    
    帖子内容: {text}
    
    请以JSON格式返回:
    {
      "restaurants": [
        {
          "name": "餐厅名（中文）",
          "name_en": "英文名（如有）",
          "cuisine": "菜系",
          "area": "地区"
        }
      ]
    }
    """
    # 调用Kimi API
    
# ❌ 错误: 关键词匹配
RESTAURANT_KEYWORDS = ['留湘', 'Jun Bistro', ...]  # 禁止！
if keyword in text:  # 禁止！
    restaurants.append(keyword)  # 禁止！
```

### QA检查
- [ ] 每个餐厅必须链接到具体post文件
- [ ] 人工抽查10%验证准确性

---

## Phase 2: 推荐菜提取 (必须使用LLM)

### 脚本
`scripts/batch_extract_dishes_llm.py`

### 强制要求
```python
# ✅ 正确: 使用LLM
def call_kimi_for_dishes(text, restaurant_name):
    prompt = f"""从以下帖子中提取"{restaurant_name}"的推荐菜品。
    
    注意:
    1. 只提取明确推荐/好评的菜品
       - "蕞绝的还是傣味香茅草烤鱼"
       - "必点咸蛋黄排骨"
    2. 不要提取泛泛的词
       - ❌ "牛肉" (太泛)
       - ✅ "小青菜杂菌云腿炒饭" (具体)
    3. 最多3-5个菜品
    
    返回JSON: {{"dishes": ["菜品1", "菜品2"]}}
    """
    
# ❌ 错误: 关键词匹配
dishKeywords = ['牛肉', '鱼', '鸡', ...]  # 禁止！
if dish in text:  # 禁止！
    recommendations.append(dish)  # 禁止！
```

### QA检查
- [ ] 对比帖子原文验证推荐语境
- [ ] 确保不是通用词（如"牛肉"→"小炒黄牛肉"）
- [ ] 标记来源: `recommendations_source: 'llm_extracted'`

---

## Phase 3: Metrics计算 (允许非LLM方法)

### 口碑分数 (情感词典 - 行业标准)
```python
# ✅ 允许: 情感词典是标准做法
positiveWords = ['好吃', '不错', '推荐', '惊艳', ...]
negativeWords = ['难吃', '失望', '踩雷', ...]

sentiment_score = 0.3 + (positiveCount / totalCount) * 0.7
```

### 趋势分数 (数学计算)
```python
# ✅ 允许: 纯数学计算
trend_30d = (recentEngagement / totalEngagement) * 100
```

### Google数据 (API验证)
```python
# ✅ 允许: 真实API数据
goplaces search "{name} {area}, CA"
goplaces details {place_id}
```

---

## Cron Job 更新流程

### 当新增Xiaohongshu帖子时:

```bash
# 1. 增量提取（只处理新posts）
python3 scripts/kimi_llm_extract_v2.py --incremental

# 2. 重新提取所有推荐菜（因为新帖子可能有新推荐）
python3 scripts/batch_extract_dishes_llm.py

# 3. 重新计算metrics
node scripts/calculate_real_metrics.js

# 4. QA验证
node qa/global-qa.js

# 5. 部署
cp data/current/restaurant_database.json data/current/restaurant_database_v5_ui.json
```

### Cron Job配置模板
```json
{
  "name": "增量数据更新",
  "schedule": {"kind": "cron", "expr": "0 2 * * *"},
  "payload": {
    "kind": "agentTurn",
    "message": "执行增量数据更新pipeline。必须：1) 用LLM提取新餐厅 2) 用LLM提取推荐菜 3) 严禁关键词匹配"
  }
}
```

---

## 数据验证清单

### 每次更新后必须检查:
- [ ] `sentiment_score` 不是5的倍数 (说明是真实计算)
- [ ] `trend_30d` 不是5的倍数 (说明是真实计算)
- [ ] `recommendations` 包含具体菜品名 (不是"牛肉"、"鱼")
- [ ] `recommendations_source` = 'llm_extracted'
- [ ] `google_rating` 有对应 `google_place_id`

### 如果发现以下情况，立即停止并修复:
- ⚠️ 推荐菜是通用词 (牛肉/鱼/鸡/面)
- ⚠️ metrics都是5的倍数
- ⚠️ 没有 `recommendations_source` 标记

---

## 历史教训

### 2026-02-16 事件
**问题**: 用户发现metrics都是5的倍数，质疑数据真实性
**原因**: 使用了关键词匹配而非LLM提取
**解决**: 
1. 删除所有关键词提取的推荐菜
2. 用LLM重新提取全部76家餐厅
3. 更新Pipeline文档

**承诺**: 以后所有提取类任务优先使用LLM，绝不编造数据

---

## 相关文档

- `docs/DATA_EXTRACTION_STRATEGY.md` - 提取策略详细说明
- `docs/DATA_INTEGRITY_LESSON.md` - 2026-02-16事件记录
- `scripts/kimi_llm_extract_v2.py` - 餐厅名LLM提取
- `scripts/batch_extract_dishes_llm.py` - 推荐菜LLM提取
- `qa/global-qa.js` - 数据质量检查
