#!/bin/bash
# 文件清理脚本 - 清理多余文件

cd /Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map

echo "═══════════════════════════════════════════════════════════════"
echo "     🧹 清理多余文件"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# 创建归档目录
mkdir -p archive/root_md_files
mkdir -p archive/test_files
mkdir -p archive/qa_scripts
mkdir -p archive/data_scripts

echo "【1】归档根目录多余的 .md 文件到 docs/..."
# 保留核心文件,移动已归档的文档
for file in BACKEND_AUDIT_REPORT_20260218.md \
            CLEANUP_COMPLETE.md \
            CLEANUP_REPORT.md \
            CURRENT_PIPELINE.md \
            FINAL_CLOSURE_REPORT.md \
            FINAL_COMPLETION_REPORT.md \
            FIX_COMPLETE_REPORT.md \
            FIX_COMPLETION_REPORT_20260218.md \
            PIPELINE.md \
            QA_QUICKREF.md \
            SECOND_ROUND_VERIFICATION_REPORT.md \
            SUBAGENT_AUDIT_ARCHIVE_20260218.md \
            SUBAGENT_AUDIT_REPORT_20260218.md \
            TIMESERIES_SUMMARY.md; do
    if [ -f "$file" ]; then
        mv "$file" docs/ 2>/dev/null && echo "  ✓ $file → docs/"
    fi
done
echo ""

echo "【2】归档测试文件..."
for file in test-js.html \
            test-website.sh \
            test.html \
            test_ios_final.html \
            test_ios_maps.html \
            test_maps.html \
            test_search.html \
            test_simple.html \
            verify_batch.sh \
            verify_python.py; do
    if [ -f "$file" ]; then
        mv "$file" archive/test_files/ 2>/dev/null && echo "  ✓ $file → archive/test_files/"
    fi
done
echo ""

echo "【3】归档QA脚本..."
for file in qa.sh comprehensive-qa.sh; do
    if [ -f "$file" ]; then
        mv "$file" archive/qa_scripts/ 2>/dev/null && echo "  ✓ $file → archive/qa_scripts/"
    fi
done

# 移动qa目录到archive
if [ -d "qa" ]; then
    mv qa archive/ && echo "  ✓ qa/ → archive/qa/"
fi
echo ""

echo "【4】删除空文件..."
if [ -f "EOF" ] && [ ! -s "EOF" ]; then
    rm "EOF" && echo "  ✓ 删除空文件 EOF"
fi
echo ""

echo "【5】清理数据目录中的临时文件..."
find data -name "*.tmp" -delete 2>/dev/null && echo "  ✓ 清理 *.tmp 文件"
find data -name "*.temp" -delete 2>/dev/null && echo "  ✓ 清理 *.temp 文件"
find data -name ".DS_Store" -delete 2>/dev/null && echo "  ✓ 清理 .DS_Store 文件"
echo ""

echo "【6】归档多余的HTML文件..."
for file in diagnose.html \
            diagnose.js \
            admin.html \
            simple.html \
            bay_area_chinese_food_v2.html \
            index_serving.html \
            index_v3_backup.html; do
    if [ -f "$file" ]; then
        mv "$file" archive/ 2>/dev/null && echo "  ✓ $file → archive/"
    fi
done
echo ""

echo "【7】归档脚本..."
for file in run-pipeline.sh \
            maintain.sh \
            etl \
            scripts/cleanup_and_organize.sh; do
    if [ -f "$file" ]; then
        mv "$file" archive/data_scripts/ 2>/dev/null && echo "  ✓ $file → archive/data_scripts/"
    fi
done
echo ""

echo "【8】清理test-results目录..."
if [ -d "test-results" ]; then
    mv test-results archive/ && echo "  ✓ test-results/ → archive/"
fi
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "     ✅ 文件清理完成"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "【清理统计】"
echo "  归档目录: archive/"
echo "    - root_md_files/ (根目录markdown)"
echo "    - test_files/ (测试文件)"
echo "    - qa_scripts/ (QA脚本)"
echo "    - data_scripts/ (数据处理脚本)"
echo ""
echo "【当前项目大小】"
du -sh .
echo ""
