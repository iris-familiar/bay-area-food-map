# 湾区美食地图 — Engineering Roadmap

> Last updated: 2026-02-19  
> Status: Post-refactor cleanup complete. Pipeline operational.

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

### 🔴 P0 — Fix Before Next Run

#### 1. XHS Login Expiry = Silent Scrape Skip
**Problem:** When XHS cookies expire, `01_scrape.sh` logs a warning and exits 0. The pipeline continues without new data, and nobody knows.  
**Fix:** Pipeline should send a notification when scrape is skipped due to auth failure. Also add `last_scrape_at` to `data/.pipeline_state.json` so we can detect staleness.

```bash
# In run.sh, after scrape:
if [ ! -f "$RAW_DIR/.scrape_complete" ]; then
    openclaw system event --text "⚠️ XHS scrape skipped: not logged in. Run: cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh" --mode now
fi
```

#### 2. Regex Extraction is Too Fragile
**Problem:** `02_extract.js` uses regex patterns to find restaurant names. These miss 80%+ of actual restaurants in posts (which are mentioned naturally in text, not in brackets).  
**Better approach:** The old codebase had `v8_llm_extraction_prod.js` which used an LLM to extract restaurant names from post text. That approach is fundamentally better for this use case.  
**Fix:** Replace `02_extract.js` with an LLM-based extractor (see P1-3 below).

---

### 🟡 P1 — High Value, Next Sprint

#### 3. LLM-Based Restaurant Extraction
**Problem:** Natural language mentions like "去了趟Cupertino的一家湘菜，叫留湘小聚..." aren't caught by bracket patterns.  
**Proposed:** `02_extract.js` sends post text + comments to an LLM with a structured prompt:
```
Given this XiaoHongShu post about Bay Area food, extract any restaurant names mentioned.
Return JSON: {"restaurants": [{"name": "...", "city": "...", "cuisine": "...", "dishes": [...]}]}
```
This also gives us city, cuisine, and dishes in one pass — eliminating the need for a separate enrichment step.

**Estimated effort:** 2-3 hours. Reuse pattern from old `v8_llm_extraction_prod.js`.

#### 4. Engagement Score Updates for Existing Restaurants
**Problem:** Once a restaurant is in the database, its `total_engagement` and `mention_count` never update. A restaurant that gets 50 new XHS posts this week still shows old numbers.  
**Fix:** Add `05_update_metrics.js` to the pipeline:
- For each new post, check if it mentions any existing restaurant
- If yes, increment `mention_count`, update `total_engagement`, append to `sources`
- Update `trend_30d` (posts in last 30 days)

**Impact:** This is what makes the engagement/trending data meaningful over time.

#### 5. Pipeline State & Monitoring
**Problem:** No way to see if the pipeline ran successfully today without grepping logs.  
**Fix:** Write `data/.pipeline_state.json` after every run:
```json
{
  "last_run": "2026-02-19T11:00:00Z",
  "status": "success",
  "restaurants_before": 79,
  "restaurants_after": 81,
  "new_posts_scraped": 12,
  "new_restaurants_added": 2,
  "scrape_status": "ok"
}
```
Frontend can display this (last updated timestamp). Cron can alert on failure.

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

## Proposed Pipeline (Target State)

```
01_scrape.sh          → data/raw/YYYY-MM-DD/post_*.json
02_extract_llm.js     → data/candidates/YYYY-MM-DD.json  (LLM extraction)
03_update_metrics.js  → update engagement/trend for EXISTING restaurants
04_merge.js           → data/restaurant_database.json    (append-only, reviewed candidates only)
05_verify.js          → integrity check, auto-restore
06_generate_index.js  → data/restaurant_database_index.json  (slim for frontend)
07_commit.sh          → git commit "data: YYYY-MM-DD pipeline (+N new, M updated)"
```

Each step is independent, idempotent, and can be run in isolation.

---

## Proposed Directory Structure (Target State)

```
bay-area-food-map/
├── index.html                    # Thin HTML template
├── src/
│   ├── app.js                    # All frontend JS (extracted from index.html)
│   └── styles.css                # All CSS (extracted from index.html)
├── dev.js                        # Local dev server
├── config.sh                     # Environment config (sourced by pipeline)
│
├── data/
│   ├── restaurant_database.json  # Published restaurants (source of truth)
│   ├── restaurant_database_index.json  # Slim version for fast initial load
│   ├── corrections.json          # Manual corrections (git tracked)
│   ├── candidates/               # Pipeline outputs pending review (gitignored)
│   ├── raw/                      # Daily scraped posts (gitignored)
│   └── backups/                  # Auto-backups (gitignored)
│
├── pipeline/
│   ├── run.sh                    # Orchestrator (cron entry point)
│   ├── 01_scrape.sh              # XHS data collection
│   ├── 02_extract_llm.js         # LLM restaurant extraction
│   ├── 03_update_metrics.js      # Engagement updates for existing restaurants
│   ├── 04_merge.js               # Safe append-only merge
│   ├── 05_verify.js              # Integrity check
│   ├── 06_generate_index.js      # Build slim frontend index
│   └── review.js                 # Interactive candidate review (manual step)
│
├── scripts/
│   ├── apply_corrections.js      # Apply data/corrections.json
│   └── transaction.js            # Atomic write helper
│
└── tests/
    └── pipeline.test.js          # Unit tests for merge/verify logic
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

Pick up from **P0 issues first**:

1. **Fix XHS auth notification** (30 min) — add alert to `run.sh` when scrape is skipped
2. **Replace regex extractor with LLM** (2-3 hrs) — `02_extract_llm.js` based on old `v8_llm_extraction_prod.js`
3. **Add metrics update step** (2 hrs) — `03_update_metrics.js`

Then test a full pipeline run with live XHS data to see if the end-to-end flow works.

---

*Written with the perspective of: senior software engineer (architecture), data engineer (pipeline design), frontend engineer (UI/UX scalability).*
