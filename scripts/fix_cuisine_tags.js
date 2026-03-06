#!/usr/bin/env node
/**
 * scripts/fix_cuisine_tags.js — One-time cuisine tag cleanup
 *
 * Directly updates restaurant_database.json cuisine fields.
 * Idempotent: safe to re-run.
 *
 * Usage:
 *   node scripts/fix_cuisine_tags.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { beginTransaction, commitTransaction, DB_FILE } = require('./transaction');

// Full merge map: old value → canonical Chinese value
const MERGE_MAP = {
  // Priority 1 — English → Chinese duplicates
  'Japanese':               '日料',
  'Japanese (Ramen)':       '日料',
  'Japanese/Yakitori':      '日料',
  'Yakitori/Japanese':      '日料',
  'Korean':                 '韩餐',
  'Korean Fusion Brunch':   '韩餐',
  'Chinese':                '中餐',
  'Chinese Rice Noodle':    '中餐',
  'Chinese/Lanzhou Noodles':'中餐',
  'Cantonese':              '粤菜',
  'Dim Sum / Cantonese':    '粤菜',
  'Hot Pot':                '火锅',
  'Hot Pot / Chinese':      '火锅',
  'Indian':                 '印度菜',
  'Mexican':                '墨西哥菜',
  'American':               '西餐',
  'Greek':                  '西餐',
  'Spanish Tapas':          '西餐',
  'Mediterranean':          '西餐',
  'Bakery':                 '烘焙',
  'Ice cream':              '甜品',

  // Priority 2 — Compound → clean Chinese
  '上海菜/本帮菜':           '上海菜',
  '烧腊':                   '烧烤',
  '港式茶餐厅':              '粤菜',

  // Priority 3 — Overly granular regional → broader
  '中原菜':                 '中餐',
  '徽菜':                   '中餐',
  '湖北菜':                 '中餐',
  '贵州菜':                 '中餐',
  '砂锅':                   '中餐',
};

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Compute changes
const updates = [];
for (const r of db.restaurants) {
  if (r._status === 'duplicate_merged') continue;
  const mapped = MERGE_MAP[r.cuisine];
  if (mapped && mapped !== r.cuisine) {
    updates.push({ r, from: r.cuisine, to: mapped });
  }
}

if (updates.length === 0) {
  console.log('Nothing to update — all cuisine tags already canonical.');
  process.exit(0);
}

// Print summary grouped by mapping
const byMapping = {};
for (const u of updates) {
  const key = `${u.from} → ${u.to}`;
  byMapping[key] = (byMapping[key] || 0) + 1;
}
console.log('\nCuisine tag updates:');
for (const [mapping, count] of Object.entries(byMapping)) {
  console.log(`  ${count}x  ${mapping}`);
}
console.log(`\nTotal: ${updates.length} restaurants\n`);

// Apply with transaction
const txId = beginTransaction('fix_cuisine_tags');
try {
  for (const { r, to } of updates) {
    r.cuisine = to;
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  commitTransaction(txId);
  console.log('Done. Run: node pipeline/06_generate_index.js');
} catch (err) {
  const { rollbackTransaction } = require('./transaction');
  rollbackTransaction(txId);
  console.error('Error — rolled back:', err.message);
  process.exit(1);
}
