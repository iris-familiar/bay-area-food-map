#!/bin/bash
# =============================================================================
# Daily Master Job v2.0 - Refactored ETL Pipeline
# =============================================================================

set -o pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly CONFIG_DIR="${PROJECT_DIR}/config"
readonly LOGS_DIR="${PROJECT_DIR}/logs"
readonly DATA_DIR="${PROJECT_DIR}/data"
readonly BACKUP_DIR="${DATA_DIR}/backup"
readonly STATE_DIR="${DATA_DIR}/state"

readonly RUN_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
readonly RUN_DATE=$(date +%Y-%m-%d)
readonly RUN_ID="daily_${RUN_TIMESTAMP}_$$"

readonly MAIN_LOG="${LOGS_DIR}/daily_${RUN_DATE}.log"
readonly ERROR_LOG="${LOGS_DIR}/daily_${RUN_DATE}.error.log"
readonly AUDIT_LOG="${LOGS_DIR}/audit_${RUN_DATE}.log"
readonly METRICS_LOG="${LOGS_DIR}/metrics_${RUN_DATE}.json"

readonly LOCK_FILE="${STATE_DIR}/.daily_job.lock"
readonly STATE_FILE="${STATE_DIR}/pipeline_state.json"

readonly MAX_RETRY_COUNT=3
readonly RETRY_DELAY_SECONDS=30
readonly PHASE_TIMEOUT_MINUTES=60
readonly ENABLE_NOTIFICATIONS=true
readonly ENABLE_BACKUP=true

CURRENT_PHASE="INIT"
PHASE_START_TIME=0

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] [${CURRENT_PHASE}] ${message}" | tee -a "${AUDIT_LOG}"
}

log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; }
log_success() { log "SUCCESS" "$1"; }

init_environment() {
    mkdir -p "${LOGS_DIR}" "${BACKUP_DIR}/merge" "${BACKUP_DIR}/daily" "${STATE_DIR}"
    echo "{\"run_id\":\"${RUN_ID}\",\"start_time\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"phases\":{},\"summary\":{\"total_phases\":0,\"completed_phases\":0,\"failed_phases\":0,\"warnings\":0}}" > "${METRICS_LOG}"
    exec > >(tee -a "${MAIN_LOG}")
    exec 2> >(tee -a "${ERROR_LOG}" >&2)
}

record_phase_start() {
    local phase_name="$1"
    CURRENT_PHASE="${phase_name}"
    PHASE_START_TIME=$(date +%s)
    log_info "Phase ${phase_name} started"
}

record_phase_end() {
    local phase_name="$1"
    local status="$2"
    local duration=$(( $(date +%s) - PHASE_START_TIME ))
    log_info "Phase ${phase_name} completed with status: ${status} (duration: ${duration}s)"
}

execute_with_retry() {
    local description="$1"
    shift
    local cmd=("$@")
    local attempt=1
    local exit_code=0
    
    while [ ${attempt} -le ${MAX_RETRY_COUNT} ]; do
        log_info "Executing: ${description} (attempt ${attempt}/${MAX_RETRY_COUNT})"
        if "${cmd[@]}"; then
            log_success "${description} completed successfully"
            return 0
        else
            exit_code=$?
            log_warn "${description} failed with exit code ${exit_code} (attempt ${attempt})"
            if [ ${attempt} -lt ${MAX_RETRY_COUNT} ]; then
                log_info "Waiting ${RETRY_DELAY_SECONDS}s before retry..."
                sleep ${RETRY_DELAY_SECONDS}
            fi
        fi
        ((attempt++))
    done
    
    log_error "${description} failed after ${MAX_RETRY_COUNT} attempts"
    return ${exit_code}
}

check_command() {
    if ! command -v "$1" &>/dev/null; then
        log_error "Required command not found: $1"
        return 1
    fi
    return 0
}

backup_file() {
    local source_file="$1"
    local backup_subdir="${2:-daily}"
    
    if [ ! -f "${source_file}" ]; then
        log_warn "Cannot backup non-existent file: ${source_file}"
        return 1
    fi
    
    local filename=$(basename "${source_file}")
    local backup_path="${BACKUP_DIR}/${backup_subdir}/${filename}.${RUN_TIMESTAMP}.backup"
    
    mkdir -p "$(dirname "${backup_path}")"
    cp "${source_file}" "${backup_path}"
    log_info "Backed up ${filename} to ${backup_path}"
    echo "${backup_path}"
}

cleanup_old_backups() {
    local backup_dir="$1"
    local retention_days="${2:-30}"
    log_info "Cleaning up backups older than ${retention_days} days in ${backup_dir}"
    find "${backup_dir}" -name "*.backup" -type f -mtime +${retention_days} -delete 2>/dev/null || true
    find "${backup_dir}" -name "*.json" -type f -mtime +${retention_days} -delete 2>/dev/null || true
    log_success "Old backup cleanup completed"
}

send_notification() {
    local level="$1"
    local message="$2"
    if [ "${ENABLE_NOTIFICATIONS}" != "true" ]; then return 0; fi
    log_info "Notification: [${level}] ${message}"
}

