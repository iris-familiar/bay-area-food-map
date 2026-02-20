#!/usr/bin/env node
/**
 * pipeline/enrich_google.js — Google Places enrichment for unverified restaurants
 *
 * For each restaurant without a confirmed Google Places match, searches the
 * Places API (Text Search), picks the best match by name similarity, and
 * populates: google_place_id, address, google_rating, lat/lng, verified=true
 *
 * Usage:
 *   node pipeline/enrich_google.js                # Enrich up to 10 unverified
 *   node pipeline/enrich_google.js --limit 50     # Enrich up to 50
 *   node pipeline/enrich_google.js --all          # Enrich all unverified
 *   node pipeline/enrich_google.js --dry-run      # Show what would be enriched
 *
 * Requires: GOOGLE_PLACES_API_KEY in environment or .env
 * Cost: ~$0.017 per restaurant (1 Text Search + 1 Place Details call)
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ─── Config ──────────────────────────────────────────────────────────────────
const ROOT    = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'restaurant_database.json');

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const ALL      = args.includes('--all');
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1]
              ?? (args[args.indexOf('--limit') + 1]);
const LIMIT    = ALL ? Infinity : parseInt(limitArg || '10', 10);

const API_KEY  = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY not set. Check .env or environment.');
    process.exit(1);
}

const DELAY_MS = 300; // ~3 requests/sec, well within quota

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
            });
        }).on('error', reject).setTimeout(10000, function() { this.destroy(); reject(new Error('timeout')); });
    });
}

// Normalised Levenshtein similarity (0–1)
function similarity(a, b) {
    a = a.toLowerCase().replace(/\s+/g, '');
    b = b.toLowerCase().replace(/\s+/g, '');
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

// ─── Google Places API ────────────────────────────────────────────────────────
const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

async function searchPlace(restaurant) {
    const query = encodeURIComponent(
        `${restaurant.name} restaurant ${restaurant.city || 'Bay Area'} California`
    );
    const url = `${PLACES_BASE}/textsearch/json?query=${query}&type=restaurant&key=${API_KEY}`;
    const data = await httpsGet(url);

    if (data.status !== 'OK' || !data.results?.length) return null;

    // Pick best match by name similarity
    const best = data.results
        .map(r => ({ ...r, score: similarity(restaurant.name, r.name) }))
        .sort((a, b) => b.score - a.score)[0];

    // Require at least 40% name similarity to avoid false positives
    if (best.score < 0.4) {
        console.log(`  ⚠️  Low confidence match for "${restaurant.name}": "${best.name}" (${(best.score*100).toFixed(0)}%)`);
        return null;
    }

    return best;
}

async function getPlaceDetails(placeId) {
    const fields = 'place_id,name,formatted_address,rating,user_ratings_total,geometry';
    const url = `${PLACES_BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${API_KEY}`;
    const data = await httpsGet(url);
    return data.status === 'OK' ? data.result : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    const unverified = db.restaurants.filter(r =>
        !r.verified
        || !r.google_place_id
        || r.google_place_id === 'placeholder'
        || r.google_place_id === ''
    );

    const targets = unverified.slice(0, LIMIT);
    console.log(`Enriching ${targets.length} of ${unverified.length} unverified restaurants`);
    if (DRY_RUN) {
        targets.forEach(r => console.log(`  Would enrich: ${r.name} (${r.city})`));
        return;
    }

    let enriched = 0;
    let failed   = 0;

    for (const r of targets) {
        process.stdout.write(`  ${r.name} (${r.city})... `);

        try {
            const result = await searchPlace(r);
            if (!result) { console.log('no match'); failed++; continue; }

            const details = await getPlaceDetails(result.place_id);
            if (!details) { console.log('details failed'); failed++; continue; }

            // Update restaurant record
            r.google_place_id = details.place_id;
            r.address         = details.formatted_address || r.address;
            r.google_rating   = details.rating ?? r.google_rating;
            r.verified        = true;
            r.updated_at      = new Date().toISOString();
            if (details.geometry?.location) {
                r.lat = details.geometry.location.lat;
                r.lng = details.geometry.location.lng;
            }

            console.log(`✅ ${details.name} | ⭐ ${details.rating || '-'} | ${details.formatted_address?.split(',')[0]}`);
            enriched++;
        } catch (e) {
            console.log(`error: ${e.message}`);
            failed++;
        }

        await sleep(DELAY_MS);
    }

    // Save if any enriched
    if (enriched > 0) {
        db.updated_at = new Date().toISOString();
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        console.log(`\n✅ Enriched ${enriched} restaurants, ${failed} failed`);
        console.log('Regenerating index...');
        require('./06_generate_index.js'); // Inline call if needed
    } else {
        console.log(`\nNo changes. ${failed} failed.`);
    }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
