# 小红书数据获取与质量控制方案

## 当前状态分析

**已有数据**: 4个帖子，21家餐厅，745条评论  
**核心问题**: 数据量不足，去重机制不完善，质量过滤缺失

---

## 一、数据质量控制体系

### 1. 餐厅去重策略 (Deduplication)

#### Level 1: 精确匹配
```javascript
// 基于标准化名称+地址
function exactMatch(restaurantA, restaurantB) {
    const normalizeName = (name) => name
        .toLowerCase()
        .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '') // 只保留中文、英文、数字
        .replace(/(餐厅|饭店|馆|店)$/, ''); // 移除通用后缀
    
    return normalizeName(restaurantA.name) === normalizeName(restaurantB.name) &&
           restaurantA.address === restaurantB.address;
}
```

#### Level 2: Fuzzy Matching (模糊匹配)
```javascript
// 名称相似度 + 地址相似度
function fuzzyMatch(r1, r2) {
    const nameSimilarity = calculateSimilarity(r1.name, r2.name);
    const addressSimilarity = calculateAddressSimilarity(r1.address, r2.address);
    
    // 名称相似度>0.8 且 地址相似度>0.7 → 认为是同一家
    return nameSimilarity > 0.8 && addressSimilarity > 0.7;
}

// 常见别名映射
const aliasMap = {
    "王家卫": "王家味",
    "香锅大王": ["Sizzling Pot King", "Hunan House", "一屋饭湘"],
    "留湘": "Ping's Bistro",
    "顾湘": "Hometown Kitchen",
    "杨裕兴": "Yum Noodles"
};
```

#### Level 3: Google Places验证去重
- 所有餐厅必须经Google Places验证
- 相同的`place_id` = 同一家餐厅
- 合并同一`place_id`下的所有评论和metrics

### 2. 帖子质量过滤 (Post Filtering)

#### 硬性过滤条件 (必须满足)
| 条件 | 阈值 | 原因 |
|------|------|------|
| 评论数 | ≥5条 | 无评论=无价值 |
| 字数 | ≥100字 | 排除纯水贴 |
| 图片数 | ≥1张 | 真实探店通常有图 |
| 发布时间 | ≤2年 | 过期信息 |

#### 软性质量评分 (0-100分)
```javascript
function calculatePostQuality(post) {
    let score = 0;
    
    // 互动指标 (40分)
    score += Math.min(post.likedCount / 10, 20); // 点赞
    score += Math.min(post.commentCount / 5, 20); // 评论
    
    // 内容深度 (30分)
    score += Math.min(post.desc.length / 50, 15); // 描述长度
    score += post.imageList?.length * 3 || 0; // 图片数量
    
    // 作者可信度 (20分)
    if (post.author.followCount > 100) score += 10;
    if (post.author.totalFavorited > 1000) score += 10;
    
    // 时效性 (10分)
    const daysAgo = (Date.now() - post.createTime) / 86400000;
    if (daysAgo < 30) score += 10;
    else if (daysAgo < 90) score += 5;
    
    return Math.min(score, 100);
}

// 只保留 qualityScore >= 40 的帖子
```

#### 广告/钓鱼帖检测
```javascript
const spamKeywords = [
    "免费领取", "点击链接", "加我微信", "私信我",
    "限时优惠", "扫码", "折扣码", "代购",
    "绝对好吃", "最好吃没有之一", "必吃" // 过度夸张
];

const suspiciousPatterns = [
    /\$+\d+/, // 大量金钱符号
    /[Vv]信/, // 微信引流
    /.{0,5}http/, // 早期插入链接
];

function isSpamPost(post) {
    const text = post.desc + ' ' + post.title;
    
    // 关键词检测
    const keywordMatch = spamKeywords.filter(k => text.includes(k)).length;
    if (keywordMatch >= 2) return true;
    
    // 模式检测
    const patternMatch = suspiciousPatterns.some(p => p.test(text));
    if (patternMatch) return true;
    
    // 评论异常检测 (评论数极少但点赞极高)
    if (post.commentCount < 3 && post.likedCount > 500) return true;
    
    return false;
}
```

### 3. 评论质量过滤

#### 有效评论标准
- 字数 ≥10字 (排除"好吃"、"赞"等无意义评论)
- 包含具体信息 (菜名、地址、价格、体验)
- 非重复内容 (同一用户多次复制粘贴)

#### 情感分析置信度
```javascript
// 只保留高置信度的情感标签
const confidenceLevels = {
    high: commentCount >= 10,
    medium: commentCount >= 5 && commentCount < 10,
    low: commentCount < 5 // 需要人工review
};
```

---

## 二、高效数据获取策略

### 1. 搜索关键词矩阵

