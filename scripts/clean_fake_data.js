#!/usr/bin/env node
/**
 * 清理假数据 - 只保留真实可验证的数据
 */

const fs = require('fs');

const db = JSON.parse(fs.readFileSync('./data/current/restaurant_database.json', 'utf8'));

console.log('🧹 清理假数据');
console.log('='.repeat(70));

let cleaned = 0;

db.restaurants.forEach(r => {
  // 删除假的sentiment_score (无法从Xiaohongshu数据计算真实口碑)
  if (r.sentiment_score) {
    delete r.sentiment_score;
    cleaned++;
  }
  
  // 删除假的trend_30d (没有真实的时间序列数据)
  if (r.trend_30d !== undefined) {
    delete r.trend_30d;
  }
  
  // recommendations保留但标记为自动生成
  if (r.recommendations && r.recommendations.length > 0) {
    // 这些是从帖子中提取的或按菜系推断的
    r.recommendations_source = 'inferred';
  }
});

console.log(`已清理 ${cleaned} 家餐厅的假数据字段`);

// 保存
fs.writeFileSync('./data/current/restaurant_database.json', JSON.stringify(db, null, 2), 'utf8');
fs.writeFileSync('./data/current/restaurant_database.json', JSON.stringify(db, null, 2), 'utf8');

console.log('✅ 已保存');
console.log('');
console.log('剩余真实数据字段:');
console.log('  - name, cuisine, area: ✅ 真实');
console.log('  - total_engagement: ✅ 从帖子计算');
console.log('  - mention_count: ✅ 从帖子计算');
console.log('  - google_rating: ✅ Google Places真实');
console.log('  - google_place_id: ✅ Google Places真实');
console.log('  - address: ✅ Google Places真实');
console.log('  - post_details: ✅ 原始帖子数据');
console.log('  - recommendations: ⚠️  推断/部分提取');
