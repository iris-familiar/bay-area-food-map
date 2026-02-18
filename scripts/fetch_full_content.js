/**
 * Fetch full post details and comments for all posts
 * Uses xiaohongshu MCP skill
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const POSTS_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/posts_to_fetch.json';
const OUTPUT_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/raw/post_details';
const MCP_SCRIPT = '/Users/joeli/.agents/skills/xiaohongshu/scripts/mcp-call.sh';

// Delay between requests to avoid rate limiting
const DELAY_MS = 2000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchPostDetail(noteId, xsecToken) {
  try {
    const result = execSync(
      `"${MCP_SCRIPT}" get_feed_detail '{"note_id": "${noteId}", "xsec_token": "${xsecToken}"}'`,
      { encoding: 'utf8', timeout: 30000 }
    );
    return JSON.parse(result);
  } catch (e) {
    console.error(`Error fetching ${noteId}:`, e.message);
    return null;
  }
}

async function main() {
  const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
  console.log(`Found ${posts.length} posts to fetch`);
  
  const results = {
    success: [],
    failed: [],
    skipped: []
  };
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const outputFile = path.join(OUTPUT_DIR, `${post.id}.json`);
    
    // Check if already exists with data
    if (fs.existsSync(outputFile)) {
      const existing = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      if (existing.raw_data?.data?.note?.desc) {
        console.log(`[${i+1}/${posts.length}] Skipping ${post.id} - already has content`);
        results.skipped.push(post.id);
        continue;
      }
    }
    
    console.log(`[${i+1}/${posts.length}] Fetching ${post.id}...`);
    
    const data = fetchPostDetail(post.id, post.xsecToken);
    
    if (data && data.data?.note) {
      const result = {
        id: post.id,
        title: post.title,
        success: true,
        publishTime: new Date(data.note.time).toISOString(),
        timestamp: data.note.time,
        raw_data: {
          feed_id: post.id,
          data: data
        }
      };
      
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log(`  ✓ Saved with content (${data.note.desc?.length || 0} chars, ${data.comments?.list?.length || 0} comments)`);
      results.success.push(post.id);
    } else {
      console.log(`  ✗ Failed to fetch`);
      results.failed.push({ id: post.id, error: 'No data returned' });
    }
    
    // Delay to avoid rate limiting
    if (i < posts.length - 1) {
      await sleep(DELAY_MS);
    }
  }
  
  // Save summary
  const summary = {
    timestamp: new Date().toISOString(),
    total: posts.length,
    success: results.success.length,
    failed: results.failed.length,
    skipped: results.skipped.length,
    results
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '../fetch_summary_full.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n=== Fetch Summary ===');
  console.log(`Total: ${posts.length}`);
  console.log(`Success: ${results.success.length}`);
  console.log(`Skipped: ${results.skipped.length}`);
  console.log(`Failed: ${results.failed.length}`);
}

main().catch(console.error);
