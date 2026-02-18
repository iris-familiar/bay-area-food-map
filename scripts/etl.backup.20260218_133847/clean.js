/**
 * Clean Module (Module 2)
 * 
 * Data cleaning and deduplication module.
 * 
 * Features:
 * - Deduplication based on google_place_id, name + address
 * - Data validation (required fields, type checking, range validation)
 * - Outlier detection and handling
 * - Stream processing support
 * - Dry-run mode
 */

const { Logger } = require('./utils/logger');
const { 
  validateRecord, 
  RESTAURANT_SCHEMA,
  isInBayArea,
  calculateZScore,
  calculateStats
} = require('./utils/validators');
const { 
  createObjectTransform, 
  createBatchTransform,
  collectStream
} = require('./utils/stream-utils');

// Default configuration
const DEFAULT_CONFIG = {
  deduplicate: true,
  dedupKeys: ['google_place_id', 'name_normalized', 'address'],
  fuzzyThreshold: 0.85,
  fuzzyFields: ['name', 'address'],
  validate: true,
  removeOutliers: false,
  outlierThreshold: 3, // Z-score threshold
  dryRun: false,
  blockedNames: [
    'cupertino', 'sunnyvale', 'fremont', 'san jose', 'mountain view',
    'palo alto', 'menlo park', 'redwood city', 'san mateo',
    'el camino real', 'stevens creek blvd', '美食', '餐厅', '饭店', '半岛'
  ]
};

/**
 * Normalize address for comparison
 */
function normalizeAddress(address) {
  if (!address) return '';
  return address
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[,\.#]/g, '')
    .trim();
}

/**
 * Calculate string similarity (Levenshtein-based)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  // Simple Jaccard similarity for performance
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Generate deduplication key
 */
function generateDedupKey(record, keys) {
  const parts = [];
  
  for (const key of keys) {
    let value;
    if (key.includes('.')) {
      // Handle nested keys
      value = key.split('.').reduce((obj, k) => obj?.[k], record);
    } else {
      value = record[key];
    }
    
    if (value) {
      parts.push(String(value).toLowerCase().trim());
    }
  }
  
  return parts.join('|');
}

/**
 * Check if record is blocked
 */
function isBlocked(record, blockedNames) {
  if (!record.name) return true;
  
  const normalizedName = record.name.toLowerCase().trim();
  
  return blockedNames.some(blocked => {
    const normalizedBlocked = blocked.toLowerCase().trim();
    return normalizedName === normalizedBlocked ||
           normalizedName.includes(normalizedBlocked);
  });
}

/**
 * Deduplicate records
 */
function deduplicate(records, config, logger) {
  if (!config.deduplicate) {
    return { records, duplicates: [] };
  }
  
  logger?.info('Starting deduplication', { 
    totalRecords: records.length,
    dedupKeys: config.dedupKeys 
  });
  
  const seen = new Map();
  const duplicates = [];
  const unique = [];
  
  for (const record of records) {
    const dedupKey = generateDedupKey(record, config.dedupKeys);
    
    if (dedupKey && seen.has(dedupKey)) {
      const existing = seen.get(dedupKey);
      
      // Merge records (keep more complete one)
      const merged = mergeDuplicateRecords(existing, record);
      
      duplicates.push({
        kept: existing.id,
        removed: record.id,
        reason: 'exact_match',
        key: dedupKey
      });
      
      // Replace with merged
      const index = unique.findIndex(r => r.id === existing.id);
      if (index >= 0) {
        unique[index] = merged;
        seen.set(dedupKey, merged);
      }
    } else {
      seen.set(dedupKey, record);
      unique.push(record);
    }
  }
  
  // Fuzzy deduplication
  if (config.fuzzyThreshold < 1) {
    const fuzzyDuplicates = [];
    
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const record1 = unique[i];
        const record2 = unique[j];
        
        // Check fuzzy match on specified fields
        let totalSimilarity = 0;
        let fieldCount = 0;
        
        for (const field of config.fuzzyFields) {
          const val1 = record1[field];
          const val2 = record2[field];
          
          if (val1 && val2) {
            totalSimilarity += calculateSimilarity(val1, val2);
            fieldCount++;
          }
        }
        
        const avgSimilarity = fieldCount > 0 ? totalSimilarity / fieldCount : 0;
        
        if (avgSimilarity >= config.fuzzyThreshold) {
          fuzzyDuplicates.push({
            record1: record1.id,
            record2: record2.id,
            similarity: avgSimilarity,
            fields: config.fuzzyFields
          });
          
          // Mark for removal
          const merged = mergeDuplicateRecords(record1, record2);
          unique[i] = merged;
          unique[j] = null; // Mark for removal
          
          duplicates.push({
            kept: record1.id,
            removed: record2.id,
            reason: 'fuzzy_match',
            similarity: avgSimilarity
          });
        }
      }
    }
    
    // Remove null entries
    const finalUnique = unique.filter(r => r !== null);
    
    logger?.info('Fuzzy deduplication complete', { 
      fuzzyDuplicates: fuzzyDuplicates.length 
    });
    
    return { records: finalUnique, duplicates };
  }
  
  logger?.info('Deduplication complete', { 
    unique: unique.length, 
    duplicates: duplicates.length 
  });
  
  return { records: unique, duplicates };
}

