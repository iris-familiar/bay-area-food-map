#!/usr/bin/env node
/**
 * scripts/backfill_adjusted_engagement.js — Recompute adjusted engagement for all restaurants
 *
 * The pipeline now uses ln(X+1)/sqrt(N) instead of raw engagement for total_engagement.
 * This script backfills that formula for all 522 existing restaurants using their
 * stored post_details.
 *
 * Algorithm:
 *   1. Scan all post_details across all restaurants to build post_id → restaurant_count map
 *   2. For each restaurant, recompute total_engagement = Σ ln(engagement+1)/sqrt(N)
 *   3. Add adjusted_engagement and restaurant_count_in_post to each post_details entry
 *   4. Write atomically via transaction.js
 *
 * Limitation: restaurants with >10 posts only have top-10 post_details stored;
 * backfill uses what's available.
 *
 * Usage: node scripts/backfill_adjusted_engagement.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { beginTransaction, commitTransaction, rollbackTransaction, DB_FILE } = require('./transaction');

const projectRoot = path.join(__dirname, '..');

function main() {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const restaurants = db.restaurants;

    // ── Step 1: Build post_id → restaurant_count across ALL restaurants ──────
    // Count how many restaurants cite each post (N per post)
    const postRestaurantCount = {};
    for (const r of restaurants) {
        for (const p of (r.post_details || [])) {
            if (p.post_id) {
                postRestaurantCount[p.post_id] = (postRestaurantCount[p.post_id] || 0) + 1;
            }
        }
    }

    console.log(`Built N-map for ${Object.keys(postRestaurantCount).length} unique posts`);

    // ── Step 2: Recompute total_engagement for each restaurant ───────────────
    let totalUpdated = 0;
    let totalPostsAnnotated = 0;

    for (const r of restaurants) {
        // Skip merged/rejected records — they won't appear in the frontend anyway
        if (r._status === 'duplicate_merged' || r._status === 'rejected') continue;

        const posts = r.post_details || [];
        if (posts.length === 0) {
            // No post_details: leave total_engagement as-is (it's 0 or legacy)
            continue;
        }

        let newTotalEngagement = 0;
        for (const p of posts) {
            const N = postRestaurantCount[p.post_id] || 1;
            const adjusted = Math.log((p.engagement || 0) + 1) / Math.sqrt(N);

            // Annotate the post_details entry
            p.adjusted_engagement = adjusted;
            p.restaurant_count_in_post = N;

            newTotalEngagement += adjusted;
            totalPostsAnnotated++;
        }

        r.total_engagement = newTotalEngagement;
        totalUpdated++;
    }

    console.log(`Recomputed total_engagement for ${totalUpdated} restaurants`);
    console.log(`Annotated ${totalPostsAnnotated} post_details entries`);

    // Show top 10 by new adjusted engagement
    const top10 = restaurants
        .filter(r => !r._status || (r._status !== 'duplicate_merged' && r._status !== 'rejected'))
        .sort((a, b) => (b.total_engagement || 0) - (a.total_engagement || 0))
        .slice(0, 10);

    console.log('\nTop 10 by adjusted engagement:');
    top10.forEach((r, i) => {
        console.log(`  ${i+1}. ${r.name} — ${(r.total_engagement || 0).toFixed(2)} (${r.mention_count || 0} mentions)`);
    });

    // ── Step 3: Atomic write ─────────────────────────────────────────────────
    const txId = beginTransaction('backfill_adjusted_engagement');
    try {
        db.updated_at = new Date().toISOString();
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

        // Regenerate index
        const { execSync } = require('child_process');
        const indexFile = path.join(projectRoot, 'data', 'restaurant_database_index.json');
        execSync(`node pipeline/06_generate_index.js ${DB_FILE} ${indexFile}`, { cwd: projectRoot, stdio: 'inherit' });

        commitTransaction(txId);
        console.log('\n✅ Backfill complete. Run `npm test` to verify integrity.');
    } catch (e) {
        rollbackTransaction(txId);
        console.error('❌ Failed:', e.message);
        process.exit(1);
    }
}

main();
