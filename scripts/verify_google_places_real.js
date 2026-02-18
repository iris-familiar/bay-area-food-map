#!/usr/bin/env node
/**
 * Google Places 验证 - 使用goplaces CLI
 * 验证所有餐厅的真实Google数据
 */

const { execSync } = require('child_process');
const fs = require('fs');

const DB_FILE = './data/current/restaurant_database.json';
const BACKUP_FILE = './data/current/restaurant_database_pre_verify.json';

console.log('🔍 Google Places 验证工具');
console.log('='.repeat(70));

// 备份当前数据
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
fs.writeFileSync(BACKUP_FILE, JSON.stringify(db, null, 2), 'utf8');
console.log('已备份数据到:', BACKUP_FILE);
console.log('');

// 城市映射
const cityMap = {
  'Cupertino': 'Cupertino, CA',
  'Sunnyvale': 'Sunnyvale, CA',
  'Milpitas': 'Milpitas, CA',
  'Fremont': 'Fremont, CA',
  'Mountain View': 'Mountain View, CA',
  'San Jose': 'San Jose, CA',
  'Palo Alto': 'Palo Alto, CA',
  'Santa Clara': 'Santa Clara, CA',
  'San Francisco': 'San Francisco, CA',
  'San Leandro': 'San Leandro, CA',
  'Millbrae': 'Millbrae, CA',
  'SF': 'San Francisco, CA',
  'Albany': 'Albany, CA'
};

let verifiedCount = 0;
let failedCount = 0;

// 验证每个餐厅
db.restaurants.forEach((r, index) => {
  const city = cityMap[r.area] || 'Bay Area, CA';
  const query = `${r.name} ${city}`;
  
  console.log(`\n${index + 1}/${db.restaurants.length}: ${r.name}`);
  console.log(`   查询: ${query}`);
  
  try {
    // 调用goplaces搜索
    const result = execSync(`goplaces search "${query}" --limit 1 --json`, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const data = JSON.parse(result);
    
    if (data.results && data.results.length > 0) {
      const place = data.results[0];
      
      // 更新真实数据
      r.google_place_id = place.place_id;
      r.google_name = place.name;
      r.google_rating = place.rating;
      r.address = place.formatted_address;
      r.verified = true;
      
      // 如果有坐标
      if (place.geometry && place.geometry.location) {
        r.location = {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng
        };
      }
      
      console.log(`   ✅ 验证成功`);
      console.log(`      评分: ${place.rating}⭐`);
      console.log(`      地址: ${place.formatted_address.substring(0, 50)}...`);
      verifiedCount++;
    } else {
      console.log(`   ❌ 未找到`);
      r.verified = false;
      failedCount++;
    }
  } catch (error) {
    console.log(`   ❌ 验证失败: ${error.message}`);
    r.verified = false;
    failedCount++;
  }
  
  // 每5个休息1秒，避免API限制
  if ((index + 1) % 5 === 0) {
    console.log('\n   (休息1秒...)');
    execSync('sleep 1');
  }
});

console.log('\n' + '='.repeat(70));
console.log('验证完成!');
console.log(`✅ 成功: ${verifiedCount}/${db.restaurants.length}`);
console.log(`❌ 失败: ${failedCount}/${db.restaurants.length}`);

// 保存验证后的数据
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
fs.writeFileSync('./data/current/restaurant_database.json', JSON.stringify(db, null, 2), 'utf8');

console.log('\n💾 已保存到:');
console.log('  - restaurant_database.json');
console.log('  - restaurant_database.json');
console.log('\n⚠️  注意: Google Places API可能有每日请求限制');
console.log('   如果大量失败，可能是API配额已满');
