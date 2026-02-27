#!/usr/bin/env node
/**
 * scripts/normalize_cuisine.js — One-time cuisine field normalization
 *
 * Reduces ~168 mixed Chinese/English cuisine values to ~40 canonical Chinese-only values.
 *
 * Usage:
 *   node scripts/normalize_cuisine.js           # Preview changes (no writes)
 *   node scripts/normalize_cuisine.js --apply   # Append correction entries to corrections.json
 *
 * Phase 2 (run manually after reviewing preview):
 *   node scripts/apply_corrections.js
 *   node pipeline/06_generate_index.js data/restaurant_database.json data/restaurant_database_index.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'site', 'data', 'restaurant_database.json');
const CORRECTIONS_FILE = path.join(ROOT, 'data', 'corrections.json');
const APPLY = process.argv.includes('--apply');

// Canonical cuisine map: old value → canonical Chinese value
const CUISINE_MAP = {
  // → 西餐
  'American':                              '西餐',
  'Bar':                                   '西餐',
  'Buffet':                                '西餐',
  'Cal-Mediterranean':                     '西餐',
  'Californian':                           '西餐',
  'Fast Food':                             '西餐',
  'French':                                '西餐',
  'Greek':                                 '西餐',
  'Modern American':                       '西餐',
  'New American':                          '西餐',
  'Peruvian':                              '西餐',
  'Spanish':                               '西餐',
  '美国南部菜':                              '西餐',

  // → 早午餐
  'American/Brunch':                       '早午餐',
  'Brunch':                                '早午餐',
  'Korean Brunch':                         '早午餐',

  // → 融合菜
  'Asian Fusion':                          '融合菜',
  'Chinese Omakase':                       '融合菜',
  'Creative':                              '融合菜',
  'Fine Dining':                           '融合菜',
  'Korean Asian Fusion':                   '融合菜',
  'Korean-American':                       '融合菜',
  'Western Fusion':                        '融合菜',
  '云贵川融合':                              '融合菜',
  '泰国美式融合菜':                            '融合菜',
  '韩式融合菜':                               '融合菜',

  // → 甜品
  'Bakery':                                '甜品',
  'Bakery & Coffee':                       '甜品',
  'Cafe':                                  '甜品',
  'Cafe, Japanese':                        '甜品',
  'Chinese Bakery':                        '甜品',
  'Coffee':                                '甜品',
  'Dessert':                               '甜品',
  'Tea & Bakery':                          '甜品',

  // → 奶茶
  'Bubble Tea':                            '奶茶',
  'Bubble Tea / Fruit Tea':                '奶茶',
  'Lemon Tea / Beverage':                  '奶茶',

  // → 粤菜
  'Cantonese':                             '粤菜',
  'Cantonese Dim Sum':                     '粤菜',
  'Chinese Street Food / Dim Sum':         '粤菜',
  'Dim Sum':                               '粤菜',
  'Hong Kong Style':                       '粤菜',
  'Hong Kong Style Cafe':                  '粤菜',
  'Hong Kong Style Cafe (Cha Chaan Teng)': '粤菜',
  'Hong Kong Style Cafe (茶餐厅)':          '粤菜',
  'Hong Kong Style Cafe / Cantonese':      '粤菜',
  'Hong Kong Style Tea Restaurant':        '粤菜',
  '广式早茶':                               '粤菜',
  '港式':                                   '粤菜',
  '港式茶餐厅':                              '粤菜',

  // → 潮汕菜
  'Chaoshan (Teochew)':                    '潮汕菜',
  '潮州粉':                                 '潮汕菜',

  // → 中餐
  'American Chinese, Buffet':              '中餐',
  'Chinese':                               '中餐',
  'Chinese Bistro':                        '中餐',
  'Chinese / Sauerkraut Fish':             '中餐',
  'Jiangxi':                               '中餐',
  '家常菜':                                  '中餐',
  '西北菜':                                  '中餐',

  // → 云南菜
  'Chinese (Yunnan)':                      '云南菜',
  'Yunnan':                                '云南菜',

  // → 火锅
  'Chongqing Hot Pot':                     '火锅',
  'Hot Pot':                               '火锅',
  'Hot Pot / Skewers':                     '火锅',
  'Hot Pot, BBQ, Buffet':                  '火锅',
  'Hotpot':                                '火锅',
  'Japanese Hot Pot':                      '火锅',

  // → 面食
  'Chinese Noodles':                       '面食',
  'Chongqing Noodles':                     '面食',
  'Chinese / Noodles':                     '面食',
  'Guilin Rice Noodles':                   '面食',
  'Japanese Ramen':                        '面食',
  'Lanzhou Ramen':                         '面食',
  'Ramen':                                 '面食',
  'Rice Noodles':                          '面食',
  'Sichuan Noodles':                       '面食',
  "Xi'an / Chinese":                       '面食',
  '包子':                                   '面食',
  '拉面':                                   '面食',
  '日式油拌面':                              '面食',
  '粉店':                                   '面食',

  // → 湘菜
  'Hunan':                                 '湘菜',
  'Hunan / Noodles':                       '湘菜',
  'Hunan / Rice Noodles':                  '湘菜',
  'Hunan Chinese':                         '湘菜',
  'Hunan, Coconut Chicken Hotpot':         '湘菜',

  // → 川菜
  'Sichuan':                               '川菜',
  'Sichuan / Hunan':                       '川菜',
  'Szechuan':                              '川菜',
  '四川菜':                                  '川菜',

  // → 日料
  'Izakaya':                               '日料',
  'Japanese':                              '日料',
  'Japanese / Ramen':                      '日料',
  'Japanese / Udon':                       '日料',
  'Japanese BBQ / All-You-Can-Eat':        '日料',
  'Japanese Izakaya':                      '日料',
  'Japanese Yakitori':                     '日料',
  'Japanese, Sushi':                       '日料',
  'Omakase':                               '日料',
  'Sukiyaki':                              '日料',
  'Sushi':                                 '日料',
  'Sushi Buffet':                          '日料',
  '日式':                                   '日料',
  '日餐':                                   '日料',
  '素食日料':                                '日料',

  // → 韩餐
  'Korean':                                '韩餐',
  'Korean BBQ':                            '韩餐',
  'Korean BBQ Buffet':                     '韩餐',
  '韩式当代料理':                             '韩餐',

  // → 麻辣烫
  'Korean Malatang':                       '麻辣烫',
  'Malatang':                              '麻辣烫',

  // → 泰餐
  'Thai':                                  '泰餐',
  'Thai Hot Pot':                          '泰餐',
  '泰国菜':                                  '泰餐',
  '泰法融合':                                '泰餐',

  // → 东南亚菜
  'Cambodian':                             '东南亚菜',
  'Filipino':                              '东南亚菜',
  'Singaporean/Malaysian/Thai':            '东南亚菜',
  'Southeast Asian':                       '东南亚菜',
  '菲律宾菜':                                '东南亚菜',

  // → 越南菜
  'Southeast Asian / Vietnamese':          '越南菜',
  'Vietnamese':                            '越南菜',
  'Vietnamese Coffee':                     '越南菜',
  'Vietnamese Fusion':                     '越南菜',
  'Vietnamese Hot Pot':                    '越南菜',
  'Vietnamese Seafood':                    '越南菜',
  'Vietnamese-Cajun':                      '越南菜',

  // → 印度菜
  'Indian':                                '印度菜',
  'Indian Fusion':                         '印度菜',

  // → 意大利菜
  'Italian':                               '意大利菜',
  'Pizza':                                 '意大利菜',

  // → 素食
  'Vegetarian':                            '素食',

  // → 海鲜
  'Seafood':                               '海鲜',

  // → 上海菜
  'Shanghainese':                          '上海菜',

  // → 台湾菜
  'Taiwanese':                             '台湾菜',
  '台湾小吃':                                '台湾菜',

  // → 牛排
  'Steakhouse':                            '牛排',

  // → 烧烤
  'American BBQ':                          '烧烤',
  '烤串':                                   '烧烤',

  // → 墨西哥菜
  'Mexican':                               '墨西哥菜',

  // → 新疆菜
  'Halal / Chinese':                       '新疆菜',
  'Xinjiang':                              '新疆菜',

  // → 东北菜
  'Inner Mongolian':                       '东北菜',

  // → 江浙菜
  '淮扬菜':                                  '江浙菜',

  // → 中东菜
  '也门咖啡':                                '中东菜',
};

// Load database
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Find restaurants needing updates
const changes = [];
const unmapped = new Set();

for (const r of db.restaurants) {
  if (r._status === 'duplicate_merged') continue;
  if (!r.cuisine) continue;

  if (CUISINE_MAP[r.cuisine] !== undefined) {
    if (r.cuisine !== CUISINE_MAP[r.cuisine]) {
      changes.push({ r, oldCuisine: r.cuisine, newCuisine: CUISINE_MAP[r.cuisine] });
    }
  } else {
    // Not in map — either already canonical or unexpected value
    unmapped.add(r.cuisine);
  }
}

// Print preview table
const COL_NAME = 30;
const COL_ID   = 8;
const COL_OLD  = 32;
const COL_NEW  = 12;

function pad(s, n) { return String(s).padEnd(n); }

console.log('\n菜系字段规范化预览');
console.log('='.repeat(90));
console.log(
  pad('餐厅名', COL_NAME) + pad('ID', COL_ID) + pad('旧值', COL_OLD) + pad('新值', COL_NEW)
);
console.log('-'.repeat(90));

for (const { r, oldCuisine, newCuisine } of changes) {
  console.log(
    pad(r.name, COL_NAME) + pad(r.id, COL_ID) + pad(oldCuisine, COL_OLD) + pad(newCuisine, COL_NEW)
  );
}

console.log('='.repeat(90));
console.log(`共 ${changes.length} 家餐厅需要更新\n`);

// Warn about unmapped values that aren't already canonical
const CANONICAL = new Set([
  '上海菜','东北菜','东南亚菜','中东菜','中原菜','中餐','云南菜','台湾菜',
  '墨西哥菜','奶茶','尼泊尔菜','印度菜','意大利菜','川菜','徽菜','新疆菜',
  '日料','江浙菜','泰餐','海鲜','湖北菜','湘菜','潮汕菜','火锅','炸鸡',
  '烧烤','烧腊','牛排','甜品','砂锅','粤菜','融合菜','素食','西餐','贵州菜',
  '越南菜','面食','韩餐','麻辣烫','早午餐',
]);

const unexpected = [...unmapped].filter(v => !CANONICAL.has(v));
if (unexpected.length > 0) {
  console.warn('⚠️  未映射且未在规范列表中的值 (需手动处理):');
  for (const v of unexpected.sort()) console.warn(`   ${v}`);
  console.warn('');
}

if (!APPLY) {
  console.log('提示: 使用 --apply 将修正写入 corrections.json');
  console.log('      然后运行 node scripts/apply_corrections.js 应用到数据库');
  process.exit(0);
}

// --apply mode: append entries to corrections.json flat array
console.log('📝 写入 corrections.json...');

const existing = JSON.parse(fs.readFileSync(CORRECTIONS_FILE, 'utf8'));

// Normalize to array (corrections.json is a flat array)
const corrArray = Array.isArray(existing) ? existing : [];

// Track which IDs already have a cuisine correction entry from this script
const alreadyCorrected = new Set(
  corrArray
    .filter(c => c.reason && c.reason.includes('cuisine normalization') && c.corrections && c.corrections.cuisine)
    .map(c => c.id)
);

let added = 0;
let skipped = 0;

for (const { r, newCuisine } of changes) {
  if (alreadyCorrected.has(r.id)) {
    skipped++;
    continue;
  }
  corrArray.push({
    id: r.id,
    name: r.name,
    corrections: { cuisine: newCuisine },
    reason: `cuisine normalization: ${r.cuisine} → ${newCuisine}`,
  });
  added++;
}

fs.writeFileSync(CORRECTIONS_FILE, JSON.stringify(corrArray, null, 2), 'utf8');

console.log(`✅ 写入完成: ${added} 条新增, ${skipped} 条跳过 (已存在)\n`);
console.log('接下来运行:');
console.log('  node scripts/apply_corrections.js      # 应用修正到数据库');
console.log('  node pipeline/06_generate_index.js data/restaurant_database.json data/restaurant_database_index.json');
