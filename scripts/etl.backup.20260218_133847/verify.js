#!/usr/bin/env node
/**
 * Quick verification script for ETL pipeline
 * Run from project root: node scripts/etl/verify.js
 */

const path = require('path');

async function verifyModules() {
  console.log('🔍 Verifying ETL Pipeline Implementation...\n');
  
  const results = {
    modules: {},
    errors: []
  };
  
  // Test 1: Load utils
  try {
    const { Logger } = require('./utils/logger');
    const { validateRecord } = require('./utils/validators');
    const { createArrayStream } = require('./utils/stream-utils');
    
    console.log('✅ Utils module loaded');
    results.modules.utils = true;
    
    // Test logger
    const logger = new Logger({ module: 'TEST', level: 'ERROR' });
    logger.info('Test message');
    
    // Test validator
    const validation = validateRecord({ name: 'Test', cuisine: ['Chinese'], area: 'SF' });
    console.log(`   - Logger: ✓`);
    console.log(`   - Validator: ${validation.valid ? '✓' : '✗'}`);
    
  } catch (error) {
    console.error('❌ Utils module failed:', error.message);
    results.modules.utils = false;
    results.errors.push({ module: 'utils', error: error.message });
  }
  
  // Test 2: Load standardize
  try {
    const { standardize, normalizeName } = require('./standardize');
    console.log('✅ Standardize module loaded');
    results.modules.standardize = true;
    
    // Test normalization
    const normalized = normalizeName('  Test Restaurant  ');
    console.log(`   - Normalize function: ${normalized === 'test restaurant' ? '✓' : '✗'}`);
    
  } catch (error) {
    console.error('❌ Standardize module failed:', error.message);
    results.modules.standardize = false;
    results.errors.push({ module: 'standardize', error: error.message });
  }
  
  // Test 3: Load clean
  try {
    const { clean, calculateSimilarity } = require('./clean');
    console.log('✅ Clean module loaded');
    results.modules.clean = true;
    
    // Test similarity
    const similarity = calculateSimilarity('Test Restaurant', 'Test Restarant');
    console.log(`   - Similarity function: ${similarity > 0.8 ? '✓' : '✗'} (${similarity.toFixed(2)})`);
    
  } catch (error) {
    console.error('❌ Clean module failed:', error.message);
    results.modules.clean = false;
    results.errors.push({ module: 'clean', error: error.message });
  }
  
  // Test 4: Load merge
  try {
    const { merge, findMatch } = require('./merge');
    console.log('✅ Merge module loaded');
    results.modules.merge = true;
    
    // Test findMatch
    const existing = [{ id: '1', name_normalized: 'test', address: '123 main' }];
    const incoming = { id: '1', name_normalized: 'test', address: '123 main' };
    const match = findMatch(incoming, existing);
    console.log(`   - Find match function: ${match ? '✓' : '✗'}`);
    
  } catch (error) {
    console.error('❌ Merge module failed:', error.message);
    results.modules.merge = false;
    results.errors.push({ module: 'merge', error: error.message });
  }
  
  // Test 5: Load quality
  try {
    const { quality, quickCheck, calculateOverallScore } = require('./quality');
    console.log('✅ Quality module loaded');
    results.modules.quality = true;
    
    // Test quickCheck
    const check = quickCheck({ name: '', cuisine: ['Chinese'] });
    console.log(`   - Quick check function: ${!check.valid ? '✓' : '✗'}`);
    
  } catch (error) {
    console.error('❌ Quality module failed:', error.message);
    results.modules.quality = false;
    results.errors.push({ module: 'quality', error: error.message });
  }
  
  // Test 6: Load main index
  try {
    const { runPipeline, dryRun } = require('./index');
    console.log('✅ Pipeline index loaded');
    results.modules.index = true;
    
  } catch (error) {
    console.error('❌ Pipeline index failed:', error.message);
    results.modules.index = false;
    results.errors.push({ module: 'index', error: error.message });
  }
  
  // Run functional tests
  console.log('\n🧪 Running functional tests...\n');
  
  // Test 7: Standardize functionality
  try {
    const { standardize } = require('./standardize');
    
    const testData = [{
      noteId: 'test-001',
      restaurantName: 'Test Restaurant',
      address: '123 Test St, San Francisco, CA',
      cuisine: ['Chinese'],
      area: 'SF',
      likedCount: 100,
      commentCount: 20
    }];
    
    const result = await standardize(testData, {
      dryRun: true,
      enableGeocoding: false,
      logLevel: 'ERROR'
    });
    
    if (result.records.length === 1 && result.records[0].name === 'Test Restaurant') {
      console.log('✅ Standardize functional test passed');
      results.modules.standardizeFunctional = true;
    } else {
      throw new Error('Standardize output incorrect');
    }
  } catch (error) {
    console.error('❌ Standardize functional test failed:', error.message);
    results.modules.standardizeFunctional = false;
    results.errors.push({ test: 'standardizeFunctional', error: error.message });
  }
  
  // Test 8: Clean functionality - deduplication by name + address
  try {
    const { clean, generateDedupKey } = require('./clean');
    
    const testData = [
      { id: '1', name: 'Restaurant A', name_normalized: 'restaurant a', address: '123 Main St', cuisine: ['Chinese'] },
      { id: '2', name: 'Restaurant A', name_normalized: 'restaurant a', address: '123 Main St', cuisine: ['Chinese'] },
      { id: '3', name: 'Cupertino', address: '456 Oak St', cuisine: [] } // Blocked name
    ];
    
    // Test dedup key generation
    const key1 = generateDedupKey(testData[0], ['name_normalized', 'address']);
    const key2 = generateDedupKey(testData[1], ['name_normalized', 'address']);
    console.log(`   - Dedup keys match: ${key1 === key2 ? '✓' : '✗'} (${key1})`);
    
    const result = await clean(testData, {
      dryRun: true,
      dedupKeys: ['name_normalized', 'address'], // Use name+address without google_place_id
      logLevel: 'ERROR'
    });
    
    console.log(`   - Stats: ${JSON.stringify(result.stats)}`);
    
    if (result.stats.blocked === 1 && result.stats.output === 2) {
      console.log('✅ Clean functional test passed');
      results.modules.cleanFunctional = true;
    } else {
      throw new Error(`Clean output incorrect: ${JSON.stringify(result.stats)}`);
    }
  } catch (error) {
    console.error('❌ Clean functional test failed:', error.message);
    results.modules.cleanFunctional = false;
    results.errors.push({ test: 'cleanFunctional', error: error.message });
  }
  
  // Test 9: Quality functionality
  try {
    const { quality } = require('./quality');
    
    const testData = [
      { id: '1', name: 'Good Restaurant', cuisine: ['Chinese'], area: 'SF', rating: 4.5 },
      { id: '2', name: 'Bad Restaurant', cuisine: [], area: '', rating: 10 } // Invalid
    ];
    
    const result = await quality(testData, {
      dryRun: true,
      generateReport: false,
      logLevel: 'ERROR'
    });
    
    if (result.overall_score !== undefined && result.flagged.length > 0) {
      console.log('✅ Quality functional test passed');
      results.modules.qualityFunctional = true;
    } else {
      throw new Error('Quality output incorrect');
    }
  } catch (error) {
    console.error('❌ Quality functional test failed:', error.message);
    results.modules.qualityFunctional = false;
    results.errors.push({ test: 'qualityFunctional', error: error.message });
  }
  
  // Summary
  console.log('\n📊 Summary\n');
  
  const totalTests = Object.keys(results.modules).length;
  const passedTests = Object.values(results.modules).filter(v => v === true).length;
  
  console.log(`Total modules/tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const err of results.errors) {
      console.log(`  - ${err.module || err.test}: ${err.error}`);
    }
  }
  
  console.log('\n✅ ETL Pipeline verification complete!');
  
  return results;
}

// Run verification
verifyModules().catch(console.error);
