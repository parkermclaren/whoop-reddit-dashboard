// Count Posts Script
// Counts the number of posts on r/whoop since May 8, 2023, at 10am
// Helps estimate processing time with rate limiting

import * as dotenv from 'dotenv';
import Snoowrap from 'snoowrap';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env.local if it exists
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  console.log('Loading environment from .env.local');
  dotenv.config({ path: envLocalPath });
} else {
  console.log('Loading environment from .env');
  dotenv.config();
}

// Debug: check if credentials are available
console.log('Checking Reddit credentials:');
console.log('- Client ID exists:', !!process.env.REDDIT_CLIENT_ID);
console.log('- Client Secret exists:', !!process.env.REDDIT_CLIENT_SECRET);
console.log('- Username exists:', !!process.env.REDDIT_USERNAME);
console.log('- Password exists:', !!process.env.REDDIT_PASSWORD);

// Add rate limiting to avoid hitting Reddit API limits (10 requests per minute for non-OAuth)
const rateLimiter = {
  lastRequestTime: 0,
  minInterval: 6000, // 6 seconds between requests (10 per minute)
  
  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
};

// Setup Reddit client using username/password authentication
const reddit = new Snoowrap({
  userAgent: 'WHOOP Reddit Dashboard v1.0',
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  username: process.env.REDDIT_USERNAME,
  password: process.env.REDDIT_PASSWORD
});

// Constants
const SUBREDDIT = 'whoop';
const POSTS_PER_PAGE = 100; // Reddit API limit per page

// Set the target date - May 8, 2025, at 10am
const ANNOUNCEMENT_DATE = new Date('2025-05-08T10:00:00');
console.log(`Target announcement date: ${ANNOUNCEMENT_DATE.toISOString()}`);

// Main function to count Reddit posts
async function countRedditPosts(): Promise<void> {
  try {
    console.log(`Counting posts from r/${SUBREDDIT} since ${ANNOUNCEMENT_DATE.toLocaleString()}...`);
    
    let allPosts: Snoowrap.Submission[] = [];
    let after: string | undefined = undefined;
    let keepFetching = true;
    let pageCount = 0;
    
    // Use pagination to get all posts
    while (keepFetching) {
      pageCount++;
      console.log(`Fetching page ${pageCount}...`);
      
      // Apply rate limiting
      await rateLimiter.throttle();
      
      // Get posts from the subreddit
      const response = await reddit.getSubreddit(SUBREDDIT).getNew({
        limit: POSTS_PER_PAGE,
        after: after
      });
      
      if (response.length === 0) {
        // No more results
        keepFetching = false;
        continue;
      }
      
      // Check if we've gone past the target date
      const oldestPostDate = new Date(response[response.length - 1].created_utc * 1000);
      if (oldestPostDate < ANNOUNCEMENT_DATE) {
        // We've reached posts older than the announcement date
        // Add only the posts since the announcement
        const recentPosts = response.filter(post => {
          const postDate = new Date(post.created_utc * 1000);
          return postDate >= ANNOUNCEMENT_DATE;
        });
        
        allPosts = [...allPosts, ...recentPosts];
        keepFetching = false;
        continue;
      }
      
      // Add all posts from this page
      allPosts = [...allPosts, ...response];
      
      // Update 'after' for next page
      after = response.length > 0 ? response[response.length - 1].name : undefined;
      
      // If we got fewer than the requested limit, there are no more posts
      if (response.length < POSTS_PER_PAGE) {
        keepFetching = false;
      }
    }
    
    // Calculate days since announcement
    const daysSinceAnnouncement = Math.ceil((Date.now() - ANNOUNCEMENT_DATE.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`Found ${allPosts.length} posts from r/${SUBREDDIT} in the ${daysSinceAnnouncement} days since the announcement after checking ${pageCount} pages.`);
    
    // Estimate processing time
    const requestsPerPost = 2; // Fetch post + comments
    const secondsPerRequest = 6; // Our rate limit
    const totalRequests = allPosts.length * requestsPerPost;
    const estimatedSeconds = totalRequests * secondsPerRequest;
    const estimatedMinutes = Math.ceil(estimatedSeconds / 60);
    const estimatedHours = (estimatedMinutes / 60).toFixed(1);
    
    console.log(`With rate limiting, processing could take approximately:`);
    console.log(`- ${totalRequests} API requests`);
    console.log(`- ${estimatedSeconds} seconds`);
    console.log(`- ${estimatedMinutes} minutes (${estimatedHours} hours)`);
    console.log(`This is a rough estimate and may vary based on the number of comments and images.`);
    
  } catch (error) {
    console.error('Error counting Reddit posts:', error);
  }
}

// Run the counter
countRedditPosts().then(() => {
  console.log('Post counting completed');
  process.exit(0);
}).catch(error => {
  console.error('Error in post counting process:', error);
  process.exit(1);
}); 