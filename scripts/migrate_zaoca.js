#!/usr/bin/env node
/**
 * scripts/migrate_zaoca.js — One-time migration: reclassify 早茶 restaurants from 粤菜 → 早茶
 *
 * Usage:
 *   node scripts/migrate_zaoca.js           # Preview changes
 *   node scripts/migrate_zaoca.js --apply   # Write corrections.json + apply to DB
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT             = path.join(__dirname, '..');
const DB_FILE          = path.join(ROOT, 'site', 'data', 'restaurant_database.json');
const CORRECTIONS_FILE = path.join(ROOT, 'data', 'corrections.json');
const APPLY            = process.argv.includes('--apply');

// Restaurants that are clearly 早茶 (dim sum / yum cha format)
// Identified by name keywords, Google name, or original LLM tag
const ZAOCA_IDS = new Set([
  // Had original cuisine tag 广式早茶 (already corrected to 粤菜, now fix to 早茶)
  'pipeline_1772067300857_w02n', // 名味阁 Ming's Tasty
  'pipeline_1772067300875_jr64', // Osmanthus Dim Sum Lounge

  // Explicit dim sum restaurants (corrections set cuisine: 粤菜)
  'pipeline_1772067300857_0xvf', // Yummy Dim Sum & Fast Food
  'pipeline_1772067300865_9ds9', // Hong Kong East Ocean Seafood
  'pipeline_1772067300868_q634', // 凯悦汇 Harborview
  'pipeline_1772067301117_nv6d', // 半岛明珠 HL Peninsula Pearl
  'pipeline_1772067301117_0hjr', // 俏龙轩 Dragon Beaux
  'pipeline_1772067301117_u2t2', // 鲤鱼门 Koi Palace
  'pipeline_1772067301496_gol4', // Yank Sing
  'pipeline_1772067301544_2c07', // 半岛豪苑 HL Peninsula
  'pipeline_1772346692756_i1ps', // 鲤鱼门 Koi Palace - Milpitas
  'r078',                        // 半岛 HL Peninsula (large correction)

  // No cuisine correction yet — need new entries
  'pipeline_1772515557773_yakh', // 如苑早茶 Jade Tea Garden
  'pipeline_1772091355883_23bm', // 鲤鱼门 Koi Palace Contempo
  'pipeline_1772067301118_vllh', // 西贡渔港
  'pipeline_1772515557773_v5u9', // 鲤鱼门，
]);

const db          = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const corrections = JSON.parse(fs.readFileSync(CORRECTIONS_FILE, 'utf8'));

// Index corrections by restaurant id (last one wins if duplicates)
const corrByIdIdx = {};
corrections.forEach((c, i) => { corrByIdIdx[c.id] = i; });

const dbById = {};
db.restaurants.forEach(r => { dbById[r.id] = r; });

const updates  = []; // existing corrections to patch
const newEntries = []; // restaurants needing a fresh correction

for (const id of ZAOCA_IDS) {
  const r = dbById[id];
  if (!r) { console.warn(`⚠️  Not in DB: ${id}`); continue; }

  const corrIdx = corrByIdIdx[id];
  if (corrIdx !== undefined) {
    const c = corrections[corrIdx];
    if (c.corrections.cuisine === '早茶') {
      console.log(`  (already 早茶) ${r.name} (${id})`);
      continue;
    }
    updates.push({ idx: corrIdx, id, name: r.name, oldCuisine: c.corrections.cuisine });
  } else {
    newEntries.push({ id, name: r.name, currentCuisine: r.cuisine });
  }
}

console.log('\n=== 早茶 Migration Preview ===\n');
console.log(`Updates to existing corrections (${updates.length}):`);
updates.forEach(u => console.log(`  ${u.id}  ${u.name}  ${u.oldCuisine || '(no cuisine field)'} → 早茶`));

console.log(`\nNew correction entries (${newEntries.length}):`);
newEntries.forEach(n => console.log(`  ${n.id}  ${n.name}  (currently in DB: ${n.currentCuisine})`));

if (!APPLY) {
  console.log('\nRun with --apply to write changes.');
  process.exit(0);
}

// ─── Apply ────────────────────────────────────────────────────────────────────

// 1. Patch existing corrections
for (const { idx, id, name } of updates) {
  const c = corrections[idx];
  c.corrections.cuisine = '早茶';
  if (c.reason && c.reason.includes('粤菜')) {
    c.reason = c.reason.replace(/粤菜/g, '早茶');
  }
}

// 2. Add new corrections
for (const { id, name } of newEntries) {
  corrections.push({
    id,
    name,
    corrections: { cuisine: '早茶' },
    reason: '早茶 reclassification: dim sum / yum cha restaurant',
  });
}

fs.writeFileSync(CORRECTIONS_FILE, JSON.stringify(corrections, null, 2), 'utf8');
console.log(`\n✅ corrections.json updated (${updates.length} patched, ${newEntries.length} added)`);

// 3. Apply directly to DB as well
let dbUpdated = 0;
for (const id of ZAOCA_IDS) {
  const r = dbById[id];
  if (r && r.cuisine !== '早茶') {
    r.cuisine = '早茶';
    dbUpdated++;
  }
}
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
console.log(`✅ restaurant_database.json updated (${dbUpdated} restaurants)`);

console.log('\nNext steps:');
console.log('  node pipeline/06_generate_index.js data/restaurant_database.json data/restaurant_database_index.json');
