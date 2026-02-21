#!/usr/bin/env node
/**
 * 02_extract_llm.js — LLM-based restaurant extraction from XHS posts
 * Uses Kimi K2 (Moonshot AI) to extract restaurants, cuisine, dishes from each post.
 *
 * Usage: node pipeline/02_extract_llm.js <raw_dir> <output_file>
 *
 * Output: JSON array of restaurant candidates with enriched fields
 * Requires: KIMI_API_KEY in environment or .env
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Config ────────────────────────────────────────────────────────────────
const rawDir = process.argv[2];
const outputFile = process.argv[3];

if (!rawDir || !outputFile) {
    console.error('Usage: node 02_extract_llm.js <raw_dir> <output_file>');
    process.exit(1);
}

const KIMI_API_KEY = process.env.KIMI_API_KEY;
if (!KIMI_API_KEY) {
    console.error('❌ KIMI_API_KEY not set. Check .env file.');
    process.exit(1);
}

const KIMI_MODEL = 'kimi-for-coding';
const KIMI_URL = 'https://api.kimi.com/coding/v1/chat/completions';

// Only process posts from today to avoid re-processing old data
// MAX_POSTS env var overrides for testing (e.g. MAX_POSTS=10 in e2e)
const MAX_POSTS_PER_RUN = parseInt(process.env.MAX_POSTS || '30', 10);
const DELAY_MS = 500; // 500ms between API calls

// ─── Bay Area validation ────────────────────────────────────────────────────
const BAY_AREA_SIGNALS = [
    'Cupertino', 'Milpitas', 'Fremont', 'Mountain View', 'Sunnyvale',
    'San Jose', 'Palo Alto', 'Santa Clara', 'San Mateo', 'Foster City',
    'Redwood City', 'Menlo Park', 'Union City', 'Newark', 'Hayward',
    'SF', 'San Francisco', 'South Bay', 'East Bay', 'Peninsula',
    '南湾', '东湾', '湾区', 'Bay Area', '旧金山', '圣荷西', '硅谷',
    '库柏蒂诺', '米比达斯', '弗里蒙特', '山景城', '桑尼维尔',
];

function isBayAreaPost(text) {
    return BAY_AREA_SIGNALS.some(s => text.includes(s));
}

// ─── Kimi API call (OpenAI-compatible) ──────────────────────────────────────
function kimiExtract(postText) {
    return new Promise((resolve, reject) => {
        const prompt = `You are a data extraction assistant. Extract restaurant information from this XiaoHongShu (小红书) post about food in the San Francisco Bay Area.

POST CONTENT:
${postText.slice(0, 3000)}

Extract all Bay Area restaurants mentioned. Return ONLY valid JSON, no explanation:
{"restaurants": [
  {
    "name": "restaurant name (Chinese or English)",
    "city": "city name (e.g. Cupertino, Milpitas, Fremont, San Jose, SF)",
    "cuisine": "cuisine type (e.g. 川菜, 湘菜, 火锅, 日料, 韩餐, 粤菜, American)",
    "dishes": ["dish1", "dish2"],
    "price_per_person": "price range like $15-20 or 人均$50",
    "sentiment": "positive|negative|neutral"
  }
]}

Rules:
- Only include restaurants in the SF Bay Area
- Restaurant name must be the actual name, not a description
- If no restaurants are mentioned, return {"restaurants": []}
- dishes should be specific dish names mentioned in the post, not generic terms`;

        const body = JSON.stringify({
            model: KIMI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 1024,
            temperature: 0.1,
        });

        const options = {
            method: 'POST',
            hostname: 'api.kimi.com',
            path: '/coding/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${KIMI_API_KEY}`,
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'KimiCLI/1.3',
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.error) {
                        reject(new Error(response.error.message));
                        return;
                    }
                    const text = response.choices?.[0]?.message?.content || '{"restaurants":[]}';
                    const extracted = JSON.parse(text);
                    resolve(extracted.restaurants || []);
                } catch (e) {
                    resolve([]); // Graceful degradation on parse error
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
    if (!fs.existsSync(rawDir)) {
        console.log('Raw directory not found, writing empty candidates');
        fs.writeFileSync(outputFile, '[]');
        return;
    }

    const files = fs.readdirSync(rawDir)
        .filter(f => f.endsWith('.json'))
        .slice(0, MAX_POSTS_PER_RUN);

    if (files.length === 0) {
        console.log('No posts to process');
        fs.writeFileSync(outputFile, '[]');
        return;
    }

    console.log(`Processing ${files.length} posts with Kimi LLM (${KIMI_MODEL})...`);

    const allCandidates = [];
    let processed = 0;
    let errors = 0;
    let skipped = 0;

    for (const file of files) {
        const filePath = path.join(rawDir, file);
        let post;
        try {
            post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            errors++;
            continue;
        }

        const title = post.title || '';
        const desc = post.desc || post.content || '';
        const comments = (post.comments || []).map(c => c.content || c.text || '').join('\n');
        const fullText = `${title}\n${desc}\n${comments}`;

        // Skip if not Bay Area
        if (!isBayAreaPost(fullText)) {
            skipped++;
            continue;
        }

        try {
            const restaurants = await kimiExtract(fullText);

            for (const r of restaurants) {
                if (!r.name || r.name.length < 2) continue;

                allCandidates.push({
                    name: r.name.trim(),
                    city: r.city || 'unknown',
                    cuisine: r.cuisine || 'unknown',
                    dishes: Array.isArray(r.dishes) ? r.dishes.filter(d => d && d.length > 0) : [],
                    price_range: r.price_per_person || 'unknown',
                    sentiment: r.sentiment || 'neutral',
                    source_post_id: post.id || post.noteId || post.note_id || '',
                    source_title: title.slice(0, 80),
                    engagement: (post.interactInfo || {}).commentCount || 0,
                    extracted_at: new Date().toISOString(),
                    extraction_method: 'kimi-llm',
                });
            }

            processed++;
            if (restaurants.length > 0) {
                console.log(`  ✅ ${path.basename(file)}: found ${restaurants.length} restaurant(s)`);
            }
        } catch (e) {
            console.error(`  ⚠️  ${path.basename(file)}: ${e.message}`);
            errors++;
        }

        await sleep(DELAY_MS);
    }

    // Deduplicate by normalized name
    const seen = new Set();
    const unique = allCandidates.filter(c => {
        const key = c.name.toLowerCase().replace(/\s+/g, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Ensure output dir exists
    const outDir = path.dirname(outputFile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(outputFile, JSON.stringify(unique, null, 2));
    console.log(`\nLLM extraction: ${unique.length} unique candidates from ${processed} posts`);
    console.log(`  Skipped (not Bay Area): ${skipped} | Errors: ${errors}`);
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
