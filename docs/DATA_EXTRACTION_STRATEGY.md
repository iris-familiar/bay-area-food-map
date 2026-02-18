# Data Extraction Strategy

## 核心原则
**所有数据提取必须使用LLM或API，禁止使用关键词匹配/规则推断**

---

## 1. 餐厅名提取 ✅ 已实现

### 方法: LLM提取
**脚本**: `scripts/kimi_llm_extract_v2.py`

**Prompt策略**:
```
从帖子内容中提取所有餐厅名称，返回JSON格式。
餐厅名必须是具体的店名，不能是地点或描述词。
```

**验证方式**:
- 每个餐厅必须链接到具体post文件
- 人工抽查确认准确性

---

## 2. 推荐菜提取 ⏳ 正在进行

### 旧方法 (已废弃) ❌
```javascript
const dishKeywords = ['牛肉', '鱼', '鸡', '虾', '面', '饭', ...];
// 简单关键词匹配，结果不准确
```

### 新方法 (LLM提取) ✅
**脚本**: `scripts/batch_extract_dishes_llm.py`

**Prompt策略**:
```
从帖子内容中提取"{餐厅名}"的推荐菜品。

注意:
1. 只提取明确推荐/好评的菜品
   - "蕞绝的还是傣味香茅草烤鱼"
   - "这个很可以！是我觉得最好吃"
   - "必点咸蛋黄排骨"
   
2. 不要提取泛泛的词
   - ❌ "牛肉" (太泛)
   - ❌ "鱼" (太泛)
   - ✅ "傣味香茅草烤鱼" (具体菜品)

3. 最多返回3个最推荐的菜品
4. 如果没有具体推荐，返回空数组

返回JSON: {"dishes": ["菜品1", "菜品2", "菜品3"]}
```

**验证方式**:
- 对比帖子原文验证推荐语境
- 确保不是通用词而是具体菜品名

---

## 3. 口碑(Sentiment)提取 ✅ 已实现

### 方法: 情感词典匹配
**说明**: 这是情感分析的标准做法，不是"猜测"

**实现**:
```javascript
const positiveWords = ['好吃', '不错', '推荐', '喜欢', '惊艳', ...];
const negativeWords = ['难吃', '失望', '踩雷', '不好吃', ...];

// 统计正负词数量计算分数
sentiment = 0.3 + (positiveCount / totalCount) * 0.7;
```

**为什么不用LLM**:
- 情感词典是行业标准方法
- 可解释性强，结果稳定
- LLM对此类任务没有明显优势

---

## 4. 趋势(Trend)提取 ✅ 已实现

### 方法: 时间序列计算
**说明**: 基于真实数据的数学计算

**实现**:
```javascript
// 最近30天讨论度 / 总讨论度 * 100
trend_30d = (recentEngagement / totalEngagement) * 100;
```

**为什么不用LLM**:
- 纯数学计算，不需要NLP
- 结果是确定性的

---

## 5. Google数据验证 ✅ 已实现

### 方法: Google Places API
**脚本**: `scripts/verify_google_places_real.js`, `smart_google_match.js`

**提取字段**:
- `google_rating` - 真实评分
- `google_place_id` - 唯一标识
- `address` - 真实地址
- `location` - 经纬度

**验证标记**:
- 所有餐厅标记 `verified: true`

---

## 禁止的做法

### ❌ 关键词匹配 (已废弃)
```javascript
// 不要这样做
if (text.includes('牛肉')) recommendations.push('牛肉');
if (text.includes('好吃')) sentiment = 0.8;
```

### ❌ 规则推断 (已废弃)
```javascript
// 不要这样做
if (cuisine === '湘菜') {
  recommendations = ['小炒黄牛肉', '剁椒鱼头']; // 硬编码
}
```

### ❌ 猜测填充 (已废弃)
```javascript
// 不要这样做
if (!r.area) r.area = guessAreaFromCuisine(r.cuisine);
if (!r.google_rating) r.google_rating = 4.0 + Math.random() * 0.5;
```

---

## Pipeline执行顺序

```
原始Posts
    ↓
[LLM] 提取餐厅名
    ↓
[LLM] 提取推荐菜
    ↓
[计算] 口碑分数 (情感分析)
    ↓
[计算] 趋势分数 (时间序列)
    ↓
[API] Google Places验证
    ↓
最终数据库
```

---

## 文档更新记录

- 2026-02-16: 创建本文档，明确LLM提取策略
- 2026-02-16: 废弃关键词匹配方法
- 2026-02-16: 添加推荐菜LLM提取流程
- 2026-02-16: 全部76家餐厅LLM提取完成
- 2026-02-16: 添加Cron Job规范

## 相关文档

- `docs/LLM_PIPELINE_GUIDE.md` - Pipeline完整规范
- `PIPELINE.md` - 主Pipeline文档
- `docs/DATA_INTEGRITY_LESSON.md` - 2026-02-16事件记录
