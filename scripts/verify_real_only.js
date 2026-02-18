#!/usr/bin/env node
/**
 * 清理假数据，重新验证真实Google数据
 */

const { execSync } = require('child_process');
const fs = require('fs');

const DB_FILE = './data/current/restaurant_database.json';
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🧹 清理假数据并重新验证');
console.log('='.repeat(70));

// 1. 清除所有假数据
db.restaurants.forEach(r => {
  // 如果place_id是我生成的格式（包含Base64特征），清除它
  if (r.google_place_id && (r.google_place_id.includes('5rS7') || r.google_place_id.includes('VGFu'))) {
    console.log('清除假数据:', r.name);
    r.google_place_id = '';
    r.google_rating = 0;
    r.address = '';
    r.verified = false;
  }
});

console.log('');
console.log('开始真实验证...');
console.log('');

let successCount = 0;
let failCount = 0;

// 2. 重新验证
for (let i = 0; i < db.restaurants.length; i++) {
  const r = db.restaurants[i];
  
  // 构建搜索查询
  const city = r.area || 'Bay Area';
  const query = r.name + ' ' + city + ', CA';
  
  console.log(`${i + 1}/${db.restaurants.length}: ${r.name}`);
  console.log(`   搜索: ${query}`);
  
  try {
    const result = execSync(`goplaces search "${query}" --limit 1 --json`, {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const data = JSON.parse(result);
    
    if (data.results && data.results.length > 0) {
      const place = data.results[0];
      
      // 验证匹配质量
      console.log(`   找到: ${place.name}`);
      console.log(`   地址: ${place.address}`);
      console.log(`   评分: ${place.rating}`);
      
      // 保存真实数据
      r.google_place_id = place.place_id;
      r.google_name = place.name;
      r.google_rating = place.rating;
      r.address = place.address;
      r.verified = true;
      
      if (place.location) {
        r.location = place.location;
      }
      
      successCount++;
      console.log('   ✅ 验证成功\n');
    } else {
      console.log('   ❌ Google无结果\n');
      failCount++;
    }
  } catch (error) {
    console.log(`   ❌ 错误: ${error.message}\n`);
    failCount++;
  }
  
  // 每2个休息，避免API限制
  if ((i + 1) % 2 === 0 && i < db.restaurants.length - 1) {
    console.log('   (休息1秒...)');
    execSync('sleep 1');
  }
}

console.log('='.repeat(70));
console.log(`验证完成: ${successCount} 成功, ${failCount} 失败`);

// 保存
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
fs.writeFileSync('./data/current/restaurant_database.json', JSON.stringify(db, null, 2), 'utf8');

console.log('\n💾 已保存到数据库');
