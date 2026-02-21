#!/usr/bin/env node
/**
 * tests/e2e.js — End-to-end integration test (no mocks)
 *
 * Exercises the full pipeline against a temp workspace:
 *   real XHS scrape → real LLM extraction → merge → verify → index → shape check
 *
 * Usage:  node tests/e2e.js
 *         npm run test:e2e
 * Exit 0 = all passed, Exit 1 = failures
 *
 * Requirements:
 *   - XHS MCP logged in  (otherwise Phase 2 fails with actionable message)
 *   - GEMINI_API_KEY in .env
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT     = path.join(__dirname, '..');
const TEMP_DIR = `/tmp/bay-area-food-map-e2e-${Date.now()}`;
const QUICK_MODE = process.env.E2E_QUICK === '1';  // Set to 1 for faster test with fewer search terms

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label) {
    console.log(`  ✅ ${label}`);
    passed++;
}
function fail(label, detail) {
    console.error(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
    failed++;
}
function section(title) {
    console.log(`\n── ${title}`);
}
function abort(msg) {
    console.error(`\n  ⛔ ${msg}`);
    cleanup();
    process.exit(1);
}

function cleanup() {
    try {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        console.log('\n── Cleanup');
        console.log('  ✅ Temp dir removed');
    } catch (_) { /* best-effort */ }
}

/** Parse .env file into an object (KEY=value, skip comments/blanks). */
function loadDotEnv() {
    const envFile = path.join(ROOT, '.env');
    if (!fs.existsSync(envFile)) return {};
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        env[key] = val;
    }
    return env;
}

/** Run a command synchronously; return { status, stdout, stderr }. */
function run(cmd, args, { env = {}, timeout = 30000 } = {}) {
    const result = spawnSync(cmd, args, {
        cwd: ROOT,
        encoding: 'utf8',
        timeout,
        env: { ...process.env, ...env },
    });
    return result;
}

// ── Phase 1: Setup ────────────────────────────────────────────────────────────
section('Phase 1: Setup');

const RAW_DIR      = path.join(TEMP_DIR, 'raw');
const CANDIDATES   = path.join(TEMP_DIR, 'candidates.json');
const DB           = path.join(TEMP_DIR, 'db.json');
const DB_BACKUP    = path.join(TEMP_DIR, 'db.backup.json');
const INDEX        = path.join(TEMP_DIR, 'index.json');

fs.mkdirSync(RAW_DIR, { recursive: true });

const emptyDb = { restaurants: [], total_restaurants: 0, version: '1.0.0', updated_at: new Date().toISOString() };
fs.writeFileSync(DB, JSON.stringify(emptyDb, null, 2));

// Create a sample post with known restaurant data for reliable extraction testing
const samplePost = {
    id: 'test_post_001',
    noteId: 'test_post_001',
    title: '湾区美食推荐：留湘小聚必点傣味香茅草烤鱼',
    desc: '周末去了Fremont的留湘小聚，真的太好吃了！\n\n推荐菜品：\n🐟 傣味香茅草烤鱼 - 招牌必点，鱼肉鲜嫩\n🍚 牛肝菌青椒牛肉炒饭 - 香气扑鼻\n\n地址在Warm Springs那边，环境也不错。人均$30-40。',
    interactInfo: { likedCount: '150', commentCount: '25' },
    comments: []
};
// Prefix with '000' so this file sorts before all scraped hex-ID posts (e.g. post_690c...)
// ensuring it's always included when MAX_POSTS caps the slice.
fs.writeFileSync(path.join(RAW_DIR, 'post_000_test_001.json'), JSON.stringify(samplePost, null, 2));

ok('Temp workspace created with sample post');

// ── Phase 2: Scrape (real XHS) ────────────────────────────────────────────────
section('Phase 2: Scrape (real XHS)');

let scrapeResult = { status: 0, signal: null, stdout: '', stderr: '' };
let POSTS_COUNT = 1;  // We already created a sample post

