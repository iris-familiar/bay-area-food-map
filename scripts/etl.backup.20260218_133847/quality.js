/**
 * Quality Module (Module 4)
 * 
 * Quality assurance and reporting module.
 * 
 * Features:
 * - Completeness checks (required fields, null analysis)
 * - Accuracy validation (range checks, format validation)
 * - Consistency verification (cross-field validation)
 * - Quality scoring and reporting
 * - Issue flagging for manual review
 */

const { Logger } = require('./utils/logger');
const { 
  validateRecord, 
  RESTAURANT_SCHEMA,
  isInBayArea,
  calculateStats
} = require('./utils/validators');
const { 
  createObjectTransform,
  createBatchTransform,
  collectStream
} = require('./utils/stream-utils');

// Default configuration
const DEFAULT_CONFIG = {
  completenessThreshold: 0.9,
  accuracyThreshold: 0.95,
  consistencyThreshold: 0.9,
  flagIssues: true,
  generateReport: true,
  reportFormat: 'json', // 'json', 'html', 'markdown'
  reportPath: './data/quality-reports',
  dryRun: false,
  
  // Quality check settings
  requiredFields: ['name', 'cuisine', 'area'],
  recommendedFields: ['address', 'location.lat', 'location.lng', 'engagement.total'],
  accuracyChecks: {
    locationInBayArea: true,
    engagementPositive: true,
    ratingInRange: true,
    priceLevelInRange: true
  },
  consistencyChecks: {
    engagementMatchesComponents: true,
    verifiedHasPlaceId: true,
    recommendationsNotEmpty: false
  }
};

/**
 * Calculate completeness score
 */
function checkCompleteness(records, config, logger) {
  logger?.info('Checking completeness');
  
  const issues = [];
  let totalFields = 0;
  let presentFields = 0;
  
  const fieldStats = {};
  
  for (const record of records) {
    const recordIssues = [];
    
    // Check required fields
    for (const field of config.requiredFields) {
      totalFields++;
      fieldStats[field] = fieldStats[field] || { total: 0, present: 0 };
      fieldStats[field].total++;
      
      const value = getNestedValue(record, field);
      if (value !== undefined && value !== null && 
          !(Array.isArray(value) && value.length === 0) &&
          value !== '') {
        presentFields++;
        fieldStats[field].present++;
      } else {
        recordIssues.push({
          type: 'missing_required_field',
          field,
          severity: 'high'
        });
      }
    }
    
    // Check recommended fields
    for (const field of config.recommendedFields) {
      totalFields++;
      fieldStats[field] = fieldStats[field] || { total: 0, present: 0 };
      fieldStats[field].total++;
      
      const value = getNestedValue(record, field);
      if (value !== undefined && value !== null &&
          !(Array.isArray(value) && value.length === 0) &&
          value !== '') {
        presentFields++;
        fieldStats[field].present++;
      } else {
        recordIssues.push({
          type: 'missing_recommended_field',
          field,
          severity: 'medium'
        });
      }
    }
    
    if (recordIssues.length > 0) {
      issues.push({
        record_id: record.id,
        record_name: record.name,
        issues: recordIssues
      });
    }
  }
  
  const score = totalFields > 0 ? presentFields / totalFields : 1;
  
  // Calculate per-field completeness
  const fieldCompleteness = {};
  for (const [field, stats] of Object.entries(fieldStats)) {
    fieldCompleteness[field] = stats.total > 0 ? stats.present / stats.total : 0;
  }
  
  return {
    score,
    threshold: config.completenessThreshold,
    passed: score >= config.completenessThreshold,
    totalFields,
    presentFields,
    fieldCompleteness,
    issues: issues.filter(i => i.issues.some(iss => iss.severity === 'high'))
  };
}

/**
 * Check accuracy
 */
