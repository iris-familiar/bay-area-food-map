#!/usr/bin/env node
/**
 * Google Places 验证脚本
 * 
 * 使用方法:
 * 1. 设置环境变量: export GOOGLE_PLACES_API_KEY="your_api_key"
 * 2. 运行: node scripts/verify_google_places.js
 * 
 * 或使用新 Places API:
 * 1. 启用 Places API (New) 在 Google Cloud Console
 * 2. 运行: node scripts/verify_google_places.js --new-api
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DB_PATH = path.join(__dirname, '../data/current/restaurant_database.json');
const DELAY_MS = 200; // 避免触发API速率限制

// 简单的字符串相似度计算
function similarity(s1, s2) {
  s1 = s1.toLowerCase().replace(/[^\w]/g, '');
  s2 = s2.toLowerCase().replace(/[^\w]/g, '');
  
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  let matches = 0;
  for (let char of shorter) {
    if (longer.includes(char)) matches++;
  }
  
  return matches / longer.length;
}

// 使用 Google Places API (Legacy) 搜索
async function searchPlaceLegacy(query, apiKey) {
  return new Promise((resolve, reject) => {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodedQuery}&key=${apiKey}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// 使用 Google Places API (New) 搜索
async function searchPlaceNew(query, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ textQuery: query });
    const options = {
      hostname: 'places.googleapis.com',
      path: '/v1/places:searchText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.location'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
    
    req.write(postData);
    req.end();
  });
}

// 验证单个餐厅
async function verifyRestaurant(restaurant, apiKey, useNewApi = false) {
  const query = `${restaurant.name} ${restaurant.address}`;
  console.log(`  Searching: ${query}`);
  
  try {
    const searchFn = useNewApi ? searchPlaceNew : searchPlaceLegacy;
    const result = await searchFn(query, apiKey);
    
    if (result.error || result.status === 'REQUEST_DENIED') {
      return { success: false, error: result.error?.message || result.status };
    }
    
    const places = useNewApi ? result.places : result.results;
    
    if (!places || places.length === 0) {
      return { success: false, error: 'No results found' };
    }
    
    // 找到最佳匹配
    const bestMatch = places[0];
    const placeName = useNewApi ? bestMatch.displayName?.text : bestMatch.name;
    const nameSim = similarity(restaurant.name, placeName);
    
    if (nameSim < 0.5) {
      return { 
        success: false, 
        error: `Name mismatch: "${restaurant.name}" vs "${placeName}" (similarity: ${nameSim.toFixed(2)})`,
        candidate: bestMatch
      };
    }
    
    return {
      success: true,
      place: bestMatch,
      confidence: nameSim
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 主函数
async function main() {
  const useNewApi = process.argv.includes('--new-api');
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  
  if (!apiKey) {
    console.error('错误: 请设置 GOOGLE_PLACES_API_KEY 环境变量');
    console.error('示例: export GOOGLE_PLACES_API_KEY="your_api_key"');
    process.exit(1);
  }
  
  console.log('Google Places 验证脚本');
  console.log(`使用 API: ${useNewApi ? 'Places API (New)' : 'Places API (Legacy)'}`);
  console.log('');
  
  // 读取数据库
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const restaurants = db.restaurants.filter(r => r.id >= 'r023');
  
  console.log(`待验证餐厅数量: ${restaurants.length}`);
  console.log('');
  
  const results = {
    verified: [],
    failed: [],
    needsReview: []
  };
  
  for (let i = 0; i < restaurants.length; i++) {
    const r = restaurants[i];
    console.log(`[${i + 1}/${restaurants.length}] ${r.id}: ${r.name}`);
    
    // 如果已经验证过，跳过
    if (r.verified && r.google_place_id && !r.google_place_id.includes('placeholder')) {
      console.log('  ✓ 已验证，跳过');
      results.verified.push(r.id);
      continue;
    }
    
    // 等待避免API限制
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    
    const verifyResult = await verifyRestaurant(r, apiKey, useNewApi);
    
    if (verifyResult.success) {
      const place = verifyResult.place;
      
      // 更新餐厅信息
      if (useNewApi) {
        r.google_place_id = place.id;
        r.google_rating = place.rating;
        r.google_price_level = place.priceLevel;
        r.address = place.formattedAddress || r.address;
        if (place.location) {
          r.coordinates = {
            lat: place.location.latitude,
            lng: place.location.longitude
          };
        }
      } else {
        r.google_place_id = place.place_id;
        r.google_rating = place.rating;
        r.google_price_level = place.price_level;
        r.address = place.formatted_address || r.address;
        if (place.geometry?.location) {
          r.coordinates = {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng
          };
        }
      }
      r.verified = true;
      delete r.verification_note;
      
      console.log(`  ✓ 验证成功: ${place.displayName?.text || place.name}`);
      results.verified.push(r.id);
    } else {
      console.log(`  ✗ 验证失败: ${verifyResult.error}`);
      r.verified = false;
      r.verification_note = verifyResult.error;
      
      if (verifyResult.candidate) {
        results.needsReview.push({
          id: r.id,
          name: r.name,
          candidate: verifyResult.candidate.displayName?.text || verifyResult.candidate.name,
          error: verifyResult.error
        });
      } else {
        results.failed.push(r.id);
      }
    }
  }
  
  // 保存更新后的数据库
  db.updated_at = new Date().toISOString().split('T')[0];
  db.validation_status = `Verified: ${results.verified.length}, Failed: ${results.failed.length}, Needs Review: ${results.needsReview.length}`;
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log('');
  console.log('数据库已更新');
  
  // 输出报告
  console.log('');
  console.log('=== 验证报告 ===');
  console.log(`成功验证: ${results.verified.length}`);
  console.log(`验证失败: ${results.failed.length}`);
  console.log(`需要人工审核: ${results.needsReview.length}`);
  
  if (results.needsReview.length > 0) {
    console.log('');
    console.log('需要人工审核的餐厅:');
    results.needsReview.forEach(item => {
      console.log(`  - ${item.id}: ${item.name} → 候选: ${item.candidate}`);
    });
  }
  
  if (results.failed.length > 0) {
    console.log('');
    console.log('验证失败的餐厅:');
    results.failed.forEach(id => {
      const r = restaurants.find(x => x.id === id);
      console.log(`  - ${id}: ${r?.name}`);
    });
  }
}

main().catch(console.error);