/**
 * Merge duplicate records
 */
function mergeDuplicateRecords(record1, record2) {
  const merged = { ...record1 };
  
  // Prefer non-null values from either record
  for (const [key, value] of Object.entries(record2)) {
    if (value !== null && value !== undefined) {
      if (merged[key] === null || merged[key] === undefined) {
        merged[key] = value;
      } else if (Array.isArray(value)) {
        // Merge arrays without duplicates
        merged[key] = [...new Set([...merged[key], ...value])];
      } else if (key === 'engagement') {
        // Sum engagement metrics
        merged[key] = {
          total: (merged[key].total || 0) + (value.total || 0),
          likes: (merged[key].likes || 0) + (value.likes || 0),
          comments: (merged[key].comments || 0) + (value.comments || 0),
          shares: (merged[key].shares || 0) + (value.shares || 0)
        };
      } else if (key === 'sources') {
        // Merge sources
        merged[key] = [...merged[key], ...value];
      }
    }
  }
  
  // Update metadata
  merged.metadata = merged.metadata || {};
  merged.metadata.processing_history = merged.metadata.processing_history || [];
  merged.metadata.processing_history.push({
    step: 'clean',
    operation: 'merge_duplicates',
    merged_with: record2.id,
    timestamp: new Date().toISOString()
  });
  
  merged.updated_at = new Date().toISOString();
  
  return merged;
}

/**
 * Validate records
 */
function validateRecords(records, config, logger) {
  if (!config.validate) {
    return { valid: records, invalid: [] };
  }
  
  logger?.info('Starting validation');
  
  const valid = [];
  const invalid = [];
  
  for (const record of records) {
    const validation = validateRecord(record, RESTAURANT_SCHEMA);
    
    // Additional validations
    const additionalErrors = [];
    
    // Check blocked names
    if (isBlocked(record, config.blockedNames)) {
      additionalErrors.push('Name is in blocked list');
    }
    
    // Check engagement is positive
    if (record.engagement?.total < 0) {
      additionalErrors.push('Engagement cannot be negative');
    }
    
    // Check location is in Bay Area (if provided)
    if (record.location?.lat && record.location?.lng) {
      if (!isInBayArea(record.location.lat, record.location.lng)) {
        logger?.warn('Record outside Bay Area', { 
          name: record.name, 
          location: record.location 
        });
        // Don't fail, just warn
      }
    }
    
    if (validation.valid && additionalErrors.length === 0) {
      valid.push(record);
    } else {
      invalid.push({
        record,
        errors: [...validation.errors, ...additionalErrors]
      });
    }
  }
  
  logger?.info('Validation complete', { 
    valid: valid.length, 
    invalid: invalid.length 
  });
  
  return { valid, invalid };
}

/**
 * Detect outliers
 */
function detectOutliers(records, config, logger) {
  if (!config.removeOutliers) {
    return { records, outliers: [] };
  }
  
  logger?.info('Starting outlier detection');
  
  const outliers = [];
  const normal = [];
  
  // Calculate engagement statistics
  const engagementValues = records.map(r => r.engagement?.total || 0);
  const stats = calculateStats(engagementValues);
  
  logger?.debug('Engagement stats', stats);
  
  for (const record of records) {
    const engagement = record.engagement?.total || 0;
    const zScore = calculateZScore(engagement, stats.mean, stats.stdDev);
    
    if (Math.abs(zScore) > config.outlierThreshold) {
      outliers.push({
        record,
        reason: 'engagement_outlier',
        zScore,
        value: engagement,
        threshold: config.outlierThreshold
      });
      
      logger?.warn('Outlier detected', { 
        name: record.name, 
        engagement, 
        zScore 
      });
    } else {
      normal.push(record);
    }
  }
  
  logger?.info('Outlier detection complete', { 
    normal: normal.length, 
    outliers: outliers.length 
  });
  
  return { records: normal, outliers };
}

