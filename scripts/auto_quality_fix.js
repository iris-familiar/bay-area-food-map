#!/usr/bin/env node
/**
 * 数据质量规则引擎 - 自动检测和修复常见问题
 * 由 pipeline 自动调用
 * 【事务性操作】支持自动备份和回滚
 */

const fs = require('fs');
const path = require('path');
const { beginTransaction, commitTransaction } = require('./transaction');

const DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';
const RULES_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/quality_rules.json';

console.log('🔍 数据质量规则引擎');
console.log('='.repeat(70));

// 开始事务
const txId = beginTransaction('auto_quality_fix');

try {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const rules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));

  const stats = {
    duplicates_found: 0,
    duplicates_merged: 0,
    low_quality_recommendations: 0,
    name_mismatches: 0
  };

  // ============================================
  // Rule 1: 自动检测重复餐厅 (基于Google Place ID)
  // ============================================
  function detectAndMergeDuplicates() {
    console.log('\n📋 规则1: 检测重复餐厅');
    console.log('-'.repeat(70));
    
    const placeIdMap = {};
    
    // 按Google Place ID分组
    db.restaurants.forEach(r => {
      if (r.google_place_id && !r._status) {
        if (!placeIdMap[r.google_place_id]) {
          placeIdMap[r.google_place_id] = [];
        }
        placeIdMap[r.google_place_id].push(r);
      }
    });
    
    // 找出重复的
    Object.entries(placeIdMap).forEach(([placeId, restaurants]) => {
      if (restaurants.length > 1) {
        stats.duplicates_found += restaurants.length;
        
        console.log(`\n⚠️  发现 ${restaurants.length} 个重复餐厅 (Place ID: ${placeId})`);
        restaurants.forEach((r, i) => {
          console.log(`  ${i+1}. ${r.name} (${r.id}) - ${r.total_engagement || 0} 互动`);
        });
        
        // 自动合并策略：保留互动最高的
        restaurants.sort((a, b) => (b.total_engagement || 0) - (a.total_engagement || 0));
        const primary = restaurants[0];
        const duplicates = restaurants.slice(1);
        
        console.log(`\n  ✅ 保留: ${primary.name} (${primary.id})`);
        
        // 合并数据
        duplicates.forEach(dup => {
          console.log(`  🔄 合并: ${dup.name} (${dup.id})`);
          
          // 合并sources
          if (dup.sources) {
            primary.sources = primary.sources || [];
            dup.sources.forEach(s => {
              if (!primary.sources.includes(s)) primary.sources.push(s);
            });
          }
          
          // 合并post_details
          if (dup.post_details) {
            primary.post_details = primary.post_details || [];
            dup.post_details.forEach(p => {
              const exists = primary.post_details.find(pp => pp.post_id === p.post_id);
              if (!exists) primary.post_details.push(p);
            });
          }
          
          // 合并讨论度
          primary.total_engagement = (primary.total_engagement || 0) + (dup.total_engagement || 0);
          
          // 添加别名
          primary.alias = primary.alias || [];
          if (!primary.alias.includes(dup.name)) {
            primary.alias.push(dup.name);
          }
          
          // 选择更好的推荐菜
          if (dup.recommendations && dup.recommendations.length > 0) {
            const dupQuality = assessRecommendationQuality(dup.recommendations);
            const primaryQuality = assessRecommendationQuality(primary.recommendations || []);
            
            if (dupQuality > primaryQuality) {
              console.log(`    📊 采用更好的推荐菜: ${dup.recommendations.join(', ')}`);
              primary.recommendations = dup.recommendations;
            }
          }
          
          // 标记为重复
          dup._status = 'duplicate_merged';
          dup._merged_into = primary.id;
          dup._merged_reason = 'same_google_place_id';
          dup._merged_at = new Date().toISOString();
          
          stats.duplicates_merged++;
        });
      }
    });
  }

  // ============================================
  // 评估推荐菜质量
  // ============================================
  function assessRecommendationQuality(recommendations) {
    if (!recommendations || recommendations.length === 0) return 0;
    
    const genericWords = ['鸡', '面', '汤', '肉', '菜', '鱼', '虾', 'rice', 'noodle'];
    let score = 0;
    
    recommendations.forEach(dish => {
      // 长度得分（菜名越长越具体）
      if (dish.length >= 4) score += 2;
      else if (dish.length >= 2) score += 1;
      
      // 非通用词得分
      const isGeneric = genericWords.some(w => dish.includes(w) && dish.length <= 4);
      if (!isGeneric) score += 2;
    });
    
    return score / recommendations.length;
  }

  // ============================================
  // Rule 2: 清理低质量推荐菜
  // ============================================
  function cleanLowQualityRecommendations() {
    console.log('\n📋 规则2: 清理低质量推荐菜');
    console.log('-'.repeat(70));
    
    const genericWords = ['鸡', '面', '汤', '肉', '菜'];
    
    db.restaurants.forEach(r => {
      if (r.recommendations && r.recommendations.length > 0) {
        const original = [...r.recommendations];
        
        // 过滤太短的菜名
        r.recommendations = r.recommendations.filter(dish => {
          // 保留长度>=3且不是通用词的菜名
          if (dish.length < 3) return false;
          if (genericWords.includes(dish) && dish.length <= 2) return false;
          return true;
        });
        
        if (r.recommendations.length < original.length) {
          console.log(`  🧹 ${r.name}: ${original.join(', ')} → ${r.recommendations.join(', ')}`);
          stats.low_quality_recommendations++;
        }
      }
    });
  }

  // ============================================
  // Rule 3: 修正描述性名称
  // ============================================
  function fixDescriptiveNames() {
    console.log('\n📋 规则3: 修正描述性餐厅名');
    console.log('-'.repeat(70));
    
    const descriptivePatterns = ['竟然', '这么', '一个', '系', '风格', '原来', '居然'];
    
    db.restaurants.forEach(r => {
      // 检查名称是否包含描述性词汇
      const hasDescriptive = descriptivePatterns.some(p => r.name && r.name.includes(p));
      
      if (hasDescriptive && r.google_name) {
        console.log(`  ⚠️  ${r.name} → 可能是描述性名称`);
        
        // 提取Google名中的中文部分
        const chineseInGoogle = r.google_name.match(/[\u4e00-\u9fa5]+/g);
        if (chineseInGoogle && chineseInGoogle.length > 0) {
          // 保存原名称作为别名
          r.alias = r.alias || [];
          if (!r.alias.includes(r.name)) {
            r.alias.push(r.name);
          }
          
          // 优先使用Google名中的中文
          const newName = chineseInGoogle[0];
          console.log(`    ✅ 改为: ${newName}`);
          r.name = newName;
          stats.name_mismatches++;
        }
      }
    });
  }

  // ============================================
  // 主执行流程
  // ============================================
  console.log('\n开始执行自动修复规则...\n');

  detectAndMergeDuplicates();
  cleanLowQualityRecommendations();
  fixDescriptiveNames();

  // 重新计算统计数据
  db.restaurants.forEach(r => {
    if (r.post_details) {
      r.total_engagement = r.post_details.reduce((sum, p) => sum + (p.engagement || 0), 0);
      r.mention_count = r.post_details.length;
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('📊 修复统计');
  console.log('='.repeat(70));
  console.log(`  发现重复餐厅: ${stats.duplicates_found} 个`);
  console.log(`  已合并: ${stats.duplicates_merged} 个`);
  console.log(`  清理低质量推荐菜: ${stats.low_quality_recommendations} 家`);
  console.log(`  修正描述性名称: ${stats.name_mismatches} 家`);

  // 保存
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');

  // 提交事务
  commitTransaction(txId);

  console.log('\n💾 已保存到数据库');
  console.log('\n提示:');
  console.log('  - 规则配置: data/quality_rules.json');
  console.log('  - 如需调整规则阈值，请编辑配置文件');
  console.log('  - 如需回滚: node scripts/transaction.js rollback ' + txId);

} catch (error) {
  console.error('\n❌ 错误:', error.message);
  console.log('⏪ 正在回滚事务...');
  const { rollbackTransaction } = require('./transaction');
  rollbackTransaction(txId);
  process.exit(1);
}
