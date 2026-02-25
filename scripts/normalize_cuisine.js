#!/usr/bin/env node
/**
 * scripts/normalize_cuisine.js — One-time cuisine field normalization
 *
 * Reduces ~64 mixed Chinese/English cuisine values to ~36 canonical Chinese-only values.
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
const DB_FILE = path.join(ROOT, 'data', 'restaurant_database.json');
const CORRECTIONS_FILE = path.join(ROOT, 'data', 'corrections.json');
const APPLY = process.argv.includes('--apply');

// Canonical cuisine map: old value → canonical Chinese value
const CUISINE_MAP = {
  // English → Chinese
  'American':                        '西餐',
  'American Chinese, Buffet':        '中餐',
  'Brunch':                          '早午餐',
  'Cantonese':                       '粤菜',
  'Cantonese Dim Sum':               '粤菜',
  'Chinese':                         '中餐',
  'Chinese Bistro':                  '中餐',
  'Chinese Noodles':                 '面食',
  'Fine Dining':                     '西餐',
  'Hong Kong Style Cafe / Cantonese':'粤菜',
  'Hot Pot':                         '火锅',
  'Japanese':                        '日料',
  'Japanese BBQ / All-You-Can-Eat':  '日料',
  'Korean':                          '韩餐',
  'Seafood':                         '海鲜',
  'Sichuan':                         '川菜',
  'Singaporean/Malaysian/Thai':      '东南亚菜',
  'Steakhouse':                      '牛排',
  'Thai':                            '泰餐',
  'Xinjiang':                        '新疆菜',
  // Chinese consolidations
  '港式':  '粤菜',   // user decision: merge
  '日式':  '日料',   // semantic duplicate
  '泰国菜':'泰餐',   // synonym
  '泰法融合':'泰餐', // close enough
  '淮扬菜':'江浙菜', // subset → parent
  '台湾小吃':'台湾菜',
  '家常菜':'中餐',   // home-style is Chinese
  '也门咖啡':'中东菜',// Yemen is Middle Eastern
  '拉面':  '面食',   // dish type → food category
  '包子':  '面食',   // dough/noodle category
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
  '上海菜','东北菜','中东菜','中原菜','中餐','云南菜','台湾菜','墨西哥菜',
  '奶茶','尼泊尔菜','川菜','徽菜','新疆菜','日料','江浙菜','泰餐','海鲜',
  '湖北菜','湘菜','潮汕菜','火锅','炸鸡','烧烤','烧腊','牛排','甜品','砂锅',
  '粤菜','融合菜','西餐','贵州菜','面食','韩餐','麻辣烫','东南亚菜','早午餐',
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
