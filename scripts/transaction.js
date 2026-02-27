#!/usr/bin/env node
/**
 * 事务性数据库操作包装器
 * 确保数据操作的原子性和可回滚
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DB_FILE = path.join(PROJECT_ROOT, 'site', 'data', 'restaurant_database.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups', 'transactions');

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * 开始事务 - 创建备份
 * @returns {string} transactionId
 */
function beginTransaction(operationName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const transactionId = `${operationName}_${timestamp}`;
  const backupPath = path.join(BACKUP_DIR, `${transactionId}.json`);
  
  // 创建备份
  fs.copyFileSync(DB_FILE, backupPath);
  
  console.log(`📝 事务开始: ${transactionId}`);
  console.log(`   备份: ${backupPath}`);
  
  return transactionId;
}

/**
 * 提交事务 - 删除备份
 */
function commitTransaction(transactionId) {
  const backupPath = path.join(BACKUP_DIR, `${transactionId}.json`);
  
  // 保留最近7天的备份，删除旧的
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      stat: fs.statSync(path.join(BACKUP_DIR, f))
    }))
    .sort((a, b) => b.stat.mtime - a.stat.mtime);
  
  // 保留最近20个备份
  files.slice(20).forEach(f => {
    fs.unlinkSync(f.path);
    console.log(`   🗑️  清理旧备份: ${f.name}`);
  });
  
  console.log(`✅ 事务提交: ${transactionId}`);
}

/**
 * 回滚事务 - 恢复备份
 */
function rollbackTransaction(transactionId) {
  const backupPath = path.join(BACKUP_DIR, `${transactionId}.json`);
  
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, DB_FILE);
    console.log(`⏪ 事务回滚: ${transactionId}`);
    console.log(`   已恢复到备份状态`);
    return true;
  } else {
    console.log(`❌ 无法回滚: 备份文件不存在 ${backupPath}`);
    return false;
  }
}

/**
 * 列出可回滚的事务
 */
function listRollbackableTransactions() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      stat: fs.statSync(path.join(BACKUP_DIR, f))
    }))
    .sort((a, b) => b.stat.mtime - a.stat.mtime);
  
  console.log('📋 可回滚的事务:');
  files.slice(0, 10).forEach((f, i) => {
    console.log(`  ${i+1}. ${f.name}`);
    console.log(`     时间: ${f.stat.mtime.toISOString()}`);
    console.log(`     大小: ${(f.stat.size / 1024).toFixed(1)} KB`);
  });
  
  return files.map(f => f.name.replace('.json', ''));
}

// 命令行支持
if (require.main === module) {
  const command = process.argv[2];
  const arg = process.argv[3];
  
  switch (command) {
    case 'list':
      listRollbackableTransactions();
      break;
    case 'rollback':
      if (arg) {
        rollbackTransaction(arg);
      } else {
        const transactions = listRollbackableTransactions();
        if (transactions.length > 0) {
          console.log('\n使用: node transaction.js rollback <transaction_id>');
        }
      }
      break;
    default:
      console.log('Usage:');
      console.log('  node transaction.js list              # 列出可回滚的事务');
      console.log('  node transaction.js rollback <id>     # 回滚到指定事务');
  }
}

module.exports = {
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  listRollbackableTransactions,
  DB_FILE,
  BACKUP_DIR
};
