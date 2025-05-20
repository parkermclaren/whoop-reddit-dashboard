/**
 * WHOOP Reddit Full Metrics Update
 * 
 * This script updates the metrics (ups and num_comments) for ALL Reddit posts
 * in the database, starting with the oldest posts first.
 * 
 * Run with: npx ts-node src/scripts/full-metrics-update.ts
 * 
 * Options:
 *   --batch-size=N  Set custom batch size (default: 50)
 *   --limit=N       Limit total number of posts to process
 *   --quiet         Run with minimal output
 */

import * as dotenv from 'dotenv';
import Snoowrap from 'snoowrap';
import { createClient } from '@supabase/supabase-js';
import { v7 as uuidv7 } from 'uuid';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Setup Reddit client
const reddit = new Snoowrap({
  userAgent: 'WHOOP Reddit Dashboard v1.0',
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  username: process.env.REDDIT_USERNAME,
  password: process.env.REDDIT_PASSWORD
});

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Rate limiter to avoid hitting Reddit API limits
const rateLimiter = {
  lastRequestTime: 0,
  minInterval: 6000, // 6 seconds between requests
  
  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
};

/**
 * Updates metrics for ALL posts in the database, starting with oldest first
 * 
 * @param batchSize Number of posts to update per batch
 * @param limit Optional limit on total posts to update
 * @param verbose If true, logs detailed information about each post's metrics
 */
