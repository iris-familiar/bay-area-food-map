#!/usr/bin/env node
/**
 * scripts/fix_mismatched_places.js — Fix wrong Google Place matches
 *
 * Corrects cases where a restaurant was matched to the wrong Google Place,
 * merging engagement/sources/post_details into the canonical record and
 * marking the wrong record as duplicate_merged.
 *
 * Usage: node scripts/fix_mismatched_places.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { beginTransaction, commitTransaction, DB_FILE } = require('./transaction');

// ─── Fixes to apply ───────────────────────────────────────────────────────────
const fixes = [
    {
        wrongId: 'pipeline_1772067301543_awad',          // 熊猫外卖御食园 (wrong: 1055 Taraval St)
        correctPlaceId: 'ChIJP9HbwPSAhYAR2jzkKhT18MY',  // 御食园 Z&Y Peking Duck (606 Jackson St)
        reason: 'Wrong Google match due to delivery prefix 熊猫外卖',
    },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    let anyChange = false;

    for (const fix of fixes) {
        const wrongIdx = db.restaurants.findIndex(r => r.id === fix.wrongId);
        const canonicalIdx = db.restaurants.findIndex(r => r.google_place_id === fix.correctPlaceId);

        if (wrongIdx === -1) {
            console.log(`⚠️  Wrong record not found: ${fix.wrongId} (already fixed?)`);
            continue;
        }
        if (canonicalIdx === -1) {
            console.error(`❌ Canonical record not found for place_id: ${fix.correctPlaceId}`);
            process.exit(1);
        }

        const wrong = db.restaurants[wrongIdx];
        const canonical = db.restaurants[canonicalIdx];

        console.log(`\nFix: ${wrong.name} → ${canonical.name}`);
        console.log(`  Reason: ${fix.reason}`);
        console.log(`  Wrong engagement: ${wrong.total_engagement}, Canonical engagement: ${canonical.total_engagement}`);

        // Merge engagement + mention count
        canonical.total_engagement = (canonical.total_engagement || 0) + (wrong.total_engagement || 0);
        canonical.mention_count = (canonical.mention_count || 0) + (wrong.mention_count || 0);

        // Merge sources (dedup)
        if (!Array.isArray(canonical.sources)) canonical.sources = [];
        const existingSources = new Set(canonical.sources);
        for (const s of (wrong.sources || [])) {
            if (!existingSources.has(s)) {
                canonical.sources.push(s);
                existingSources.add(s);
            }
        }

        // Merge post_details (dedup by post_id, keep top 10 by engagement)
        if (!Array.isArray(canonical.post_details)) canonical.post_details = [];
        const existingPostIds = new Set(canonical.post_details.map(p => p.post_id));
        for (const p of (wrong.post_details || [])) {
            if (!existingPostIds.has(p.post_id)) {
                canonical.post_details.push(p);
                existingPostIds.add(p.post_id);
            }
        }
        canonical.post_details.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
        canonical.post_details = canonical.post_details.slice(0, 10);

        // Merge recommendations (dedup)
        if (!Array.isArray(canonical.recommendations)) canonical.recommendations = [];
        const existingRecs = new Set(canonical.recommendations.map(r => r.toLowerCase().trim()));
        for (const rec of (wrong.recommendations || [])) {
            if (!existingRecs.has(rec.toLowerCase().trim())) {
                canonical.recommendations.push(rec);
                existingRecs.add(rec.toLowerCase().trim());
            }
        }

        canonical.updated_at = new Date().toISOString();

        // Mark wrong record as merged
        wrong._status = 'duplicate_merged';
        wrong.merged_into = canonical.id;
        wrong.updated_at = new Date().toISOString();

        console.log(`  ✅ Merged → ${canonical.name} (new engagement: ${canonical.total_engagement})`);
        anyChange = true;
    }

    if (!anyChange) {
        console.log('\nNo changes needed.');
        return;
    }

    // Atomic write via transaction
    const txId = beginTransaction('fix_mismatched_places');
    try {
        db.updated_at = new Date().toISOString();
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

        // Regenerate index
        const { execSync } = require('child_process');
        const projectRoot = path.join(__dirname, '..');
        const indexFile = path.join(projectRoot, 'site', 'data', 'restaurant_database_index.json');
        execSync(`node pipeline/06_generate_index.js ${DB_FILE} ${indexFile}`, { cwd: projectRoot, stdio: 'inherit' });

        commitTransaction(txId);
        console.log('\n✅ Done. Run `npm test` to verify integrity.');
    } catch (e) {
        const { rollbackTransaction } = require('./transaction');
        rollbackTransaction(txId);
        console.error('❌ Failed:', e.message);
        process.exit(1);
    }
}

main();
