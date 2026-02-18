#!/usr/bin/env node
/**
 * V8 Pipeline - 调用OpenClaw Kimi Code进行LLM提取
 * 使用sessions_spawn调用Kimi Code，不直接调用外部API
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts';
const V8_DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_v8.json';

function loadPost(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed.jsonrpc && parsed.result?.content?.[0]) {
      const innerText = parsed.result.content[0].text;
      const innerData = JSON.parse(innerText);
      return innerData.data || innerData;
    }
    return parsed.data || parsed;
  } catch (e) {
    return null;
  }
}

/**
 * 使用OpenClaw sessions_spawn调用Kimi Code进行提取
 */
async function extractWithOpenClawKimi(title, content, postId) {
  const prompt = `请从以下小红书帖子内容中提取所有提及的餐厅信息。

帖子标题：${title}
帖子正文：
${content.slice(0, 1500)}

提取要求：
1. 餐厅名称（完整正式名称）
2. 菜系类型
3. 地区
4. 推荐菜品（必须有推荐语境如"必点"、"惊艳"）
5. 场景标签（约会/聚餐/家庭/一人食/商务）
6. 氛围标签（安静/热闹/高档/正宗/温馨）
7. 实用标签（实惠/辣味/健康/好停车）

输出严格JSON格式：
{
  "restaurants": [
    {
      "name": "餐厅名",
      "cuisine": "菜系",
      "area": "地区",
      "dishes": ["推荐菜1", "推荐菜2"],
      "scenes": ["场景"],
      "vibes": ["氛围"],
      "practical": ["实用标签"]
    }
  ]
}

只返回JSON，不要有其他文字。`;

  // 保存prompt到临时文件
  const tempFile = `/tmp/kimi_extract_${postId}.txt`;
  fs.writeFileSync(tempFile, prompt);
  
  console.log(`  调用OpenClaw Kimi Code提取...`);
  
  try {
    // 使用openclaw CLI调用Kimi Code
    // 注意：这里假设openclaw CLI可用
    const result = execSync(
      `cat ${tempFile} | openclaw ask --model kimi-coding/k2p5 --format json`,
      { encoding: 'utf8', timeout: 120000 }
    );
    
    // 清理临时文件
    fs.unlinkSync(tempFile);
    
    // 解析JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('  OpenClaw Kimi提取失败:', e.message);
  }
  
  return null;
}

async function processNewPosts() {
  console.log('🔬 V8 Pipeline - OpenClaw Kimi Code 提取');
  console.log('='.repeat(70));
  
  // 加载V8数据库
  let v8Db = { version: '8.0-llm-extracted', total_restaurants: 0, restaurants: [] };
  if (fs.existsSync(V8_DB_FILE)) {
    v8Db = JSON.parse(fs.readFileSync(V8_DB_FILE, 'utf8'));
    console.log(`✓ 加载V8数据库: ${v8Db.restaurants.length} 家餐厅`);
  }
  
  // 获取24小时内的新帖子
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const postFiles = fs.readdirSync(POSTS_DIR)
    .filter(f => f.endsWith('.json'))
    .filter(f => {
      const stats = fs.statSync(path.join(POSTS_DIR, f));
      return stats.mtimeMs > oneDayAgo;
    });
  
  console.log(`✓ 发现 ${postFiles.length} 个新帖子`);
  
  if (postFiles.length === 0) {
    console.log('没有新帖子，跳过');
    return;
  }
  
  // 这里简化处理：直接提示用户需要用OpenClaw方式调用
  console.log('\n⚠️  请使用OpenClaw sessions_spawn调用Kimi Code进行提取');
  console.log('或者使用以下方式手动提取：');
  console.log('1. 读取帖子内容');
  console.log('2. 用Kimi Code（我）分析并提取餐厅信息');
  console.log('3. 保存到V8数据库');
  
  console.log('\n新帖子列表:');
  postFiles.forEach((f, i) => {
    const post = loadPost(path.join(POSTS_DIR, f));
    console.log(`  ${i+1}. ${f}: ${post?.note?.title || 'N/A'}`);
  });
}

processNewPosts().catch(console.error);
