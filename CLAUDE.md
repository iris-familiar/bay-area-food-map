# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
node dev.js                        # Local dev server → http://localhost:8080 (also serves /review.html)
npm test                           # Run verify.js (22+ checks, <10s, no deps)
npm run test:e2e                   # Full e2e integration test (real XHS + GLM-5; ~15 min)
E2E_QUICK=1 node tests/e2e.js     # Quick e2e: skip scrape, use baked-in sample post (~2 min)
npm run pipeline                   # Full daily pipeline run
npm run pipeline:dry               # Dry-run: skip scraping, just verify + corrections

# Pipeline steps individually (all idempotent):
node pipeline/02_extract_llm.js data/raw/YYYY-MM-DD/ data/candidates/YYYY-MM-DD.json
node pipeline/03_enrich_candidates.js data/candidates/YYYY-MM-DD.json  # Google Places enrichment
node pipeline/04_merge.js data/restaurant_database.json data/candidates/YYYY-MM-DD.json data/restaurant_database.json
node pipeline/enrich_google.js --limit 20   # Enrich existing unverified restaurants (~$0.017/restaurant)
node pipeline/review.js                      # Interactive candidate review CLI
node pipeline/review.js --auto-approve       # CI mode (no interaction)

# XHS login (if scrape step fails):
cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh
cd ~/.agents/skills/xiaohongshu/scripts && ./status.sh
```

## Architecture

### Data Flow
```
XHS posts → 01_scrape.sh → data/raw/YYYY-MM-DD/post_*.json
          → 02_extract_llm.js (GLM-5) → data/candidates/YYYY-MM-DD.json
          → 03_enrich_candidates.js (Google Places enrichment)
          → 04_merge.js (merge by place_id) → data/restaurant_database.json
          → 05_verify.js (integrity check, auto-restores backup on failure)
          → 06_generate_index.js → data/restaurant_database_index.json (slim ~50KB)
          → 07_commit.sh (auto git commit if data changed)
```

All orchestrated by `pipeline/run.sh`. Each step is independent and can be run alone.

### Frontend
- `index.html` — pure HTML template (~100 lines)
- `src/app.js` — all application JS (no build step, loaded via `<script src>`)
- `src/styles.css` — custom CSS with Apple + 小红书 design system (no external CSS frameworks)
- Design tokens in `:root` for consistent theming (colors, spacing, typography)
- On load: fetches slim `restaurant_database_index.json` first, lazy-loads full DB on demand
- Reads `data/.pipeline_state.json` to display "last updated" timestamp in the header

### Review UI (local dev only)
- `review.html` + `src/review.js` — browser-based data review at `http://localhost:8080/review.html`
- Pending tab: approve/reject restaurants that have `merge_info.needs_review: true`; edits applied before approval are written to `corrections.json`
- Approved tab: searchable list with inline editing; saves to both `restaurant_database.json` and `corrections.json`
- `dev.js` exposes write API routes (`POST /api/approve/:id`, `/api/reject/:id`, `/api/correct/:id`) that regenerate the index after each mutation

### Key Files
- `data/restaurant_database.json` — source of truth (git-tracked)
- `data/restaurant_database_index.json` — slim version for fast page load (git-tracked)
- `data/corrections.json` — manual corrections that survive every pipeline run (git-tracked)
- `data/.pipeline_state.json` — written after each run; consumed by frontend
- `config.sh` — all paths and env vars; sourced by pipeline scripts (no hardcoded paths in shell scripts)

### API Keys (in `.env`, gitignored)
- `GLM_API_KEY` — required for `02_extract_llm.js` (GLM-5 LLM extraction)
- `GOOGLE_PLACES_API_KEY` — required for `03_enrich_candidates.js` (Google Places enrichment)

### New Restaurant Lifecycle

New restaurants are Google-enriched during the pipeline and enter the database with `verified: true` and `needs_review: false`. No manual review is required.

**Manual corrections** (if needed):
1. Edit via `/review.html` browser UI
2. Changes save to both `restaurant_database.json` and `corrections.json`
3. Run `npm run pipeline:dry` to regenerate the index

**Enriching existing unverified restaurants:**
- Run `node pipeline/enrich_google.js --limit 20` to add Google data to restaurants that predate the new pipeline
- Filters on `!r.verified || !r.google_place_id`

### Data Integrity Patterns
- Auto-backup before every run; 7-day TTL; `05_verify.js` auto-restores if integrity fails
- Candidates that fail Google enrichment are skipped (only verified restaurants enter the database)
- New restaurants have `merge_info.needs_review: false` (no review needed)
- `scripts/transaction.js` provides atomic write + rollback for manual corrections
- **Duplicate prevention**: `enrich_google.js` checks for existing restaurants with the same `google_place_id` before assigning; merges engagement/sources/recommendations if found, marks duplicate as `_status: 'duplicate_merged'`
- Index generator excludes `duplicate_merged` entries from `restaurant_database_index.json`

### Cron Entry
```
0 11 * * * cd /path/to/project && bash pipeline/run.sh >> logs/cron.log 2>&1
```
Failed scrapes (XHS auth expiry) trigger an `openclaw system event` notification.

## Constraints (intentional — do not change without good reason)

- **No build step** — vanilla JS/CSS only; no bundler, no transpilation
- **No framework** — React/Vue would require build CI and dependency churn for a filtered list with modals
- **No backend/database** — 79–500 restaurants in a flat JSON is faster, auditable, and versionable; add a DB only when user-generated content is needed
- **No Docker** — single-Mac deployment

### Fix Philosophy

All bug fixes must be future-proof: they should resolve the current issue AND prevent recurrence in future pipeline runs. Fix the root cause in the pipeline code, not just patch existing data.

## Known Issue

`scripts/apply_corrections.js` has a hardcoded absolute path (`/Users/joeli/.openclaw/...`) instead of reading from `config.sh`. It works locally but will break on any other machine.
