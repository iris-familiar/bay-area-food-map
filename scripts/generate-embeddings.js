#!/usr/bin/env node
/**
 * 预计算餐厅 Embedding
 * 使用 Gemini embedding-001 模型
 */

const fs = require('fs');
const path = require('path');

// 读取 API Key
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const API_KEY = envContent.match(/GEMINI_API_KEY=(.+)/)?.[1]?.trim();

if (!API_KEY) {
    console.error('❌ 未找到 GEMINI_API_KEY');
    process.exit(1);
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

// 读取餐厅数据
const dataPath = path.join(__dirname, '..', 'data/current/restaurant_database.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// 生成餐厅描述文本（用于embedding）
function generateDescription(r) {
    const parts = [
        `餐厅名称: ${r.name}`,
        r.name_en ? `英文名: ${r.name_en}` : '',
        `菜系: ${r.type}`,
        r.cuisine ? `细分: ${r.cuisine}` : '',
        `位置: ${r.area || r.location || '未知'}`,
        `价格: ${r.price_range || '未知'}`,
    ];
    
    // 添加semantic tags
    if (r.semantic_tags) {
        if (r.semantic_tags.scenes?.length) {
            parts.push(`场景: ${r.semantic_tags.scenes.join(', ')}`);
        }
        if (r.semantic_tags.vibes?.length) {
            parts.push(`氛围: ${r.semantic_tags.vibes.join(', ')}`);
        }
        if (r.semantic_tags.practical?.length) {
            parts.push(`特点: ${r.semantic_tags.practical.join(', ')}`);
        }
    }
    
    // 添加推荐菜品
    if (r.recommendations?.length) {
        parts.push(`推荐: ${r.recommendations.join(', ')}`);
    }
    
    // 添加亮点
    if (r.highlights?.length) {
        parts.push(`亮点: ${r.highlights.join(', ')}`);
    }
    
    return parts.filter(Boolean).join('\n');
}

// 调用 Gemini API 获取 embedding
async function getEmbedding(text) {
    const response = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            content: {
                parts: [{ text }]
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error: ${response.status} - ${error}`);
    }
    
    const result = await response.json();
    return result.embedding.values;
}

// 计算余弦相似度
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 主流程
async function main() {
    console.log('🍽️  开始预计算餐厅 Embedding...\n');
    
    const restaurants = data.restaurants;
    const total = restaurants.length;
    
    // 预定义查询（常见场景）
    const predefinedQueries = [
        { id: 'date', text: '约会餐厅 浪漫晚餐 情侣', labels: ['约会', '浪漫', 'date'] },
        { id: 'group', text: '聚餐 朋友聚会 团体用餐', labels: ['聚餐', '聚会', 'group'] },
        { id: 'family', text: '家庭聚餐 带孩子 亲子餐厅', labels: ['家庭', '带孩子', 'family'] },
        { id: 'business', text: '商务宴请 工作聚餐 正式场合', labels: ['商务', '宴请', 'business'] },
        { id: 'cheap', text: '便宜 性价比高 实惠', labels: ['便宜', '性价比', 'cheap'] },
        { id: 'quiet', text: '安静 环境好 私密', labels: ['安静', '私密', 'quiet'] },
        { id: 'lively', text: '热闹 氛围好 烟火气', labels: ['热闹', '烟火气', 'lively'] },
        { id: 'spicy', text: '辣 麻辣 重口味', labels: ['辣', '麻辣', 'spicy'] },
        { id: 'parking', text: '好停车 停车位充足', labels: ['停车', 'parking'] },
        { id: 'authentic', text: '正宗 地道 家乡味', labels: ['正宗', '地道', 'authentic'] },
    ];
    
    // 1. 计算餐厅 embedding
    console.log('📍 Step 1: 计算餐厅 embedding...');
    for (let i = 0; i < restaurants.length; i++) {
        const r = restaurants[i];
        const description = generateDescription(r);
        
        try {
            const embedding = await getEmbedding(description);
            r.embedding = embedding;
            console.log(`  ✅ [${i + 1}/${total}] ${r.name}`);
            
            // 每5个休息1秒，避免限流
            if ((i + 1) % 5 === 0 && i < total - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (err) {
            console.error(`  ❌ [${i + 1}/${total}] ${r.name}: ${err.message}`);
        }
    }
    
    // 2. 计算预定义查询的 embedding
    console.log('\n🔍 Step 2: 计算预定义查询 embedding...');
    const queryEmbeddings = {};
    
    for (const query of predefinedQueries) {
        try {
            const embedding = await getEmbedding(query.text);
            queryEmbeddings[query.id] = {
                embedding,
                labels: query.labels
            };
            console.log(`  ✅ ${query.labels[0]} (${query.id})`);
            await new Promise(r => setTimeout(r, 200));
        } catch (err) {
            console.error(`  ❌ ${query.id}: ${err.message}`);
        }
    }
    
    // 3. 为每个查询预计算最匹配的餐厅（排序）
    console.log('\n📊 Step 3: 预计算查询匹配结果...');
    const queryMatches = {};
    
    for (const [queryId, queryData] of Object.entries(queryEmbeddings)) {
        const matches = restaurants
            .filter(r => r.embedding)
            .map(r => ({
                id: r.id,
                name: r.name,
                similarity: cosineSimilarity(queryData.embedding, r.embedding)
            }))
            .sort((a, b) => b.similarity - a.similarity);
        
        queryMatches[queryId] = matches;
        console.log(`  ✅ ${queryId}: ${matches.slice(0, 3).map(m => m.name).join(', ')}...`);
    }
    
    // 4. 保存结果
    console.log('\n💾 Step 4: 保存结果...');
    
    // 更新原始数据（包含embedding）
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log(`  ✅ 已更新: ${dataPath}`);
    
    // 保存查询embedding和匹配结果（供前端使用）
    const vectorData = {
        version: '1.0-vector',
        updated_at: new Date().toISOString().split('T')[0],
        query_embeddings: queryEmbeddings,
        query_matches: queryMatches,
        restaurant_count: restaurants.filter(r => r.embedding).length
    };
    
    const vectorPath = path.join(__dirname, '..', 'data/current/vector_search.json');
    fs.writeFileSync(vectorPath, JSON.stringify(vectorData, null, 2));
    console.log(`  ✅ 已创建: ${vectorPath}`);
    
    console.log('\n✨ 完成！');
    console.log(`   餐厅 embedding: ${restaurants.filter(r => r.embedding).length}/${total}`);
    console.log(`   预定义查询: ${Object.keys(queryEmbeddings).length}个`);
}

main().catch(console.error);
