#!/usr/bin/env node
/**
 * 数据整合脚本 - 创建单一完美数据源
 * 规则：
 * 1. 只保留一份数据文件
 * 2. 所有字段必须完整
 * 3. Fremont = East Bay (不是South Bay)
 */

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '../data/current');

// 读取v8（有90家餐厅，新数据）
const v8 = JSON.parse(fs.readFileSync(path.join(DB_DIR, 'restaurant_database_v8.json'), 'utf-8'));
// 读取v5（字段完整，格式正确）
const v5 = JSON.parse(fs.readFileSync(path.join(DB_DIR, 'restaurant_database_v5_ui.json'), 'utf-8'));

console.log('🔧 数据整合中...');
console.log(`V8: ${v8.restaurants.length}家`);
console.log(`V5: ${v5.restaurants.length}家`);

// 创建v5索引
const v5Map = new Map(v5.restaurants.map(r => [r.id || r.xiaohongshu_id, r]));

// 正确的region映射（关键修正：Fremont是East Bay）
const regionMap = {
  'Fremont': 'East Bay',
  'Milpitas': 'South Bay',
  'Sunnyvale': 'South Bay',
  'Cupertino': 'South Bay',
  'San Jose': 'South Bay',
  'Mountain View': 'South Bay',
  'Santa Clara': 'South Bay',
  'Palo Alto': 'Peninsula',
  'San Mateo': 'Peninsula',
  'Redwood City': 'Peninsula',
  'Hayward': 'East Bay',
  'San Leandro': 'East Bay',
  'Newark': 'East Bay',
  'Oakland': 'East Bay',
  'Berkeley': 'East Bay'
};

// 从地址提取城市
const extractCity = (address) => {
  if (!address) return '';
  const match = address.match(/,\s*([A-Za-z\s]+),?\s*CA\s*\d{5}/i);
  return match ? match[1].trim() : '';
};

// 整合数据
const merged = v8.restaurants.map(v8r => {
  const id = v8r.id;
  const v5r = v5Map.get(id);
  
  // 优先使用v5的字段（更完整），v8补充新数据
  const city = v5r?.city || extractCity(v5r?.address || v8r.address) || v8r.area || '';
  const region = regionMap[city] || v5r?.region || '';
  
  return {
    ...v8r,
    // 确保所有字段完整
    xiaohongshu_id: id,
    engagement: v8r.total_engagement || v5r?.engagement || 0,
    sentiment_score: v8r.sentiment_analysis?.score || v5r?.sentiment_score || 0.5,
    google_rating: v5r?.google_rating || v8r.google_rating || null,
    address: v5r?.address || v8r.address || null,
    city: city,
    region: region,
    recommendations: v8r.recommendations || v5r?.recommendations || [],
    post_details: v8r.post_details || v5r?.post_details || []
  };
});

// 过滤掉merged的餐厅
const active = merged.filter(r => r._status !== 'duplicate_merged' && r.is_active !== false);

console.log(`\n✓ 整合完成: ${active.length}家餐厅`);

// 保存为单一文件
const output = {
  version: '9.0-unified',
  updated_at: new Date().toISOString(),
  total_restaurants: active.length,
  restaurants: active
};

fs.writeFileSync(path.join(DB_DIR, 'restaurant_database.json'), JSON.stringify(output, null, 2));
console.log('✓ 单一数据源已创建: restaurant_database.json');

// 删除所有旧版本
const files = fs.readdirSync(DB_DIR).filter(f => 
  f.match(/restaurant_database_v[58].*\.json/) && !f.includes('search')
);
files.forEach(f => {
  fs.unlinkSync(path.join(DB_DIR, f));
  console.log(`✓ 删除旧版本: ${f}`);
});

console.log('\n📊 最终统计:');
console.log(`  餐厅数: ${active.length}`);

// 验证样本
const sample = active[0];
console.log(`\n样本验证:`);
console.log(`  名称: ${sample.name}`);
console.log(`  engagement: ${sample.engagement}`);
console.log(`  city: ${sample.city}`);
console.log(`  region: ${sample.region}`);
