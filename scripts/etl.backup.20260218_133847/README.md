# ETL Pipeline - Phase 2 Implementation

## Overview

Complete ETL pipeline implementation for the Bay Area Food Map project. This pipeline transforms raw restaurant data from various sources into a clean, standardized golden dataset.

## Quick Start

```bash
cd projects/bay-area-food-map/scripts/etl
npm install

# Verify installation
node verify.js

# Run full pipeline
node cli.js --mode full --input data/raw/posts.json

# Dry run (validation only)
node cli.js --mode dry-run --input data/raw/posts.json
```

## Modules

| Module | File | Description |
|--------|------|-------------|
| Standardize | `standardize.js` | Transforms raw data to unified schema, geocodes addresses |
| Clean | `clean.js` | Deduplicates, validates, filters records |
| Merge | `merge.js` | Merges with golden dataset, resolves conflicts |
| Quality | `quality.js` | Runs quality checks, generates reports |

## Pipeline Flow

```
Raw Data → Standardize → Clean → Merge → Quality → Golden Dataset
```

### 1. Standardize
- Detects input format (Xiaohongshu, CSV, Google Places)
- Transforms to unified schema
- Geocodes addresses (Google Places API)
- Normalizes names and fields

### 2. Clean
- Removes blocked names (locations, generic terms)
- Deduplicates by google_place_id or name + address
- Validates required fields and data types
- Detects and optionally removes outliers

### 3. Merge
- Archives current golden dataset
- Finds matches between incoming and existing records
- Resolves conflicts (timestamp, engagement, verified, manual)
- Creates new records or updates existing ones

### 4. Quality
- Completeness checks (required/recommended fields)
- Accuracy validation (ranges, formats, Bay Area location)
- Consistency verification (cross-field checks)
- Generates quality reports and flags issues

## Configuration

### Environment Variables
```bash
export GOOGLE_PLACES_API_KEY="your_api_key"
export LOG_LEVEL="INFO"  # DEBUG, INFO, WARN, ERROR
```

### Module Options
See `docs/ETL_USAGE_GUIDE.md` for complete configuration reference.

## Usage

### Programmatic
```javascript
const { runPipeline } = require('./scripts/etl');

const result = await runPipeline(rawData, {
  dryRun: false,
  logLevel: 'INFO',
  standardize: { enableGeocoding: true },
  clean: { deduplicate: true },
  merge: { conflictStrategy: 'timestamp' },
  quality: { completenessThreshold: 0.9 }
});

console.log(result.stats);
console.log(result.quality.overall_score);
```

### CLI
```bash
# Full pipeline
node cli.js --mode full -i data/raw.json -o data/golden.json

# Individual stages
node cli.js --mode standardize -i data/raw.json
node cli.js --mode clean -i data/staging.json
node cli.js --mode merge -i data/cleaned.json
node cli.js --mode quality

# With options
node cli.js --mode full --dry-run --log-level DEBUG
```

## Testing

```bash
# Run all tests
npm test

# Integration tests only
npm run test:integration

# With coverage
npm run test:coverage
```

## Project Structure

```
projects/bay-area-food-map/
├── scripts/etl/
│   ├── index.js              # Pipeline orchestrator
│   ├── cli.js                # Command-line interface
│   ├── standardize.js        # Module 1: Standardization
│   ├── clean.js              # Module 2: Cleaning
│   ├── merge.js              # Module 3: Merging
│   ├── quality.js            # Module 4: Quality
│   ├── verify.js             # Verification script
│   ├── utils/
│   │   ├── logger.js         # Structured logging
│   │   ├── validators.js     # Data validation
│   │   └── stream-utils.js   # Stream processing
│   └── package.json
├── tests/etl/
│   └── integration.test.js   # Integration tests
├── data/
│   ├── raw/                  # Input data
│   ├── staging/              # Intermediate
│   └── golden/               # Output dataset
│       ├── current/
│       └── archive/
├── docs/
│   ├── PIPELINE_REFACTOR_ARCHITECTURE.md
│   └── ETL_USAGE_GUIDE.md
```

## Features

- ✅ **Multiple input formats** (Xiaohongshu, CSV, Google Places)
- ✅ **Google Places API integration** for geocoding
- ✅ **Deduplication** (exact + fuzzy matching)
- ✅ **Data validation** (schema, ranges, formats)
- ✅ **Conflict resolution** (4 strategies)
- ✅ **Version control** (archived versions)
- ✅ **Quality reporting** (completeness, accuracy, consistency)
- ✅ **Dry-run mode** for safe testing
- ✅ **Stream processing** for large datasets
- ✅ **Comprehensive logging**

## Output Schema

```json
{
  "id": "uuid",
  "google_place_id": "ChIJ...",
  "name": "Restaurant Name",
  "name_normalized": "restaurant name",
  "address": "123 Main St",
  "location": { "lat": 37.7749, "lng": -122.4194 },
  "cuisine": ["Chinese"],
  "area": "SF",
  "phone": "+1-415-555-0123",
  "website": "https://example.com",
  "rating": 4.5,
  "price_level": 2,
  "engagement": { "total": 130, "likes": 100, "comments": 20, "shares": 10 },
  "recommendations": ["Kung Pao Chicken"],
  "sources": [{ "platform": "xiaohongshu", "post_id": "abc123" }],
  "verified": true,
  "version": 1,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-06-01T00:00:00Z"
}
```

## Architecture Document

See `docs/PIPELINE_REFACTOR_ARCHITECTURE.md` for detailed architecture specification.

## License

Part of Bay Area Food Map project.
