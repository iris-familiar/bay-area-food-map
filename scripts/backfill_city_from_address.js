#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { beginTransaction, commitTransaction, rollbackTransaction, DB_FILE } = require('./transaction');

const DRY_RUN = process.argv.includes('--dry-run');
const projectRoot = path.join(__dirname, '..');

const BAY_AREA_CITIES = new Set([
    'cupertino', 'milpitas', 'fremont', 'mountain view', 'sunnyvale', 'san jose',
    'palo alto', 'santa clara', 'san mateo', 'foster city', 'redwood city',
    'menlo park', 'union city', 'newark', 'hayward', 'san francisco', 'daly city',
    'san leandro', 'pleasanton', 'livermore', 'dublin', 'walnut creek', 'berkeley',
    'oakland', 'san ramon', 'millbrae', 'san bruno', 'campbell', 'burlingame',
    'south san francisco', 'albany', 'pleasant hill', 'san carlos', 'belmont',
    'emeryville',
]);

const CITY_TO_REGION = {
    'san jose': 'South Bay', 'cupertino': 'South Bay', 'sunnyvale': 'South Bay',
    'mountain view': 'South Bay', 'santa clara': 'South Bay', 'milpitas': 'South Bay',
    'campbell': 'South Bay',
    'palo alto': 'Peninsula', 'san mateo': 'Peninsula', 'millbrae': 'Peninsula',
    'menlo park': 'Peninsula', 'san carlos': 'Peninsula', 'burlingame': 'Peninsula',
    'redwood city': 'Peninsula', 'south san francisco': 'Peninsula',
    'san bruno': 'Peninsula', 'belmont': 'Peninsula', 'daly city': 'Peninsula',
    'foster city': 'Peninsula',
    'fremont': 'East Bay', 'oakland': 'East Bay', 'berkeley': 'East Bay',
    'newark': 'East Bay', 'hayward': 'East Bay', 'union city': 'East Bay',
    'san leandro': 'East Bay', 'albany': 'East Bay', 'dublin': 'East Bay',
    'pleasanton': 'East Bay', 'walnut creek': 'East Bay', 'pleasant hill': 'East Bay',
    'emeryville': 'East Bay', 'livermore': 'East Bay', 'san ramon': 'East Bay',
    'san francisco': 'San Francisco', 'sf': 'San Francisco',
};

function cityToRegion(city) {
    if (!city || city === 'unknown') return 'unknown';
    return CITY_TO_REGION[city.toLowerCase()] || 'unknown';
}

function extractCityFromAddress(formattedAddress) {
    if (!formattedAddress) return null;
    const parts = formattedAddress.split(', ');
    if (parts.length < 4 || parts[parts.length - 1] !== 'USA') return null;
    const cityCandidate = parts[parts.length - 3];
    if (BAY_AREA_CITIES.has(cityCandidate.toLowerCase())) return cityCandidate;
    return null;
}

function main() {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    let updated = 0, skipped = 0;

    for (const r of db.restaurants) {
        if (r._status === 'duplicate_merged' || r._status === 'rejected') { skipped++; continue; }
        if (!r.address) { skipped++; continue; }

        const googleCity = extractCityFromAddress(r.address);
        if (!googleCity) { skipped++; continue; }
        if (googleCity.toLowerCase() === (r.city || '').toLowerCase()) { skipped++; continue; }

        const newRegion = cityToRegion(googleCity);
        console.log(`  ${r.name}: ${r.city || 'unknown'} → ${googleCity} (region: ${r.region || 'unknown'} → ${newRegion})`);

        if (!DRY_RUN) {
            r.city   = googleCity;
            r.area   = googleCity;
            r.region = newRegion;
        }
        updated++;
    }

    console.log(`\nUpdated: ${updated} | Skipped: ${skipped}`);
    if (DRY_RUN) { console.log('[dry-run] No changes written.'); return; }
    if (updated === 0) { console.log('No changes needed.'); return; }

    const txId = beginTransaction('backfill_city_from_address');
    try {
        db.updated_at = new Date().toISOString();
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        const { execSync } = require('child_process');
        const indexFile = path.join(projectRoot, 'data', 'restaurant_database_index.json');
        execSync(`node pipeline/06_generate_index.js ${DB_FILE} ${indexFile}`, { cwd: projectRoot, stdio: 'inherit' });
        commitTransaction(txId);
        console.log('Done. Run `npm test` to verify.');
    } catch (e) {
        rollbackTransaction(txId);
        console.error('Failed:', e.message);
        process.exit(1);
    }
}

main();
