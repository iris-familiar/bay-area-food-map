#!/usr/bin/env node
/**
 * Development Server with Hot Reload
 * 开发环境服务器（带热重载）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 8080;

const DB_FILE = path.join(__dirname, 'site/data/restaurant_database.json');
const INDEX_FILE = path.join(__dirname, 'site/data/restaurant_database_index.json');
const CORRECTIONS_FILE = path.join(__dirname, 'data/corrections.json');
const GENERATE_INDEX = path.join(__dirname, 'pipeline/06_generate_index.js');

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

    // API routes
    const urlPath = req.url.split('?')[0];
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
