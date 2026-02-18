#!/usr/bin/env node
/**
 * 应用数据修正 - 由pipeline在最后一步调用
 * 确保人工修复的数据不会被覆盖
 * 【事务性操作】支持自动备份和回滚
 */

const fs = require('fs');
const path = require('path');
const { beginTransaction, commitTransaction } = require('./transaction');

const DATA_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';
const DB_FILE = path.join(DATA_DIR, 'current', 'restaurant_database.json');
const CORRECTIONS_FILE = path.join(DATA_DIR, 'corrections.json');

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

  const corrections = JSON.parse(fs.readFileSync(CORRECTIONS_FILE, 'utf8'));

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
          
          applied++;
          return;
        }
        
        console.log(`\n✅ ${correction.name} (${correction.id}):`);
        
        // 应用修正字段
        Object.entries(correction.corrections).forEach(([key, value]) => {
          const oldValue = r[key];
          r[key] = value;
          
          // 只显示关键字段的变化
          if (['google_name', 'address', 'google_rating', 'name', 'name_en'].includes(key)) {
            console.log(`   ${key}: ${oldValue} → ${value}`);
          }
        });
        
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
