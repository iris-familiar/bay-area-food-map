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
│   ├── 02_extract_llm.js              # Extract candidates from posts (Kimi K2.5)
│   ├── 03_update_metrics.js           # Update engagement metrics for existing restaurants
│   ├── 04_merge.js                    # Merge candidates into DB (append-only, never deletes)
│   ├── 05_verify.js                   # Data integrity check (auto-restores backup on fail)
│   ├── 06_generate_index.js           # Generate slim index for frontend
│   ├── 07_commit.sh                   # Auto git commit if data changed
│   ├── enrich_google.js               # Google Places enrichment (manual, ~$0.017/restaurant)
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
3. **Extract** restaurant candidates from posts via Kimi LLM
4. **Update metrics** (engagement/trend) for existing restaurants
5. **Merge** new restaurants into database (flagged `needs_review: true`, no Google data yet)
6. **Apply corrections** from `data/corrections.json`
7. **Verify** data integrity — auto-restores backup if check fails
8. **Generate index** slim frontend JSON
9. **Commit** data changes to git

---

## New Restaurant Workflow

New restaurants added by the pipeline have no Google data and are hidden from the public map until reviewed. The full lifecycle:

```
Pipeline adds restaurant (needs_review: true, no Google data)
  → Review UI: approve or reject
      http://localhost:8080/review.html
  → Google enrichment (adds rating, address, coordinates):
      node pipeline/enrich_google.js --limit 20
  → Commit enriched data:
      npm run pipeline:dry
```

- **Approval** only clears `needs_review` — the restaurant appears in the map but without a rating or address until enrichment runs.
- **Google enrichment** filters on `verified: false` / missing `google_place_id`, independent of review status. Order doesn't matter — you can enrich before or after approving.
- **Edits made during approval** are saved to `corrections.json` and survive future pipeline runs.

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

- **Pending tab** — restaurants with `needs_review: true`; approve (with optional inline edits) or reject
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
cd ~/.agents/skills/xiaohongshu/scripts && ./status.sh
cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh
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
