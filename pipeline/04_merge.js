#!/usr/bin/env node
/**
 * 04_merge.js — Merge candidates into database using Google Place ID matching
 *
 * Uses google_place_id as the unique identifier for deduplication.
 * - Existing restaurants (same place_id): update metrics only
 * - New restaurants (new place_id): add to database (already verified via Google)
 *
 * Safety rules:
 *   - NEVER deletes existing restaurants
 *   - NEVER overwrites existing restaurant's Google data
 *   - Only adds Google-verified restaurants (enrichment_failed candidates are skipped)
 *   - New restaurants have needs_review: false (already verified)
 *
 * Usage: node pipeline/04_merge.js <db_file> <candidates_file> <output_file>
 */

'use strict';

const fs = require('fs');

const [, , dbFile, candidatesFile, outputFile] = process.argv;

if (!dbFile || !candidatesFile || !outputFile) {
    console.error('Usage: node 04_merge.js <db_file> <candidates_file> <output_file>');
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

// ─── Build lookup: google_place_id → restaurant index ─────────────────────────
const placeIdIndex = new Map();
for (let i = 0; i < db.restaurants.length; i++) {
    const r = db.restaurants[i];
    if (r.google_place_id) {
        placeIdIndex.set(r.google_place_id, i);
    }
}

// ─── Time helpers ──────────────────────────────────────────────────────────────
const now = new Date();
const today = now.toISOString().split('T')[0];
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// ─── Process candidates ────────────────────────────────────────────────────────
let added = 0;
let updated = 0;
let skippedNoPlaceId = 0;
let skippedEnrichmentFailed = 0;
let newDishesAdded = 0;

function normalize(str) {
    return (str || '').toLowerCase().replace(/\s+/g, '').replace(/[·•·\-_]/g, '');
}

for (const candidate of candidates) {
    // Skip candidates that failed enrichment
    if (candidate.enrichment_failed) {
        skippedEnrichmentFailed++;
        continue;
    }

    // Skip candidates without place_id (shouldn't happen if enrichment worked)
    if (!candidate.google_place_id) {
        skippedNoPlaceId++;
        continue;
    }

    const existingIdx = placeIdIndex.get(candidate.google_place_id);

    if (existingIdx !== undefined) {
        // ─── UPDATE existing restaurant ────────────────────────────────────────
        const r = db.restaurants[existingIdx];

        // Update mention count & engagement
        r.mention_count = (r.mention_count || 0) + 1;
        r.total_engagement = (r.total_engagement || 0) + (candidate.engagement || 0);

        // Add source post if not already tracked
        if (candidate.source_post_id) {
            if (!Array.isArray(r.sources)) r.sources = [];
            if (!r.sources.includes(candidate.source_post_id)) {
                r.sources.push(candidate.source_post_id);
            }
        }

        // Update timeseries (monthly engagement tracking)
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

        // Append new dishes (only if not already present)
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
                    r.recommendations.push(dish);
                    existingDishNames.add(dishKey);
                    newDishesAdded++;
                }
            }
        }

        // Update sentiment if candidate has it
        if (candidate.sentiment && candidate.sentiment !== 'neutral') {
            const sentimentValue = candidate.sentiment === 'positive' ? 1.0
                : candidate.sentiment === 'negative' ? 0.0 : 0.5;
            const currentScore = r.sentiment_score || 0.5;
            const weight = 0.1; // New data has 10% weight
            r.sentiment_score = Math.round((currentScore * (1 - weight) + sentimentValue * weight) * 100) / 100;
        }

        r.updated_at = new Date().toISOString();
        updated++;

    } else {
        // ─── ADD new restaurant ─────────────────────────────────────────────────
        const sentimentScore = { positive: 1.0, neutral: 0.5, negative: 0.0 };

        const newRestaurant = {
            id: `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: candidate.name,
            name_en: '',
            cuisine: candidate.cuisine || 'unknown',
            area: 'unknown',
            region: 'unknown',
            city: candidate.city || 'unknown',
            price_range: candidate.price_range || 'unknown',
            // Google data (from enrichment)
            address: candidate.address || '',
            google_rating: candidate.google_rating || null,
            google_place_id: candidate.google_place_id,
            lat: candidate.lat || null,
            lng: candidate.lng || null,
            verified: true,  // Already verified via Google enrichment
            // Engagement metrics
            total_engagement: candidate.engagement || 0,
            mention_count: 1,
            sentiment_score: sentimentScore[candidate.sentiment] ?? 0.5,
            sentiment_details: {},
            recommendations: Array.isArray(candidate.dishes) ? candidate.dishes : [],
            sources: [candidate.source_post_id].filter(Boolean),
            post_details: [],
            timeseries: [{ month: thisMonth, mentions: 1, engagement: candidate.engagement || 0 }],
            semantic_tags: [],
            updated_at: new Date().toISOString(),
            merge_info: {
                added_date: today,
                source: 'daily_pipeline',
                source_post: candidate.source_post_id || '',
                needs_review: false,  // No review needed - already Google-verified!
            },
        };

        db.restaurants.push(newRestaurant);
        // Add to index for future dedup
        placeIdIndex.set(newRestaurant.google_place_id, db.restaurants.length - 1);
        added++;

        if (added <= 10) {
            console.log(`  + ${candidate.name} (from: ${candidate.source_title?.slice(0, 40)}...)`);
        } else if (added === 11) {
            console.log('  + ... (more)');
        }
    }
}

// Update metadata
db.updated_at = new Date().toISOString();
db.total_restaurants = db.restaurants.length;

// Write output
fs.writeFileSync(outputFile, JSON.stringify(db, null, 2));

// Summary
const afterCount = db.restaurants.length;
console.log(`Merge: ${beforeCount} → ${afterCount} restaurants (+${added} new, ${updated} updated)`);
if (skippedEnrichmentFailed > 0) {
    console.log(`  Skipped ${skippedEnrichmentFailed} candidates (enrichment failed)`);
}
if (skippedNoPlaceId > 0) {
    console.log(`  Skipped ${skippedNoPlaceId} candidates (no place_id)`);
}
if (newDishesAdded > 0) {
    console.log(`  Added ${newDishesAdded} new dishes to existing restaurants`);
}