function checkAccuracy(records, config, logger) {
  logger?.info('Checking accuracy');
  
  const issues = [];
  let totalChecks = 0;
  let passedChecks = 0;
  
  for (const record of records) {
    const recordIssues = [];
    
    // Check location is in Bay Area
    if (config.accuracyChecks.locationInBayArea) {
      totalChecks++;
      if (record.location?.lat && record.location?.lng) {
        if (isInBayArea(record.location.lat, record.location.lng)) {
          passedChecks++;
        } else {
          recordIssues.push({
            type: 'location_outside_bay_area',
            severity: 'medium',
            location: record.location
          });
        }
      }
    }
    
    // Check engagement is positive
    if (config.accuracyChecks.engagementPositive) {
      totalChecks++;
      if (record.engagement) {
        const allPositive = 
          (record.engagement.total || 0) >= 0 &&
          (record.engagement.likes || 0) >= 0 &&
          (record.engagement.comments || 0) >= 0 &&
          (record.engagement.shares || 0) >= 0;
        
        if (allPositive) {
          passedChecks++;
        } else {
          recordIssues.push({
            type: 'negative_engagement',
            severity: 'high',
            engagement: record.engagement
          });
        }
      }
    }
    
    // Check rating is in range
    if (config.accuracyChecks.ratingInRange && record.rating !== undefined) {
      totalChecks++;
      if (record.rating >= 0 && record.rating <= 5) {
        passedChecks++;
      } else {
        recordIssues.push({
          type: 'rating_out_of_range',
          severity: 'medium',
          rating: record.rating
        });
      }
    }
    
    // Check price level is in range
    if (config.accuracyChecks.priceLevelInRange && record.price_level !== undefined) {
      totalChecks++;
      if (record.price_level >= 1 && record.price_level <= 4) {
        passedChecks++;
      } else {
        recordIssues.push({
          type: 'price_level_out_of_range',
          severity: 'low',
          price_level: record.price_level
        });
      }
    }
    
    // Run schema validation
    const validation = validateRecord(record, RESTAURANT_SCHEMA);
    if (!validation.valid) {
      totalChecks += validation.errors.length;
      recordIssues.push(...validation.errors.map(err => ({
        type: 'schema_validation_failed',
        severity: 'high',
        message: err
      })));
    } else {
      totalChecks++;
      passedChecks++;
    }
    
    if (recordIssues.length > 0) {
      issues.push({
        record_id: record.id,
        record_name: record.name,
        issues: recordIssues
      });
    }
  }
  
  const score = totalChecks > 0 ? passedChecks / totalChecks : 1;
  
  return {
    score,
    threshold: config.accuracyThreshold,
    passed: score >= config.accuracyThreshold,
    totalChecks,
    passedChecks,
    issues
  };
}

/**
 * Check consistency
 */
