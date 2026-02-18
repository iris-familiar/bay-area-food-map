# 小红书餐厅数据采集 v5 数据模型文档

## 概述

本数据模型用于系统性采集和存储小红书上的餐厅推荐数据，包含完整的帖子正文、评论内容和餐厅提取结果。

## 文件结构

```
data/
├── current/
│   └── restaurant_database_v5_full_content.json  # 主数据库
├── posts/
│   └── YYYY-MM-DD/
│       ├── {post_id}.json                       # 单个帖子详情
│       └── posts_YYYY-MM-DD_full.json           # 当日所有帖子
├── comments/
│   └── YYYY-MM-DD/
│       └── comments_YYYY-MM-DD_full.json        # 当日所有评论
├── daily/
│   └── YYYY-MM-DD/
│       ├── summary.json                         # 每日汇总
│       ├── restaurant_candidates.json           # 餐厅候选
│       ├── verified_restaurants.json            # 验证后的餐厅
│       └── mentions.json                        # 餐厅提及统计
└── archive/                                     # 历史归档
```

## 数据模型

### Post (帖子)

```json
{
  "id": "小红书帖子ID",
  "title": "帖子标题（已清理emoji）",
  "content": "帖子正文（完整，已清理emoji和标签）",
  "publishTime": "2026-01-08T01:28:26.000Z",
  "author": {
    "userId": "作者ID",
    "nickname": "作者昵称"
  },
  "interaction": {
    "likedCount": 122,
    "sharedCount": 200,
    "commentCount": 45,
    "collectedCount": 139
  },
  "restaurants_mentioned": [
    {
      "name": "餐厅名（从正文中提取）",
      "nameEn": "英文名",
      "confidence": 0.95,
      "context": "提及上下文（前后50字符）",
      "source": "post_content|comment",
      "cuisine": "菜系",
      "area": "区域"
    }
  ],
  "comments": [ /* Comment对象数组 */ ],
  "commentCount": 45
}
```

### Comment (评论)

```json
{
  "postId": "所属帖子ID",
  "commentId": "评论ID",
  "content": "评论内容（已清理emoji）",
  "author": "评论者昵称",
  "authorId": "评论者ID",
  "publishTime": "2026-01-08T01:28:26.000Z",
  "likedCount": 23,
  "restaurants_mentioned": ["推荐的其他餐厅名"],
  "sentiment": "positive|neutral|negative",
  "replies": [
    {
      "replyId": "回复ID",
      "content": "回复内容",
      "author": "回复者昵称",
      "isAuthor": true
    }
  ]
}
```

### Restaurant (餐厅)

```json
{
  "id": "r001",
  "name": "餐厅中文名",
  "nameEn": "Restaurant Name",
  "type": "菜系分类",
  "cuisine": "具体菜系",
  "area": "所在区域",
  "location": "Bay Area",
  "address": "具体地址",
  "price_range": "$$",
  "status": "recommended|candidate|verified",
  "verified": true,
  "google_place_id": "Google Place ID",
  "google_rating": 4.5,
  "metrics": {
    "mention_count": 5,
    "posts_mentioned": 3,
    "sentiment_analysis": {
      "overall": "positive",
      "score": 0.85,
      "positive_mentions": 4,
      "neutral_mentions": 1,
      "negative_mentions": 0,
      "contexts": ["具体提及上下文..."]
    },
    "discussion_volume": {
      "total_posts": 3,
      "total_comments": 28,
      "total_engagement": 31
    }
  },
  "mentions": [
    {
      "postId": "帖子ID",
      "postTitle": "帖子标题",
      "context": "提及上下文",
      "source": "post_content",
      "confidence": 0.95,
      "sentiment": "positive"
    }
  ]
}
```

## 字段说明

### Post.interaction
- `likedCount`: 点赞数
- `sharedCount`: 分享数
- `commentCount`: 评论数
- `collectedCount`: 收藏数

### Comment.sentiment
- `positive`: 正面情绪（包含"好吃"、"推荐"、"喜欢"等词）
- `neutral`: 中性情绪
- `negative`: 负面情绪（包含"避雷"、"踩雷"、"难吃"等词）

### Restaurant.status
- `recommended`: 已验证的推荐餐厅
- `candidate`: 候选餐厅（待验证）
- `verified`: 已验证但状态待定

## 数据采集流程

### 每日任务

1. **搜索新帖子**
   - 使用多个关键词搜索湾区美食
   - 获取帖子ID和xsec_token

2. **获取帖子详情**
   - 使用xiaohongshu MCP获取完整正文
   - 获取所有评论（含回复）

3. **提取餐厅候选**
   - 从正文提取餐厅名
   - 从评论提取推荐/避雷
   - 匹配已知餐厅库

4. **验证餐厅**
   - Google Places搜索确认
   - 人工审核匹配结果

5. **更新指标**
   - 统计提及次数
   - 分析情感倾向
   - 计算讨论热度

## 关键检查点

- [x] 帖子正文已清理emoji和标签
- [x] 评论包含完整回复链
- [x] 餐厅名从正文中提取（不只是标题）
- [x] 情感分析基于上下文
- [x] 数据来源可追溯（postId, commentId）

## 已知限制

当前版本：
- 仅3条帖子有完整正文数据（79条需重新获取）
- xsecToken有有效期限制
- 餐厅提取基于关键词匹配，可能有遗漏

## 后续优化

1. 实现自动刷新xsecToken
2. 添加NLP餐厅名实体识别
3. 增加图片OCR识别
4. 建立餐厅别名映射表
