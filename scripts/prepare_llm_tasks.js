#!/usr/bin/env node
/**
 * 批量LLM提取推荐菜品 - 使用子agent
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = './data/current/restaurant_database.json';
const POSTS_DIR = './data/raw/v2/posts';

function loadPost(postId) {
  try {
    const filePath = path.join(POSTS_DIR, postId + '.json');
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    
    if (parsed.jsonrpc && parsed.result && parsed.result.content) {
      const innerText = parsed.result.content[0].text;
      const innerData = JSON.parse(innerText);
      return innerData.data || innerData;
    }
    return parsed.data || parsed;
  } catch (e) {
    return null;
  }
}

function getPostText(postId) {
  const post = loadPost(postId);
  if (!post || !post.note) return '';
  
  const title = post.note.title || '';
  const desc = post.note.desc || '';
  return title + '\n' + desc;
}

// 读取数据库
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

console.log('🤖 准备批量LLM提取');
console.log('='.repeat(70));

// 准备提取任务
const restaurants = db.restaurants.filter(r => r.sources && r.sources.length > 0);

console.log(`需要处理 ${restaurants.length} 家餐厅`);
console.log('');

// 生成任务列表
const tasks = restaurants.map(r => {
  const texts = r.sources.map(s => getPostText(s)).filter(t => t);
  return {
    name: r.name,
    texts: texts,
    id: r.id
  };
});

// 保存任务列表
fs.writeFileSync('/tmp/llm_dish_tasks.json', JSON.stringify(tasks, null, 2));
console.log('任务列表已保存到 /tmp/llm_dish_tasks.json');
console.log('');
console.log('前3家餐厅预览:');
tasks.slice(0, 3).forEach((t, i) => {
  console.log(`${i+1}. ${t.name} - ${t.texts.length} 个帖子`);
});

console.log('');
console.log('请运行: node scripts/extract_dishes_worker.js');
