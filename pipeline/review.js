#!/usr/bin/env node
/**
 * pipeline/review.js — Interactive candidate review CLI
 *
 * Shows each new restaurant candidate and prompts for approval before
 * it gets merged into the main database.
 *
 * Usage:
 *   node pipeline/review.js                    # Review today's candidates
 *   node pipeline/review.js --date 2026-02-19  # Review a specific date
 *   node pipeline/review.js --auto-approve     # Skip review, approve all (CI mode)
 *
 * Approved candidates are moved to data/candidates/approved/YYYY-MM-DD.json
 * and picked up by 04_merge.js on the next pipeline run.
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const autoApprove = args.includes('--auto-approve');
const dateArg     = args.find(a => a.startsWith('--date='))?.split('=')[1]
                  ?? (args[args.indexOf('--date') + 1] || null);
const targetDate  = dateArg || new Date().toISOString().split('T')[0];

// ─── Paths ───────────────────────────────────────────────────────────────────
const ROOT          = path.join(__dirname, '..');
const DB_FILE       = path.join(ROOT, 'data', 'restaurant_database.json');
const CANDIDATES_DIR = path.join(ROOT, 'data', 'candidates');
const APPROVED_DIR  = path.join(ROOT, 'data', 'candidates', 'approved');
const CANDIDATES_FILE = path.join(CANDIDATES_DIR, `${targetDate}.json`);
const APPROVED_FILE   = path.join(APPROVED_DIR, `${targetDate}.json`);

// ─── Load data ────────────────────────────────────────────────────────────────
if (!fs.existsSync(CANDIDATES_FILE)) {
    console.log(`No candidates found for ${targetDate} (${CANDIDATES_FILE})`);
    console.log('Run the pipeline first: bash pipeline/run.sh');
    process.exit(0);
}

const candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));

if (!candidates.length) {
    console.log(`No candidates in ${CANDIDATES_FILE}`);
    process.exit(0);
}

// Build set of existing restaurant names to flag duplicates
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const existingNames = new Set(
    db.restaurants.map(r => r.name.toLowerCase().replace(/\s+/g, ''))
);

const newCandidates = candidates.filter(c => {
    const key = c.name.toLowerCase().replace(/\s+/g, '');
    return !existingNames.has(key);
});

if (!newCandidates.length) {
    console.log(`All ${candidates.length} candidates already exist in database.`);
    process.exit(0);
}

// ─── Auto-approve mode ────────────────────────────────────────────────────────
if (autoApprove) {
    fs.mkdirSync(APPROVED_DIR, { recursive: true });
    fs.writeFileSync(APPROVED_FILE, JSON.stringify(newCandidates, null, 2));
    console.log(`Auto-approved ${newCandidates.length} candidates → ${APPROVED_FILE}`);
    process.exit(0);
}

// ─── Interactive review ───────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

function formatCandidate(c, i, total) {
    const lines = [
        `\n${'─'.repeat(50)}`,
        `[${i}/${total}] ${c.name}`,
        `${'─'.repeat(50)}`,
        `  City:     ${c.city || 'unknown'}`,
        `  Cuisine:  ${c.cuisine || 'unknown'}`,
        `  Dishes:   ${(c.dishes || []).join(', ') || 'none'}`,
        `  Price:    ${c.price_range || 'unknown'}`,
        `  Source:   ${c.source_title || c.source_post_id || 'unknown'}`,
        `  Engagement: ${c.engagement || 0}`,
    ];
    return lines.join('\n');
}

async function runReview() {
    const approved = [];
    const rejected = [];

    console.log(`\n══ Candidate Review: ${targetDate} ══`);
    console.log(`${newCandidates.length} new candidates (${candidates.length - newCandidates.length} already in DB)\n`);
    console.log('Keys: [y] approve  [n] reject  [s] skip  [q] quit & save');

    for (let i = 0; i < newCandidates.length; i++) {
        const c = newCandidates[i];
        console.log(formatCandidate(c, i + 1, newCandidates.length));

        let answer = '';
        while (!['y', 'n', 's', 'q'].includes(answer)) {
            answer = (await ask('\n  Decision [y/n/s/q]: ')).trim().toLowerCase();
        }

        if (answer === 'q') {
            console.log('\nSaving progress and quitting...');
            break;
        }
        if (answer === 'y') {
            approved.push(c);
            console.log('  ✅ Approved');
        } else if (answer === 'n') {
            rejected.push(c);
            console.log('  ❌ Rejected');
        } else {
            console.log('  ⏭  Skipped');
        }
    }

    rl.close();

    // Save approved candidates
    if (approved.length > 0) {
        fs.mkdirSync(APPROVED_DIR, { recursive: true });
        fs.writeFileSync(APPROVED_FILE, JSON.stringify(approved, null, 2));
        console.log(`\n✅ ${approved.length} approved → ${APPROVED_FILE}`);
        console.log(`   Run "bash pipeline/run.sh --dry-run" to merge them.`);
    } else {
        console.log('\nNo candidates approved.');
    }

    console.log(`❌ ${rejected.length} rejected | ⏭  ${newCandidates.length - approved.length - rejected.length} skipped\n`);
}

runReview().catch(e => { console.error(e); process.exit(1); });
