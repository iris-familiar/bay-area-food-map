#!/bin/bash
# QA Workflow Orchestrator
# Usage: ./qa-workflow.sh [mode]
#   mode: full (default) | backend | frontend | report

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
QA_DIR="${PROJECT_DIR}/qa"
REPORTS_DIR="${QA_DIR}/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[QA Workflow]${NC} $1"
}

success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Ensure directories exist
mkdir -p "${REPORTS_DIR}"

# ============================================
# Backend QA Agent
# ============================================
run_backend_qa() {
    log "Starting Backend QA Agent..."
    
    local report_file="${REPORTS_DIR}/backend_qa_${TIMESTAMP}.json"
    local log_file="${REPORTS_DIR}/backend_qa_${TIMESTAMP}.log"
    
    cat > "${QA_DIR}/backend_qa_task.json" << 'EOF'
{
  "task": "backend_qa",
  "checks": [
    "data_integrity",
    "schema_validation", 
    "cross_reference",
    "completeness"
  ],
  "data_files": [
    "data/current/restaurant_database.json",
    "data/current/restaurant_database_v5_ui.json",
    "data/current/search_mapping.json"
  ],
  "reference_files": [
    "data/raw/v2/posts/"
  ]
}
EOF
    
    # Run backend QA via agent spawn
    log "Spawning Backend QA Agent..."
    
    # Create the backend QA validation script
    node > "${log_file}" 2>&1 << 'NODE_SCRIPT'
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map';
const results = {
    agent: 'backend_qa',
    timestamp: new Date().toISOString(),
    status: 'running',
    checks: {},
    issues: [],
    stats: {}
};

function loadJSON(filepath) {
    try {
        return JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, filepath), 'utf8'));
    } catch (e) {
        return { error: e.message };
    }
}

// Check 1: Data Integrity
logCheck('data_integrity');
const db = loadJSON('data/current/restaurant_database.json');
const v5ui = loadJSON('data/current/restaurant_database_v5_ui.json');

if (db.error) {
    results.checks.data_integrity = { status: 'FAIL', error: db.error };
    results.issues.push('Cannot load restaurant_database.json');
} else {
    const restaurants = db.restaurants || [];
    const invalid = restaurants.filter(r => !r.id || !r.name);
    
    results.checks.data_integrity = {
        status: invalid.length === 0 ? 'PASS' : 'FAIL',
        total_restaurants: restaurants.length,
        invalid_entries: invalid.length,
        details: invalid.length > 0 ? invalid.map(r => r.id || 'unknown') : null
    };
    
    if (invalid.length > 0) {
        results.issues.push(`${invalid.length} restaurants missing id or name`);
    }
}

// Check 2: Schema Validation
logCheck('schema_validation');
const requiredFields = ['id', 'name', 'cuisine', 'area'];
const v5Fields = ['sentiment_score', 'total_engagement'];

if (!db.error && db.restaurants) {
    const sample = db.restaurants.slice(0, 5);
    const schemaIssues = [];
    
    sample.forEach(r => {
        requiredFields.forEach(field => {
            if (!(field in r)) schemaIssues.push(`${r.id || 'unknown'} missing ${field}`);
        });
    });
    
    results.checks.schema_validation = {
        status: schemaIssues.length === 0 ? 'PASS' : 'WARNING',
        required_fields: requiredFields,
        missing_in_sample: schemaIssues,
        sample_size: sample.length
    };
    
    if (schemaIssues.length > 0) {
        results.issues.push(`Schema issues in ${schemaIssues.length} sample restaurants`);
    }
}

