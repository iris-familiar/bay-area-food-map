#!/usr/bin/env node
/**
 * scripts/backfill_names.js — Normalize names for all existing restaurants
 *
 * For each restaurant with a google_place_id, fetches the Google Places name
 * and applies normalizeRestaurantName() to produce canonical format:
 *   "[Chinese name] [English name]"
 *
 * Skips restaurants where corrections.json has a `name` override.
 *
 * Usage: node scripts/backfill_names.js [--dry-run]
 * Requires: GOOGLE_PLACES_API_KEY in environment or .env
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { beginTransaction, commitTransaction, rollbackTransaction, DB_FILE } = require('./transaction');
const { normalizeRestaurantName } = require('../pipeline/normalize_name');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    });
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY not set. Check .env or environment.');
    process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';
const DELAY_MS = 100; // 10 req/s (Places API default limit)
const projectRoot = path.join(__dirname, '..');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse: ' + data.slice(0, 100))); }
            });
        }).on('error', reject).setTimeout(10000, function() { this.destroy(); reject(new Error('timeout')); });
    });
}

async function getGoogleName(placeId) {
    const url = `${PLACES_BASE}/details/json?place_id=${placeId}&fields=name&key=${API_KEY}`;
    const data = await httpsGet(url);
    if (data.status === 'OK' && data.result?.name) return data.result.name;
    return null;
}

async function main() {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    const restaurants = db.restaurants;

    // Load corrections.json — restaurants with a name override are skipped
    const correctionsFile = path.join(projectRoot, 'data', 'corrections.json');
    let correctionNameOverrides = new Set();
    try {
        const corrections = JSON.parse(fs.readFileSync(correctionsFile, 'utf8'));
        for (const entry of corrections) {
            if (entry.corrections && entry.corrections.name) {
                correctionNameOverrides.add(entry.id);
            }
        }
        if (correctionNameOverrides.size > 0) {
            console.log(`Skipping ${correctionNameOverrides.size} restaurant(s) with name corrections`);
        }
    } catch (e) { /* no corrections file is fine */ }

    // Filter: only restaurants with a google_place_id that aren't correction-overridden
    const candidates = restaurants.filter(r =>
        r.google_place_id &&
        r._status !== 'duplicate_merged' &&
        r._status !== 'rejected' &&
        !correctionNameOverrides.has(r.id)
    );

    console.log(`Processing ${candidates.length} / ${restaurants.length} restaurants`);
    if (DRY_RUN) console.log('(DRY RUN — no changes will be written)');

    let changed = 0;
    let unchanged = 0;
    let failed = 0;

    for (let i = 0; i < candidates.length; i++) {
        const r = candidates[i];

        process.stdout.write(`[${i+1}/${candidates.length}] ${r.name}... `);

        try {
            const googleName = await getGoogleName(r.google_place_id);
            if (!googleName) {
                console.log('API failed (no name returned)');
                failed++;
                await sleep(DELAY_MS);
                continue;
            }

            const oldName = r.name;
            const newName = normalizeRestaurantName(r.name, googleName);

            // Store google_name for reference
            r.google_name = googleName;

            if (newName !== oldName) {
                console.log(`${oldName} → ${newName}`);
                r.name = newName;
                changed++;
            } else {
                console.log(`unchanged (${newName})`);
                unchanged++;
            }
        } catch (e) {
            console.log(`error: ${e.message}`);
            failed++;
        }

        await sleep(DELAY_MS);
    }

    console.log(`\nSummary: ${changed} changed, ${unchanged} unchanged, ${failed} failed`);

    if (DRY_RUN) {
        console.log('Dry run — exiting without writing.');
        return;
    }

    if (changed === 0 && failed === 0) {
        console.log('No changes to write.');
        return;
    }

    // Atomic write
    const txId = beginTransaction('backfill_names');
    try {
        db.updated_at = new Date().toISOString();
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

        // Regenerate slim index
        const { execSync } = require('child_process');
        const indexFile = path.join(projectRoot, 'data', 'restaurant_database_index.json');
        execSync(`node pipeline/06_generate_index.js ${DB_FILE} ${indexFile}`, {
            cwd: projectRoot,
            stdio: 'inherit'
        });

        commitTransaction(txId);
        console.log('\n✅ Backfill complete. Run `npm test` to verify integrity.');
    } catch (e) {
        rollbackTransaction(txId);
        console.error('❌ Failed:', e.message);
        process.exit(1);
    }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
