#!/usr/bin/env node
/**
 * V8 Pipeline - LLM Extraction (Kimi Code Version)
 * 使用系统配置的Kimi Code API Key进行餐厅信息提取
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/v2/posts';
const V8_DB_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_v8.json';

// 从环境变量读取Kimi Code API Key（OpenClaw系统配置）
const KIMI_API_KEY = process.env.KIMI_CODE_API_KEY || process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY;

/**
 * 调用Kimi Code API (OpenAI-compatible)
 */
async function callKimiAPI(messages, temperature = 0.3) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'kimi-k2.5',
      messages: messages,
      temperature: temperature,
      response_format: { type: 'json_object' }
    });

    const options = {
      hostname: 'api.moonshot.cn',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KIMI_API_KEY}`,
        'Content-Length': data.length
      },
      timeout: 120000
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.choices && parsed.choices[0]) {
            resolve(parsed.choices[0].message.content);
          } else {
            reject(new Error(`API Error: ${parsed.error?.message || 'Unknown error'}`));
          }
        } catch (e) {
          reject(new Error(`Parse Error: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Request Error: ${e.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

/**
 * 构建Prompt
 */
const getPromptMessages = (title, content) => [
  {
    role: 'system',
    content: '你是一个专业的餐饮信息提取助手。从用户提供的帖子内容中提取餐厅信息，并以JSON格式返回。'
  },
  {
    role: 'user',
    content: `请从以下小红书帖子内容中提取所有提及的餐厅信息。

帖子标题：${title}
帖子正文：
${content.slice(0, 1500)}

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
- 输出必须是合法JSON，不要有任何其他文字`
  }
];

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

async function extractWithKimi(postData) {
  const note = postData.note || postData.data?.note;
  if (!note || !note.desc) return null;
  
  try {
    const messages = getPromptMessages(note.title || '', note.desc);
    const result = await callKimiAPI(messages);
    
    // 解析JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(result);
  } catch (e) {
    console.error('  Kimi提取失败:', e.message);
    return null;
  }
}

async function processNewPosts() {
  console.log('🔬 V8 Pipeline - Kimi Code LLM 提取');
  console.log('='.repeat(70));
  
  if (!KIMI_API_KEY) {
    console.error('❌ 错误: 未设置Kimi API Key环境变量');
    console.log('请设置以下环境变量之一:');
    console.log('  export KIMI_CODE_API_KEY=sk-xxx');
    console.log('  export MOONSHOT_API_KEY=sk-xxx');
    console.log('  export KIMI_API_KEY=sk-xxx');
    process.exit(1);
  }
  
  console.log('✓ Kimi API Key已配置');
  
  // 加载现有V8数据库
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
    console.log('没有新帖子，跳过LLM提取');
    return;
  }
  
  const newRestaurants = [];
  let processed = 0;
  let failed = 0;
  
  for (const file of postFiles) {
    processed++;
    console.log(`\n[${processed}/${postFiles.length}] ${file}`);
    
    const postData = loadPost(path.join(POSTS_DIR, file));
    if (!postData?.note?.desc) {
      console.log('  ⚠️  无效帖子');
      failed++;
      continue;
    }
    
    const extraction = await extractWithKimi(postData);
    
    if (!extraction?.restaurants?.length) {
      console.log('  ⚠️  未提取到餐厅');
      failed++;
      continue;
    }
    
    console.log(`  ✓ Kimi提取到 ${extraction.restaurants.length} 家餐厅`);
    
    for (const r of extraction.restaurants) {
      const existing = v8Db.restaurants.find(er => er.name === r.name);
      
      if (existing) {
        // 更新现有餐厅来源
        if (!existing.sources) existing.sources = [];
        const postId = file.replace('.json', '');
        if (!existing.sources.includes(postId)) {
          existing.sources.push(postId);
          existing.mention_count = (existing.mention_count || 0) + 1;
          console.log(`  ↻ 更新: ${r.name}`);
        }
      } else {
        // 新餐厅 - 完整Kimi LLM提取
        const newId = `r${String(v8Db.restaurants.length + newRestaurants.length + 1).padStart(3, '0')}`;
        newRestaurants.push({
          id: newId,
          name: r.name,
          name_en: r.nameEn || '',
          cuisine: r.cuisine || '未知菜系',
          area: r.area || '',
          price_range: '',
          total_engagement: 0,
          mention_count: 1,
          sources: [file.replace('.json', '')],
          recommendations: (r.dishes || []).slice(0, 10),
          recommendations_source: 'llm_extracted',
          semantic_tags: {
            scenes: r.scenes || [],
            vibes: r.vibes || [],
            practical: r.practical || []
          },
          post_details: [{
            post_id: file.replace('.json', ''),
            title: postData.note.title || '',
            date: new Date().toISOString().split('T')[0],
            engagement: 0
          }]
        });
        console.log(`  ✚ 新增: ${r.name} [${(r.dishes || []).join(', ') || '无'}]`);
      }
    }
    
    // API限流保护
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // 合并并保存
  v8Db.restaurants = [...v8Db.restaurants, ...newRestaurants];
  v8Db.total_restaurants = v8Db.restaurants.length;
  v8Db.last_updated = new Date().toISOString();
  
  fs.writeFileSync(V8_DB_FILE, JSON.stringify(v8Db, null, 2));
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Kimi Code LLM提取完成！');
  console.log(`   处理帖子: ${processed}`);
  console.log(`   失败: ${failed}`);
  console.log(`   原有餐厅: ${v8Db.restaurants.length - newRestaurants.length}`);
  console.log(`   新增餐厅: ${newRestaurants.length}`);
  console.log(`   总计: ${v8Db.restaurants.length}`);
  console.log('⚠️  所有推荐菜均来自Kimi Code LLM提取');
}

processNewPosts().catch(console.error);
