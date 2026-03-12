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

const fs   = require('fs');
const path = require('path');
const {
    sleep, httpsGet, nameSimilarity: similarity, hasCJK,
    cityToRegion, extractCityFromAddress, addressInCity,
    PLACES_BASE,
} = require('./utils');

// ─── Config ──────────────────────────────────────────────────────────────────
const ROOT    = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'site', 'data', 'restaurant_database.json');

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

// ─── Google Places API ────────────────────────────────────────────────────────

async function searchPlace(restaurant) {
    const query = encodeURIComponent(
        `${restaurant.name} restaurant ${restaurant.city || 'Bay Area'} California`
    );
    const url = `${PLACES_BASE}/textsearch/json?query=${query}&type=restaurant&key=${API_KEY}`;
    const data = await httpsGet(url);

    if (data.status !== 'OK' || !data.results?.length) return null;

    const isCJK = hasCJK(restaurant.name);
    const results = data.results.map(r => ({ ...r, score: similarity(restaurant.name, r.name) }));

    // For CJK names: trust Google's top result if it's in the same city
    if (isCJK && restaurant.city) {
        const top = results[0];
        if (addressInCity(top.formatted_address, restaurant.city)) {
            return top;
        }
    }

    // For non-CJK names: pick best by similarity
    const best = results.sort((a, b) => b.score - a.score)[0];

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

    // Build place_id → restaurant map for O(1) duplicate detection
    const placeIdMap = new Map(
        db.restaurants
            .filter(r => r.google_place_id && r._status !== 'duplicate_merged')
            .map(r => [r.google_place_id, r])
    );

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

            // Check if this place_id already exists in another restaurant (O(1) lookup)
            const _existing = placeIdMap.get(details.place_id);
            const existingWithSamePlaceId = _existing && _existing.id !== r.id ? _existing : null;

            if (existingWithSamePlaceId) {
                console.log(`⚠️  Duplicate: ${r.name} → already exists as ${existingWithSamePlaceId.name}`);

                // Merge this restaurant INTO the existing one
                existingWithSamePlaceId.total_engagement = (existingWithSamePlaceId.total_engagement || 0) + (r.total_engagement || 0);
                existingWithSamePlaceId.mention_count = (existingWithSamePlaceId.mention_count || 0) + (r.mention_count || 0);

                if (r.sources) {
                    if (!existingWithSamePlaceId.sources) existingWithSamePlaceId.sources = [];
                    for (const s of r.sources) {
                        if (!existingWithSamePlaceId.sources.includes(s)) existingWithSamePlaceId.sources.push(s);
                    }
                }

                if (r.recommendations) {
                    if (!existingWithSamePlaceId.recommendations) existingWithSamePlaceId.recommendations = [];
                    const existing = new Set(existingWithSamePlaceId.recommendations.map(d =>
                        typeof d === 'string' ? d.toLowerCase() : (d.name || d.dish || '').toLowerCase()
                    ));
                    for (const dish of r.recommendations) {
                        const key = typeof dish === 'string' ? dish.toLowerCase() : (dish.name || dish.dish || '').toLowerCase();
                        if (!existing.has(key)) {
                            existingWithSamePlaceId.recommendations.push(dish);
                            existing.add(key);
                        }
                    }
                }

                // Mark this one as merged
                r._status = 'duplicate_merged';
                r.merged_into = existingWithSamePlaceId.id;
                enriched++; // Count as processed successfully

                await sleep(DELAY_MS);
                continue;
            }

            // Update restaurant record
            r.google_place_id = details.place_id;
            placeIdMap.set(details.place_id, r); // Keep map current for subsequent iterations
            r.address         = details.formatted_address || r.address;
            const googleCity = extractCityFromAddress(details.formatted_address);
            if (googleCity && googleCity.toLowerCase() !== (r.city || '').toLowerCase()) {
                console.log(`  (city corrected: ${r.city || 'unknown'} → ${googleCity})`);
                r.city   = googleCity;
                r.area   = googleCity;
                r.region = cityToRegion(googleCity);
            }
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
        const { execSync } = require('child_process');
        const indexPath = path.join(ROOT, 'site', 'data', 'restaurant_database_index.json');
        execSync(`node "${path.join(__dirname, '06_generate_index.js')}" "${DB_FILE}" "${indexPath}"`, { stdio: 'inherit' });
    } else {
        console.log(`\nNo changes. ${failed} failed.`);
    }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