/**
 * Clean single record (for stream processing)
 */
async function cleanRecord(record, config) {
  // Check blocked names
  if (isBlocked(record, config.blockedNames)) {
    return { 
      record: null, 
      error: { type: 'blocked_name', message: 'Name is in blocked list' }
    };
  }
  
  // Validate
  if (config.validate) {
    const validation = validateRecord(record, RESTAURANT_SCHEMA);
    if (!validation.valid) {
      return {
        record: null,
        error: { type: 'validation_failed', errors: validation.errors }
      };
    }
  }
  
  // Update processing history
  record.metadata = record.metadata || {};
  record.metadata.processing_history = record.metadata.processing_history || [];
  record.metadata.processing_history.push({
    step: 'clean',
    timestamp: new Date().toISOString(),
    dry_run: config.dryRun
  });
  
  record.updated_at = new Date().toISOString();
  
  return { record, error: null };
}

/**
 * Clean module main function
 * 
 * @param {Array} records - Input records
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Cleaned records with stats
 */
async function clean(records, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const logger = new Logger({ module: 'CLEAN', level: options.logLevel || 'INFO' });
  
  logger.info('Starting cleaning process', { 
    totalRecords: records.length,
    deduplicate: config.deduplicate,
    validate: config.validate,
    dryRun: config.dryRun
  });
  
  // Step 1: Remove blocked names
  const blockedFiltered = records.filter(r => !isBlocked(r, config.blockedNames));
  const blockedCount = records.length - blockedFiltered.length;
  
  logger.info('Blocked name filter', { 
    removed: blockedCount, 
    remaining: blockedFiltered.length 
  });
  
  // Step 2: Deduplicate
  let dedupResult;
  if (config.dryRun) {
    logger.info('Dry run - simulating deduplication');
    dedupResult = { records: blockedFiltered, duplicates: [] };
  } else {
    dedupResult = deduplicate(blockedFiltered, config, logger);
  }
  
  // Step 3: Validate
  let validationResult;
  if (config.dryRun) {
    logger.info('Dry run - simulating validation');
    validationResult = { valid: dedupResult.records, invalid: [] };
  } else {
    validationResult = validateRecords(dedupResult.records, config, logger);
  }
  
  // Step 4: Outlier detection
  let outlierResult;
  if (config.dryRun || !config.removeOutliers) {
    outlierResult = { records: validationResult.valid, outliers: [] };
  } else {
    outlierResult = detectOutliers(validationResult.valid, config, logger);
  }
  
  const result = {
    records: outlierResult.records,
    stats: {
      input: records.length,
      blocked: blockedCount,
      duplicates: dedupResult.duplicates.length,
      invalid: validationResult.invalid.length,
      outliers: outlierResult.outliers.length,
      output: outlierResult.records.length
    },
    details: {
      duplicates: dedupResult.duplicates,
      invalid: validationResult.invalid,
      outliers: outlierResult.outliers
    }
  };
  
  logger.info('Cleaning complete', result.stats);
  
  return result;
}

/**
 * Create cleaning transform stream
 */
function createCleanStream(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const logger = new Logger({ module: 'CLEAN-STREAM', level: options.logLevel || 'INFO' });
  
  // For deduplication, we need to buffer and process batches
  if (config.deduplicate) {
    return createBatchTransform(config.batchSize || 100, async (batch) => {
      const result = await clean(batch, config);
      return result.records;
    }, { continueOnError: options.continueOnError });
  }
  
  // Simple record-by-record cleaning
  return createObjectTransform(async (chunk) => {
    const result = await cleanRecord(chunk, config);
    if (result.error) {
      return null; // Filter out invalid records
    }
    return result.record;
  }, { continueOnError: options.continueOnError });
}

module.exports = {
  clean,
  createCleanStream,
  cleanRecord,
  deduplicate,
  validateRecords,
  detectOutliers,
  calculateSimilarity,
  generateDedupKey,
  mergeDuplicateRecords,
  isBlocked,
  normalizeAddress,
  DEFAULT_CONFIG
};
