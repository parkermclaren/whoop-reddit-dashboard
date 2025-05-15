import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { analyzeProductReviewForPost } from './product-review-analyzer';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Process posts that have been analyzed but don't have product review analysis yet
 */
async function processMissingProductAnalysis(): Promise<void> {
  console.log("🔍 Starting product review analysis for posts missing product data...");
  console.log("This will detect when users have received a new product and analyze their satisfaction level");
  console.log("ONLY for posts that have been analyzed but don't have product review analysis yet.");
  console.log("-----------------------------------------------------------");
  
  // Get all posts that need product review analysis
  const { data: analyzedPosts, error } = await supabase
    .from('analysis_results')
    .select('content_id')
    .eq('content_type', 'post')
    .is('product_received', null) // Field populated by product review analysis
    .order('inserted_at', { ascending: false });
  
  if (error || !analyzedPosts) {
    console.error("Error fetching posts needing product review analysis:", error);
    return;
  }
  
  console.log(`Found ${analyzedPosts.length} analyzed posts that need product review analysis...`);
  
  // Process posts in batches
  const batchSize = 5;
  let successCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < analyzedPosts.length; i += batchSize) {
    const batch = analyzedPosts.slice(i, i + batchSize);
    
    for (const post of batch) {
      try {
        console.log(`Processing post ${post.content_id}...`);
        const success = await analyzeProductReviewForPost(post.content_id);
        
        if (success) {
          successCount++;
        } else {
          failedCount++;
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (error) {
        console.error(`Error processing post ${post.content_id}:`, error);
        failedCount++;
      }
    }
    
    console.log(`Progress: ${i + Math.min(batchSize, batch.length)}/${analyzedPosts.length} posts processed`);
    
    if (i + batchSize < analyzedPosts.length) {
      console.log("Waiting between batches...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log("-----------------------------------------------------------");
  console.log(`✅ Product review analysis complete! Success: ${successCount}, Failed: ${failedCount}`);
}

// Run the function
processMissingProductAnalysis()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  }); 