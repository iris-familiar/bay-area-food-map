# 湾区美食地图 — Engineering Roadmap

> Last updated: 2026-02-22 (v5 — Pipeline redesigned with Google Place ID matching)
> Status: Pipeline fully operational. Google enrichment integrated. No more manual review required.

---

## Bug Fixes

- **2026-02-19** — Fixed `讨论度` always showing 0: `src/app.js` was reading `r.engagement` but the database stores this as `r.total_engagement`. Field name corrected in sort, card view, and modal (3 occurrences).

## Current State (as of 2026-02-19)

### Data
| Metric | Value |
|--------|-------|
| Total restaurants | 79 |
| With dishes (recommendations) | 43 (54%) |
| With Google Maps data | 78 (99%) |
| Google-verified | 8 (10%) |
| Regions | South Bay 55 · East Bay 18 · SF 3 · Peninsula 3 |
| DB size | ~80KB JSON |

### Architecture
```
XHS MCP → pipeline/01_scrape.sh
         → pipeline/02_extract.js   (regex-based candidate extraction)
         → pipeline/03_merge.js     (safe append-only merge)
         → pipeline/04_verify.js    (integrity check + auto-restore)
         → data/restaurant_database.json
                ↓
         index.html (vanilla JS, fetches full JSON on load)
```

### What works
- ✅ Daily cron at 11:00 AM (fixed — was silently failing for days)
- ✅ Auto-backup before every run, auto-restore on verify failure
- ✅ `data/corrections.json` — manual corrections survive pipeline runs
- ✅ Clean git history, single source of truth

### Known Weaknesses
See P0/P1 issues below.

---

## Issues & Improvements (Prioritized)

### ✅ P0 — DONE (2026-02-19)

#### 1. XHS Login Expiry Notification ✅
**Fixed:** `run.sh` now sends an `openclaw system event` alert when the XHS scrape is skipped due to auth failure.
Touch sentinel `.scrape_complete` when scrape succeeds; alert if absent after scrape step.

#### 2. LLM-Based Restaurant Extraction ✅
**Fixed:** Replaced fragile regex `02_extract.js` with `02_extract_llm.js` using Kimi K2.5 (Kimi Code API).
- Extracts restaurant name, city, cuisine, dishes, sentiment in one LLM pass
- Rate-limited: max 30 posts/run, 500ms between API calls
- Graceful fallback: parse errors → empty array (pipeline continues)
- Requires `KIMI_API_KEY` in `.env`

---

### ✅ P1 — DONE (2026-02-19)

#### 3. Engagement Metric Updates ✅
**Implemented:** `03_update_metrics.js` — runs before merge step.
- Matches new post candidates against existing restaurants by normalized name
- Increments `mention_count`, `total_engagement`, appends to `sources[]`
- Maintains `trend_30d` (rolling 90-day window of `{date, count, engagement}`)
- Appends new LLM-extracted dishes to `recommendations[]` (deduped)
- Weighted sentiment update (10% weight to new signal)

#### 4. Pipeline State & Monitoring ✅
**Implemented:** `run.sh` writes `data/.pipeline_state.json` after every run:
```json
{
  "last_run": "2026-02-19T15:51:26Z",
  "status": "success",
  "restaurants_total": 79,
  "restaurants_added": 0,
  "restaurants_metrics_updated": 0,
  "posts_scraped": 0,
  "scrape_ok": true,
  "dry_run": false
}
```
Frontend now reads this and displays "更新于 X月Y日 HH:MM" in the header subtitle.

**Also done as part of P1:**
- `config.sh` — centralised paths/env, sourced by `run.sh` (no more hardcoded paths)
- `06_generate_index.js` — slim 33KB index for fast initial page load (74% smaller than full DB)
- `index.html` loads slim index first, falls back to full DB; lazy-loads pipeline state for timestamp

---

### ✅ P2 — DONE (2026-02-19)

#### 6. Candidate Review Workflow ✅
**Implemented:** `pipeline/review.js` — interactive CLI for reviewing new candidates before they enter the main DB.
- Keys: [y] approve / [n] reject / [s] skip / [q] quit & save
- Approved candidates written to `data/candidates/approved/YYYY-MM-DD.json`
- `--auto-approve` flag for CI/unattended mode
- `--date YYYY-MM-DD` to review a specific day's candidates

#### 7. Frontend: Component Extraction ✅
**Implemented:**
- `index.html` reduced from 517 → ~90 lines (pure HTML template)
- All JS extracted to `src/app.js` (no build step, plain `<script src>`)
- All CSS extracted to `src/styles.css` (plain `<link rel="stylesheet">`)