// Check 3: Cross-reference (v5_ui vs main db)
logCheck('cross_reference');
if (!v5ui.error && !db.error) {
    const mainIds = new Set((db.restaurants || []).map(r => r.id));
    const v5Ids = new Set((v5ui.restaurants || []).map(r => r.id));
    
    const onlyInV5 = [...v5Ids].filter(id => !mainIds.has(id));
    const onlyInMain = [...mainIds].filter(id => !v5Ids.has(id));
    
    results.checks.cross_reference = {
        status: onlyInV5.length === 0 && onlyInMain.length === 0 ? 'PASS' : 'WARNING',
        main_db_count: mainIds.size,
        v5_ui_count: v5Ids.size,
        only_in_v5_ui: onlyInV5.slice(0, 10),
        only_in_main: onlyInMain.slice(0, 10)
    };
    
    if (onlyInV5.length > 0 || onlyInMain.length > 0) {
        results.issues.push(`Data drift: ${onlyInV5.length} only in v5, ${onlyInMain.length} only in main`);
    }
}

// Check 4: Verification Status
logCheck('verification_status');
if (!db.error && db.restaurants) {
    const verified = db.restaurants.filter(r => r.verified === true);
    const withGoogleRating = db.restaurants.filter(r => r.google_rating !== undefined);
    
    results.checks.verification_status = {
        status: 'INFO',
        verified_count: verified.length,
        with_google_rating: withGoogleRating.length,
        verification_rate: ((verified.length / db.restaurants.length) * 100).toFixed(1) + '%'
    };
    
    results.stats = {
        total_restaurants: db.restaurants.length,
        verified: verified.length,
        with_google_rating: withGoogleRating.length,
        cuisine_types: [...new Set(db.restaurants.map(r => r.cuisine).filter(Boolean))].length
    };
}

// Final status
const hasFailures = Object.values(results.checks).some(c => c.status === 'FAIL');
const hasWarnings = Object.values(results.checks).some(c => c.status === 'WARNING');

results.status = hasFailures ? 'FAILED' : (hasWarnings ? 'PASSED_WITH_WARNINGS' : 'PASSED');

console.log(JSON.stringify(results, null, 2));

function logCheck(name) {
    console.error(`[Backend QA] Running check: ${name}...`);
}
NODE_SCRIPT

    if [ $? -eq 0 ]; then
        success "Backend QA completed"
        cat "${log_file}" | tail -1 > "${report_file}"
        return 0
    else
        error "Backend QA failed"
        return 1
    fi
}

# ============================================
# Frontend QA Agent  
# ============================================
run_frontend_qa() {
    log "Starting Frontend QA Agent..."
    
    local report_file="${REPORTS_DIR}/frontend_qa_${TIMESTAMP}.json"
    local log_file="${REPORTS_DIR}/frontend_qa_${TIMESTAMP}.log"
    
    # Check if server is running
    if ! curl -s http://localhost:8888 > /dev/null; then
        warning "Server not running on localhost:8888, attempting to start..."
        cd "${PROJECT_DIR}" && python3 -m http.server 8888 &
        sleep 2
    fi
    
    # Run frontend QA checks
    node > "${log_file}" 2>&1 << 'NODE_SCRIPT'
const fs = require('fs');
const http = require('http');

const results = {
    agent: 'frontend_qa',
    timestamp: new Date().toISOString(),
    status: 'running',
    checks: {},
    issues: [],
    ui_components: {}
};

// Check 1: File Structure
logCheck('file_structure');
const requiredFiles = [
    'index.html',
    'data/current/restaurant_database_v5_ui.json',
    'data/current/search_mapping.json'
];

const missingFiles = requiredFiles.filter(f => {
    try {
        fs.accessSync(`/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/${f}`);
        return false;
    } catch {
        return true;
    }
});

results.checks.file_structure = {
    status: missingFiles.length === 0 ? 'PASS' : 'FAIL',
    required_files: requiredFiles,
    missing: missingFiles
};

if (missingFiles.length > 0) {
    results.issues.push(`Missing required files: ${missingFiles.join(', ')}`);
}

// Check 2: Data Loading Test (via HTTP)
logCheck('data_loading');
const testDataLoading = () => new Promise((resolve) => {
    const req = http.get('http://localhost:8888/data/current/restaurant_database_v5_ui.json', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                resolve({
                    status: 'PASS',
                    http_status: res.statusCode,
                    content_type: res.headers['content-type'],
                    data_size: data.length,
                    restaurant_count: parsed.restaurants?.length || 0
                });
            } catch (e) {
                resolve({
                    status: 'FAIL',
                    http_status: res.statusCode,
                    error: 'Invalid JSON'
                });
            }
        });
    });
    req.on('error', (e) => {
        resolve({ status: 'FAIL', error: e.message });
    });
    req.setTimeout(5000, () => {
        req.destroy();
        resolve({ status: 'FAIL', error: 'Timeout' });
    });
});

