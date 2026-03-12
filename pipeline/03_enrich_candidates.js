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

const fs = require('fs');
const { normalizeRestaurantName } = require('./normalize_name');
const {
    sleep, httpsGet, nameSimilarity: similarity, hasCJK,
    BAY_AREA_CITIES, extractCityFromAddress, addressInBayArea, addressInCity,
    PLACES_BASE,
} = require('./utils');

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

// ─── Delivery prefix stripping ────────────────────────────────────────────────
// Removes delivery app prefixes that confuse Google Places text search
// e.g. "熊猫外卖御食园" → "御食园"
const DELIVERY_PREFIXES = ['熊猫外卖', '美团外卖', '饿了么外卖', '饿了么', '美团', '熊猫'];

function stripDeliveryPrefix(name) {
    for (const prefix of DELIVERY_PREFIXES) {
        if (name.startsWith(prefix)) {
            const stripped = name.slice(prefix.length).trim();
            if (stripped.length > 0) return stripped;
        }
    }
    return name;
}

// ─── Google Places API ────────────────────────────────────────────────────────
async function searchPlace(candidate) {
    const isCJK = hasCJK(candidate.name);
    const hasValidCity = candidate.city && candidate.city !== 'unknown' && candidate.city !== 'Bay Area';

    // Strip delivery prefixes before searching (e.g. "熊猫外卖御食园" → "御食园")
    const searchName = stripDeliveryPrefix(candidate.name);

    // First attempt: with city
    let query = hasValidCity
        ? `${searchName} restaurant ${candidate.city} California`
        : `${searchName} restaurant Bay Area California`;

    let data = await httpsGet(`${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${API_KEY}`);

    // Fallback: search without location if no results and had city
    if (data.status !== 'OK' && hasValidCity) {
        console.log(`  (retrying without city)...`);
        query = `${searchName} restaurant California`;
        data = await httpsGet(`${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${API_KEY}`);
        await sleep(DELAY_MS);
    }

    // Fallback for unknown-city: try broader California search
    if (data.status !== 'OK' && !hasValidCity) {
        console.log(`  (retrying unknown-city with California)...`);
        query = `${searchName} restaurant California`;
        data = await httpsGet(`${PLACES_BASE}/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${API_KEY}`);
        await sleep(DELAY_MS);
    }

    if (data.status !== 'OK' || !data.results?.length) return null;

    const results = data.results.map(r => ({ ...r, score: similarity(searchName, r.name) }));

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

    // Lower threshold for CJK names (30%) vs non-CJK (80%)
    const threshold = isCJK ? 0.30 : 0.80;
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
            candidate.google_name     = details.name || '';
            candidate.name            = normalizeRestaurantName(candidate.name, details.name);
            candidate.address         = details.formatted_address || candidate.address;
            const googleCity = extractCityFromAddress(details.formatted_address);
            if (googleCity && googleCity.toLowerCase() !== (candidate.city || '').toLowerCase()) {
                console.log(`  (city corrected: ${candidate.city || 'unknown'} → ${googleCity})`);
                candidate.city = googleCity;
            }
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
