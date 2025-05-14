import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Setup OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Cache file for embeddings to avoid regenerating
const EMBEDDINGS_CACHE_FILE = path.join(process.cwd(), 'tmp', 'embeddings-cache.json');

// Embedding model to use
const EMBEDDING_MODEL = "text-embedding-ada-002";

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return -1;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate embedding for a single question
 */
async function generateEmbedding(question: string): Promise<number[]> {
  // Try to load from cache first
  let embeddingsCache: Record<string, number[]> = {};
  try {
    const cacheDir = path.dirname(EMBEDDINGS_CACHE_FILE);
    await fs.mkdir(cacheDir, { recursive: true });
    const cacheData = await fs.readFile(EMBEDDINGS_CACHE_FILE, 'utf-8');
    embeddingsCache = JSON.parse(cacheData);
    
    // If question is in cache, return it
    if (embeddingsCache[question]) {
      return embeddingsCache[question];
    }
  } catch (err) {
    console.log("No cache found or error loading cache, will generate embedding");
    // Create empty cache
    embeddingsCache = {};
  }
  
  // Generate new embedding
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: question
    });
    
    const embedding = response.data[0].embedding;
    
    // Save to cache
    embeddingsCache[question] = embedding;
    await fs.writeFile(EMBEDDINGS_CACHE_FILE, JSON.stringify(embeddingsCache), 'utf-8');
    
    return embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

/**
 * Find the most similar cluster for a question
 */
async function findBestCluster(embedding: number[]): Promise<string | null> {
  try {
    // Get all existing clusters with their centroids
    const { data: clusters, error } = await supabase
      .from('question_clusters')
      .select('id, centroid');
    
    if (error) {
      console.error("Error fetching clusters:", error);
      throw error;
    }
    
    if (!clusters || clusters.length === 0) {
      console.log("No existing clusters found");
      return null;
    }
    
    // Find the most similar cluster
    let bestClusterId = null;
    let bestSimilarity = -1;
    
    for (const cluster of clusters) {
      if (!cluster.centroid) continue;
      
      const similarity = cosineSimilarity(embedding, cluster.centroid);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestClusterId = cluster.id;
      }
    }
    
    // Only assign to a cluster if similarity is above threshold
    const SIMILARITY_THRESHOLD = 0.8; // Adjust as needed
    if (bestSimilarity < SIMILARITY_THRESHOLD) {
      console.log(`Best similarity (${bestSimilarity}) below threshold (${SIMILARITY_THRESHOLD}), not assigning to any cluster`);
      return null;
    }
    
    console.log(`Best cluster: ${bestClusterId}, similarity: ${bestSimilarity}`);
    return bestClusterId;
  } catch (error) {
    console.error("Error finding best cluster:", error);
    throw error;
  }
}

/**
 * Add a question to a cluster
 */
