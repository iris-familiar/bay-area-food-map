#!/usr/bin/env node
// Scrape XHS posts by restaurant name for engagement enrichment
// Usage: node pipeline/01_scrape_by_name.js [--limit 50] [--dry-run]
//
// Reads the restaurant DB, processes a rotating batch of N restaurants,
// searches XHS using "湾区 {chinese_name}", saves posts to data/raw/YYYY-MM-DD/

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── CLI Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : 50;

// ─── Paths ─────────────────────────────────────────────────────────────────────
const PROJECT_DIR = path.join(__dirname, '..');
const DB_FILE = path.join(PROJECT_DIR, 'site', 'data', 'restaurant_database.json');
const CURSOR_FILE = path.join(PROJECT_DIR, 'data', '.name_search_cursor.json');
const RAW_BASE_DIR = path.join(PROJECT_DIR, 'data', 'raw');
const MCP_DIR = path.join(process.env.HOME, '.agents', 'skills', 'xiaohongshu', 'scripts');

const RUN_DATE = new Date().toISOString().slice(0, 10);
const OUTPUT_DIR = path.join(RAW_BASE_DIR, RUN_DATE);

const log = (msg) => console.log(`[scrape_by_name] ${msg}`);

// ─── MCP Call Helper ───────────────────────────────────────────────────────────
function callMcp(method, params) {
  const paramsJson = JSON.stringify(params).replace(/'/g, "'\\''");
  try {
    const raw = execSync(
      `cd "${MCP_DIR}" && ./mcp-call.sh ${method} '${paramsJson}'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }
    );
    // Find JSON start (skip zoxide warnings, etc.)
    const jsonStart = raw.indexOf('{');
    if (jsonStart === -1) return null;
    const outer = JSON.parse(raw.slice(jsonStart));
    const text = (outer.result?.content?.[0]?.text) || '';
    try {
      return JSON.parse(text);
    } catch {
      return outer; // fallback if already unwrapped
    }
  } catch (err) {
    return null;
  }
}

// ─── Post Freshness Check ──────────────────────────────────────────────────────
function isPostFresh(noteId, maxAgeDays = 7) {
  // Check all date subdirs under data/raw/
  if (!fs.existsSync(RAW_BASE_DIR)) return false;
  const dateDirs = fs.readdirSync(RAW_BASE_DIR).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  for (const dateDir of dateDirs) {
    const candidate = path.join(RAW_BASE_DIR, dateDir, `post_${noteId}.json`);
    if (fs.existsSync(candidate)) {
      const stats = fs.statSync(candidate);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < maxAgeDays * 86400 * 1000) return true;
    }
  }
  return false;
}

// ─── Extract Chinese Name ──────────────────────────────────────────────────────
function extractChineseName(name) {
  const matches = name.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g);
  if (matches && matches.length > 0) return matches.join('');
  return name; // fallback for English-only names
}

// ─── Sleep ─────────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Load DB
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const activeRestaurants = db.restaurants.filter(r =>
    r.verified === true &&
    r._status !== 'duplicate_merged' &&
    r._status !== 'rejected'
  );
  const total = activeRestaurants.length;
  log(`Loaded ${total} active restaurants`);

  // 2. Load cursor
  let cursor = { last_processed_index: -1, last_run: null, cycle_count: 0 };
  if (fs.existsSync(CURSOR_FILE)) {
    try {
      cursor = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
    } catch {
      log('Warning: cursor file unreadable, starting from beginning');
    }
  }

  // 3. Compute batch
  const startIndex = (cursor.last_processed_index + 1) % total;
  const batch = [];
  for (let i = 0; i < LIMIT; i++) {
    batch.push(activeRestaurants[(startIndex + i) % total]);
  }
  const endIndex = (startIndex + batch.length - 1) % total;
  const wraps = startIndex + LIMIT > total;

  if (DRY_RUN) {
    log(`[DRY RUN] Would search ${batch.length} restaurants (index ${startIndex}–${endIndex}):`);
    batch.forEach((r, i) => {
      const chineseName = extractChineseName(r.name);
      const searchTerm = `湾区 ${chineseName}`;
      log(`  ${startIndex + i}: ${r.name} → "${searchTerm}"`);
    });
    log('Dry run complete. No API calls made.');
    return;
  }

  // 4. Check XHS login
  if (!fs.existsSync(path.join(MCP_DIR, 'mcp-call.sh'))) {
    log('WARNING: XHS MCP not found. Skipping.');
    process.exit(0);
  }
  const loginData = callMcp('check_login_status', {});
  const loginText = loginData?.result?.content?.[0]?.text || loginData?.content?.[0]?.text || '';
  const isLoggedIn = loginText.includes('已登录');
  if (!isLoggedIn) {
    log(`WARNING: XHS MCP not logged in. Skipping.`);
    log('To fix: cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh');
    process.exit(2);
  }
  log('XHS MCP online. Starting name-based search...');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let newCount = 0;
  let skipCount = 0;
  let consecutiveDetailFailures = 0;
  const MAX_CONSECUTIVE_DETAIL_FAILURES = 10; // likely session expiry

  // 5. Process each restaurant
  for (let i = 0; i < batch.length; i++) {
    const restaurant = batch[i];
    const chineseName = extractChineseName(restaurant.name);
    const searchTerm = `湾区 ${chineseName}`;

    log(`[${i + 1}/${batch.length}] Searching: "${searchTerm}" (${restaurant.name})`);

    const searchData = callMcp('search_feeds', { keyword: searchTerm });
    if (!searchData) {
      log(`  ⚠️  Search failed for "${searchTerm}"`);
    } else {
      const feeds = searchData.feeds || searchData.items || [];
      let statEngagement = 0, statFresh = 0, statDetailNull = 0, statDeleted = 0, statEmpty = 0, statErr = 0, statSaved = 0;

      for (const feed of feeds) {
        const card = feed.noteCard || feed;
        const interact = card.interactInfo || feed.interactInfo || {};
        const comments = parseInt(interact.commentCount || 0, 10) || 0;
        const likes = parseInt(interact.likedCount || 0, 10) || 0;

        // Engagement filter (same threshold as 01_scrape.sh:165)
        if (comments < 3 && likes < 20) { statEngagement++; continue; }

        const noteId = feed.id || feed.noteId || '';
        const xsecToken = feed.xsecToken || '';
        if (!noteId) continue;

        // Freshness check
        if (isPostFresh(noteId, 7)) {
          skipCount++;
          statFresh++;
          continue;
        }

        // Abort early if session likely expired
        if (consecutiveDetailFailures >= MAX_CONSECUTIVE_DETAIL_FAILURES) {
          log(`  💀 ${MAX_CONSECUTIVE_DETAIL_FAILURES}+ consecutive detail failures — session likely expired. Run: cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh`);
          process.exit(2);
        }

        // Fetch post detail (up to 3 attempts; retry on null or empty note data)
        const MAX_DETAIL_RETRIES = 3;
        let detailData = null;
        let note = {};
        for (let attempt = 1; attempt <= MAX_DETAIL_RETRIES; attempt++) {
          detailData = callMcp('get_feed_detail', { feed_id: noteId, xsec_token: xsecToken });
          if (!detailData) {
            if (attempt < MAX_DETAIL_RETRIES) { await sleep(2000); continue; }
            statDetailNull++; consecutiveDetailFailures++;
            break;
          }
          if (detailData?.result?.isError) {
            const errText = detailData?.result?.content?.[0]?.text || '(no message)';
            if (errText.includes('not found in noteDetailMap')) {
              // Post deleted/restricted — never retryable, not a session issue
              statDeleted++; detailData = null;
            } else {
              if (attempt < MAX_DETAIL_RETRIES) { await sleep(2000); continue; }
              consecutiveDetailFailures++;
              log(`  ⚠️  get_feed_detail error (session expired?): ${errText}`);
              statErr++; detailData = null;
            }
            break;
          }
          note = detailData.data?.note || {};
          if (!note.title && !note.desc) {
            if (attempt < MAX_DETAIL_RETRIES) { await sleep(2000); continue; }
            consecutiveDetailFailures++;
            log(`  ⚠️  No note data for ${noteId} (${attempt} attempts) — keys: ${JSON.stringify(Object.keys(detailData))}`);
            statEmpty++; detailData = null;
            break;
          }
          break; // success
        }
        if (!detailData) continue;

        consecutiveDetailFailures = 0; // reset on success

        const normalized = {
          id: note.noteId || noteId,
          noteId: note.noteId || noteId,
          title: note.title || '',
          desc: note.desc || '',
          date: note.time || '',
          authorId: note.user?.userId || '',
          authorName: note.user?.nickname || '',
          likedCount: note.interactInfo?.likedCount || 0,
          commentCount: note.interactInfo?.commentCount || 0,
          shareCount: note.interactInfo?.shareCount || 0,
          interactInfo: note.interactInfo || {},
          scraped_at: new Date().toISOString(),
        };

        const outFile = path.join(OUTPUT_DIR, `post_${noteId}.json`);
        fs.writeFileSync(outFile, JSON.stringify(normalized, null, 2));
        newCount++;
        statSaved++;
        log(`  ✅ Saved: ${noteId}`);

        // Rate limit: 2–4s between posts
        await sleep(2000 + Math.floor(Math.random() * 2000));
      }
      log(`  📊 feeds=${feeds.length} lowEngagement=${statEngagement} fresh=${statFresh} detailNull=${statDetailNull} deleted=${statDeleted} emptyNote=${statEmpty} err=${statErr} saved=${statSaved}`);
    }

    // Save cursor after each restaurant so Ctrl+C doesn't lose progress
    const thisIndex = (startIndex + i) % total;
    const progressCursor = {
      last_processed_index: thisIndex,
      last_run: new Date().toISOString(),
      cycle_count: cursor.cycle_count + (startIndex + i >= total ? 1 : 0),
    };
    fs.writeFileSync(CURSOR_FILE, JSON.stringify(progressCursor, null, 2));

    // Rate limit: 3–6s between restaurants
    if (i < batch.length - 1) {
      await sleep(3000 + Math.floor(Math.random() * 3000));
    }
  }

  // 6. Final cursor update (endIndex)
  const newCursor = {
    last_processed_index: endIndex,
    last_run: new Date().toISOString(),
    cycle_count: cursor.cycle_count + (wraps ? 1 : 0),
  };
  fs.writeFileSync(CURSOR_FILE, JSON.stringify(newCursor, null, 2));
  log(`Cursor updated: index=${endIndex}, cycle=${newCursor.cycle_count}`);

  // 7. Summary
  log(`Done. New posts: ${newCount}, Skipped (fresh): ${skipCount}`);
}

main().catch(err => {
  console.error('[scrape_by_name] Fatal error:', err);
  process.exit(1);
});
