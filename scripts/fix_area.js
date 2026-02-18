#!/usr/bin/env node
/**
 * 修复地区字段和Google Maps链接
 */

const fs = require('fs');
const db = JSON.parse(fs.readFileSync('./data/current/restaurant_database.json', 'utf8'));

console.log('🔧 修复地区字段和链接');
console.log('='.repeat(70));

// 从地址提取城市的映射
const cityFromAddress = (address) => {
  if (!address) return null;
  const match = address.match(/,\s*([A-Za-z\s]+),?\s*CA\s+\d{5}/);
  if (match) {
    const city = match[1].trim();
    return city;
  }
  return null;
};

let fixedCount = 0;

db.restaurants.forEach(r => {
  // 1. 修复缺失的area字段
  if (!r.area || r.area === 'Unknown') {
    const city = cityFromAddress(r.address);
    if (city) {
      console.log(`修复: ${r.name}`);
      console.log(`  地址: ${r.address.substring(0, 50)}...`);
      console.log(`  提取城市: ${city}`);
      r.area = city;
      fixedCount++;
    }
  }
  
  // 2. 确保有google_place_id
  if (!r.google_place_id) {
    console.log(`⚠️  ${r.name}: 缺少Place ID`);
  }
});

// 保存
fs.writeFileSync('./data/current/restaurant_database.json', JSON.stringify(db, null, 2), 'utf8');
fs.writeFileSync('./data/current/restaurant_database.json', JSON.stringify(db, null, 2), 'utf8');

console.log('');
console.log(`✅ 修复完成: ${fixedCount} 家餐厅`);

// 验证
const unknownCount = db.restaurants.filter(r => !r.area).length;
console.log(`剩余Unknown地区: ${unknownCount}/${db.restaurants.length}`);
