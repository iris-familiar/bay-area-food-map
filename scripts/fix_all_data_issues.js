#!/usr/bin/env node
/**
 * 彻底修复数据问题
 * 1. 修复重复ID
 * 2. 清除错误的Google匹配
 * 3. 重新匹配"鲜味水饺"
 */

const fs = require('fs');

const DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🔧 彻底修复数据问题');
console.log('='.repeat(70));

// Step 1: 检查重复ID
const idCounts = {};
db.restaurants.forEach(r => {
  idCounts[r.id] = (idCounts[r.id] || 0) + 1;
});

const duplicateIds = Object.entries(idCounts)
  .filter(([id, count]) => count > 1)
  .map(([id]) => id);

console.log(`发现 ${duplicateIds.length} 个重复ID: ${duplicateIds.join(', ')}`);

// Step 2: 重新分配ID
let nextId = Math.max(...db.restaurants.map(r => parseInt(r.id.replace('r', '')))) + 1;

duplicateIds.forEach(dupId => {
  const duplicates = db.restaurants.filter(r => r.id === dupId);
  console.log(`\n处理重复ID ${dupId}:`);
  
  duplicates.forEach((r, idx) => {
    if (idx === 0) {
      console.log(`  保留: ${r.name} (${r.id})`);
    } else {
      const newId = `r${nextId.toString().padStart(3, '0')}`;
      console.log(`  重分配: ${r.name} → ${newId}`);
      r.id = newId;
      r.original_id = dupId; // 记录原始ID
      nextId++;
    }
  });
});

// Step 3: 修复"鲜味水饺"的错误数据
const xianwei = db.restaurants.find(r => r.name === '鲜味水饺');
if (xianwei) {
  console.log('\n' + '='.repeat(70));
  console.log('修复 "鲜味水饺":');
  console.log(`  当前数据:`);
  console.log(`    - Google Place ID: ${xianwei.google_place_id}`);
  console.log(`    - 地址: ${xianwei.address}`);
  console.log(`    - 英文名: ${xianwei.name_en}`);
  console.log(`    - 帖子标题: ${xianwei.post_details?.[0]?.title}`);
  
  // 问题：帖子说的是"鲜味水饺"，但Google匹配的是另一个商家
  // 解决方案：清除Google数据，重新用英文名搜索
  
  console.log('\n  清除错误的Google匹配数据...');
  
  // 保存旧数据供参考
  xianwei.google_match_history = {
    old_place_id: xianwei.google_place_id,
    old_address: xianwei.address,
    cleared_at: new Date().toISOString(),
    reason: '帖子内容与Google匹配结果不符，需用英文名重新匹配'
  };
  
  // 清除数据
  xianwei.google_place_id = null;
  xianwei.address = null;
  xianwei.google_rating = null;
  xianwei.google_name = null;
  xianwei.verified = false;
  xianwei.google_match_status = 'pending_english_name_search';
  
  console.log('  ✅ 已清除，等待用英文名 "Umami Dumpling House" 重新匹配');
}

// Step 4: 同样处理"面面俱到"
const mianmian = db.restaurants.find(r => r.name === '面面俱到');
if (mianmian) {
  console.log('\n' + '='.repeat(70));
  console.log('修复 "面面俱到":');
  console.log(`  该餐厅只有1个提及，无详细地址信息`);
  console.log(`  标记为需要人工补充`);
  
  mianmian.google_match_status = 'needs_manual_verification';
  mianmian.data_quality = 'low';
}

console.log('\n' + '='.repeat(70));

// Step 5: 验证修复结果
const finalIdCounts = {};
db.restaurants.forEach(r => {
  finalIdCounts[r.id] = (finalIdCounts[r.id] || 0) + 1;
});

const stillDuplicate = Object.entries(finalIdCounts).filter(([id, count]) => count > 1);
console.log(`修复后重复ID数量: ${stillDuplicate.length}`);

if (stillDuplicate.length === 0) {
  console.log('✅ 所有ID已唯一化');
} else {
  console.log('❌ 仍有重复:', stillDuplicate);
}

// 保存
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');

console.log('\n💾 已保存修复后的数据');
console.log('');
console.log('下一步操作:');
console.log('  1. 运行: goplaces search "Umami Dumpling House Sunnyvale CA"');
console.log('  2. 验证搜索结果是否匹配帖子内容');
console.log('  3. 手动更新数据库');
console.log('');
console.log('关于"面面俱到":');
console.log('  - 需要查看原帖确认具体位置和详细信息');
console.log('  - 可能和"鲜味水饺"是同一家（不同称呼）');
console.log('  - 也可能是完全不同的餐厅，只是ID分配错误');
