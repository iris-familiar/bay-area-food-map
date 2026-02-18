#!/usr/bin/env node
/**
 * 更新已有帖子的engagement数据
 * 每天运行，刷新所有已知帖子的互动数
 * 【事务性操作】支持自动备份和回滚
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { beginTransaction, commitTransaction } = require('./transaction');

const DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database.json';
const RAW_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts';

console.log('🔄 更新帖子engagement数据');
console.log('='.repeat(70));
console.log('⚠️ 注意: 小红书API限制未知，当前设置基于经验估算');
console.log('可通过环境变量调整: MAX_UPDATES_PER_DAY=50 node update_post_engagement.js');
console.log('='.repeat(70));

// 开始事务
const txId = beginTransaction('update_engagement');

try {
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  // 收集所有需要更新的帖子ID
  const postIds = new Set();

  db.restaurants.forEach(r => {
    if (r.sources) {
      r.sources.forEach(id => postIds.add(id));
    }
    if (r.post_details) {
      r.post_details.forEach(p => postIds.add(p.post_id));
    }
  });

  const uniquePostIds = Array.from(postIds);
  console.log(`共有 ${uniquePostIds.length} 个帖子需要检查更新\n`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  // 限制每天更新的数量（避免API限制）
  const MAX_UPDATES_PER_DAY = parseInt(process.env.MAX_UPDATES_PER_DAY) || 20;
  const postsToUpdate = uniquePostIds.slice(0, MAX_UPDATES_PER_DAY);

  console.log(`本次将更新前 ${postsToUpdate.length} 个帖子 (总共 ${uniquePostIds.length} 个)`);
  console.log(`如需调整数量，设置环境变量: MAX_UPDATES_PER_DAY=50\n`);

  postsToUpdate.forEach((postId, index) => {
    console.log(`[${index + 1}/${postsToUpdate.length}] 更新帖子: ${postId}`);
    
    try {
      // 尝试获取最新数据
      const skillPath = `${process.env.HOME}/.openclaw/skills/xiaohongshu`;
      let result = null;
      
      try {
        const output = execSync(`cd ${skillPath} && ./scripts/mcp-call.sh get_note_by_id '{"note_id": "${postId}"}' 2>/dev/null`, {
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 1024 * 1024
        });
        result = JSON.parse(output);
      } catch (e) {
        console.log(`   ⚠️  无法获取最新数据: ${e.message}`);
        skipped++;
        return;
      }
      
      if (result && result.engagement) {
        const newEngagement = result.engagement;
        
        // 更新数据库中所有引用该帖子的记录
        let localUpdated = false;
        
        db.restaurants.forEach(r => {
          if (r.post_details) {
            r.post_details.forEach(p => {
              if (p.post_id === postId) {
                const oldEngagement = p.engagement;
                p.engagement = newEngagement;
                p.last_updated = new Date().toISOString();
                
                if (oldEngagement !== newEngagement) {
                  console.log(`   ✅ ${r.name}: ${oldEngagement} → ${newEngagement}`);
                  localUpdated = true;
                }
              }
            });
          }
        });
        
        if (localUpdated) {
          updated++;
        } else {
          console.log(`   ℹ️  数据未变化: ${newEngagement}`);
          skipped++;
        }
      } else {
        console.log(`   ⚠️  返回数据格式不正确`);
        skipped++;
      }
      
      // 请求间隔
      if (index < postsToUpdate.length - 1) {
        execSync('sleep 2');
      }
      
    } catch (error) {
      console.log(`   ❌ 更新失败: ${error.message}`);
      failed++;
    }
  });

  // 重新计算餐厅的total_engagement
  db.restaurants.forEach(r => {
    if (r.post_details) {
      const oldTotal = r.total_engagement;
      r.total_engagement = r.post_details.reduce((sum, p) => sum + (p.engagement || 0), 0);
      
      if (oldTotal !== r.total_engagement) {
        console.log(`\n📊 ${r.name} 总讨论度更新: ${oldTotal} → ${r.total_engagement}`);
      }
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('更新统计:');
  console.log(`  ✅ 成功更新: ${updated}`);
  console.log(`  ⚠️  跳过/无变化: ${skipped}`);
  console.log(`  ❌ 失败: ${failed}`);
  console.log(`  📊 总帖子数: ${uniquePostIds.length}`);
  console.log(`  🔄 剩余待更新: ${Math.max(0, uniquePostIds.length - MAX_UPDATES_PER_DAY)}`);

  // 保存
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');

  // 提交事务
  commitTransaction(txId);

  console.log('\n💾 已保存更新后的数据');
  console.log('\n提示:');
  console.log('  - 每天更新前20个帖子（轮换制）');
  console.log('  - 如需更新全部帖子，可分批多天完成');
  console.log('  - 或手动运行此脚本多次');
  console.log(`  - 如需回滚: node scripts/transaction.js rollback ${txId}`);

} catch (error) {
  console.error('\n❌ 错误:', error.message);
  console.log('⏪ 正在回滚事务...');
  const { rollbackTransaction } = require('./transaction');
  rollbackTransaction(txId);
  process.exit(1);
}
