#!/usr/bin/env node
/**
 * One-time cleanup: remove wrongly-associated posts from two restaurants.
 *
 * 晓川哥 — remove Korean restaurant post (wrong place_id collision via "Coco Bang")
 * 湘粤情  — remove "湾区湘菜天花板" post (LLM hallucination)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_FILE    = path.join(__dirname, '..', 'site', 'data', 'restaurant_database.json');
const INDEX_FILE = path.join(__dirname, '..', 'site', 'data', 'restaurant_database_index.json');

const REMOVALS = [
    { restaurantName: '晓川哥', postId: '695c4460000000000b010931', reason: 'Korean restaurant post — wrong place_id collision (Coco Bang)' },
    { restaurantName: '湘粤情',  postId: '67158d6c0000000021003d8f', reason: 'LLM hallucination — post only discusses 顾湘' },
];

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
let removals = 0;

for (const { restaurantName, postId, reason } of REMOVALS) {
    const r = db.restaurants.find(r => r.name === restaurantName);
    if (!r) {
        console.warn(`  ⚠️  Restaurant not found: ${restaurantName}`);
        continue;
    }

    const beforePostCount   = (r.post_details || []).length;
    const beforeSourceCount = (r.sources || []).length;

    // Remove from post_details
    r.post_details = (r.post_details || []).filter(p => p.post_id !== postId);

    // Remove from sources
    r.sources = (r.sources || []).filter(s => s !== postId);

    if (r.post_details.length === beforePostCount) {
        console.warn(`  ⚠️  Post ${postId} not found in ${restaurantName}`);
        continue;
    }

    // Recompute total_engagement and mention_count from remaining post_details
    r.total_engagement = r.post_details.reduce((sum, p) => sum + (p.adjusted_engagement || 0), 0);
    r.mention_count    = r.sources.length;

    // Recompute sentiment_score
    const SENTIMENT_VALUE = { positive: 1.0, neutral: 0.5, negative: 0.0 };
    const postsWithSentiment = r.post_details.filter(p => p.sentiment);
    if (postsWithSentiment.length > 0) {
        const totalWeight  = postsWithSentiment.reduce((s, p) => s + (p.adjusted_engagement || 0), 0);
        const weightedSum  = postsWithSentiment.reduce((s, p) =>
            s + (p.adjusted_engagement || 0) * (SENTIMENT_VALUE[p.sentiment] ?? 0.5), 0);
        r.sentiment_score = totalWeight > 0
            ? Math.round((weightedSum / totalWeight) * 100) / 100
            : r.sentiment_score || 0.5;
    }

    r.updated_at = new Date().toISOString();

    console.log(`  ✓  ${restaurantName}: removed post ${postId}`);
    console.log(`     Reason: ${reason}`);
    console.log(`     post_details: ${beforePostCount} → ${r.post_details.length}`);
    console.log(`     sources: ${beforeSourceCount} → ${r.sources.length}`);
    console.log(`     total_engagement: ${r.total_engagement.toFixed(4)}, mention_count: ${r.mention_count}`);
    removals++;
}

if (removals === 0) {
    console.log('Nothing to remove.');
    process.exit(0);
}

db.updated_at = new Date().toISOString();
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log(`\nDatabase saved. Regenerating index...`);

// Regenerate the index
const { execSync } = require('child_process');
execSync('node pipeline/06_generate_index.js site/data/restaurant_database.json site/data/restaurant_database_index.json', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
console.log('Done.');
