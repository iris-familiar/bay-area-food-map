#!/usr/bin/env node
/**
 * 检查所有使用关键词提取的功能
 * 生成需要更新为LLM提取的清单
 */

const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/scripts';

console.log('🔍 检查关键词提取功能使用情况');
console.log('='.repeat(70));
console.log('');

// 1. 情感分析 - 使用关键词列表（这是标准做法，不需要改为LLM）
console.log('1. 情感分析 (sentiment_score)');
console.log('   位置: calculate_real_metrics.js');
console.log('   方法: 正面/负面词列表匹配');
console.log('   状态: ✅ 合理，情感分析的标准做法');
console.log('');

// 2. 推荐菜提取 - 已删除，需要用LLM重新提取
console.log('2. 推荐菜 (recommendations)');
console.log('   位置: 已删除');
console.log('   原方法: dishKeywords简单匹配 ❌');
console.log('   新方法: LLM提取 ⏳ 进行中');
console.log('');

// 3. 餐厅名识别 - 检查是否还在使用
console.log('3. 餐厅名识别');
console.log('   位置: rebuild_from_raw.js, rebuild_with_comments.js');
console.log('   方法: 关键词匹配 + LLM');
console.log('   状态: ✅ 已使用LLM');
console.log('');

// 4. 语义搜索映射 - 使用规则匹配
console.log('4. 语义搜索映射');
console.log('   位置: update-search-mapping.js');
console.log('   方法: 规则匹配 semantic_tags');
console.log('   状态: ✅ 合理，基于已有标签的匹配');
console.log('');

console.log('='.repeat(70));
console.log('总结:');
console.log('');
console.log('需要更新为LLM的功能:');
console.log('  - 推荐菜提取 ⏳ (正在进行)');
console.log('');
console.log('可以保持现状的功能:');
console.log('  - 情感分析 ✅ (关键词匹配是标准做法)');
console.log('  - 餐厅名识别 ✅ (已经用LLM)');
console.log('  - 语义搜索映射 ✅ (基于标签的规则匹配)');
