/**
 * 使用LLM提取结果更新餐厅数据库
 * 将LLM提取的餐厅信息整合到主数据库中
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';

function main() {
  // Load LLM extraction results
  const llmResults = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'llm_extraction/extracted_restaurants.json'), 'utf8')
  );
  
  // Load existing database
  const existingDb = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'current/restaurant_database.json'), 'utf8')
  );
  
  // Create restaurant map from existing database
  const restaurantMap = new Map();
  for (const r of (existingDb.restaurants || [])) {
    restaurantMap.set(r.name, { ...r, llmMentions: [] });
  }
  
  // Process LLM results
  let totalNewMentions = 0;
  
  for (const postResult of llmResults.results) {
    console.log(`Processing post: ${postResult.title}`);
    
    for (const restaurant of postResult.restaurants) {
      const name = restaurant.name;
      
      if (!restaurantMap.has(name)) {
        // Create new restaurant entry
        restaurantMap.set(name, {
          id: `r${String(restaurantMap.size + 1).padStart(3, '0')}`,
          name: name,
          nameEn: restaurant.nameEn || name,
          type: restaurant.dishes?.[0] ? '中餐' : '待分类',
          cuisine: '待确认',
          area: restaurant.address?.city || '湾区',
          location: restaurant.address?.city || 'Bay Area',
          status: 'candidate',
          verified: false,
          price_range: restaurant.priceHint || '$$',
          llmMentions: [],
          metrics: {
            mention_count: 0,
            posts_mentioned: 0,
            sentiment_analysis: {
              overall: restaurant.sentiment,
              score: restaurant.sentiment === 'positive' ? 0.8 : restaurant.sentiment === 'negative' ? 0.2 : 0.5,
              positive_mentions: restaurant.sentiment === 'positive' ? 1 : 0,
              neutral_mentions: restaurant.sentiment === 'neutral' ? 1 : 0,
              negative_mentions: restaurant.sentiment === 'negative' ? 1 : 0,
              contexts: []
            }
          }
        });
      }
      
      const entry = restaurantMap.get(name);
      
      // Add LLM mention
      entry.llmMentions.push({
        postId: postResult.postId,
        postTitle: postResult.title,
        confidence: restaurant.confidence,
        context: restaurant.context,
        sentiment: restaurant.sentiment,
        dishes: restaurant.dishes,
        address: restaurant.address,
        priceHint: restaurant.priceHint,
        notes: postResult.notes
      });
      
      // Update metrics
      entry.metrics.mention_count++;
      entry.metrics.posts_mentioned = entry.llmMentions.length;
      if (!entry.metrics.sentiment_analysis) {
        entry.metrics.sentiment_analysis = { contexts: [] };
      }
      if (!entry.metrics.sentiment_analysis.contexts) {
        entry.metrics.sentiment_analysis.contexts = [];
      }
      entry.metrics.sentiment_analysis.contexts.push(restaurant.context);
      
      totalNewMentions++;
    }
  }
  
  // Convert to array and calculate final scores
  const restaurants = Array.from(restaurantMap.values()).map(r => {
    const sentiments = r.llmMentions?.map(m => m.sentiment) || [];
    const positive = sentiments.filter(s => s === 'positive').length;
    const neutral = sentiments.filter(s => s === 'neutral').length;
    const negative = sentiments.filter(s => s === 'negative').length;
    const total = sentiments.length || 1;
    
    return {
      ...r,
      metrics: {
        ...r.metrics,
        llm_extracted: true,
        llm_mention_count: r.llmMentions?.length || 0,
        sentiment_analysis: {
          overall: positive > negative ? 'positive' : negative > positive ? 'negative' : 'neutral',
          score: (positive * 1 + neutral * 0.5) / total,
          positive_mentions: positive,
          neutral_mentions: neutral,
          negative_mentions: negative,
          contexts: r.metrics?.sentiment_analysis?.contexts?.slice(0, 5) || []
        }
      }
    };
  });
  
  // Sort by mention count
  restaurants.sort((a, b) => (b.metrics?.mention_count || 0) - (a.metrics?.mention_count || 0));
  
  // Create updated database
  const timestamp = new Date().toISOString().split('T')[0];
  const database = {
    version: '5.1-llm-extracted',
    updated_at: timestamp,
    data_source: {
      extraction_method: 'LLM (Gemini)',
      total_posts_analyzed: llmResults.totalPosts,
      total_restaurants_extracted: llmResults.totalRestaurants,
      extraction_confidence: 'high (0.9-0.98)'
    },
    statistics: {
      total_restaurants: restaurants.length,
      verified: restaurants.filter(r => r.verified).length,
      candidates: restaurants.filter(r => r.status === 'candidate').length,
      llm_extracted: restaurants.filter(r => r.metrics?.llm_extracted).length,
      cuisines: [...new Set(restaurants.map(r => r.cuisine).filter(Boolean))],
      areas: [...new Set(restaurants.map(r => r.area).filter(Boolean))]
    },
    restaurants
  };
  
  // Save database
  fs.writeFileSync(
    path.join(DATA_DIR, 'current', 'restaurant_database_v5_llm_extracted.json'),
    JSON.stringify(database, null, 2)
  );
  
  // Generate report
  const report = {
    timestamp,
    summary: {
      totalRestaurants: restaurants.length,
      existingRestaurants: existingDb.restaurants?.length || 0,
      llmExtractedMentions: totalNewMentions,
      postsAnalyzed: llmResults.totalPosts,
      extractionMethod: 'LLM (Gemini)'
    },
    llmStats: {
      averageConfidence: llmResults.results.flatMap(r => r.restaurants).reduce((sum, r) => sum + r.confidence, 0) / llmResults.totalRestaurants,
      sentimentDistribution: {
        positive: llmResults.results.flatMap(r => r.restaurants).filter(r => r.sentiment === 'positive').length,
        neutral: llmResults.results.flatMap(r => r.restaurants).filter(r => r.sentiment === 'neutral').length,
        negative: llmResults.results.flatMap(r => r.restaurants).filter(r => r.sentiment === 'negative').length
      }
    },
    topRestaurants: restaurants
      .filter(r => r.metrics?.llm_extracted)
      .slice(0, 20)
      .map(r => ({
        name: r.name,
        mentionCount: r.metrics?.mention_count || 0,
        sentiment: r.metrics?.sentiment_analysis?.overall,
        dishes: r.llmMentions?.[0]?.dishes || [],
        confidence: r.llmMentions?.[0]?.confidence
      }))
  };
  
  fs.writeFileSync(
    path.join(DATA_DIR, 'llm_extraction', `llm_report_${timestamp}.json`),
    JSON.stringify(report, null, 2)
  );
  
  // Print summary
  console.log('\n=== LLM Extraction Update Complete ===');
  console.log(`Total Restaurants: ${report.summary.totalRestaurants}`);
  console.log(`LLM Mentions Added: ${report.summary.llmExtractedMentions}`);
  console.log(`Posts Analyzed: ${report.summary.postsAnalyzed}`);
  console.log(`\nSentiment Distribution:`);
  console.log(`  Positive: ${report.llmStats.sentimentDistribution.positive}`);
  console.log(`  Neutral: ${report.llmStats.sentimentDistribution.neutral}`);
  console.log(`  Negative: ${report.llmStats.sentimentDistribution.negative}`);
  console.log(`\nAverage Confidence: ${(report.llmStats.averageConfidence * 100).toFixed(1)}%`);
  console.log('\nTop 10 LLM Extracted Restaurants:');
  report.topRestaurants.slice(0, 10).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.name} (${r.mentionCount} mentions, ${r.sentiment}, confidence: ${r.confidence})`);
  });
  
  console.log('\nFiles created:');
  console.log(`  - data/current/restaurant_database_v5_llm_extracted.json`);
  console.log(`  - data/llm_extraction/llm_report_${timestamp}.json`);
  
  return { database, report };
}

main();