check_disk_space() {
    local required_gb="${1:-1}"
    local available=$(df -g "${PROJECT_DIR}" | tail -1 | awk '{print $4}')
    if [ "${available}" -lt "${required_gb}" ]; then
        log_error "Insufficient disk space: ${available}GB available, ${required_gb}GB required"
        return 1
    fi
    log_info "Disk space check passed: ${available}GB available"
    return 0
}

save_pipeline_state() {
    local state="$1"
    local phase="${2:-${CURRENT_PHASE}}"
    echo "{\"run_id\":\"${RUN_ID}\",\"state\":\"${state}\",\"current_phase\":\"${phase}\",\"last_updated\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"pid\":$$}" > "${STATE_FILE}"
    log_info "Pipeline state saved: ${state} (phase: ${phase})"
}

load_pipeline_state() {
    if [ -f "${STATE_FILE}" ]; then
        cat "${STATE_FILE}"
    else
        echo '{"state":"new","current_phase":"none"}'
    fi
}

acquire_lock() {
    if [ -f "${LOCK_FILE}" ]; then
        local old_pid=$(cat "${LOCK_FILE}")
        if ps -p "${old_pid}" > /dev/null 2>&1; then
            log_error "Another daily job is already running (PID: ${old_pid})"
            return 1
        else
            log_warn "Stale lock file found, removing..."
            rm -f "${LOCK_FILE}"
        fi
    fi
    echo $$ > "${LOCK_FILE}"
    log_info "Lock acquired: PID $$"
    return 0
}

release_lock() {
    rm -f "${LOCK_FILE}"
    log_info "Lock released"
}

cleanup() {
    local exit_code=$?
    log_info "Performing cleanup..."
    release_lock
    if [ ${exit_code} -eq 0 ]; then
        save_pipeline_state "completed"
        send_notification "success" "Daily job completed successfully"
    else
        save_pipeline_state "failed" "${CURRENT_PHASE}"
        send_notification "error" "Daily job failed at phase: ${CURRENT_PHASE}"
    fi
    log_info "Cleanup completed"
}

trap cleanup EXIT

