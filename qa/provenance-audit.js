#!/usr/bin/env node
/**
 * Data Provenance Audit - Trace where numbers come from
 * Run this to verify data integrity and catch fabricated values
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map';
const RAW_DIR = path.join(PROJECT_DIR, 'data/raw/v2/posts');

function loadDatabase() {
    const dbPath = path.join(PROJECT_DIR, 'data/current/restaurant_database.json');
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function loadRawPost(postId) {
    try {
        const filePath = path.join(RAW_DIR, `${postId}.json`);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {}
    return null;
}

function calculateRealEngagement(post) {
    if (!post || !post.data || !post.data.note) return null;
    
    const interactInfo = post.data.note.interactInfo || {};
    const liked = parseInt(interactInfo.likedCount) || 0;
    const comments = parseInt(interactInfo.commentCount) || 0;
    const collected = parseInt(interactInfo.collectedCount) || 0;
    
    return {
        likes: liked,
        comments: comments,
        collections: collected,
        total: liked + comments + collected
    };
}

function auditRestaurant(r) {
    const issues = [];
    
    // Check 1: Can we trace the source?
    const sources = r.sources || r.llmMentions || [];
    if (sources.length === 0) {
        issues.push(`❌ NO SOURCE: ${r.name} has no source posts - data is UNTRACEABLE`);
    }
    
    // Check 2: Verify engagement numbers
    if (sources.length > 0) {
        let calculatedTotal = 0;
        let verifiedPosts = 0;
        
        sources.forEach(source => {
            const postId = source.postId || source;
            const post = loadRawPost(postId);
            
            if (post) {
                const engagement = calculateRealEngagement(post);
                if (engagement) {
                    calculatedTotal += engagement.total;
                    verifiedPosts++;
                }
            }
        });
        
        const dbEngagement = r.total_engagement || 
                           r.metrics?.discussion_volume?.total_engagement || 
                           r.time_series?.total_engagement || 0;
        
        // If we can verify and numbers don't match
        if (verifiedPosts > 0 && Math.abs(calculatedTotal - dbEngagement) > 10) {
            issues.push(`❌ MISMATCH: ${r.name} - DB says ${dbEngagement}, calculated from raw posts: ${calculatedTotal}`);
            issues.push(`   Source posts: ${sources.join(', ')}`);
        }
        
        // If we can't verify at all
        if (verifiedPosts === 0) {
            issues.push(`⚠️  UNVERIFIABLE: ${r.name} - engagement is ${dbEngagement} but no raw posts found`);
        }
    }
    
    // Check 3: Timeline data sanity
    if (r.time_series?.timeline?.length === 1) {
        const point = r.time_series.timeline[0];
        const total = r.time_series.total_engagement || 0;
        
        // If single point doesn't match total
        if (Math.abs(point.engagement - total) > 10) {
            issues.push(`❌ TIMELINE MISMATCH: ${r.name} - timeline point: ${point.engagement}, total: ${total}`);
        }
    }
    
    // Check 4: Suspicious large numbers with few mentions
    if (r.total_engagement > 500 && (r.mention_count === 1 || !r.mention_count)) {
        issues.push(`❌ SUSPICIOUS: ${r.name} - ${r.total_engagement} engagement with only ${r.mention_count || 'unknown'} mentions`);
    }
    
    return issues;
}

function main() {
    console.log('🔍 Data Provenance Audit\n');
    console.log('Checking if database numbers match raw post data...\n');
    
    const db = loadDatabase();
    const allIssues = [];
    
    db.restaurants.forEach(r => {
        const issues = auditRestaurant(r);
        if (issues.length > 0) {
            allIssues.push(...issues);
        }
    });
    
    if (allIssues.length === 0) {
        console.log('✅ All data verified successfully!');
    } else {
        console.log(`❌ Found ${allIssues.length} issues:\n`);
        allIssues.forEach(issue => console.log(issue));
        
        console.log('\n🔴 CRITICAL FINDINGS:');
        console.log('- Numbers cannot be traced to source posts');
        console.log('- Engagement values may be fabricated or miscalculated');
        console.log('- Recommend: Full database rebuild from verified raw data');
    }
    
    return allIssues.length === 0;
}

if (require.main === module) {
    const passed = main();
    process.exit(passed ? 0 : 1);
}

module.exports = { auditRestaurant };
