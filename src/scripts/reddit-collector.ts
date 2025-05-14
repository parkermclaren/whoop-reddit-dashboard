// Reddit Data Collector
// Fetches posts from r/whoop since the May 8, 2025 product announcement
// Collects posts, comments, metadata, and image URLs
// Stores data in Supabase tables

import * as dotenv from 'dotenv';
import Snoowrap from 'snoowrap';
import { createClient } from '@supabase/supabase-js';
import { analyzeRedditPost } from './gpt-analyzer';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Setup Reddit client using username/password authentication
const reddit = new Snoowrap({
  userAgent: 'WHOOP Reddit Dashboard v1.0',
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  username: process.env.REDDIT_USERNAME,
  password: process.env.REDDIT_PASSWORD
});

// Enhance rate limiting to avoid hitting Reddit API limits (10 requests per minute for non-OAuth)
const rateLimiter = {
  lastRequestTime: 0,
  minInterval: 6000, // 6 seconds between requests (10 per minute)
  requestCount: 0,
  
  async throttle() {
    this.requestCount++;
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms before next request (${this.requestCount} requests made)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
};

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Constants
const SUBREDDIT = 'whoop';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const PAGE_SIZE = 100; // Maximum allowed by Reddit API

// Set the announcement date - May 8, 2025, at 10am Eastern Time
// Kept as a fallback in case collection metadata doesn't exist
const ANNOUNCEMENT_DATE = new Date('2025-05-08T10:00:00-04:00');

// Types for our data
type PostInsertResponse = {
  id: string;
  [key: string]: any;
};

interface RedditComment {
  id: string;
  body: string;
  author: { name: string };
  created_utc: number;
  ups: number;
  parent_id: string;
}

interface MappedComment {
  reddit_id: string;
  body: string;
  author: string;
  created_at: string;
  upvotes: number;
  parent_id: string;
}

// Interface for Reddit API options
interface RedditApiOptions {
  limit: number;
  after?: string;
}

// Main function to collect Reddit data
export async function collectRedditData(): Promise<boolean> {
  try {
    console.log('Starting Reddit data collection...');
    
    // Get the last collection timestamp from the database
    const { data: lastRunData, error: metadataError } = await supabase
      .from('collection_metadata')
      .select('last_collection_time, posts_collected')
      .eq('id', 'reddit-collection')
      .single();
    
    // Default to the announcement date if no previous run or error
    let lastCollectionTime = ANNOUNCEMENT_DATE;
    let previousPostsCollected = 0;
    
    if (lastRunData?.last_collection_time) {
      lastCollectionTime = new Date(lastRunData.last_collection_time);
      previousPostsCollected = lastRunData.posts_collected || 0;
      console.log(`Using last collection time: ${lastCollectionTime.toLocaleString()}`);
    } else {
      console.log(`No previous collection data found. Starting from announcement date: ${ANNOUNCEMENT_DATE.toLocaleString()}`);
      if (metadataError) {
        console.error(`Error fetching collection metadata:`, metadataError);
      }
    }
    
    console.log(`Collecting Reddit posts since ${lastCollectionTime.toLocaleString()}...`);
    
    let allPostsCollected = false;
    let after: string | null = null;
    let totalProcessedPosts = 0;
    let tooOldPostsCount = 0;
    
    // Continue fetching until we've either:
    // 1. Found posts older than our cutoff date
    // 2. Reached the end of available posts
    while (!allPostsCollected) {
      await rateLimiter.throttle();
      
      // Get a batch of posts from the subreddit
      const options: RedditApiOptions = { limit: PAGE_SIZE };
      if (after) options.after = after;
      
      console.log(`Fetching batch of posts ${after ? `after ${after}` : '(first batch)'}`);
      const newPosts = await reddit.getSubreddit(SUBREDDIT).getNew(options);
      
      if (newPosts.length === 0) {
        console.log('No more posts available');
        allPostsCollected = true;
        break;
      }
      
      // Update the "after" cursor for the next page
      after = newPosts.length > 0 ? `t3_${newPosts[newPosts.length - 1].id}` : null;
      
      console.log(`Found ${newPosts.length} posts in this batch`);
      
      // Flag to track if we've found posts older than our cutoff
      let foundOldPosts = false;
      
      // Process each post
      for (const post of newPosts) {
        // Check if post is older than the cutoff date
        const postDate = new Date(post.created_utc * 1000);
        if (postDate < lastCollectionTime) {
          tooOldPostsCount++;
          foundOldPosts = true;
          continue;
        }
        
        try {
          console.log(`Processing post: ${post.title} (${post.id})`);
          
          // Check if post already exists in database
          const { data: existingPosts } = await supabase
            .from('reddit_posts')
            .select('id')
            .eq('reddit_id', post.id);
          
          if (existingPosts && existingPosts.length > 0) {
            console.log(`Post ${post.id} already exists in database, skipping`);
            continue;
          }
          
          // Extract image URLs from post
          let imageUrls: string[] = [];
          
          if (post.url) {
            const urlLower = post.url.toLowerCase();
            if (IMAGE_EXTENSIONS.some(ext => urlLower.endsWith(ext))) {
              imageUrls.push(post.url);
            }
          }
          
          // Extract image URLs from post content (if self post)
          if (post.selftext) {
            const urlRegex = /https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/gi;
            const contentImageUrls = post.selftext.match(urlRegex) || [];
            imageUrls = [...imageUrls, ...contentImageUrls];
          }
          
          // Get post comments
          await rateLimiter.throttle();
          
          // Type assertion for expandReplies
          let commentsList: MappedComment[] = [];
          try {
            const comments = await (post as any).expandReplies({ limit: 50, depth: 2 });
            
            // Make sure comments is iterable before mapping
            if (comments && Array.isArray(comments)) {
              comments.forEach((comment: Snoowrap.Comment) => {
                if (comment && comment.id) {
                  commentsList.push({
                    reddit_id: comment.id,
                    body: comment.body || '',
                    author: comment.author?.name || '[deleted]',
                    created_at: new Date(comment.created_utc * 1000).toISOString(),
                    upvotes: comment.ups || 0,
                    parent_id: comment.parent_id || post.id,
                  });
                }
              });
            } else {
              console.log(`No valid comments found or comments not in expected format for post ${post.id}`);
            }
          } catch (commentError) {
            console.error(`Error fetching comments for post ${post.id}:`, commentError);
            // Continue processing the post even if comments fail
          }
          
          // Insert post data into Supabase
          const { data: postData, error: postError } = await supabase
            .from('reddit_posts')
            .insert({
              reddit_id: post.id,
              subreddit: SUBREDDIT,
              title: post.title,
              body: post.selftext,
              author: post.author.name,
              permalink: post.permalink,
              created_at: new Date(post.created_utc * 1000).toISOString(),
              ups: post.ups,
              downs: 0, // Reddit API doesn't provide this anymore
              score: post.score || post.ups, // Score is ups - downs
              num_comments: post.num_comments,
              url: post.url, // URL to the post content (might be external link)
              is_processed: false,
              image_urls: imageUrls.length > 0 ? imageUrls : [],
            })
            .select<'*', PostInsertResponse>('*');
          
          if (postError) {
            console.error('Error inserting post:', postError);
            continue;
          }
          
          // Get the inserted post ID
          const postId = postData?.[0]?.id || null;
          
          if (!postId) {
            console.error('Failed to get inserted post ID');
            continue;
          }
          
          // Insert comments data into Supabase
          if (commentsList.length > 0) {
            const { error: commentsError } = await supabase
              .from('reddit_comments')
              .insert(
                commentsList.map((comment: MappedComment) => ({
                  ...comment,
                  post_id: postId,
                }))
              );
            
            if (commentsError) {
              console.error('Error inserting comments:', commentsError);
            }
          }
          
          // Analyze post with GPT-4o mini
          await analyzeRedditPost(postId);
          
          totalProcessedPosts++;
          console.log(`Successfully processed post ${post.id}`);
        } catch (error) {
          console.error(`Error processing post ${post.id}:`, error);
        }
      }
      
      // If we've processed posts older than our cutoff, we can stop paginating
      if (foundOldPosts && tooOldPostsCount > 5) {
        console.log(`Found multiple posts older than the cutoff date (${lastCollectionTime.toLocaleString()}). Stopping pagination.`);
        allPostsCollected = true;
      }
      
      // If this batch had fewer posts than the page size, we've reached the end
      if (newPosts.length < PAGE_SIZE) {
        console.log('Reached the end of available posts');
        allPostsCollected = true;
      }
      
      console.log(`Processed ${totalProcessedPosts} posts so far. Skipped ${tooOldPostsCount} too-old posts.`);
    }
    
    // Update the last collection time in the database
    const now = new Date();
    const totalPostsCollected = previousPostsCollected + totalProcessedPosts;
    
    const { error: updateError } = await supabase
      .from('collection_metadata')
      .upsert({
        id: 'reddit-collection',
        last_collection_time: now.toISOString(),
        posts_collected: totalPostsCollected,
        last_updated: now.toISOString()
      });
    
    if (updateError) {
      console.error('Error updating collection metadata:', updateError);
    } else {
      console.log(`Updated collection metadata. New last collection time: ${now.toISOString()}`);
      console.log(`Total posts collected to date: ${totalPostsCollected}`);
    }
    
    console.log(`Reddit data collection completed. Processed ${totalProcessedPosts} posts in this run.`);
    return true;
  } catch (error) {
    console.error('Error in Reddit data collection:', error);
    return false;
  }
}

// Run the collector if this file is executed directly
if (require.main === module) {
  collectRedditData().then(() => {
    console.log('Reddit data collection process completed');
    process.exit(0);
  }).catch(error => {
    console.error('Error in Reddit data collection process:', error);
    process.exit(1);
  });
} 