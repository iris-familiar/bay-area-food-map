#!/usr/bin/env node
/**
 * pipeline/03_enrich_candidates.js — Google Places enrichment for LLM candidates
 *
 * For each candidate extracted from XHS posts, searches Google Places API
 * and enriches with: google_place_id, address, google_rating, lat/lng, verified=true
 *
 * Candidates that fail enrichment are marked with enrichment_failed=true and
 * will be skipped during the merge step.
 *
 * Usage:
 *   node pipeline/03_enrich_candidates.js <candidates_file>
 *   node pipeline/03_enrich_candidates.js data/candidates/2026-02-21.json
 *
 * Requires: GOOGLE_PLACES_API_KEY in environment or .env
 * Cost: ~$0.017 per restaurant (1 Text Search + 1 Place Details call)
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ─── Load .env (if not already set) ──────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2];
        }
    });
}

// ─── Config ──────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const CANDIDATES_FILE = args[0];

if (!CANDIDATES_FILE) {
    console.error('Usage: node 03_enrich_candidates.js <candidates_file>');
    process.exit(1);
}

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

// Check if string contains CJK characters (Chinese, Japanese, Korean)
function hasCJK(str) {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(str);
}

const BAY_AREA_CITIES = new Set([
    'cupertino', 'milpitas', 'fremont', 'mountain view', 'sunnyvale', 'san jose',
    'palo alto', 'santa clara', 'san mateo', 'foster city', 'redwood city',
    'menlo park', 'union city', 'newark', 'hayward', 'san francisco', 'daly city',
    'san leandro', 'pleasanton', 'livermore', 'dublin', 'walnut creek', 'berkeley',
    'oakland', 'san ramon', 'millbrae', 'san bruno', 'campbell', 'burlingame',
    'south san francisco', 'albany', 'pleasant hill', 'san carlos', 'belmont',
]);

function addressInBayArea(address) {
    if (!address) return false;
    const addr = address.toLowerCase();
    return [...BAY_AREA_CITIES].some(c => addr.includes(c));
}

// Check if address contains the target city
function addressInCity(address, city) {
    if (!address || !city) return false;
    const addr = address.toLowerCase();
    const c = city.toLowerCase();
    return addr.includes(c);
}

// ─── Google Places API ────────────────────────────────────────────────────────
const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

async function searchPlace(candidate) {
    const isCJK = hasCJK(candidate.name);
    const hasValidCity = candidate.city && candidate.city !== 'unknown' && candidate.city !== 'Bay Area';

    // First attempt: with city
    let query = hasValidCity
        ? `${candidate.name} restaurant ${candidate.city} California`
        : `${candidate.name} restaurant Bay Area California`;

    let data = await httpsGet(`${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${API_KEY}`);

    // Fallback: search without location if no results and had city
    if (data.status !== 'OK' && hasValidCity) {
        console.log(`  (retrying without city)...`);
        query = `${candidate.name} restaurant California`;
        data = await httpsGet(`${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${API_KEY}`);
        await sleep(DELAY_MS);
    }

    // Fallback for unknown-city: try broader California search
    if (data.status !== 'OK' && !hasValidCity) {
        console.log(`  (retrying unknown-city with California)...`);
        query = `${candidate.name} restaurant California`;
        data = await httpsGet(`${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${API_KEY}`);
        await sleep(DELAY_MS);
    }

    if (data.status !== 'OK' || !data.results?.length) return null;

    const results = data.results.map(r => ({ ...r, score: similarity(candidate.name, r.name) }));

    // For CJK names: trust top result if in same city (or Bay Area for unknown-city)
    if (isCJK) {
        const top = results[0];
        const cityMatch = hasValidCity
            ? addressInCity(top.formatted_address, candidate.city)
            : addressInBayArea(top.formatted_address);
        if (cityMatch) return top;
    }

    // Pick best by similarity
    const best = results.sort((a, b) => b.score - a.score)[0];

    // Lower threshold for CJK names (30%) vs non-CJK (40%)
    const threshold = isCJK ? 0.30 : 0.40;
    if (best.score < threshold) {
        console.log(`  ⚠️  Low confidence for "${candidate.name}": "${best.name}" (${(best.score*100).toFixed(0)}%)`);
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
    let candidates = [];
    try {
        candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
    } catch (e) {
        console.log('No candidates file or empty. Nothing to enrich.');
        process.exit(0);
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
        console.log('No candidates to enrich.');
        process.exit(0);
    }

    console.log(`Enriching ${candidates.length} candidates with Google Places data`);

    let enriched = 0;
    let failed   = 0;
    let skipped  = 0;

    for (const candidate of candidates) {
        // Skip if already enriched (idempotency)
        if (candidate.google_place_id && candidate.verified) {
            skipped++;
            continue;
        }

        // Skip if name is too short/long
        if (!candidate.name || candidate.name.length < 2 || candidate.name.length > 30) {
            candidate.enrichment_failed = true;
            candidate.enrichment_reason = 'invalid_name';
            skipped++;
            continue;
        }

        process.stdout.write(`  ${candidate.name} (${candidate.city || 'unknown'})... `);

        try {
            const result = await searchPlace(candidate);
            if (!result) {
                console.log('no match');
                candidate.enrichment_failed = true;
                candidate.enrichment_reason = 'no_match';
                failed++;
                await sleep(DELAY_MS);
                continue;
            }

            const details = await getPlaceDetails(result.place_id);
            if (!details) {
                console.log('details failed');
                candidate.enrichment_failed = true;
                candidate.enrichment_reason = 'details_failed';
                failed++;
                await sleep(DELAY_MS);
                continue;
            }

            // Enrich candidate with Google data
            candidate.google_place_id = details.place_id;
            candidate.address         = details.formatted_address || candidate.address;
            candidate.google_rating   = details.rating ?? null;
            candidate.verified        = true;
            if (details.geometry?.location) {
                candidate.lat = details.geometry.location.lat;
                candidate.lng = details.geometry.location.lng;
            }

            // Clear any previous failure markers
            delete candidate.enrichment_failed;
            delete candidate.enrichment_reason;

            console.log(`✅ ${details.name} | ⭐ ${details.rating || '-'} | ${details.formatted_address?.split(',')[0]}`);
            enriched++;
        } catch (e) {
            console.log(`error: ${e.message}`);
            candidate.enrichment_failed = true;
            candidate.enrichment_reason = `error: ${e.message}`;
            failed++;
        }

        await sleep(DELAY_MS);
    }

    // Save enriched candidates back to file
    fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(candidates, null, 2));
    console.log(`\n✅ Enriched ${enriched} candidates, ${failed} failed, ${skipped} skipped`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
