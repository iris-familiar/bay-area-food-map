/**
 * LLM-based Restaurant Information Extraction
 * Uses LLM for semantic understanding instead of keyword matching
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/post_details';
const OUTPUT_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';

/**
 * Prompt模板：从帖子正文提取餐厅信息
 */
const RESTAURANT_EXTRACTION_PROMPT = `你是一个专业的餐饮信息提取助手。请从以下小红书帖子正文中提取所有提及的餐厅信息。

帖子正文：
{{CONTENT}}

提取要求：
1. 提取所有餐厅名称（包括中英文）
2. 提取地址信息（城市、街道、商圈等）
3. 提取推荐菜品
4. 分析情感倾向（positive/neutral/negative）
5. 提取价格线索（$、$$、$$$等）

输出格式（JSON）：
{
  "restaurants": [
    {
      "name": "餐厅中文名",
      "nameEn": "English Name",
      "confidence": 0.95,
      "context": "提及的上下文片段",
      "sentiment": "positive|neutral|negative",
      "address": {
        "city": "城市",
        "area": "区域",
        "street": "街道线索"
      },
      "dishes": ["推荐菜品1", "推荐菜品2"],
      "priceHint": "$"
    }
  ],
  "notes": "其他观察"
}

注意：
- 即使餐厅名是简写或昵称，也要尝试识别（如"牛家"→"Wooja韩国烤肉"）
- 注意否定词（"不好吃"、"避雷"）应标记为negative
- 地址线索可能分散在正文中，需要综合提取`;

/**
 * Prompt模板：从评论提取推荐信息
 */
const COMMENT_EXTRACTION_PROMPT = `你是一个专业的评论分析助手。请分析以下小红书评论，提取餐厅推荐信息。

帖子标题：{{POST_TITLE}}
评论内容：
{{COMMENT}}

提取要求：
1. 评论中是否推荐了某个餐厅
2. 推荐的菜品是什么
3. 对比了哪些餐厅
4. 情感倾向（positive推荐/neutral询问/negative避雷）
5. 是否有额外的信息（地址、价格、排队等）

输出格式（JSON）：
{
  "hasRecommendation": true,
  "restaurants": [
    {
      "name": "餐厅名",
      "type": "mentioned|recommended|compared|avoid",
      "dishes": ["菜品名"],
      "context": "相关上下文"
    }
  ],
  "sentiment": "positive|neutral|negative",
  "additionalInfo": {
    "addressHint": "地址线索",
    "priceHint": "价格线索",
    "waitTime": "排队信息",
    "tips": "其他建议"
  }
}`;

/**
 * 使用Gemini CLI进行LLM提取
 */
function extractWithGemini(prompt) {
  try {
    // 使用gemini CLI的headless模式
    const result = execSync(
      `gemini -p ${JSON.stringify(prompt)} --approval-mode yolo 2>/dev/null`,
      { encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
    );
    return parseLLMResponse(result);
  } catch (e) {
    console.error('Gemini extraction failed:', e.message);
    return null;
  }
}

/**
 * 使用文件方式批量处理（推荐）
 * 生成prompt文件供用户批量提交给LLM
 */
function generateExtractionPrompts(posts, outputDir) {
  const promptsDir = path.join(outputDir, 'llm_prompts');
  fs.mkdirSync(promptsDir, { recursive: true });
  
  const batchPrompts = [];
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const content = cleanText(post.raw_data?.data?.note?.desc || '');
    
    if (!content || content.length < 10) continue;
    
    const prompt = RESTAURANT_EXTRACTION_PROMPT.replace('{{CONTENT}}', content);
    
    // 保存单个prompt
    fs.writeFileSync(
      path.join(promptsDir, `post_${post.id}_prompt.txt`),
      prompt
    );
    
    // 添加到批量处理
    batchPrompts.push({
      index: i + 1,
      postId: post.id,
      title: post.title,
      prompt: prompt
    });
  }
  
  // 生成批量处理文件
  generateBatchProcessingFile(batchPrompts, promptsDir);
  
  return batchPrompts.length;
}

/**
 * 生成批量处理指南
 */
