/**
 * Merge Module (Module 3)
 * 
 * Merges cleaned data with the golden dataset.
 * 
 * Features:
 * - Conflict resolution strategies
 * - Version control
 * - Incremental updates
 * - Field-level merging
 * - Audit trail maintenance
 */

const { Logger } = require('./utils/logger');
const { 
  createObjectTransform, 
  createBatchTransform 
} = require('./utils/stream-utils');

// Default configuration
const DEFAULT_CONFIG = {
  conflictStrategy: 'timestamp', // 'timestamp', 'engagement', 'verified', 'manual'
  keepVersions: 5,
  archiveDir: './data/golden/archive',
  goldenPath: './data/golden/current/restaurant_database.json',
  dryRun: false,
  enableAudit: true,
  mergeFields: {
    append: ['sources', 'recommendations', 'cuisine'],
    max: ['engagement.total', 'engagement.likes', 'engagement.comments', 'engagement.shares'],
    preferVerified: ['name', 'address', 'location', 'phone', 'website']
  }
};

/**
 * Conflict resolution strategies
 */
const CONFLICT_STRATEGIES = {
  // Use the record with the most recent timestamp
  timestamp: (existing, incoming) => {
    const existingTime = new Date(existing.updated_at || 0).getTime();
    const incomingTime = new Date(incoming.updated_at || 0).getTime();
    return incomingTime >= existingTime ? incoming : existing;
  },
  
  // Use the record with higher engagement
  engagement: (existing, incoming) => {
    const existingEngagement = existing.engagement?.total || 0;
    const incomingEngagement = incoming.engagement?.total || 0;
    return incomingEngagement >= existingEngagement ? incoming : existing;
  },
  
  // Prefer verified records
  verified: (existing, incoming) => {
    if (incoming.verified && !existing.verified) return incoming;
    if (existing.verified && !incoming.verified) return existing;
    // Fall back to timestamp if both verified or both unverified
    return CONFLICT_STRATEGIES.timestamp(existing, incoming);
  },
  
  // Always require manual review for conflicts
  manual: (existing, incoming) => {
    return {
      conflict: true,
      existing,
      incoming,
      requiresReview: true
    };
  }
};

/**
 * Load golden dataset
 */
async function loadGoldenDataset(config, logger) {
  try {
    const fs = require('fs').promises;
    const data = await fs.readFile(config.goldenPath, 'utf-8');
    const golden = JSON.parse(data);
    
    logger?.info('Loaded golden dataset', { 
      count: Array.isArray(golden) ? golden.length : golden.records?.length || 0 
    });
    
    return Array.isArray(golden) ? golden : golden.records || [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger?.info('Golden dataset not found, creating new');
      return [];
    }
    throw error;
  }
}

/**
 * Save golden dataset
 */
async function saveGoldenDataset(records, config, logger) {
  if (config.dryRun) {
    logger?.info('Dry run - would save golden dataset', { count: records.length });
    return;
  }
  
  const fs = require('fs').promises;
  const path = require('path');
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(config.goldenPath), { recursive: true });
  
  // Save current
  const data = JSON.stringify({
    records,
    metadata: {
      version: Date.now(),
      updated_at: new Date().toISOString(),
      count: records.length
    }
  }, null, 2);
  
  await fs.writeFile(config.goldenPath, data, 'utf-8');
  
  logger?.info('Saved golden dataset', { count: records.length });
}

/**
 * Archive current version
 */
async function archiveVersion(records, config, logger) {
  if (config.dryRun) {
    logger?.info('Dry run - would archive version');
    return;
  }
  
  const fs = require('fs').promises;
  const path = require('path');
  
  await fs.mkdir(config.archiveDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(config.archiveDir, `restaurant_database_v${timestamp}.json`);
  
  const data = JSON.stringify({
    records,
    archived_at: new Date().toISOString()
  }, null, 2);
  
  await fs.writeFile(archivePath, data, 'utf-8');
  
  logger?.info('Archived version', { path: archivePath });
  
  // Clean old archives
  await cleanOldArchives(config, logger);
}

/**
 * Clean old archive versions
 */
async function cleanOldArchives(config, logger) {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const files = await fs.readdir(config.archiveDir);
    const archives = files
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(config.archiveDir, f),
        stat: require('fs').statSync(path.join(config.archiveDir, f))
      }))
      .sort((a, b) => b.stat.mtime - a.stat.mtime);
    
    // Keep only the most recent versions
    const toDelete = archives.slice(config.keepVersions);
    
    for (const archive of toDelete) {
      await fs.unlink(archive.path);
      logger?.debug('Deleted old archive', { file: archive.name });
    }
    
    if (toDelete.length > 0) {
      logger?.info('Cleaned old archives', { deleted: toDelete.length });
    }
  } catch (error) {
    logger?.warn('Failed to clean old archives', { error: error.message });
  }
}

