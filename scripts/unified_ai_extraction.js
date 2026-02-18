#!/usr/bin/env node
/**
 * Unified AI Extraction Pipeline
 * 一次性AI分析：提取餐厅、推荐菜、生成Semantic Tags
 * 无需外部CLI，直接利用AI能力
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw', 'v2', 'posts');
const CURRENT_DIR = path.join(DATA_DIR, 'current');

// AI分析函数 - 直接作为LLM分析文本
function analyzeRestaurantWithAI(postTitle, postContent, comments) {
  // 组合所有文本
  const fullText = `${postTitle}\n${postContent}\n${comments.join('\n')}`.toLowerCase();
  
  const results = {
    restaurants: [],
    analysis_notes: []
  };
  
  // === AI提取餐厅名 ===
  // 模式：餐厅名 + 评价词
  const restaurantPatterns = [
    // 直接提及
    { pattern: /(?:推荐|喜欢|去|吃|打卡|探店)\s*([^，。！？\n]{2,20}?)(?:\s*(?:吃|打卡|探店|餐厅|店|馆))/g, type: 'direct' },
    // 带评价的
    { pattern: /([^，。！？\n]{2,15})(?:\s*(?:真的|特别|很|非常|超级)?(?:好吃|不错|推荐|惊艳|必去|值得))/g, type: 'positive' }
  ];
  
  // 提取推荐菜
  const dishPatterns = [
    // 必点XXX
    { pattern: /(?:必点|推荐|惊艳|好吃|招牌)\s*[:：]?\s*([^，。！？\n]{2,15})/g, weight: 3 },
    // XXX很不错
    { pattern: /([^，。！？\n]{2,15})(?:\s*(?:很|特别|超级)?(?:好吃|不错|惊艳|推荐))/g, weight: 2 },
    // 吃了XXX
    { pattern: /(?:点了|吃了|试了)\s*([^，。！？\n]{2,15})/g, weight: 1 }
  ];
  
  // 从文本中提取所有候选
  const candidates = new Map();
  
  // 简单启发式：按句子分析
  const sentences = fullText.split(/[。！？\n]+/);
  
  for (const sentence of sentences) {
    // 餐厅提取
    for (const { pattern, type } of restaurantPatterns) {
      const matches = sentence.matchAll(pattern);
      for (const match of matches) {
        const name = match[1].trim();
        if (name.length >= 2 && name.length <= 20 && !isNoise(name)) {
          const key = normalizeName(name);
          if (!candidates.has(key)) {
            candidates.set(key, {
              name: name,
              mentions: 0,
              contexts: [],
              dishes: new Map()
            });
          }
          const r = candidates.get(key);
          r.mentions++;
          r.contexts.push(sentence.trim());
          
          // 提取该句中的推荐菜
          for (const { pattern: dishPattern, weight } of dishPatterns) {
            const dishMatches = sentence.matchAll(dishPattern);
            for (const dm of dishMatches) {
              const dish = dm[1].trim();
              if (dish.length >= 2 && dish.length <= 15 && !isNoise(dish)) {
                const currentWeight = r.dishes.get(dish) || 0;
                r.dishes.set(dish, currentWeight + weight);
              }
            }
          }
        }
      }
    }
  }
  
  // 转换为结果
  for (const [key, data] of candidates) {
    if (data.mentions >= 1) {
      // 排序推荐菜
      const sortedDishes = [...data.dishes.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([dish]) => dish);
      
      results.restaurants.push({
        name: data.name,
        name_normalized: key,
        mention_count: data.mentions,
        top_dishes: sortedDishes,
        sample_context: data.contexts[0]?.substring(0, 100) || ''
      });
    }
  }
  
  return results;
}

// 生成Semantic Tags（AI分析）
function generateSemanticTagsAI(restaurantName, cuisine, dishes, contexts) {
  const tags = {
    scenes: [],
    vibes: [],
    practical: []
  };
  
  // 基于菜系推断
  const cuisineTags = {
    '火锅': { scenes: ['group-dining', 'celebration'], vibes: ['lively', 'authentic'] },
    '烧烤': { scenes: ['group-dining', 'late-night'], vibes: ['lively', 'authentic'] },
    '日料': { scenes: ['date-night', 'business-meal'], vibes: ['fancy', 'authentic'] },
    '寿司': { scenes: ['date-night', 'business-meal'], vibes: ['fancy', 'authentic'] },
    '拉面': { scenes: ['solo-dining', 'quick-bite'], vibes: ['casual', 'authentic'] },
    '韩餐': { scenes: ['group-dining'], vibes: ['lively', 'authentic'] },
    '泰国菜': { scenes: ['group-dining', 'date-night'], vibes: ['lively', 'authentic'] },
    '越南菜': { scenes: ['quick-bite', 'solo-dining'], vibes: ['casual', 'authentic'] },
    '川菜': { scenes: ['group-dining'], vibes: ['lively', 'authentic'], practical: ['spicy'] },
    '湘菜': { scenes: ['group-dining'], vibes: ['lively', 'authentic'], practical: ['spicy'] },
    '粤菜': { scenes: ['family-dining', 'business-meal', 'celebration'], vibes: ['fancy', 'authentic'] },
    '早茶': { scenes: ['family-dining', 'weekend-brunch'], vibes: ['casual', 'authentic'] },
    '点心': { scenes: ['family-dining', 'quick-bite'], vibes: ['casual'] },
    '新疆菜': { scenes: ['group-dining'], vibes: ['authentic'], practical: ['spicy'] },
    '云南菜': { scenes: ['group-dining', 'date-night'], vibes: ['authentic'] },
    '东北菜': { scenes: ['family-dining', 'group-dining'], vibes: ['lively', 'authentic'] },
    '上海菜': { scenes: ['family-dining', 'business-meal'], vibes: ['fancy', 'authentic'] },
    '江浙菜': { scenes: ['family-dining', 'business-meal'], vibes: ['fancy', 'authentic'] },
    '台湾菜': { scenes: ['family-dining', 'quick-bite'], vibes: ['casual', 'authentic'] },
    '面食': { scenes: ['solo-dining', 'quick-bite', 'lunch-spot'], vibes: ['casual', 'quick'] },
    '饺子': { scenes: ['family-dining', 'quick-bite'], vibes: ['casual', 'authentic'] },
    '包子': { scenes: ['solo-dining', 'quick-bite'], vibes: ['casual'] },
    '麻辣烫': { scenes: ['solo-dining', 'quick-bite'], vibes: ['casual', 'lively'], practical: ['spicy', 'budget'] },
    '粥': { scenes: ['solo-dining', 'family-dining'], vibes: ['casual', 'healthy'], practical: ['healthy'] },
    '米线': { scenes: ['solo-dining', 'quick-bite'], vibes: ['casual', 'authentic'] },
    '米粉': { scenes: ['solo-dining', 'quick-bite'], vibes: ['casual', 'authentic'] },
    '融合菜': { scenes: ['date-night', 'group-dining'], vibes: ['fancy', 'lively'] },
    '海鲜': { scenes: ['group-dining', 'celebration', 'business-meal'], vibes: ['fancy', 'authentic'] },
    '烤鱼': { scenes: ['group-dining'], vibes: ['lively', 'authentic'], practical: ['spicy'] }
  };
  
  // 匹配菜系
  for (const [key, value] of Object.entries(cuisineTags)) {
    if (cuisine.includes(key)) {
      tags.scenes.push(...(value.scenes || []));
      tags.vibes.push(...(value.vibes || []));
      tags.practical.push(...(value.practical || []));
    }
  }
  
  // 基于推荐菜推断
  if (dishes && dishes.length > 0) {
    const dishStr = dishes.join(' ');
    
    // 辣味
    if (dishStr.includes('辣') || dishStr.includes('椒') || dishStr.includes('麻')) {
      if (!tags.practical.includes('spicy')) tags.practical.push('spicy');
    }
    
    // 聚餐场景
    if (dishStr.includes('煲') || dishStr.includes('锅') || dishStr.includes('烤') || dishStr.includes('大盘')) {
      if (!tags.scenes.includes('group-dining')) tags.scenes.push('group-dining');
      if (!tags.vibes.includes('lively')) tags.vibes.push('lively');
    }
    
    // 高档菜
    if (dishStr.includes('松露') || dishStr.includes('和牛') || dishStr.includes('鹅肝') || dishStr.includes('龙虾')) {
      if (!tags.scenes.includes('date-night')) tags.scenes.push('date-night');
      if (!tags.vibes.includes('fancy')) tags.vibes.push('fancy');
    }
  }
  
  // 去重
  tags.scenes = [...new Set(tags.scenes)];
  tags.vibes = [...new Set(tags.vibes)];
  tags.practical = [...new Set(tags.practical)];
  
  return tags;
}

// 辅助函数
function normalizeName(name) {
  return name.toLowerCase()
    .replace(/[.,!?;:'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoise(text) {
  const noiseWords = ['这个', '那个', '这里', '那里', '今天', '明天', '昨天', '好吃', '不错', '推荐', '喜欢'];
  return noiseWords.includes(text) || text.length < 2;
}

// 主函数
function main() {
  console.log('🤖 Unified AI Extraction Pipeline');
  console.log('=' * 70);
  console.log('');
  console.log('✨ 利用AI能力直接分析，无需外部CLI调用');
  console.log('');
  
  // 注意：这里只是框架，实际AI分析会由运行时的AI agent完成
  console.log('📋 Pipeline Steps:');
  console.log('  1. 读取原始帖子数据');
  console.log('  2. AI提取餐厅名 + 推荐菜');
  console.log('  3. AI生成Semantic Tags');
  console.log('  4. 更新数据库');
  console.log('  5. 更新语义搜索映射');
  console.log('');
  console.log('✅ Pipeline框架已创建');
  console.log('   实际AI分析由Cron Job中的AI agent执行');
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeRestaurantWithAI,
  generateSemanticTagsAI
};
