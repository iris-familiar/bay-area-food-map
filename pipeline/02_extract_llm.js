#!/usr/bin/env node
/**
 * 02_extract_llm.js — LLM-based restaurant extraction from XHS posts
 * Uses GLM-5 (智谱AI) to extract restaurants, cuisine, dishes from each post.
 *
 * Usage: node pipeline/02_extract_llm.js <raw_dir> <output_file>
 *
 * Output: JSON array of restaurant candidates with enriched fields
 * Requires: GLM_API_KEY in environment or .env
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── Load .env (if not already set) ──────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2];
        }
    });
}

// ─── Config ────────────────────────────────────────────────────────────────
const rawDir = process.argv[2];
const outputFile = process.argv[3];

if (!rawDir || !outputFile) {
    console.error('Usage: node 02_extract_llm.js <raw_dir> <output_file>');
    process.exit(1);
}

const GLM_API_KEY = process.env.GLM_API_KEY;
if (!GLM_API_KEY) {
    console.error('❌ GLM_API_KEY not set. Check .env file.');
    process.exit(1);
}

const GLM_MODEL = process.env.GLM_MODEL || 'glm-5';

// Only process posts from today to avoid re-processing old data
// MAX_POSTS env var overrides for testing (e.g. MAX_POSTS=10 in e2e)
const MAX_POSTS_PER_RUN = parseInt(process.env.MAX_POSTS || '100', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '200', 10); // ms between API calls
const MAX_RETRIES = 3; // Max retry attempts for API errors
const RETRY_DELAY_MS = 1000; // Initial retry delay (exponential backoff)
const REQUEST_TIMEOUT_MS = parseInt(process.env.GLM_TIMEOUT_MS || '60000', 10);

// ─── Bay Area validation ────────────────────────────────────────────────────
const BAY_AREA_SIGNALS = [
    'Cupertino', 'Milpitas', 'Fremont', 'Mountain View', 'Sunnyvale',
    'San Jose', 'Palo Alto', 'Santa Clara', 'San Mateo', 'Foster City',
    'Redwood City', 'Menlo Park', 'Union City', 'Newark', 'Hayward',
    'SF', 'San Francisco', 'South Bay', 'East Bay', 'Peninsula',
    '南湾', '东湾', '湾区', 'Bay Area', '旧金山', '圣荷西', '硅谷',
    '库柏蒂诺', '米比达斯', '弗里蒙特', '山景城', '桑尼维尔',
];

// City name normalization map (Chinese to English aliases)
const CITY_ALIASES = {
    '南湾': 'San Jose',
    '东湾': 'Fremont',
    '旧金山': 'SF',
    '硅谷': 'San Jose',
    '库柏蒂诺': 'Cupertino',
    '山景城': 'Mountain View',
    '桑尼维尔': 'Sunnyvale',
    '圣克拉拉': 'Santa Clara',
    '南旧金山': 'South San Francisco',
    '坎贝尔': 'Campbell',
    '湾区': null,  // Too vague, will fail enrichment
};

const VALID_CITIES = new Set([
    'Cupertino', 'Milpitas', 'Fremont', 'Mountain View', 'Sunnyvale',
    'San Jose', 'Palo Alto', 'Santa Clara', 'San Mateo', 'Foster City',
    'Redwood City', 'Menlo Park', 'Union City', 'Newark', 'Hayward',
    'SF', 'San Francisco', 'Daly City', 'San Leandro', 'Pleasanton',
    'Livermore', 'Dublin', 'Walnut Creek', 'Berkeley', 'Oakland', 'San Ramon',
    'Millbrae', 'San Bruno', 'Campbell', 'Burlingame', 'South San Francisco',
    'Albany', 'Pleasant Hill', 'San Carlos', 'Belmont',
]);

function normalizeCity(city) {
    if (!city || city === 'unknown') return 'unknown';
    // Check aliases first
    if (CITY_ALIASES[city]) return CITY_ALIASES[city];
    // Normalize to valid city
    const normalized = city.trim();
    for (const valid of VALID_CITIES) {
        if (valid.toLowerCase() === normalized.toLowerCase()) return valid;
    }
    return 'unknown';
}

function isBayAreaPost(text) {
    return BAY_AREA_SIGNALS.some(s => text.includes(s));
}

// ─── Bay Area cities for extraction ─────────────────────────────────────────
const BAY_AREA_CITIES_LIST = 'Cupertino, Milpitas, Fremont, Mountain View, Sunnyvale, San Jose, Palo Alto, Santa Clara, San Mateo, Foster City, Redwood City, Menlo Park, Union City, Newark, Hayward, SF/San Francisco, Daly City, San Leandro, Pleasanton, Livermore, Dublin, Walnut Creek, Berkeley, Oakland, San Ramon, Millbrae, San Bruno, Campbell, Burlingame, South San Francisco, Albany, Pleasant Hill, San Carlos, Belmont';

// ─── GLM API call (OpenAI-compatible) ──────────────────────────────────────
function glmExtract(postText) {
    return new Promise((resolve, reject) => {
        const prompt = `Extract restaurants from this XiaoHongShu post about SF Bay Area food.

POST CONTENT:
${postText.slice(0, 3000)}

IMPORTANT: This may be a "list post" mentioning MULTIPLE restaurants. Extract ALL of them.

Bay Area cities: ${BAY_AREA_CITIES_LIST}

Return ONLY valid JSON:
{"restaurants": [
  {
    "name": "restaurant name (Chinese or English)",
    "city": "city name from the list above (required - extract from address or context)",
    "cuisine": "cuisine type",
    "dishes": ["dish1", "dish2"],
    "sentiment": "positive|negative|neutral"
  }
]}

Rules:
- Extract EVERY restaurant mentioned, even if just a name
- City is REQUIRED - extract from address, neighborhood, or context
- If city is unclear, make best guess from Bay Area cities list
- If no restaurants found, return {"restaurants": []}`;

        const body = JSON.stringify({
            model: GLM_MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
            temperature: 0.1,
        });

        const options = {
            method: 'POST',
            hostname: 'open.bigmodel.cn',
            path: '/api/coding/paas/v4/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GLM_API_KEY}`,
                'Content-Length': Buffer.byteLength(body),
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
                    const finishReason = response.choices?.[0]?.finish_reason;
                    if (finishReason === 'length') {
                        console.warn('  ⚠️  GLM response truncated (finish_reason=length) — some restaurants may be missing');
                    }

                    let text = response.choices?.[0]?.message?.content || '';

                    if (!text) {
                        resolve([]);
                        return;
                    }

                    // Strip markdown code blocks if present (GLM wraps JSON in ```json ... ```)
                    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

                    const extracted = JSON.parse(text);
                    resolve(extracted.restaurants || []);
                } catch (e) {
                    resolve([]); // Graceful degradation on parse error
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(REQUEST_TIMEOUT_MS, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if error is retryable (rate limiting, timeout, server overload)
function isRetryableError(error) {
    const msg = error.message || '';
    return msg.includes('timeout') ||
           msg.includes('访问量过大') ||  // "too many requests" in Chinese
           msg.includes('rate limit') ||
           msg.includes('429') ||
           msg.includes('503') ||
           msg.includes('502');
}

// Retry wrapper with exponential backoff
async function glmExtractWithRetry(postText, maxRetries = MAX_RETRIES) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await glmExtract(postText);
            return { success: true, restaurants: result, attempts: attempt };
        } catch (e) {
            lastError = e;
            if (isRetryableError(e) && attempt < maxRetries) {
                const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                console.log(`    Retry ${attempt}/${maxRetries} in ${delay}ms...`);
                await sleep(delay);
            } else {
                break;
            }
        }
    }
    return { success: false, error: lastError.message, attempts: maxRetries };
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

    console.log(`Processing ${files.length} posts with GLM-5 (${GLM_MODEL})...`);

    const allCandidates = [];
    const failedPosts = []; // Track posts that failed after all retries
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
            failedPosts.push({ file, error: 'Invalid JSON', postId: null });
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

        const result = await glmExtractWithRetry(fullText);

        if (result.success) {
            const restaurants = result.restaurants;

            for (const r of restaurants) {
                if (!r.name || r.name.length < 2) continue;

                // Convert post.time (milliseconds) to YYYY-MM-DD
                let postDate = '';
                if (post.time) {
                    postDate = new Date(post.time).toISOString().split('T')[0];
                }

                allCandidates.push({
                    name: r.name.trim(),
                    city: normalizeCity(r.city) || 'unknown',
                    cuisine: r.cuisine || 'unknown',
                    dishes: Array.isArray(r.dishes) ? r.dishes.filter(d => d && d.length > 0) : [],
                    price_range: r.price_per_person || 'unknown',
                    sentiment: r.sentiment || 'neutral',
                    source_post_id: post.id || post.noteId || post.note_id || '',
                    source_title: title.slice(0, 80),
                    source_post_date: postDate,
                    engagement: (
                        parseInt((post.interactInfo || {}).likedCount || 0) +
                        parseInt((post.interactInfo || {}).commentCount || 0) +
                        parseInt((post.interactInfo || {}).collectedCount || 0)
                    ),
                    extracted_at: new Date().toISOString(),
                    extraction_method: 'glm-5',
                });
            }

            processed++;
            if (restaurants.length > 0) {
                console.log(`  ✅ ${path.basename(file)}: found ${restaurants.length} restaurant(s)`);
            }
        } else {
            console.error(`  ❌ ${path.basename(file)}: ${result.error} (after ${result.attempts} attempts)`);
            errors++;
            failedPosts.push({
                file,
                postId: post.id || post.noteId || post.note_id || 'unknown',
                title: title.slice(0, 60),
                error: result.error,
                attempts: result.attempts,
            });
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

    // Write failed posts log for re-extraction
    if (failedPosts.length > 0) {
        const failedLogPath = outputFile.replace('.json', '_failed.json');
        fs.writeFileSync(failedLogPath, JSON.stringify({
            generated_at: new Date().toISOString(),
            source_dir: rawDir,
            total_failed: failedPosts.length,
            posts: failedPosts,
        }, null, 2));
        console.log(`\n⚠️  ${failedPosts.length} posts failed extraction. See: ${failedLogPath}`);
        console.log(`   To retry: node scripts/retry_failed.js ${failedLogPath}`);
    }
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
