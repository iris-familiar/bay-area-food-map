#!/usr/bin/env node
/**
 * 生成小红书餐厅数据维护日报
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';
const TODAY = '2026-02-16';
const LOGS_DIR = path.join(DATA_DIR, 'logs');

// 确保日志目录存在
fs.mkdirSync(LOGS_DIR, { recursive: true });

// 加载数据
const db = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'current', 'restaurant_database.json'), 'utf8'));
const dailyData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'daily', `${TODAY}.json`), 'utf8'));

// 生成报告
const report = {
  report_date: TODAY,
  report_type: "小红书餐厅数据日常维护",
  execution_summary: {
    status: "partial_complete",
    tasks_completed: [
      "✅ 数据状态检查",
      "✅ 场景化搜索（周一：湾区约会餐厅）",
      "✅ 时间序列数据结构创建",
      "✅ 搜索数据分析与餐厅提及提取",
      "⏳ 高优先级餐厅深度追踪（进行中）",
      "⏳ 评论区新餐厅挖掘（待执行）",
      "⏳ 数据质量检查（待执行）",
      "⏳ search_mapping更新（待执行）"
    ]
  },
  database_stats: {
    total_restaurants: db.total_restaurants,
    verified_restaurants: db.statistics.validation_status,
    cuisine_types: db.statistics.cuisine_types.length,
    cities_covered: db.statistics.cities_covered.length
  },
  daily_scraping: {
    date: TODAY,
    day_of_week: "Monday",
    scene_searched: "湾区约会餐厅",
    results: {
      total_posts_scraped: dailyData.daily_metrics.total_posts,
      total_engagement: dailyData.daily_metrics.total_engagement,
      restaurants_mentioned: dailyData.daily_metrics.restaurants_covered
    },
    top_restaurants: dailyData.restaurant_mentions
  },
  new_discoveries: {
    potential_new_restaurants: [
      {
        name: "Zaytinya",
        source: "湾区新店天花板💗Zaytinya我宣布近期最佳",
        engagement: 1779,
        note: "湾区新店，热门约会餐厅"
      },
      {
        name: "Yeobo",
        source: "湾区吃吃｜Yeobo, Darling 终于吃到了",
        engagement: 376,
        note: "情侣约会推荐"
      },
      {
        name: "Darling",
        source: "湾区吃吃｜Yeobo, Darling 终于吃到了",
        engagement: 376,
        note: "情侣约会推荐"
      },
      {
        name: "Ethel's Fancy",
        source: "湾区最常遇到小札的漂亮飯｜Ethel's Fancy",
        engagement: 345,
        note: "高人气约会餐厅"
      },
      {
        name: "Le Papillon",
        source: "Le Papillon ｜湾区能吃到撑的漂亮饭",
        engagement: 0,
        note: "法式餐厅"
      }
    ]
  },
  high_priority_tracking: {
    target_restaurants: [
      { name: "湘粤情", priority: 1, reason: "高互动/帖子比 (152.9)" },
      { name: "肖婆婆砂锅", priority: 2, reason: "高互动/帖子比 (12.2)" },
      { name: "留湘", priority: 3, reason: "高总互动 (468)" },
      { name: "Z\u0026Y Restaurant", priority: 4, reason: "知名度较高" },
      { name: "香锅大王", priority: 5, reason: "稳定表现" }
    ],
    search_queries_per_restaurant: [
      "湾区 {餐厅名} 怎么样",
      "湾区 {餐厅名} 踩雷",
      "湾区 {餐厅名} 人均"
    ]
  },
  time_series_update: {
    daily_file_created: true,
    daily_file_path: `data/daily/${TODAY}.json`,
    metrics_recorded: {
      total_posts: dailyData.daily_metrics.total_posts,
      total_engagement: dailyData.daily_metrics.total_engagement,
      restaurants_covered: dailyData.daily_metrics.restaurants_covered.length
    },
    notes: "时间序列数据已保存，待与餐厅主数据库合并"
  },
  data_quality: {
    checks_planned: [
      "重复数据检查",
      "地址格式验证",
      "semantic_tags补充",
      "时间字段完整性检查"
    ],
    status: "pending"
  },
  limitations: {
    daily_quota: {
      max_posts: 20,
      max_requests: 10,
      max_restaurants: 5,
      actual_posts: dailyData.daily_metrics.total_posts,
      actual_requests: 1
    },
    rate_limiting: "15-20秒请求间隔，避免封号"
  },
  next_steps: [
    "完成5家高优先级餐厅的深度搜索",
    "分析深度搜索数据，提取价格、评价等信息",
    "检查评论区，挖掘新餐厅候选",
    "验证潜在新餐厅是否已存在数据库",
    "更新餐厅time_series数据",
    "运行数据质量检查",
    "更新search_mapping"
  ],
  created_at: new Date().toISOString()
};

// 保存详细报告
const reportPath = path.join(LOGS_DIR, `maintenance-report-${TODAY}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

// 生成Markdown格式的可读报告
const markdownReport = `# 小红书餐厅数据维护日报 - ${TODAY}

## 📊 执行摘要

| 项目 | 状态 |
|------|------|
| 场景搜索 | ✅ 完成 |
| 数据分析 | ✅ 完成 |
| 深度追踪 | ⏳ 进行中 |
| 数据质量检查 | ⏳ 待执行 |

## 🗄️ 数据库状态

- **总餐厅数**: ${db.total_restaurants} 家
- **已验证**: ${db.statistics.validation_status}
- **菜系类型**: ${db.statistics.cuisine_types.length} 种
- **覆盖城市**: ${db.statistics.cities_covered.length} 个

## 🔍 今日抓取（周一：湾区约会餐厅）

### 统计概览
- **抓取帖子**: ${dailyData.daily_metrics.total_posts} 篇
- **总互动数**: ${dailyData.daily_metrics.total_engagement.toLocaleString()}
- **提及餐厅**: ${dailyData.daily_metrics.restaurants_covered.length} 家

### 🏆 热门餐厅TOP5

${Object.entries(dailyData.restaurant_mentions)
  .sort((a, b) => b[1].engagement - a[1].engagement)
  .slice(0, 5)
  .map(([name, data], i) => `**${i+1}. ${name}**\n- 提及次数: ${data.count}\n- 总互动: ${data.engagement}\n- 代表帖子: ${data.posts[0]?.title || 'N/A'}`)
  .join('\n\n')}

## ✨ 潜在新发现

| 餐厅名 | 来源帖子 | 互动数 | 备注 |
|--------|----------|--------|------|
| Zaytinya | 湾区新店天花板 | 1,779 | 新店热门 |
| Yeobo | 情侣约会推荐 | 376 | 情侣推荐 |
| Darling | 情侣约会推荐 | 376 | 情侣推荐 |
| Ethel's Fancy | 高人气约会餐厅 | 345 | 网红餐厅 |
| Le Papillon | 法式餐厅 | - | Fine Dining |

## 🎯 高优先级追踪（5家）

基于互动/帖子比率排序：

1. **湘粤情** - 比率 152.9（高热度）
2. **肖婆婆砂锅** - 比率 12.2
3. **留湘** - 总互动 468
4. **Z\u0026Y Restaurant** - 知名品牌
5. **香锅大王** - 稳定表现

每个餐厅搜索3个关键词：怎么样 / 踩雷 / 人均

## 📈 时间序列数据

- ✅ 每日数据文件: \`data/daily/${TODAY}.json\`
- ✅ 记录字段: 日期、帖子数、互动数、提及餐厅
- ⏳ 待合并到主数据库

## ⚠️ 抓取限制

| 限制项 | 配额 | 实际使用 |
|--------|------|----------|
| 最大帖子数 | 20 | ${dailyData.daily_metrics.total_posts} |
| 最大请求数 | 10 | 1 |
| 请求间隔 | 15-20秒 | 已遵守 |

## 📝 下一步行动

1. 完成5家餐厅的深度搜索
2. 分析深度搜索数据
3. 评论区新餐厅挖掘
4. 更新time_series数据
5. 数据质量检查
6. 更新search_mapping

---
*报告生成时间: ${new Date().toLocaleString('zh-CN')}*
`;

const markdownPath = path.join(LOGS_DIR, `maintenance-report-${TODAY}.md`);
fs.writeFileSync(markdownPath, markdownReport);

console.log('\n📋 小红书餐厅数据维护日报');
console.log('========================');
console.log(`📅 日期: ${TODAY}`);
console.log(`📊 抓取帖子: ${dailyData.daily_metrics.total_posts} 篇`);
console.log(`❤️ 总互动: ${dailyData.daily_metrics.total_engagement.toLocaleString()}`);
console.log(`🏪 提及餐厅: ${dailyData.daily_metrics.restaurants_covered.length} 家`);
console.log('\n🌟 潜在新发现:');
report.new_discoveries.potential_new_restaurants.forEach((r, i) => {
  console.log(`  ${i+1}. ${r.name} (${r.engagement}互动) - ${r.note}`);
});
console.log('\n✅ 报告已生成:');
console.log(`   JSON: ${reportPath}`);
console.log(`   Markdown: ${markdownPath}`);