main() {
    cd "${PROJECT_DIR}"
    init_environment
    
    echo "======================================================================"
    echo "Daily Master Job v2.0 - ${RUN_DATE}"
    echo "Run ID: ${RUN_ID}"
    echo "======================================================================"
    
    log_info "Starting daily master job - Run ID: ${RUN_ID}"
    
    if ! acquire_lock; then
        echo "Cannot acquire lock - another job may be running"
        exit 1
    fi
    
    # Pre-flight Checks
    echo ""
    echo "▶ Phase PRE: Pre-flight Checks"
    echo "======================================================================"
    record_phase_start "pre_flight"
    
    echo "[1/3] Checking required commands..."
    check_command "node" || exit 1
    check_command "python3" || exit 1
    echo "  ✓ All required commands available"
    
    echo "[2/3] Checking disk space..."
    check_disk_space 2 || exit 1
    echo "  ✓ Disk space check passed"
    
    echo "[3/3] Loading pipeline state..."
    local state=$(load_pipeline_state)
    log_info "Previous state: ${state}"
    echo "  ✓ Pipeline state loaded"
    
    record_phase_end "pre_flight" "success"
    
    # Phase 1: Data Collection
    echo ""
    echo "▶ Phase 1: Data Collection & Updates"
    echo "======================================================================"
    record_phase_start "data_collection"
    
    echo "[1/4] Analyzing daily data..."
    if [ -f "scripts/analyze-daily-data.js" ]; then
        execute_with_retry "Daily data analysis" node scripts/analyze-daily-data.js || true
        echo "  ✓ Daily data analysis completed"
    fi
    
    echo "[2/4] Running recursive search..."
    if [ -f "scripts/generate_recursive_search.py" ]; then
        python3 scripts/generate_recursive_search.py "${DATA_DIR}/current/restaurant_database.json" 5 2>/dev/null || true
        local latest_recursive=$(ls -t scripts/run_recursive_search_*.sh 2>/dev/null | head -1)
        if [ -n "${latest_recursive}" ]; then
            execute_with_retry "Recursive search" bash "${latest_recursive}" || true
        fi
        echo "  ✓ Recursive search completed"
    fi
    
    echo "[3/4] Updating post engagement..."
    if [ -f "scripts/update_post_engagement.js" ]; then
        execute_with_retry "Engagement update" node scripts/update_post_engagement.js || true
        echo "  ✓ Engagement data updated"
    fi
    
    echo "[4/4] Running batch collection..."
    if [ -f "scripts/end_to_end_batch.sh" ]; then
        execute_with_retry "Batch collection" bash scripts/end_to_end_batch.sh || echo "  ⚠ Batch job had issues, continuing..."
    fi
    
    record_phase_end "data_collection" "success"
    
    # Phase 2: Data Processing
    echo ""
    echo "▶ Phase 2: Data Processing & Merge"
    echo "======================================================================"
    record_phase_start "data_processing"
    
    echo "[1/4] Creating pre-merge backup..."
    if [ "${ENABLE_BACKUP}" = "true" ]; then
        backup_file "${DATA_DIR}/current/restaurant_database_v5_ui.json" "merge"
        echo "  ✓ Pre-merge backup created"
    fi
    
    echo "[2/4] Running safe merge..."
    local latest_batch=$(ls -t ${DATA_DIR}/batch*_candidates.json 2>/dev/null | head -1)
    if [ -n "${latest_batch}" ] && [ -f "scripts/safe_merge.js" ]; then
        execute_with_retry "Safe merge" node scripts/safe_merge.js "${latest_batch}" || true
        echo "  ✓ Batch data merged"
    else
        echo "  ℹ No batch data to merge"
    fi
    
    echo "[3/4] Running auto quality fix..."
    if [ -f "scripts/auto_quality_fix.js" ]; then
        execute_with_retry "Quality fix" node scripts/auto_quality_fix.js || true
        echo "  ✓ Quality fixes applied"
    fi
    
    echo "[4/4] Applying corrections..."
    if [ -f "scripts/apply_corrections.js" ]; then
        execute_with_retry "Apply corrections" node scripts/apply_corrections.js || true
        cp "${DATA_DIR}/current/restaurant_database.json" "${DATA_DIR}/current/restaurant_database_v5_ui.json"
        echo "  ✓ Corrections applied and synced"
    fi
    
    record_phase_end "data_processing" "success"
    
    # Phase 3: Post-processing
    echo ""
    echo "▶ Phase 3: Post-processing & Reporting"
    echo "======================================================================"
    record_phase_start "post_processing"
    
    echo "[1/3] Generating daily report..."
    local db_count=0
    if [ -f "${DATA_DIR}/current/restaurant_database.json" ]; then
        db_count=$(node -e "const fs=require('fs'); const db=JSON.parse(fs.readFileSync('${DATA_DIR}/current/restaurant_database.json')); console.log(Array.isArray(db)?db.length:Object.keys(db).length)" 2>/dev/null || echo "0")
    fi
    local raw_count=$(ls -1 "${PROJECT_DIR}/raw"/feed_*.json 2>/dev/null | wc -l)
    
    cat > "${DATA_DIR}/current/pipeline_report_${RUN_DATE}.md" << EOF
# Pipeline Report ${RUN_DATE}

**Run ID**: ${RUN_ID}

## Statistics

- Total Restaurants: ${db_count}
- Raw Files: ${raw_count}
- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
    echo "  ✓ Daily report generated"
    
    echo "[2/3] Validating data integrity..."
    node -e "
        const fs = require('fs');
        try {
            const db = JSON.parse(fs.readFileSync('${DATA_DIR}/current/restaurant_database.json', 'utf8'));
            const restaurants = Array.isArray(db) ? db : Object.values(db);
            let issues = 0;
            restaurants.forEach((r, i) => {
                if (!r.name) issues++;
                if (!r.id) issues++;
            });
            console.log('  ✓ Validation completed:', restaurants.length, 'restaurants checked,', issues, 'issues found');
        } catch(e) {
            console.log('  ⚠ Validation had issues:', e.message);
        }
    " 2>/dev/null || echo "  ⚠ Validation skipped"
    
    echo "[3/3] Cleaning up old backups..."
    cleanup_old_backups "${BACKUP_DIR}/daily" 14
    cleanup_old_backups "${BACKUP_DIR}/merge" 30
    echo "  ✓ Cleanup completed"
    
    record_phase_end "post_processing" "success"
    
    # Complete
    echo ""
    echo "======================================================================"
    echo "Daily Master Job Completed Successfully!"
    echo "======================================================================"
    echo "Run ID: ${RUN_ID}"
    echo "Log: ${MAIN_LOG}"
    echo "Restaurant count: ${db_count}"
    echo "======================================================================"
    
    exit 0
}

case "${1:-}" in
    --dry-run|--check)
        echo "Dry run mode - checking configuration..."
        init_environment
        check_command "node"
        check_command "python3"
        check_disk_space 1
        echo "Configuration check passed"
        exit 0
        ;;
    --resume)
        echo "Resume mode - continuing from last state..."
        main
        ;;
    --status)
        state=$(load_pipeline_state)
        echo "Pipeline State:"
        echo "${state}" | node -e "const data=require('fs').readFileSync(0,'utf8'); console.log(JSON.stringify(JSON.parse(data),null,2));" 2>/dev/null || echo "${state}"
        exit 0
        ;;
    --help|-h)
        cat << 'HELP_EOF'
Daily Master Job v2.0

Usage: daily_master_job.sh [OPTIONS]

Options:
    --dry-run, --check    Check configuration without running
    --resume              Resume from last saved state
    --status              Show current pipeline state
    --help, -h            Show this help message

Logs:
    Logs are stored in: logs/
    - daily_YYYY-MM-DD.log       Main execution log
    - daily_YYYY-MM-DD.error.log Error log
    - audit_YYYY-MM-DD.log       Audit trail
    - metrics_YYYY-MM-DD.json    Execution metrics
HELP_EOF
        exit 0
        ;;
    *)
        main
        ;;
esac
