#!/usr/bin/env node
/**
 * 清理不准确的推荐菜数据
 * 当前的推荐菜是基于简单关键词匹配，不是真实的推荐
 */

const fs = require('fs');

const DB_FILE = './data/current/restaurant_database.json';
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🧹 清理不准确的推荐菜数据');
console.log('='.repeat(70));

let cleaned = 0;

db.restaurants.forEach(r => {
  if (r.recommendations && r.recommendations.length > 0) {
    console.log(`清理: ${r.name} - 原推荐: ${r.recommendations.join(', ')}`);
    
    // 删除推荐菜（因为是基于简单关键词匹配，不准确）
    delete r.recommendations;
    delete r.recommendations_source;
    
    cleaned++;
  }
});

console.log('');
console.log(`已清理 ${cleaned} 家餐厅的不准确推荐菜`);

// 保存
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
fs.writeFileSync('./data/current/restaurant_database.json', JSON.stringify(db, null, 2), 'utf8');

console.log('');
console.log('💾 已保存');
console.log('');
console.log('说明:');
console.log('  推荐菜字段已删除，因为当前提取方法（关键词匹配）不准确。');
console.log('  如需真实推荐菜，需要从帖子中识别"推荐XXX"、"必点XXX"等模式。');
