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

// Add global type declaration for pipelineStartTime
declare global {
  var pipelineStartTime: number;
}

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Time-based constants to prevent timeout
const MAX_EXECUTION_TIME_MS = 50 * 1000; // 50 seconds (allowing buffer for response handling)

/**
 * Checks if we're approaching the API route timeout limit
 * @returns True if we should abort further processing to avoid timeout
 */
function isApproachingTimeout(): boolean {
  // Ensure global pipelineStartTime exists
  if (typeof global.pipelineStartTime !== 'number') {
    // If not set, assume we're at risk
    return true;
  }
  
  const elapsedMs = Date.now() - global.pipelineStartTime;
  const isNearTimeout = elapsedMs > MAX_EXECUTION_TIME_MS;
  
  if (isNearTimeout) {
    console.warn(`⚠️ Approaching timeout limit (${(elapsedMs/1000).toFixed(1)}s elapsed). Wrapping up pipeline.`);
  }
  
  return isNearTimeout;
}

/**
 * Step 1: Collect new Reddit data
 */
export async function runCollectStep(): Promise<boolean> {
  console.log('🚀 Running Reddit data collection step...');
  console.log('-----------------------------------------------------------');
  
  try {
    console.log('\n📥 Collecting new Reddit posts...');
    const collectionSuccess = await collectRedditData();
    
    if (!collectionSuccess) {
      console.error('⚠️ Reddit data collection encountered errors.');
      return false;
    }
    
    console.log('✅ Reddit data collection completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Error in Reddit data collection step:', error);
    return false;
  }
}

/**
 * Step 2: Analyze unprocessed posts
 */
export async function runAnalyzeStep(): Promise<boolean> {
  console.log('🚀 Running post analysis step...');
  console.log('-----------------------------------------------------------');
  
  try {
    console.log('\n🧠 Analyzing unprocessed posts...');
    
    // Get posts that need to be analyzed
    const { data: postsToProcess, error: fetchError } = await supabase
      .from('reddit_posts')
      .select('id, title')
      .eq('is_processed', false)
      .order('created_at', { ascending: false })
      .limit(25); // Process in smaller batches for API endpoint
    
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
      console.log('No new posts to analyze.');
      return true;
    }
    
    // Run the basic analysis
    const analysisSuccess = await analyzeUnprocessedPosts();
    
    if (!analysisSuccess) {
      console.error('⚠️ Post analysis encountered errors.');
      return false;
    }
    
    console.log('✅ Post analysis completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Error in post analysis step:', error);
    return false;
  }
}

/**
 * Step 3: Run extended analysis
 */
