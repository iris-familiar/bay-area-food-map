#!/usr/bin/env node
/**
 * 真实数据计算 - Sentiment Analysis & Trend
 * 从原始帖子文本计算，不猜测！
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts';
const DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';

// 加载数据库
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🔬 真实数据计算 - Sentiment & Trend');
console.log('='.repeat(70));

// 情感词典（简版）
const positiveWords = [
  '好吃', '不错', '推荐', '喜欢', '爱', '正宗', '美味', '棒', '赞', '完美', 
  '必点', '好吃到', '惊艳', '满意', '值得', '好吃', '香', '鲜', '嫩', '好吃',
  'delicious', 'good', 'great', 'amazing', 'excellent', 'love', 'perfect',
  'authentic', 'tasty', 'yummy', 'recommend', 'best'
];

const negativeWords = [
  '难吃', '失望', '踩雷', '不好吃', '差', '糟糕', '烂', '雷', '坑', '不新鲜',
  '咸', '油腻', '贵', '不值', '后悔', '难吃', '恶心', '脏', '慢', '差',
  'bad', 'terrible', 'disappointed', 'worst', 'gross', 'overpriced', 'sucks'
];

function loadPost(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    
    if (parsed.jsonrpc && parsed.result && parsed.result.content && parsed.result.content[0]) {
      const innerText = parsed.result.content[0].text;
      const innerData = JSON.parse(innerText);
      return innerData.data || innerData;
    }
    return parsed.data || parsed;
  } catch (e) {
    return null;
  }
}

function analyzeSentiment(text) {
  if (!text) return { score: 0.5, positive: 0, negative: 0, total: 0 };
  
  const lowerText = text.toLowerCase();
  let posCount = 0;
  let negCount = 0;
  
  positiveWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    const matches = lowerText.match(regex);
    if (matches) posCount += matches.length;
  });
  
  negativeWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    const matches = lowerText.match(regex);
    if (matches) negCount += matches.length;
  });
  
  const total = posCount + negCount;
  if (total === 0) return { score: 0.5, positive: 0, negative: 0, total: 0 };
  
  // 情感分数 0-1，0.5为中性
  const score = 0.3 + (posCount / total) * 0.7; // 基础分0.3，正面词加分
  return { score: Math.min(score, 0.95), positive: posCount, negative: negCount, total };
}

function extractMentionContext(post, restaurantName) {
  const contexts = [];
  if (!post || !post.note) return contexts;
  
  const note = post.note;
  const keywords = [restaurantName.toLowerCase()];
  
  // 添加别名
  if (restaurantName === '留湘小聚') keywords.push('jun bistro');
  if (restaurantName === 'Jun Bistro') keywords.push('jun bistro');
  
  // 检查title
  if (note.title) {
    const title = note.title.toLowerCase();
    if (keywords.some(k => title.includes(k))) {
      contexts.push({ text: note.title, source: 'title', date: note.time });
    }
  }
  
  // 检查desc - 找到餐厅名附近的文本
  if (note.desc) {
    const desc = note.desc.toLowerCase();
    keywords.forEach(keyword => {
      if (desc.includes(keyword)) {
        const idx = desc.indexOf(keyword);
        const start = Math.max(0, idx - 100);
        const end = Math.min(desc.length, idx + keyword.length + 200);
        contexts.push({ 
          text: note.desc.slice(start, end), 
          source: 'desc', 
          date: note.time 
        });
      }
    });
  }
  
  // 检查comments
  const comments = post.comments?.list || [];
  comments.forEach(comment => {
    if (comment.content) {
      const content = comment.content.toLowerCase();
      if (keywords.some(k => content.includes(k))) {
        contexts.push({ 
          text: comment.content, 
          source: 'comment', 
          date: comment.createTime 
        });
      }
    }
  });
  
  return contexts;
}

// 为每家餐厅计算真实指标
let processed = 0;

db.restaurants.forEach(r => {
  processed++;
  console.log(`\n${processed}/${db.restaurants.length}: ${r.name}`);
  
  // 收集所有相关文本
  let allContexts = [];
  let sentimentSum = 0;
  let sentimentCount = 0;
  let positiveMentions = 0;
  let negativeMentions = 0;
  
  // 遍历每个source post
  r.sources.forEach(sourceId => {
    const postPath = path.join(POSTS_DIR, sourceId + '.json');
    const post = loadPost(postPath);
    
    if (post) {
      const contexts = extractMentionContext(post, r.name);
      allContexts.push(...contexts);
      
      contexts.forEach(ctx => {
        const sentiment = analyzeSentiment(ctx.text);
        sentimentSum += sentiment.score;
        sentimentCount++;
        if (sentiment.positive > sentiment.negative) positiveMentions++;
        if (sentiment.negative > sentiment.positive) negativeMentions++;
      });
    }
  });
  
  // 计算 Sentiment Score
  if (sentimentCount > 0) {
    r.sentiment_score = parseFloat((sentimentSum / sentimentCount).toFixed(2));
    r.sentiment_details = {
      positive_mentions: positiveMentions,
      negative_mentions: negativeMentions,
      analyzed_contexts: sentimentCount
    };
  } else {
    r.sentiment_score = 0.5; // 中性
  }
  
  console.log(`  分析了 ${sentimentCount} 条文本`);
  console.log(`  正面提及: ${positiveMentions}, 负面: ${negativeMentions}`);
  console.log(`  口碑分数: ${r.sentiment_score}`);
  
  // 计算 Trend (基于时间分布)
  if (r.post_details && r.post_details.length > 0) {
    // 按日期排序
    const sorted = [...r.post_details].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // 计算最近活跃度 vs 历史平均
    const now = Date.now();
    const recentPosts = sorted.filter(p => {
      const postTime = new Date(p.date).getTime();
      return (now - postTime) < 30 * 24 * 60 * 60 * 1000; // 30天内
    });
    
    if (sorted.length >= 2) {
      // 如果有多个posts，计算趋势
      const recentEngagement = recentPosts.reduce((sum, p) => sum + (p.engagement || 0), 0);
      const totalEngagement = r.total_engagement || 1;
      
      // 趋势 = 最近30天讨论度占比 * 100 - 基准值
      // 最近30天占比越高，趋势越高
      const recentRatio = recentEngagement / totalEngagement;
      r.trend_30d = Math.round(recentRatio * 100);
      
      console.log(`  最近30天占比: ${(recentRatio * 100).toFixed(1)}%`);
      console.log(`  趋势分数: ${r.trend_30d}`);
    } else {
      // 只有1个post，趋势为0
      r.trend_30d = 0;
    }
  } else {
    r.trend_30d = 0;
  }
  
  // 推荐菜处理：保留LLM提取的推荐菜，不再用简单关键词覆盖
  // 如果之前没有推荐菜，才尝试从文本中提取
  const hasLLMRecommendations = r.recommendations && r.recommendations.length > 0 && 
                                 r.recommendations_source === 'llm_extracted';
  
  if (!hasLLMRecommendations) {
    // 简化版：从文本中提取常见菜品词（仅作为fallback）
    const dishKeywords = ['牛肉', '鱼', '鸡', '虾', '面', '饭', '汤', '饺子', '包子', '炒饭', '烤肉', '烤鸭', '排骨', '豆腐', '粉'];
    const extractedDishes = [];
    
    allContexts.forEach(ctx => {
      dishKeywords.forEach(dish => {
        if (ctx.text.includes(dish) && !extractedDishes.includes(dish)) {
          extractedDishes.push(dish);
        }
      });
    });
    
    if (extractedDishes.length > 0) {
      r.recommendations = extractedDishes.slice(0, 3);
      r.recommendations_source = 'extracted';
      console.log(`  提取推荐菜: ${r.recommendations.join(', ')}`);
    } else {
      console.log(`  未提取到推荐菜`);
    }
  } else {
    console.log(`  保留LLM推荐菜: ${r.recommendations.join(', ')}`);
  }
});

// 保存
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
fs.writeFileSync(DB_FILE.replace('.json', '_v5_ui.json'), JSON.stringify(db, null, 2), 'utf8');

console.log('\n' + '='.repeat(70));
console.log('✅ 真实数据计算完成！');

// 统计
const sentiments = db.restaurants.map(r => r.sentiment_score);
const trends = db.restaurants.map(r => r.trend_30d);
console.log(`\n口碑范围: ${Math.min(...sentiments).toFixed(2)} - ${Math.max(...sentiments).toFixed(2)}`);
console.log(`趋势范围: ${Math.min(...trends)} - ${Math.max(...trends)}`);
console.log('\n示例 - 留湘小聚:');
const liuxiang = db.restaurants.find(r => r.name === '留湘小聚');
if (liuxiang) {
  console.log(`  口碑: ${liuxiang.sentiment_score}`);
  console.log(`  趋势: ${liuxiang.trend_30d}`);
  console.log(`  推荐菜: ${liuxiang.recommendations.join(', ')}`);
}