function generateBatchProcessingFile(prompts, outputDir) {
  let content = '# LLM批量处理指南\n\n';
  content += '## 文件说明\n';
  content += `本目录包含 ${prompts.length} 个需要LLM处理的prompt文件。\n\n`;
  content += '## 处理方式\n\n';
  content += '### 方式1：使用Gemini CLI（需要API Key）\n';
  content += '```bash\n';
  content += 'for f in post_*_prompt.txt; do\n';
  content += '  echo "Processing $f..."\n';
  content += '  gemini -p "$(cat $f)" --approval-mode yolo > "${f%.txt}_result.json" 2>/dev/null\n';
  content += '  sleep 2\n';
  content += 'done\n';
  content += '```\n\n';
  content += '### 方式2：使用OpenClaw Chat\n';
  content += '1. 复制post_XXX_prompt.txt的内容\n';
  content += '2. 粘贴到OpenClaw Chat\n';
  content += '3. 保存回复到post_XXX_result.json\n\n';
  content += '### 方式3：使用其他LLM\n';
  content += '1. 打开 https://gemini.google.com 或其他LLM\n';
  content += '2. 复制prompt内容\n';
  content += '3. 粘贴并获取JSON回复\n';
  content += '4. 保存到对应的结果文件\n\n';
  content += '## Prompt清单\n\n';
  content += prompts.map(p => `- post_${p.postId}_prompt.txt: ${p.title}`).join('\n');
  content += '\n\n## 后续步骤\n\n';
  content += '所有结果保存后，运行：\n';
  content += '```bash\n';
  content += `node consolidate_llm_results.js ${outputDir}\n`;
  content += '```\n';

  fs.writeFileSync(path.join(outputDir, 'README.md'), content);
}

/**
 * 整合LLM结果到数据库
 */
function consolidateLLMResults(promptsDir, postsDir, outputFile) {
  const results = [];
  
  const resultFiles = fs.readdirSync(promptsDir).filter(f => f.endsWith('_result.json'));
  
  for (const file of resultFiles) {
    try {
      const content = fs.readFileSync(path.join(promptsDir, file), 'utf8');
      const postId = file.match(/post_(.+?)_result/)?.[1];
      
      // 尝试解析JSON
      let parsed;
      try {
        // 提取JSON部分（LLM可能在回复中包含markdown代码块）
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch (e) {
        console.error(`Failed to parse ${file}:`, e.message);
        continue;
      }
      
      // 加载原始帖子数据
      const postFile = path.join(postsDir, `${postId}.json`);
      let postData = {};
      if (fs.existsSync(postFile)) {
        postData = JSON.parse(fs.readFileSync(postFile, 'utf8'));
      }
      
      results.push({
        postId,
        title: postData.title,
        restaurants: parsed.restaurants || [],
        notes: parsed.notes,
        rawContent: postData.content || postData.raw_data?.data?.note?.desc
      });
    } catch (e) {
      console.error(`Error processing ${file}:`, e.message);
    }
  }
  
  // 保存整合结果
  const consolidated = {
    extractedAt: new Date().toISOString(),
    totalPosts: results.length,
    totalRestaurants: results.reduce((sum, r) => sum + r.restaurants.length, 0),
    results
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(consolidated, null, 2));
  console.log(`Consolidated ${results.length} posts into ${outputFile}`);
  
  return consolidated;
}

/**
 * 清理文本
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\[\w+R\]/g, '')
    .replace(/\[话题\]/g, '')
    .replace(/#[^\s#]+/g, '')
    .trim();
}

/**
 * 解析LLM响应
 */
function parseLLMResponse(response) {
  // 尝试提取JSON
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse LLM response as JSON');
  }
  return { raw: response };
}

/**
 * 主函数
 */
function main() {
  const command = process.argv[2];
  
  if (command === 'generate') {
    // 生成prompts
    const postsFile = process.argv[3] || path.join(OUTPUT_DIR, 'raw/post_fetch_summary.json');
    const posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')).success || [];
    
    const count = generateExtractionPrompts(posts, path.join(OUTPUT_DIR, 'llm_extraction'));
    console.log(`Generated ${count} LLM prompts in data/llm_extraction/`);
    console.log('See data/llm_extraction/README.md for processing instructions');
    
  } else if (command === 'consolidate') {
    // 整合结果
    const promptsDir = process.argv[3] || path.join(OUTPUT_DIR, 'llm_extraction/llm_prompts');
    const postsDir = process.argv[4] || path.join(OUTPUT_DIR, 'raw/post_details');
    const outputFile = process.argv[5] || path.join(OUTPUT_DIR, 'llm_extraction/extracted_restaurants.json');
    
    consolidateLLMResults(promptsDir, postsDir, outputFile);
    
  } else {
    console.log(`
Usage:
  node llm_extraction.js generate [posts_file]
    - Generate LLM prompts for restaurant extraction
    
  node llm_extraction.js consolidate [prompts_dir] [posts_dir] [output_file]
    - Consolidate LLM results into database format

Examples:
  node llm_extraction.js generate
  node llm_extraction.js consolidate
`);
  }
}

module.exports = {
  generateExtractionPrompts,
  consolidateLLMResults,
  RESTAURANT_EXTRACTION_PROMPT,
  COMMENT_EXTRACTION_PROMPT
};

if (require.main === module) {
  main();
}