function checkConsistency(records, config, logger) {
  logger?.info('Checking consistency');
  
  const issues = [];
  let totalChecks = 0;
  let passedChecks = 0;
  
  for (const record of records) {
    const recordIssues = [];
    
    // Check engagement components add up
    if (config.consistencyChecks.engagementMatchesComponents) {
      totalChecks++;
      if (record.engagement) {
        const expectedTotal = 
          (record.engagement.likes || 0) + 
          (record.engagement.comments || 0) + 
          (record.engagement.shares || 0);
        
        // Allow for some difference (some platforms count differently)
        if (Math.abs(expectedTotal - (record.engagement.total || 0)) <= 5) {
          passedChecks++;
        } else {
          recordIssues.push({
            type: 'engagement_mismatch',
            severity: 'low',
            expected: expectedTotal,
            actual: record.engagement.total
          });
        }
      }
    }
    
    // Check verified records have place_id
    if (config.consistencyChecks.verifiedHasPlaceId) {
      totalChecks++;
      if (record.verified) {
        if (record.google_place_id) {
          passedChecks++;
        } else {
          recordIssues.push({
            type: 'verified_missing_place_id',
            severity: 'medium'
          });
        }
      } else {
        passedChecks++;
      }
    }
    
    // Check recommendations source matches recommendations
    if (config.consistencyChecks.recommendationsNotEmpty) {
      totalChecks++;
      if (record.recommendations_source) {
        if (record.recommendations?.length > 0) {
          passedChecks++;
        } else {
          recordIssues.push({
            type: 'source_without_recommendations',
            severity: 'low',
            source: record.recommendations_source
          });
        }
      } else {
        passedChecks++;
      }
    }
    
    // Check timestamp consistency
    totalChecks++;
    if (record.created_at && record.updated_at) {
      const created = new Date(record.created_at).getTime();
      const updated = new Date(record.updated_at).getTime();
      
      if (updated >= created) {
        passedChecks++;
      } else {
        recordIssues.push({
          type: 'timestamp_inconsistency',
          severity: 'high',
          created_at: record.created_at,
          updated_at: record.updated_at
        });
      }
    } else {
      passedChecks++;
    }
    
    if (recordIssues.length > 0) {
      issues.push({
        record_id: record.id,
        record_name: record.name,
        issues: recordIssues
      });
    }
  }
  
  const score = totalChecks > 0 ? passedChecks / totalChecks : 1;
  
  return {
    score,
    threshold: config.consistencyThreshold,
    passed: score >= config.consistencyThreshold,
    totalChecks,
    passedChecks,
    issues
  };
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
 * Flag records for review
 */
function flagRecords(records, qualityResult, config) {
  const flagged = [];
  
  // Collect all issues
  const allIssues = [
    ...(qualityResult.completeness.issues || []),
    ...(qualityResult.accuracy.issues || []),
    ...(qualityResult.consistency.issues || [])
  ];
  
  // Group issues by record
  const issuesByRecord = {};
  for (const issue of allIssues) {
    if (!issuesByRecord[issue.record_id]) {
      issuesByRecord[issue.record_id] = [];
    }
    issuesByRecord[issue.record_id].push(issue);
  }
  
  // Flag records with high severity issues
  for (const [recordId, issues] of Object.entries(issuesByRecord)) {
    const highSeverityCount = issues.filter(i => 
      i.issues?.some(iss => iss.severity === 'high')
    ).length;
    
    if (highSeverityCount > 0) {
      const record = records.find(r => r.id === recordId);
      if (record) {
        flagged.push({
          record_id: recordId,
          record_name: record.name,
          flag_reason: 'high_severity_issues',
          issue_count: highSeverityCount,
          issues
        });
      }
    }
  }
  
  return flagged;
}

/**
 * Calculate overall quality score
 */
function calculateOverallScore(checks) {
  const weights = {
    completeness: 0.4,
    accuracy: 0.4,
    consistency: 0.2
  };
  
  let totalWeight = 0;
  let weightedScore = 0;
  
  for (const [check, weight] of Object.entries(weights)) {
    if (checks[check]?.score !== undefined) {
      weightedScore += checks[check].score * weight;
      totalWeight += weight;
    }
  }
  
  return totalWeight > 0 ? weightedScore / totalWeight : 0;
}

/**
 * Generate quality report
 */
async function generateReport(qualityResult, records, config, logger) {
  if (!config.generateReport) {
    return null;
  }
  
  logger?.info('Generating quality report');
  
  const report = {
    generated_at: new Date().toISOString(),
    total_records: records.length,
    overall_score: qualityResult.overall_score,
    passed: qualityResult.passed,
    checks: {
      completeness: qualityResult.completeness,
      accuracy: qualityResult.accuracy,
      consistency: qualityResult.consistency
    },
    flagged_records: qualityResult.flagged,
    summary: {
      records_with_issues: new Set([
        ...qualityResult.completeness.issues.map(i => i.record_id),
        ...qualityResult.accuracy.issues.map(i => i.record_id),
        ...qualityResult.consistency.issues.map(i => i.record_id)
      ]).size,
      total_issues: 
        qualityResult.completeness.issues.length +
        qualityResult.accuracy.issues.length +
        qualityResult.consistency.issues.length
    }
  };
  
  // Save report
  if (!config.dryRun) {
    const fs = require('fs').promises;
    const path = require('path');
    
    await fs.mkdir(config.reportPath, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(config.reportPath, `quality_report_${timestamp}.json`);
    
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf-8');
    
    logger?.info('Quality report saved', { path: reportFile });
  }
  
  return report;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report) {
  const lines = [
    '# Data Quality Report',
    '',
    `**Generated:** ${report.generated_at}`,
    `**Total Records:** ${report.total_records}`,
    `**Overall Score:** ${(report.overall_score * 100).toFixed(1)}%`,
    `**Status:** ${report.passed ? '✅ PASSED' : '❌ FAILED'}`,
    '',
    '## Summary',
    '',
    `- Records with issues: ${report.summary.records_with_issues}`,
    `- Total issues found: ${report.summary.total_issues}`,
    `- Flagged for review: ${report.flagged_records.length}`,
    '',
    '## Quality Checks',
    '',
    '### Completeness',
    `**Score:** ${(report.checks.completeness.score * 100).toFixed(1)}%`,
    `**Status:** ${report.checks.completeness.passed ? '✅' : '❌'}`,
    `**Fields checked:** ${report.checks.completeness.totalFields}`,
    `**Fields present:** ${report.checks.completeness.presentFields}`,
    '',
    '### Accuracy',
    `**Score:** ${(report.checks.accuracy.score * 100).toFixed(1)}%`,
    `**Status:** ${report.checks.accuracy.passed ? '✅' : '❌'}`,
    `**Checks passed:** ${report.checks.accuracy.passedChecks}/${report.checks.accuracy.totalChecks}`,
    '',
    '### Consistency',
    `**Score:** ${(report.checks.consistency.score * 100).toFixed(1)}%`,
    `**Status:** ${report.checks.consistency.passed ? '✅' : '❌'}`,
    `**Checks passed:** ${report.checks.consistency.passedChecks}/${report.checks.consistency.totalChecks}`,
    ''
  ];
  
  if (report.flagged_records.length > 0) {
    lines.push('## Flagged Records', '');
    for (const flagged of report.flagged_records.slice(0, 10)) {
      lines.push(`- **${flagged.record_name}** (${flagged.issue_count} issues)`);
    }
    if (report.flagged_records.length > 10) {
      lines.push(`- ... and ${report.flagged_records.length - 10} more`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Quality module main function
 * 
 * @param {Array} records - Records to check
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Quality check results
 */
async function quality(records, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const logger = new Logger({ module: 'QUALITY', level: options.logLevel || 'INFO' });
  
  logger.info('Starting quality checks', {
    recordCount: records.length,
    dryRun: config.dryRun
  });
  
  // Run checks
  const completenessResult = checkCompleteness(records, config, logger);
  const accuracyResult = checkAccuracy(records, config, logger);
  const consistencyResult = checkConsistency(records, config, logger);
  
  // Calculate overall score
  const overallScore = calculateOverallScore({
    completeness: completenessResult,
    accuracy: accuracyResult,
    consistency: consistencyResult
  });
  
  // Determine if quality gates passed
  const passed = 
    completenessResult.passed &&
    accuracyResult.passed &&
    consistencyResult.passed;
  
  // Flag records for review
  const flagged = config.flagIssues ? flagRecords(records, {
    completeness: completenessResult,
    accuracy: accuracyResult,
    consistency: consistencyResult
  }, config) : [];
  
  const result = {
    overall_score: overallScore,
    passed,
    completeness: completenessResult,
    accuracy: accuracyResult,
    consistency: consistencyResult,
    flagged
  };
  
  // Generate report
  const report = await generateReport(result, records, config, logger);
  
  logger.info('Quality checks complete', {
    overallScore: (overallScore * 100).toFixed(1) + '%',
    passed,
    flagged: flagged.length
  });
  
  return {
    ...result,
    report
  };
}

/**
 * Create quality transform stream
 */
function createQualityStream(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const logger = new Logger({ module: 'QUALITY-STREAM', level: options.logLevel || 'INFO' });
  
  const records = [];
  
  return createBatchTransform(config.batchSize || 100, async (batch) => {
    records.push(...batch);
    
    // Process and return valid records
    const validation = checkAccuracy(batch, config, logger);
    return batch.filter((record, index) => {
      const recordIssues = validation.issues.find(i => i.record_id === record.id);
      return !recordIssues || !recordIssues.issues.some(i => i.severity === 'high');
    });
  }, { continueOnError: options.continueOnError });
}

/**
 * Quick quality check for single record
 */
function quickCheck(record, config = {}) {
  const issues = [];
  
  // Required fields
  const required = config.requiredFields || DEFAULT_CONFIG.requiredFields;
  for (const field of required) {
    const value = getNestedValue(record, field);
    if (value === undefined || value === null || value === '') {
      issues.push({ type: 'missing_required', field });
    }
  }
  
  // Schema validation
  const validation = validateRecord(record, RESTAURANT_SCHEMA);
  if (!validation.valid) {
    issues.push(...validation.errors.map(e => ({ type: 'validation_error', message: e })));
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

module.exports = {
  quality,
  createQualityStream,
  quickCheck,
  checkCompleteness,
  checkAccuracy,
  checkConsistency,
  calculateOverallScore,
  generateMarkdownReport,
  DEFAULT_CONFIG
};
