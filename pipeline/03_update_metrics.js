#!/usr/bin/env node
/**
 * 03_update_metrics.js — Update engagement metrics for EXISTING restaurants
 *
 * For each new XHS post, check if it mentions any existing restaurant.
 * If yes: increment mention_count, update total_engagement, add to sources[],
 *         update timeseries, and append new dishes found.
 *
 * Usage: node pipeline/03_update_metrics.js <db_file> <candidates_file>
 *
 * NOTE: This step modifies the database IN-PLACE.
 *       Always run AFTER backup (step 1) and BEFORE merge (step 4).
 */

'use strict';

const fs = require('fs');

const [, , dbFile, candidatesFile] = process.argv;

if (!dbFile || !candidatesFile) {
    console.error('Usage: node 03_update_metrics.js <db_file> <candidates_file>');
    process.exit(1);
}

// ─── Load data ───────────────────────────────────────────────────────────────
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

// ─── Inline migration: trend_30d → timeseries ────────────────────────────────
// Any restaurant where timeseries is not an array (legacy scalar or missing) gets reset to []
let migrated = 0;
for (const r of db.restaurants) {
    if (!Array.isArray(r.timeseries)) {
        r.timeseries = [];
        delete r.trend_30d;
        migrated++;
    }
}
if (migrated > 0) {
    db.updated_at = new Date().toISOString();
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
    console.log(`Migration: reset timeseries for ${migrated} restaurants`);
}

let candidates = [];
try {
    candidates = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
} catch (e) {
    console.log('No candidates file, skipping metrics update');
    process.exit(0);
}

if (!Array.isArray(candidates) || candidates.length === 0) {
    console.log('No candidates, skipping metrics update');
    process.exit(0);
}

// ─── Build search index for fast matching ────────────────────────────────────
// Map normalized name → restaurant index in db.restaurants
const nameIndex = new Map();
for (let i = 0; i < db.restaurants.length; i++) {
    const r = db.restaurants[i];
    // Index by full name (normalized)
    nameIndex.set(normalize(r.name), i);
    // Also index by English name if present
    if (r.name_en) nameIndex.set(normalize(r.name_en), i);
}

function normalize(str) {
    return (str || '').toLowerCase().replace(/\s+/g, '').replace(/[·•·\-_]/g, '');
}

// ─── Process candidates ──────────────────────────────────────────────────────
const now = new Date();
const today = now.toISOString().split('T')[0];
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
let updatedCount = 0;
let newDishesAdded = 0;

for (const candidate of candidates) {
    const key = normalize(candidate.name);
    const idx = nameIndex.get(key);
    if (idx === undefined) continue; // New restaurant, handled by merge step

    const r = db.restaurants[idx];
    let changed = false;

    // --- Update mention count & engagement ---
    r.mention_count = (r.mention_count || 0) + 1;
    r.total_engagement = (r.total_engagement || 0) + (candidate.engagement || 0);
    changed = true;

    // --- Add source post if not already tracked ---
    if (candidate.source_post_id) {
        if (!Array.isArray(r.sources)) r.sources = [];
        if (!r.sources.includes(candidate.source_post_id)) {
            r.sources.push(candidate.source_post_id);
        }
    }

    // --- Update timeseries (array of monthly {month, mentions, engagement} entries) ---
    if (!Array.isArray(r.timeseries)) r.timeseries = [];
    const monthEntry = r.timeseries.find(e => e.month === thisMonth);
    if (monthEntry) {
        monthEntry.mentions += 1;
        monthEntry.engagement = (monthEntry.engagement || 0) + (candidate.engagement || 0);
    } else {
        r.timeseries.push({ month: thisMonth, mentions: 1, engagement: candidate.engagement || 0 });
    }
    // Keep only last 24 months
    r.timeseries = r.timeseries
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-24);

    // --- Append new dishes (LLM-extracted, only if not already present) ---
    if (Array.isArray(candidate.dishes) && candidate.dishes.length > 0) {
        if (!Array.isArray(r.recommendations)) r.recommendations = [];
        const existingDishNames = new Set(
            r.recommendations.map(d => typeof d === 'string'
                ? normalize(d)
                : normalize(d.name || d.dish || ''))
        );
        for (const dish of candidate.dishes) {
            const dishKey = normalize(dish);
            if (dish.length >= 2 && !existingDishNames.has(dishKey)) {
                // Add as a simple string (same format as existing recommendations)
                r.recommendations.push(dish);
                existingDishNames.add(dishKey);
                newDishesAdded++;
            }
        }
    }

    // --- Update sentiment if candidate has it ---
    if (candidate.sentiment && candidate.sentiment !== 'neutral') {
        // Weighted running average: new sentiment nudges the score
        const sentimentValue = candidate.sentiment === 'positive' ? 1.0
            : candidate.sentiment === 'negative' ? 0.0 : 0.5;
        const currentScore = r.sentiment_score || 0.5;
        const weight = 0.1; // New data has 10% weight
        r.sentiment_score = Math.round((currentScore * (1 - weight) + sentimentValue * weight) * 100) / 100;
    }

    r.updated_at = new Date().toISOString();
    updatedCount++;
}

// ─── Save ────────────────────────────────────────────────────────────────────
if (updatedCount > 0) {
    db.updated_at = new Date().toISOString();
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
    console.log(`Metrics updated: ${updatedCount} restaurants refreshed, ${newDishesAdded} new dishes added`);
} else {
    console.log('Metrics: no existing restaurants matched (all candidates are new)');
}
