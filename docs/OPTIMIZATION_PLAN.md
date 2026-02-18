# 🚀 美食地图项目全局优化方案
## 基于新安装Skills的深度优化

---

## 📊 一、数据可视化优化 (使用 chart-visualization skill)

### 当前问题
- 没有数据趋势图
- 无法直观看到餐厅增长、engagement变化
- daily_report.py 只是文本报告

### 优化方案

#### 1.1 新增数据可视化脚本
```javascript
// scripts/generate_data_dashboard.js
const chartVis = require('chart-visualization');

// 生成餐厅增长趋势图
const growthChart = chartVis.create({
  type: 'line',
  data: db.restaurants.map(r => ({
    date: r.first_seen,
    count: 1
  })),
  title: '餐厅数量增长趋势'
});

// 生成菜系分布饼图
const cuisineChart = chartVis.create({
  type: 'pie',
  data: cuisineDistribution,
  title: '湾区菜系分布'
});

// 生成讨论度热力图
const heatmap = chartVis.create({
  type: 'heatmap',
  data: areaEngagement,
  title: '各区域餐厅讨论度热力图'
});
```

#### 1.2 集成到Pipeline
修改 `daily_master_job.sh`:
```bash
# 3.5 生成数据可视化 (NEW)
echo "[NEW] Generating data visualizations..."
node scripts/generate_data_dashboard.js 2>&1 | tee -a logs/visualization.log
echo ""
```

#### 1.3 生成可视化报告页面
- 每日生成 `reports/dashboard_2026-02-17.html`
- 包含: 增长趋势图、菜系分布、地区热力图、口碑分布
- 推送到 GitHub Pages 或发送到您的邮箱

**价值**: 立即看到数据洞察，无需看原始JSON

---

## 🔍 二、情感分析升级 (使用 sentiment-analysis skill)

### 当前问题
- 当前sentiment_score基于简单关键词匹配
- 没有考虑评论的语境和 sarcasm
- 缺乏细粒度的情感分析（食物、服务、环境分别评分）

### 优化方案

#### 2.1 替换当前情感分析
```javascript
// scripts/advanced_sentiment_analysis.js
const sentiment = require('sentiment-analysis');

db.restaurants.forEach(r => {
  if (r.post_details) {
    r.post_details.forEach(post => {
      // 细粒度情感分析
      const analysis = sentiment.analyze(post.context, {
        aspects: ['food', 'service', 'ambiance', 'price'],
        granularity: 'sentence'
      });
      
      post.sentiment = {
        overall: analysis.score,
        food: analysis.aspects.food,
        service: analysis.aspects.service,
        ambiance: analysis.aspects.ambiance,
        price: analysis.aspects.price
      };
    });
    
    // 计算加权平均分
    r.sentiment_detailed = {
      food_score: avg(posts.map(p => p.sentiment.food)),
      service_score: avg(posts.map(p => p.sentiment.service)),
      ambiance_score: avg(posts.map(p => p.sentiment.ambiance)),
      value_score: avg(posts.map(p => p.sentiment.price))
    };
  }
});
```

#### 2.2 UI展示升级
修改 `index.html`:
```html
<!-- 在Modal中添加细粒度评分 -->
<div class="sentiment-breakdown">
  <div>食物: ⭐ ${r.sentiment_detailed.food_score}</div>
  <div>服务: ⭐ ${r.sentiment_detailed.service_score}</div>
  <div>环境: ⭐ ${r.sentiment_detailed.ambiance_score}</div>
  <div>性价比: ⭐ ${r.sentiment_detailed.value_score}</div>
</div>
```

**价值**: 用户可以看到"这家餐厅食物很好但服务一般"，更有参考价值

---

## 🧪 三、自动化测试 (使用 e2e-testing / playwright-e2e-testing)

### 当前问题
- UI修改后没有回归测试
- 手动测试耗时
- 无法检测数据展示错误

### 优化方案