/**
 * Find matching record in golden dataset
 */
function findMatch(record, goldenRecords) {
  // Try exact match by ID
  let match = goldenRecords.find(r => r.id === record.id);
  if (match) return { match, type: 'id' };
  
  // Try match by google_place_id
  if (record.google_place_id) {
    match = goldenRecords.find(r => r.google_place_id === record.google_place_id);
    if (match) return { match, type: 'google_place_id' };
  }
  
  // Try match by normalized name + address
  if (record.name_normalized && record.address) {
    match = goldenRecords.find(r => 
      r.name_normalized === record.name_normalized &&
      normalizeAddress(r.address) === normalizeAddress(record.address)
    );
    if (match) return { match, type: 'name_address' };
  }
  
  return null;
}

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
 * Get nested value
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current?.[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Set nested value
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

/**
 * Merge two records
 */
function mergeRecords(existing, incoming, config, logger) {
  const merged = { ...existing };
  
  // Merge append fields (arrays without duplicates)
  for (const field of config.mergeFields.append) {
    const existingVal = getNestedValue(existing, field) || [];
    const incomingVal = getNestedValue(incoming, field) || [];
    
    if (Array.isArray(existingVal) && Array.isArray(incomingVal)) {
      const combined = [...existingVal, ...incomingVal];
      setNestedValue(merged, field, [...new Set(combined)]);
    }
  }
  
  // Merge max fields (take higher value)
  for (const field of config.mergeFields.max) {
    const existingVal = getNestedValue(existing, field) || 0;
    const incomingVal = getNestedValue(incoming, field) || 0;
    
    setNestedValue(merged, field, Math.max(existingVal, incomingVal));
  }
  
  // Prefer verified fields
  for (const field of config.mergeFields.preferVerified) {
    const existingVal = getNestedValue(existing, field);
    const incomingVal = getNestedValue(incoming, field);
    
    // Prefer verified record's value
    if (incoming.verified && incomingVal !== undefined && incomingVal !== null) {
      setNestedValue(merged, field, incomingVal);
    } else if (!existing.verified && incomingVal !== undefined && incomingVal !== null) {
      setNestedValue(merged, field, incomingVal);
    }
  }
  
  // Update metadata
  merged.metadata = merged.metadata || {};
  merged.metadata.processing_history = merged.metadata.processing_history || [];
  merged.metadata.processing_history.push({
    step: 'merge',
    timestamp: new Date().toISOString(),
    merged_with: incoming.id,
    strategy: config.conflictStrategy
  });
  
  merged.updated_at = new Date().toISOString();
  merged.version = (merged.version || 1) + 1;
  
  return merged;
}

/**
 * Resolve conflict between records
 */
function resolveConflict(existing, incoming, config, logger) {
  const strategy = CONFLICT_STRATEGIES[config.conflictStrategy];
  
  if (!strategy) {
    throw new Error(`Unknown conflict strategy: ${config.conflictStrategy}`);
  }
  
  const result = strategy(existing, incoming);
  
  if (result.conflict) {
    logger?.warn('Conflict requires manual review', {
      existing: existing.id,
      incoming: incoming.id
    });
    return result;
  }
  
  // If we chose the incoming record, we still want to merge some fields
  if (result.id === incoming.id) {
    return mergeRecords(existing, incoming, config, logger);
  }
  
  // Otherwise merge incoming into existing
  return mergeRecords(existing, incoming, config, logger);
}

/**
 * Process single record merge
 */
async function processMerge(record, goldenRecords, config, logger) {
  const matchResult = findMatch(record, goldenRecords);
  
  if (!matchResult) {
    // New record - add to golden
    logger?.debug('Adding new record', { name: record.name });
    
    const newRecord = {
      ...record,
      metadata: {
        ...record.metadata,
        processing_history: [
          ...(record.metadata?.processing_history || []),
          {
            step: 'merge',
            operation: 'create',
            timestamp: new Date().toISOString()
          }
        ]
      },
      version: 1
    };
    
    return { action: 'create', record: newRecord };
  }
  
  // Existing record - merge or resolve conflict
  const { match, type } = matchResult;
  
  logger?.debug('Found match', { 
    name: record.name, 
    matchType: type,
    existingId: match.id 
  });
  
  const merged = resolveConflict(match, record, config, logger);
  
  if (merged.conflict) {
    return { action: 'conflict', record: merged };
  }
  
  return { action: 'update', record: merged, previousId: match.id };
}

/**
 * Merge module main function
 * 
 * @param {Array} records - Cleaned records to merge
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Merge results with stats
 */
async function merge(records, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const logger = new Logger({ module: 'MERGE', level: options.logLevel || 'INFO' });
  
  logger.info('Starting merge process', {
    incomingRecords: records.length,
    strategy: config.conflictStrategy,
    dryRun: config.dryRun
  });
  
  // Load golden dataset
  const goldenRecords = await loadGoldenDataset(config, logger);
  
  // Archive current version before making changes
  if (goldenRecords.length > 0 && !config.dryRun) {
    await archiveVersion(goldenRecords, config, logger);
  }
  
  // Create lookup map for efficient updates
  const goldenMap = new Map(goldenRecords.map(r => [r.id, r]));
  const results = {
    created: [],
    updated: [],
    conflicts: [],
    unchanged: []
  };
  
  // Process each incoming record
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    
    if (i % 100 === 0) {
      logger.progress(i, records.length, 'Merging');
    }
    
    try {
      const result = await processMerge(record, goldenRecords, config, logger);
      
      switch (result.action) {
        case 'create':
          results.created.push(result.record);
          goldenMap.set(result.record.id, result.record);
          break;
          
        case 'update':
          results.updated.push(result.record);
          goldenMap.set(result.record.id, result.record);
          break;
          
        case 'conflict':
          results.conflicts.push(result.record);
          break;
      }
    } catch (error) {
      logger.error('Failed to process record', { 
        name: record.name, 
        error: error.message 
      });
    }
  }
  
  // Build final golden dataset
  const finalGolden = Array.from(goldenMap.values());
  
  // Save if not dry run
  if (!config.dryRun) {
    await saveGoldenDataset(finalGolden, config, logger);
  }
  
  const stats = {
    goldenBefore: goldenRecords.length,
    incoming: records.length,
    created: results.created.length,
    updated: results.updated.length,
    conflicts: results.conflicts.length,
    goldenAfter: finalGolden.length
  };
  
  logger.info('Merge complete', stats);
  
  return {
    golden: config.dryRun ? null : finalGolden,
    stats,
    details: results
  };
}

/**
 * Create merge transform stream
 */
function createMergeStream(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const logger = new Logger({ module: 'MERGE-STREAM', level: options.logLevel || 'INFO' });
  
  // Load golden dataset at start
  let goldenRecords = [];
  let goldenLoaded = false;
  
  return createBatchTransform(config.batchSize || 100, async (batch) => {
    // Lazy load golden dataset
    if (!goldenLoaded) {
      goldenRecords = await loadGoldenDataset(config, logger);
      goldenLoaded = true;
    }
    
    const results = [];
    
    for (const record of batch) {
      const result = await processMerge(record, goldenRecords, config, logger);
      
      if (result.action !== 'conflict') {
        results.push(result.record);
        
        // Update golden records for subsequent matches
        const existingIndex = goldenRecords.findIndex(r => r.id === result.record.id);
        if (existingIndex >= 0) {
          goldenRecords[existingIndex] = result.record;
        } else {
          goldenRecords.push(result.record);
        }
      }
    }
    
    return results;
  }, { continueOnError: options.continueOnError });
}

module.exports = {
  merge,
  createMergeStream,
  processMerge,
  mergeRecords,
  resolveConflict,
  findMatch,
  loadGoldenDataset,
  saveGoldenDataset,
  archiveVersion,
  CONFLICT_STRATEGIES,
  DEFAULT_CONFIG
};
