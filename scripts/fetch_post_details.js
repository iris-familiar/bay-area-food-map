#!/usr/bin/env node
/**
 * 批量获取小红书帖子详情（含发布时间）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

const results = {
    success: [],
    failed: [],
    timestamp: new Date().toISOString()
};

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch single post detail
async function fetchPostDetail(post, index) {
    const { id, xsecToken, title } = post;
    console.log(`[${index + 1}/${posts.length}] Fetching: ${title.substring(0, 40)}...`);
    
    try {
        // Use mcp-call directly with correct params
        const args = JSON.stringify({
            feed_id: id,
            xsec_token: xsecToken,
            load_all_comments: false
        }).replace(/"/g, '\\"');
        const cmd = `cd "${XHS_SKILL_DIR}/scripts" && ./mcp-call.sh get_feed_detail "${args}"`;
        const output = execSync(cmd, { 
            encoding: 'utf8', 
            timeout: 30000,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Parse JSON response (MCP format)
        let data;
        try {
            data = JSON.parse(output);
            // Check for MCP result format
            if (data.result?.content?.[0]?.text) {
                const innerData = JSON.parse(data.result.content[0].text);
                data = innerData; // Use the inner data
            }
        } catch (e) {
            // Try to extract JSON from mixed output
            const jsonMatch = output.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                data = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Invalid JSON response');
            }
        }
        
        // Extract publish time from various possible fields
        const publishTime = extractPublishTime(data);
        
        const result = {
            id,
            title,
            success: true,
            publishTime: publishTime?.iso || null,
            timestamp: publishTime?.timestamp || null,
            raw_data: data
        };
        
        // Save individual result
        fs.writeFileSync(
            path.join(OUTPUT_DIR, `${id}.json`),
            JSON.stringify(result, null, 2)
        );
        
        results.success.push(result);
        console.log(`  ✅ Success - Published: ${publishTime?.iso || 'N/A'}`);
        return result;
        
    } catch (error) {
        const result = {
            id,
            title,
            success: false,
            error: error.message,
            stderr: error.stderr?.toString() || null
        };
        results.failed.push(result);
        console.log(`  ❌ Failed: ${error.message.substring(0, 60)}`);
        return result;
    }
}

// Extract publish time from various API response formats
function extractPublishTime(data) {
    // First try to get from result -> content structure
    if (data.result?.content?.[0]?.text) {
        try {
            const parsed = JSON.parse(data.result.content[0].text);
            if (parsed.data?.note?.time) {
                return normalizeTime(parsed.data.note.time);
            }
            if (parsed.data?.time) {
                return normalizeTime(parsed.data.time);
            }
        } catch (e) {
            // Continue to other checks
        }
    }
    
    const possibleFields = [
        'publishTime',
        'createTime',
        'lastUpdateTime',
        'create_time',
        'publish_time',
        'time',
        'timestamp'
    ];
    
    // Try direct fields
    for (const field of possibleFields) {
        if (data[field]) {
            return normalizeTime(data[field]);
        }
    }
    
    // Try nested in note or feed
    const noteData = data.note || data.feed || data.data || data;
    for (const field of possibleFields) {
        if (noteData[field]) {
            return normalizeTime(noteData[field]);
        }
    }
    
    // Try data -> note structure
    if (data.data?.note) {
        for (const field of possibleFields) {
            if (data.data.note[field]) {
                return normalizeTime(data.data.note[field]);
            }
        }
    }
    
    return null;
}

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

// Main execution
async function main() {
    // Process in batches with rate limiting
    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds
    const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds
    
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);
        console.log(`\n🔄 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(posts.length / BATCH_SIZE)}`);
        console.log('─'.repeat(60));
        
        for (let j = 0; j < batch.length; j++) {
            await fetchPostDetail(batch[j], i + j);
            if (j < batch.length - 1) {
                await sleep(DELAY_BETWEEN_REQUESTS);
            }
        }
        
        if (i + BATCH_SIZE < posts.length) {
            console.log(`\n⏳ Waiting ${DELAY_BETWEEN_BATCHES/1000}s before next batch...`);
            await sleep(DELAY_BETWEEN_BATCHES);
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

main().catch(console.error);
