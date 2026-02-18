#!/bin/bash
# Backup Manager v2.0 - Three-tier backup strategy

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_BASE="${PROJECT_DIR}/data/backup"
BACKUP_L1="${BACKUP_BASE}/level1_realtime"
BACKUP_L2="${BACKUP_BASE}/level2_daily"
BACKUP_L3="${BACKUP_BASE}/level3_archive"
LOG_FILE="${PROJECT_DIR}/logs/backup_manager.log"

L1_RETENTION_HOURS=48
L2_RETENTION_DAYS=14
L3_RETENTION_MONTHS=6

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$1] $2" | tee -a "${LOG_FILE}"; }
log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; }
log_success() { log "SUCCESS" "$1"; }

ensure_dirs() { mkdir -p "${BACKUP_L1}" "${BACKUP_L2}" "${BACKUP_L3}" "${PROJECT_DIR}/logs"; }
checksum() { shasum -a 256 "$1" | awk '{print $1}'; }

create_level1() {
    local src="$1"
    local name="${2:-snapshot}"
    local ts=$(date +%Y%m%d_%H%M%S)
    local dst="${BACKUP_L1}/${name}_${ts}.json.gz"
    
    if [ ! -f "${src}" ]; then log_error "Source not found: ${src}"; return 1; fi
    
    gzip -c "${src}" > "${dst}"
    echo "{\"type\":\"level1\",\"src\":\"${src}\",\"dst\":\"${dst}\",\"checksum\":\"$(checksum "${src}")\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "${dst}.meta"
    log_success "Level 1 backup: ${dst}"
    echo "${dst}"
}

create_pre_merge() {
    local src="${PROJECT_DIR}/data/current/restaurant_database.json"
    create_level1 "${src}" "pre_merge"
    cp "${src}" "${BACKUP_L1}/pre_merge_latest.json"
}

create_level2() {
    local date_str=$(date +%Y%m%d)
    local ts=$(date +%Y%m%d_%H%M%S)
    local backup_dir="${BACKUP_L2}/${date_str}"
    
    mkdir -p "${backup_dir}"
    
    [ -f "${PROJECT_DIR}/data/current/restaurant_database.json" ] && cp "${PROJECT_DIR}/data/current/restaurant_database.json" "${backup_dir}/db_${ts}.json"
    [ -f "${PROJECT_DIR}/data/current/restaurant_database_v5_ui.json" ] && cp "${PROJECT_DIR}/data/current/restaurant_database_v5_ui.json" "${backup_dir}/ui_${ts}.json"
    [ -d "${PROJECT_DIR}/config" ] && cp -r "${PROJECT_DIR}/config" "${backup_dir}/config_${ts}"
    
    local raw_count=$(ls -1 "${PROJECT_DIR}/raw"/feed_*.json 2>/dev/null | wc -l)
    echo "{\"raw_count\":${raw_count},\"date\":\"${date_str}\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "${backup_dir}/summary.json"
    
    local archive="${BACKUP_L2}/daily_${date_str}.tar.gz"
    tar -czf "${archive}" -C "${BACKUP_L2}" "${date_str}"
    rm -rf "${backup_dir}"
    
    log_success "Level 2 backup: ${archive}"
    echo "${archive}"
}

