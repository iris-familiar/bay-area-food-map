#!/usr/bin/env node
/**
 * 全局QA验证 - 最终检查
 */

const fs = require('fs');
const path = require('path');

console.log('🔬 全局QA验证 - Bay Area Food Map');
console.log('='.repeat(80));
console.log('时间:', new Date().toISOString());
console.log('');

const PROJECT_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map';

// ============================================
// 1. 数据文件检查
// ============================================
console.log('📁 1. 数据文件检查');
console.log('-'.repeat(80));

const requiredFiles = [
  'data/current/restaurant_database.json',
  'data/current/restaurant_database_v5_ui.json',
  'data/current/search_mapping.json'
];

let allFilesExist = true;
requiredFiles.forEach(f => {
  const fullPath = path.join(PROJECT_DIR, f);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`  ✅ ${f}`);
    console.log(`     大小: ${(stats.size / 1024).toFixed(1)} KB`);
  } else {
    console.log(`  ❌ ${f} - 文件不存在!`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.error('\n❌ 关键文件缺失，QA失败');
  process.exit(1);
}

// ============================================
// 2. 数据库完整性检查
// ============================================
console.log('');
console.log('🗄️  2. 数据库完整性检查');
console.log('-'.repeat(80));

const db = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'data/current/restaurant_database.json'), 'utf8'));

console.log(`  餐厅总数: ${db.restaurants.length}`);
console.log(`  数据版本: ${db.version || '未设置'}`);

// 检查每个餐厅的必填字段
let issues = [];
const requiredFields = ['id', 'name', 'cuisine', 'total_engagement', 'sources'];

db.restaurants.forEach((r, i) => {
  requiredFields.forEach(field => {
    if (!r[field]) {
      issues.push(`餐厅 #${i+1} (${r.name || 'N/A'}): 缺少 ${field}`);
    }
  });
  
  // Google数据检查
  if (!r.google_place_id) {
    issues.push(`餐厅 #${i+1} (${r.name}): 缺少 google_place_id`);
  }
  if (!r.google_rating) {
    issues.push(`餐厅 #${i+1} (${r.name}): 缺少 google_rating`);
  }
  if (!r.address) {
    issues.push(`餐厅 #${i+1} (${r.name}): 缺少 address`);
  }
  if (r.verified !== true) {
    issues.push(`餐厅 #${i+1} (${r.name}): 未标记为已验证`);
  }
});

if (issues.length === 0) {
  console.log('  ✅ 所有餐厅数据完整');
} else {
  console.log(`  ❌ 发现 ${issues.length} 个问题:`);
  issues.slice(0, 10).forEach(issue => console.log(`     - ${issue}`));
  if (issues.length > 10) {
    console.log(`     ... 还有 ${issues.length - 10} 个问题`);
  }
}

// ============================================
// 3. Google数据真实性检查
// ============================================
console.log('');
console.log('🔍 3. Google数据真实性检查');
console.log('-'.repeat(80));

let fakeDataCount = 0;
db.restaurants.forEach(r => {
  // 检查是否是之前生成的假Place ID
  if (r.google_place_id && (
    r.google_place_id.includes('5rS7') || 
    r.google_place_id.includes('VGFu') ||
    r.google_place_id.length < 20
  )) {
    fakeDataCount++;
    console.log(`  ⚠️  ${r.name}: 可能是假数据 (${r.google_place_id})`);
  }
});

if (fakeDataCount === 0) {
  console.log('  ✅ 未发现假数据');
} else {
  console.log(`  ❌ 发现 ${fakeDataCount} 条可疑数据`);
}

// ============================================
// 4. 地区分布统计
// ============================================
console.log('');
console.log('📍 4. 地区分布统计');
console.log('-'.repeat(80));

const areaCount = {};
db.restaurants.forEach(r => {
  const area = r.area || 'Unknown';
  areaCount[area] = (areaCount[area] || 0) + 1;
});

Object.entries(areaCount)
  .sort((a, b) => b[1] - a[1])
  .forEach(([area, count]) => {
    console.log(`  ${area}: ${count}家`);
  });

// ============================================
// 5. 菜系分布统计
// ============================================
console.log('');
console.log('🍜 5. 菜系分布统计');
console.log('-'.repeat(80));

const cuisineCount = {};
db.restaurants.forEach(r => {
  const cuisine = r.cuisine || 'Unknown';
  cuisineCount[cuisine] = (cuisineCount[cuisine] || 0) + 1;
});

Object.entries(cuisineCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([cuisine, count]) => {
    console.log(`  ${cuisine}: ${count}家`);
  });

// ============================================
// 6. 数据一致性检查
// ============================================
console.log('');
console.log('🔗 6. 数据一致性检查');
console.log('-'.repeat(80));

// 检查v5_ui.json是否与主数据库一致
const v5Db = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'data/current/restaurant_database_v5_ui.json'), 'utf8'));

if (v5Db.restaurants.length === db.restaurants.length) {
  console.log('  ✅ v5_ui.json 餐厅数量一致');
} else {
  console.log(`  ❌ v5_ui.json 餐厅数量不匹配 (${v5Db.restaurants.length} vs ${db.restaurants.length})`);
}

// ============================================
// 7. Top餐厅检查
// ============================================
console.log('');
console.log('🏆 7. Top 10 餐厅 (按讨论度)');
console.log('-'.repeat(80));

const top10 = [...db.restaurants]
  .sort((a, b) => (b.total_engagement || 0) - (a.total_engagement || 0))
  .slice(0, 10);

top10.forEach((r, i) => {
  const status = r.verified ? '✅' : '❌';
  console.log(`  ${status} ${i+1}. ${r.name.padEnd(20)} | ${r.cuisine?.padEnd(8)} | 讨论度: ${r.total_engagement} | Google: ${r.google_rating}⭐`);
});

// ============================================
// 8. 总结
// ============================================
console.log('');
console.log('='.repeat(80));
console.log('📋 QA总结');
console.log('='.repeat(80));

const totalIssues = issues.length + fakeDataCount;

if (totalIssues === 0) {
  console.log('✅ 所有检查通过！数据完整且真实。');
} else {
  console.log(`⚠️  发现 ${totalIssues} 个问题，需要修复。`);
}

console.log('');
console.log('关键指标:');
console.log(`  - 餐厅总数: ${db.restaurants.length}`);
console.log(`  - 已验证: ${db.restaurants.filter(r => r.verified).length}/${db.restaurants.length}`);
console.log(`  - 有Google评分: ${db.restaurants.filter(r => r.google_rating).length}/${db.restaurants.length}`);
console.log(`  - 有真实地址: ${db.restaurants.filter(r => r.address && !r.address.includes('Bay Area')).length}/${db.restaurants.length}`);

console.log('');
console.log('QA完成时间:', new Date().toISOString());
