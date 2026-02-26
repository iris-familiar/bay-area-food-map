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

const CITY_TO_REGION = {
    // South Bay
    'san jose': 'South Bay', 'cupertino': 'South Bay', 'sunnyvale': 'South Bay',
    'mountain view': 'South Bay', 'santa clara': 'South Bay', 'milpitas': 'South Bay',
    'campbell': 'South Bay',
    // Peninsula
    'palo alto': 'Peninsula', 'san mateo': 'Peninsula', 'millbrae': 'Peninsula',
    'menlo park': 'Peninsula', 'san carlos': 'Peninsula', 'burlingame': 'Peninsula',
    'redwood city': 'Peninsula', 'south san francisco': 'Peninsula',
    'san bruno': 'Peninsula', 'belmont': 'Peninsula', 'daly city': 'Peninsula',
    'foster city': 'Peninsula',
    // East Bay
    'fremont': 'East Bay', 'oakland': 'East Bay', 'berkeley': 'East Bay',
    'newark': 'East Bay', 'hayward': 'East Bay', 'union city': 'East Bay',
    'san leandro': 'East Bay', 'albany': 'East Bay', 'dublin': 'East Bay',
    'pleasanton': 'East Bay', 'walnut creek': 'East Bay', 'pleasant hill': 'East Bay',
    'emeryville': 'East Bay',
    // San Francisco
    'san francisco': 'San Francisco', 'sf': 'San Francisco',
};

function cityToRegion(city) {
    if (!city || city === 'unknown') return 'unknown';
    return CITY_TO_REGION[city.toLowerCase()] || 'unknown';
}

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

// ─── Pre-compute N: number of restaurants per source post ─────────────────────
// Used for adjusted engagement: ln(X+1)/sqrt(N) to discount list posts
const postRestaurantCount = {};
for (const c of candidates) {
    if (c.source_post_id) {
        postRestaurantCount[c.source_post_id] = (postRestaurantCount[c.source_post_id] || 0) + 1;
    }
}

// ─── Process candidates ────────────────────────────────────────────────────────
let added = 0;
let updated = 0;
let skippedNoPlaceId = 0;
let skippedEnrichmentFailed = 0;
let newDishesAdded = 0;

function normalize(str) {
    return (str || '').toLowerCase().replace(/\s+/g, '').replace(/[·•·\-_]/g, '');
}

// Check if string contains CJK characters (Chinese, Japanese, Korean)
function hasCJK(str) {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(str || '');
}