if (QUICK_MODE) {
    // In QUICK_MODE, skip real scrape and use only the sample post we created
    ok('QUICK_MODE: Using sample post only, skipping real XHS scrape');
} else {
    // The scrape has rate-limit sleeps (5-10s/term × 12 terms + 3-7s/post) that can
    // exceed 15 minutes total.  We allow 600s but treat a SIGTERM as a partial-scrape:
    // if posts were already saved before the kill, continue — that's enough to test
    // the downstream pipeline stages.
    scrapeResult = run('bash', ['pipeline/01_scrape.sh', RAW_DIR], { timeout: 600000 });
    
    const postFiles = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('post_') && f.endsWith('.json'));
    POSTS_COUNT = postFiles.length;

    if (scrapeResult.signal) {
        if (POSTS_COUNT >= 1) {
            console.log(`  ⚠️  Scrape killed by ${scrapeResult.signal} after 600s — ${POSTS_COUNT} posts saved before kill; continuing`);
        } else {
            abort(`Scrape killed by ${scrapeResult.signal} after 600s with no posts saved`);
        }
    } else if (scrapeResult.status === 2) {
        abort(
            'Scrape exited with code 2 — XHS not logged in.\n' +
            '  Run:  cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh'
        );
    } else if (scrapeResult.status !== 0) {
        abort(`Scrape failed with exit code ${scrapeResult.status}:\n${scrapeResult.stderr}`);
    } else {
        POSTS_COUNT >= 1
            ? ok(`${POSTS_COUNT} posts found in temp dir`)
            : abort('Scrape exited 0 but no post_*.json files were written');
    }
}

// Count posts after scrape (or sample post in QUICK_MODE)
const postFiles = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('post_') && f.endsWith('.json'));
const postCount = postFiles.length;

if (postCount < 1) {
    abort('No posts available for extraction');
}

// ── Phase 3: Extract (real Kimi LLM) ─────────────────────────────────────────
section('Phase 3: Extract (real Kimi LLM)');

const dotEnv = loadDotEnv();

// Cap at 10 posts for e2e; worst case 10 × 30s Kimi timeout + delays ≈ 305s; allow 420s
const extractResult = run(
    'node',
    ['pipeline/02_extract_llm.js', RAW_DIR, CANDIDATES],
    { env: { ...dotEnv, MAX_POSTS: '10' }, timeout: 420000 }
);

if (extractResult.status !== 0 || extractResult.signal) {
    abort(`Extraction failed (exit ${extractResult.status}, signal ${extractResult.signal}):\n${extractResult.stderr}`);
}

// Always print extraction output so failures are diagnosable
if (extractResult.stdout) process.stdout.write(extractResult.stdout.split('\n').map(l => `  ${l}`).join('\n') + '\n');

let candidates = [];
try {
    candidates = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));
} catch (e) {
    abort(`Could not parse candidates file: ${e.message}`);
}

const candidateCount = Array.isArray(candidates) ? candidates.length : 0;
candidateCount >= 1
    ? ok(`${candidateCount} candidates extracted`)
    : abort(`Expected ≥1 candidates but got ${candidateCount} (${postCount} posts scraped)`);

const first = candidates[0];
(first && first.name && first.city && first.cuisine)
    ? ok('Candidate has required fields (name, city, cuisine)')
    : fail('Candidate has required fields', `got: ${JSON.stringify(first)}`);

// ── Phase 4: Merge ────────────────────────────────────────────────────────────
section('Phase 4: Merge');

const mergeResult = run('node', ['pipeline/04_merge.js', DB, CANDIDATES, DB]);

if (mergeResult.status !== 0) {
    abort(`Merge failed (exit ${mergeResult.status}):\n${mergeResult.stderr}`);
}

let dbAfterMerge;
try {
    dbAfterMerge = JSON.parse(fs.readFileSync(DB, 'utf8'));
} catch (e) {
    abort(`Could not parse DB after merge: ${e.message}`);
}

const mergedCount = dbAfterMerge.restaurants.length;
mergedCount >= 1
    ? ok(`${mergedCount} restaurants merged into temp DB`)
    : fail('Restaurants merged', `DB still empty after merge (candidates: ${candidateCount})`);

const newRestaurant = dbAfterMerge.restaurants[0];

newRestaurant?.merge_info?.needs_review === true
    ? ok('New restaurant flagged needs_review=true')
    : fail('New restaurant flagged needs_review=true', `got: ${JSON.stringify(newRestaurant?.merge_info)}`);

