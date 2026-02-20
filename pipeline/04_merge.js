#!/usr/bin/env node
/**
 * 03_merge.js — Safely merge new restaurant candidates into existing database
 * Usage: node pipeline/03_merge.js <db_file> <candidates_file> <output_file>
 *
 * Safety rules:
 *   - NEVER deletes existing restaurants
 *   - NEVER overwrites existing restaurant data
 *   - Only ADDS truly new restaurants (not in existing DB)
 *   - New restaurants are flagged as needs_review: true
 */

'use strict';
const fs = require('fs');

const [, , dbFile, candidatesFile, outputFile] = process.argv;

if (!dbFile || !candidatesFile || !outputFile) {
    console.error('Usage: node 03_merge.js <db_file> <candidates_file> <output_file>');
    process.exit(1);
}

// Load existing database
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const beforeCount = db.restaurants.length;

// Load candidates
let candidates = [];
try {
    candidates = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
} catch (e) {
    console.log('No candidates file or empty. Nothing to merge.');
    process.exit(0);
}

if (!Array.isArray(candidates) || candidates.length === 0) {
    console.log('No candidates to merge.');
    process.exit(0);
}

// Build lookup of existing names (normalized)
const existingNames = new Set(
    db.restaurants.map(r => r.name.toLowerCase().trim().replace(/\s+/g, ''))
);

let added = 0;
let skipped = 0;

for (const candidate of candidates) {
    const nameKey = candidate.name.toLowerCase().trim().replace(/\s+/g, '');

    if (existingNames.has(nameKey)) {
        skipped++;
        continue;
    }

    // Basic validation
    if (!candidate.name || candidate.name.length < 2 || candidate.name.length > 30) {
        skipped++;
        continue;
    }

    const newRestaurant = {
        id: `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: candidate.name,
        name_en: '',
        cuisine: 'unknown',
        area: 'unknown',
        region: 'unknown',
        city: 'unknown',
        price_range: 'unknown',
        address: '',
        google_rating: null,
        google_place_id: null,
        verified: false,
        total_engagement: candidate.engagement || 0,
        mention_count: 1,
        sentiment_score: 0.5,
        sentiment_details: {},
        recommendations: [],
        sources: [candidate.source_post_id].filter(Boolean),
        post_details: [],
        timeseries: [],
        semantic_tags: [],
        updated_at: new Date().toISOString(),
        merge_info: {
            added_date: new Date().toISOString().split('T')[0],
            source: 'daily_pipeline',
            source_post: candidate.source_post_id || '',
            needs_review: true,
        },
    };

    db.restaurants.push(newRestaurant);
    existingNames.add(nameKey);
    added++;

    if (added <= 10) {
        console.log(`  + ${candidate.name} (from: ${candidate.source_title?.slice(0, 40)}...)`);
    } else if (added === 11) {
        console.log('  + ... (more)');
    }
}

// Update metadata
db.updated_at = new Date().toISOString();
db.total_restaurants = db.restaurants.length;

// Write output
fs.writeFileSync(outputFile, JSON.stringify(db, null, 2));
console.log(`Merge: ${beforeCount} → ${db.restaurants.length} restaurants (+${added} new, ${skipped} skipped)`);
