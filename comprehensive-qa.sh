#!/bin/bash
# Comprehensive QA - The Right Way
# Run this before ANY deployment

echo "🔬 Comprehensive QA - Learning from Past Mistakes"
echo "=================================================="

FAILED=0

# 1. Original QA (baseline)
echo ""
echo "1️⃣  Running Original QA..."
node qa/qa-orchestrator.js
if [ $? -ne 0 ]; then
    echo "❌ Original QA failed"
    FAILED=1
fi

# 2. Enhanced Business Logic QA
echo ""
echo "2️⃣  Running Enhanced Business Logic QA..."
node qa/enhanced-qa.js
if [ $? -ne 0 ]; then
    echo "⚠️  Enhanced QA found issues - review required"
    FAILED=1
fi

# 3. Manual Checklist (Human verification required)
echo ""
echo "3️⃣  Manual Verification Checklist"
echo "   Please verify the following manually:"
echo ""
echo "   □ Filter state persistence:"
echo "      1. Select '讨论度优先' sort"
echo "      2. Select '火锅' cuisine filter"
echo "      3. Refresh page"
echo "      4. Verify selections are preserved"
echo ""
echo "   □ Data consistency:"
echo "      1. Note discussion count on homepage"
echo "      2. Click restaurant to open detail"
echo "      3. Verify same count shown in detail"
echo ""
echo "   □ Refresh frequency:"
echo "      1. Open browser dev tools"
echo "      2. Check Network tab"
echo "      3. Verify auto-refresh is ~5min, not 1min"
echo ""
echo "   □ Data sanity:"
echo "      1. Check if any restaurants have identical values"
echo "      2. Verify discussion counts seem realistic"
echo ""

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "✅ QA Passed - But manual verification still required!"
    exit 0
else
    echo ""
    echo "❌ QA Failed - Fix issues before deployment"
    exit 1
fi
