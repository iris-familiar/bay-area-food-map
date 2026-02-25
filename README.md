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
│   ├── restaurant_database.json       # ← Single source of truth (92+ restaurants)
│   ├── restaurant_database_index.json # Slim version for fast page load (~50KB)
│   ├── corrections.json               # Manual corrections (re-applied every pipeline run)
│   ├── candidates/                    # Daily LLM-extracted candidates (gitignored)
│   ├── raw/                           # Daily scraped XHS posts (gitignored)
│   └── backups/                       # Auto-backups, 7-day TTL (gitignored)
│
├── pipeline/
│   ├── run.sh                         # ← Main entry point (cron calls this)
│   ├── 01_scrape.sh                   # Scrape new XHS posts via MCP
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

## Google Enrichment

```bash
node pipeline/enrich_google.js             # Enrich up to 10 unverified restaurants
node pipeline/enrich_google.js --limit 20  # Up to 20 (~$0.34)
node pipeline/enrich_google.js --dry-run   # Preview what would be enriched
node pipeline/enrich_google.js --all       # All unverified
```

Requires `GOOGLE_PLACES_API_KEY` in `.env`. Cost: ~$0.017/restaurant.

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
