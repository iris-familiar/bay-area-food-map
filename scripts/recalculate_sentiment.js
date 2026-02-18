#!/usr/bin/env node
/**
 * 重新计算口碑分数 - 使用考虑样本量的Wilson Score
 * 解决小样本餐厅虚高问题
 */

const fs = require('fs');

const DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';
const OUTPUT_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';

// 加载数据库
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🔄 重新计算口碑分数');
console.log('='.repeat(70));

// Wilson Score Interval下界 (95%置信度)
// 用于处理小样本的评分问题
function wilsonScore(positive, total) {
  if (total === 0) return 0.5;
  
  const z = 1.96; // 95%置信度
  const p = positive / total;
  const n = total;
  
  const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const denominator = 1 + (z * z) / n;
  
  return numerator / denominator;
}

// 基于样本量的置信度调整
function confidencePenalty(sampleSize) {
  // 样本量越小，惩罚越大
  // 10个样本以上无惩罚，1个样本最大惩罚
  if (sampleSize >= 10) return 1.0;
  if (sampleSize >= 5) return 0.9;
  if (sampleSize >= 3) return 0.8;
  return 0.5 + (sampleSize - 1) * 0.15; // 1样本=0.65, 2样本=0.8
}

let processed = 0;

// 收集统计数据
const stats = {
  highConfidence: 0, // 10+样本
  mediumConfidence: 0, // 5-9样本
  lowConfidence: 0, // 3-4样本
  veryLowConfidence: 0, // 1-2样本
  noData: 0
};

db.restaurants.forEach(r => {
  processed++;
  
  const details = r.sentiment_details;
  if (!details || !details.analyzed_contexts) {
    r.sentiment_score = null;
    stats.noData++;
    console.log(`${processed}. ${r.name}: 无数据`);
    return;
  }
  
  const positive = details.positive_mentions || 0;
  const negative = details.negative_mentions || 0;
  const total = details.analyzed_contexts || 0;
  
  // 分类统计
  if (total >= 10) stats.highConfidence++;
  else if (total >= 5) stats.mediumConfidence++;
  else if (total >= 3) stats.lowConfidence++;
  else stats.veryLowConfidence++;
  
  // 计算基础Wilson Score (0-1范围)
  const wilson = wilsonScore(positive, total);
  
  // 应用置信度惩罚
  const penalty = confidencePenalty(total);
  
  // 计算最终分数 (0.3-1.0范围映射)
  // 基础分0.3，Wilson得分*0.7，再乘以置信度惩罚
  let finalScore = 0.3 + (wilson * 0.7 * penalty);
  
  // 确保在合理范围内
  finalScore = Math.max(0.3, Math.min(0.95, finalScore));
  
  // 保留两位小数
  r.sentiment_score = parseFloat(finalScore.toFixed(2));
  
  console.log(`${processed}. ${r.name}: ${positive}正/${negative}负/${total}总 → ${r.sentiment_score} (Wilson:${wilson.toFixed(2)}, 惩罚:${penalty})`);
});

// 保存
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db, null, 2), 'utf8');

console.log('\n' + '='.repeat(70));
console.log('✅ 口碑分数重算完成！');
console.log('\n样本量分布:');
console.log(`  高置信度 (10+): ${stats.highConfidence} 家`);
console.log(`  中置信度 (5-9): ${stats.mediumConfidence} 家`);
console.log(`  低置信度 (3-4): ${stats.lowConfidence} 家`);
console.log(`  极低置信 (1-2): ${stats.veryLowConfidence} 家`);
console.log(`  无数据: ${stats.noData} 家`);

// 显示分数分布
const scores = db.restaurants
  .filter(r => r.sentiment_score)
  .map(r => r.sentiment_score)
  .sort((a, b) => a - b);

console.log(`\n分数范围: ${scores[0]} - ${scores[scores.length - 1]}`);
console.log(`中位数: ${scores[Math.floor(scores.length / 2)]}`);

// 显示极端例子
console.log('\n分数示例:');
const highScores = db.restaurants
  .filter(r => r.sentiment_score && r.sentiment_score >= 0.85)
  .slice(0, 5);
const lowScores = db.restaurants
  .filter(r => r.sentiment_score && r.sentiment_score <= 0.6)
  .slice(0, 5);

console.log('高分餐厅:');
highScores.forEach(r => {
  console.log(`  ${r.name}: ${r.sentiment_score} (样本:${r.sentiment_details?.analyzed_contexts || 0})`);
});

console.log('低分餐厅:');
lowScores.forEach(r => {
  console.log(`  ${r.name}: ${r.sentiment_score} (样本:${r.sentiment_details?.analyzed_contexts || 0})`);
});
