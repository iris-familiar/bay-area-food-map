#!/usr/bin/env node
/**
 * scripts/backfill_regions.js — Backfill region (and area) for restaurants added by pipeline
 *
 * pipeline/04_merge.js previously hardcoded region: 'unknown' for all new restaurants.
 * This script derives region from city using the same CITY_TO_REGION map now used in 04_merge.js.
 *
 * Safe to re-run (idempotent): only updates restaurants where region === 'unknown'.
 *
 * Usage: node scripts/backfill_regions.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { beginTransaction, commitTransaction, rollbackTransaction, DB_FILE } = require('./transaction');

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

function main() {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const restaurants = db.restaurants;

    let updated = 0;
    let stillUnknown = 0;
    const unmappedCities = new Set();

    for (const r of restaurants) {
        if (r.region !== 'unknown') continue;  // Already has a region — skip

        const mapped = cityToRegion(r.city);
        if (mapped !== 'unknown') {
            r.region = mapped;
            // Also fix area if it's still 'unknown' and city is available
            if (r.area === 'unknown' && r.city && r.city !== 'unknown') {
                r.area = r.city;
            }
            updated++;
        } else {
            stillUnknown++;
            if (r.city && r.city !== 'unknown') {
                unmappedCities.add(r.city);
            }
        }
    }

    console.log(`Updated: ${updated} restaurants now have a region`);
    console.log(`Still unknown: ${stillUnknown} (city not in map or city is 'unknown')`);

    if (unmappedCities.size > 0) {
        const sorted = [...unmappedCities].sort();
        console.log(`\nCities not in CITY_TO_REGION map (${unmappedCities.size}):`);
        sorted.forEach(c => console.log(`  - ${c}`));
    }

    // ── Atomic write ─────────────────────────────────────────────────────────
    const txId = beginTransaction('backfill_regions');
    try {
        db.updated_at = new Date().toISOString();
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

        // Regenerate index
        const { execSync } = require('child_process');
        const projectRoot = path.join(__dirname, '..');
        const indexFile = path.join(projectRoot, 'data', 'restaurant_database_index.json');
        execSync(`node pipeline/06_generate_index.js ${DB_FILE} ${indexFile}`, { cwd: projectRoot, stdio: 'inherit' });

        commitTransaction(txId);
        console.log('\nBackfill complete. Run `npm test` to verify integrity.');
    } catch (e) {
        rollbackTransaction(txId);
        console.error('Failed:', e.message);
        process.exit(1);
    }
}

main();
