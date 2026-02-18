#!/usr/bin/env node
/**
 * Safe Data Merge Script
 * 安全的数据合并脚本 - 解决v5/v8格式不一致和新数据覆盖问题
 * 
 * 使用方法: node safe_merge.js <new_data.json> [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/current/restaurant_database_v5_ui.json');
const BACKUP_DIR = path.join(__dirname, '../data/backup/merge');

// 解析命令行参数
const newDataPath = process.argv[2];
const isDryRun = process.argv.includes('--dry-run');

if (!newDataPath || !fs.existsSync(newDataPath)) {
  console.error('❌ 用法: node safe_merge.js <new_data.json> [--dry-run]');
  process.exit(1);
}

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

console.log('='.repeat(60));
console.log('🔧 安全数据合并工具');
console.log('='.repeat(60));
console.log(`模式: ${isDryRun ? '试运行(不实际修改)' : '正式合并'}`);
console.log(`主数据库: ${DB_PATH}`);
console.log(`新数据: ${newDataPath}`);
console.log('');

// 加载现有数据库
let existing;
try {
  const dbContent = fs.readFileSync(DB_PATH, 'utf8');
  existing = JSON.parse(dbContent);
  console.log(`✓ 主数据库加载成功: ${existing.restaurants?.length || 0} 家餐厅`);
} catch (e) {
  console.error(`❌ 无法加载主数据库: ${e.message}`);
  process.exit(1);
}

// 加载新数据
let newData;
try {
  const newContent = fs.readFileSync(newDataPath, 'utf8');
  newData = JSON.parse(newContent);
  const newRestaurants = newData.restaurants || newData; // 兼容数组格式
  console.log(`✓ 新数据加载成功: ${newRestaurants.length || 0} 家餐厅`);
} catch (e) {
  console.error(`❌ 无法加载新数据: ${e.message}`);
  process.exit(1);
}

// 标准化新数据格式
const normalizeNewData = (data) => {
  // 如果新数据是数组，包装成对象
  if (Array.isArray(data)) {
    return {
      version: '8.1-new',
      restaurants: data,
      updated_at: new Date().toISOString()
    };
  }
  return data;
};

newData = normalizeNewData(newData);

// 创建索引以便快速查找
const createIndex = (restaurants) => {
  const byId = new Map();
  const byGoogleId = new Map();
  const byNameAddress = new Map();
  
  restaurants.forEach(r => {
    if (r.id) byId.set(r.id, r);
    if (r.google_place_id) byGoogleId.set(r.google_place_id, r);
    const nameAddrKey = `${r.name?.toLowerCase()}|${r.address?.toLowerCase()}`;
    byNameAddress.set(nameAddrKey, r);
  });
  
  return { byId, byGoogleId, byNameAddress };
};

const existingIndex = createIndex(existing.restaurants || []);

// 匹配算法
const findMatch = (newRestaurant) => {
  // 1. 按Google Place ID匹配 (最高优先级)
  if (newRestaurant.google_place_id) {
    const match = existingIndex.byGoogleId.get(newRestaurant.google_place_id);
    if (match) return { restaurant: match, method: 'google_place_id' };
  }
  
  // 2. 按名称+地址匹配
  const nameAddrKey = `${newRestaurant.name?.toLowerCase()}|${newRestaurant.address?.toLowerCase()}`;
  const matchByAddr = existingIndex.byNameAddress.get(nameAddrKey);
  if (matchByAddr) return { restaurant: matchByAddr, method: 'name+address' };
  
  // 3. 按名称+城市匹配 (宽松匹配)
  const nameCityKey = `${newRestaurant.name?.toLowerCase()}|${newRestaurant.city?.toLowerCase()}`;
  const matchByCity = existing.restaurants.find(r => 
    r.name === newRestaurant.name && 
    r.city === newRestaurant.city
  );
  if (matchByCity) return { restaurant: matchByCity, method: 'name+city' };
  
  return null;
};

// 合并字段策略
const mergeFields = (existing, incoming) => {
  const merged = { ...existing };
  
  // 合并帖子详情（去重）
  if (incoming.post_details?.length > 0) {
    const existingPostIds = new Set(existing.post_details?.map(p => p.post_id) || []);
    const newPosts = incoming.post_details.filter(p => !existingPostIds.has(p.post_id));
    if (newPosts.length > 0) {
      merged.post_details = [...(existing.post_details || []), ...newPosts];
      console.log(`    📌 新增 ${newPosts.length} 个帖子`);
    }
  }
  
  // 累加互动数
  if (incoming.engagement !== undefined) {
    const oldEng = existing.engagement || 0;
    const newEng = incoming.engagement || 0;
    merged.engagement = oldEng + newEng;
    if (newEng > 0) console.log(`    📊 讨论度: ${oldEng} → ${merged.engagement} (+${newEng})`);
  }
  
  // 累加提及数
  if (incoming.mention_count !== undefined) {
    merged.mention_count = (existing.mention_count || 0) + (incoming.mention_count || 0);
  }
  
  // 合并来源
  if (incoming.sources?.length > 0) {
    const existingSources = new Set(existing.sources || []);
    incoming.sources.forEach(s => existingSources.add(s));
    merged.sources = Array.from(existingSources);
  }
  
  // 保留更长的推荐菜列表
  if (incoming.recommendations?.length > (existing.recommendations?.length || 0)) {
    merged.recommendations = incoming.recommendations;
    console.log(`    🍽️  更新推荐菜品 (${incoming.recommendations.length} 个)`);
  }
  
  // 保留更好的Google数据
  if (incoming.google_rating && (!existing.google_rating || incoming.google_rating > existing.google_rating)) {
    merged.google_rating = incoming.google_rating;
    if (incoming.google_place_id) merged.google_place_id = incoming.google_place_id;
    console.log(`    ⭐ Google评分更新: ${existing.google_rating} → ${incoming.google_rating}`);
  }
  
  // 保留完整地址
  if (incoming.address && (!existing.address || incoming.address.length > existing.address.length)) {
    merged.address = incoming.address;
  }
  
  // 更新城市/区域（如果之前有缺失）
  if (incoming.city && !existing.city) {
    merged.city = incoming.city;
    console.log(`    📍 更新城市: ${incoming.city}`);
  }
  if (incoming.region && !existing.region) {
    merged.region = incoming.region;
    console.log(`    🗺️  更新区域: ${incoming.region}`);
  }
  
  // 更新时间戳
  merged.updated_at = new Date().toISOString();
  merged.merge_info = {
    last_merged: new Date().toISOString(),
    source_count: (merged.merge_info?.source_count || 1) + 1
  };
  
  return merged;
};

// 执行合并
console.log('');
console.log('🔄 开始合并...');
console.log('-'.repeat(60));

const merged = [];
const added = [];
const skipped = [];

const newRestaurants = newData.restaurants || [];

for (const newRestaurant of newRestaurants) {
  const match = findMatch(newRestaurant);
  
  if (match) {
    console.log(`🔄 合并: ${newRestaurant.name} (${match.method})`);
    const mergedRestaurant = mergeFields(match.restaurant, newRestaurant);
    
    // 更新原数组
    const idx = existing.restaurants.findIndex(r => r.id === match.restaurant.id);
    if (idx !== -1) {
      existing.restaurants[idx] = mergedRestaurant;
      merged.push({
        id: match.restaurant.id,
        name: newRestaurant.name,
        method: match.method
      });
    }
  } else {
    // 新餐厅，分配新ID
    const maxNum = Math.max(...existing.restaurants.map(r => {
      const match = r.id?.match(/r(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }), 0);
    
    newRestaurant.id = `r${String(maxNum + 1 + added.length).padStart(3, '0')}`;
    newRestaurant.created_at = new Date().toISOString();
    newRestaurant.is_active = true;
    
    console.log(`➕ 新增: ${newRestaurant.name} (${newRestaurant.id})`);
    existing.restaurants.push(newRestaurant);
    added.push({ id: newRestaurant.id, name: newRestaurant.name });
  }
}

console.log('-'.repeat(60));

// 更新元数据
existing.version = existing.version || '10.0';
const versionParts = existing.version.split('-');
const baseVersion = versionParts[0];
const buildNum = parseInt((versionParts[1] || '0').replace(/\D/g, '')) || 0;
existing.version = `${baseVersion}-${buildNum + 1}`;

existing.updated_at = new Date().toISOString();
existing.merge_log = {
  timestamp: new Date().toISOString(),
  source_file: newDataPath,
  merged_count: merged.length,
  added_count: added.length,
  total_count: existing.restaurants.length
};

// 输出统计
console.log('');
console.log('📊 合并统计:');
console.log(`   已合并: ${merged.length} 家`);
console.log(`   新添加: ${added.length} 家`);
console.log(`   总计: ${existing.restaurants.length} 家`);
console.log(`   新版本: ${existing.version}`);
console.log('');

// 试运行模式
if (isDryRun) {
  console.log('🔍 试运行模式 - 未实际修改数据库');
  console.log('   要执行合并，请去掉 --dry-run 参数');
  console.log('');
  process.exit(0);
}

// 正式合并：创建备份并保存
console.log('💾 创建备份...');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUP_DIR, `backup_${timestamp}.json`);
const preMergePath = path.join(BACKUP_DIR, `pre_merge_${timestamp}.json`);

// 备份合并前的数据库
fs.writeFileSync(preMergePath, JSON.stringify(existing, null, 2));
console.log(`   ✓ 合并前备份: ${preMergePath}`);

// 备份合并后的数据库
fs.writeFileSync(backupPath, JSON.stringify(existing, null, 2));
console.log(`   ✓ 合并后备份: ${backupPath}`);

// 保存到主数据库
fs.writeFileSync(DB_PATH, JSON.stringify(existing, null, 2));
console.log(`   ✓ 主数据库已更新: ${DB_PATH}`);

// 更新symlink
const symlinkPath = path.join(__dirname, '../data/current/restaurant_database.json');
try {
  fs.unlinkSync(symlinkPath);
} catch (e) {
  // symlink可能不存在
}
fs.symlinkSync('restaurant_database_v5_ui.json', symlinkPath);
console.log(`   ✓ Symlink已更新`);

console.log('');
console.log('✅ 合并完成！');
console.log('='.repeat(60));

// 输出新增餐厅列表
if (added.length > 0) {
  console.log('');
  console.log('📋 新增餐厅:');
  added.forEach(r => console.log(`   - ${r.name} (${r.id})`));
}

// 输出合并详情
if (merged.length > 0) {
  console.log('');
  console.log('🔄 已合并餐厅:');
  merged.forEach(r => console.log(`   - ${r.name} (${r.id}) [${r.method}]`));
}

console.log('');