#### 3.1 创建E2E测试套件
```javascript
// tests/restaurant_map_e2e.test.js
const { test, expect } = require('e2e-testing');

test('餐厅列表正确加载', async () => {
  await page.goto('file://' + projectDir + '/index.html');
  const cards = await page.locator('.ios-card').count();
  expect(cards).toBeGreaterThan(0);
});

test('筛选功能正常工作', async () => {
  await page.selectOption('#cuisine-filter', '湘菜');
  await page.waitForTimeout(500);
  const cards = await page.locator('.ios-card').count();
  // 验证只显示湘菜餐厅
});

test('Modal正确显示餐厅详情', async () => {
  await page.click('.ios-card:first-child');
  const modal = await page.locator('#detail-modal');
  expect(await modal.isVisible()).toBe(true);
  // 验证关键字段存在
  expect(await page.locator('#modal-name').textContent()).toBeTruthy();
  expect(await page.locator('.google_rating').textContent()).toBeTruthy();
});

test('小红书外链可点击', async () => {
  await page.click('.ios-card:first-child');
  const link = await page.locator('a[onclick*="openXiaohongshu"]');
  expect(await link.count()).toBeGreaterThan(0);
});
```

#### 3.2 集成到CI/CD
修改 `daily_master_job.sh`:
```bash
# 在部署前运行测试
echo "[NEW] Running E2E tests..."
npm test 2>&1 | tee -a logs/e2e_test.log
if [ $? -ne 0 ]; then
  echo "❌ E2E tests failed, stopping deployment"
  exit 1
fi
echo ""
```

#### 3.3 视觉回归测试
```javascript
// tests/visual_regression.test.js
const { test, expect } = require('playwright-e2e-testing');

test('UI没有意外变化', async () => {
  await page.goto('file://' + projectDir + '/index.html');
  await page.waitForLoadState('networkidle');
  
  // 截图并与基准对比
  expect(await page.screenshot()).toMatchSnapshot('restaurant-list.png');
});
```

**价值**: 每次修改UI后自动检测是否有错误，防止今天的数据问题再次发生

---

## 🌐 四、浏览器自动化升级 (使用 browser-use skill)

### 当前问题
- 小红书API调用受限（每天20个帖子）
- 无法获取实时engagement数据
- 有些帖子需要登录才能查看完整内容

### 优化方案

#### 4.1 创建浏览器自动化脚本
```javascript
// scripts/browser_collect_xiaohongshu.js
const browserUse = require('browser-use');

// 创建浏览器session
const session = await browserUse.createSession({
  profileId: 'xiaohongshu-profile', // 保持登录状态
  timeout: 300
});

// 自动化获取帖子详情
for (const postId of postIds) {
  const page = await session.newPage();
  await page.goto(`https://www.xiaohongshu.com/explore/${postId}`);
  
  // 等待内容加载
  await page.waitForSelector('.content');
  
  // 提取数据
  const data = await page.evaluate(() => {
    return {
      title: document.querySelector('.title')?.textContent,
      engagement: document.querySelector('.engagement-count')?.textContent,
      content: document.querySelector('.content')?.textContent,
      comments: Array.from(document.querySelectorAll('.comment')).map(c => ({
        text: c.textContent,
        likes: c.querySelector('.likes')?.textContent
      }))
    };
  });
  
  // 更新数据库
  updatePostData(postId, data);
}
```

#### 4.2 突破API限制
- browser-use 可以模拟真实用户行为
- 绕过小红书的API频率限制
- 可以获取更多数据（包括需要登录的内容）

#### 4.3 成本考量
- browser-use: $0.06/小时 (约$0.001/分钟)
- 每天运行10分钟 = $0.01/天 = $0.3/月
- **完全可接受**

**价值**: 获取更多数据，突破API限制，提高数据新鲜度

---

## 🔎 五、智能搜索增强 (使用 tavily-search skill)

### 当前问题
- Google Places 只能验证已有餐厅
- 无法发现新餐厅
- 缺少餐厅背景信息

### 优化方案

#### 5.1 餐厅背景调查
```javascript
// scripts/enrich_restaurant_info.js
const tavily = require('tavily-search');

for (const restaurant of db.restaurants) {
  // 搜索餐厅更多信息
  const results = await tavily.search({
    query: `${restaurant.name} ${restaurant.area} restaurant reviews menu`,
    deep: true,
    maxResults: 5
  });
  
  // 提取营业时间、菜单价格、特色等信息
  restaurant.enriched_info = {
    hours: extractHours(results),
    price_range: extractPriceRange(results),
    specialties: extractSpecialties(results),
    recent_reviews: extractRecentReviews(results)
  };
}
```

#### 5.2 新餐厅发现
```javascript
// scripts/discover_new_restaurants.js
const tavily = require('tavily-search');

