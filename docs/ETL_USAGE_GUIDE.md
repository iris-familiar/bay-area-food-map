# ETL Pipeline Usage Guide

## Overview

The Bay Area Food Map ETL Pipeline is a modular data processing system that transforms raw restaurant data into a clean, standardized golden dataset.

## Architecture

```
Raw Data → Standardize → Clean → Merge → Quality → Golden Dataset
```

### Modules

1. **Standardize** (`standardize.js`) - Transforms various input formats to unified schema
2. **Clean** (`clean.js`) - Deduplicates, validates, and filters records
3. **Merge** (`merge.js`) - Merges with golden dataset with conflict resolution
4. **Quality** (`quality.js`) - Runs quality checks and generates reports

## Installation

```bash
cd projects/bay-area-food-map/scripts/etl
npm install
```

## Environment Variables

```bash
# Required for geocoding
export GOOGLE_PLACES_API_KEY="your_api_key_here"

# Optional: Log level
export LOG_LEVEL="INFO"  # DEBUG, INFO, WARN, ERROR
```

## Usage

### Command Line

#### Full Pipeline

```bash
node scripts/etl/cli.js --mode full --input data/raw/posts.json --output data/golden/restaurants.json
```

#### Dry Run (Validation Only)

```bash
node scripts/etl/cli.js --mode dry-run --input data/raw/posts.json
```

#### Individual Stages

```bash
# Standardize only
node scripts/etl/cli.js --mode standardize --input data/raw/posts.json

# Clean only
node scripts/etl/cli.js --mode clean --input data/staging/standardized.json

# Merge only
node scripts/etl/cli.js --mode merge --input data/staging/cleaned.json

# Quality check
node scripts/etl/cli.js --mode quality
```

### Programmatic Usage

#### Full Pipeline

```javascript
const { runPipeline } = require('./scripts/etl');

const rawData = [
  {
    noteId: '123',
    restaurantName: 'Test Restaurant',
    address: '123 Test St, San Francisco, CA',
    cuisine: ['Chinese'],
    likedCount: 100,
    commentCount: 20
  }
];

const result = await runPipeline(rawData, {
  dryRun: false,
  logLevel: 'INFO'
});

console.log('Pipeline stats:', result.stats);
console.log('Quality score:', result.quality.overall_score);
```

#### Individual Modules

```javascript
const { standardize, clean, merge, quality } = require('./scripts/etl');

// Standardize
const standardized = await standardize(rawData, {
  enableGeocoding: true,
  batchSize: 50
});

// Clean
const cleaned = await clean(standardized.records, {
  deduplicate: true,
  validate: true
});

// Merge
const merged = await merge(cleaned.records, {
  conflictStrategy: 'timestamp'
});

// Quality
const qualityResult = await quality(merged.golden, {
  completenessThreshold: 0.9,
  accuracyThreshold: 0.95
});
```

### Streaming (Large Datasets)

```javascript
const { runStreamingPipeline } = require('./scripts/etl');
const fs = require('fs');

const inputStream = fs.createReadStream('large-data.json');
const result = await runStreamingPipeline(inputStream);
```

## Configuration

### Module-Specific Options

#### Standardize

```javascript
{
  googlePlacesApiKey: 'your_key',  // Defaults to env var
  batchSize: 50,                    // Records per batch
  rateLimitMs: 100,                 // Rate limiting for API calls
  enableGeocoding: true,            // Enable Google Places geocoding
  dryRun: false,                    // Don't make changes
  maxRetries: 3,                    // API retry attempts
  retryDelayMs: 1000                // Delay between retries
}
```

#### Clean

```javascript
{
  deduplicate: true,                // Enable deduplication
  dedupKeys: ['google_place_id', 'name_normalized', 'address'],
  fuzzyThreshold: 0.85,             // Fuzzy matching threshold
  validate: true,                   // Enable validation
  removeOutliers: false,            // Remove outlier records
  outlierThreshold: 3,              // Z-score threshold
  blockedNames: ['cupertino', ...]  // Names to filter out
}
```

#### Merge

```javascript
{
  conflictStrategy: 'timestamp',    // timestamp, engagement, verified, manual
  keepVersions: 5,                  // Archive versions to keep
  archiveDir: './data/golden/archive',
  goldenPath: './data/golden/current/restaurant_database.json',
  mergeFields: {
    append: ['sources', 'recommendations'],
    max: ['engagement.total', 'engagement.likes'],
    preferVerified: ['name', 'address', 'location']
  }
}
```

#### Quality

