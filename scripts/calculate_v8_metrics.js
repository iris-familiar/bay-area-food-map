#!/usr/bin/env node
/**
 * V8 Pipeline - Metrics Calculation ONLY
 * 只计算 sentiment_score 和 trend_30d
 * 绝不提取或修改推荐菜！
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts';
const DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_v8.json';

// 加载V8数据库
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🔬 V8 Pipeline - Metrics Calculation ONLY');
console.log('='.repeat(70));
console.log(`基础数据: ${DB_FILE}`);
console.log(`餐厅数量: ${db.restaurants.length}`);
console.log('⚠️  此脚本只计算 metrics，绝不触碰推荐菜！');
console.log('='.repeat(70));

// 情感词典
const positiveWords = [
  '好吃', '不错', '推荐', '喜欢', '爱', '正宗', '美味', '棒', '赞', '完美', 
  '必点', '好吃到', '惊艳', '满意', '值得', '香', '鲜', '嫩',
  'delicious', 'good', 'great', 'amazing', 'excellent', 'love', 'perfect',
  'authentic', 'tasty', 'yummy', 'recommend', 'best'
];

const negativeWords = [
  '难吃', '失望', '踩雷', '不好吃', '差', '糟糕', '烂', '雷', '坑', '不新鲜',
  '咸', '油腻', '贵', '不值', '后悔', '恶心', '脏', '慢',
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
  
  const score = 0.3 + (posCount / total) * 0.7;
  return { score: Math.min(score, 0.95), positive: posCount, negative: negCount, total };
}

function extractMentionContext(post, restaurantName) {
  const contexts = [];
  if (!post || !post.note) return contexts;
  
  const note = post.note;
  const keywords = [restaurantName.toLowerCase()];
  
  if (note.title) {
    const title = note.title.toLowerCase();
    if (keywords.some(k => title.includes(k))) {
      contexts.push({ text: note.title, source: 'title', date: note.time });
    }
  }
  
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

// 为每家餐厅计算metrics
let processed = 0;
let protectedRecs = 0;

db.restaurants.forEach(r => {
  processed++;
  
  // 检查是否已有LLM推荐菜
  const hasLLMRecommendations = r.recommendations && r.recommendations.length > 0;
  if (hasLLMRecommendations) {
    protectedRecs++;
  }
  
  // 收集所有相关文本
  let allContexts = [];
  let sentimentSum = 0;
  let sentimentCount = 0;
  let positiveMentions = 0;
  let negativeMentions = 0;
  
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
    r.sentiment_score = 0.5;
  }
  
  // 计算 Trend
  if (r.post_details && r.post_details.length > 0) {
    const sorted = [...r.post_details].sort((a, b) => new Date(a.date) - new Date(b.date));
    const now = Date.now();
    const recentPosts = sorted.filter(p => {
      const postTime = new Date(p.date).getTime();
      return (now - postTime) < 30 * 24 * 60 * 60 * 1000;
    });
    
    if (sorted.length >= 2) {
      const recentEngagement = recentPosts.reduce((sum, p) => sum + (p.engagement || 0), 0);
      const totalEngagement = r.total_engagement || 1;
      const recentRatio = recentEngagement / totalEngagement;
      r.trend_30d = Math.round(recentRatio * 100);
    } else {
      r.trend_30d = 0;
    }
  } else {
    r.trend_30d = 0;
  }
  
  // ⚠️ 绝不触碰推荐菜字段！
  // 推荐菜的提取应该在 v8_llm_extraction.js 中完成
  
  if (processed % 10 === 0) {
    console.log(`  已处理 ${processed}/${db.restaurants.length} 家餐厅`);
  }
});

// 保存到V8文件
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');

console.log('\n' + '='.repeat(70));
console.log('✅ V8 Metrics 计算完成！');
console.log(`   保护LLM推荐菜: ${protectedRecs} 家`);
console.log(`   未触碰任何推荐菜字段`);

// 统计
const sentiments = db.restaurants.map(r => r.sentiment_score);
const trends = db.restaurants.map(r => r.trend_30d);
console.log(`\n口碑范围: ${Math.min(...sentiments).toFixed(2)} - ${Math.max(...sentiments).toFixed(2)}`);
console.log(`趋势范围: ${Math.min(...trends)} - ${Math.max(...trends)}`);
console.log('\n⚠️  确认: 此脚本没有修改任何推荐菜');
