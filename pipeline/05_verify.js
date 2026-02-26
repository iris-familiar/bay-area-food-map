#!/usr/bin/env node
/**
 * 04_verify.js — Verify database integrity after pipeline run
 * Usage: node pipeline/04_verify.js <db_file> <before_count> <backup_file>
 *
 * Exit 0 = OK
 * Exit 1 = FAIL (caller should restore from backup)
 */

'use strict';
const fs = require('fs');

const [, , dbFile, beforeCountStr, backupFile] = process.argv;
const beforeCount = parseInt(beforeCountStr, 10) || 0;

let exitCode = 0;
const checks = [];

function check(name, condition, detail = '') {
    if (condition) {
        checks.push(`  ✅ ${name}`);
    } else {
        checks.push(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
        exitCode = 1;
    }
}

// Load database
let db;
try {
    const raw = fs.readFileSync(dbFile, 'utf8');
    db = JSON.parse(raw);
    check('Valid JSON', true);
} catch (e) {
    console.error(`❌ Cannot read/parse database: ${e.message}`);
    process.exit(1);
}

const count = Array.isArray(db.restaurants) ? db.restaurants.length : 0;

check('restaurants array exists', Array.isArray(db.restaurants));
check(`No data loss (${beforeCount} → ${count})`, count >= beforeCount,
    `dropped from ${beforeCount} to ${count}`);
check('All have names', db.restaurants.every(r => typeof r.name === 'string' && r.name.trim().length > 0),
    'some restaurants missing names');
check('All have IDs', db.restaurants.every(r => r.id),
    'some restaurants missing IDs');
check('Unique IDs', (() => {
    const ids = db.restaurants.map(r => r.id);
    return ids.length === new Set(ids).size;
})(), 'duplicate IDs found');

// Check engagement integrity: total_engagement should match sum of adjusted_engagement
// from post_details (within 1% tolerance for floating point).
// Falls back to verifying total_engagement >= 0 for records without adjusted_engagement.
check('Engagement matches post_details', (() => {
    for (const r of db.restaurants) {
        if (r._status === 'duplicate_merged') continue;
        if (!Array.isArray(r.post_details) || r.post_details.length === 0) continue;

        // If post_details have adjusted_engagement, verify total matches their sum
        const hasAdjusted = r.post_details.every(p => typeof p.adjusted_engagement === 'number');
        if (hasAdjusted) {
            const adjustedSum = r.post_details.reduce((sum, p) => sum + (p.adjusted_engagement || 0), 0);
            const tolerance = Math.max(adjustedSum * 0.01, 0.001);
            if (Math.abs((r.total_engagement || 0) - adjustedSum) > tolerance) {
                console.error(`    ⚠️  ${r.name}: total_engagement=${r.total_engagement} ≠ adjusted sum=${adjustedSum.toFixed(4)}`);
                return false;
            }
        } else {
            // Legacy check: total_engagement must be non-negative
            if ((r.total_engagement || 0) < 0) {
                console.error(`    ⚠️  ${r.name}: total_engagement=${r.total_engagement} is negative`);
                return false;
            }
        }
    }
    return true;
})(), 'some restaurants have mismatched engagement');

// Print results
console.log('Data integrity checks:');
checks.forEach(c => console.log(c));

if (exitCode === 0) {
    // Update header to match actual count
    db.total_restaurants = count;
    db.verified_at = new Date().toISOString();
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
    console.log(`\n✅ All checks passed. Database: ${count} restaurants.`);
} else {
    console.error(`\n❌ Checks failed. Backup available at: ${backupFile}`);
    console.error('Caller should restore from backup.');
}

process.exit(exitCode);
