# 湾区美食地图 — Engineering Roadmap

> Last updated: 2026-02-19 (v2 — P0+P1 implemented)
> Status: Pipeline fully operational. LLM extraction active. Monitoring live.

---

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
**Fixed:** Replaced fragile regex `02_extract.js` with `02_extract_llm.js` using Gemini 1.5 Flash.
- Extracts restaurant name, city, cuisine, dishes, sentiment in one LLM pass
- Rate-limited: max 30 posts/run, 500ms between API calls
- Graceful fallback: parse errors → empty array (pipeline continues)
- Requires `GEMINI_API_KEY` in `.env`

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

### 🟢 P2 — Architecture Improvements

#### 6. Separate "Candidates" from "Published" Restaurants
**Problem:** Currently `03_merge.js` adds new restaurants with `needs_review: true` directly into `restaurant_database.json`. This means unvetted data appears on the frontend immediately.  
**Better design:**
```
data/
├── restaurant_database.json      ← Published (manually reviewed)
├── candidates/YYYY-MM-DD.json    ← Pipeline output (pending review)
└── corrections.json              ← Manual fixes
```
Add a lightweight review step: `node pipeline/review.js` shows candidates with a Y/N prompt before they get merged into the main DB. This keeps the map high-quality.

#### 7. Frontend: Split Data Loading
**Problem:** `index.html` fetches the full 125KB JSON on every page load. At 79 restaurants this is fine, but at 300+ restaurants it will slow down initial render.  
**Fix:** Split the data:
```
data/
├── restaurant_database.json       ← Full data (used for detail modal)
└── restaurant_database_index.json ← Slim version for list view (name, region, cuisine, rating only)
```
`index.html` loads the slim index first (fast render), then lazy-loads full data only when a modal opens.

**Implementation:** Add a `pipeline/06_generate_index.js` step that outputs the slim file. ~1 hour.

#### 8. Frontend: Component Extraction
**Problem:** `index.html` is 492 lines of HTML + inline CSS + inline JS. This is already at the limit of maintainability. Adding features means this file becomes unmanageable.  
**Proposed:** Keep the single-file architecture (no build step) but extract JS into `src/app.js` and CSS into `src/styles.css`. No bundler needed — just `<script src="src/app.js">` and `<link rel="stylesheet" href="src/styles.css">`. The HTML stays as a clean template.

**Note:** Full React/Vue migration is NOT recommended here. The app is inherently simple (filter + display). Complexity of a framework outweighs the benefits at this scale.

#### 9. Environment Config File
**Problem:** Scripts have hardcoded absolute paths (`/Users/joeli/...`). This breaks if the project moves.  
**Fix:** Add `config.sh` sourced by all pipeline scripts:
```bash
# config.sh — Project configuration
export PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DB_FILE="${PROJECT_ROOT}/data/restaurant_database.json"
export XHS_MCP_DIR="${HOME}/.agents/skills/xiaohongshu/scripts"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"  # From env
```

---

### 🔵 P3 — Longer Term

#### 10. Google Places Verification for New Restaurants
**Problem:** 71/79 restaurants are unverified (no confirmed Google Maps match). The `merge_info.needs_review` flag exists but there's no workflow to act on it.  
**Proposed:** Add `pipeline/enrich_google.js`:
- For each unverified restaurant, search Google Places API
- If high confidence match: populate `google_place_id`, `address`, `google_rating`, set `verified: true`
- If ambiguous: flag for manual review

#### 11. Timeseries Tracking
**Problem:** `trend_30d` field exists in the schema but isn't maintained by the pipeline.  
**Proposed:** Store monthly mention counts per restaurant:
```json
"timeseries": [
  {"month": "2026-01", "mentions": 3, "engagement": 45},
  {"month": "2026-02", "mentions": 7, "engagement": 112}
]
```
This powers the "trending" chart in the modal and enables genuine discovery of rising restaurants.

#### 12. Structured Error Recovery for XHS Auth
**Problem:** XHS cookies expire ~2-4 weeks. Every time they do, the pipeline silently skips scraping until someone notices.  
**Proposed:** Trigger a cron notification when `last_scrape_at` is >3 days ago, prompting manual re-login. Longer term, explore whether the MCP can auto-refresh via session tokens.

---

## Current Pipeline (as of 2026-02-19)

```
run.sh (cron entry)
  ├── 01_scrape.sh          → data/raw/YYYY-MM-DD/post_*.json  (XHS MCP)
  ├── 02_extract_llm.js     → data/candidates/YYYY-MM-DD.json  (Gemini LLM)
  ├── 03_update_metrics.js  → IN-PLACE: update metrics for existing restaurants
  ├── 04_merge.js           → data/restaurant_database.json    (append-only)
  ├── scripts/apply_corrections.js → apply data/corrections.json
  ├── 05_verify.js          → integrity check, auto-restore on fail
  ├── 06_generate_index.js  → data/restaurant_database_index.json (slim, 74% smaller)
  └── write .pipeline_state.json + notify on auth failure or new restaurants
```

Each step is independent, idempotent, and can be run in isolation.

**TODO (P2):** Add `07_commit.sh` — auto git commit "data: YYYY-MM-DD +N restaurants"

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
├── package.json                  # 4 scripts: dev / pipeline / pipeline:dry / test
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
│   ├── 02_extract_llm.js         # Gemini LLM → data/candidates/YYYY-MM-DD.json
│   ├── 03_update_metrics.js      # Update engagement/trend for existing restaurants
│   ├── 04_merge.js               # Append-only merge into restaurant_database.json
│   ├── 05_verify.js              # Integrity check + auto-restore
│   └── 06_generate_index.js      # Regenerate slim index
│
├── scripts/
│   ├── apply_corrections.js      # Apply data/corrections.json (called by run.sh)
│   └── transaction.js            # Atomic write + rollback helper
│
└── tests/
    └── verify.js                 # 22-check functional test suite (no deps, <10s)
```

---

## What NOT to Build (Anti-patterns)

- **No backend API** — The data is static enough that a JSON file served by nginx is simpler and faster than an API server. Add an API only when you need user-generated content or real-time data.
- **No database (SQLite/Postgres)** — 79–500 restaurants in a JSON file is fast, auditable, and versionable with git. A database adds operational overhead without benefit at this scale.
- **No React/Vue/etc** — The app is a filtered list with modals. Vanilla JS handles this fine. A framework would require a build step, CI, and ongoing dependency updates.
- **No Docker** — This runs on a single Mac. Docker adds complexity without benefit here.
- **No microservices** — Same reasoning. The pipeline is a simple sequential bash script.

---

## Next Session: Where to Start

P0 and P1 are done. Pick up from **P2**:

1. **Candidate review workflow** (2 hrs) — `pipeline/review.js` interactive CLI; new restaurants queue in `data/candidates/` before going live
2. **Auto git commit after pipeline** (30 min) — `07_commit.sh`: `git add data/ && git commit -m "data: YYYY-MM-DD +N restaurants"`
3. **Frontend component split** (2-3 hrs) — extract inline JS to `src/app.js`, CSS to `src/styles.css`
4. **Google Places enrichment for new restaurants** (P3) — `pipeline/enrich_google.js` using existing `GOOGLE_PLACES_API_KEY`

**Before any of the above:** Test a real pipeline run with live XHS data (not dry-run) to validate the full end-to-end LLM extraction flow.

---

*Written with the perspective of: senior software engineer (architecture), data engineer (pipeline design), frontend engineer (UI/UX scalability).*