testDataLoading().then(check => {
    results.checks.data_loading = check;
    if (check.status !== 'PASS') {
        results.issues.push(`Data loading failed: ${check.error || 'unknown'}`);
    }
    
    // Check 3: HTML Structure
    logCheck('html_structure');
    try {
        const html = fs.readFileSync('/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/index.html', 'utf8');
        
        const requiredElements = [
            { name: 'restaurant_grid', pattern: /id="restaurant-grid"/ },
            { name: 'search_input', pattern: /id=".*search.*"/i },
            { name: 'filter_cuisine', pattern: /cuisine|菜/ },
            { name: 'stats_display', pattern: /口碑|评分|餐厅/ }
        ];
        
        const foundElements = requiredElements.filter(e => e.pattern.test(html));
        
        results.checks.html_structure = {
            status: foundElements.length === requiredElements.length ? 'PASS' : 'WARNING',
            required_elements: requiredElements.map(e => e.name),
            found: foundElements.length,
            total: requiredElements.length
        };
        
        if (foundElements.length < requiredElements.length) {
            results.issues.push(`Missing UI elements: ${requiredElements.length - foundElements.length} not found`);
        }
        
        // Check 4: JavaScript Functions
        logCheck('javascript_functions');
        const requiredFunctions = [
            'loadData', 'renderRestaurants', 'applyFilters', 
            'getSentimentScore', 'updateStats', 'showDetail'
        ];
        
        const foundFunctions = requiredFunctions.filter(fn => 
            new RegExp(`function ${fn}|const ${fn} =|async function ${fn}`).test(html)
        );
        
        results.checks.javascript_functions = {
            status: foundFunctions.length === requiredFunctions.length ? 'PASS' : 'WARNING',
            required: requiredFunctions,
            found: foundFunctions,
            missing: requiredFunctions.filter(fn => !foundFunctions.includes(fn))
        };
        
        if (foundFunctions.length < requiredFunctions.length) {
            results.issues.push(`Missing JS functions: ${results.checks.javascript_functions.missing.join(', ')}`);
        }
        
    } catch (e) {
        results.checks.html_structure = { status: 'FAIL', error: e.message };
        results.checks.javascript_functions = { status: 'FAIL', error: e.message };
        results.issues.push(`HTML structure check failed: ${e.message}`);
    }
    
    // Final status
    const hasFailures = Object.values(results.checks).some(c => c.status === 'FAIL');
    const hasWarnings = Object.values(results.checks).some(c => c.status === 'WARNING');
    
    results.status = hasFailures ? 'FAILED' : (hasWarnings ? 'PASSED_WITH_WARNINGS' : 'PASSED');
    
    console.log(JSON.stringify(results, null, 2));
});

function logCheck(name) {
    console.error(`[Frontend QA] Running check: ${name}...`);
}
NODE_SCRIPT

    if [ $? -eq 0 ]; then
        success "Frontend QA completed"
        cat "${log_file}" | tail -1 > "${report_file}"
        return 0
    else
        error "Frontend QA failed"
        return 1
    fi
}

