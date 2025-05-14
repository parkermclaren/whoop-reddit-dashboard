// WHOOP Reddit Dashboard Continuous Pipeline
// Runs the data pipeline for continuous data streaming:
// 1. Collect new Reddit data since last run
// 2. Analyze unprocessed posts with GPT-4o mini
// 3. Run extended analysis on newly processed posts
// 4. Run product review analysis on newly processed posts
// 5. Process question embeddings for newly analyzed posts
// 6. Update metrics for existing posts (based on their age)

import * as dotenv from 'dotenv';
import { collectRedditData } from './reddit-collector';
import { analyzeUnprocessedPosts } from './gpt-analyzer';
import { extendAnalysisForPost } from './extended-analyzer';
import { analyzeProductReviewForPost } from './product-review-analyzer';
import { processNewQuestions } from './add-new-embeddings';
import { updatePostMetrics } from './update-post-metrics';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Main continuous pipeline function that runs all steps in sequence
 */
async function runContinuousPipeline(): Promise<boolean> {
  console.log('🚀 Starting WHOOP Reddit continuous pipeline...');
  console.log('This will collect new posts, analyze them with GPT-4o mini, and run extended analysis.');
  console.log('-----------------------------------------------------------');
  
  try {
    // Step 1: Collect new Reddit data since last run
    console.log('\n📥 STEP 1: Collecting new Reddit posts...');
    const collectionSuccess = await collectRedditData();
    
    if (!collectionSuccess) {
      console.error('⚠️ Reddit data collection encountered errors, but continuing with pipeline...');
    }
    
    // Step 2: Analyze unprocessed posts with GPT-4o mini
    // Keep track of newly processed posts for subsequent analysis
    console.log('\n🧠 STEP 2: Analyzing unprocessed posts...');
    
    // Get posts that need to be analyzed before we run the analyzer
    const { data: postsToProcess, error: fetchError } = await supabase
      .from('reddit_posts')
      .select('id, title')
      .eq('is_processed', false)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (fetchError) {
      console.error('Error fetching unprocessed posts:', fetchError);
      return false;
    }
    
    // Store the IDs of posts we're about to process
    const postsToAnalyzeIds = postsToProcess && postsToProcess.length > 0 
      ? postsToProcess.map(post => post.id) 
      : [];
    
    console.log(`Found ${postsToAnalyzeIds.length} posts to analyze in this run.`);
    
    if (postsToAnalyzeIds.length === 0) {
      console.log('No new posts to analyze. Pipeline completed.');
      return true;
    }
    
    // Run the basic analysis
    const analysisSuccess = await analyzeUnprocessedPosts();
    
    if (!analysisSuccess) {
      console.error('⚠️ Post analysis encountered errors, but continuing with pipeline...');
    }
    
    // Step 3: Run extended analysis ONLY on the posts we just processed in this run
    if (postsToAnalyzeIds.length > 0) {
      console.log('\n🔍 STEP 3: Running extended analysis on newly processed posts...');
      
      // Get the analysis results for the posts we just processed
      const { data: newlyAnalyzedPosts, error: analysisError } = await supabase
        .from('analysis_results')
        .select('id, content_id')
        .eq('content_type', 'post')
        .in('content_id', postsToAnalyzeIds);
      
      if (analysisError) {
        console.error('Error fetching newly analyzed posts:', analysisError);
      } else if (newlyAnalyzedPosts && newlyAnalyzedPosts.length > 0) {
        console.log(`Found ${newlyAnalyzedPosts.length} newly analyzed posts that need extended analysis.`);
        
        // Run extended analysis on each post
        let extendedSuccessCount = 0;
        let extendedFailedCount = 0;
        
        for (const post of newlyAnalyzedPosts) {
          try {
            const success = await extendAnalysisForPost(post.content_id);
            
            if (success) {
              extendedSuccessCount++;
            } else {
              extendedFailedCount++;
            }
            
            // Add delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`Error running extended analysis for post ${post.content_id}:`, error);
            extendedFailedCount++;
          }
        }
        
        console.log(`Extended analysis complete! Success: ${extendedSuccessCount}, Failed: ${extendedFailedCount}`);
      } else {
        console.log('No newly analyzed posts found for extended analysis.');
      }
      
      // Step 4: Run product review analysis ONLY on the posts we just processed in this run
      console.log('\n🔍 STEP 4: Running product review analysis on newly processed posts...');
      
      // We can reuse the same newlyAnalyzedPosts from Step 3
      if (newlyAnalyzedPosts && newlyAnalyzedPosts.length > 0) {
        console.log(`Found ${newlyAnalyzedPosts.length} newly analyzed posts that need product review analysis.`);
        
        // Run product review analysis on each post
        let productSuccessCount = 0;
        let productFailedCount = 0;
        
        for (const post of newlyAnalyzedPosts) {
          try {
            const success = await analyzeProductReviewForPost(post.content_id);
            
            if (success) {
              productSuccessCount++;
            } else {
              productFailedCount++;
            }
            
            // Add delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error(`Error running product review analysis for post ${post.content_id}:`, error);
            productFailedCount++;
          }
        }
        
        console.log(`Product review analysis complete! Success: ${productSuccessCount}, Failed: ${productFailedCount}`);
      } else {
        console.log('No newly analyzed posts found for product review analysis.');
      }
    }
    
    // Step 5: Process question embeddings for newly analyzed posts
    console.log('\n🧠 STEP 5: Processing question embeddings from newly analyzed posts...');
    
    if (postsToAnalyzeIds.length > 0) {
      try {
        await processNewQuestions(postsToAnalyzeIds.length);
        console.log('Question embeddings processing completed successfully.');
      } catch (error) {
        console.error('Error processing question embeddings:', error);
        console.log('⚠️ Question embeddings processing encountered errors, but continuing with pipeline...');
      }
    } else {
      console.log('No new posts to process for question embeddings.');
    }
    
    // Step 6: Update metrics for existing posts based on their age
    console.log('\n📊 STEP 6: Updating metrics for existing posts...');
    try {
      const metricsUpdateSuccess = await updatePostMetrics();
      if (metricsUpdateSuccess) {
        console.log('Post metrics update completed successfully.');
      } else {
        console.log('⚠️ Post metrics update encountered errors, but continuing with pipeline...');
      }
    } catch (error) {
      console.error('Error updating post metrics:', error);
      console.log('⚠️ Post metrics update encountered errors, but continuing with pipeline...');
    }
    
    console.log('\n✅ Continuous pipeline completed successfully.');
    console.log(`Analyzed ${postsToAnalyzeIds.length} new posts with all analyzers and processed question embeddings.`);
    console.log('The dashboard will automatically reflect the updated data.');
    return true;
  } catch (error) {
    console.error('❌ Error in continuous pipeline:', error);
    return false;
  }
}

// Run the continuous pipeline if this file is executed directly
if (require.main === module) {
  runContinuousPipeline()
    .then(success => {
      console.log(success ? 'Pipeline completed successfully.' : 'Pipeline encountered errors.');
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error in pipeline execution:', error);
      process.exit(1);
    });
}

export { runContinuousPipeline }; 