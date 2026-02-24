#!/usr/bin/env node
/**
 * scripts/dedup_by_placeid.js — One-time deduplication by Google Place ID
 *
 * Finds restaurants with duplicate google_place_id and merges them:
 * - Keeps the one with more mentions
 * - Marks others as _status: 'duplicate_merged'
 * - Combines sources, recommendations, and engagement metrics
 *
 * Usage: node scripts/dedup_by_placeid.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'restaurant_database.json');

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Group by place_id (exclude already-merged entries)
const byPlaceId = {};
for (const r of db.restaurants) {
    // Skip entries that have already been merged into another
    if (r._status === 'duplicate_merged') continue;
    if (r.google_place_id) {
        if (!byPlaceId[r.google_place_id]) byPlaceId[r.google_place_id] = [];
        byPlaceId[r.google_place_id].push(r);
    }
}

// Find duplicates
const duplicates = Object.entries(byPlaceId).filter(([id, arr]) => arr.length > 1);

if (duplicates.length === 0) {
    console.log('No duplicates found!');
    process.exit(0);
}

console.log(`Found ${duplicates.length} duplicate place_ids:\n`);

let merged = 0;

for (const [placeId, restaurants] of duplicates) {
    console.log(`Place ID: ${placeId}`);

    // Sort by mention_count (keep the one with most mentions)
    restaurants.sort((a, b) => (b.mention_count || 0) - (a.mention_count || 0));

    const [keep, ...remove] = restaurants;

    console.log(`  Keeping: ${keep.name} (${keep.mention_count} mentions)`);
    console.log(`  Merging:  ${remove.map(r => `${r.name} (${r.mention_count} mentions)`).join(', ')}`);

    // Merge data from duplicates into the keeper
    for (const r of remove) {
        // Combine engagement
        keep.total_engagement = (keep.total_engagement || 0) + (r.total_engagement || 0);
        keep.mention_count = (keep.mention_count || 0) + (r.mention_count || 0);

        // Combine sources
        if (r.sources) {
            if (!keep.sources) keep.sources = [];
            for (const s of r.sources) {
                if (!keep.sources.includes(s)) keep.sources.push(s);
            }
        }

        // Combine recommendations
        if (r.recommendations) {
            if (!keep.recommendations) keep.recommendations = [];
            const existing = new Set(keep.recommendations.map(d =>
                typeof d === 'string' ? d.toLowerCase() : (d.name || d.dish || '').toLowerCase()
            ));
            for (const dish of r.recommendations) {
                const key = typeof dish === 'string' ? dish.toLowerCase() : (dish.name || dish.dish || '').toLowerCase();
                if (!existing.has(key)) {
                    keep.recommendations.push(dish);
                    existing.add(key);
                }
            }
        }

        // Combine post_details (individual post links with engagement data)
        if (r.post_details) {
            if (!keep.post_details) keep.post_details = [];
            const existingPostIds = new Set(keep.post_details.map(p => p.post_id));
            for (const post of r.post_details) {
                if (post.post_id && !existingPostIds.has(post.post_id)) {
                    keep.post_details.push(post);
                    existingPostIds.add(post.post_id);
                }
            }
            // Sort by engagement (highest first) and keep top 10
            keep.post_details.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
            keep.post_details = keep.post_details.slice(0, 10);
        }

        // Combine timeseries (monthly engagement tracking)
        if (r.timeseries) {
            if (!keep.timeseries) keep.timeseries = [];
            for (const entry of r.timeseries) {
                const existing = keep.timeseries.find(e => e.month === entry.month);
                if (existing) {
                    existing.mentions = (existing.mentions || 0) + (entry.mentions || 0);
                    existing.engagement = (existing.engagement || 0) + (entry.engagement || 0);
                } else {
                    keep.timeseries.push({ ...entry });
                }
            }
            // Keep only last 24 months, sorted
            keep.timeseries = keep.timeseries
                .sort((a, b) => a.month.localeCompare(b.month))
                .slice(-24);
        }

        // Mark as merged
        r._status = 'duplicate_merged';
        r.merged_into = keep.id;
        merged++;
    }

    console.log();
}

// Save
db.updated_at = new Date().toISOString();
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

console.log(`✅ Merged ${merged} duplicate restaurants`);

// Regenerate index
const { execSync } = require('child_process');
const indexPath = path.join(ROOT, 'data', 'restaurant_database_index.json');
execSync(`node "${path.join(ROOT, 'pipeline', '06_generate_index.js')}" "${DB_FILE}" "${indexPath}"`, { stdio: 'inherit' });
