# 湾区美食地图 (Bay Area Food Map)

A curated map of Bay Area Chinese restaurants discovered through XiaoHongShu (小红书).

**Live:** http://localhost:8080 (run `node dev.js`)
**Review UI:** http://localhost:8080/review.html

---

## Project Structure

```
bay-area-food-map/
├── index.html                         # Public map (single-page app, no build step)
├── review.html                        # Local-only review UI
├── dev.js                             # Dev server → :8080 (also serves write API)
├── src/
│   ├── app.js                         # Map app logic
│   ├── review.js                      # Review UI logic
│   └── styles.css                     # Shared styles
│
├── data/
│   ├── restaurant_database.json       # ← Single source of truth (563+ restaurants)
│   ├── restaurant_database_index.json # Slim version for fast page load (~50KB)
│   ├── corrections.json               # Manual corrections (re-applied every pipeline run)
│   ├── candidates/                    # Daily LLM-extracted candidates (gitignored)
│   ├── raw/                           # Daily scraped XHS posts (gitignored)
│   └── backups/                       # Auto-backups, 7-day TTL (gitignored)
│
├── pipeline/
│   ├── run.sh                         # ← Main entry point (cron calls this)
│   ├── run_by_name.sh                 # On-demand: enrich by restaurant name
│   ├── 01_scrape.sh                   # Scrape new XHS posts via MCP
│   ├── 01_scrape_by_name.js           # Scrape XHS by restaurant name (rotating cursor)
│   ├── 02_extract_llm.js              # Extract candidates from posts (GLM-5)
│   ├── 03_enrich_candidates.js        # Google Places enrichment for candidates
│   ├── 04_merge.js                    # Merge candidates by place_id (append-only)
│   ├── 05_verify.js                   # Data integrity check (auto-restores backup on fail)
│   ├── 06_generate_index.js           # Generate slim index for frontend
│   ├── 07_commit.sh                   # Auto git commit if data changed
│   ├── enrich_google.js               # Enrich existing unverified restaurants (~$0.017/restaurant)
│   └── review.js                      # Interactive CLI review (alternative to browser UI)
│
└── scripts/
    ├── apply_corrections.js           # Apply corrections.json to the database
    ├── normalize_cuisine.js           # One-time: normalize cuisine field to canonical Chinese values
    └── transaction.js                 # Atomic write + rollback helper
```

---

## Daily Pipeline

Runs automatically at 11:00 AM via cron:

```bash
# Manual run:
npm run pipeline

# Dry run (no scraping — just apply corrections, verify, regenerate index):
npm run pipeline:dry
```

**Pipeline steps:**
1. **Backup** current database
2. **Scrape** new XHS posts (skips if not logged in)
   - Re-scrapes posts older than 7 days to update engagement data
   - Configurable via `REFRESH_AGE_DAYS` env var (default: 7)
3. **Extract** restaurant candidates from posts via GLM-5 LLM
4. **Enrich** candidates with Google Places data (adds rating, address, coordinates)
5. **Merge** Google-verified candidates by place_id (no duplicates, no review needed)
6. **Verify** data integrity — auto-restores backup if check fails
7. **Generate index** slim frontend JSON
8. **Commit** data changes to git

---

## New Restaurant Workflow

New restaurants are Google-enriched during the pipeline and enter the database with `verified: true` — no manual review required. Candidates that fail enrichment are skipped.

**Manual corrections** (if needed):
```
Edit via Review UI: http://localhost:8080/review.html
  → Saves to both restaurant_database.json and corrections.json
  → Run: npm run pipeline:dry
```

**Enriching existing unverified restaurants** (predate new pipeline):
```
node pipeline/enrich_google.js --limit 20
```

---

## Name-Based Enrichment Pipeline

Inverts the search: for each known restaurant, searches XHS by name (`"湾区 {chinese_name}"`) to boost engagement accuracy, surface recent posts, and discover more dishes.

```bash
# Preview which 50 restaurants would be searched next (no API calls)
npm run enrich:names:dry

# Run enrichment for next 50 restaurants
npm run enrich:names

# Run a smaller batch
LIMIT=10 bash pipeline/run_by_name.sh
```

A rotation cursor in `data/.name_search_cursor.json` (gitignored) tracks progress. With 563 restaurants at 50/run, a full cycle takes ~12 runs. After each run the cursor advances automatically — just run `npm run enrich:names` repeatedly.

**Pipeline files:**
- `pipeline/01_scrape_by_name.js` — scrapes XHS, rotates cursor, filters by engagement
- `pipeline/run_by_name.sh` — orchestrates scrape → extract → enrich → merge → verify → index → commit

---

## Google Enrichment

```bash
node pipeline/enrich_google.js             # Enrich up to 10 unverified restaurants
node pipeline/enrich_google.js --limit 20  # Up to 20 (~$0.34)
node pipeline/enrich_google.js --dry-run   # Preview what would be enriched
node pipeline/enrich_google.js --all       # All unverified
```

