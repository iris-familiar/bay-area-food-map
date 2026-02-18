#!/usr/bin/env node
/**
 * QA Orchestrator - Agent-based Quality Assurance Workflow
 * 
 * Usage: node qa-orchestrator.js [--mode=full|backend|frontend]
 * 
 * This orchestrator can:
 * 1. Run locally using embedded checks
 * 2. Spawn sub-agents for deeper validation (when running inside OpenClaw)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const PROJECT_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map';
const QA_DIR = path.join(PROJECT_DIR, 'qa');
const REPORTS_DIR = path.join(QA_DIR, 'reports');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// Colors
const C = {
  blue: '\x1b[34m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

const log = (msg) => console.log(`${C.blue}[QA Orchestrator]${C.reset} ${msg}`);
const success = (msg) => console.log(`${C.green}[✓]${C.reset} ${msg}`);
const error = (msg) => console.log(`${C.red}[✗]${C.reset} ${msg}`);
const warning = (msg) => console.log(`${C.yellow}[!]${C.reset} ${msg}`);

// ============================================
// Backend QA Agent
// ============================================
class BackendQAAgent {
  constructor() {
    this.name = 'Backend QA Agent';
    this.results = {
      agent: 'backend_qa',
      timestamp: new Date().toISOString(),
      status: 'running',
      checks: {},
      issues: [],
      stats: {}
    };
  }

  async run() {
    log(`${this.name} starting...`);

    // Check 1: Data Files Exist
    this.checkDataFiles();
    
    // Check 2: Schema Validation
    await this.validateSchema();
    
    // Check 3: Data Integrity
    this.checkDataIntegrity();
    
    // Check 4: Cross-Reference
    this.crossReference();
    
    // Check 5: Verification Status
    this.checkVerification();

    // Final status
    this.calculateFinalStatus();
    
    // Save report
    this.saveReport();
    
    return this.results;
  }

  checkDataFiles() {
    const files = [
      'data/current/restaurant_database.json',
      'data/current/restaurant_database_v5_ui.json',
      'data/current/search_mapping.json'
    ];
    
    const missing = [];
    files.forEach(f => {
      if (!fs.existsSync(path.join(PROJECT_DIR, f))) {
        missing.push(f);
      }
    });

    this.results.checks.data_files = {
      status: missing.length === 0 ? 'PASS' : 'FAIL',
      required: files,
      missing: missing
    };

    if (missing.length > 0) {
      this.results.issues.push(`Missing data files: ${missing.join(', ')}`);
    }
  }

  async validateSchema() {
    try {
      const dbPath = path.join(PROJECT_DIR, 'data/current/restaurant_database.json');
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      
      const requiredFields = ['id', 'name', 'cuisine', 'area'];
      const restaurants = data.restaurants || [];
      
      let schemaErrors = 0;
      const sample = restaurants.slice(0, 10);
      
      sample.forEach(r => {
        requiredFields.forEach(field => {
          if (!(field in r)) schemaErrors++;
        });
      });

      this.results.checks.schema = {
        status: schemaErrors === 0 ? 'PASS' : 'WARNING',
        total_restaurants: restaurants.length,
        schema_errors_in_sample: schemaErrors,
        sample_size: sample.length,
        version: data.version
      };

      if (schemaErrors > 0) {
        this.results.issues.push(`${schemaErrors} schema errors found in sample`);
      }

      // Store for later
      this.dbData = data;

    } catch (e) {
      this.results.checks.schema = { status: 'FAIL', error: e.message };
      this.results.issues.push(`Schema validation failed: ${e.message}`);
    }
  }

  checkDataIntegrity() {
    if (!this.dbData) return;

    const restaurants = this.dbData.restaurants || [];
    const invalid = restaurants.filter(r => !r.id || !r.name);
    const duplicates = this.findDuplicates(restaurants, 'id');

    this.results.checks.integrity = {
      status: (invalid.length === 0 && duplicates.length === 0) ? 'PASS' : 'FAIL',
      total: restaurants.length,
      invalid_entries: invalid.length,
      duplicate_ids: duplicates
    };

    if (invalid.length > 0) {
      this.results.issues.push(`${invalid.length} restaurants missing id or name`);
    }
    if (duplicates.length > 0) {
      this.results.issues.push(`Duplicate IDs found: ${duplicates.join(', ')}`);
    }
  }

  findDuplicates(array, key) {
    const seen = new Set();
    const duplicates = [];
    array.forEach(item => {
      const val = item[key];
      if (seen.has(val)) {
        duplicates.push(val);
      } else {
        seen.add(val);
      }
    });
    return [...new Set(duplicates)];
  }

  crossReference() {
    try {
      const v5Path = path.join(PROJECT_DIR, 'data/current/restaurant_database_v5_ui.json');
      const v5Data = JSON.parse(fs.readFileSync(v5Path, 'utf8'));
      
      const mainIds = new Set((this.dbData?.restaurants || []).map(r => r.id));
      const v5Ids = new Set((v5Data.restaurants || []).map(r => r.id));
      
      const onlyInV5 = [...v5Ids].filter(id => !mainIds.has(id));
      const onlyInMain = [...mainIds].filter(id => !v5Ids.has(id));

      this.results.checks.cross_reference = {
        status: (onlyInV5.length === 0 && onlyInMain.length === 0) ? 'PASS' : 'WARNING',
        main_count: mainIds.size,
        v5_count: v5Ids.size,
        only_in_v5: onlyInV5.slice(0, 5),
        only_in_main: onlyInMain.slice(0, 5),
        data_drift: onlyInV5.length + onlyInMain.length
      };

      if (onlyInV5.length > 0 || onlyInMain.length > 0) {
        this.results.issues.push(`Data drift: ${onlyInV5.length} only in v5, ${onlyInMain.length} only in main`);
      }

      this.v5Data = v5Data;

    } catch (e) {
      this.results.checks.cross_reference = { status: 'FAIL', error: e.message };
      this.results.issues.push(`Cross-reference failed: ${e.message}`);
    }
  }

  checkVerification() {
    if (!this.dbData) return;

    const restaurants = this.dbData.restaurants || [];
    const verified = restaurants.filter(r => r.verified === true);
    const withGoogle = restaurants.filter(r => r.google_rating !== undefined);
    const withSentiment = restaurants.filter(r => 
      r.sentiment_score !== undefined || 
      (r.metrics?.sentiment_analysis?.score !== undefined)
    );

    this.results.checks.verification = {
      status: 'INFO',
      total: restaurants.length,
      verified: verified.length,
      with_google_rating: withGoogle.length,
      with_sentiment: withSentiment.length,
      verification_rate: ((verified.length / restaurants.length) * 100).toFixed(1) + '%'
    };

    this.results.stats = {
      total_restaurants: restaurants.length,
      verified: verified.length,
      with_google_rating: withGoogle.length,
      with_sentiment: withSentiment.length,
      cuisine_types: [...new Set(restaurants.map(r => r.cuisine).filter(Boolean))].length,
      areas: [...new Set(restaurants.map(r => r.area).filter(Boolean))].length
    };
  }

  calculateFinalStatus() {
    const hasFailures = Object.values(this.results.checks).some(c => c.status === 'FAIL');
    const hasWarnings = Object.values(this.results.checks).some(c => c.status === 'WARNING');
    
    this.results.status = hasFailures ? 'FAILED' : (hasWarnings ? 'PASSED_WITH_WARNINGS' : 'PASSED');
  }

  saveReport() {
    const reportPath = path.join(REPORTS_DIR, `backend_qa_${TIMESTAMP}.json`);
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    success(`${this.name} report saved: ${reportPath}`);
  }
}

// ============================================
// Frontend QA Agent
// ============================================
class FrontendQAAgent {
  constructor() {
    this.name = 'Frontend QA Agent';
    this.results = {
      agent: 'frontend_qa',
      timestamp: new Date().toISOString(),
      status: 'running',
      checks: {},
      issues: [],
      ui_components: {}
    };
  }

  async run() {
    log(`${this.name} starting...`);

    // Check 1: File Structure
    this.checkFileStructure();
    
    // Check 2: HTML Structure
    this.checkHTML();
    
    // Check 3: Data Loading (HTTP)
    await this.testDataLoading();
    
    // Check 4: JavaScript Functions
    this.checkJavaScript();

    // Final status
    this.calculateFinalStatus();
    
    // Save report
    this.saveReport();
    
    return this.results;
  }

  checkFileStructure() {
    const files = [
      'index.html',
      'data/current/restaurant_database_v5_ui.json',
      'data/current/search_mapping.json'
    ];
    
    const missing = [];
    files.forEach(f => {
      if (!fs.existsSync(path.join(PROJECT_DIR, f))) {
        missing.push(f);
      }
    });

    this.results.checks.file_structure = {
      status: missing.length === 0 ? 'PASS' : 'FAIL',
      required: files,
      missing: missing
    };

    if (missing.length > 0) {
      this.results.issues.push(`Missing files: ${missing.join(', ')}`);
    }
  }

  checkHTML() {
    try {
      const html = fs.readFileSync(path.join(PROJECT_DIR, 'index.html'), 'utf8');
      
      const requiredElements = [
        { name: 'restaurant_grid', test: /id="restaurant-grid"/ },
        { name: 'search_box', test: /id=".*search.*"/i },
        { name: 'cuisine_filters', test: /cuisine|湘菜|川菜|日料/ },
        { name: 'stats_display', test: /口碑|评分|stats|count/ },
        { name: 'loading_state', test: /loading|hidden/ },
        { name: 'modal_detail', test: /modal|detail|showDetail/ }
      ];
      
      const found = requiredElements.filter(e => e.test.test(html));

      this.results.checks.html_structure = {
        status: found.length === requiredElements.length ? 'PASS' : 'WARNING',
        required_elements: requiredElements.map(e => e.name),
        found_count: found.length,
        total_required: requiredElements.length,
        missing: requiredElements.filter(e => !found.includes(e)).map(e => e.name)
      };

      if (found.length < requiredElements.length) {
        this.results.issues.push(`Missing HTML elements: ${this.results.checks.html_structure.missing.join(', ')}`);
      }

      this.htmlContent = html;

    } catch (e) {
      this.results.checks.html_structure = { status: 'FAIL', error: e.message };
      this.results.issues.push(`HTML check failed: ${e.message}`);
    }
  }

  async testDataLoading() {
    return new Promise((resolve) => {
      const req = http.get('http://localhost:8888/data/current/restaurant_database_v5_ui.json', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            this.results.checks.data_loading = {
              status: 'PASS',
              http_status: res.statusCode,
              content_type: res.headers['content-type'],
              data_size_bytes: data.length,
              restaurant_count: parsed.restaurants?.length || 0,
              version: parsed.version
            };
            this.loadedData = parsed;
            resolve();
          } catch (e) {
            this.results.checks.data_loading = {
              status: 'FAIL',
              http_status: res.statusCode,
              error: 'Invalid JSON: ' + e.message
            };
            this.results.issues.push('Data loading failed: Invalid JSON');
            resolve();
          }
        });
      });
      
      req.on('error', (e) => {
        this.results.checks.data_loading = {
          status: 'FAIL',
          error: e.message
        };
        this.results.issues.push(`Data loading failed: ${e.message} (is server running?)`);
        resolve();
      });
      
      req.setTimeout(10000, () => {
        req.destroy();
        this.results.checks.data_loading = {
          status: 'FAIL',
          error: 'Timeout after 10s'
        };
        this.results.issues.push('Data loading timeout - server may be down');
        resolve();
      });
    });
  }

  checkJavaScript() {
    if (!this.htmlContent) {
      this.results.checks.javascript = { status: 'SKIP', reason: 'No HTML loaded' };
      return;
    }

    const requiredFunctions = [
      { name: 'loadData', pattern: /function\s+loadData|async\s+function\s+loadData|const\s+loadData\s*=/ },
      { name: 'renderRestaurants', pattern: /function\s+renderRestaurants/ },
      { name: 'applyFilters', pattern: /function\s+applyFilters/ },
      { name: 'getSentimentScore', pattern: /function\s+getSentimentScore/ },
      { name: 'updateStats', pattern: /function\s+updateStats/ },
      { name: 'showDetail', pattern: /function\s+showDetail/ },
      { name: 'embeddedSearchMapping', pattern: /function\s+embeddedSearchMapping/ }
    ];
    
    const found = requiredFunctions.filter(fn => fn.pattern.test(this.htmlContent));

    this.results.checks.javascript = {
      status: found.length === requiredFunctions.length ? 'PASS' : 'WARNING',
      required_functions: requiredFunctions.map(f => f.name),
      found_count: found.length,
      total_required: requiredFunctions.length,
      missing: requiredFunctions.filter(f => !found.includes(f)).map(f => f.name)
    };

    if (found.length < requiredFunctions.length) {
      this.results.issues.push(`Missing JS functions: ${this.results.checks.javascript.missing.join(', ')}`);
    }
  }

  calculateFinalStatus() {
    const hasFailures = Object.values(this.results.checks).some(c => c.status === 'FAIL');
    const hasWarnings = Object.values(this.results.checks).some(c => c.status === 'WARNING');
    
    this.results.status = hasFailures ? 'FAILED' : (hasWarnings ? 'PASSED_WITH_WARNINGS' : 'PASSED');
  }

  saveReport() {
    const reportPath = path.join(REPORTS_DIR, `frontend_qa_${TIMESTAMP}.json`);
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    success(`${this.name} report saved: ${reportPath}`);
  }
}

// ============================================
// Compare Notes & Generate Report
// ============================================
function compareNotes(backendResults, frontendResults) {
  log('Comparing notes between agents...');

  const comparison = {
    timestamp: new Date().toISOString(),
    overall_status: 'PENDING',
    agents: {
      backend: {
        status: backendResults.status,
        issues: backendResults.issues.length,
        stats: backendResults.stats
      },
      frontend: {
        status: frontendResults.status,
        issues: frontendResults.issues.length,
        restaurant_count_from_api: frontendResults.checks.data_loading?.restaurant_count
      }
    },
    data_consistency: {
      backend_count: backendResults.stats?.total_restaurants || 0,
      frontend_count: frontendResults.checks.data_loading?.restaurant_count || 0,
      match: backendResults.stats?.total_restaurants === frontendResults.checks.data_loading?.restaurant_count
    },
    cross_validation: {
      backend_data_files: backendResults.checks.data_files?.status,
      frontend_file_structure: frontendResults.checks.file_structure?.status,
      data_loading: frontendResults.checks.data_loading?.status
    },
    issues_summary: {
      total: backendResults.issues.length + frontendResults.issues.length,
      backend_issues: backendResults.issues,
      frontend_issues: frontendResults.issues
    },
    recommendations: []
  };

  // Determine overall status
  const backendFailed = backendResults.status === 'FAILED';
  const frontendFailed = frontendResults.status === 'FAILED';
  const dataMismatch = !comparison.data_consistency.match;
  
  if (backendFailed || frontendFailed || dataMismatch) {
    comparison.overall_status = 'FAILED';
    comparison.recommendations.push('❌ CRITICAL: Fix failures before deployment');
  } else if (backendResults.status.includes('WARNING') || frontendResults.status.includes('WARNING')) {
    comparison.overall_status = 'PASSED_WITH_WARNINGS';
    comparison.recommendations.push('⚠️ Review warnings but deployment is acceptable');
  } else {
    comparison.overall_status = 'PASSED';
    comparison.recommendations.push('✅ All checks passed - safe to deploy');
  }

  // Specific recommendations
  if (dataMismatch) {
    comparison.recommendations.push(`🔄 Data count mismatch: Backend has ${comparison.data_consistency.backend_count}, Frontend loads ${comparison.data_consistency.frontend_count}`);
  }

  const verificationRate = parseFloat(backendResults.stats?.verification_rate || '0');
  if (verificationRate < 50) {
    comparison.recommendations.push(`📍 Low verification rate (${backendResults.stats?.verification_rate}) - consider Google Places verification`);
  }

  if (!frontendResults.checks.data_loading || frontendResults.checks.data_loading.status !== 'PASS') {
    comparison.recommendations.push('🌐 Frontend cannot load data - check if server is running on localhost:8888');
  }

  return comparison;
}

function generateMarkdownReport(comparison, backendResults, frontendResults) {
  const reportPath = path.join(REPORTS_DIR, `qa_summary_${TIMESTAMP}.md`);
  
  const md = `# QA Workflow Report

**Timestamp:** ${new Date().toISOString()}  
**Overall Status:** ${comparison.overall_status}

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Backend Status | ${backendResults.status} |
| Frontend Status | ${frontendResults.status} |
| Data Consistency | ${comparison.data_consistency.match ? '✅ Match' : '❌ Mismatch'} |
| Total Issues | ${comparison.issues_summary.total} |

---

## Backend QA Results

**Status:** ${backendResults.status}

### Stats
- Total Restaurants: ${backendResults.stats?.total_restaurants || 'N/A'}
- Verified: ${backendResults.stats?.verified || 'N/A'} (${backendResults.stats?.verification_rate || 'N/A'})
- With Google Rating: ${backendResults.stats?.with_google_rating || 'N/A'}
- Cuisine Types: ${backendResults.stats?.cuisine_types || 'N/A'}

### Checks
${Object.entries(backendResults.checks).map(([name, check]) => 
  `- **${name}**: ${check.status}${check.error ? ` (Error: ${check.error})` : ''}`
).join('\n')}

### Issues (${backendResults.issues.length})
${backendResults.issues.map(i => `- ${i}`).join('\n') || 'None'}

---

## Frontend QA Results

**Status:** ${frontendResults.status}

### Data Loading
- HTTP Status: ${frontendResults.checks.data_loading?.http_status || 'N/A'}
- Restaurants Loaded: ${frontendResults.checks.data_loading?.restaurant_count || 'N/A'}
- Data Size: ${frontendResults.checks.data_loading?.data_size_bytes ? (frontendResults.checks.data_loading.data_size_bytes / 1024).toFixed(1) + ' KB' : 'N/A'}

### Checks
${Object.entries(frontendResults.checks).map(([name, check]) => 
  `- **${name}**: ${check.status}${check.error ? ` (Error: ${check.error})` : ''}`
).join('\n')}

### Issues (${frontendResults.issues.length})
${frontendResults.issues.map(i => `- ${i}`).join('\n') || 'None'}

---

## Recommendations

${comparison.recommendations.map(r => `- ${r}`).join('\n')}

---

## Raw Reports

- Backend: \`reports/backend_qa_${TIMESTAMP}.json\`
- Frontend: \`reports/frontend_qa_${TIMESTAMP}.json\`

---
*Generated by QA Orchestrator*
`;

  fs.writeFileSync(reportPath, md);
  success(`Markdown report saved: ${reportPath}`);
  return reportPath;
}

// ============================================
// Main
// ============================================
async function main() {
  const mode = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'full';
  
  log('==============================================');
  log('QA Workflow Orchestrator');
  log('Mode: ' + mode);
  log('==============================================');

  let backendResults, frontendResults;

  if (mode === 'full' || mode === 'backend') {
    const backendAgent = new BackendQAAgent();
    backendResults = await backendAgent.run();
  }

  if (mode === 'full' || mode === 'frontend') {
    const frontendAgent = new FrontendQAAgent();
    frontendResults = await frontendAgent.run();
  }

  if (mode === 'full' && backendResults && frontendResults) {
    const comparison = compareNotes(backendResults, frontendResults);
    const reportPath = generateMarkdownReport(comparison, backendResults, frontendResults);
    
    // Also save JSON comparison
    const comparisonPath = path.join(REPORTS_DIR, `qa_comparison_${TIMESTAMP}.json`);
    fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));

    // Print summary
    log('==============================================');
    log('FINAL RESULT: ' + comparison.overall_status);
    log('==============================================');
    comparison.recommendations.forEach(r => console.log('  ' + r));
    log('');
    log(`Full report: ${reportPath}`);
    
    // Exit with appropriate code
    process.exit(comparison.overall_status === 'FAILED' ? 1 : 0);
  }

  log('QA Workflow completed!');
}

// Run
main().catch(e => {
  error('Orchestrator failed: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
