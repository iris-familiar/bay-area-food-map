#!/usr/bin/env node
/**
 * Development Server with Hot Reload
 * 开发环境服务器（带热重载）
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 8080;

const DB_FILE = path.join(__dirname, 'site/data/restaurant_database.json');
const INDEX_FILE = path.join(__dirname, 'site/data/restaurant_database_index.json');
const CORRECTIONS_FILE = path.join(__dirname, 'data/corrections.json');
const GENERATE_INDEX = path.join(__dirname, 'pipeline/06_generate_index.js');
const RAW_DATA_DIR = path.join(__dirname, 'data/raw');

// ─── Load .env ────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    });
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJSON(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch (e) { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

function regenerateIndex() {
    execSync(`node "${GENERATE_INDEX}" "${DB_FILE}" "${INDEX_FILE}"`, { stdio: 'inherit' });
}

/** Find-by-id or push new entry; shallow-merge patch into .corrections */
function upsertCorrection(corrections, id, patch) {
    const existing = corrections.find(c => c.id === id);
    if (existing) {
        existing.corrections = { ...existing.corrections, ...patch };
    } else {
        corrections.push({ id, corrections: patch });
    }
}

/** Recalculate engagement metrics from post_details array */
function recalcMetrics(postDetails) {
    const active = postDetails.filter(p => !p._removed);
    const total_engagement = active.reduce(
        (s, p) => s + (p.engagement || 0) / Math.sqrt(p.restaurant_count_in_post || 1), 0
    );
    return {
        total_engagement,
        mention_count: active.length,
        sources: active.map(p => p.post_id).filter(Boolean),
    };
}

