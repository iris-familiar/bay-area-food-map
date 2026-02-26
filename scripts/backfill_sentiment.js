#!/usr/bin/env node
/**
 * backfill_sentiment.js — One-time backfill for engagement-weighted sentiment
 *
 * For each restaurant's post_details that lack a `sentiment` field:
 *   - Infers sentiment from the restaurant's existing sentiment_score
 * Then recomputes sentiment_score using the new engagement-weighted formula.
 *
 * Idempotent: skips post_details that already have a `sentiment` field.
 *
 * Usage: node scripts/backfill_sentiment.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_PATH = path.join(__dirname, '..', 'data', 'restaurant_database.json');
const INDEX_SCRIPT = path.join(__dirname, '..', 'pipeline', '06_generate_index.js');

const SENTIMENT_VALUE = { positive: 1.0, neutral: 0.5, negative: 0.0 };

function inferSentiment(score) {
    if (score >= 0.7) return 'positive';
    if (score <= 0.3) return 'negative';
    return 'neutral';
}

function computeWeightedScore(postDetails) {
    const postsWithSentiment = postDetails.filter(p => p.sentiment);
    if (postsWithSentiment.length === 0) return null;
    const totalWeight = postsWithSentiment.reduce((s, p) => s + (p.adjusted_engagement || 0), 0);
    const weightedSum = postsWithSentiment.reduce((s, p) =>
        s + (p.adjusted_engagement || 0) * (SENTIMENT_VALUE[p.sentiment] ?? 0.5), 0);
    return totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 100) / 100
        : null;
}

// Load database
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

let postDetailsUpdated = 0;
let restaurantsRecomputed = 0;

for (const r of db.restaurants) {
    if (r._status === 'duplicate_merged') continue;
    if (!Array.isArray(r.post_details) || r.post_details.length === 0) continue;

    const existingScore = r.sentiment_score ?? 0.5;
    const inferredSentiment = inferSentiment(existingScore);

    // Fill in missing sentiment on post_details
    for (const p of r.post_details) {
        if (!p.sentiment) {
            p.sentiment = inferredSentiment;
            postDetailsUpdated++;
        }
    }

    // Recompute sentiment_score using engagement-weighted formula
    const newScore = computeWeightedScore(r.post_details);
    if (newScore !== null) {
        r.sentiment_score = newScore;
        restaurantsRecomputed++;
    }
}

// Save database
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log(`Backfill complete:`);
console.log(`  ${postDetailsUpdated} post_details updated with inferred sentiment`);
console.log(`  ${restaurantsRecomputed} restaurants recomputed with engagement-weighted formula`);

// Regenerate index
const INDEX_DB = path.join(__dirname, '..', 'data', 'restaurant_database.json');
const INDEX_OUT = path.join(__dirname, '..', 'data', 'restaurant_database_index.json');
console.log('Regenerating index...');
execSync(`node "${INDEX_SCRIPT}" "${INDEX_DB}" "${INDEX_OUT}"`, { stdio: 'inherit' });
console.log('Done.');