Requires `GOOGLE_PLACES_API_KEY` in `.env`. Cost: ~$0.017/restaurant.

---

## Cuisine Field Normalization

If the `cuisine` field accumulates messy values (mix of English/Chinese, semantic duplicates):

```bash
# 1. Preview changes — prints a table of old → new values, no writes
node scripts/normalize_cuisine.js

# 2. Write correction entries to corrections.json
node scripts/normalize_cuisine.js --apply

# 3. Apply corrections to the database
node scripts/apply_corrections.js

# 4. Regenerate the slim index
node pipeline/06_generate_index.js data/restaurant_database.json data/restaurant_database_index.json

# 5. Verify
npm test
```

The canonical cuisine values and mappings live in `scripts/normalize_cuisine.js` (`CUISINE_MAP`). Update that map if new non-canonical values appear.

---

## Review UI

```bash
node dev.js
# Open http://localhost:8080/review.html
```

- **Pending tab** — empty with new pipeline (restaurants are auto-verified)
- **Approved tab** — all visible restaurants; searchable, inline editable; saves to both DB and `corrections.json`
- Write API routes (`POST /api/approve/:id`, `/api/reject/:id`, `/api/correct/:id`) are served by `dev.js` only — the public app has no backend

---

## Fallback / Recovery

```bash
# Restore from pipeline backup (last 7 days kept)
ls data/backups/
cp data/backups/restaurant_database_YYYYMMDD_HHMMSS.json data/restaurant_database.json

# Restore from git
git log --oneline data/restaurant_database.json
git checkout <commit> -- data/restaurant_database.json
```

---

## XHS Login

```bash
# Check current login status and username
cd ~/.agents/skills/xiaohongshu/scripts && ./status.sh

# Log in with a different account (requires GUI)
cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh

# If MCP server is slow/unresponsive, restart it:
cd ~/.agents/skills/xiaohongshu/scripts && ./stop-mcp.sh
cd ~/.agents/skills/xiaohongshu/scripts && ./start-mcp.sh
```

### Troubleshooting: Scrape returns 0 posts

If the pipeline scrape step runs through all search terms but finds 0 new posts (each term
takes ~2 min and times out), the MCP server is likely using stale cookies.

**Why this happens:** The login tool (`xiaohongshu-login`) writes cookies to
`~/.agents/skills/xiaohongshu/scripts/cookies.json`, but the MCP server reads from
`/tmp/cookies.json` (copied from `~/.xiaohongshu/cookies.json` at startup). If you re-login,
the MCP server doesn't pick up the new cookies until restarted.

**Note:** `check_login_status` may report "logged in" even when cookies are stale — it uses a
lighter API path than `search_feeds`.

**Fix — refresh cookies and restart MCP:**
```bash
# 1. Copy fresh cookies to where MCP expects them
cp ~/.agents/skills/xiaohongshu/scripts/cookies.json /tmp/cookies.json
cp ~/.agents/skills/xiaohongshu/scripts/cookies.json ~/.xiaohongshu/cookies.json

# 2. Restart MCP server
cd ~/.agents/skills/xiaohongshu/scripts && ./stop-mcp.sh && ./start-mcp.sh

# 3. Verify search works (should return feeds JSON, not hang)
cd ~/.agents/skills/xiaohongshu/scripts && ./mcp-call.sh search_feeds '{"keyword": "湾区餐厅"}' 2>/dev/null | head -20

# 4. If still hanging, force a fresh login (delete cookies first)
rm /tmp/cookies.json ~/.xiaohongshu/cookies.json ~/.agents/skills/xiaohongshu/scripts/cookies.json
cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh   # Will show QR code
cp ~/.agents/skills/xiaohongshu/scripts/cookies.json /tmp/cookies.json
cp ~/.agents/skills/xiaohongshu/scripts/cookies.json ~/.xiaohongshu/cookies.json
cd ~/.agents/skills/xiaohongshu/scripts && ./stop-mcp.sh && ./start-mcp.sh
```

---

## Data Model

Each restaurant in `data/restaurant_database.json`:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (`pipeline_<timestamp>_<rand>`) |
| `name` | Chinese restaurant name |
| `name_en` | English name |
| `cuisine` | Cuisine type |
| `region` | Bay Area region (South Bay, Peninsula, East Bay) |
| `city` | City name |
| `address` | Street address (populated by Google enrichment) |
| `google_rating` | Google Maps rating (populated by enrichment) |
| `google_place_id` | Google Places ID |
| `verified` | `true` after successful Google enrichment |
| `recommendations` | Signature dishes (LLM extracted from XHS posts) |
| `sources` | XHS post IDs that mention this restaurant |
| `total_engagement` | Total XHS engagement (likes + comments) |
| `mention_count` | Number of XHS posts mentioning this restaurant |
| `merge_info.needs_review` | `true` until approved via review UI |
| `_status` | `rejected` or `duplicate_merged` if excluded from map |