#### 8. Auto Git Commit After Pipeline ✅
**Implemented:** `pipeline/07_commit.sh` — called by `run.sh` after each successful run.
- Only commits if tracked data files actually changed (idempotent)
- Commit message: `data: YYYY-MM-DD pipeline +N restaurants (total: X)`

#### 9. Google Places Enrichment ✅ (P3 pulled forward)
**Implemented:** `pipeline/enrich_google.js`
- Searches Google Places API for each unverified restaurant
- Picks best match by Levenshtein name similarity (threshold: 40%)
- Populates: `google_place_id`, `address`, `google_rating`, `lat/lng`, `verified=true`
- Usage: `node pipeline/enrich_google.js --limit 20`
- Requires: `GOOGLE_PLACES_API_KEY` in `.env`
- Cost: ~$0.017/restaurant (Text Search + Place Details)

---

### 🔵 P3 — Longer Term

#### 10. Google Places Verification ✅ (done in P2)

#### 11. Timeseries Tracking ✅
**Implemented:** Replaced `trend_30d` (scalar) with `timeseries` (monthly array):
```json
"timeseries": [
  {"month": "2026-01", "mentions": 3, "engagement": 45},
  {"month": "2026-02", "mentions": 7, "engagement": 112}
]
```
- `03_update_metrics.js`: writes monthly entries, keeps last 24 months; inline migration resets any legacy scalar to `[]`
- `04_merge.js`: new restaurants start with `timeseries: []`
- `06_generate_index.js`: includes last 12 months in slim index
- `src/app.js` `generateChart()`: uses `timeseries` directly if present; falls back to `post_details` aggregation

#### 12. Structured Error Recovery for XHS Auth ✅
**Implemented:**
- `01_scrape.sh`: exits with code `2` (not `0`) on auth failure so `run.sh` correctly sets `SCRAPE_OK=false`
- `run.sh` `write_state()`: adds `"last_scrape_at"` field — updated only on successful scrapes, preserved otherwise
- `run.sh` startup health check: reads previous `last_scrape_at`; if >3 days old, fires a recurring notification every run until auth is restored

---

## Current Pipeline (as of 2026-02-22)

```
run.sh (cron entry)
  ├── 01_scrape.sh          → data/raw/YYYY-MM-DD/post_*.json  (XHS MCP)
  ├── 02_extract_llm.js     → data/candidates/YYYY-MM-DD.json  (GLM-5 LLM)
  ├── 03_enrich_candidates.js → enrich candidates with Google Places data
  ├── 04_merge.js           → data/restaurant_database.json    (merge by place_id)
  ├── 05_verify.js          → integrity check, auto-restore on fail
  ├── 06_generate_index.js  → data/restaurant_database_index.json (slim, 74% smaller)
  ├── write .pipeline_state.json
  ├── 07_commit.sh          → git commit "data: YYYY-MM-DD +N restaurants"
  └── notify on auth failure or new restaurants
```

Each step is independent, idempotent, and can be run in isolation.

---

## Current Directory Structure ✅

```
bay-area-food-map/
├── .env                          # API keys (gitignored)
├── .gitignore
├── README.md
├── ROADMAP.md
├── config.sh                     # Centralised paths + env (sourced by pipeline)
├── dev.js                        # Local dev server → http://localhost:8080
├── index.html                    # Frontend (single-page, no build step)
├── package.json                  # scripts: dev / pipeline / pipeline:dry / test / test:e2e
│
├── data/
│   ├── restaurant_database.json       # Source of truth (git tracked)
│   ├── restaurant_database_index.json # Slim 33KB for fast page load (git tracked)
│   ├── corrections.json               # Manual corrections (git tracked)
│   ├── .pipeline_state.json           # Written by run.sh after each run
│   ├── raw/                           # Daily scraped posts (gitignored)
│   ├── candidates/                    # LLM extraction output (gitignored)
│   └── backups/                       # Auto-backups, 7-day TTL (gitignored)
│
├── pipeline/
│   ├── run.sh                    # Orchestrator — cron calls this
│   ├── 01_scrape.sh              # XHS MCP → data/raw/YYYY-MM-DD/
│   ├── 02_extract_llm.js         # GLM-5 LLM → data/candidates/YYYY-MM-DD.json
│   ├── 03_enrich_candidates.js   # Google Places enrichment for candidates
│   ├── 04_merge.js               # Merge by place_id into restaurant_database.json
│   ├── 05_verify.js              # Integrity check + auto-restore
│   └── 06_generate_index.js      # Regenerate slim index
│
├── scripts/
│   ├── apply_corrections.js      # Manual use only — apply data/corrections.json
│   └── transaction.js            # Atomic write + rollback helper
│
└── tests/
    ├── verify.js                 # 22-check functional test suite (no deps, <10s)
    └── e2e.js                    # Full end-to-end integration test (real XHS + Kimi LLM)
```