async function addQuestionToCluster(
  question: string, 
  embedding: number[], 
  clusterId: string, 
  postId: string,
  postTitle: string,
  postUrl: string
): Promise<boolean> {
  try {
    // Insert question into question_embeddings
    const { error: insertError } = await supabase
      .from('question_embeddings')
      .insert({
        question: question,
        embedding: embedding,
        cluster_id: clusterId,
        reddit_post_id: postId,
        post_title: postTitle,
        post_url: postUrl
      });
    
    if (insertError) {
      console.error("Error inserting question:", insertError);
      return false;
    }
    
    // Update question count in cluster
    const { error: updateError } = await supabase.rpc(
      'increment_question_count',
      { cluster_id: clusterId }
    );
    
    if (updateError) {
      console.error("Error updating question count:", updateError);
      console.log("Trying direct update instead...");
      
      // Fallback to direct update
      const { error: directUpdateError } = await supabase
        .from('question_clusters')
        .update({ question_count: supabase.rpc('get_question_count', { cluster_id: clusterId }) })
        .eq('id', clusterId);
      
      if (directUpdateError) {
        console.error("Error with direct update:", directUpdateError);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error adding question to cluster:", error);
    return false;
  }
}

/**
 * Extract questions from a post's analysis results
 */
async function extractQuestionsFromPost(postId: string): Promise<{question: string, postId: string, postTitle: string, postUrl: string}[]> {
  try {
    // Get analysis results for the post
    const { data: analysisResults, error: analysisError } = await supabase
      .from('analysis_results')
      .select('user_questions, content_id')
      .eq('content_id', postId)
      .eq('content_type', 'post')
      .single();
    
    if (analysisError) {
      console.error("Error fetching analysis results:", analysisError);
      return [];
    }
    
    if (!analysisResults || !analysisResults.user_questions || !Array.isArray(analysisResults.user_questions) || analysisResults.user_questions.length === 0) {
      console.log(`No questions found for post ${postId}`);
      return [];
    }
    
    // Get post details
    const { data: postData, error: postError } = await supabase
      .from('reddit_posts')
      .select('id, title, url')
      .eq('id', postId)
      .single();
    
    if (postError) {
      console.error("Error fetching post details:", postError);
      return [];
    }
    
    // Map questions to objects with post details
    return analysisResults.user_questions.map((question: string) => ({
      question,
      postId: postData.id,
      postTitle: postData.title || '',
      postUrl: postData.url || ''
    }));
  } catch (error) {
    console.error("Error extracting questions:", error);
    return [];
  }
}

/**
 * Check if a question is already in the database
 */
async function isQuestionAlreadyEmbedded(question: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('question_embeddings')
      .select('id')
      .eq('question', question)
      .limit(1);
    
    if (error) {
      console.error("Error checking if question exists:", error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error("Error checking if question exists:", error);
    return false;
  }
}

/**
 * Process new questions from a post
 */
async function processPostQuestions(postId: string): Promise<{added: number, skipped: number, failed: number}> {
  console.log(`Processing questions for post ${postId}...`);
  
  const stats = {
    added: 0,
    skipped: 0,
    failed: 0
  };
  
  try {
    // Extract questions from post
    const questions = await extractQuestionsFromPost(postId);
    
    if (questions.length === 0) {
      console.log(`No questions found for post ${postId}`);
      return stats;
    }
    
    console.log(`Found ${questions.length} questions for post ${postId}`);
    
    // Process each question
    for (const questionData of questions) {
      // Check if question already exists
      const exists = await isQuestionAlreadyEmbedded(questionData.question);
      
      if (exists) {
        console.log(`Question already embedded: "${questionData.question.substring(0, 50)}..."`);
        stats.skipped++;
        continue;
      }
      
      // Generate embedding
      const embedding = await generateEmbedding(questionData.question);
      
      // Find best cluster
      const bestClusterId = await findBestCluster(embedding);
      
      if (!bestClusterId) {
        console.log(`No suitable cluster found for question: "${questionData.question.substring(0, 50)}..."`);
        stats.skipped++;
        continue;
      }
      
      // Add question to cluster
      const success = await addQuestionToCluster(
        questionData.question,
        embedding,
        bestClusterId,
        questionData.postId,
        questionData.postTitle,
        questionData.postUrl
      );
      
      if (success) {
        console.log(`Added question to cluster ${bestClusterId}: "${questionData.question.substring(0, 50)}..."`);
        stats.added++;
      } else {
        console.error(`Failed to add question to cluster: "${questionData.question.substring(0, 50)}..."`);
        stats.failed++;
      }
    }
    
    return stats;
  } catch (error) {
    console.error(`Error processing post ${postId}:`, error);
    return stats;
  }
}

/**
 * Get recent posts that need question embedding
 */
async function getRecentPostsForEmbedding(limit: number = 10): Promise<string[]> {
  try {
    // Get posts with analysis results that have questions
    const { data, error } = await supabase
      .from('analysis_results')
      .select('content_id, user_questions')
      .eq('content_type', 'post')
      .not('user_questions', 'is', null)
      .not('user_questions', 'eq', '[]')
      .order('inserted_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error("Error fetching recent posts:", error);
      return [];
    }
    
    if (!data || data.length === 0) {
      console.log("No recent posts with questions found");
      return [];
    }
    
    // Extract post IDs
    return data.map(result => result.content_id);
  } catch (error) {
    console.error("Error getting recent posts:", error);
    return [];
  }
}

/**
 * Create necessary functions in the database
 */
async function setupDatabaseFunctions(): Promise<boolean> {
  try {
    // Create function to increment question count
    const { error: functionError } = await supabase.rpc('exec_sql', {
      sql: `
      CREATE OR REPLACE FUNCTION increment_question_count(cluster_id UUID)
      RETURNS void
      LANGUAGE plpgsql
      AS $$
      BEGIN
        UPDATE question_clusters
        SET question_count = question_count + 1
        WHERE id = cluster_id;
      END;
      $$;
      
      CREATE OR REPLACE FUNCTION get_question_count(cluster_id UUID)
      RETURNS integer
      LANGUAGE plpgsql
      AS $$
      DECLARE
        count_result integer;
      BEGIN
        SELECT COUNT(*) INTO count_result
        FROM question_embeddings
        WHERE cluster_id = $1;
        
        RETURN count_result;
      END;
      $$;
      `
    });
    
    if (functionError) {
      console.error("Error creating database functions:", functionError);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error setting up database functions:", error);
    return false;
  }
}

/**
 * Main function to process new questions
 */
async function processNewQuestions(postLimit: number = 20): Promise<void> {
  console.log("Starting to process new questions...");
  
  try {
    // Setup database functions
    await setupDatabaseFunctions();
    
    // Get recent posts
    const postIds = await getRecentPostsForEmbedding(postLimit);
    
    if (postIds.length === 0) {
      console.log("No posts to process");
      return;
    }
    
    console.log(`Found ${postIds.length} posts to process`);
    
    // Process each post
    let totalAdded = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    
    for (const postId of postIds) {
      const stats = await processPostQuestions(postId);
      totalAdded += stats.added;
      totalSkipped += stats.skipped;
      totalFailed += stats.failed;
    }
    
    console.log("\nProcessing complete!");
    console.log(`Total questions added: ${totalAdded}`);
    console.log(`Total questions skipped: ${totalSkipped}`);
    console.log(`Total questions failed: ${totalFailed}`);
    
  } catch (error) {
    console.error("Error processing new questions:", error);
  }
}

// Run the function if this file is executed directly
if (require.main === module) {
  // Get command line args
  const args = process.argv.slice(2);
  const postLimit = parseInt(args[0]) || 20;
  
  processNewQuestions(postLimit)
    .then(() => {
      console.log("Process completed successfully");
      process.exit(0);
    })
    .catch(error => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

// Export the function for use in other scripts
export { processNewQuestions }; 