create_level3() {
    local type="$1"
    local name
    if [ "${type}" = "monthly" ]; then name="monthly_$(date +%Y%m)"; else name="weekly_$(date +%Y%W)"; fi
    
    local dir="${BACKUP_L3}/${name}"
    mkdir -p "${dir}"
    
    cp "${BACKUP_L2}"/*.tar.gz "${dir}/" 2>/dev/null || true
    [ -f "${PROJECT_DIR}/data/current/restaurant_database.json" ] && cp "${PROJECT_DIR}/data/current/restaurant_database.json" "${dir}/full_snapshot.json"
    
    local archive="${BACKUP_L3}/${name}.tar.gz"
    tar -czf "${archive}" -C "${BACKUP_L3}" "${name}"
    rm -rf "${dir}"
    
    log_success "Level 3 backup: ${archive}"
    echo "${archive}"
}

cleanup_level1() {
    find "${BACKUP_L1}" -name "*.gz" -type f -mmin +$((L1_RETENTION_HOURS * 60)) -delete
    log_success "Level 1 cleanup done"
}

cleanup_level2() {
    find "${BACKUP_L2}" -name "*.tar.gz" -type f -mtime +${L2_RETENTION_DAYS} -delete
    log_success "Level 2 cleanup done"
}

cleanup_level3() {
    find "${BACKUP_L3}" -name "*.tar.gz" -type f -mtime +$((L3_RETENTION_MONTHS * 30)) -delete
    log_success "Level 3 cleanup done"
}

verify_backup() {
    local f="$1"
    if [ ! -f "${f}" ]; then log_error "Not found: ${f}"; return 1; fi
    if [[ "${f}" == *.gz ]] && ! gzip -t "${f}" 2>/dev/null; then log_error "Corrupted: ${f}"; return 1; fi
    if [[ "${f}" == *.tar.gz ]] && ! tar -tzf "${f}" >/dev/null 2>&1; then log_error "Corrupted: ${f}"; return 1; fi
    log_success "Verified: ${f}"
    return 0
}

list_backups() {
    echo ""
    echo "=== Available Backups ==="
    echo "Level 1:"
    ls -lh "${BACKUP_L1}"/*.gz 2>/dev/null | awk '{print "  " $9, $5}' | tail -5 || echo "  None"
    echo "Level 2:"
    ls -lh "${BACKUP_L2}"/*.tar.gz 2>/dev/null | awk '{print "  " $9, $5}' | tail -5 || echo "  None"
    echo "Level 3:"
    ls -lh "${BACKUP_L3}"/*.tar.gz 2>/dev/null | awk '{print "  " $9, $5}' | tail -5 || echo "  None"
    echo ""
}

restore_latest() {
    local latest=$(ls -t "${BACKUP_L2}"/*.tar.gz 2>/dev/null | head -1)
    if [ -z "${latest}" ]; then log_error "No Level 2 backup found"; return 1; fi
    
    log_info "Restoring from: ${latest}"
    local temp=$(mktemp -d)
    tar -xzf "${latest}" -C "${temp}"
    
    local extracted=$(find "${temp}" -type d -name "20*" | head -1)
    local db=$(find "${extracted}" -name "restaurant_database*.json" | head -1)
    
    if [ -n "${db}" ]; then
        cp "${PROJECT_DIR}/data/current/restaurant_database.json" "${PROJECT_DIR}/data/current/pre_restore_$(date +%Y%m%d_%H%M%S).json"
        cp "${db}" "${PROJECT_DIR}/data/current/restaurant_database.json"
        cp "${db}" "${PROJECT_DIR}/data/current/restaurant_database_v5_ui.json"
        log_success "Restored from ${latest}"
    fi
    rm -rf "${temp}"
}

show_status() {
    echo ""
    echo "=== Backup Status ==="
    echo "Level 1: $(find "${BACKUP_L1}" -name '*.gz' 2>/dev/null | wc -l) backups ($(du -sh "${BACKUP_L1}" 2>/dev/null | awk '{print $1}'))"
    echo "Level 2: $(find "${BACKUP_L2}" -name '*.tar.gz' 2>/dev/null | wc -l) backups ($(du -sh "${BACKUP_L2}" 2>/dev/null | awk '{print $1}'))"
    echo "Level 3: $(find "${BACKUP_L3}" -name '*.tar.gz' 2>/dev/null | wc -l) archives ($(du -sh "${BACKUP_L3}" 2>/dev/null | awk '{print $1}'))"
    echo ""
}

show_help() {
    cat <> 'HELP'
Backup Manager v2.0

Usage: backup_manager.sh <cmd> [options]

Commands:
  level1 <file> [name]   Create L1 backup
  pre-merge               Create pre-merge backup
  level2                  Create L2 daily backup
  level3 weekly|monthly   Create L3 archive
  list                    List backups
  restore latest          Restore from latest
  verify                  Verify backups
  cleanup                 Clean old backups
  status                  Show status
  help                    Show help

Retention: L1=48h, L2=14d, L3=6m
HELP
}

ensure_dirs

case "${1:-}" in
    level1) shift; create_level1 "$@" ;;
    pre-merge) create_pre_merge ;;
    level2) create_level2 ;;
    level3) shift; create_level3 "$1" ;;
    list) list_backups ;;
    restore) [ "${2:-}" = "latest" ] && restore_latest || echo "Usage: restore latest" ;;
    verify)
        find "${BACKUP_L1}" -name "*.gz" -type f -mtime -1 | while read f; do verify_backup "$f"; done
        find "${BACKUP_L2}" -name "*.tar.gz" -type f -mtime -1 | while read f; do verify_backup "$f"; done
        ;;
    cleanup) cleanup_level1; cleanup_level2; cleanup_level3 ;;
    status) show_status ;;
    help|--help|-h) show_help ;;
    *) echo "Unknown: $1"; show_help; exit 1 ;;
esac
