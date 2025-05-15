import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { processNewQuestions } from './add-new-embeddings';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Process questions that don't have embeddings yet and add them to existing clusters
 * without reclustering everything
 */
async function processMissingEmbeddings(): Promise<void> {
  console.log("🔍 Starting FAQ embeddings for questions without embeddings...");
  console.log("This will add embeddings for user questions and add them to EXISTING clusters");
  console.log("without reclustering everything.");
  console.log("-----------------------------------------------------------");
  
  // Get all questions needing embeddings
  const { data: questionsWithoutEmbeddings, error } = await supabase
    .from('question_embeddings')
    .select('id')
    .is('embedding', null)
    .order('inserted_at', { ascending: false });
  
  if (error) {
    console.error("Error fetching questions needing embeddings:", error);
    return;
  }
  
  // If we don't have the question_embeddings table yet, check questions from analysis_results
  if (!questionsWithoutEmbeddings) {
    console.log("Checking for user questions in analysis_results...");
    
    const { data: postsWithQuestions, error: questionsError } = await supabase
      .from('analysis_results')
      .select('id, content_id, user_questions')
      .not('user_questions', 'is', null)
      .order('inserted_at', { ascending: false });
    
    if (questionsError || !postsWithQuestions) {
      console.error("Error fetching posts with questions:", questionsError);
      return;
    }
    
    const totalQuestions = postsWithQuestions.reduce((count, post) => {
      return count + (post.user_questions?.length || 0);
    }, 0);
    
    console.log(`Found ${postsWithQuestions.length} posts with a total of ${totalQuestions} questions to process...`);
  } else {
    console.log(`Found ${questionsWithoutEmbeddings.length} questions without embeddings...`);
  }
  
  // Process the questions
  try {
    console.log("Processing questions and adding to existing clusters...");
    // Pass a number to limit the number of posts to process
    await processNewQuestions(50);
    
    console.log("-----------------------------------------------------------");
    console.log(`✅ FAQ embeddings processing complete!`);
  } catch (error) {
    console.error("❌ Error processing FAQ embeddings:", error);
  }
}

// Run the function
processMissingEmbeddings()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  }); 