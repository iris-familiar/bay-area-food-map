#!/usr/bin/env node
/**
 * 将V8数据库转换为V5兼容格式
 */

const fs = require('fs');
const path = require('path');

const V8_PATH = path.join(__dirname, '../data/current/restaurant_database_v8.json');
const OUTPUT_PATH = path.join(__dirname, '../data/current/restaurant_database_v5_ui.json');

console.log('🔄 转换V8数据库为V5格式...');

const v8 = JSON.parse(fs.readFileSync(V8_PATH, 'utf-8'));

const converted = v8.restaurants.map(r => {
  // 提取城市从地址
  let city = r.city;
  if (!city && r.address) {
    const match = r.address.match(/,\s*([A-Za-z\s]+),?\s*CA\s*\d{5}/i);
    city = match ? match[1].trim() : '';
  }
  
  // 推断region
  let region = r.region;
  if (!region && city) {
    const regionMap = {
      'Fremont': 'East Bay', 'Milpitas': 'South Bay', 'Sunnyvale': 'South Bay',
      'Cupertino': 'South Bay', 'San Jose': 'South Bay', 'Mountain View': 'South Bay',
      'Santa Clara': 'South Bay', 'Palo Alto': 'Peninsula', 'San Mateo': 'Peninsula',
      'Hayward': 'East Bay', 'Oakland': 'East Bay', 'Berkeley': 'East Bay',
      'Newark': 'East Bay', 'San Leandro': 'East Bay'
    };
    region = regionMap[city] || 'South Bay';
  }
  
  return {
    ...r,
    // V5兼容字段
    engagement: r.total_engagement || r.engagement || 0,
    sentiment_score: r.sentiment_score || (r.sentiment_analysis?.score) || 0.5,
    city: city || r.area || '',
    region: region || '',
    xiaohongshu_id: r.id || r.xiaohongshu_id || ''
  };
});

// 只保留active餐厅
const active = converted.filter(r => r.is_active !== false);

const output = {
  ...v8,
  restaurants: active
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
console.log(`✓ 已转换 ${active.length} 家餐厅`);
console.log(`✓ 输出: ${OUTPUT_PATH}`);

// 更新symlink
const symlinkPath = path.join(__dirname, '../data/current/restaurant_database.json');
if (fs.existsSync(symlinkPath)) {
  fs.unlinkSync(symlinkPath);
}
fs.symlinkSync('restaurant_database_v5_ui.json', symlinkPath);
console.log('✓ Symlink已更新');
