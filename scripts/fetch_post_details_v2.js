#!/usr/bin/env node
/**
 * 简化的批量获取小红书帖子详情（含发布时间）
 * 逐个处理，带有超时控制
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const WORKSPACE_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map';
const XHS_SKILL_DIR = '/Users/joeli/.agents/skills/xiaohongshu';
const OUTPUT_DIR = path.join(WORKSPACE_DIR, 'data/raw/post_details');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load posts to fetch
const postsFile = path.join(WORKSPACE_DIR, 'data/raw/posts_to_fetch.json');
const posts = JSON.parse(fs.readFileSync(postsFile, 'utf8'));

console.log(`📋 Total posts to fetch: ${posts.length}`);
console.log('');

// Normalize time to ISO format
function normalizeTime(timeValue) {
    if (!timeValue) return null;
    
    // Unix timestamp (seconds or milliseconds)
    if (typeof timeValue === 'number' || /^\d+$/.test(timeValue)) {
        const ts = parseInt(timeValue);
        // If less than year 2100 in seconds, assume seconds; else milliseconds
        const date = ts < 5000000000 ? new Date(ts * 1000) : new Date(ts);
        return {
            timestamp: ts,
            iso: date.toISOString(),
            date: date.toISOString().split('T')[0]
        };
    }
    
    // ISO string
    const date = new Date(timeValue);
    if (!isNaN(date.getTime())) {
        return {
            timestamp: Math.floor(date.getTime() / 1000),
            iso: date.toISOString(),
            date: date.toISOString().split('T')[0]
        };
    }
    
    return null;
}

// Fetch single post detail with timeout
async function fetchPostDetail(post, index) {
    const { id, xsecToken, title } = post;
    const outputFile = path.join(OUTPUT_DIR, `${id}.json`);
    
    // Skip if already fetched
    if (fs.existsSync(outputFile)) {
        const existing = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
        if (existing.success) {
            console.log(`[${index + 1}/${posts.length}] ⏭️ Skipped (cached): ${title.substring(0, 40)}...`);
            return existing;
        }
    }
    
    console.log(`[${index + 1}/${posts.length}] Fetching: ${title.substring(0, 40)}...`);
    
    try {
        const args = JSON.stringify({
            feed_id: id,
            xsec_token: xsecToken,
            load_all_comments: false
        });
        
        const cmd = `cd "${XHS_SKILL_DIR}/scripts" && ./mcp-call.sh get_feed_detail '${args}'`;
        
        const { stdout, stderr } = await execAsync(cmd, { 
            timeout: 30000,
            maxBuffer: 10 * 1024 * 1024
        });
        
        // Parse JSON response
        let data;
        try {
            data = JSON.parse(stdout);
        } catch (e) {
            throw new Error('Invalid JSON response');
        }
        
        // Check for error
        if (data.error) {
            throw new Error(data.error.message || 'API error');
        }
        
        // Extract publish time from MCP result format
        let publishTime = null;
        if (data.result?.content?.[0]?.text) {
            try {
                const parsed = JSON.parse(data.result.content[0].text);
                if (parsed.data?.note?.time) {
                    publishTime = normalizeTime(parsed.data.note.time);
                }
            } catch (e) {
                // Ignore parse error
            }
        }
        
        const result = {
            id,
            title,
            success: true,
            publishTime: publishTime?.iso || null,
            date: publishTime?.date || null,
            timestamp: publishTime?.timestamp || null
        };
        
        // Save individual result
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
        
        console.log(`  ✅ Success - Published: ${publishTime?.date || 'N/A'}`);
        return result;
        
    } catch (error) {
        const result = {
            id,
            title,
            success: false,
            error: error.message || 'Unknown error'
        };
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
        console.log(`  ❌ Failed: ${error.message?.substring(0, 50) || 'Unknown'}`);
        return result;
    }
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Main execution
async function main() {
    const results = {
        success: [],
        failed: [],
        timestamp: new Date().toISOString()
    };
    
    // Process one at a time with delay
    const DELAY_BETWEEN_REQUESTS = 3000; // 3 seconds
    
    for (let i = 0; i < posts.length; i++) {
        const result = await fetchPostDetail(posts[i], i);
        
        if (result.success) {
            results.success.push(result);
        } else {
            results.failed.push(result);
        }
        
        // Delay before next request
        if (i < posts.length - 1) {
            await sleep(DELAY_BETWEEN_REQUESTS);
        }
    }
    
    // Save summary
    const summaryPath = path.join(WORKSPACE_DIR, 'data/raw/post_fetch_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
        ...results,
        stats: {
            total: posts.length,
            success: results.success.length,
            failed: results.failed.length,
            success_rate: `${((results.success.length / posts.length) * 100).toFixed(1)}%`
        }
    }, null, 2));
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 FETCH SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total: ${posts.length}`);
    console.log(`Success: ${results.success.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Success Rate: ${((results.success.length / posts.length) * 100).toFixed(1)}%`);
    console.log(`\n💾 Results saved to:`);
    console.log(`  - Individual: ${OUTPUT_DIR}/`);
    console.log(`  - Summary: ${summaryPath}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
