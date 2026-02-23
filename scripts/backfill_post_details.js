#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(PROJECT_ROOT, 'data/raw');
const DB_FILE = path.join(PROJECT_ROOT, 'data/restaurant_database.json');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'data/backups');

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
                    let postDate = '';
                    if (post.time) {
                        postDate = new Date(post.time).toISOString().split('T')[0];
                    }

                    index.set(postId, {
                        title: (post.title || '').slice(0, 80),
                        date: postDate,
                        engagement: (
                            parseInt((post.interactInfo || {}).likedCount || 0) +
                            parseInt((post.interactInfo || {}).commentCount || 0) +
                            parseInt((post.interactInfo || {}).collectedCount || 0)
                        )
                    });
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

function backfillRestaurants(postIndex) {
    if (!fs.existsSync(DB_FILE)) {
        console.error('Database file not found:', DB_FILE);
        process.exit(1);
    }

    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const backupFile = path.join(BACKUPS_DIR, 'pre_backfill_' + Date.now() + '.json');
    fs.writeFileSync(backupFile, JSON.stringify(db, null, 2));
    console.log('Backup created: ' + backupFile);

    let backfilledCount = 0;
    let addedDetailsCount = 0;

    for (const r of db.restaurants) {
        if (!Array.isArray(r.sources) || r.sources.length === 0) continue;

        if (!Array.isArray(r.post_details)) r.post_details = [];

        const existingPostIds = new Set(r.post_details.map(p => p.post_id));

        for (const sourceId of r.sources) {
            if (!sourceId || existingPostIds.has(sourceId)) continue;

            const postData = postIndex.get(sourceId);
            if (postData) {
                r.post_details.push({
                    post_id: sourceId,
                    title: postData.title,
                    date: postData.date,
                    engagement: postData.engagement,
                    context: ''
                });
                addedDetailsCount++;
            }
        }

        if (r.post_details.length > 0) {
            r.post_details.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
            r.post_details = r.post_details.slice(0, 10);
            backfilledCount++;
        }
    }

    db.updated_at = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

    console.log('Backfilled ' + addedDetailsCount + ' post details across ' + backfilledCount + ' restaurants');

    const emptyCount = db.restaurants.filter(r =>
        (!Array.isArray(r.post_details) || r.post_details.length === 0) &&
        Array.isArray(r.sources) && r.sources.length > 0
    ).length;

    if (emptyCount > 0) {
        console.log('Note: ' + emptyCount + ' restaurants still have empty post_details (source posts not in raw data)');
    }

    return { backfilledCount: backfilledCount, addedDetailsCount: addedDetailsCount, emptyCount: emptyCount };
}

function main() {
    console.log('=== Backfilling post_details ===\n');

    const postIndex = buildPostIndex();
    const result = backfillRestaurants(postIndex);

    console.log('\n=== Done ===');
    console.log('  Restaurants updated: ' + result.backfilledCount);
    console.log('  Post details added: ' + result.addedDetailsCount);
    console.log('  Still empty (no raw data): ' + result.emptyCount);
}

main();