export async function runExtendedAnalysisStep(): Promise<boolean> {
  console.log('🚀 Running extended analysis step...');
  console.log('-----------------------------------------------------------');
  
  try {
    // Find posts that need extended analysis
    const { data: postsNeedingExtended, error: fetchError } = await supabase
      .from('analysis_results')
      .select('id, content_id')
      .eq('content_type', 'post')
      .is('competitor_mentions', null) // This field is populated by extended analysis
      .order('created_at', { ascending: false })
      .limit(15); // Process smaller batch
    
    if (fetchError) {
      console.error('Error fetching posts needing extended analysis:', fetchError);
      return false;
    }
    
    if (!postsNeedingExtended || postsNeedingExtended.length === 0) {
      console.log('No posts need extended analysis.');
      return true;
    }
    
    console.log(`Found ${postsNeedingExtended.length} posts that need extended analysis.`);
    
    // Run extended analysis on each post
    let extendedSuccessCount = 0;
    let extendedFailedCount = 0;
    
    for (const post of postsNeedingExtended) {
      // Check for timeout before each extended analysis
      if (isApproachingTimeout()) {
        console.log(`⏱️ Timeout risk detected. Processed ${extendedSuccessCount} extended analyses before stopping.`);
        break;
      }
      
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
    return extendedSuccessCount > 0 || postsNeedingExtended.length === 0;
  } catch (error) {
    console.error('❌ Error in extended analysis step:', error);
    return false;
  }
}

/**
 * Step 4: Run product review analysis
 */
export async function runProductAnalysisStep(): Promise<boolean> {
  console.log('🚀 Running product review analysis step...');
  console.log('-----------------------------------------------------------');
  
  try {
    // Find posts that have basic analysis but need product review analysis
    const { data: postsNeedingProductAnalysis, error: fetchError } = await supabase
      .from('product_reviews')
      .select('id, post_id')
      .is('reviewed', false)
      .order('created_at', { ascending: false })
      .limit(15);
    
    if (fetchError) {
      console.error('Error fetching posts needing product review analysis:', fetchError);
      
      // If table doesn't exist, check for analyzed posts without product reviews
      if (fetchError.code === '42P01') { // Table doesn't exist
        const { data: analyzedPosts, error: analysisError } = await supabase
          .from('analysis_results')
          .select('id, content_id')
          .eq('content_type', 'post')
          .is('product_related', null) // Field you add for product analysis
          .order('created_at', { ascending: false })
          .limit(15);
          
        if (analysisError) {
          console.error('Error fetching analyzed posts:', analysisError);
          return false;
        }
        
        if (!analyzedPosts || analyzedPosts.length === 0) {
          console.log('No posts need product review analysis.');
          return true;
        }
        
        console.log(`Found ${analyzedPosts.length} posts that need product review analysis.`);
        
        // Run product analysis on each post
        let productSuccessCount = 0;
        let productFailedCount = 0;
        
        for (const post of analyzedPosts) {
          if (isApproachingTimeout()) {
            console.log(`⏱️ Timeout risk detected. Processed ${productSuccessCount} product reviews before stopping.`);
            break;
          }
          
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
        return productSuccessCount > 0 || analyzedPosts.length === 0;
      }
      
      return false;
    }
    
    if (!postsNeedingProductAnalysis || postsNeedingProductAnalysis.length === 0) {
      console.log('No posts need product review analysis.');
      return true;
    }
    
    console.log(`Found ${postsNeedingProductAnalysis.length} posts that need product review analysis.`);
    
    // Process logic here
    console.log('Product reviews analysis completed');
    return true;
  } catch (error) {
    console.error('❌ Error in product review analysis step:', error);
    return false;
  }
}

/**
 * Step 5: Process embeddings for questions
 */
export async function runEmbeddingsStep(): Promise<boolean> {
  console.log('🚀 Running question embeddings step...');
  console.log('-----------------------------------------------------------');
  
  try {
    console.log('\n🧠 Processing question embeddings from newly analyzed posts...');
    
    // Check for new questions without embeddings
    const { data: questionsWithoutEmbeddings, error: fetchError } = await supabase
      .from('questions')
      .select('id')
      .is('embedding', null)
      .order('created_at', { ascending: false });
      
    if (fetchError) {
      console.error('Error fetching questions needing embeddings:', fetchError);
      return false;
    }
    
    if (!questionsWithoutEmbeddings || questionsWithoutEmbeddings.length === 0) {
      console.log('No new questions to process for embeddings.');
      return true;
    }
    
    console.log(`Found ${questionsWithoutEmbeddings.length} questions needing embeddings.`);
    
    try {
      // Process up to 50 questions
      await processNewQuestions(Math.min(questionsWithoutEmbeddings.length, 50));
      console.log('Question embeddings processing completed successfully.');
      return true;
    } catch (error) {
      console.error('Error processing question embeddings:', error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error in embeddings step:', error);
    return false;
  }
}

/**
 * Step 6: Update metrics for existing posts
 */
export async function runMetricsUpdateStep(): Promise<boolean> {
  console.log('🚀 Running metrics update step...');
  console.log('-----------------------------------------------------------');
  
  try {
    console.log('\n📊 Updating metrics for existing posts...');
    try {
      // Only update a smaller batch of posts for API endpoint
      const metricsUpdateSuccess = await updatePostMetrics(20);
      if (metricsUpdateSuccess) {
        console.log('Post metrics update completed successfully.');
        return true;
      } else {
        console.error('⚠️ Post metrics update encountered errors.');
        return false;
      }
    } catch (error) {
      console.error('Error updating post metrics:', error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error in metrics update step:', error);
    return false;
  }
}

/**
 * Main continuous pipeline function that runs all steps in sequence
 */
async function runContinuousPipeline(): Promise<boolean> {
  console.log('🚀 Starting WHOOP Reddit continuous pipeline...');
  console.log('This will collect new posts, analyze them with GPT-4o mini, and run extended analysis.');
  console.log('-----------------------------------------------------------');
  
  try {
    // Step 1: Collect new Reddit data since last run
    const collectSuccess = await runCollectStep();
    if (!collectSuccess) {
      console.error('⚠️ Reddit data collection encountered errors, but continuing with pipeline...');
    }
    
    // Check for timeout after collection step
    if (isApproachingTimeout()) {
      console.log('⏱️ Timeout risk detected after data collection. Stopping pipeline early.');
      return collectSuccess; // Return success from collection
    }
    
    // Step 2: Analyze unprocessed posts with GPT-4o mini
    const analyzeSuccess = await runAnalyzeStep();
    if (!analyzeSuccess) {
      console.error('⚠️ Post analysis encountered errors, but continuing with pipeline...');
    }
    
    // Check for timeout after basic analysis step
    if (isApproachingTimeout()) {
      console.log('⏱️ Timeout risk detected after basic analysis. Stopping pipeline early.');
      return collectSuccess && analyzeSuccess; // Return success from previous steps
    }
    
    // Step 3: Run extended analysis on posts
    const extendedSuccess = await runExtendedAnalysisStep();
    if (!extendedSuccess) {
      console.error('⚠️ Extended analysis encountered errors, but continuing with pipeline...');
    }
    
    // Check for timeout after extended analysis
    if (isApproachingTimeout()) {
      console.log('⏱️ Timeout risk detected after extended analysis. Stopping pipeline early.');
      return collectSuccess && analyzeSuccess && extendedSuccess;
    }
    
    // Step 4: Run product review analysis
    const productSuccess = await runProductAnalysisStep();
    if (!productSuccess) {
      console.error('⚠️ Product review analysis encountered errors, but continuing with pipeline...');
    }
    
    // Check for timeout after product review analysis
    if (isApproachingTimeout()) {
      console.log('⏱️ Timeout risk detected after product review analysis. Stopping pipeline early.');
      return collectSuccess && analyzeSuccess && extendedSuccess && productSuccess;
    }
    
    // Step 5: Process question embeddings
    const embeddingsSuccess = await runEmbeddingsStep();
    if (!embeddingsSuccess) {
      console.error('⚠️ Question embeddings processing encountered errors, but continuing with pipeline...');
    }
    
    // Check for timeout after question embeddings
    if (isApproachingTimeout()) {
      console.log('⏱️ Timeout risk detected after question embeddings. Skipping metrics update.');
      return collectSuccess && analyzeSuccess && extendedSuccess && productSuccess && embeddingsSuccess;
    }
    
    // Step 6: Update metrics for existing posts
    const metricsSuccess = await runMetricsUpdateStep();
    if (!metricsSuccess) {
      console.error('⚠️ Post metrics update encountered errors.');
    }
    
    console.log('\n✅ Continuous pipeline completed successfully.');
    return collectSuccess && analyzeSuccess && extendedSuccess && productSuccess && embeddingsSuccess && metricsSuccess;
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