```javascript
{
  completenessThreshold: 0.9,
  accuracyThreshold: 0.95,
  consistencyThreshold: 0.9,
  requiredFields: ['name', 'cuisine', 'area'],
  recommendedFields: ['address', 'location.lat', 'location.lng'],
  generateReport: true,
  reportFormat: 'json',             // json, html, markdown
  reportPath: './data/quality-reports'
}
```

## Input Formats

### Xiaohongshu Format

```json
{
  "noteId": "abc123",
  "restaurantName": "Restaurant Name",
  "address": "123 Main St, City",
  "cuisine": ["Chinese", "Sichuan"],
  "area": "SF",
  "likedCount": 100,
  "commentCount": 20,
  "collectedCount": 10
}
```

### CSV Format

```json
{
  "csv_row": 1,
  "name": "Restaurant Name",
  "address": "123 Main St",
  "cuisine": "Chinese,Japanese",
  "rating": 4.5,
  "price_level": 2
}
```

### Google Places Format

```json
{
  "place_id": "ChIJ...",
  "name": "Restaurant Name",
  "formatted_address": "123 Main St",
  "geometry": {
    "location": { "lat": 37.7749, "lng": -122.4194 }
  },
  "rating": 4.5
}
```

## Output Schema

```json
{
  "id": "uuid",
  "google_place_id": "ChIJ...",
  "name": "Restaurant Name",
  "name_normalized": "restaurant name",
  "address": "123 Main St",
  "location": { "lat": 37.7749, "lng": -122.4194 },
  "cuisine": ["Chinese", "Sichuan"],
  "area": "SF",
  "phone": "+1-415-555-0123",
  "website": "https://example.com",
  "rating": 4.5,
  "price_level": 2,
  "engagement": {
    "total": 130,
    "likes": 100,
    "comments": 20,
    "shares": 10
  },
  "recommendations": ["Kung Pao Chicken", "Mapo Tofu"],
  "recommendations_source": "llm_extracted",
  "sources": [{
    "platform": "xiaohongshu",
    "post_id": "abc123",
    "url": "https://xiaohongshu.com/...",
    "extracted_at": "2024-01-01T00:00:00Z"
  }],
  "verified": true,
  "verification_source": "google_places",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-06-01T00:00:00Z",
  "version": 2,
  "metadata": {
    "raw_input": { ... },
    "processing_history": [ ... ]
  }
}
```

## Quality Reports

Quality reports are generated in JSON format:

```json
{
  "generated_at": "2024-01-01T00:00:00Z",
  "total_records": 100,
  "overall_score": 0.95,
  "passed": true,
  "checks": {
    "completeness": {
      "score": 0.92,
      "passed": true,
      "totalFields": 300,
      "presentFields": 276
    },
    "accuracy": {
      "score": 0.98,
      "passed": true,
      "totalChecks": 100,
      "passedChecks": 98
    },
    "consistency": {
      "score": 0.95,
      "passed": true,
      "totalChecks": 100,
      "passedChecks": 95
    }
  },
  "flagged_records": [...]
}
```

## Testing

### Run All Tests

```bash
npm test
```

### Run Unit Tests Only

```bash
npm run test:unit
```

### Run Integration Tests

```bash
npm run test:integration
```

### Run with Coverage

```bash
npm run test:coverage
```

## Troubleshooting

### Common Issues

**Geocoding failures**
- Check `GOOGLE_PLACES_API_KEY` is set correctly
- Verify API key has Places API enabled
- Check rate limits

**Memory issues with large datasets**
- Use streaming mode: `runStreamingPipeline()`
- Reduce batch size
- Process in chunks

**Deduplication not working**
- Verify records have matching keys (google_place_id, name, address)
- Check fuzzy threshold setting
- Ensure name normalization is working

**Quality checks failing**
- Review quality report for specific issues
- Adjust thresholds if needed
- Check required fields configuration

### Debug Mode

```javascript
const result = await runPipeline(data, {
  logLevel: 'DEBUG',
  dryRun: true
});
```

### Logs

Logs are written to console with configurable levels:
- `DEBUG`: Detailed processing information
- `INFO`: High-level progress updates (default)
- `WARN`: Recoverable issues
- `ERROR`: Processing failures

## Best Practices

1. **Always run dry-run first** on production data
2. **Review quality reports** before deploying
3. **Archive old versions** before merging
4. **Monitor API rate limits** when geocoding
5. **Use streaming** for datasets > 1000 records
6. **Check flagged records** after each run

## npm Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run etl:full` | Run complete pipeline |
| `npm run etl:dry-run` | Validate without changes |
| `npm run etl:standardize` | Run standardize only |
| `npm run etl:clean` | Run clean only |
| `npm run etl:merge` | Run merge only |
| `npm run etl:quality` | Run quality check only |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage |
