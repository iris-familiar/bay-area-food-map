/**
 * ETL Pipeline Orchestrator
 * 
 * Main entry point for running the complete ETL pipeline.
 * Coordinates all modules and handles the data flow.
 */

const { standardize, createStandardizeStream } = require('./standardize');
const { clean, createCleanStream } = require('./clean');
const { merge, createMergeStream } = require('./merge');
const { quality, createQualityStream } = require('./quality');
const { Logger } = require('./utils/logger');
const { createArrayStream, collectStream } = require('./utils/stream-utils');

// Pipeline configuration
const PIPELINE_CONFIG = {
  // Module configurations
  standardize: {
    batchSize: 50,
    rateLimitMs: 100,
    enableGeocoding: true
  },
  clean: {
    deduplicate: true,
    validate: true,
    removeOutliers: false
  },
  merge: {
    conflictStrategy: 'timestamp',
    keepVersions: 5
  },
  quality: {
    completenessThreshold: 0.9,
    accuracyThreshold: 0.95,
    consistencyThreshold: 0.9
  }
};

/**
 * Run full ETL pipeline
 * 
 * @param {Array} rawData - Raw input data
 * @param {Object} options - Pipeline options
 * @returns {Promise<Object>} Pipeline results
 */
async function runPipeline(rawData, options = {}) {
  const config = { ...PIPELINE_CONFIG, ...options };
  const logger = new Logger({ module: 'PIPELINE', level: options.logLevel || 'INFO' });
  
  const startTime = Date.now();
  logger.info('Starting ETL pipeline', { 
    inputCount: rawData.length,
    dryRun: options.dryRun 
  });
  
  const results = {
    stages: {},
    errors: [],
    stats: {}
  };
  
  try {
    // Stage 1: Standardize
    logger.info('=== Stage 1: Standardize ===');
    const standardizeResult = await standardize(rawData, {
      ...config.standardize,
      dryRun: options.dryRun,
      logLevel: options.logLevel
    });
    
    results.stages.standardize = {
      input: rawData.length,
      output: standardizeResult.records.length,
      errors: standardizeResult.errors.length
    };
    
    if (standardizeResult.errors.length > 0) {
      results.errors.push(...standardizeResult.errors.map(e => ({
        stage: 'standardize',
        ...e
      })));
    }
    
    // Stage 2: Clean
    logger.info('=== Stage 2: Clean ===');
    const cleanResult = await clean(standardizeResult.records, {
      ...config.clean,
      dryRun: options.dryRun,
      logLevel: options.logLevel
    });
    
    results.stages.clean = cleanResult.stats;
    
    // Stage 3: Merge
    logger.info('=== Stage 3: Merge ===');
    const mergeResult = await merge(cleanResult.records, {
      ...config.merge,
      dryRun: options.dryRun,
      logLevel: options.logLevel
    });
    
    results.stages.merge = mergeResult.stats;
    
    if (mergeResult.details?.conflicts?.length > 0) {
      results.errors.push(...mergeResult.details.conflicts.map(c => ({
        stage: 'merge',
        type: 'conflict',
        ...c
      })));
    }
    
    // Stage 4: Quality
    logger.info('=== Stage 4: Quality ===');
    const qualityResult = await quality(mergeResult.golden || cleanResult.records, {
      ...config.quality,
      dryRun: options.dryRun,
      logLevel: options.logLevel
    });
    
    results.stages.quality = {
      score: qualityResult.overall_score,
      passed: qualityResult.passed,
      flagged: qualityResult.flagged.length
    };
    
    // Final stats
    const duration = Date.now() - startTime;
    results.stats = {
      duration_ms: duration,
      input_records: rawData.length,
      output_records: mergeResult.golden?.length || cleanResult.records.length,
      quality_score: qualityResult.overall_score,
      quality_passed: qualityResult.passed,
      total_errors: results.errors.length
    };
    
    results.quality = qualityResult;
    results.golden = mergeResult.golden;
    
    logger.info('=== Pipeline Complete ===', results.stats);
    
    return results;
    
  } catch (error) {
    logger.error('Pipeline failed', { error: error.message, stack: error.stack });
    results.errors.push({
      stage: 'pipeline',
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Run pipeline with streaming (for large datasets)
 * 
 * @param {ReadableStream} inputStream - Input data stream
 * @param {Object} options - Pipeline options
 * @returns {Promise<Object>} Pipeline results
 */
async function runStreamingPipeline(inputStream, options = {}) {
  const config = { ...PIPELINE_CONFIG, ...options };
  const logger = new Logger({ module: 'PIPELINE-STREAM', level: options.logLevel || 'INFO' });
  
  logger.info('Starting streaming ETL pipeline');
  
  // Create transform streams for each stage
  const standardizeStream = createStandardizeStream({
    ...config.standardize,
    dryRun: options.dryRun
  });
  
  const cleanStream = createCleanStream({
    ...config.clean,
    dryRun: options.dryRun
  });
  
  const mergeStream = createMergeStream({
    ...config.merge,
    dryRun: options.dryRun
  });
  
  const qualityStream = createQualityStream({
    ...config.quality,
    dryRun: options.dryRun
  });
  
  // Pipe streams together
  inputStream
    .pipe(standardizeStream)
    .pipe(cleanStream)
    .pipe(mergeStream)
    .pipe(qualityStream);
  
  // Collect results
  const result = await collectStream(qualityStream);
  
  logger.info('Streaming pipeline complete', { 
    outputCount: result.results.length,
    errorCount: result.errors.length
  });
  
  return result;
}

/**
 * Run pipeline from JSON file
 * 
 * @param {string} inputPath - Path to input JSON file
 * @param {Object} options - Pipeline options
 */
async function runFromFile(inputPath, options = {}) {
  const fs = require('fs').promises;
  
  const logger = new Logger({ module: 'PIPELINE-FILE' });
  logger.info('Loading data from file', { path: inputPath });
  
  const data = await fs.readFile(inputPath, 'utf-8');
  const rawData = JSON.parse(data);
  
  // Handle different input formats
  const records = Array.isArray(rawData) ? rawData : rawData.records || [];
  
  return await runPipeline(records, options);
}

/**
 * Run pipeline in dry-run mode (validation only)
 * 
 * @param {Array} rawData - Raw input data
 * @param {Object} options - Pipeline options
 */
async function dryRun(rawData, options = {}) {
  const logger = new Logger({ module: 'DRY-RUN' });
  logger.info('Running pipeline in dry-run mode');
  
  return await runPipeline(rawData, { ...options, dryRun: true });
}

module.exports = {
  runPipeline,
  runStreamingPipeline,
  runFromFile,
  dryRun,
  PIPELINE_CONFIG,
  // Re-export modules for direct use
  standardize,
  clean,
  merge,
  quality
};
