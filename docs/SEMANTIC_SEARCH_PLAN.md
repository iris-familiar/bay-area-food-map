# 语义搜索实现方案

## 目标
让用户可以用自然语言搜索，如：
- "适合带娃的餐厅"
- "约会聚餐的地方"
- "人均低的湘菜"
- "有包间的餐厅"

## 技术方案

### 1. 语义标签提取 (Semantic Tag Extraction)
从现有数据中提取/生成标签：

**场景标签 (Scene)**:
- `family-friendly` - 提及"带娃"、"孩子"、"family"
- `date-night` - 提及"约会"、"浪漫"、"氛围"
- `group-dining` - 提及"聚餐"、"聚会"、"包间"
- `casual` - 提及"随便吃"、"快餐"
- `business` - 提及"商务"、"请客"

**氛围标签 (Vibe)**:
- `quiet` - 安静、适合谈话
- `lively` - 热闹、有气氛
- `cozy` - 温馨、舒适
- `fancy` - 高档、精致

**实用标签 (Practical)**:
- `parking` - 好停车
- `wait-short` - 排队少
- `takeout` - 外卖好
- `late-night` - 营业晚

### 2. 实现方式

**选项A: 简单关键词匹配 (推荐)**
- 基于现有评论关键词匹配
- 无需额外API
- 快速实现

**选项B: 嵌入向量搜索 (高级)**
- 使用 OpenAI/Gemini 生成嵌入
- 需要向量数据库或计算余弦相似度
- 更准确但复杂

### 3. 数据结构扩展
```json
{
  "semantic_tags": {
    "scenes": ["family-friendly", "group-dining"],
    "vibes": ["casual", "lively"],
    "practical": ["parking", "takeout"],
    "keywords": ["带娃", "聚餐", "便宜"]
  }
}
```

### 4. 搜索逻辑
```javascript
// 语义查询映射
const SEMANTIC_QUERIES = {
  "带娃": ["family-friendly", "kid-friendly", "children"],
  "约会": ["date-night", "romantic", "couple"],
  "聚餐": ["group-dining", "party", "聚会"],
  "便宜": ["budget", "cheap", "$", "人均低"],
  // ...
};
```

## 实施步骤

1. **创建标签提取脚本** - 分析现有评论，自动打标签
2. **更新数据库** - 添加 semantic_tags 字段
3. **前端搜索框** - 支持自然语言输入
4. **结果展示** - 显示匹配的标签

## 示例交互

用户输入: "适合带娃的餐厅"
↓
系统解析: 场景=family-friendly
↓
匹配餐厅: 王家味、Wooga Gamjatang 等
↓
显示: "因为提到'带娃不排队'、'有儿童座椅'"

