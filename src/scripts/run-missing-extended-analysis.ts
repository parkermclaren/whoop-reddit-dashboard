import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { extendAnalysisForPost } from './extended-analyzer';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Process posts that have been analyzed but don't have extended analysis yet
 */
async function processMissingExtendedAnalysis(): Promise<void> {
  console.log("🔍 Starting extended analysis for posts missing extended data...");
  console.log("This will add competitor mentions, aspect-based sentiment, cancellation signals, and user questions");
  console.log("ONLY to posts that have been analyzed but don't have extended analysis yet.");
  console.log("-----------------------------------------------------------");
  
  // Query to find posts that need extended analysis using all four criteria:
  // 1. competitor_mentions is []
  // 2. aspects is []
  // 3. cancellation_mention is FALSE
  // 4. cancellation_reason is NULL
  const { data: postsToProcess, error } = await supabase
    .from('analysis_results')
    .select('content_id, inserted_at')
    .eq('content_type', 'post')
    .eq('competitor_mentions', '[]')
    .eq('aspects', '[]')
    .eq('cancellation_mention', false)
    .is('cancellation_reason', null)
    .order('inserted_at', { ascending: false });
  
  if (error || !postsToProcess) {
    console.error("Error fetching posts needing extended analysis:", error);
    return;
  }
  
  console.log(`Found ${postsToProcess.length} analyzed posts that need extended analysis...`);
  
  // Process posts in batches
  const batchSize = 5;
  let successCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < postsToProcess.length; i += batchSize) {
    const batch = postsToProcess.slice(i, i + batchSize);
    
    for (const post of batch) {
      try {
        console.log(`Processing post ${post.content_id}...`);
        const success = await extendAnalysisForPost(post.content_id);
        
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
    
    console.log(`Progress: ${i + Math.min(batchSize, batch.length)}/${postsToProcess.length} posts processed`);
    
    if (i + batchSize < postsToProcess.length) {
      console.log("Waiting between batches...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log("-----------------------------------------------------------");
  console.log(`✅ Extended analysis complete! Success: ${successCount}, Failed: ${failedCount}`);
}

// Run the function
processMissingExtendedAnalysis()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  }); 