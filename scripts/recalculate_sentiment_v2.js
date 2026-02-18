#!/usr/bin/env node
/**
 * 重新计算口碑分数 - 正确反映评价质量
 * 口碑 = 正面评价比例（加平滑避免极端）
 * 样本量单独标注可信度，不惩罚口碑分数
 */

const fs = require('fs');

const DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';
const OUTPUT_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';

// 加载数据库
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🔄 重新计算口碑分数 - 正确逻辑');
console.log('='.repeat(70));
console.log('口碑 = 正面评价比例（加Laplace平滑）');
console.log('样本量 = 可信度标注（不影响口碑分数）');
console.log('='.repeat(70));

// Laplace平滑：给正面和负面各加1个伪计数
// 避免1个样本时极端值（0或100%）
function smoothedSentiment(positive, negative) {
  const smoothPos = positive + 1;  // 加1平滑
  const smoothNeg = negative + 1;  // 加1平滑
  const total = smoothPos + smoothNeg;
  
  // 基础分0.3， sentiment占0.7
  // 这样即使全负面也有0.3基础分，全正面有1.0分
  return 0.3 + (smoothPos / total) * 0.7;
}

// 可信度级别（仅用于标注，不影响分数）
function confidenceLevel(total) {
  if (total >= 10) return 'high';
  if (total >= 5) return 'medium';
  if (total >= 3) return 'low';
  return 'very-low';
}

let processed = 0;

// 收集统计数据
const stats = {
  byLevel: { high: 0, medium: 0, low: 0, 'very-low': 0 },
  noData: 0
};

db.restaurants.forEach(r => {
  processed++;
  
  const details = r.sentiment_details;
  if (!details || !details.analyzed_contexts) {
    r.sentiment_score = null;
    r.sentiment_confidence = null;
    stats.noData++;
    console.log(`${processed}. ${r.name}: 无数据`);
    return;
  }
  
  const positive = details.positive_mentions || 0;
  const negative = details.negative_mentions || 0;
  const neutral = (details.analyzed_contexts || 0) - positive - negative;
  const total = details.analyzed_contexts || 0;
  
  // 计算口碑分数（加平滑）
  const score = smoothedSentiment(positive, negative);
  
  // 记录可信度级别
  const confidence = confidenceLevel(total);
  stats.byLevel[confidence]++;
  
  // 保存分数和可信度
  r.sentiment_score = parseFloat(score.toFixed(2));
  r.sentiment_confidence = confidence;
  
  const rawRatio = total > 0 ? Math.round((positive / total) * 100) : 0;
  console.log(`${processed}. ${r.name}: ${positive}正/${negative}负/${neutral}中/${total}总 → 口碑${r.sentiment_score} (原始好评率${rawRatio}%, 可信度:${confidence})`);
});

// 保存
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db, null, 2), 'utf8');

console.log('\n' + '='.repeat(70));
console.log('✅ 口碑分数重算完成！');
console.log('\n可信度分布:');
console.log(`  高置信度 (10+样本): ${stats.byLevel.high} 家`);
console.log(`  中置信度 (5-9样本): ${stats.byLevel.medium} 家`);
console.log(`  低置信度 (3-4样本): ${stats.byLevel.low} 家`);
console.log(`  极低置信 (1-2样本): ${stats.byLevel['very-low']} 家`);
console.log(`  无数据: ${stats.noData} 家`);

// 显示分数分布
const scores = db.restaurants
  .filter(r => r.sentiment_score)
  .map(r => r.sentiment_score)
  .sort((a, b) => a - b);

console.log(`\n口碑分数范围: ${scores[0]} - ${scores[scores.length - 1]}`);
console.log(`中位数: ${scores[Math.floor(scores.length / 2)]}`);

// 显示高低分例子
console.log('\n高分餐厅（好评率高）:');
db.restaurants
  .filter(r => r.sentiment_score && r.sentiment_score >= 0.9)
  .slice(0, 5)
  .forEach(r => {
    console.log(`  ${r.name}: ${r.sentiment_score} (${r.sentiment_details?.positive_mentions}正/${r.sentiment_details?.analyzed_contexts}总)`);
  });

console.log('\n低分餐厅（有负面评价）:');
db.restaurants
  .filter(r => r.sentiment_score && r.sentiment_score <= 0.5)
  .slice(0, 5)
  .forEach(r => {
    console.log(`  ${r.name}: ${r.sentiment_score} (${r.sentiment_details?.positive_mentions}正/${r.sentiment_details?.negative_mentions}负/${r.sentiment_details?.analyzed_contexts}总)`);
  });

console.log('\n小样本但全好评的例子:');
db.restaurants
  .filter(r => r.sentiment_details?.analyzed_contexts === 1 && r.sentiment_details?.positive_mentions === 1)
  .slice(0, 5)
  .forEach(r => {
    console.log(`  ${r.name}: ${r.sentiment_score} (1个样本，100%好评)`);
  });
