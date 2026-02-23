#!/usr/bin/env node
/**
 * recalculate_engagement.js — Fix engagement metrics in existing data
 *
 * This script recalculates engagement for all restaurants by:
 * 1. Building an index of correct engagement values from raw post data
 * 2. Updating each restaurant's post_details[].engagement
 * 3. Recalculating total_engagement for each restaurant
 *
 * Engagement = likes (likedCount) + comments (commentCount) + stars (collectedCount)
 *
 * Usage: node scripts/recalculate_engagement.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(PROJECT_ROOT, 'data/raw');
const DB_FILE = path.join(PROJECT_ROOT, 'data/restaurant_database.json');
const INDEX_FILE = path.join(PROJECT_ROOT, 'data/restaurant_database_index.json');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'data/backups');

/**
 * Build an index of postId -> correct engagement value from raw posts
 */
function buildPostIndex() {
    const index = new Map();

    if (!fs.existsSync(RAW_DIR)) {
        console.log('No raw directory found');
        return index;
    }

    const dateDirs = fs.readdirSync(RAW_DIR).filter(d => {
        const stat = fs.statSync(path.join(RAW_DIR, d));
        return stat.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d);
    });

    let totalPosts = 0;

    for (const dateDir of dateDirs) {
        const dirPath = path.join(RAW_DIR, dateDir);
        const files = fs.readdirSync(dirPath).filter(f => f.startsWith('post_') && f.endsWith('.json'));

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            try {
                const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const postId = post.id || post.noteId || post.note_id;
                if (postId) {
                    const interact = post.interactInfo || {};
                    const engagement =
                        parseInt(interact.likedCount || 0) +
                        parseInt(interact.commentCount || 0) +
                        parseInt(interact.collectedCount || 0);

                    index.set(postId, engagement);
                    totalPosts++;
                }
            } catch (e) {
                // Skip unparseable files
            }
        }
    }

    console.log('Built index from ' + totalPosts + ' posts across ' + dateDirs.length + ' date directories');
    return index;
}

/**
 * Recalculate engagement for all restaurants in the database
 */
function recalculateEngagement(postIndex) {
    if (!fs.existsSync(DB_FILE)) {
        console.error('Database file not found:', DB_FILE);
        process.exit(1);
    }

    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    // Create backup
    if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const backupFile = path.join(BACKUPS_DIR, 'pre_engagement_fix_' + Date.now() + '.json');
    fs.writeFileSync(backupFile, JSON.stringify(db, null, 2));
    console.log('Backup created: ' + backupFile);

    let updatedPosts = 0;
    let updatedRestaurants = 0;
    let notFoundPosts = 0;

    for (const r of db.restaurants) {
        if (!Array.isArray(r.post_details) || r.post_details.length === 0) continue;

        let totalEngagement = 0;
        let restaurantUpdated = false;

        for (const p of r.post_details) {
            const correctEngagement = postIndex.get(p.post_id);
            if (correctEngagement !== undefined) {
                if (p.engagement !== correctEngagement) {
                    p.engagement = correctEngagement;
                    updatedPosts++;
                    restaurantUpdated = true;
                }
            } else {
                notFoundPosts++;
            }
            totalEngagement += parseInt(p.engagement) || 0;
        }

        // Add mention_count to total if present
        const mentionCount = parseInt(r.mention_count) || 0;
        const newTotal = totalEngagement + mentionCount;

        if (r.total_engagement !== newTotal) {
            r.total_engagement = newTotal;
            restaurantUpdated = true;
        }

        if (restaurantUpdated) {
            updatedRestaurants++;
        }
    }

    db.updated_at = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

    console.log('Updated ' + updatedPosts + ' post engagements across ' + updatedRestaurants + ' restaurants');
    if (notFoundPosts > 0) {
        console.log('Note: ' + notFoundPosts + ' posts not found in raw data (kept existing values)');
    }

    return { updatedPosts, updatedRestaurants, notFoundPosts };
}

/**
 * Regenerate the index file
 */
function regenerateIndex() {
    const indexPath = path.join(PROJECT_ROOT, 'pipeline/06_generate_index.js');
    if (fs.existsSync(indexPath)) {
        console.log('\nRegenerating index file...');
        require(indexPath);
    } else {
        console.log('\nWarning: 06_generate_index.js not found, skipping index regeneration');
    }
}

function main() {
    console.log('=== Recalculating Engagement Metrics ===\n');
    console.log('Engagement = likes + comments + collected (stars)\n');

    const postIndex = buildPostIndex();
    const result = recalculateEngagement(postIndex);

    console.log('\n=== Done ===');
    console.log('  Posts updated: ' + result.updatedPosts);
    console.log('  Restaurants updated: ' + result.updatedRestaurants);
    console.log('  Posts not in raw data: ' + result.notFoundPosts);

    // Regenerate index
    regenerateIndex();
    console.log('\nIndex regenerated.');
}

main();