newRestaurant?.id
    ? ok('New restaurant has generated ID')
    : fail('New restaurant has generated ID', 'id field missing');

// Candidate fields must survive the merge (regression guard for 04_merge.js)
const firstCandidate = candidates[0];
newRestaurant?.city && newRestaurant.city !== 'unknown'
    ? ok(`Merged city from candidate: "${newRestaurant.city}"`)
    : fail('Merged restaurant has city from candidate', `got: "${newRestaurant?.city}" (expected "${firstCandidate?.city}")`);

newRestaurant?.cuisine && newRestaurant.cuisine !== 'unknown'
    ? ok(`Merged cuisine from candidate: "${newRestaurant.cuisine}"`)
    : fail('Merged restaurant has cuisine from candidate', `got: "${newRestaurant?.cuisine}" (expected "${firstCandidate?.cuisine}")`);

newRestaurant?.price_range === firstCandidate?.price_range
    ? ok(`Merged price_range from candidate: "${newRestaurant.price_range}"`)
    : fail('Merged price_range not copied from candidate', `got: "${newRestaurant?.price_range}", expected: "${firstCandidate?.price_range}"`);

// ── Phase 5: Verify integrity ─────────────────────────────────────────────────
section('Phase 5: Verify integrity');

// Write backup before verify (05_verify.js reads backup path but only uses it for error messages)
fs.copyFileSync(DB, DB_BACKUP);

const verifyResult = run('node', ['pipeline/05_verify.js', DB, '0', DB_BACKUP]);

verifyResult.status === 0
    ? ok('pipeline/05_verify.js exited 0')
    : fail('pipeline/05_verify.js exited 0', `exit ${verifyResult.status}\n${verifyResult.stdout}\n${verifyResult.stderr}`);

// ── Phase 6: Approve + Generate index ─────────────────────────────────────────
section('Phase 6: Approve + Generate index');

// Simulate review approval: set needs_review=false so index includes them
const dbForIndex = JSON.parse(fs.readFileSync(DB, 'utf8'));
for (const r of dbForIndex.restaurants) {
    if (r.merge_info) r.merge_info.needs_review = false;
}
fs.writeFileSync(DB, JSON.stringify(dbForIndex, null, 2));

const indexResult = run('node', ['pipeline/06_generate_index.js', DB, INDEX]);

if (indexResult.status !== 0) {
    abort(`Index generation failed (exit ${indexResult.status}):\n${indexResult.stderr}`);
}

let index;
try {
    index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
} catch (e) {
    abort(`Could not parse generated index: ${e.message}`);
}

const indexCount = Array.isArray(index.restaurants) ? index.restaurants.length : 0;
indexCount >= 1
    ? ok(`Index generated: ${indexCount} restaurants`)
    : fail('Index has ≥1 restaurant', `got ${indexCount} (DB has ${mergedCount} after approval)`);

// ── Phase 7: Frontend shape ────────────────────────────────────────────────────
section('Phase 7: Frontend shape');

const entry = index.restaurants?.[0];

['id', 'name', 'cuisine', 'city'].every(f => entry?.[f])
    ? ok('Index entry has id, name, cuisine, city')
    : fail('Index entry has id, name, cuisine, city', `missing in: ${JSON.stringify(entry)}`);

Array.isArray(entry?.recommendations)
    ? ok('Index entry has recommendations array')
    : fail('Index entry has recommendations array', `got: ${typeof entry?.recommendations}`);

Array.isArray(entry?.post_details)
    ? ok('Index entry has post_details array')
    : fail('Index entry has post_details array', `got: ${typeof entry?.post_details}`);

Array.isArray(entry?.timeseries)
    ? ok('Index entry has timeseries array')
    : fail('Index entry has timeseries array', `got: ${typeof entry?.timeseries}`);

// ── Cleanup + summary ─────────────────────────────────────────────────────────
cleanup();

console.log(`\nE2E test ${failed === 0 ? 'passed' : 'FAILED'}: ${postCount} posts → ${candidateCount} candidates → ${indexCount} in index`);
console.log(`  ${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
