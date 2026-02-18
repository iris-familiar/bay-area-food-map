/**
 * Phase 1: Extract restaurants from post content and comments
 * Processes all 82 posts to extract restaurant mentions
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/post_details';
const OUTPUT_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data';

// Known restaurant mapping for exact matching
const KNOWN_RESTAURANTS = {
  // English names
  'apple green bistro': { name: 'Apple Green Bistro', cuisine: '中餐', area: 'Cupertino' },
  'cozy tea loft': { name: 'Cozy Tea Loft', cuisine: '台湾小吃', area: 'Cupertino' },
  'marugame udon': { name: 'Marugame Udon', cuisine: '日式乌冬', area: 'Cupertino' },
  'marugame': { name: 'Marugame Udon', cuisine: '日式乌冬', area: 'Cupertino' },
  'pacific catch': { name: 'Pacific Catch', cuisine: '美式海鲜', area: 'Cupertino' },
  'one pot shabu shabu': { name: 'One Pot Shabu Shabu', cuisine: '火锅', area: 'Cupertino' },
  'one pot': { name: 'One Pot Shabu Shabu', cuisine: '火锅', area: 'Cupertino' },
  'tacos la murenita': { name: 'Tacos La Murenita', cuisine: '墨西哥菜', area: 'Cupertino' },
  'matcha town': { name: 'Matcha Town', cuisine: '抹茶甜品', area: 'Cupertino' },
  'naisnow': { name: '奈雪的茶', cuisine: '奶茶/烘焙', area: 'Cupertino' },
  'jing weixuan': { name: '京味轩', cuisine: '北京菜', area: 'Cupertino' },
  'xiang yue qing': { name: '湘粤情 Jade Xiang Yue', cuisine: '湘菜+粤菜', area: 'Cupertino' },
  'bund eighteen': { name: '外滩十八号', cuisine: '上海菜', area: 'Cupertino' },
  'pings bistro': { name: "Ping's Bistro", cuisine: '中餐', area: 'Cupertino' },
  'ping\'s bistro': { name: "Ping's Bistro", cuisine: '中餐', area: 'Cupertino' },
  'tofu plus': { name: 'Tofu Plus', cuisine: '韩式豆腐锅', area: 'Cupertino' },
  'haidilao': { name: '海底捞 Haidilao', cuisine: '火锅', area: 'Cupertino' },
  'gyuniku rider': { name: '牛浪人 Gyuniku Rider', cuisine: '和牛寿司自助', area: 'Milpitas' },
  'bon bon matcha': { name: 'Bon Bon Matcha', cuisine: '抹茶甜品', area: 'Cupertino' },
  'cq taste': { name: '重庆荣昌铺盖面 C.Q. Taste', cuisine: '重庆面馆', area: 'Cupertino' },
  'xpp claypot': { name: '肖婆婆砂锅 XPP Claypot', cuisine: '川式砂锅', area: 'Cupertino' },
  
  // Chinese names
  '奈雪': { name: '奈雪的茶', cuisine: '奶茶/烘焙', area: 'Cupertino' },
  '京味轩': { name: '京味轩', cuisine: '北京菜', area: 'Cupertino' },
  '湘粤情': { name: '湘粤情 Jade Xiang Yue', cuisine: '湘菜+粤菜', area: 'Cupertino' },
  '外滩十八号': { name: '外滩十八号', cuisine: '上海菜', area: 'Cupertino' },
  '四季生鲜': { name: '四季生鲜', cuisine: '海鲜', area: 'Cupertino' },
  '海底捞': { name: '海底捞 Haidilao', cuisine: '火锅', area: 'Cupertino' },
  '牛浪人': { name: '牛浪人 Gyuniku Rider', cuisine: '和牛寿司自助', area: 'Milpitas' },
  '江南雅厨': { name: '江南雅厨', cuisine: '江浙菜', area: 'Milpitas' },
  '包大人': { name: '包大人', cuisine: '包子/中餐', area: 'Mountain View' },
  '花溪王': { name: '花溪王', cuisine: '米粉/贵州菜', area: 'Mountain View' },
  '肖婆婆': { name: '肖婆婆砂锅 XPP Claypot', cuisine: '川式砂锅', area: 'Cupertino' },
  '重庆铺盖面': { name: '重庆荣昌铺盖面 C.Q. Taste', cuisine: '重庆面馆', area: 'Cupertino' },
  '荣昌铺盖面': { name: '重庆荣昌铺盖面 C.Q. Taste', cuisine: '重庆面馆', area: 'Cupertino' },
  'wooja': { name: 'Wooja 牛家韩国烤肉', cuisine: '韩式烤肉', area: 'Cupertino' },
  'wooga': { name: 'Wooga Korean BBQ', cuisine: '韩式烤肉', area: 'Cupertino' },
};

// Filter out emoji codes and tags
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\[\w+R\]/g, '') // Remove [emojiR] codes
    .replace(/\[话题\]/g, '') // Remove [话题]
    .replace(/#[^\s#]+/g, '') // Remove hashtags
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .trim();
}

function loadAllPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.json'));
  const posts = [];
  
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
      posts.push(data);
    } catch (e) {
      console.error(`Error loading ${file}:`, e.message);
    }
  }
  
  return posts;
}

function extractRestaurantMentions(text, source = 'content') {
  const mentions = [];
  if (!text) return mentions;
  
  const cleanedText = cleanText(text);
  const lowerText = cleanedText.toLowerCase();
  
  // Check against known restaurants
  for (const [key, restaurant] of Object.entries(KNOWN_RESTAURANTS)) {
    if (lowerText.includes(key.toLowerCase())) {
      // Find context around the mention
      const index = lowerText.indexOf(key.toLowerCase());
      const start = Math.max(0, index - 40);
      const end = Math.min(cleanedText.length, index + key.length + 40);
      const context = cleanedText.slice(start, end).trim();
      
      // Skip if already found
      const exists = mentions.some(m => m.name === restaurant.name);
      if (!exists) {
        mentions.push({
          name: restaurant.name,
          confidence: 0.95,
          context: context,
          source: source,
          matchedKeyword: key,
          cuisine: restaurant.cuisine,
          area: restaurant.area
        });
      }
    }
  }
  
  // Extract additional potential restaurant names
  // Pattern: English capitalized names (2-4 words)
  const englishPattern = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})\b/g;
  const matches = cleanedText.matchAll(englishPattern);
  
  for (const match of matches) {
    const name = match[1].trim();
    // Filter out common non-restaurant words
    const skipWords = ['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'My', 'Your', 'His', 'Her', 'Its', 'Our', 'Their', 'I', 'You', 'He', 'She', 'It', 'We', 'They', 'What', 'Which', 'Who', 'When', 'Where', 'Why', 'How', 'All', 'Any', 'Both', 'Each', 'Few', 'More', 'Most', 'Other', 'Some', 'Such', 'No', 'Nor', 'Not', 'Only', 'Own', 'Same', 'So', 'Than', 'Too', 'Very', 'Just', 'But', 'If', 'Or', 'Because', 'As', 'Until', 'While', 'Of', 'At', 'By', 'For', 'With', 'Through', 'During', 'Before', 'After', 'Above', 'Below', 'Up', 'Down', 'In', 'Out', 'On', 'Off', 'Over', 'Under', 'Again', 'Further', 'Then', 'Once', 'Here', 'There', 'Everywhere', 'Anywhere', 'Somewhere', 'Bay', 'Area', 'Cupertino', 'Milpitas', 'Fremont', 'Sunnyvale', 'Mountain', 'View', 'San', 'Jose', 'Francisco', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (name.length > 2 && name.length < 40 && !skipWords.includes(name)) {
      // Check if not already found
      const alreadyFound = mentions.some(m => 
        m.name.toLowerCase() === name.toLowerCase() ||
        name.toLowerCase().includes(m.name.toLowerCase()) ||
        m.name.toLowerCase().includes(name.toLowerCase())
      );
      
      if (!alreadyFound) {
        const index = match.index || 0;
        const start = Math.max(0, index - 30);
        const end = Math.min(cleanedText.length, index + name.length + 30);
        const context = cleanedText.slice(start, end).trim();
        
        mentions.push({
          name: name,
          confidence: 0.5,
          context: context,
          source: source,
          matchedKeyword: name
        });
      }
    }
  }
  
  return mentions;
}

function analyzeSentiment(text) {
  if (!text) return 'neutral';
  
  const cleanedText = cleanText(text);
  const positiveWords = ['好吃', '推荐', '喜欢', '爱', '赞', '惊艳', '棒', '正宗', '不错', '满意', '完美', '绝了', 'yyds', '封神', '必吃', ' delicious', 'amazing', 'love', 'great', 'awesome', 'perfect', 'best', 'yummy', 'tasty', 'good', 'wonderful', 'excellent', 'favorite'];
  const negativeWords = ['避雷', '踩雷', '难吃', '失望', '坑', '别去', '劝退', '糟糕', '不值', '一般', '难吃', 'bad', 'terrible', 'awful', 'worst', 'disappointing', 'gross', 'disgusting', 'avoid', 'never'];
  
  const lowerText = cleanedText.toLowerCase();
  let positive = 0;
  let negative = 0;
  
  for (const word of positiveWords) {
    if (lowerText.includes(word.toLowerCase())) positive++;
  }
  for (const word of negativeWords) {
    if (lowerText.includes(word.toLowerCase())) negative++;
  }
  
  if (positive > negative) return 'positive';
  if (negative > positive) return 'negative';
  return 'neutral';
}

function processPost(post) {
  // Handle different data structures
  let rawData = post.raw_data;
  
  // Some posts might have data directly
  if (!rawData && post.data) {
    rawData = post;
  }
  
  if (!rawData?.data?.note && !rawData?.note) {
    return null;
  }
  
  const note = rawData?.data?.note || rawData?.note;
  const comments = rawData?.data?.comments?.list || rawData?.comments?.list || [];
  
  if (!note) return null;
  
  // Extract mentions from post content
  const contentMentions = extractRestaurantMentions(note.desc, 'post_content');
  
  // Process comments
  const processedComments = [];
  for (const comment of comments) {
    const commentMentions = extractRestaurantMentions(comment.content, 'comment');
    
    processedComments.push({
      postId: note.noteId || post.id,
      commentId: comment.id,
      content: cleanText(comment.content),
      author: comment.userInfo?.nickname || 'Anonymous',
      authorId: comment.userInfo?.userId,
      publishTime: comment.createTime ? new Date(comment.createTime).toISOString() : null,
      likedCount: parseInt(comment.likeCount) || 0,
      restaurants_mentioned: commentMentions.map(m => m.name),
      sentiment: analyzeSentiment(comment.content),
      replies: (comment.subComments || []).map(reply => ({
        replyId: reply.id,
        content: cleanText(reply.content),
        author: reply.userInfo?.nickname,
        isAuthor: reply.showTags?.includes('is_author')
      }))
    });
  }
  
  // Extract mentions from comments
  const commentMentions = [];
  for (const c of processedComments) {
    for (const name of c.restaurants_mentioned) {
      commentMentions.push({
        name,
        confidence: 0.7,
        context: c.content?.slice(0, 100) || '',
        source: 'comment',
        sentiment: c.sentiment
      });
    }
  }
  
  // Combine and deduplicate mentions
  const allMentions = [...contentMentions];
  for (const cm of commentMentions) {
    const exists = allMentions.some(m => m.name === cm.name);
    if (!exists) allMentions.push(cm);
  }
  
  return {
    id: note.noteId || post.id,
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
    restaurants_mentioned: allMentions,
    comments: processedComments,
    commentCount: comments.length
  };
}

function main() {
  console.log('Loading all posts...');
  const posts = loadAllPosts();
  console.log(`Loaded ${posts.length} posts`);
  
  console.log('Processing posts...');
  const processedPosts = [];
  const allComments = [];
  const restaurantMentions = {};
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const processed = processPost(post);
    if (processed) {
      processedPosts.push(processed);
      allComments.push(...processed.comments);
      
      // Track restaurant mentions
      for (const mention of processed.restaurants_mentioned) {
        if (!restaurantMentions[mention.name]) {
          restaurantMentions[mention.name] = {
            name: mention.name,
            mentionCount: 0,
            posts: [],
            contexts: [],
            sentiments: { positive: 0, neutral: 0, negative: 0 },
            cuisine: mention.cuisine,
            area: mention.area
          };
        }
        restaurantMentions[mention.name].mentionCount++;
        if (!restaurantMentions[mention.name].posts.includes(processed.id)) {
          restaurantMentions[mention.name].posts.push(processed.id);
        }
        restaurantMentions[mention.name].contexts.push(mention.context);
        
        if (mention.source === 'comment' && mention.sentiment) {
          restaurantMentions[mention.name].sentiments[mention.sentiment]++;
        } else if (mention.source === 'post_content') {
          // Analyze sentiment from context
          const sentiment = analyzeSentiment(mention.context);
          restaurantMentions[mention.name].sentiments[sentiment]++;
        }
      }
    }
    
    if ((i + 1) % 10 === 0) {
      console.log(`  Processed ${i + 1}/${posts.length} posts...`);
    }
  }
  
  console.log(`\nProcessed ${processedPosts.length} posts`);
  console.log(`Extracted ${allComments.length} comments`);
  console.log(`Found ${Object.keys(restaurantMentions).length} unique restaurant mentions`);
  
  // Create timestamp for organization
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Ensure directories exist
  const postsDir = path.join(OUTPUT_DIR, 'posts', timestamp);
  const commentsDir = path.join(OUTPUT_DIR, 'comments', timestamp);
  fs.mkdirSync(postsDir, { recursive: true });
  fs.mkdirSync(commentsDir, { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, 'current'), { recursive: true });
  
  // Save processed posts
  for (const post of processedPosts) {
    fs.writeFileSync(
      path.join(postsDir, `${post.id}.json`),
      JSON.stringify(post, null, 2)
    );
  }
  
  // Save all posts combined
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'posts', `posts_${timestamp}_full.json`),
    JSON.stringify({ posts: processedPosts, count: processedPosts.length }, null, 2)
  );
  
  // Save all comments
  fs.writeFileSync(
    path.join(commentsDir, `comments_${timestamp}_full.json`),
    JSON.stringify({ comments: allComments, count: allComments.length }, null, 2)
  );
  
  // Save restaurant mentions
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'current', `restaurant_mentions_${timestamp}.json`),
    JSON.stringify({ mentions: restaurantMentions, count: Object.keys(restaurantMentions).length }, null, 2)
  );
  
  // Filter out low-confidence mentions for the report
  const highConfidenceMentions = Object.values(restaurantMentions)
    .filter(r => r.mentionCount >= 1 && r.name.length > 1 && !r.name.match(/^\d+$/));
  
  // Generate summary report
  const report = {
    timestamp,
    totalPosts: processedPosts.length,
    totalComments: allComments.length,
    uniqueRestaurants: Object.keys(restaurantMentions).length,
    highConfidenceRestaurants: highConfidenceMentions.length,
    topMentioned: highConfidenceMentions
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 30),
    postsWithContent: processedPosts.filter(p => p.content && p.content.length > 10).length,
    postsWithComments: processedPosts.filter(p => p.commentCount > 0).length,
    sentimentDistribution: {
      positive: allComments.filter(c => c.sentiment === 'positive').length,
      neutral: allComments.filter(c => c.sentiment === 'neutral').length,
      negative: allComments.filter(c => c.sentiment === 'negative').length
    }
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `extraction_report_${timestamp}.json`),
    JSON.stringify(report, null, 2)
  );
  
  console.log('\n=== Extraction Report ===');
  console.log(`Total Posts: ${report.totalPosts}`);
  console.log(`Posts with Content: ${report.postsWithContent}`);
  console.log(`Posts with Comments: ${report.postsWithComments}`);
  console.log(`Total Comments: ${report.totalComments}`);
  console.log(`Unique Restaurants: ${report.uniqueRestaurants}`);
  console.log(`High Confidence Restaurants: ${report.highConfidenceRestaurants}`);
  console.log('\nTop 20 Mentioned Restaurants:');
  report.topMentioned.slice(0, 20).forEach((r, i) => {
    const sentiment = r.sentiments.positive > r.sentiments.negative ? '👍' : 
                     r.sentiments.negative > r.sentiments.positive ? '👎' : '➖';
    console.log(`  ${i+1}. ${r.name}: ${r.mentionCount} mentions ${sentiment}`);
  });
  console.log('\nSentiment Distribution:');
  console.log(`  Positive: ${report.sentimentDistribution.positive}`);
  console.log(`  Neutral: ${report.sentimentDistribution.neutral}`);
  console.log(`  Negative: ${report.sentimentDistribution.negative}`);
  
  return { processedPosts, allComments, restaurantMentions, report };
}

module.exports = { main, loadAllPosts, processPost, extractRestaurantMentions };

// Run if called directly
if (require.main === module) {
  main();
}
