#!/usr/bin/env node
/**
 * 06_generate_index.js — Generate slim index for fast frontend list rendering
 *
 * Reads the full restaurant_database.json and writes a slim version
 * containing only fields needed for the list view (not the modal).
 * This is what index.html fetches on initial load for fast render.
 * Full data is fetched per-restaurant when a modal opens.
 *
 * Usage: node pipeline/06_generate_index.js <db_file> <index_file>
 */

'use strict';

const fs = require('fs');

const [, , dbFile, indexFile] = process.argv;

if (!dbFile || !indexFile) {
    console.error('Usage: node 06_generate_index.js <db_file> <index_file>');
    process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

// Fields needed for the card/list view only
const CARD_FIELDS = [
    'id', 'name', 'name_en', 'cuisine', 'region', 'city',
    'price_range', 'google_rating', 'verified',
    'total_engagement', 'mention_count', 'sentiment_score',
    'address', 'semantic_tags',
    // Recommendations: keep only first 3 for card chip display
];

const slimRestaurants = db.restaurants
    .filter(r => !r.merge_info?.needs_review && r._status !== 'rejected' && r._status !== 'duplicate_merged') // Exclude unreviewed, rejected, and merged duplicates
    .map(r => {
        const slim = {};
        for (const field of CARD_FIELDS) {
            if (r[field] !== undefined) slim[field] = r[field];
        }
        // Trim recommendations to first 3 for the card chips
        slim.recommendations = Array.isArray(r.recommendations)
            ? r.recommendations.slice(0, 3)
            : [];
        // Include last 24 months of timeseries for the chart
        slim.timeseries = Array.isArray(r.timeseries)
            ? r.timeseries.slice(-24)
            : [];
        // Include top 5 post_details (by engagement) for the modal chart fallback and XHS links
        slim.post_details = Array.isArray(r.post_details)
            ? r.post_details
                .slice()
                .sort((a, b) => (b.adjusted_engagement || 0) - (a.adjusted_engagement || 0))
                .slice(0, 5)
                .map(({ post_id, title, date, engagement, adjusted_engagement }) => ({ post_id, title, date, engagement, adjusted_engagement }))
            : [];
        return slim;
    });

const index = {
    version: db.version,
    updated_at: db.updated_at,
    total_restaurants: slimRestaurants.length,
    restaurants: slimRestaurants,
};

fs.writeFileSync(indexFile, JSON.stringify(index));

const fullSize = fs.statSync(dbFile).size;
const indexSize = Buffer.byteLength(JSON.stringify(index));
const reduction = Math.round((1 - indexSize / fullSize) * 100);

console.log(`Index generated: ${slimRestaurants.length} restaurants`);
console.log(`  Full DB: ${(fullSize / 1024).toFixed(1)}KB → Index: ${(indexSize / 1024).toFixed(1)}KB (${reduction}% smaller)`);
