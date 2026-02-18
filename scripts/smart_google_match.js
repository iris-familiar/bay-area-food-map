#!/usr/bin/env node
/**
 * 智能Google Places匹配
 * 使用多种策略匹配餐厅
 */

const { execSync } = require('child_process');
const fs = require('fs');

const DB_FILE = './data/current/restaurant_database.json';
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🔍 智能Google Places匹配');
console.log('='.repeat(70));

let matched = 0;
let failed = 0;

// 分批处理 - 先处理有地区的
const withArea = db.restaurants.filter(r => r.area);
const withoutArea = db.restaurants.filter(r => !r.area);

console.log(`优先处理有地区的餐厅: ${withArea.length}家`);
console.log('');

// 为每家餐厅尝试多种搜索策略
withArea.forEach((r, index) => {
  const strategies = [
    // 策略1: 直接名称 + 地区
    `${r.name} ${r.area}, CA`,
    // 策略2: 名称 + 菜系 + 地区
    `${r.name} ${r.cuisine} ${r.area}, CA`,
    // 策略3: 英文名尝试（如果有）
    r.name_en ? `${r.name_en} ${r.area}, CA` : null
  ].filter(Boolean);
  
  console.log(`${index + 1}/${withArea.length}: ${r.name}`);
  
  let found = false;
  
  for (const query of strategies) {
    if (found) break;
    
    try {
      console.log(`   尝试: ${query}`);
      
      const result = execSync(`goplaces search "${query}" --limit 1 --json`, {
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const data = JSON.parse(result);
      
      if (data.results && data.results.length > 0) {
        const place = data.results[0];
        
        // 验证匹配质量 - 检查名称相似度
        const placeName = place.name.toLowerCase();
        const searchName = r.name.toLowerCase();
        
        // 简单相似度检查
        const isMatch = placeName.includes(searchName.substring(0, 4)) || 
                       searchName.includes(placeName.substring(0, 4)) ||
                       placeName.includes(r.cuisine);
        
        if (isMatch || data.results.length === 1) {
          r.google_place_id = place.place_id;
          r.google_name = place.name;
          r.google_rating = place.rating;
          r.address = place.formatted_address;
          r.verified = true;
          
          if (place.geometry?.location) {
            r.location = {
              lat: place.geometry.location.lat,
              lng: place.geometry.location.lng
            };
          }
          
          console.log(`   ✅ 匹配成功: ${place.name} (${place.rating}⭐)`);
          matched++;
          found = true;
          break;
        }
      }
    } catch (e) {
      // 继续尝试下一个策略
    }
  }
  
  if (!found) {
    console.log(`   ❌ 未找到匹配`);
    r.verified = false;
    failed++;
  }
  
  // 每3个休息，避免API限制
  if ((index + 1) % 3 === 0) {
    console.log('   (休息...)');
    execSync('sleep 1');
  }
});

console.log('');
console.log('='.repeat(70));
console.log(`匹配完成: ${matched}/${withArea.length}`);
console.log(`失败: ${failed}/${withArea.length}`);

// 对于无地区的，尝试用cuisine推断地区
console.log('');
console.log('处理无地区餐厅...');

withoutArea.forEach((r, index) => {
  // 尝试用常见湾区城市搜索
  const bayAreaCities = ['Cupertino', 'Sunnyvale', 'Milpitas', 'Fremont', 'Mountain View'];
  
  console.log(`${index + 1}/${withoutArea.length}: ${r.name}`);
  
  let found = false;
  
  for (const city of bayAreaCities) {
    if (found) break;
    
    try {
      const query = `${r.name} ${city}, CA`;
      
      const result = execSync(`goplaces search "${query}" --limit 1 --json`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const data = JSON.parse(result);
      
      if (data.results && data.results.length > 0) {
        const place = data.results[0];
        
        r.google_place_id = place.place_id;
        r.google_name = place.name;
        r.google_rating = place.rating;
        r.address = place.formatted_address;
        r.area = city; // 从匹配结果推断地区
        r.verified = true;
        
        if (place.geometry?.location) {
          r.location = {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng
          };
        }
        
        console.log(`   ✅ 在${city}找到: ${place.name} (${place.rating}⭐)`);
        matched++;
        found = true;
        break;
      }
    } catch (e) {
      // 继续
    }
  }
  
  if (!found) {
    console.log(`   ❌ 未找到`);
    failed++;
  }
});

console.log('');
console.log('='.repeat(70));

// 保存
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
fs.writeFileSync('./data/current/restaurant_database.json', JSON.stringify(db, null, 2), 'utf8');

console.log('💾 已保存');

// 统计
const totalVerified = db.restaurants.filter(r => r.verified).length;
console.log(`\n最终统计: ${totalVerified}/${db.restaurants.length} 家已验证`);