/** Make an HTTPS GET request, return parsed JSON */
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid JSON from API')); }
            });
        }).on('error', reject);
    });
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(res, statusCode, body) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify(body));
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    const urlPath = req.url.split('?')[0];

    // ── GET /api/post/:post_id ─────────────────────────────────────────────────
    const getPostMatch = urlPath.match(/^\/api\/post\/(.+)$/);
    if (req.method === 'GET' && getPostMatch) {
        const postId = getPostMatch[1];
        try {
            // Search all date directories for post_{postId}.json
            let postData = null;
            if (fs.existsSync(RAW_DATA_DIR)) {
                const dates = fs.readdirSync(RAW_DATA_DIR).sort().reverse();
                for (const date of dates) {
                    const filePath = path.join(RAW_DATA_DIR, date, `post_${postId}.json`);
                    if (fs.existsSync(filePath)) {
                        const raw = readJSON(filePath);
                        const info = raw.interactInfo || {};
                        postData = {
                            title: raw.title || '',
                            date: raw.date ? new Date(raw.date).toISOString().split('T')[0] : '',
                            engagement: (
                                parseInt(info.likedCount || 0) +
                                parseInt(info.commentCount || 0) +
                                parseInt(info.collectedCount || 0)
                            ),
                        };
                        break;
                    }
                }
            }
            if (postData) {
                jsonResponse(res, 200, { ok: true, post: postData });
            } else {
                jsonResponse(res, 200, { ok: false });
            }
        } catch (err) {
            console.error('GET /api/post error:', err.message);
            jsonResponse(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    // ── POST /api/relink-place/:id ─────────────────────────────────────────────
    const relinkMatch = urlPath.match(/^\/api\/relink-place\/(.+)$/);
    if (req.method === 'POST' && relinkMatch) {
        const id = relinkMatch[1];
        try {
            const body = await parseBody(req);
            const { google_place_id } = body;
            if (!google_place_id) throw new Error('google_place_id required');

            const db = readJSON(DB_FILE);

            // Check for conflict: another restaurant already has this place_id
            const conflict = db.restaurants.find(
                r => r.id !== id && r.google_place_id === google_place_id && r._status !== 'duplicate_merged'
            );
            if (conflict) {
                jsonResponse(res, 200, {
                    ok: false,
                    conflict: {
                        id: conflict.id,
                        name: conflict.name,
                        area: conflict.area || conflict.city || '',
                        google_rating: conflict.google_rating,
                        post_details: conflict.post_details || [],
                    },
                });
                return;
            }

            // No conflict — fetch Place Details from Google
            const apiKey = process.env.GOOGLE_PLACES_API_KEY;
            if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not set in .env');

            const fields = 'name,formatted_address,rating,geometry';
            const placeUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(google_place_id)}&fields=${fields}&key=${apiKey}`;
            const result = await httpsGet(placeUrl);

            if (result.status !== 'OK') {
                throw new Error(`Google Places API error: ${result.status}`);
            }

            const p = result.result;
            const newData = {
                google_name: p.name || '',
                address: p.formatted_address || '',
                google_rating: p.rating || null,
                lat: p.geometry?.location?.lat || null,
                lng: p.geometry?.location?.lng || null,
            };

            jsonResponse(res, 200, { ok: true, newData });
        } catch (err) {
            console.error(`POST /api/relink-place/${id} error:`, err.message);
            jsonResponse(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    // ── POST /api/merge ────────────────────────────────────────────────────────
    if (req.method === 'POST' && urlPath === '/api/merge') {
        try {
            const body = await parseBody(req);
            const { keepId, mergeId, mergedPostDetails, googleData = {} } = body;
            if (!keepId || !mergeId) throw new Error('keepId and mergeId required');

            const db = readJSON(DB_FILE);
            const keepR = db.restaurants.find(r => r.id === keepId);
            const mergeR = db.restaurants.find(r => r.id === mergeId);
            if (!keepR) throw new Error(`Restaurant ${keepId} not found`);
            if (!mergeR) throw new Error(`Restaurant ${mergeId} not found`);

            // Apply merged post_details and recalc metrics
            const cleanPosts = mergedPostDetails.filter(p => !p._removed);
            keepR.post_details = cleanPosts;
            const metrics = recalcMetrics(cleanPosts);
            Object.assign(keepR, metrics);

            // Apply fetched Google data if provided
            if (googleData.google_name) keepR.google_name = googleData.google_name;
            if (googleData.address) keepR.address = googleData.address;
            if (googleData.google_rating != null) keepR.google_rating = googleData.google_rating;
            if (googleData.lat != null) keepR.lat = googleData.lat;
            if (googleData.lng != null) keepR.lng = googleData.lng;
            if (googleData.google_place_id) keepR.google_place_id = googleData.google_place_id;

            // Mark mergeId as duplicate_merged
            mergeR._status = 'duplicate_merged';
            mergeR.post_details = [];
            mergeR.sources = [];

            writeJSON(DB_FILE, db);

            // Upsert both into corrections.json
            const corrections = readJSON(CORRECTIONS_FILE);
            const keepPatch = {
                post_details: cleanPosts,
                ...metrics,
                ...(googleData.google_name ? { google_name: googleData.google_name } : {}),
                ...(googleData.address ? { address: googleData.address } : {}),
                ...(googleData.google_rating != null ? { google_rating: googleData.google_rating } : {}),
                ...(googleData.lat != null ? { lat: googleData.lat } : {}),
                ...(googleData.lng != null ? { lng: googleData.lng } : {}),
                ...(googleData.google_place_id ? { google_place_id: googleData.google_place_id } : {}),
            };
            upsertCorrection(corrections, keepId, keepPatch);
            upsertCorrection(corrections, mergeId, { _status: 'duplicate_merged', post_details: [], sources: [] });
            writeJSON(CORRECTIONS_FILE, corrections);

            regenerateIndex();
            jsonResponse(res, 200, { ok: true });
        } catch (err) {
            console.error('POST /api/merge error:', err.message);
            jsonResponse(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    // ── POST /api/(approve|reject|correct)/:id ─────────────────────────────────
    const apiMatch = urlPath.match(/^\/api\/(approve|reject|correct)\/(.+)$/);

    if (req.method === 'POST' && apiMatch) {
        const [, action, id] = apiMatch;
        try {
            const body = await parseBody(req);

            if (action === 'approve') {
                const { edits = {} } = body;
                const db = readJSON(DB_FILE);
                const r = db.restaurants.find(x => x.id === id);
                if (!r) throw new Error(`Restaurant ${id} not found`);
                Object.assign(r, edits);
                if (r.merge_info) r.merge_info.needs_review = false;
                else r.merge_info = { needs_review: false };
                writeJSON(DB_FILE, db);
                if (Object.keys(edits).length > 0) {
                    const corrections = readJSON(CORRECTIONS_FILE);
                    upsertCorrection(corrections, id, edits);
                    writeJSON(CORRECTIONS_FILE, corrections);
                }
                regenerateIndex();

            } else if (action === 'reject') {
                const corrections = readJSON(CORRECTIONS_FILE);
                upsertCorrection(corrections, id, { _status: 'rejected' });
                writeJSON(CORRECTIONS_FILE, corrections);
                const db = readJSON(DB_FILE);
                const r = db.restaurants.find(x => x.id === id);
                if (!r) throw new Error(`Restaurant ${id} not found`);
                r._status = 'rejected';
                writeJSON(DB_FILE, db);
                regenerateIndex();

            } else if (action === 'correct') {
                const { edits = {} } = body;

                // If post_details is being updated, recalculate derived metrics
                if (edits.post_details) {
                    const cleanPosts = edits.post_details.filter(p => !p._removed);
                    edits.post_details = cleanPosts;
                    const metrics = recalcMetrics(cleanPosts);
                    edits.total_engagement = metrics.total_engagement;
                    edits.mention_count = metrics.mention_count;
                    edits.sources = metrics.sources;
                }

                const corrections = readJSON(CORRECTIONS_FILE);
                upsertCorrection(corrections, id, edits);
                writeJSON(CORRECTIONS_FILE, corrections);
                const db = readJSON(DB_FILE);
                const r = db.restaurants.find(x => x.id === id);
                if (!r) throw new Error(`Restaurant ${id} not found`);
                Object.assign(r, edits);
                writeJSON(DB_FILE, db);
                regenerateIndex();
            }

            jsonResponse(res, 200, { ok: true });
        } catch (err) {
            console.error(`API error [${action}/${id}]:`, err.message);
            jsonResponse(res, 500, { ok: false, error: err.message });
        }
        return;
    }

    // Static file serving — serve from site/, fallback to root for local-only files
    let filePath = path.join(__dirname, 'site', urlPath);
    if (urlPath === '/' || urlPath === '') {
        filePath = path.join(__dirname, 'site', 'index.html');
    }
    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, urlPath);
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache',
                ...CORS_HEADERS,
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('🍜 Development Server Running');
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📋 http://localhost:${PORT}/review.html`);
    console.log('⌨️  Press Ctrl+C to stop');
});
