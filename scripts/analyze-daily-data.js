#!/usr/bin/env node
/**
 * 餐厅数据时间序列分析脚本
 * 用于处理每日抓取数据并更新餐厅时间序列
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';
const DAILY_DIR = path.join(DATA_DIR, 'daily');
const TODAY = '2026-02-16';

// 加载餐厅数据库
const dbPath = path.join(DATA_DIR, 'current', 'restaurant_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// 从约会餐厅搜索中提取餐厅提及
const searchResultsPath = path.join(DAILY_DIR, '2026-02-16-raw-search.json');
let searchResults = null;
try {
  const raw = fs.readFileSync(searchResultsPath, 'utf8');
  const parsed = JSON.parse(raw);
  searchResults = JSON.parse(parsed.result?.content?.[0]?.text || '{}');
} catch (e) {
  console.log('搜索数据解析失败:', e.message);
}

// 餐厅名称关键词映射
const restaurantKeywords = {
  '留湘': ['留湘', 'liuxiang', 'hunan house'],
  '香锅大王': ['香锅大王', 'sizzling pot'],
  'Z&Y Restaurant': ['z&y', 'z\u0026y restaurant', '御食园'],
  '肖婆婆砂锅': ['肖婆婆', 'xiaopo'],
  '湘粤情': ['湘粤情', 'xiangyue'],
  '王家味': ['王家味'],
  '顾湘': ['顾湘', 'guxiang'],
  'Le Papillon': ['le papillon'],
  'Yeobo': ['yeobo'],
  'Darling': ['darling'],
  'Zaytinya': ['zaytinya'],
  'Ethel\'s Fancy': ['ethel', 'fancy']
};

// 分析搜索结果中的餐厅提及
function analyzeSearchResults(results) {
  const mentions = {};
  const posts = [];
  
  if (!results || !results.feeds) return { mentions, posts };
  
  results.feeds.forEach((feed, idx) => {
    if (feed.modelType !== 'note') return;
    
    const note = feed.noteCard;
    const title = (note.displayTitle || '').toLowerCase();
    const engagement = {
      likes: parseInt(note.interactInfo?.likedCount || 0),
      shares: parseInt(note.interactInfo?.sharedCount || 0),
      comments: parseInt(note.interactInfo?.commentCount || 0),
      collections: parseInt(note.interactInfo?.collectedCount || 0)
    };
    const totalEngagement = engagement.likes + engagement.shares + engagement.comments + engagement.collections;
    
    posts.push({
      id: feed.id,
      title: note.displayTitle,
      author: note.user?.nickname,
      engagement,
      totalEngagement
    });
    
    // 检查每个餐厅的提及
    for (const [restaurant, keywords] of Object.entries(restaurantKeywords)) {
      const mentioned = keywords.some(kw => title.includes(kw.toLowerCase()));
      if (mentioned) {
        if (!mentions[restaurant]) {
          mentions[restaurant] = { count: 0, engagement: 0, posts: [] };
        }
        mentions[restaurant].count++;
        mentions[restaurant].engagement += totalEngagement;
        mentions[restaurant].posts.push({
          id: feed.id,
          title: note.displayTitle,
          engagement: totalEngagement
        });
      }
    }
  });
  
  return { mentions, posts };
}

const analysis = analyzeSearchResults(searchResults);

// 计算今日统计
const stats = {
  totalPosts: analysis.posts.length,
  totalEngagement: analysis.posts.reduce((sum, p) => sum + p.totalEngagement, 0),
  restaurantsMentioned: Object.keys(analysis.mentions).length,
  topRestaurants: Object.entries(analysis.mentions)
    .sort((a, b) => b[1].engagement - a[1].engagement)
    .slice(0, 5)
    .map(([name, data]) => ({ name, ...data }))
};

console.log('\n📊 今日约会餐厅搜索分析');
console.log('==========================');
console.log(`📌 分析帖子数: ${stats.totalPosts}`);
console.log(`❤️ 总互动数: ${stats.totalEngagement.toLocaleString()}`);
console.log(`🏪 提及餐厅数: ${stats.restaurantsMentioned}`);
console.log('\n🏆 热门餐厅TOP5:');
stats.topRestaurants.forEach((r, i) => {
  console.log(`  ${i+1}. ${r.name}: ${r.count}次提及, ${r.engagement}互动`);
});

// 更新今日数据文件
const dailyDataPath = path.join(DAILY_DIR, `${TODAY}.json`);
const dailyData = JSON.parse(fs.readFileSync(dailyDataPath, 'utf8'));

dailyData.posts = analysis.posts;
dailyData.restaurant_mentions = analysis.mentions;
dailyData.daily_metrics = {
  total_posts: stats.totalPosts,
  total_engagement: stats.totalEngagement,
  restaurants_covered: Object.keys(analysis.mentions),
  new_restaurants_found: 0 // 待进一步分析
};

fs.writeFileSync(dailyDataPath, JSON.stringify(dailyData, null, 2));
console.log('\n✅ 每日数据已更新:', dailyDataPath);

// 生成时间序列摘要
const timeSeriesSummary = {
  date: TODAY,
  day_of_week: 'Monday',
  scene: '湾区约会餐厅',
  metrics: dailyData.daily_metrics,
  top_mentions: stats.topRestaurants
};

console.log('\n📈 时间序列数据摘要:');
console.log(JSON.stringify(timeSeriesSummary, null, 2));

// 保存摘要到日志
const logPath = path.join(DATA_DIR, 'logs', `daily-report-${TODAY}.json`);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, JSON.stringify(timeSeriesSummary, null, 2));
console.log('\n📝 报告已保存:', logPath);