// 搜索新开的餐厅
const newOpenings = await tavily.search({
  query: "new restaurants opened Bay Area 2026 Chinese",
  topic: 'news',
  days: 30
});

// 添加到候选列表
for (const result of newOpenings) {
  if (isRestaurantResult(result)) {
    addToCandidates({
      name: extractRestaurantName(result),
      source: result.url,
      discovery_date: new Date()
    });
  }
}
```

**价值**: 自动发现新餐厅，丰富现有餐厅信息

---

## 📄 六、报告生成增强 (使用 summarize skill)

### 当前问题
- daily_report.py 生成的报告太简单
- 没有自动摘要功能
- 无法快速了解每日变化

### 优化方案

#### 6.1 智能日报生成
```javascript
// scripts/generate_smart_daily_report.js
const summarize = require('summarize');

// 获取今日变化
const changes = detectDailyChanges();

// 生成自然语言摘要
const report = await summarize.text({
  content: JSON.stringify(changes),
  length: 'medium',
  style: 'newsletter'
});

// 发送报告
sendEmail({
  subject: `湾区美食地图日报 - ${today}`,
  body: report,
  highlights: changes.highlights
});
```

#### 6.2 餐厅变化摘要
```javascript
// 为每个有变化的餐厅生成摘要
for (const restaurant of changedRestaurants) {
  const summary = await summarize.text({
    content: `Restaurant ${restaurant.name} had ${restaurant.new_mentions} new mentions today. ` +
             `Engagement increased by ${restaurant.engagement_delta}. ` +
             `New dishes mentioned: ${restaurant.new_dishes.join(', ')}`,
    length: 'short'
  });
  
  restaurant.daily_summary = summary;
}
```

**价值**: 每天收到易读的摘要报告，快速了解重要变化

---

## 🎯 七、Self-Improvement 集成 (使用 self-improving-agent skill)

### 当前问题
- 错误修复依赖人工发现
- 没有自动学习机制
- 同样的问题可能重复发生

### 优化方案

#### 7.1 自动错误检测和学习
```javascript
// scripts/auto_improve_pipeline.js
const selfImprove = require('self-improving-agent');

// 监控pipeline运行
const errors = collectPipelineErrors();

for (const error of errors) {
  // 分析错误类型
  const analysis = selfImprove.analyze(error);
  
  // 如果是重复错误，记录到 AGENTS.md
  if (analysis.isRecurring) {
    selfImprove.recordLearning({
      error: error.type,
      cause: analysis.rootCause,
      solution: analysis.suggestedFix,
      prevention: analysis.preventionStrategy
    });
  }
}
```

#### 7.2 数据质量自动改进
```javascript
// 学习数据质量问题
const qualityIssues = detectQualityIssues();

for (const issue of qualityIssues) {
  selfImprove.recordLearning({
    category: 'data_quality',
    issue: issue.description,
    fix: issue.resolution,
    rule: generatePreventionRule(issue)
  });
}
```

**价值**: 系统自己学习改进，减少人工干预

---

## 📋 八、实施优先级建议

### 立即实施 (本周)
1. **数据可视化** (chart-visualization) - 价值高，工作量小
2. **情感分析** (sentiment-analysis) - 直接改进用户体验
3. **E2E测试** (e2e-testing) - 防止今天的问题再次发生

### 短期实施 (本月)
4. **浏览器自动化** (browser-use) - 突破API限制
5. **智能报告** (summarize) - 自动化日报

### 长期实施 (下月)
6. **Tavily搜索** (tavily-search) - 发现新餐厅
7. **Self-improvement** (self-improving-agent) - 长期优化

---

## 💰 成本估算

| Skill | 成本 | 月费用估算 |
|-------|------|-----------|
| chart-visualization | 免费 | $0 |
| sentiment-analysis | 免费 | $0 |
| e2e-testing | 免费 | $0 |
| browser-use | $0.06/小时 | ~$2-5/月 |
| tavily-search | 免费额度+付费 | ~$0-10/月 |
| summarize | 免费 | $0 |

**总计: 约 $2-15/月**，完全可接受

---

## 🎬 下一步行动

需要我帮您：
1. 立即实施数据可视化？(30分钟完成)
2. 先设置E2E测试框架？(20分钟完成)
3. 升级情感分析？(45分钟完成)
4. 创建完整的实施计划和时间表？

少爷想从哪一项开始？