#### 地理维度
```javascript
const areaKeywords = [
    "湾区", "旧金山", "San Francisco",
    "南湾", "South Bay", "San Jose", "Sunnyvale", "Cupertino",
    "半岛", "Peninsula", "Palo Alto", "Foster City",
    "东湾", "East Bay", "Fremont", "Union City", "Newark",
    "伯克利", "Berkeley", "奥克兰", "Oakland"
];
```

#### 菜系维度
```javascript
const cuisineKeywords = [
    "中餐", "川菜", "湘菜", "粤菜", "东北菜", "上海菜",
    "火锅", "烧烤", "早茶", "面馆", "麻辣烫",
    "日料", "寿司", "拉面", "烧鸟",
    "韩餐", "烤肉", "越南菜", "泰国菜",
    "奶茶", "甜品", " bakeries"
];
```

#### 场景维度
```javascript
const scenarioKeywords = [
    "探店", "美食", "餐厅推荐", "必吃", "宝藏",
    "踩雷", "避雷", "拔草", "种草",
    "约会", "聚会", "聚餐", "一人食",
    "外卖", "堂食", "夜宵"
];
```

#### 组合搜索策略
```javascript
// 生成所有有意义的组合
const searchQueries = [
    ...areaKeywords.map(a => `${a} 餐厅推荐`),
    ...areaKeywords.map(a => `${a} 美食`),
    ...areaKeywords.flatMap(a => cuisineKeywords.map(c => `${a} ${c}`)),
    ...cuisineKeywords.map(c => `湾区 ${c}`),
    ...scenarioKeywords.map(s => `湾区 ${s}`)
];
// 预期生成 100+ 个搜索词
```

### 2. 递归发现机制

#### 从评论区挖掘
```javascript
// 分析评论中提到的其他餐厅
function extractRestaurantMentions(comments) {
    const mentions = [];
    
    comments.forEach(comment => {
        // 匹配"XXX也很好吃"、"推荐YYY"等模式
        const patterns = [
            /(.{2,10})[也还]不错/,
            /推荐(.{2,10})/,
            /(.{2,10})更好[吃点]/,
            /比起(.{2,10})/
        ];
        
        patterns.forEach(pattern => {
            const match = comment.content.match(pattern);
            if (match && isLikelyRestaurantName(match[1])) {
                mentions.push(match[1]);
            }
        });
    });
    
    return [...new Set(mentions)]; // 去重
}

// 将新发现的餐厅加入搜索队列
```

#### 用户追踪
- 识别高质量作者 (粉丝>1000, 内容专业)
- 追踪他们的历史帖子
- 获取他们的关注列表和收藏

### 3. 数据获取Pipeline

```javascript
class DataPipeline {
    constructor() {
        this.searchQueue = new Set(); // 待搜索关键词
        this.processedFeeds = new Set(); // 已处理帖子ID
        this.restaurantDB = new Map(); // 餐厅数据库
        this.targetCount = 500; // 目标：500个帖子
    }
    
    async run() {
        // Phase 1: 种子搜索
        await this.seedSearch();
        
        // Phase 2: 迭代扩展
        while (this.processedFeeds.size < this.targetCount) {
            await this.expandSearch();
        }
        
        // Phase 3: 深度获取
        await this.deepFetch();
        
        // Phase 4: 验证与去重
        await this.validateAndDeduplicate();
    }
    
    async seedSearch() {
        // 使用核心关键词获取初始数据
        const coreQueries = ["湾区美食", "湾区餐厅推荐", "湾区中餐", "湾区探店"];
        for (const query of coreQueries) {
            const feeds = await searchXiaohongshu(query);
            feeds.forEach(f => this.searchQueue.add(f.id));
        }
    }
}
```

---

## 三、实施建议

### Phase 1: 立即执行 (今天)
1. ✅ 完善去重逻辑 (name+address+fuzzy matching)
2. ✅ 建立质量评分系统
3. ✅ 扩展搜索关键词到20+个

### Phase 2: 本周内
1. 实施自动化pipeline
2. 建立递归发现机制
3. 目标：获取100个高质量帖子

### Phase 3: 持续优化
1. 每周增量更新
2. 建立数据监控看板
3. 用户反馈机制 (报告错误/新增餐厅)

---

## 四、风险与限制

### 技术限制
- 小红书API可能有rate limit
- 需要处理验证码/登录态过期
- 网页结构变化需要维护

### 数据偏见
- 小红书用户群体偏向年轻女性
- 可能存在"网红店"过度曝光
- 负面评价可能被删除

### 应对策略
- 多平台交叉验证 (Yelp, Google, 大众点评)
- 建立置信度权重系统
- 定期人工抽样检查

---

**少爷，这个方案的核心是：质量>数量。宁可要50个高质量帖子的数据，也不要500个水帖的数据。您觉得这个方向对吗？还需要我调整什么？** 🎩