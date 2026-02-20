#!/usr/bin/env node
/**
 * tests/verify.js — Functional verification of the project
 *
 * Tests what actually matters:
 *   1. Database integrity
 *   2. Frontend index is consistent with full DB
 *   3. Pipeline dry-run completes without error
 *   4. Pipeline state file is written correctly
 *
 * Usage:  node tests/verify.js
 *         npm test
 * Exit 0 = all passed, Exit 1 = failures
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DB   = path.join(ROOT, 'data', 'restaurant_database.json');
const IDX  = path.join(ROOT, 'data', 'restaurant_database_index.json');
const STATE = path.join(ROOT, 'data', '.pipeline_state.json');

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

// ─── 1. Database integrity ────────────────────────────────────────────────────
section('Database integrity');

let db;
try {
    db = JSON.parse(fs.readFileSync(DB, 'utf8'));
    ok('restaurant_database.json is valid JSON');
} catch (e) {
    fail('restaurant_database.json is valid JSON', e.message);
    process.exit(1);
}

const count = Array.isArray(db.restaurants) ? db.restaurants.length : 0;
count > 0
    ? ok(`Has ${count} restaurants (>0)`)
    : fail('Has restaurants', 'array is empty');

db.restaurants.every(r => r.name && r.name.trim())
    ? ok('All restaurants have non-empty names')
    : fail('All restaurants have names', 'some are missing');

db.restaurants.every(r => r.id)
    ? ok('All restaurants have IDs')
    : fail('All restaurants have IDs', 'some are missing');

const ids = db.restaurants.map(r => r.id);
ids.length === new Set(ids).size
    ? ok('All IDs are unique')
    : fail('All IDs are unique', 'duplicates found');

// ─── 2. Frontend index consistency ───────────────────────────────────────────
section('Frontend index');

let idx;
try {
    idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
    ok('restaurant_database_index.json is valid JSON');
} catch (e) {
    fail('restaurant_database_index.json exists and is valid', e.message);
    idx = null;
}

if (idx) {
    const idxCount = Array.isArray(idx.restaurants) ? idx.restaurants.length : 0;
    idxCount <= count
        ? ok(`Index count (${idxCount}) ≤ full DB count (${count})`)
        : fail('Index count', `index (${idxCount}) > full DB (${count})`);

    const idxSize = fs.statSync(IDX).size;
    const dbSize  = fs.statSync(DB).size;
    idxSize < dbSize
        ? ok(`Index (${(idxSize/1024).toFixed(0)}KB) is smaller than full DB (${(dbSize/1024).toFixed(0)}KB)`)
        : fail('Index is smaller than full DB');
}

// ─── 3. Pipeline scripts exist and are executable ────────────────────────────
section('Pipeline structure');

const REQUIRED_FILES = [
    'pipeline/run.sh',
    'pipeline/01_scrape.sh',
    'pipeline/02_extract_llm.js',
    'pipeline/03_update_metrics.js',
    'pipeline/04_merge.js',
    'pipeline/05_verify.js',
    'pipeline/06_generate_index.js',
    'pipeline/07_commit.sh',
    'pipeline/review.js',
    'pipeline/enrich_google.js',
    'src/app.js',
    'src/styles.css',
    'config.sh',
    'scripts/apply_corrections.js',
    'scripts/transaction.js',
];

for (const f of REQUIRED_FILES) {
    fs.existsSync(path.join(ROOT, f))
        ? ok(`${f} exists`)
        : fail(`${f} exists`, 'missing');
}

// ─── 4. Pipeline dry-run ─────────────────────────────────────────────────────
section('Pipeline dry-run');

try {
    // Source .env for GEMINI_API_KEY etc
    const envSource = fs.existsSync(path.join(ROOT, '.env'))
        ? `set -o allexport; source "${ROOT}/.env"; set +o allexport; `
        : '';
    const out = execSync(
        `${envSource}bash "${ROOT}/pipeline/run.sh" --dry-run 2>&1`,
        { cwd: ROOT, encoding: 'utf8', timeout: 30000 }
    );
    out.includes('Pipeline complete')
        ? ok('Dry-run completes with "Pipeline complete"')
        : fail('Dry-run output', 'missing "Pipeline complete" in output');

    const countAfter = JSON.parse(fs.readFileSync(DB, 'utf8')).restaurants.length;
    countAfter === count
        ? ok(`Dry-run preserved restaurant count (${count})`)
        : fail('Dry-run preserved count', `${count} → ${countAfter}`);
} catch (e) {
    fail('Pipeline dry-run exits 0', e.message.slice(0, 120));
}

// ─── 5. Pipeline state file ───────────────────────────────────────────────────
section('Pipeline state');

try {
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    state.status === 'success'
        ? ok('pipeline_state.json status is "success"')
        : fail('pipeline_state.json status', state.status);
    state.last_run
        ? ok(`last_run is set: ${state.last_run}`)
        : fail('last_run is set');
} catch (e) {
    fail('pipeline_state.json is readable', e.message);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`${passed + failed} checks: ${passed} passed, ${failed} failed`);

if (failed === 0) {
    console.log('✅ All checks passed\n');
    process.exit(0);
} else {
    console.error(`❌ ${failed} check(s) failed\n`);
    process.exit(1);
}
