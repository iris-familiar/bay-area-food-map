# 湾区美食地图 (Bay Area Food Map)

A curated map of Bay Area Chinese restaurants discovered through XiaoHongShu (小红书).

**Live:** http://localhost:8080 (run `node dev.js`)

---

## Project Structure

```
bay-area-food-map/
├── index.html                    # Frontend (single-page app, no build step)
├── dev.js                        # Local dev server → http://localhost:8080
│
├── data/
│   ├── restaurant_database.json  # ← Single source of truth (79+ restaurants)
│   ├── corrections.json          # Manual corrections (preserved through pipeline)
│   └── raw/                      # Daily scraped XHS posts (gitignored)
│
├── pipeline/
│   ├── run.sh                    # ← Main entry point (cron calls this)
│   ├── 01_scrape.sh              # Scrape new XHS posts via MCP
│   ├── 02_extract.js             # Extract restaurant candidates from posts
│   ├── 03_merge.js               # Safely merge candidates into database
│   └── 04_verify.js              # Data integrity check (auto-restores on fail)
│
└── scripts/
    ├── apply_corrections.js      # Apply manual data corrections
    └── transaction.js            # Transaction/rollback helper
```

---

## Daily Pipeline

Runs automatically at 11:00 AM via cron:

```bash
# Manual run:
bash pipeline/run.sh

# Dry run (no scraping, just verify + corrections):
bash pipeline/run.sh --dry-run
```

**Pipeline steps:**
1. **Backup** current database
2. **Scrape** new XHS posts (via MCP — skips if not logged in)
3. **Extract** restaurant candidates from posts
4. **Merge** new restaurants into database (never deletes existing)
5. **Corrections** apply manual fixes from `data/corrections.json`
6. **Verify** data integrity — auto-restores backup if check fails

---

## Fallback / Recovery

```bash
# Option 1: Restore from pipeline backup (last 7 days kept)
ls data/backups/
cp data/backups/restaurant_database_YYYYMMDD_HHMMSS.json data/restaurant_database.json

# Option 2: Restore from git
git log --oneline data/restaurant_database.json
git checkout <commit> -- data/restaurant_database.json

# Option 3: Restore pre-refactor state
git checkout pre-refactor-20260219_072358 -- data/
```

---

## Local Development

```bash
node dev.js    # http://localhost:8080
```

---

## XHS MCP Setup

The pipeline uses the XiaoHongShu MCP skill:

```bash
# Check login status
cd ~/.agents/skills/xiaohongshu/scripts && ./status.sh

# Log in (if not logged in)
cd ~/.agents/skills/xiaohongshu/scripts && ./login.sh
```

---

## Data Model

Each restaurant in `data/restaurant_database.json`:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `name` | Chinese restaurant name |
| `name_en` | English name |
| `cuisine` | Cuisine type |
| `region` | Bay Area region (South Bay, East Bay, etc.) |
| `city` | City name |
| `address` | Street address |
| `google_rating` | Google Maps rating |
| `recommendations` | Signature dishes (LLM extracted) |
| `sources` | XHS post IDs that mention this restaurant |
| `total_engagement` | Total XHS engagement (likes + comments) |
| `verified` | Whether Google Maps verified |
