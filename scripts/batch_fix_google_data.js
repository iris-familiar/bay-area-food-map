#!/usr/bin/env node
/**
 * 批量修复Google匹配数据
 * 使用英文名重新匹配
 */

const fs = require('fs');

const DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🔧 批量修复Google匹配数据');
console.log('='.repeat(70));

// 定义要修复的餐厅数据（从goplaces搜索结果）
const fixes = [
  {
    id: 'r008',
    name: '重庆铺盖面',
    google_place_id: 'ChIJ55aqQgWHhYARUIQUTYyldjQ',
    google_name: 'C.Q. Taste',
    address: '10815 N Wolfe Rd Suite 101B, Cupertino, CA 95014, USA',
    area: 'Cupertino',
    google_rating: 4.3,
    location: { lat: 37.335496, lng: -122.014705 }
  },
  {
    id: 'r084',
    name: '林家万峦猪脚',
    google_place_id: 'ChIJL2RJ4tDIj4ARm4aIF-Uy2dM',
    google_name: 'Taiwan Cafe',
    address: '568 N Abel St, Milpitas, CA 95035, USA',
    area: 'Milpitas',
    google_rating: 4.4,
    location: { lat: 37.435919, lng: -121.909944 }
  },
  {
    id: 'r081',
    name: '一品香',
    google_place_id: 'ChIJ8fiQYwO1j4ARIpej7lX-sPU',
    google_name: 'Hankow Cuisine',
    address: '1071 S De Anza Blvd, San Jose, CA 95129, USA',
    area: 'San Jose',
    google_rating: 4.0,
    location: { lat: 37.307466, lng: -122.032901 }
  },
  {
    id: 'r080',
    name: '美食坊',
    google_place_id: 'ChIJqR9iewC3j4ARFdkuydcsVXk',
    google_name: 'Seasons Noodles & Dumplings Garden',
    address: '702 Villa St, Mountain View, CA 94041, USA',
    area: 'Mountain View',
    google_rating: 4.5,
    location: { lat: 37.393541, lng: -122.077939 }
  }
];

let updated = 0;

fixes.forEach(fix => {
  const r = db.restaurants.find(x => x.id === fix.id);
  if (r) {
    console.log(`\n✅ ${r.name} (${fix.id}):`);
    console.log(`   Google: ${fix.google_name}`);
    console.log(`   地址: ${fix.address}`);
    console.log(`   评分: ${fix.google_rating}`);
    
    // 更新数据
    r.google_place_id = fix.google_place_id;
    r.google_name = fix.google_name;
    r.address = fix.address;
    r.area = fix.area;
    r.google_rating = fix.google_rating;
    r.location = fix.location;
    r.verified = true;
    r.google_match_status = 'matched_with_english_name_v2';
    
    updated++;
  } else {
    console.log(`\n❌ 未找到: ${fix.name} (${fix.id})`);
  }
});

console.log('\n' + '='.repeat(70));
console.log(`已更新: ${updated}/${fixes.length} 家餐厅`);

// 处理其他需要关注的餐厅
console.log('\n其他餐厅状态:');

// r079 面面俱到 - 需要确认
const r079 = db.restaurants.find(r => r.id === 'r079');
if (r079) {
  console.log(`\n⚠️  r079 面面俱到:`);
  console.log(`   状态: 需要人工确认`);
  console.log(`   问题: 无详细地址，可能和鲜味水饺是同一家`);
}

// r083 李与白包子铺
const r083 = db.restaurants.find(r => r.id === 'r083');
if (r083) {
  console.log(`\n⚠️  r083 李与白包子铺:`);
  console.log(`   状态: 需要搜索英文名`);
  console.log(`   地区: ${r083.area || '未知'}`);
}

// r082 山野森林系贵州餐厅
const r082 = db.restaurants.find(r => r.id === 'r082');
if (r082) {
  console.log(`\n⚠️  r082 山野森林系贵州餐厅:`);
  console.log(`   状态: 需要搜索英文名`);
  console.log(`   地区: ${r082.area || '未知'}`);
}

// r078 半岛Milpitas
const r078 = db.restaurants.find(r => r.id === 'r078');
if (r078) {
  console.log(`\n⚠️  r078 半岛Milpitas:`);
  console.log(`   状态: 需要搜索`);
  console.log(`   地区: ${r078.area || '未知'}`);
}

// 统计最终状态
const stats = {
  total: db.restaurants.length,
  verified: db.restaurants.filter(r => r.verified).length,
  with_address: db.restaurants.filter(r => r.address).length,
  with_google: db.restaurants.filter(r => r.google_place_id).length
};

console.log('\n' + '='.repeat(70));
console.log('最终统计:');
console.log(`  总计: ${stats.total} 家`);
console.log(`  已验证: ${stats.verified} 家`);
console.log(`  有地址: ${stats.with_address} 家`);
console.log(`  有Google数据: ${stats.with_google} 家`);

// 保存
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');

console.log('\n💾 已保存修复后的数据');