async function updateAllPostMetrics(batchSize = 50, limit?: number, verbose = true): Promise<boolean> {
  try {
    console.log('Starting full metrics update for ALL posts...');
    
    // Generate a unique job ID for this run
    const jobId = uuidv7();
    console.log(`Job ID: ${jobId}`);
    
    const now = new Date();
    
    // Get all posts, oldest first
    let query = supabase.from('reddit_posts').select('id, reddit_id, created_at, ups, num_comments, title').order('created_at', { ascending: true });
    
    // Apply limit if provided
    if (limit && limit > 0) {
      query = query.limit(limit);
    }
    
    // Execute the query
    const { data: posts, error: fetchError } = await query;
    
    if (fetchError || !posts) {
      console.error('Error fetching posts:', fetchError);
      return false;
    }
    
    console.log(`Found ${posts.length} posts to update metrics for`);
    
    if (posts.length === 0) {
      console.log('No posts to update');
      return true;
    }
    
    // Process in batches to avoid memory issues
    const batches = [];
    for (let i = 0; i < posts.length; i += batchSize) {
      batches.push(posts.slice(i, i + batchSize));
    }
    
    console.log(`Split into ${batches.length} batches of up to ${batchSize} posts each`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let noChangeCount = 0;
    
    // Track metrics changes for reporting
    const metricsChanges = [];
    const batchTime = now.toISOString();
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length}`);
      
      for (const post of batch) {
        try {
          await rateLimiter.throttle();
          
          // Remove t3_ prefix if present
          const redditId = post.reddit_id.replace(/^t3_/, '');
          
          // Fetch the post from Reddit
          if (verbose) {
            console.log(`Fetching post ${redditId} from Reddit: "${post.title?.substring(0, 50)}${post.title?.length > 50 ? '...' : ''}"`);
          } else {
            console.log(`Fetching post ${redditId} from Reddit`);
          }
          
          // Workaround for TypeScript error by splitting calls
          const submission = reddit.getSubmission(redditId);
          // @ts-ignore - Suppress TypeScript error about self-referencing Promise
          const redditPost = await submission.fetch();
          
          // Calculate metrics differences
          const oldUps = post.ups || 0;
          const oldComments = post.num_comments || 0;
          const newUps = redditPost.ups || 0;
          const newComments = redditPost.num_comments || 0;
          const upsDiff = newUps - oldUps;
          const commentsDiff = newComments - oldComments;
          
          // Calculate post age in days
          const postCreatedAt = new Date(post.created_at);
          const ageInMs = now.getTime() - postCreatedAt.getTime();
          const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));
          
          // Store metrics change for reporting
          if (verbose) {
            metricsChanges.push({
              id: redditId,
              title: post.title,
              ups: { old: oldUps, new: newUps, diff: upsDiff },
              comments: { old: oldComments, new: newComments, diff: commentsDiff }
            });
          }
          
          // Only update if there's an actual change to avoid unnecessary updates
          if (upsDiff !== 0 || commentsDiff !== 0) {
            // Update metrics in Supabase
            const { error: updateError } = await supabase
              .from('reddit_posts')
              .update({
                ups: redditPost.ups,
                num_comments: redditPost.num_comments,
                score: redditPost.score || redditPost.ups,
                updated_at: new Date().toISOString()
              })
              .eq('id', post.id);
            
            if (updateError) {
              console.error(`Error updating metrics for post ${redditId}:`, updateError);
              errorCount++;
            } else {
              // Log the update to the metrics_update_logs table
              const { error: logError } = await supabase
                .from('metrics_update_logs')
                .insert({
                  job_id: jobId,
                  post_id: post.id,
                  reddit_id: post.reddit_id,
                  post_title: post.title,
                  previous_ups: oldUps,
                  new_ups: newUps,
                  ups_change: upsDiff,
                  previous_comments: oldComments,
                  new_comments: newComments,
                  comments_change: commentsDiff,
                  batch_time: batchTime,
                  post_age_days: ageInDays
                });
              
              if (logError) {
                console.error(`Error logging metrics update for post ${redditId}:`, logError);
              }
              
              if (verbose) {
                console.log(`Updated metrics for post ${redditId}:`);
                console.log(`  Upvotes: ${oldUps} → ${newUps} (${upsDiff >= 0 ? '+' : ''}${upsDiff})`);
                console.log(`  Comments: ${oldComments} → ${newComments} (${commentsDiff >= 0 ? '+' : ''}${commentsDiff})`);
              } else {
                console.log(`Updated metrics for post ${redditId}`);
              }
              updatedCount++;
            }
          } else {
            if (verbose) {
              console.log(`No metrics changes for post ${redditId} - skipping update`);
            }
            noChangeCount++;
          }
        } catch (error: any) {
          console.error(`Error processing post ${post.reddit_id}:`, error?.message);
          
          // Check if this is likely a deleted post
          if (error?.message?.includes('404') || error?.message?.includes('not found')) {
            console.log(`Post ${post.reddit_id} appears to be deleted, skipping`);
            skippedCount++;
          } else {
            errorCount++;
          }
        }
      }
      
      // After each batch, provide a progress update
      console.log(`Progress: ${Math.min(100, Math.round((batchIndex + 1) * 100 / batches.length))}% complete`);
      console.log(`Stats so far: Updated: ${updatedCount}, No changes: ${noChangeCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    }
    
    console.log('\nFull metrics update completed:');
    console.log(`- Updated: ${updatedCount} posts`);
    console.log(`- No changes: ${noChangeCount} posts`);
    console.log(`- Skipped (deleted): ${skippedCount} posts`);
    console.log(`- Errors: ${errorCount} posts`);
    console.log(`- Job ID: ${jobId}`);
    
    // In verbose mode, output a summary of all metric changes
    if (verbose && metricsChanges.length > 0) {
      console.log('\nDetailed metrics changes:');
      console.log('-'.repeat(80));
      
      // Sort by most significant changes first (highest ups or comments diff)
      metricsChanges.sort((a, b) => 
        Math.max(Math.abs(b.ups.diff), Math.abs(b.comments.diff)) - 
        Math.max(Math.abs(a.ups.diff), Math.abs(a.comments.diff))
      );
      
      // Show top 20 most significant changes
      const topChanges = metricsChanges.slice(0, 20);
      topChanges.forEach(change => {
        console.log(`Post: ${change.id} - "${change.title?.substring(0, 60)}${change.title?.length > 60 ? '...' : ''}"`);
        console.log(`  Upvotes: ${change.ups.old} → ${change.ups.new} (${change.ups.diff >= 0 ? '+' : ''}${change.ups.diff})`);
        console.log(`  Comments: ${change.comments.old} → ${change.comments.new} (${change.comments.diff >= 0 ? '+' : ''}${change.comments.diff})`);
        console.log('-'.repeat(80));
      });
      
      if (metricsChanges.length > 20) {
        console.log(`... and ${metricsChanges.length - 20} more changes (showing only top 20)`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error in updateAllPostMetrics:', error);
    return false;
  }
}

// Extract command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options: { batchSize: number; limit?: number; verbose: boolean } = {
    batchSize: 50,
    limit: undefined,
    verbose: true
  };
  
  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      const size = parseInt(arg.split('=')[1], 10);
      if (!isNaN(size) && size > 0) options.batchSize = size;
    } else if (arg.startsWith('--limit=')) {
      const limit = parseInt(arg.split('=')[1], 10);
      if (!isNaN(limit) && limit > 0) options.limit = limit;
    } else if (arg === '--quiet') {
      options.verbose = false;
    }
  }
  
  return options;
}

// Run directly from command line
async function main() {
  try {
    console.log('Starting full metrics update for ALL posts in the database...');
    
    const options = parseArgs();
    console.log(`Options: Batch size=${options.batchSize}, Limit=${options.limit || 'none'}, Verbose=${options.verbose}`);
    
    const success = await updateAllPostMetrics(options.batchSize, options.limit, options.verbose);
    console.log(success ? 'Full post metrics updated successfully.' : 'Full post metrics update encountered errors.');
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error in full metrics update execution:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { updateAllPostMetrics }; 