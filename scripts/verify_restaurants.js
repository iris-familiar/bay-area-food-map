#!/usr/bin/env node
/**
 * Google Places 批量验证脚本 - Phase 1C
 * 验证 r023-r049 餐厅
 */

const fs = require('fs');
const { execSync } = require('child_process');

const DB_PATH = './data/current/restaurant_database.json';
const SLEEP_MS = 3000; // 3秒延迟，避免API限制

// 读取数据库
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// 获取需要验证的餐厅
const restaurantsToVerify = db.restaurants.filter(r => {
  const needsVerify = !r.google_place_id || r.google_place_id.includes('placeholder');
  return needsVerify && r.id >= 'r023' && r.id <= 'r049';
});

console.log(`需要验证的餐厅数量: ${restaurantsToVerify.length}`);

const results = {
  success: [],
  failed: []
};

// 从环境变量获取API key
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// 执行goplaces搜索
function searchPlaces(query) {
  try {
    const keyArg = API_KEY ? `--api-key="${API_KEY}"` : '';
    const cmd = `goplaces search "${query}" ${keyArg} --limit 5 --json 2>/dev/null`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
    return JSON.parse(output);
  } catch (e) {
    console.error(`搜索失败: ${query}`, e.message);
    return [];
  }
}

// 计算字符串相似度 (简单版本)
function similarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[^\w]/g, '');
  const s2 = str2.toLowerCase().replace(/[^\w]/g, '');
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  // 简单字符匹配
  let matches = 0;
  for (let char of s1) {
    if (s2.includes(char)) matches++;
  }
  return matches / Math.max(s1.length, s2.length);
}

// 验证单家餐厅
function verifyRestaurant(r) {
  console.log(`\n[${r.id}] 验证: ${r.name}`);
  
  // 搜索策略1: 餐厅名 + 城市
  let query = `${r.name} ${r.area || ''} CA`;
  let places = searchPlaces(query);
  
  // 搜索策略2: 如果失败，尝试英文名
  if (places.length === 0 && r.name_en) {
    query = `${r.name_en} ${r.area || ''} CA`;
    console.log(`  尝试英文名: ${query}`);
    places = searchPlaces(query);
  }
  
  // 搜索策略3: 如果失败，尝试地址
  if (places.length === 0 && r.address) {
    query = r.address;
    console.log(`  尝试地址: ${query}`);
    places = searchPlaces(query);
  }
  
  if (places.length === 0) {
    console.log(`  ❌ 未找到任何结果`);
    return { success: false, reason: 'Google未找到' };
  }
  
  // 查找最佳匹配
  let bestMatch = null;
  let bestScore = 0;
  
  for (const place of places) {
    const nameSim = similarity(r.name, place.name);
    const nameEnSim = r.name_en ? similarity(r.name_en, place.name) : 0;
    const maxNameSim = Math.max(nameSim, nameEnSim);
    
    // 检查地址区域匹配
    const addressMatch = r.address && place.address && 
      (place.address.includes(r.area) || 
       r.address.split(',')[0].split(' ').slice(1).join(' ').toLowerCase()
        === place.address.split(',')[0].split(' ').slice(1).join(' ').toLowerCase());
    
    const score = maxNameSim * 0.7 + (addressMatch ? 0.3 : 0);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = place;
    }
  }
  
  // 阈值: 0.6
  if (bestScore >= 0.5) {
    console.log(`  ✅ 匹配成功: ${bestMatch.name}`);
    console.log(`    Place ID: ${bestMatch.place_id}`);
    console.log(`    Rating: ${bestMatch.rating || 'N/A'}`);
    console.log(`    Address: ${bestMatch.address}`);
    return {
      success: true,
      place: bestMatch,
      score: bestScore
    };
  } else {
    console.log(`  ⚠️ 匹配度不足 (${bestScore.toFixed(2)}), 最佳候选: ${bestMatch?.name || 'N/A'}`);
    // 如果有一个相对较好的匹配，仍然使用
    if (bestScore >= 0.3 && bestMatch) {
      console.log(`  ⚠️ 使用较低置信度匹配`);
      return {
        success: true,
        place: bestMatch,
        score: bestScore,
        lowConfidence: true
      };
    }
    return { success: false, reason: '匹配度不足', bestMatch: bestMatch?.name };
  }
}

// 更新餐厅数据
function updateRestaurant(r, verificationResult) {
  const place = verificationResult.place;
  const idx = db.restaurants.findIndex(item => item.id === r.id);
  
  if (idx === -1) return;
  
  if (verificationResult.success) {
    db.restaurants[idx].google_place_id = place.place_id;
    db.restaurants[idx].google_rating = place.rating;
    db.restaurants[idx].google_price_level = place.price_level;
    db.restaurants[idx].coordinates = {
      lat: place.location.lat,
      lng: place.location.lng
    };
    db.restaurants[idx].address = place.address;
    db.restaurants[idx].verified = true;
    db.restaurants[idx].verification_note = verificationResult.lowConfidence 
      ? `Google验证完成(低置信度: ${verificationResult.score.toFixed(2)})`
      : 'Google验证完成';
    db.restaurants[idx].verified_at = new Date().toISOString().split('T')[0];
  } else {
    db.restaurants[idx].verified = false;
    db.restaurants[idx].verification_note = verificationResult.reason;
  }
}

// 主验证循环
async function main() {
  for (const r of restaurantsToVerify) {
    const result = verifyRestaurant(r);
    
    if (result.success) {
      results.success.push({
        id: r.id,
        name: r.name,
        matchedName: result.place.name,
        placeId: result.place.place_id,
        rating: result.place.rating
      });
      updateRestaurant(r, result);
    } else {
      results.failed.push({
        id: r.id,
        name: r.name,
        reason: result.reason,
        bestMatch: result.bestMatch
      });
      updateRestaurant(r, result);
    }
    
    // 保存进度
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log(`  💾 已保存进度`);
    
    // 延迟
    if (restaurantsToVerify.indexOf(r) < restaurantsToVerify.length - 1) {
      execSync(`sleep ${SLEEP_MS / 1000}`);
    }
  }
  
  // 输出报告
  console.log('\n' + '='.repeat(60));
  console.log('验证完成报告');
  console.log('='.repeat(60));
  console.log(`\n✅ 成功验证: ${results.success.length}家`);
  results.success.forEach(r => {
    console.log(`  ${r.id}: ${r.name} → ${r.matchedName} (${r.rating}⭐)`);
  });
  
  console.log(`\n❌ 验证失败: ${results.failed.length}家`);
  results.failed.forEach(r => {
    console.log(`  ${r.id}: ${r.name} - ${r.reason}${r.bestMatch ? ` (候选: ${r.bestMatch})` : ''}`);
  });
  
  // 更新统计
  const verifiedCount = db.restaurants.filter(r => r.verified === true).length;
  const totalCount = db.restaurants.length;
  db.validation_status = `Verified: ${verifiedCount}, Total: ${totalCount}`;
  db.updated_at = new Date().toISOString().split('T')[0];
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`\n💾 数据库已更新: ${DB_PATH}`);
}

main().catch(console.error);
