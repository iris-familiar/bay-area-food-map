#!/bin/bash
# Auto-generated restore script
set -e
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$PROJECT_DIR"
cp -r "$0/../current"/* "data/current/" 2>/dev/null || true
cp -r "$0/../serving"/* "data/serving/" 2>/dev/null || true
echo "✅ Data restored from backup"