// Normalised Levenshtein similarity (0–1)
function nameSimilarity(a, b) {
    a = (a || '').toLowerCase().replace(/\s+/g, '');
    b = (b || '').toLowerCase().replace(/\s+/g, '');
    if (a === b) return 1;
    const la = a.length, lb = b.length;
    if (!la || !lb) return 0;
    const dp = Array.from({length: la+1}, (_, i) => [i, ...Array(lb).fill(0)]);
    for (let j = 0; j <= lb; j++) dp[0][j] = j;
    for (let i = 1; i <= la; i++)
        for (let j = 1; j <= lb; j++)
            dp[i][j] = a[i-1] === b[j-1]
                ? dp[i-1][j-1]
                : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return 1 - dp[la][lb] / Math.max(la, lb);
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

        // Guard: cross-script name mismatch likely indicates a wrong Google place_id assignment
        const candidateIsCJK = hasCJK(candidate.name);
        const existingIsCJK  = hasCJK(r.name);
        if (candidateIsCJK !== existingIsCJK && nameSimilarity(candidate.name, r.name) < 0.3) {
            console.warn(`  ⚠️  Skipping: "${candidate.name}" matched place_id of "${r.name}" (script mismatch) — possible wrong Google match`);
            skippedNoPlaceId++;
            continue;
        }

        // Check if this source post is new (to avoid double-counting)
        const isNewSource = candidate.source_post_id && (
            !Array.isArray(r.sources) || !r.sources.includes(candidate.source_post_id)
        );

        // Compute adjusted engagement: ln(X+1)/sqrt(N)
        const N = postRestaurantCount[candidate.source_post_id] || 1;
        const adjustedEngagement = Math.log((candidate.engagement || 0) + 1) / Math.sqrt(N);

        // Only update metrics if this is a new source post
        if (isNewSource) {
            r.mention_count = (r.mention_count || 0) + 1;
            r.total_engagement = (r.total_engagement || 0) + adjustedEngagement;
        }

        // Add source post if not already tracked
        if (candidate.source_post_id) {
            if (!Array.isArray(r.sources)) r.sources = [];
            if (!r.sources.includes(candidate.source_post_id)) {
                r.sources.push(candidate.source_post_id);
            }
        }

        // Add post detail if not tracked
        if (candidate.source_post_id) {
            if (!Array.isArray(r.post_details)) r.post_details = [];
            if (!r.post_details.find(p => p.post_id === candidate.source_post_id)) {
                r.post_details.push({
                    post_id: candidate.source_post_id,
                    title: candidate.source_title || '',
                    date: candidate.source_post_date || '',
                    engagement: candidate.engagement || 0,
                    adjusted_engagement: adjustedEngagement,
                    restaurant_count_in_post: N,
                    context: '',
                    sentiment: candidate.sentiment || 'neutral'
                });
                // Keep top 10 by adjusted engagement
                r.post_details.sort((a, b) => (b.adjusted_engagement || 0) - (a.adjusted_engagement || 0));
                r.post_details = r.post_details.slice(0, 10);
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

        // Recompute sentiment_score from engagement-weighted post_details
        const SENTIMENT_VALUE = { positive: 1.0, neutral: 0.5, negative: 0.0 };
        const postsWithSentiment = r.post_details.filter(p => p.sentiment);
        if (postsWithSentiment.length > 0) {
            const totalWeight = postsWithSentiment.reduce((s, p) => s + (p.adjusted_engagement || 0), 0);
            const weightedSum = postsWithSentiment.reduce((s, p) =>
                s + (p.adjusted_engagement || 0) * (SENTIMENT_VALUE[p.sentiment] ?? 0.5), 0);
            r.sentiment_score = totalWeight > 0
                ? Math.round((weightedSum / totalWeight) * 100) / 100
                : r.sentiment_score || 0.5;
        }

        r.updated_at = new Date().toISOString();
        updated++;

    } else {
        // ─── ADD new restaurant ─────────────────────────────────────────────────
        const sentimentScore = { positive: 1.0, neutral: 0.5, negative: 0.0 };

        // Compute adjusted engagement: ln(X+1)/sqrt(N)
        const newN = postRestaurantCount[candidate.source_post_id] || 1;
        const newAdjustedEngagement = Math.log((candidate.engagement || 0) + 1) / Math.sqrt(newN);

        const newRestaurant = {
            id: `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: candidate.name,
            name_en: '',
            cuisine: candidate.cuisine || 'unknown',
            area: candidate.city || 'unknown',
            region: cityToRegion(candidate.city),
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
            total_engagement: newAdjustedEngagement,
            mention_count: 1,
            sentiment_score: sentimentScore[candidate.sentiment] ?? 0.5,
            sentiment_details: {},
            recommendations: Array.isArray(candidate.dishes) ? candidate.dishes : [],
            sources: [candidate.source_post_id].filter(Boolean),
            post_details: candidate.source_post_id ? [{
                post_id: candidate.source_post_id,
                title: candidate.source_title || '',
                date: candidate.source_post_date || '',
                engagement: candidate.engagement || 0,
                adjusted_engagement: newAdjustedEngagement,
                restaurant_count_in_post: newN,
                context: '',
                sentiment: candidate.sentiment || 'neutral'
            }] : [],
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
