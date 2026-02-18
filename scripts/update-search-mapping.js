#!/usr/bin/env node
/**
 * Search Mapping Maintenance Script
 * 根据餐厅semantic_tags自动生成搜索映射
 * 运行: node scripts/update-search-mapping.js
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CURRENT_DIR = path.join(DATA_DIR, 'current');

// 场景匹配规则（semantic_tags -> 场景ID）
const SCENE_RULES = {
  // 场景
  date: {
    scenes: ['date-night'],
    vibes: ['fancy', 'quiet', 'romantic'],
    minSentiment: 0.75
  },
  group: {
    scenes: ['group-dining'],
    vibes: ['lively', 'authentic'],
    minSentiment: 0.6
  },
  family: {
    scenes: ['family-friendly'],
    vibes: ['cozy', 'authentic'],
    minSentiment: 0.6
  },
  business: {
    scenes: ['business', 'date-night'],
    vibes: ['fancy', 'quiet'],
    minSentiment: 0.7
  },
  solo: {
    scenes: ['solo-dining', 'casual'],
    vibes: ['casual', 'quiet'],
    minSentiment: 0.5
  },
  
  // 氛围
  quiet: {
    vibes: ['quiet', 'cozy'],
    minSentiment: 0.5
  },
  lively: {
    vibes: ['lively', 'authentic'],
    minSentiment: 0.5
  },
  fancy: {
    vibes: ['fancy'],
    priceRange: ['$$$', '$$$$'],
    minSentiment: 0.6
  },
  authentic: {
    vibes: ['authentic'],
    minSentiment: 0.65
  },
  
  // 实用
  cheap: {
    practical: ['budget'],
    priceRange: ['$', '$$'],
    minSentiment: 0.5
  },
  spicy: {
    practical: ['spicy'],
    minSentiment: 0.5
  },
  parking: {
    practical: ['parking'],
    minSentiment: 0.3
  },
  no_wait: {
    practical: ['no-wait'],
    minSentiment: 0.3
  },
  healthy: {
    practical: ['healthy'],
    minSentiment: 0.5
  }
};

// 计算餐厅与场景的匹配分数
function calculateSceneScore(restaurant, sceneId) {
  const rules = SCENE_RULES[sceneId];
  if (!rules) return 0;
  
  const tags = restaurant.semantic_tags || {};
  let score = 0;
  let matches = 0;
  
  // 匹配scenes
  if (rules.scenes) {
    const sceneMatches = rules.scenes.filter(s => tags.scenes?.includes(s)).length;
    score += sceneMatches * 3;
    matches += rules.scenes.length;
  }
  
  // 匹配vibes
  if (rules.vibes) {
    const vibeMatches = rules.vibes.filter(v => tags.vibes?.includes(v)).length;
    score += vibeMatches * 2;
    matches += rules.vibes.length;
  }
  
  // 匹配practical
  if (rules.practical) {
    const practicalMatches = rules.practical.filter(p => tags.practical?.includes(p)).length;
    score += practicalMatches * 1.5;
    matches += rules.practical.length;
  }
  
  // 价格范围匹配
  if (rules.priceRange) {
    if (rules.priceRange.includes(restaurant.price_range)) {
      score += 1;
    }
    matches += 1;
  }
  
  // 基础分
  let baseScore = matches > 0 ? score / matches : 0;
  
  // 口碑分加权（0-1分）
  const sentiment = restaurant.metrics?.sentiment_analysis?.score || 0.5;
  if (sentiment < rules.minSentiment) {
    baseScore *= 0.5; // 口碑不够，降权
  } else {
    baseScore *= (0.8 + sentiment * 0.2); // 口碑好，加权
  }
  
  // 讨论度加成（热门餐厅优先）
  const engagement = restaurant.metrics?.discussion_volume?.total_engagement || 0;
  if (engagement > 50) {
    baseScore *= 1.1;
  }
  
  return baseScore;
}

// 主流程
async function main() {
  console.log('🔄 开始更新搜索映射...\n');
  
  // 1. 加载餐厅数据
  const restaurantData = JSON.parse(
    fs.readFileSync(path.join(CURRENT_DIR, 'restaurant_database.json'), 'utf8')
  );
  const restaurants = restaurantData.restaurants;
  console.log(`📊 加载了 ${restaurants.length} 家餐厅`);
  
  // 2. 计算每个场景的匹配分数
  const sceneScores = {};
  
  for (const sceneId of Object.keys(SCENE_RULES)) {
    sceneScores[sceneId] = restaurants
      .map(r => ({
        id: r.id,
        name: r.name,
        score: calculateSceneScore(r, sceneId)
      }))
      .filter(item => item.score > 0.3) // 只保留匹配度>0.3的
      .sort((a, b) => b.score - a.score)
      .map(item => item.id);
    
    console.log(`  ✅ ${sceneId}: 匹配 ${sceneScores[sceneId].length} 家`);
  }
  
  // 3. 生成JSON供前端使用
  const searchMapping = {
    version: '2.0-simplified',
    updated_at: new Date().toISOString().split('T')[0],
    scenes: {},
    keywords: {},
    mappings: sceneScores
  };
  
  // 加载YAML配置获取场景信息
  const yamlContent = fs.readFileSync(path.join(DATA_DIR, 'search_mapping.yaml'), 'utf8');
  const yamlConfig = yaml.load(yamlContent);
  
  // 提取场景和关键词
  for (const [sceneId, config] of Object.entries(yamlConfig.scenes)) {
    searchMapping.scenes[sceneId] = {
      name: config.name,
      keywords: config.keywords
    };
    
    // 为每个关键词建立映射
    for (const keyword of config.keywords) {
      searchMapping.keywords[keyword.toLowerCase()] = sceneId;
    }
  }
  
  // 添加菜系关键词
  for (const [cuisine, keywords] of Object.entries(yamlConfig.cuisines)) {
    for (const keyword of keywords) {
      searchMapping.keywords[keyword.toLowerCase()] = cuisine;
    }
  }
  
  // 4. 保存结果
  const outputPath = path.join(CURRENT_DIR, 'search_mapping.json');
  fs.writeFileSync(outputPath, JSON.stringify(searchMapping, null, 2));
  console.log(`\n💾 已保存: ${outputPath}`);
  
  // 5. 生成报告
  console.log('\n📈 映射统计:');
  for (const [sceneId, ids] of Object.entries(sceneScores)) {
    const sceneName = searchMapping.scenes[sceneId]?.name || sceneId;
    const top3 = ids.slice(0, 3).map(id => {
      const r = restaurants.find(x => x.id === id);
      return r ? r.name : id;
    });
    console.log(`   ${sceneName} (${ids.length}家): ${top3.join(', ')}...`);
  }
  
  // 6. 检查未映射的餐厅
  const allMappedIds = new Set(Object.values(sceneScores).flat());
  const unmapped = restaurants.filter(r => !allMappedIds.has(r.id));
  if (unmapped.length > 0) {
    console.log(`\n⚠️  未匹配到任何场景的餐厅 (${unmapped.length}家):`);
    unmapped.forEach(r => console.log(`   - ${r.name} (${r.type})`));
    console.log('   建议：检查这些餐厅的semantic_tags是否完整');
  }
  
  console.log('\n✨ 完成！');
  console.log('   下一步：人工审核 search_mapping.yaml 中的映射');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
