# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
node dev.js                        # Local dev server → http://localhost:8080
npm test                           # Run verify.js (22+ checks, <10s, no deps)
npm run test:e2e                   # Full e2e integration test (real XHS + Kimi; ~15 min)
E2E_QUICK=1 node tests/e2e.js     # Quick e2e: skip scrape, use baked-in sample post (~2 min)
npm run pipeline                   # Full daily pipeline run
npm run pipeline:dry               # Dry-run: skip scraping, just verify + corrections

# Pipeline steps individually (all idempotent):
node pipeline/02_extract_llm.js data/raw/YYYY-MM-DD/ data/candidates/YYYY-MM-DD.json
node pipeline/04_merge.js data/restaurant_database.json data/candidates/YYYY-MM-DD.json data/restaurant_database.json
node pipeline/enrich_google.js --limit 20   # Google Places enrichment (~$0.017/restaurant)
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
          → 02_extract_llm.js (Kimi K2.5) → data/candidates/YYYY-MM-DD.json
          → 03_update_metrics.js (updates engagement/trend for existing restaurants)
          → 04_merge.js (append-only, never deletes) → data/restaurant_database.json
          → scripts/apply_corrections.js (applies data/corrections.json)
          → 05_verify.js (integrity check, auto-restores backup on failure)
          → 06_generate_index.js → data/restaurant_database_index.json (slim 33KB)
          → 07_commit.sh (auto git commit if data changed)
```

All orchestrated by `pipeline/run.sh`. Each step is independent and can be run alone.

### Frontend
- `index.html` — pure HTML template (~90 lines)
- `src/app.js` — all application JS (no build step, loaded via `<script src>`)
- `src/styles.css` — all styles (loaded via `<link rel="stylesheet">`)
- On load: fetches slim `restaurant_database_index.json` first, lazy-loads full DB on demand
- Reads `data/.pipeline_state.json` to display "last updated" timestamp in the header

### Key Files
- `data/restaurant_database.json` — source of truth (git-tracked)
- `data/restaurant_database_index.json` — slim version for fast page load (git-tracked)
- `data/corrections.json` — manual corrections that survive every pipeline run (git-tracked)
- `data/.pipeline_state.json` — written after each run; consumed by frontend
- `config.sh` — all paths and env vars; sourced by pipeline scripts (no hardcoded paths in shell scripts)

### API Keys (in `.env`, gitignored)
- `KIMI_API_KEY` — required for `02_extract_llm.js` (Kimi K2.5 LLM extraction)
- `GOOGLE_PLACES_API_KEY` — required for `pipeline/enrich_google.js`

### Data Integrity Patterns
- Auto-backup before every run; 7-day TTL; `05_verify.js` auto-restores if integrity fails
- `data/corrections.json` corrections are re-applied every run — edits here always win
- New restaurants from the pipeline enter with `merge_info.needs_review: true`
- `scripts/transaction.js` provides atomic write + rollback for `apply_corrections.js`

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

## Known Issue

`scripts/apply_corrections.js` has a hardcoded absolute path (`/Users/joeli/.openclaw/...`) instead of reading from `config.sh`. It works locally but will break on any other machine.
