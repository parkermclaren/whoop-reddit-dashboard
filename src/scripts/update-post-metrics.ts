import * as dotenv from 'dotenv';
import Snoowrap from 'snoowrap';
import { createClient } from '@supabase/supabase-js';

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
 * Updates metrics for existing reddit posts based on their age
 * Only updates ups and num_comments, does NOT trigger analyzers
 * 
 * Update frequency by age:
 * - Recent posts (0-3 days): Every 6 hours
 * - Mid-age posts (4-7 days): Once per day
 * - Older posts (>7 days): Once per week
 * 
 * @param batchSize Number of posts to update per batch
 */
export async function updatePostMetrics(batchSize = 50): Promise<boolean> {
  try {
    console.log('Starting to update metrics for existing posts...');
    
    const now = new Date();
    
    // Calculate date thresholds
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Current hour and day of week
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    let query = supabase.from('reddit_posts').select('id, reddit_id, created_at');
    let updateType = '';
    
    // Check if we're within a window of the hour that is divisible by 6
    // For example, if scheduled at X:50, it will match for 23:50, which is close to 00:00
    const hourWindow = 1; // Allow 1 hour before or after the target time
    const isNearDivisibleBySix = (currentHour % 6 <= hourWindow) || ((currentHour + hourWindow) % 6 === 0);
    const isNearMidnight = (currentHour >= 23) || (currentHour <= 1);
    
    // Logic for which posts to update based on time - with more forgiving time windows
    if (isNearDivisibleBySix) {
      // Near hours divisible by 6: Update recent posts (0-3 days old)
      query = query.gte('created_at', threeDaysAgo.toISOString());
      updateType = 'recent posts (0-3 days old)';
    } else if (isNearMidnight) {
      // Around midnight: Update mid-age posts (4-7 days old)
      query = query.lt('created_at', threeDaysAgo.toISOString())
                   .gte('created_at', sevenDaysAgo.toISOString());
      updateType = 'mid-age posts (4-7 days old)';
    } else if (dayOfWeek === 0 && isNearMidnight) {
      // Around midnight on Sunday: Update older posts (>7 days old)
      query = query.lt('created_at', sevenDaysAgo.toISOString());
      updateType = 'older posts (>7 days old)';
    } else {
      // For testing purposes, always update at least some posts each time
      console.log('No posts scheduled for updating in this time window, but will update 5 recent posts anyway');
      query = query.gte('created_at', threeDaysAgo.toISOString()).limit(5);
      updateType = 'sample of recent posts (for testing)';
    }
    
    // Execute the query
    const { data: posts, error: fetchError } = await query.order('created_at', { ascending: false });
    
    if (fetchError || !posts) {
      console.error('Error fetching posts:', fetchError);
      return false;
    }
    
    console.log(`Found ${posts.length} ${updateType} to update metrics for`);
    
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
          console.log(`Fetching post ${redditId} from Reddit`);
          // Workaround for TypeScript error by splitting calls
          const submission = reddit.getSubmission(redditId);
          // @ts-ignore - Suppress TypeScript error about self-referencing Promise
          const redditPost = await submission.fetch();
          
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
            console.log(`Updated metrics for post ${redditId}`);
            updatedCount++;
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
    }
    
    console.log('Metrics update completed:');
    console.log(`- Updated: ${updatedCount} posts`);
    console.log(`- Skipped (deleted): ${skippedCount} posts`);
    console.log(`- Errors: ${errorCount} posts`);
    
    return true;
  } catch (error) {
    console.error('Error in updatePostMetrics:', error);
    return false;
  }
}

// Run directly from command line
async function main() {
  try {
    const success = await updatePostMetrics();
    console.log(success ? 'Post metrics updated successfully.' : 'Post metrics update encountered errors.');
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error in metrics update execution:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 