---

### ✅ P4 — DONE (2026-02-21)

#### 13. Switch LLM to Kimi K2.5 ✅
**Implemented:** `pipeline/02_extract_llm.js` migrated from Gemini to Kimi Code API.
- Endpoint: `https://api.kimi.com/coding/v1/chat/completions`, model `kimi-for-coding`
- OpenAI-compatible request format; `User-Agent: KimiCLI/1.3` header required
- Requires `KIMI_API_KEY` in `.env`

#### 14. XHS MCP JSON-RPC Envelope Fix ✅
**Fixed:** All three MCP tool calls in `01_scrape.sh` updated to unwrap the JSON-RPC envelope (`result.content[0].text`) before parsing:
- `check_login_status`: now correctly detects `已登录`
- `search_feeds`: now reads `interactInfo` from inside `noteCard`; handles string counts
- `get_feed_detail`: param renamed `note_id` → `feed_id`; response normalized from `data.note.*` to flat structure

#### 15. Merge Field Propagation Fix ✅
**Fixed:** `pipeline/04_merge.js` was hardcoding `city/cuisine/price_range: 'unknown'` instead of using candidate values. Now correctly propagates all candidate fields into the merged restaurant.

#### 16. End-to-End Integration Test ✅
**Implemented:** `tests/e2e.js` — full live pipeline test, no mocks.
- 7 phases: setup → real XHS scrape → real Kimi extraction → merge → verify → approve + index → frontend shape
- `E2E_QUICK=1` mode skips scrape, uses baked-in sample post for fast local dev testing
- Sample post named `post_000_test_001.json` to sort before all scraped hex-ID posts
- Extraction capped at 10 posts with 420s timeout (worst case: 10 × 30s Kimi timeout)
- Run: `node tests/e2e.js` or `npm run test:e2e`

---

### ✅ P5 — DONE (2026-02-22)

#### 17. Pipeline Redesign with Google Place ID Matching ✅
**Implemented:** Complete pipeline redesign to use Google Place ID as the unique identifier for deduplication.

**Changes:**
- **NEW:** `pipeline/03_enrich_candidates.js` — Enriches LLM candidates with Google Places data before merging
- **MODIFIED:** `pipeline/04_merge.js` — Now uses `google_place_id` for matching instead of name-based matching
  - Updates existing restaurants when place_id matches (metrics, engagement, dishes)
  - Adds new restaurants with `verified: true`, `needs_review: false`
- **DELETED:** `pipeline/03_update_metrics.js` — Functionality absorbed into new merge script
- **REMOVED:** `apply_corrections.js` step from pipeline (kept for manual use only)

**Benefits:**
- No more duplicates from bilingual name variations (e.g., "香小馆 Shang Cafe" vs "香小馆")
- No manual review required — all merged restaurants are Google-verified
- CJK-aware matching: trusts Google's top result if city matches
- Non-CJK matching: requires ≥40% name similarity

**Cost:** ~$0.017 per candidate (Text Search + Place Details)

---

## What NOT to Build (Anti-patterns)

- **No backend API** — The data is static enough that a JSON file served by nginx is simpler and faster than an API server. Add an API only when you need user-generated content or real-time data.
- **No database (SQLite/Postgres)** — 79–500 restaurants in a JSON file is fast, auditable, and versionable with git. A database adds operational overhead without benefit at this scale.
- **No React/Vue/etc** — The app is a filtered list with modals. Vanilla JS handles this fine. A framework would require a build step, CI, and ongoing dependency updates.
- **No Docker** — This runs on a single Mac. Docker adds complexity without benefit here.

---

## Next Session: Where to Start

P0–P5 are done. The pipeline is fully operational with Google Place ID-based deduplication. Potential next improvements:

1. **Backfill existing unverified restaurants** — Run `node pipeline/enrich_google.js --all` to add Google data to the remaining unverified restaurants
2. **Clean up duplicates** — The database may have duplicates from old name-based matching (香小馆, 眷湘, 外婆家常菜) — use `/review.html` to mark as `duplicate_merged`
3. **Increase scrape yield** — current scrape saves ~23-30 posts in 600s; could tune search terms or parallelize
4. **More Bay Area content** — tune search terms or expand BAY_AREA_SIGNALS

---

*Written with the perspective of: senior software engineer (architecture), data engineer (pipeline design), frontend engineer (UI/UX scalability).*
