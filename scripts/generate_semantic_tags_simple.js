#!/usr/bin/env node
/**
 * 基于Cuisine生成Semantic Tags (简化版)
 * 不需要外部LLM API，基于菜系推断场景和氛围
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'current', 'restaurant_database.json');

// 菜系到tags的映射规则
const CUISINE_TAGS = {
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
  '麻辣烫': { scenes: ['solo-dining', 'quick-bite'], vibes: ['casual', 'lively'], practical: ['spicy'] },
  '粥': { scenes: ['solo-dining', 'family-dining'], vibes: ['casual', 'healthy'], practical: ['healthy'] },
  '米线': { scenes: ['solo-dining', 'quick-bite'], vibes: ['casual', 'authentic'] },
  '米粉': { scenes: ['solo-dining', 'quick-bite'], vibes: ['casual', 'authentic'] },
  '融合菜': { scenes: ['date-night', 'group-dining'], vibes: ['fancy', 'lively'] },
  '海鲜': { scenes: ['group-dining', 'celebration', 'business-meal'], vibes: ['fancy', 'authentic'] },
  '烤鱼': { scenes: ['group-dining'], vibes: ['lively', 'authentic'], practical: ['spicy'] }
};

// 根据推荐菜推断tags
function inferFromDishes(dishes) {
  const tags = { scenes: [], vibes: [], practical: [] };
  
  if (!dishes || dishes.length === 0) return tags;
  
  const dishStr = dishes.join(' ');
  
  // 辣味推断
  if (dishStr.includes('辣') || dishStr.includes('椒') || dishStr.includes('麻')) {
    tags.practical.push('spicy');
  }
  
  // 场景推断
  if (dishStr.includes('煲') || dishStr.includes('锅') || dishStr.includes('烤')) {
    tags.scenes.push('group-dining');
    tags.vibes.push('lively');
  }
  
  return tags;
}

function generateTags(restaurant) {
  const cuisine = restaurant.cuisine || '';
  const dishes = restaurant.recommendations || [];
  
  // 基础tags
  let tags = {
    scenes: [],
    vibes: [],
    practical: []
  };
  
  // 从菜系匹配
  for (const [key, value] of Object.entries(CUISINE_TAGS)) {
    if (cuisine.includes(key)) {
      tags.scenes.push(...(value.scenes || []));
      tags.vibes.push(...(value.vibes || []));
      tags.practical.push(...(value.practical || []));
    }
  }
  
  // 从推荐菜推断
  const dishTags = inferFromDishes(dishes);
  tags.scenes.push(...dishTags.scenes);
  tags.vibes.push(...dishTags.vibes);
  tags.practical.push(...dishTags.practical);
  
  // 去重
  tags.scenes = [...new Set(tags.scenes)];
  tags.vibes = [...new Set(tags.vibes)];
  tags.practical = [...new Set(tags.practical)];
  
  return tags;
}

function main() {
  console.log('🏷️  基于Cuisine生成Semantic Tags (简化版)');
  console.log('=' * 70);
  
  // 加载数据库
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  
  let updated = 0;
  
  db.restaurants.forEach((r, i) => {
    // 生成tags
    const tags = generateTags(r);
    
    // 保存
    r.semantic_tags = tags;
    updated++;
    
    if ((i + 1) % 10 === 0 || i === db.restaurants.length - 1) {
      console.log(`  已处理 ${i + 1}/${db.restaurants.length} 家`);
    }
  });
  
  // 保存
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  fs.writeFileSync(DB_FILE.replace('.json', '_v5_ui.json'), JSON.stringify(db, null, 2), 'utf8');
  
  console.log('');
  console.log(`✅ 完成! 为 ${updated} 家餐厅生成semantic tags`);
  
  // 显示示例
  console.log('');
  console.log('示例:');
  db.restaurants.slice(0, 3).forEach(r => {
    console.log(`  ${r.name} (${r.cuisine}):`);
    console.log(`    scenes: ${r.semantic_tags.scenes.join(', ') || '无'}`);
    console.log(`    vibes: ${r.semantic_tags.vibes.join(', ') || '无'}`);
    console.log(`    practical: ${r.semantic_tags.practical.join(', ') || '无'}`);
  });
}

main();