# ============================================
# Compare Reports
# ============================================
compare_reports() {
    log "Comparing Backend and Frontend QA reports..."
    
    local backend_report=$(ls -t "${REPORTS_DIR}"/backend_qa_*.json | head -1)
    local frontend_report=$(ls -t "${REPORTS_DIR}"/frontend_qa_*.json | head -1)
    
    if [ ! -f "$backend_report" ] || [ ! -f "$frontend_report" ]; then
        error "Missing reports for comparison"
        return 1
    fi
    
    node << NODE_SCRIPT
const fs = require('fs');

const backend = JSON.parse(fs.readFileSync('${backend_report}', 'utf8'));
const frontend = JSON.parse(fs.readFileSync('${frontend_report}', 'utf8'));

const comparison = {
    timestamp: new Date().toISOString(),
    overall_status: 'PENDING',
    backend: {
        agent: backend.agent,
        status: backend.status,
        issues: backend.issues?.length || 0,
        stats: backend.stats
    },
    frontend: {
        agent: frontend.agent,
        status: frontend.status,
        issues: frontend.issues?.length || 0,
        checks: Object.keys(frontend.checks)
    },
    data_consistency: {
        backend_restaurant_count: backend.stats?.total_restaurants || 0,
        frontend_data_loaded: frontend.checks?.data_loading?.restaurant_count || 0,
        match: backend.stats?.total_restaurants === frontend.checks?.data_loading?.restaurant_count
    },
    recommendations: []
};

// Generate recommendations
if (backend.status === 'FAILED' || frontend.status === 'FAILED') {
    comparison.overall_status = 'FAILED';
    comparison.recommendations.push('Fix critical failures before proceeding');
} else if (backend.status.includes('WARNING') || frontend.status.includes('WARNING')) {
    comparison.overall_status = 'PASSED_WITH_WARNINGS';
    comparison.recommendations.push('Review warnings but deployment should be safe');
} else {
    comparison.overall_status = 'PASSED';
    comparison.recommendations.push('All checks passed - ready for deployment');
}

if (!comparison.data_consistency.match) {
    comparison.recommendations.push('Data count mismatch: backend and frontend seeing different data');
}

if (backend.stats?.verified < backend.stats?.total_restaurants * 0.5) {
    comparison.recommendations.push('Low verification rate - consider running Google verification');
}

console.log(JSON.stringify(comparison, null, 2));
NODE_SCRIPT
}

# ============================================
# Generate Final Report
# ============================================
generate_report() {
    log "Generating final QA report..."
    
    local report_file="${REPORTS_DIR}/qa_summary_${TIMESTAMP}.md"
    
    cat > "$report_file" << EOF
# QA Workflow Report

**Timestamp:** ${TIMESTAMP}  
**Project:** Bay Area Food Map

## Summary

$(compare_reports)

## Reports Location

- Backend QA: \`$(ls -t ${REPORTS_DIR}/backend_qa_*.json 2>/dev/null | head -1)\`
- Frontend QA: \`$(ls -t ${REPORTS_DIR}/frontend_qa_*.json 2>/dev/null | head -1)\`

## Next Steps

1. Review any FAILED checks
2. Address WARNING items if applicable
3. Re-run QA after fixes: \`./qa-workflow.sh\`

---
*Generated by QA Workflow Orchestrator*
EOF

    success "Report generated: ${report_file}"
}

# ============================================
# Main
# ============================================
main() {
    local mode="${1:-full}"
    
    log "Starting QA Workflow (mode: ${mode})"
    log "Reports will be saved to: ${REPORTS_DIR}"
    
    case "$mode" in
        full)
            run_backend_qa
            run_frontend_qa
            generate_report
            ;;
        backend)
            run_backend_qa
            ;;
        frontend)
            run_frontend_qa
            ;;
        report)
            generate_report
            ;;
        *)
            echo "Usage: $0 [full|backend|frontend|report]"
            exit 1
            ;;
    esac
    
    success "QA Workflow completed!"
}

main "$@"
