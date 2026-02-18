#!/usr/bin/env node
/**
 * Enhanced QA Checks - Business Logic Validation
 * 
 * This module adds deep validation that the original QA missed:
 * - Data value sanity checks (not just existence)
 * - Cross-view consistency (homepage vs detail page)
 * - State persistence (localStorage)
 * - Configuration validation
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map';

class EnhancedQA {
  constructor() {
    this.issues = [];
    this.warnings = [];
  }

  // ============================================
  // 1. Data Value Sanity Checks
  // ============================================
  checkDataSanity() {
    console.log('🔍 Checking data value sanity...');
    
    const data = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'data/current/restaurant_database.json'), 'utf8'));
    const restaurants = data.restaurants || [];
    
    // Check 1: Suspicious default values
    const engagementCounts = {};
    restaurants.forEach(r => {
      const eng = r.total_engagement;
      engagementCounts[eng] = (engagementCounts[eng] || 0) + 1;
    });
    
    // Find values that appear too frequently (possible defaults)
    Object.entries(engagementCounts).forEach(([value, count]) => {
      if (count >= 3 && value !== '0') {
        this.warnings.push(`Suspicious: ${count} restaurants have identical engagement value ${value} (possible default)`);
        
        // List affected restaurants
        const affected = restaurants.filter(r => r.total_engagement == value).map(r => r.name);
        this.warnings.push(`  Affected: ${affected.join(', ')}`);
      }
    });
    
    // Check 2: Engagement vs mention_count consistency
    restaurants.forEach(r => {
      if (r.total_engagement > 0 && r.mention_count === 1 && r.total_engagement > 100) {
        this.warnings.push(`Data inconsistency: ${r.name} has ${r.total_engagement} engagement but only 1 mention`);
      }
    });
    
    // Check 3: Cross-field consistency
    restaurants.forEach(r => {
      const v5Engagement = r.total_engagement;
      const metricsEngagement = r.metrics?.discussion_volume?.total_engagement;
      const timeSeriesEngagement = r.time_series?.total_engagement;
      
      // If both exist but differ significantly, that's a problem
      if (v5Engagement !== undefined && metricsEngagement !== undefined && v5Engagement !== metricsEngagement) {
        this.issues.push(`CRITICAL: ${r.name} has inconsistent engagement values: v5=${v5Engagement}, metrics=${metricsEngagement}`);
      }
    });
    
    console.log(`  ✓ Checked ${restaurants.length} restaurants`);
  }

  // ============================================
  // 2. Configuration Checks
  // ============================================
  checkConfiguration() {
    console.log('🔍 Checking configuration values...');
    
    const html = fs.readFileSync(path.join(PROJECT_DIR, 'index.html'), 'utf8');
    
    // Check refresh interval
    const intervalMatch = html.match(/setInterval\([^)]+,\s*(\d+)\s*\)/);
    if (intervalMatch) {
      const interval = parseInt(intervalMatch[1]);
      if (interval < 300000) { // Less than 5 minutes
        this.warnings.push(`Refresh interval is ${interval}ms (${(interval/1000).toFixed(1)}s) - consider increasing to 300000ms (5min) to reduce server load`);
      }
    }
    
    // Check for hardcoded values that should be configurable
    if (html.includes('60000') && html.includes('setInterval')) {
      this.warnings.push('Found hardcoded 60000ms (60s) interval - should this be 300000ms (5min)?');
    }
  }

  // ============================================
  // 3. State Persistence Checks
  // ============================================
  checkStatePersistence() {
    console.log('🔍 Checking state persistence...');
    
    const html = fs.readFileSync(path.join(PROJECT_DIR, 'index.html'), 'utf8');
    
    // Check if localStorage is used for filter state
    const hasLocalStorageSave = html.includes('localStorage.setItem') && 
                                html.includes('foodmap_filter');
    const hasLocalStorageRestore = html.includes('localStorage.getItem') && 
                                   html.includes('foodmap_filter');
    
    if (!hasLocalStorageSave) {
      this.issues.push('CRITICAL: Filter state is not saved to localStorage - user selections will be lost on refresh');
    }
    
    if (!hasLocalStorageRestore) {
      this.issues.push('CRITICAL: Filter state is not restored from localStorage on page load');
    }
    
    // Check all filter types are covered
    const filterTypes = ['cuisine', 'area', 'price', 'sort'];
    filterTypes.forEach(type => {
      const savePattern = new RegExp(`localStorage\\.setItem\\(['"]foodmap_.*${type}['"]`);
      const restorePattern = new RegExp(`localStorage\\.getItem\\(['"]foodmap_.*${type}['"]`);
      
      if (!savePattern.test(html)) {
        this.warnings.push(`${type} filter state may not be saved to localStorage`);
      }
    });
  }

  // ============================================
  // 4. Cross-View Consistency Checks
  // ============================================
  checkCrossViewConsistency() {
    console.log('🔍 Checking cross-view consistency...');
    
    const html = fs.readFileSync(path.join(PROJECT_DIR, 'index.html'), 'utf8');
    
    // Check that both renderRestaurants and showDetail use the same data field
    const renderPattern = /r\.total_engagement|engagement.*?total_engagement/i;
    const detailPattern = /showDetail.*?engagement|modal.*?engagement/i;
    
    const renderSection = html.match(/function renderRestaurants[\s\S]*?function \w+\s*\(/);
    const detailSection = html.match(/function showDetail[\s\S]*?function \w+\s*\(/);
    
    if (renderSection && detailSection) {
      const renderUsesV5 = renderSection[0].includes('r.total_engagement');
      const detailUsesV5 = detailSection[0].includes('r.total_engagement');
      
      if (renderUsesV5 !== detailUsesV5) {
        this.issues.push('CRITICAL: renderRestaurants and showDetail use different engagement field formats - this causes data inconsistency between list and detail views');
      }
    }
  }

  // ============================================
  // 5. Data Quality Checks
  // ============================================
  checkDataQuality() {
    console.log('🔍 Checking data quality...');
    
    const data = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'data/current/restaurant_database.json'), 'utf8'));
    const restaurants = data.restaurants || [];
    
    // Check for undefined values
    let undefinedCount = 0;
    restaurants.forEach(r => {
      if (r.total_engagement === undefined) undefinedCount++;
      if (r.sentiment_score === undefined) undefinedCount++;
    });
    
    if (undefinedCount > 0) {
      this.warnings.push(`${undefinedCount} restaurants have undefined critical fields - defaults may be applied`);
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      { field: 'total_engagement', values: [144, 75, 1], threshold: 10, reason: 'possible default values' }
    ];
    
    suspiciousPatterns.forEach(pattern => {
      const count = restaurants.filter(r => pattern.values.includes(r[pattern.field])).length;
      if (count > pattern.threshold) {
        this.warnings.push(`${count} restaurants have ${pattern.reason} for ${pattern.field}: ${pattern.values.join(', ')}`);
      }
    });
  }

  // ============================================
  // Run All Checks
  // ============================================
  run() {
    console.log('\n========================================');
    console.log('🔬 Enhanced QA - Deep Business Logic Check');
    console.log('========================================\n');
    
    this.checkDataSanity();
    this.checkConfiguration();
    this.checkStatePersistence();
    this.checkCrossViewConsistency();
    this.checkDataQuality();
    
    console.log('\n========================================');
    console.log('📊 Results');
    console.log('========================================');
    
    if (this.issues.length === 0 && this.warnings.length === 0) {
      console.log('✅ All enhanced checks passed!');
    } else {
      if (this.issues.length > 0) {
        console.log(`\n❌ CRITICAL ISSUES (${this.issues.length}):`);
        this.issues.forEach(i => console.log(`  - ${i}`));
      }
      
      if (this.warnings.length > 0) {
        console.log(`\n⚠️  WARNINGS (${this.warnings.length}):`);
        this.warnings.forEach(w => console.log(`  - ${w}`));
      }
    }
    
    return {
      passed: this.issues.length === 0,
      issues: this.issues,
      warnings: this.warnings
    };
  }
}

// Run
const qa = new EnhancedQA();
const result = qa.run();

process.exit(result.passed ? 0 : 1);
