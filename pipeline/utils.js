#!/usr/bin/env node
/**
 * pipeline/utils.js — Shared utilities for pipeline scripts
 *
 * Loads .env on first require (side effect), then exports shared helpers.
 * Usage: const { sleep, httpsGet, nameSimilarity, ... } = require('./utils');
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ─── Load .env on first require ───────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2];
        }
    });
}

// ─── General helpers ──────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
            });
        }).on('error', reject).setTimeout(10000, function() { this.destroy(); reject(new Error('timeout')); });
    });
}

// Normalised Levenshtein similarity (0–1)
function nameSimilarity(a, b) {
    a = (a || '').toLowerCase().replace(/\s+/g, '');
    b = (b || '').toLowerCase().replace(/\s+/g, '');
    if (a === b) return 1;
    const la = a.length, lb = b.length;
    if (!la || !lb) return 0;
    const dp = Array.from({length: la + 1}, (_, i) => [i, ...Array(lb).fill(0)]);
    for (let j = 0; j <= lb; j++) dp[0][j] = j;
    for (let i = 1; i <= la; i++)
        for (let j = 1; j <= lb; j++)
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return 1 - dp[la][lb] / Math.max(la, lb);
}

// Check if string contains CJK characters (Chinese, Japanese, Korean)
function hasCJK(str) {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(str || '');
}

// ─── Bay Area geography ───────────────────────────────────────────────────────
const BAY_AREA_CITIES = new Set([
    'cupertino', 'milpitas', 'fremont', 'mountain view', 'sunnyvale', 'san jose',
    'palo alto', 'santa clara', 'san mateo', 'foster city', 'redwood city',
    'menlo park', 'union city', 'newark', 'hayward', 'san francisco', 'daly city',
    'san leandro', 'pleasanton', 'livermore', 'dublin', 'walnut creek', 'berkeley',
    'oakland', 'san ramon', 'millbrae', 'san bruno', 'campbell', 'burlingame',
    'south san francisco', 'albany', 'pleasant hill', 'san carlos', 'belmont',
    'emeryville',
]);

// Pre-built array for substring searches (avoids spreading Set on every call)
const BAY_AREA_CITIES_ARR = [...BAY_AREA_CITIES];

const CITY_TO_REGION = {
    // South Bay
    'san jose': 'South Bay', 'cupertino': 'South Bay', 'sunnyvale': 'South Bay',
    'mountain view': 'South Bay', 'santa clara': 'South Bay', 'milpitas': 'South Bay',
    'campbell': 'South Bay',
    // Peninsula
    'palo alto': 'Peninsula', 'san mateo': 'Peninsula', 'millbrae': 'Peninsula',
    'menlo park': 'Peninsula', 'san carlos': 'Peninsula', 'burlingame': 'Peninsula',
    'redwood city': 'Peninsula', 'south san francisco': 'Peninsula',
    'san bruno': 'Peninsula', 'belmont': 'Peninsula', 'daly city': 'Peninsula',
    'foster city': 'Peninsula',
    // East Bay
    'fremont': 'East Bay', 'oakland': 'East Bay', 'berkeley': 'East Bay',
    'newark': 'East Bay', 'hayward': 'East Bay', 'union city': 'East Bay',
    'san leandro': 'East Bay', 'albany': 'East Bay', 'dublin': 'East Bay',
    'pleasanton': 'East Bay', 'walnut creek': 'East Bay', 'pleasant hill': 'East Bay',
    'emeryville': 'East Bay', 'livermore': 'East Bay', 'san ramon': 'East Bay',
    // San Francisco
    'san francisco': 'San Francisco', 'sf': 'San Francisco',
};

function cityToRegion(city) {
    if (!city || city === 'unknown') return 'unknown';
    return CITY_TO_REGION[city.toLowerCase()] || 'unknown';
}

function extractCityFromAddress(formattedAddress) {
    if (!formattedAddress) return null;
    const parts = formattedAddress.split(', ');
    // Require "..., City, State ZIP, USA" format (4+ parts, USA suffix)
    if (parts.length < 4 || parts[parts.length - 1] !== 'USA') return null;
    const cityCandidate = parts[parts.length - 3];
    if (BAY_AREA_CITIES.has(cityCandidate.toLowerCase())) return cityCandidate;
    return null;
}

function addressInCity(address, city) {
    if (!address || !city) return false;
    return address.toLowerCase().includes(city.toLowerCase());
}

function addressInBayArea(address) {
    if (!address) return false;
    const addr = address.toLowerCase();
    return BAY_AREA_CITIES_ARR.some(c => addr.includes(c));
}

// ─── Google Places ────────────────────────────────────────────────────────────
const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

module.exports = {
    sleep,
    httpsGet,
    nameSimilarity,
    hasCJK,
    BAY_AREA_CITIES,
    CITY_TO_REGION,
    cityToRegion,
    extractCityFromAddress,
    addressInCity,
    addressInBayArea,
    PLACES_BASE,
};
