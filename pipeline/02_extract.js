#!/usr/bin/env node
/**
 * 02_extract.js — Extract restaurant candidates from scraped XHS posts
 * Usage: node pipeline/02_extract.js <raw_dir> <output_file>
 *
 * Input:  Directory of JSON files (one per XHS post)
 * Output: JSON array of restaurant candidates
 */

'use strict';
const fs = require('fs');
const path = require('path');

const rawDir = process.argv[2];
const outputFile = process.argv[3];

if (!rawDir || !outputFile) {
    console.error('Usage: node 02_extract.js <raw_dir> <output_file>');
    process.exit(1);
}

if (!fs.existsSync(rawDir)) {
    console.log('Raw directory not found, writing empty candidates');
    fs.writeFileSync(outputFile, '[]');
    process.exit(0);
}

// Bay Area location keywords
const BAY_AREA_SIGNALS = [
    'Cupertino', 'Milpitas', 'Fremont', 'Mountain View', 'Sunnyvale',
    'San Jose', 'Palo Alto', 'Santa Clara', 'San Mateo', 'Foster City',
    'Redwood City', 'Menlo Park', 'Union City', 'Newark', 'Hayward',
    'SF', 'South Bay', 'East Bay', '南湾', '东湾', '湾区', 'Bay Area',
    '库柏蒂诺', '米比达斯', '弗里蒙特', '山景城', '桑尼维尔', '圣荷西',
];

// Patterns to extract restaurant names from Chinese food posts
const NAME_PATTERNS = [
    /《([^》]{2,20})》/g,           // 《餐厅名》
    /【([^】]{2,20})】/g,           // 【餐厅名】
    /「([^」]{2,20})」/g,           // 「餐厅名」
    /📍\s*([^\n,，。！？]{2,25})/g, // 📍 餐厅名
    /店名[：:]\s*([^\n,，。！？]{2,20})/g,
    /(?:打卡|探店|推荐)\s*[了的]?\s*([^\n,，。！？()（）]{2,20})(?:餐厅|饭店|小馆|食府)/g,
];

function extractCandidates(post) {
    const candidates = [];

    const title = post.title || post.desc || '';
    const desc = post.desc || post.content || '';
    const comments = (post.comments || []).map(c => c.content || c.text || '').join(' ');
    const fullText = `${title} ${desc} ${comments}`;

    // Must mention Bay Area
    if (!BAY_AREA_SIGNALS.some(s => fullText.includes(s))) return [];

    const postId = post.id || post.noteId || post.note_id || '';
    const engagement = (post.interactInfo || {}).commentCount || 0;

    // Run all extraction patterns
    for (const pattern of NAME_PATTERNS) {
        pattern.lastIndex = 0; // Reset regex state
        let match;
        while ((match = pattern.exec(fullText)) !== null) {
            const name = match[1].trim();

            // Filter out obvious non-restaurant names
            if (name.length < 2 || name.length > 25) continue;
            if (/^\d+$/.test(name)) continue; // All numbers
            if (/^(今天|这家|那家|一家|这里|那里|附近|好吃|推荐|必吃)/.test(name)) continue;

            candidates.push({
                name,
                source_post_id: postId,
                source_title: title.slice(0, 80),
                engagement,
                extracted_at: new Date().toISOString(),
            });
        }
    }

    return candidates;
}

// Process all raw files
const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.json'));
console.log(`Processing ${files.length} raw posts...`);

const allCandidates = [];
let processed = 0;
let errors = 0;

for (const file of files) {
    try {
        const post = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
        const candidates = extractCandidates(post);
        allCandidates.push(...candidates);
        processed++;
    } catch (e) {
        errors++;
    }
}

// Deduplicate by normalized name
const seen = new Set();
const unique = allCandidates.filter(c => {
    const key = c.name.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
});

fs.writeFileSync(outputFile, JSON.stringify(unique, null, 2));
console.log(`Extracted ${unique.length} unique candidates from ${processed} posts (${errors} errors)`);
