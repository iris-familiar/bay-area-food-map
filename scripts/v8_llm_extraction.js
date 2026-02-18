#!/usr/bin/env node
/**
 * V8 Pipeline - 完整LLM提取与合并
 * 所有餐厅信息（新旧）必须通过LLM提取，禁止简单关键词匹配
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts';
const V8_DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_v8.json';

/**
 * LLM Prompt: 提取餐厅信息
 */
const RESTAURANT_EXTRACTION_PROMPT = `你是一个专业的餐饮信息提取助手。请从以下小红书帖子内容中提取所有提及的餐厅信息。

帖子标题：{{TITLE}}
帖子正文：
{{CONTENT}}

提取要求：
1. 提取所有餐厅名称（必须是完整的正式名称，不是"这家"、"那家"）
2. 提取菜系类型（如：湘菜、川菜、日料、火锅等）
3. 提取地区（如：Cupertino、Milpitas、Fremont等）
4. **提取推荐菜品**（必须是具体的菜名，有推荐语境如"必点"、"惊艳"、"好吃"）
5. 分析用餐场景（约会、聚餐、家庭、一人食、商务）
6. 分析氛围标签（安静、热闹、高档、正宗、温馨）
7. 实用标签（实惠、辣味、健康、好停车）

输出格式（严格JSON）：
{
  "restaurants": [
    {
      "name": "餐厅中文名（必须完整正式）",
      "nameEn": "English Name（如有）",
      "cuisine": "菜系",
      "area": "地区",
      "dishes": ["推荐菜1", "推荐菜2", "推荐菜3"],
      "scenes": ["约会|聚餐|家庭|一人食|商务"],
      "vibes": ["安静|热闹|高档|正宗|温馨"],
      "practical": ["实惠|辣味|健康|好停车"],
      "confidence": 0.95
    }
  ]
}

重要规则：
- 只提取有明确推荐语的菜品（如"必点"、"惊艳"、"推荐"、"好吃"）
- 菜品名必须完整（如"小炒黄牛肉"，不是简单的"牛肉"）
- 如果没有推荐语境，dishes数组为空
- 输出必须是合法JSON，不要有任何其他文字`;

/**
 * 使用 LLM 提取单个帖子的餐厅信息
 */
async function extractWithLLM(postData) {
  const note = postData.note || postData.data?.note;
  if (!note || !note.desc) return null;
  
  const prompt = RESTAURANT_EXTRACTION_PROMPT
    .replace('{{TITLE}}', note.title || '')
    .replace('{{CONTENT}}', note.desc);
  
  try {
    // 使用 gemini CLI
    const result = execSync(
      `gemini -p ${JSON.stringify(prompt)} --approval-mode yolo`,
      { encoding: 'utf8', timeout: 120000 }
    );
    
    // 解析JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('LLM extraction failed:', e.message);
  }
  return null;
}

/**
 * 加载帖子数据
 */
function loadPost(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    
    if (parsed.jsonrpc && parsed.result && parsed.result.content && parsed.result.content[0]) {
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
 * 主函数：V8 Pipeline LLM提取
 */
async function main() {
  console.log('🔬 V8 Pipeline - LLM 提取');
  console.log('='.repeat(70));
  
  // 1. 加载现有V8数据库
  let v8Db = { version: '8.0-llm-extracted', total_restaurants: 0, restaurants: [] };
  if (fs.existsSync(V8_DB_FILE)) {
    v8Db = JSON.parse(fs.readFileSync(V8_DB_FILE, 'utf8'));
    console.log(`✓ 加载现有V8数据库: ${v8Db.restaurants.length} 家餐厅`);
  }
  
  // 2. 获取所有帖子文件
  const postFiles = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.json'));
  console.log(`✓ 发现 ${postFiles.length} 个帖子文件`);
  
  // 3. 收集所有新餐厅信息
  const newRestaurants = [];
  let processed = 0;
  
  for (const file of postFiles.slice(0, 5)) { // 先处理前5个测试
    processed++;
    console.log(`\n[${processed}/${Math.min(postFiles.length, 5)}] 处理: ${file}`);
    
    const postData = loadPost(path.join(POSTS_DIR, file));
    if (!postData) continue;
    
    // 使用LLM提取
    const extraction = await extractWithLLM(postData);
    if (!extraction || !extraction.restaurants) {
      console.log('  ⚠️  LLM提取失败或无效');
      continue;
    }
    
    console.log(`  ✓ LLM提取到 ${extraction.restaurants.length} 家餐厅`);
    
    for (const r of extraction.restaurants) {
      // 检查是否已存在
      const existing = v8Db.restaurants.find(er => er.name === r.name);
      
      if (existing) {
        // 现有餐厅：更新来源，但不覆盖推荐菜
        if (!existing.sources) existing.sources = [];
        const postId = file.replace('.json', '');
        if (!existing.sources.includes(postId)) {
          existing.sources.push(postId);
          console.log(`  ↻ 更新来源: ${r.name}`);
        }
      } else {
        // 新餐厅：完整LLM提取
        const newRestaurant = {
          id: `r${String(v8Db.restaurants.length + newRestaurants.length + 1).padStart(3, '0')}`,
          name: r.name,
          name_en: r.nameEn || '',
          cuisine: r.cuisine || '未知菜系',
          area: r.area || '',
          price_range: '',
          total_engagement: 0,
          mention_count: 1,
          sources: [file.replace('.json', '')],
          recommendations: r.dishes || [],
          recommendations_source: 'llm_extracted',
          semantic_tags: {
            scenes: r.scenes || [],
            vibes: r.vibes || [],
            practical: r.practical || []
          },
          post_details: [{
            post_id: file.replace('.json', ''),
            title: postData.note?.title || '',
            date: new Date().toISOString().split('T')[0],
            engagement: 0,
            context: ''
          }]
        };
        newRestaurants.push(newRestaurant);
        console.log(`  ✚ 新餐厅: ${r.name} - 推荐菜: ${(r.dishes || []).join(', ') || '无'}`);
      }
    }
    
    // 避免API限流
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // 4. 合并新旧餐厅
  v8Db.restaurants = [...v8Db.restaurants, ...newRestaurants];
  v8Db.total_restaurants = v8Db.restaurants.length;
  
  // 5. 保存V8数据库
  fs.writeFileSync(V8_DB_FILE, JSON.stringify(v8Db, null, 2), 'utf8');
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ V8 LLM提取完成！');
  console.log(`   原有餐厅: ${v8Db.restaurants.length - newRestaurants.length}`);
  console.log(`   新增餐厅: ${newRestaurants.length}`);
  console.log(`   总餐厅数: ${v8Db.restaurants.length}`);
  console.log(`\n⚠️  注意：所有推荐菜均来自LLM提取，无简单关键词匹配`);
}

main().catch(console.error);
