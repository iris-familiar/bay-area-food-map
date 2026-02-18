/**
 * Build comprehensive restaurant database v5 with full content extraction
 * Uses existing restaurant data + available post content
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';
const RAW_DIR = path.join(DATA_DIR, 'raw');

// Known restaurant mapping
const KNOWN_RESTAURANTS = {
  // Cupertino
  'apple green bistro': { name: 'Apple Green Bistro', nameEn: 'Apple Green Bistro', cuisine: '川菜', area: 'Cupertino', type: '中餐' },
  'cozy tea loft': { name: 'Cozy Tea Loft', nameEn: 'Cozy Tea Loft', cuisine: '台湾小吃', area: 'Cupertino', type: '台湾菜' },
  'marugame udon': { name: 'Marugame Udon', nameEn: 'Marugame Udon', cuisine: '日式乌冬', area: 'Cupertino', type: '日料/拉面' },
  'pacific catch': { name: 'Pacific Catch', nameEn: 'Pacific Catch', cuisine: '美式海鲜', area: 'Cupertino', type: '海鲜' },
  'one pot shabu shabu': { name: 'One Pot Shabu Shabu', nameEn: 'One Pot Shabu Shabu', cuisine: '火锅', area: 'Cupertino', type: '和牛火锅' },
  'tacos la murenita': { name: 'Tacos La Murenita', nameEn: 'Tacos La Murenita', cuisine: '墨西哥菜', area: 'Cupertino', type: '墨西哥菜' },
  'matcha town': { name: 'Matcha Town', nameEn: 'Matcha Town', cuisine: '抹茶甜品', area: 'Cupertino', type: '甜品' },
  'bon bon matcha': { name: 'Bon Bon Matcha', nameEn: 'Bon Bon Matcha', cuisine: '抹茶甜品', area: 'Cupertino', type: '甜品' },
  'naisnow': { name: '奈雪的茶', nameEn: 'Naisnow Tea & Bakery', cuisine: '奶茶/烘焙', area: 'Cupertino', type: '奶茶' },
  '奈雪': { name: '奈雪的茶', nameEn: 'Naisnow Tea & Bakery', cuisine: '奶茶/烘焙', area: 'Cupertino', type: '奶茶' },
  '京味轩': { name: '京味轩', nameEn: 'Jing Cuisine', cuisine: '北京菜', area: 'Cupertino', type: '中餐' },
  '湘粤情': { name: '湘粤情', nameEn: 'Jade Xiang Yue', cuisine: '湘菜+粤菜', area: 'Cupertino', type: '湘菜+粤菜/Hunan+Canton' },
  'xiang yue qing': { name: '湘粤情', nameEn: 'Jade Xiang Yue', cuisine: '湘菜+粤菜', area: 'Cupertino', type: '湘菜+粤菜/Hunan+Canton' },
  '外滩十八号': { name: '外滩十八号', nameEn: 'Bund Eighteen', cuisine: '上海菜', area: 'Cupertino', type: '上海菜' },
  'bund eighteen': { name: '外滩十八号', nameEn: 'Bund Eighteen', cuisine: '上海菜', area: 'Cupertino', type: '上海菜' },
  '四季生鲜': { name: '四季生鲜', nameEn: 'Four Seasons Seafood', cuisine: '海鲜', area: 'Cupertino', type: '海鲜' },
  'pings bistro': { name: 'Ping\'s Bistro', nameEn: 'Ping\'s Bistro', cuisine: '中餐', area: 'Cupertino', type: '中餐' },
  'ping\'s bistro': { name: 'Ping\'s Bistro', nameEn: 'Ping\'s Bistro', cuisine: '中餐', area: 'Cupertino', type: '中餐' },
  'tofu plus': { name: 'Tofu Plus', nameEn: 'Tofu Plus', cuisine: '韩式豆腐锅', area: 'Cupertino', type: '韩式豆腐锅' },
  '海底捞': { name: '海底捞', nameEn: 'Haidilao Hotpot', cuisine: '火锅', area: 'Cupertino', type: '火锅' },
  'haidilao': { name: '海底捞', nameEn: 'Haidilao Hotpot', cuisine: '火锅', area: 'Cupertino', type: '火锅' },
  '肖婆婆': { name: '肖婆婆砂锅', nameEn: 'XPP Claypot', cuisine: '川式砂锅', area: 'Cupertino', type: '川式砂锅/四川菜' },
  'xpp claypot': { name: '肖婆婆砂锅', nameEn: 'XPP Claypot', cuisine: '川式砂锅', area: 'Cupertino', type: '川式砂锅/四川菜' },
  '重庆铺盖面': { name: '重庆荣昌铺盖面', nameEn: 'C.Q. Taste', cuisine: '重庆面馆', area: 'Cupertino', type: '重庆面馆' },
  '荣昌铺盖面': { name: '重庆荣昌铺盖面', nameEn: 'C.Q. Taste', cuisine: '重庆面馆', area: 'Cupertino', type: '重庆面馆' },
  'cq taste': { name: '重庆荣昌铺盖面', nameEn: 'C.Q. Taste', cuisine: '重庆面馆', area: 'Cupertino', type: '重庆面馆' },
  'wooja': { name: 'Wooja 牛家韩国烤肉', nameEn: 'Wooja Korean BBQ', cuisine: '韩式烤肉', area: 'Cupertino', type: '韩式烤肉' },
  'wooga': { name: 'Wooga Korean BBQ', nameEn: 'Wooga Korean BBQ', cuisine: '韩式烤肉', area: 'Cupertino', type: '韩式烤肉' },
  
  // Milpitas
  '牛浪人': { name: '牛浪人', nameEn: 'Gyuniku Rider', cuisine: '和牛寿司自助', area: 'Milpitas', type: '日料/和牛寿司' },
  'gyuniku rider': { name: '牛浪人', nameEn: 'Gyuniku Rider', cuisine: '和牛寿司自助', area: 'Milpitas', type: '日料/和牛寿司' },
  '江南雅厨': { name: '江南雅厨', nameEn: 'Jiangnan Yachu', cuisine: '江浙菜', area: 'Milpitas', type: '江浙菜' },
  
  // Mountain View
  '包大人': { name: '包大人', nameEn: 'Bao Da Ren', cuisine: '包子/中餐', area: 'Mountain View', type: '中餐/早点' },
  '花溪王': { name: '花溪王', nameEn: 'Huaxi Wang', cuisine: '米粉/贵州菜', area: 'Mountain View', type: '贵州菜' },
  
  // From existing database
  '香锅大王': { name: '香锅大王', nameEn: 'Sizzling Pot King', cuisine: '湖南菜/麻辣香锅', area: '旧金山', type: '湖南菜/麻辣香锅' },
  '留湘': { name: '留湘', nameEn: 'Ping\'s Bistro 留湘', cuisine: '湖南菜', area: 'San Mateo', type: '湖南菜' },
  '千年耕': { name: '千年耕', nameEn: 'Farmhouse Kitchen', cuisine: '泰国菜', area: 'San Francisco', type: '泰国菜' },
};

// Clean emoji codes and tags from text
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\[\w+R\]/g, '')
    .replace(/\[话题\]/g, '')
    .replace(/#[^\s#]+/g, '')
    .replace(/\n/g, ' ')
    .trim();
}

// Extract restaurant mentions from text
function extractRestaurantMentions(text, source = 'content') {
  const mentions = [];
  if (!text) return mentions;
  
  const cleanedText = cleanText(text);
  const lowerText = cleanedText.toLowerCase();
  
  // Check against known restaurants
  for (const [key, restaurant] of Object.entries(KNOWN_RESTAURANTS)) {
    if (lowerText.includes(key.toLowerCase())) {
      const index = lowerText.indexOf(key.toLowerCase());
      const start = Math.max(0, index - 50);
      const end = Math.min(cleanedText.length, index + key.length + 50);
      const context = cleanedText.slice(start, end).trim();
      
      const exists = mentions.some(m => m.name === restaurant.name);
      if (!exists) {
        mentions.push({
          name: restaurant.name,
          nameEn: restaurant.nameEn,
          confidence: 0.95,
          context: context,
          source: source,
          matchedKeyword: key,
          cuisine: restaurant.cuisine,
          area: restaurant.area,
          type: restaurant.type
        });
      }
    }
  }
  
  return mentions;
}

// Analyze sentiment of text
function analyzeSentiment(text) {
  if (!text) return 'neutral';
  
  const cleanedText = cleanText(text).toLowerCase();
  const positiveWords = ['好吃', '推荐', '喜欢', '爱', '赞', '惊艳', '棒', '正宗', '不错', '满意', '完美', '绝了', 'yyds', '封神', '必吃', 'delicious', 'amazing', 'love', 'great', 'awesome', 'perfect', 'best', 'yummy', 'tasty', 'good'];
  const negativeWords = ['避雷', '踩雷', '难吃', '失望', '坑', '别去', '劝退', '糟糕', '不值', '一般', 'bad', 'terrible', 'awful', 'worst', 'disappointing', 'avoid'];
  
  let positive = 0;
  let negative = 0;
  
  for (const word of positiveWords) {
    if (cleanedText.includes(word.toLowerCase())) positive++;
  }
  for (const word of negativeWords) {
    if (cleanedText.includes(word.toLowerCase())) negative++;
  }
  
  if (positive > negative) return 'positive';
  if (negative > positive) return 'negative';
  return 'neutral';
}

// Process post data
function processPost(post) {
  const rawData = post.raw_data;
  if (!rawData?.data?.note) return null;
  
  const note = rawData.data.note;
  const comments = rawData.data.comments?.list || [];
  
  const contentMentions = extractRestaurantMentions(note.desc, 'post_content');
  
  const processedComments = comments.map(comment => ({
    postId: note.noteId,
    commentId: comment.id,
    content: cleanText(comment.content),
    author: comment.userInfo?.nickname || 'Anonymous',
    authorId: comment.userInfo?.userId,
    publishTime: comment.createTime ? new Date(comment.createTime).toISOString() : null,
    likedCount: parseInt(comment.likeCount) || 0,
    restaurants_mentioned: extractRestaurantMentions(comment.content, 'comment').map(m => m.name),
    sentiment: analyzeSentiment(comment.content),
    replies: (comment.subComments || []).map(reply => ({
      replyId: reply.id,
      content: cleanText(reply.content),
      author: reply.userInfo?.nickname,
      isAuthor: reply.showTags?.includes('is_author')
    }))
  }));
  
  const commentMentions = [];
  for (const c of processedComments) {
    for (const name of c.restaurants_mentioned) {
      const existing = contentMentions.find(m => m.name === name);
      if (!existing) {
        commentMentions.push({
          name,
          confidence: 0.7,
          context: c.content?.slice(0, 100) || '',
          source: 'comment',
          sentiment: c.sentiment
        });
      }
    }
  }
  
  return {
    id: note.noteId,
    title: cleanText(note.title),
    content: cleanText(note.desc),
    publishTime: note.time ? new Date(note.time).toISOString() : null,
    author: {
      userId: note.user?.userId,
      nickname: note.user?.nickname
    },
    interaction: {
      likedCount: parseInt(note.interactInfo?.likedCount) || 0,
      sharedCount: parseInt(note.interactInfo?.sharedCount) || 0,
      commentCount: parseInt(note.interactInfo?.commentCount) || comments.length,
      collectedCount: parseInt(note.interactInfo?.collectedCount) || 0
    },
    restaurants_mentioned: [...contentMentions, ...commentMentions],
    comments: processedComments,
    commentCount: comments.length
  };
}

// Build restaurant database from existing data + new posts
function buildDatabase() {
  console.log('Building restaurant database v5...\n');
  
  // Load existing database
  const existingDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'current/restaurant_database.json'), 'utf8'));
  console.log(`Loaded ${existingDb.restaurants?.length || 0} existing restaurants`);
  
  // Load posts with full content
  const summaryFile = path.join(RAW_DIR, 'post_fetch_summary.json');
  let processedPosts = [];
  let allComments = [];
  
  if (fs.existsSync(summaryFile)) {
    const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    const postsWithContent = (summary.success || []).filter(p => p.raw_data?.data?.note?.desc);
    console.log(`Found ${postsWithContent.length} posts with full content`);
    
    for (const post of postsWithContent) {
      const processed = processPost(post);
      if (processed) {
        processedPosts.push(processed);
        allComments.push(...processed.comments);
      }
    }
  }
  
  console.log(`Processed ${processedPosts.length} posts`);
  console.log(`Extracted ${allComments.length} comments`);
  
  // Build restaurant database with mentions
  const restaurantMap = new Map();
  
  // Start with existing restaurants
  for (const r of (existingDb.restaurants || [])) {
    restaurantMap.set(r.name, {
      ...r,
      mentions: [],
      mentionCount: 0,
      postIds: [],
      commentContexts: [],
      sentiments: { positive: 0, neutral: 0, negative: 0 }
    });
  }
  
  // Add mentions from processed posts
  for (const post of processedPosts) {
    for (const mention of post.restaurants_mentioned) {
      let restaurant = restaurantMap.get(mention.name);
      
      if (!restaurant) {
        // Create new restaurant entry
        restaurant = {
          id: `r${String(restaurantMap.size + 1).padStart(3, '0')}`,
          name: mention.name,
          nameEn: mention.nameEn || mention.name,
          type: mention.type || '未知',
          cuisine: mention.cuisine || '未知',
          area: mention.area || '湾区',
          location: mention.area || 'Bay Area',
          status: 'candidate',
          verified: false,
          mentions: [],
          mentionCount: 0,
          postIds: [],
          commentContexts: [],
          sentiments: { positive: 0, neutral: 0, negative: 0 }
        };
        restaurantMap.set(mention.name, restaurant);
      }
      
      // Add mention
      restaurant.mentionCount++;
      if (!restaurant.postIds.includes(post.id)) {
        restaurant.postIds.push(post.id);
      }
      restaurant.commentContexts.push(mention.context);
      
      // Track sentiment
      const sentiment = mention.sentiment || analyzeSentiment(mention.context);
      restaurant.sentiments[sentiment]++;
      
      restaurant.mentions.push({
        postId: post.id,
        postTitle: post.title,
        context: mention.context,
        source: mention.source,
        confidence: mention.confidence,
        sentiment
      });
    }
  }
  
  // Convert to array and calculate final scores
  const restaurants = Array.from(restaurantMap.values()).map(r => {
    const totalSentiment = r.sentiments.positive + r.sentiments.neutral + r.sentiments.negative || 1;
    const sentimentScore = (r.sentiments.positive * 1 + r.sentiments.neutral * 0.5) / totalSentiment;
    
    return {
      ...r,
      metrics: {
        ...r.metrics,
        mention_count: r.mentionCount,
        posts_mentioned: r.postIds.length,
        sentiment_analysis: {
          overall: sentimentScore > 0.7 ? 'positive' : sentimentScore < 0.4 ? 'negative' : 'neutral',
          score: sentimentScore,
          positive_mentions: r.sentiments.positive,
          neutral_mentions: r.sentiments.neutral,
          negative_mentions: r.sentiments.negative,
          contexts: r.commentContexts.slice(0, 5) // Keep top 5 contexts
        }
      }
    };
  });
  
  // Sort by mention count
  restaurants.sort((a, b) => b.mentionCount - a.mentionCount);
  
  // Create database
  const timestamp = new Date().toISOString().split('T')[0];
  const database = {
    version: '5.0-full-content',
    updated_at: timestamp,
    data_source: {
      total_posts_analyzed: processedPosts.length,
      total_comments_analyzed: allComments.length,
      posts_with_full_content: processedPosts.length,
      posts_needing_fetch: 82 - processedPosts.length
    },
    statistics: {
      total_restaurants: restaurants.length,
      verified: restaurants.filter(r => r.verified).length,
      candidates: restaurants.filter(r => r.status === 'candidate').length,
      cuisines: [...new Set(restaurants.map(r => r.cuisine).filter(Boolean))],
      areas: [...new Set(restaurants.map(r => r.area).filter(Boolean))]
    },
    restaurants
  };
  
  // Save database
  fs.writeFileSync(
    path.join(DATA_DIR, 'current', 'restaurant_database_v5_full_content.json'),
    JSON.stringify(database, null, 2)
  );
  
  // Save posts
  const postsDir = path.join(DATA_DIR, 'posts', timestamp);
  fs.mkdirSync(postsDir, { recursive: true });
  
  for (const post of processedPosts) {
    fs.writeFileSync(
      path.join(postsDir, `${post.id}.json`),
      JSON.stringify(post, null, 2)
    );
  }
  
  fs.writeFileSync(
    path.join(DATA_DIR, 'posts', `posts_${timestamp}_full.json`),
    JSON.stringify({ posts: processedPosts, count: processedPosts.length }, null, 2)
  );
  
  // Save comments
  const commentsDir = path.join(DATA_DIR, 'comments', timestamp);
  fs.mkdirSync(commentsDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(commentsDir, `comments_${timestamp}_full.json`),
    JSON.stringify({ comments: allComments, count: allComments.length }, null, 2)
  );
  
  // Generate report
  const report = {
    timestamp,
    summary: {
      totalRestaurants: restaurants.length,
      verifiedRestaurants: restaurants.filter(r => r.verified).length,
      candidateRestaurants: restaurants.filter(r => r.status === 'candidate').length,
      postsAnalyzed: processedPosts.length,
      postsNeedingFetch: 82 - processedPosts.length,
      totalComments: allComments.length
    },
    topRestaurants: restaurants.slice(0, 20).map(r => ({
      name: r.name,
      mentionCount: r.mentionCount,
      postsMentioned: r.postIds.length,
      sentiment: r.metrics.sentiment_analysis.overall,
      verified: r.verified
    })),
    postsWithContent: processedPosts.map(p => ({
      id: p.id,
      title: p.title,
      restaurantsMentioned: p.restaurants_mentioned.length,
      commentCount: p.commentCount
    })),
    postsNeedingFetch: 82 - processedPosts.length,
    notes: [
      'Only 3 posts have full content due to expired xsecTokens',
      '79 posts need to be re-fetched with fresh tokens',
      'Existing restaurant database preserved and enhanced with mention data'
    ]
  };
  
  fs.writeFileSync(
    path.join(DATA_DIR, `rebuild_report_${timestamp}.json`),
    JSON.stringify(report, null, 2)
  );
  
  // Print summary
  console.log('\n=== Database v5 Build Complete ===');
  console.log(`Total Restaurants: ${report.summary.totalRestaurants}`);
  console.log(`Verified: ${report.summary.verifiedRestaurants}`);
  console.log(`Candidates: ${report.summary.candidateRestaurants}`);
  console.log(`\nPosts Analyzed: ${report.summary.postsAnalyzed}/82`);
  console.log(`Posts Needing Fetch: ${report.summary.postsNeedingFetch}`);
  console.log(`Total Comments: ${report.summary.totalComments}`);
  console.log('\nTop 10 Restaurants by Mentions:');
  report.topRestaurants.slice(0, 10).forEach((r, i) => {
    const status = r.verified ? '✓' : '○';
    console.log(`  ${status} ${i+1}. ${r.name} (${r.mentionCount} mentions)`);
  });
  
  console.log('\nFiles created:');
  console.log(`  - data/current/restaurant_database_v5_full_content.json`);
  console.log(`  - data/posts/${timestamp}/ (individual post files)`);
  console.log(`  - data/posts/posts_${timestamp}_full.json`);
  console.log(`  - data/comments/${timestamp}/comments_${timestamp}_full.json`);
  console.log(`  - data/rebuild_report_${timestamp}.json`);
  
  return { database, report, processedPosts, allComments };
}

// Run
buildDatabase();
