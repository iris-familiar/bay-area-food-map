# Data Schema V2 - Bay Area Food Map

## 概述
本数据Schema定义了小红书数据采集的标准格式，用于湾区美食地图项目。

## 目录结构
```
data/raw/v2/
├── posts/              # 帖子详情
│   └── {note_id}.json
├── comments/           # 评论数据
│   └── {note_id}.json
├── authors/            # 作者信息
│   └── {user_id}.json
└── collection_stats.json   # 采集统计
```

---

## Post数据结构

### 文件位置
`data/raw/v2/posts/{note_id}.json`

### Schema定义
```json
{
  "note_id": "string",           // 帖子唯一ID
  "xsec_token": "string",        // 访问令牌
  "metadata": {
    "title": "string",           // 帖子标题
    "content": "string",         // 完整正文内容
    "create_time": "string",     // 创建时间 (ISO 8601)
    "update_time": "string",     // 更新时间 (ISO 8601)
    "ip_location": "string"      // IP属地
  },
  "author": {
    "user_id": "string",         // 作者ID
    "nickname": "string",        // 昵称
    "avatar": "string"           // 头像URL
  },
  "interaction": {
    "liked_count": "number",     // 点赞数
    "collected_count": "number", // 收藏数
    "comment_count": "number",   // 评论数
    "share_count": "number"      // 分享数
  },
  "tags": ["string"],            // 话题标签列表
  "images": [{                   // 图片列表
    "width": "number",
    "height": "number",
    "urlDefault": "string",
    "urlPre": "string"
  }],
  "fetched_at": "string"         // 数据采集时间 (ISO 8601)
}
```

---

## Comment数据结构

### 文件位置
`data/raw/v2/comments/{note_id}.json`

### Schema定义
```json
{
  "note_id": "string",           // 所属帖子ID
  "comments": [{                  // 评论列表
    "comment_id": "string",      // 评论唯一ID (必填,用于去重)
    "note_id": "string",         // 帖子ID
    "parent_id": "string",       // 父评论ID (null表示主评论)
    "root_comment_id": "string", // 根评论ID (用于嵌套回复追踪)
    
    "content": "string",         // 评论内容
    "create_time": "string",     // 创建时间 (ISO 8601)
    
    "author": {
      "user_id": "string",       // 作者ID
      "nickname": "string",      // 昵称
      "avatar": "string"         // 头像URL
    },
    
    "interaction": {
      "liked_count": "number",   // 点赞数
      "reply_count": "number"    // 回复数
    },
    
    "sub_comments": [            // 回复列表
      {
        "comment_id": "string",  // 回复唯一ID
        "parent_id": "string",   // 父评论ID
        "root_comment_id": "string", // 根评论ID
        "content": "string",
        "create_time": "string",
        "author": {
          "user_id": "string",
          "nickname": "string",
          "avatar": "string"
        },
        "interaction": {
          "liked_count": "number"
        }
      }
    ]
  }],
  "total_count": "number",       // 评论总数
  "fetched_at": "string"         // 数据采集时间
}
```

### 字段说明

#### 主评论 (一级评论)
- `comment_id`: 主评论唯一标识，用于去重
- `parent_id`: 空字符串或null（表示这是主评论）
- `root_comment_id`: 与`comment_id`相同（自己是根评论）

#### 子评论 (回复)
- `comment_id`: 回复唯一标识
- `parent_id`: 指向父评论的ID（被回复的评论）
- `root_comment_id`: 指向根评论的ID（一级评论的ID）

### 去重逻辑
```python
# 使用comment_id作为主键
comment_key = f"{note_id}:{comment_id}"

# 检查是否已存在
if comment_key in existing_comments:
    # 对比更新时间，保留最新
    if new_comment['create_time'] > existing['create_time']:
        update_comment(comment_key, new_comment)
else:
    insert_comment(comment_key, new_comment)
```

---

## Author数据结构

### 文件位置
`data/raw/v2/authors/{user_id}.json`

### Schema定义
```json
{
  "user_id": "string",
  "nickname": "string",
  "avatar": "string"
}
```

---

## 数据质量标准

### 必填字段检查
- [x] `note_id` - 所有帖子必须包含
- [x] `xsec_token` - 所有帖子必须包含
- [x] `metadata.title` - 所有帖子必须包含
- [x] `metadata.content` - 所有帖子必须包含（可能为空字符串）
- [x] `author.user_id` - 所有帖子必须包含
- [x] `author.nickname` - 所有帖子必须包含
- [x] `fetched_at` - 所有记录必须包含
- [x] `comment_id` - 所有评论必须包含（用于去重）

### 评论ID完整性规则
1. 每个评论必须有唯一的 `comment_id`
2. 主评论的 `parent_id` 为空或null
3. 子评论的 `parent_id` 指向父评论的 `comment_id`
4. 子评论的 `root_comment_id` 指向根评论的 `comment_id`
5. 使用 `{note_id}:{comment_id}` 作为全局唯一键

### 数据完整性规则
1. 每个帖子必须有对应的评论文件（即使为空）
2. 作者信息去重存储，避免重复
3. 时间戳使用ISO 8601格式
4. 所有字符串字段使用UTF-8编码

---

## 数据采集参数

### MCP调用参数
```json
{
  "feed_id": "帖子ID",
  "xsec_token": "访问令牌",
  "load_all_comments": true,      // 加载所有评论
  "click_more_replies": false,    // 不展开子回复（性能优化）
  "limit": 50                     // 最多50条评论
}
```

### 原始字段映射

#### 主评论字段映射
| API字段 | Schema字段 | 说明 |
|---------|------------|------|
| `id` | `comment_id` | 评论唯一ID |
| `noteId` | `note_id` | 帖子ID |
| `content` | `content` | 评论内容 |
| `createTime` | `create_time` | 创建时间 |
| `userInfo.userId` | `author.user_id` | 作者ID |
| `userInfo.nickname` | `author.nickname` | 作者昵称 |
| `userInfo.avatar` | `author.avatar` | 作者头像 |
| `likeCount` | `interaction.liked_count` | 点赞数 |
| `subCommentCount` | `interaction.reply_count` | 回复数 |
| `subComments` | `sub_comments` | 子评论列表 |

#### 子评论字段映射
| API字段 | Schema字段 | 说明 |
|---------|------------|------|
| `id` | `comment_id` | 回复唯一ID |
| `parent_id` | `parent_id` | 父评论ID（需从上下文推断）|
| `content` | `content` | 回复内容 |
| `createTime` | `create_time` | 创建时间 |
| `userInfo.userId` | `author.user_id` | 作者ID |
| `userInfo.nickname` | `author.nickname` | 作者昵称 |
| `likeCount` | `interaction.liked_count` | 点赞数 |

---

## 版本历史

### V2.1 (2026-02-16)
- 修复评论ID字段映射（使用`id`而非`commentId`）
- 添加`root_comment_id`字段用于嵌套回复追踪
- 完善评论去重逻辑说明

### V2.0 (2026-02-16)
- 初始版本
- 支持完整帖子内容采集
- 支持评论采集
- 规范化数据Schema

---

## 注意事项

1. **ID字段一致性** - 小红书API中主评论使用`id`字段，不是`commentId`
2. **子评论parent_id** - 需要在处理时从父评论继承
3. **root_comment_id** - 子评论需要追溯到根评论ID
4. **作者信息** - 主评论使用`userInfo`，与帖子使用`user`不同
5. **时间戳格式** - API返回的是Unix时间戳(毫秒)，需要转换为ISO 8601
