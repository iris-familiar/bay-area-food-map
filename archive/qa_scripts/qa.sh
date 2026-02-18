#!/bin/bash
# QA Workflow - Quick Entry Point
# 
# Usage:
#   ./qa.sh              # Run full QA workflow
#   ./qa.sh backend      # Run backend QA only
#   ./qa.sh frontend     # Run frontend QA only  
#   ./qa.sh report       # Show latest report

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QA_DIR="${SCRIPT_DIR}/qa"
REPORTS_DIR="${QA_DIR}/reports"

cd "$SCRIPT_DIR"

show_help() {
    cat << 'EOF'
Bay Area Food Map - QA Workflow

Commands:
  ./qa.sh              Run full QA workflow (backend + frontend + compare)
  ./qa.sh backend      Run backend QA only
  ./qa.sh frontend     Run frontend QA only
  ./qa.sh report       Show latest QA summary report
  ./qa.sh list         List all previous reports
  ./qa.sh help         Show this help

Examples:
  # Quick validation after data update
  ./qa.sh

  # Check only data integrity
  ./qa.sh backend

  # Verify UI is working
  ./qa.sh frontend

  # Review last report
  ./qa.sh report

Reports are saved to: qa/reports/
EOF
}

show_report() {
    local latest=$(ls -t "${REPORTS_DIR}"/qa_summary_*.md 2>/dev/null | head -1)
    if [ -n "$latest" ]; then
        echo "📋 Latest QA Report:"
        echo "===================="
        cat "$latest"
    else
        echo "No reports found. Run './qa.sh' first."
    fi
}

list_reports() {
    echo "📁 Available QA Reports:"
    echo "========================"
    ls -lt "${REPORTS_DIR}"/*.json "${REPORTS_DIR}"/*.md 2>/dev/null | head -20 || echo "No reports found"
}

case "${1:-full}" in
    full|"")
        echo "🔍 Running QA Workflow..."
        node "${QA_DIR}/qa-orchestrator.js"
        ;;
    backend)
        echo "🔍 Running Backend QA only..."
        node "${QA_DIR}/qa-orchestrator.js" --mode=backend
        ;;
    frontend)
        echo "🔍 Running Frontend QA only..."
        node "${QA_DIR}/qa-orchestrator.js" --mode=frontend
        ;;
    report)
        show_report
        ;;
    list)
        list_reports
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
