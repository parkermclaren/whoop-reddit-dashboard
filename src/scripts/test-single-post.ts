// Test script for processing a single Reddit post
// Modified from reddit-collector.ts to process just one post for testing

import * as dotenv from 'dotenv';
import Snoowrap from 'snoowrap';
import { createClient } from '@supabase/supabase-js';
import { analyzeRedditPost } from './gpt-analyzer';

dotenv.config();

// Setup Reddit client using username/password authentication
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

// Constants
const SUBREDDIT = 'whoop';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// Helper function to extract image URLs from Reddit post
function extractImageUrls(post: Snoowrap.Submission): string[] {
  const imageUrls: string[] = [];
  
  // Extract from post URL if it's an image
  if (post.url && IMAGE_EXTENSIONS.some(ext => post.url.toLowerCase().endsWith(ext))) {
    imageUrls.push(post.url);
  }
  
  // Cast to any since these properties may not be in the type definitions
  const postAny = post as any;
  if (postAny.is_gallery && postAny.media_metadata) {
    Object.values(postAny.media_metadata).forEach((media: any) => {
      if (media.s && media.s.u) {
        imageUrls.push(media.s.u);
      }
    });
  }
  
  // Extract from post preview images
  if (postAny.preview && postAny.preview.images) {
    postAny.preview.images.forEach((image: any) => {
      if (image.source && image.source.url) {
        imageUrls.push(image.source.url);
      }
    });
  }
  
  return imageUrls;
}

// Define a type for the database response
type PostInsertResponse = {
  id: string;
  reddit_id: string;
  // Add other fields as needed
}

// Function to save post to Supabase
async function savePost(post: Snoowrap.Submission) {
  const imageUrls = extractImageUrls(post);
  
  // Log the image URLs found
  if (imageUrls.length > 0) {
    console.log(`Found ${imageUrls.length} images in post ${post.id}`);
  }
  
  const { data, error } = await supabase
    .from('reddit_posts')
    .upsert({
      reddit_id: `t3_${post.id}`,
      subreddit: post.subreddit.display_name,
      title: post.title,
      body: post.selftext,
      author: post.author.name,
      permalink: `https://reddit.com${post.permalink}`,
      created_at: new Date(post.created_utc * 1000).toISOString(),
      ups: post.ups,
      downs: post.downs,
      score: post.score,
      num_comments: post.num_comments,
      is_processed: false,
      image_urls: imageUrls,
      metadata: {
        is_self: post.is_self,
        is_video: post.is_video,
        over_18: post.over_18,
        spoiler: post.spoiler,
        stickied: post.stickied,
        is_original_content: post.is_original_content,
        link_flair_text: post.link_flair_text,
      },
      inserted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'reddit_id' })
    .select<'*', PostInsertResponse>();
  
  if (error) {
    console.error(`Error saving post ${post.id}:`, error);
    return null;
  }
  
  return data?.[0]?.id || null;
}

// Function to fetch and save comments for a post
async function fetchAndSaveComments(post: Snoowrap.Submission, postDbId: string) {
  console.log(`Fetching comments for post ${post.id}...`);
  
  const comments = await post.comments;
  let savedCount = 0;
  
  // Process each top-level comment (limited to top 5 for testing)
  const topComments = comments.slice(0, 5);
  
  for (const comment of topComments) {
    if (comment.author && comment.body) {
      // Save the comment
      const { data, error } = await supabase
        .from('reddit_comments')
        .upsert({
          reddit_id: `t1_${comment.id}`,
          post_id: postDbId,
          parent_comment_id: null, // Top-level comment
          body: comment.body,
          author: comment.author.name,
          created_at: new Date(comment.created_utc * 1000).toISOString(),
          ups: comment.ups,
          downs: 0, // Reddit API no longer returns this
          score: comment.score,
          is_processed: false,
          metadata: {
            is_submitter: comment.is_submitter,
            stickied: comment.stickied,
            distinguished: comment.distinguished,
          },
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'reddit_id' })
        .select<'*', PostInsertResponse>();
      
      if (error) {
        console.error(`Error saving comment ${comment.id}:`, error);
      } else {
        savedCount++;
        
        // Get just 1 reply to this comment for testing if they exist
        if (comment.replies && comment.replies.length > 0) {
          const commentDbId = data?.[0]?.id;
          const firstReply = comment.replies[0];
          
          if (firstReply && firstReply.author && firstReply.body) {
            await supabase
              .from('reddit_comments')
              .upsert({
                reddit_id: `t1_${firstReply.id}`,
                post_id: postDbId,
                parent_comment_id: commentDbId,
                body: firstReply.body,
                author: firstReply.author.name,
                created_at: new Date(firstReply.created_utc * 1000).toISOString(),
                ups: firstReply.ups,
                downs: 0,
                score: firstReply.score,
                is_processed: false,
                metadata: {
                  is_submitter: firstReply.is_submitter,
                  stickied: firstReply.stickied,
                  distinguished: firstReply.distinguished,
                },
                inserted_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'reddit_id' });
            
            savedCount++;
          }
        }
      }
    }
  }
  
  console.log(`Saved ${savedCount} comments for post ${post.id}`);
}

// Main execution function
async function main() {
  try {
    console.log('Starting single post test...');
    
    // Fetch the top post from the subreddit
    console.log(`Fetching top post from r/${SUBREDDIT}...`);
    const topPosts = await reddit.getSubreddit(SUBREDDIT).getTop({ time: 'week', limit: 1 });
    
    if (topPosts.length === 0) {
      console.error('No posts found!');
      return;
    }
    
    const post = topPosts[0];
    console.log(`Processing post: "${post.title}" by u/${post.author.name}`);
    
    // Save post to database
    const postDbId = await savePost(post);
    
    if (postDbId) {
      console.log(`Post saved with database ID: ${postDbId}`);
      
      // Fetch and save comments for this post
      await fetchAndSaveComments(post, postDbId);
      
      // Analyze post with GPT-4o mini (with image support)
      console.log('Starting GPT-4o mini analysis...');
      const analysisResult = await analyzeRedditPost(postDbId);
      console.log(`Analysis completed with result: ${analysisResult ? 'Success' : 'Failed'}`);
    } else {
      console.error('Failed to save post');
    }
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error in test execution:', error);
  }
}

// Run the main function
main().catch(console.error); 