#!/usr/bin/env node
/**
 * 修复Google Places匹配错误
 * 核心改进：优先使用英文名（如果有）进行匹配
 */

const fs = require('fs');

const DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🔧 修复Google Places匹配错误');
console.log('='.repeat(70));
console.log('修复策略：优先使用英文名匹配，中英文结果交叉验证');
console.log('='.repeat(70));

// 修复记录
const fixes = [];
const manualReview = [];

db.restaurants.forEach(r => {
  // 场景1: 有英文名但匹配到了错误的商家
  if (r.name_en && r.google_place_id) {
    const googleName = (r.google_name || '').toLowerCase();
    const englishName = r.name_en.toLowerCase();
    const chineseName = r.name.toLowerCase();
    
    // 检查英文名是否被包含在Google名中
    const englishMatch = googleName.includes(englishName.split(' ')[0]) || 
                        englishName.includes(googleName.split(' ')[0]);
    
    // 检查中文名是否被包含
    const chineseMatch = googleName.includes(chineseName.substring(0, 4));
    
    // 如果都不匹配 → 错误匹配
    if (!englishMatch && !chineseMatch) {
      console.log(`\n❌ 错误匹配: ${r.name} (${r.name_en})`);
      console.log(`   Google返回: ${r.google_name}`);
      console.log(`   地址: ${r.address}`);
      
      // 清除错误数据
      fixes.push({
        name: r.name,
        name_en: r.name_en,
        action: '清除错误匹配',
        old_google_name: r.google_name,
        old_address: r.address
      });
      
      r.google_place_id = null;
      r.google_name = null;
      r.google_rating = null;
      r.address = null;
      r.verified = false;
      r.google_match_status = 'needs_rematch_with_english_name';
      
      manualReview.push(r);
    }
  }
  
  // 场景2: 有英文名但没有Google信息 → 应该用英文名重新匹配
  if (r.name_en && !r.google_place_id && !r.address) {
    console.log(`\n⚠️  待重新匹配: ${r.name} (${r.name_en})`);
    r.google_match_status = 'pending_english_name_search';
    manualReview.push(r);
  }
});

console.log('\n' + '='.repeat(70));
console.log(`修复统计:`);
console.log(`  清除错误匹配: ${fixes.length} 家`);
console.log(`  需要重新匹配: ${manualReview.length} 家`);

if (fixes.length > 0) {
  console.log('\n📋 修复详情:');
  fixes.forEach((f, i) => {
    console.log(`  ${i+1}. ${f.name}`);
    console.log(`     英文名: ${f.name_en}`);
    console.log(`     原错误匹配: ${f.old_google_name}`);
  });
}

// 保存
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');

console.log('\n' + '='.repeat(70));
console.log('💾 已保存修复后的数据');
console.log('');
console.log('下一步:');
console.log('  1. 运行 goplaces search "Umami Dumpling House Sunnyvale CA"');
console.log('  2. 手动验证匹配结果');
console.log('  3. 更新数据库');
