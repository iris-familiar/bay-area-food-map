#!/usr/bin/env node
/**
 * 应用数据修正 - 由pipeline在最后一步调用
 * 确保人工修复的数据不会被覆盖
 * 【事务性操作】支持自动备份和回滚
 */

const fs = require('fs');
const path = require('path');
const { beginTransaction, commitTransaction } = require('./transaction');

const PROJECT_ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(PROJECT_ROOT, 'site', 'data', 'restaurant_database.json');
const CORRECTIONS_FILE = path.join(PROJECT_ROOT, 'data', 'corrections.json');

console.log('🔧 应用数据修正...');
console.log('='.repeat(70));

// 开始事务
const txId = beginTransaction('apply_corrections');

try {
  // 加载数据库
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  // 加载修正记录
  if (!fs.existsSync(CORRECTIONS_FILE)) {
    console.log('⚠️  未找到corrections.json，跳过修正');
    commitTransaction(txId);
    process.exit(0);
  }

  const raw = JSON.parse(fs.readFileSync(CORRECTIONS_FILE, 'utf8'));
  // Support both flat array format (current) and legacy {restaurant_corrections:[]} format
  const corrections = Array.isArray(raw) ? { restaurant_corrections: raw } : raw;

  let applied = 0;
  let skipped = 0;

  // 应用餐厅修正
  if (corrections.restaurant_corrections) {
    corrections.restaurant_corrections.forEach(correction => {
      const r = db.restaurants.find(x => x.id === correction.id);
      
      if (r) {
        // 检查是否是重复标记修正
        if (correction.corrections._status === 'duplicate_merged') {
          console.log(`\n🔄 ${correction.name} (${correction.id}):`);
          console.log(`   标记为重复，已合并到 ${correction.corrections._merged_into}`);

          // 应用所有标记字段
          Object.entries(correction.corrections).forEach(([key, value]) => {
            r[key] = value;
          });

          // Recalculate metrics for duplicate_merged (should be 0)
          if ('post_details' in correction.corrections) {
            const posts = r.post_details || [];
            r.total_engagement = posts.reduce((sum, p) => sum + (p.adjusted_engagement || 0), 0);
            r.mention_count = posts.length;
            r.sources = [...new Set(posts.map(p => p.post_id).filter(Boolean))];
          }

          applied++;
          return;
        }
        
        console.log(`\n✅ ${correction.name} (${correction.id}):`);

        // 应用修正字段 (post_details handled separately below)
        Object.entries(correction.corrections).forEach(([key, value]) => {
          if (key === 'post_details') return; // handled separately below
          const oldValue = r[key];
          r[key] = value;

          // 只显示关键字段的变化
          if (['google_name', 'address', 'google_rating', 'name', 'name_en'].includes(key)) {
            console.log(`   ${key}: ${oldValue} → ${value}`);
          }
        });

        // post_details: UNION of correction posts + pipeline-only posts (preserves new additions)
        if ('post_details' in correction.corrections) {
          const correctionPosts = correction.corrections.post_details || [];
          const correctionPostIds = new Set(correctionPosts.map(p => p.post_id));
          const pipelineOnlyPosts = (r.post_details || []).filter(p => !correctionPostIds.has(p.post_id));
          r.post_details = [...correctionPosts, ...pipelineOnlyPosts];
          // Recalculate metrics to match the merged post list
          r.total_engagement = r.post_details.reduce((sum, p) => sum + (p.adjusted_engagement || 0), 0);
          r.mention_count = r.post_details.length;
          r.sources = [...new Set(r.post_details.map(p => p.post_id).filter(Boolean))];
          console.log(`   post_details: ${correctionPosts.length} correction posts + ${pipelineOnlyPosts.length} pipeline posts`);
        }

        // 添加修正标记
        r.correction_applied = {
          at: new Date().toISOString(),
          reason: correction.reason
        };
        
        applied++;
      } else {
        console.log(`\n⚠️  未找到餐厅: ${correction.name} (${correction.id})`);
        skipped++;
      }
    });
  }

  // 应用ID映射（确保重复ID正确分配）
  if (corrections.id_mapping) {
    console.log('\n' + '='.repeat(70));
    console.log('ID映射检查:');
    
    Object.entries(corrections.id_mapping).forEach(([newId, info]) => {
      const r = db.restaurants.find(x => x.id === newId);
      if (r) {
        console.log(`  ✅ ${newId}: ${r.name} (原${info.original_id})`);
      }
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log(`修正完成: ${applied} 家应用, ${skipped} 家跳过`);

  // 保存
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');

  // 提交事务
  commitTransaction(txId);

  console.log('💾 已保存到数据库');
  console.log('\n提示: 如需添加新的修正，请编辑 data/corrections.json');
  console.log('      如需回滚: node scripts/transaction.js rollback ' + txId);

} catch (error) {
  console.error('\n❌ 错误:', error.message);
  console.log('⏪ 正在回滚事务...');
  const { rollbackTransaction } = require('./transaction');
  rollbackTransaction(txId);
  process.exit(1);
}
