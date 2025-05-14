import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

interface QuestionCluster {
  topic: string;
  representative_question: string;
  question_count: number;
  similar_questions: string[];
}

// Group questions into clusters and select representatives
async function clusterQuestions(questions: string[]): Promise<QuestionCluster[]> {
  if (questions.length === 0) return [];
  
  const CLUSTERING_PROMPT = `
  I have a list of user questions about WHOOP fitness products. 
  Please cluster them into logical groups based on similar topics/intents, and select one representative question for each group.
  
  Return a JSON object with a "clusters" array like this:
  {
    "clusters": [
      {
        "topic": "Battery Life",
        "representative_question": "How's the battery life on the WHOOP 5.0? (compared to 4.0)",
        "question_count": 12,
        "similar_questions": ["Does the 5.0 really last 14 days?", "Battery life experiences?"]
      },
      {
        "topic": "Subscription Model",
        "representative_question": "Is the new pricing model worth it?",
        "question_count": 8,
        "similar_questions": ["Are the new plans a good deal?", "Does the yearly cost make sense?"]
      }
    ]
  }
  
  IMPORTANT: Include ALL questions in some cluster. Don't drop any questions.
  
  Questions to cluster:
  ${questions.join('\n')}
  `;
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: CLUSTERING_PROMPT }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("No content returned from OpenAI");
      return [];
    }
    
    const result = JSON.parse(content);
    return result.clusters || [];
  } catch (error) {
    console.error("Error clustering questions:", error);
    return [];
  }
}

// Deduplicate questions
function deduplicateQuestions(questions: string[]): string[] {
  // Remove duplicates while preserving order
  const uniqueQuestions = [...new Set(questions)];
  
  // Sort to give preference to questions with more context (parentheses)
  return uniqueQuestions.sort((a, b) => {
    const aHasContext = a.includes('(') && a.includes(')');
    const bHasContext = b.includes('(') && b.includes(')');
    
    // Questions with context come first
    if (aHasContext && !bHasContext) return -1;
    if (!aHasContext && bHasContext) return 1;
    
    // Otherwise sort by length (more detailed questions first)
    return b.length - a.length;
  });
}

async function generateFAQs() {
  console.log("Starting FAQ generation process...");
  
  // Get all questions from analysis results
  const { data, error } = await supabase
    .from('analysis_results')
    .select('user_questions')
    .not('user_questions', 'is', 'null')
    .not('user_questions', 'eq', '[]');
  
  if (error || !data) {
    console.error("Error fetching questions:", error);
    return;
  }
  
  // Extract and flatten all questions
  const allQuestions: string[] = data.reduce((acc: string[], result) => {
    if (result.user_questions && result.user_questions.length > 0) {
      return [...acc, ...result.user_questions];
    }
    return acc;
  }, []);
  
  // Deduplicate questions
  const uniqueQuestions = deduplicateQuestions(allQuestions);
  
  console.log(`Found ${uniqueQuestions.length} unique questions to cluster (from ${allQuestions.length} total)`);
  
  // Process in batches of ~50 questions to avoid token limits
  const batchSize = 50;
  let allClusters: QuestionCluster[] = [];
  
  for (let i = 0; i < uniqueQuestions.length; i += batchSize) {
    const batch = uniqueQuestions.slice(i, i + batchSize);
    const batchClusters = await clusterQuestions(batch);
    allClusters = [...allClusters, ...batchClusters];
    console.log(`Processed batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(uniqueQuestions.length/batchSize)}`);
  }
  
  console.log(`Initial clustering complete. Created ${allClusters.length} clusters.`);
  
  // If we have many clusters, perform a second round of clustering to consolidate similar topics
  if (allClusters.length > 20) {
    console.log("Consolidating clusters...");
    const representativeQuestions = allClusters.map(c => `[${c.topic}] ${c.representative_question}`);
    const consolidatedClusters = await clusterQuestions(representativeQuestions);
    
    // Process consolidated clusters to merge similar_questions arrays
    const mergedClusters = consolidatedClusters.map(consolidated => {
      // Extract original topics from the combined questions
      const originalTopics = consolidated.similar_questions.map(q => {
        const match = q.match(/^\[(.*?)\]/);
        return match ? match[1] : "";
      });
      
      // Find all original clusters that match these topics
      const matchingOriginalClusters = allClusters.filter(original => 
        originalTopics.includes(original.topic) || 
        consolidated.similar_questions.some(sq => sq.includes(original.representative_question))
      );
      
      // Merge similar questions from all matching clusters
      const allSimilarQuestions = matchingOriginalClusters.reduce((acc, cluster) => {
        return [...acc, ...cluster.similar_questions];
      }, [] as string[]);
      
      // Clean up the representative question (remove topic prefix if present)
      let cleanRepQuestion = consolidated.representative_question;
      const topicMatch = cleanRepQuestion.match(/^\[(.*?)\]\s*(.*)/);
      if (topicMatch) {
        cleanRepQuestion = topicMatch[2];
      }
      
      return {
        topic: consolidated.topic,
        representative_question: cleanRepQuestion,
        question_count: allSimilarQuestions.length + matchingOriginalClusters.length,
        similar_questions: deduplicateQuestions(allSimilarQuestions)
      };
    });
    
    allClusters = mergedClusters;
    console.log(`Consolidation complete. Final cluster count: ${allClusters.length}`);
  }
  
  // Clear existing FAQ clusters before inserting new ones
  const { error: deleteError } = await supabase
    .from('faq_clusters')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
  
  if (deleteError) {
    console.error("Error clearing existing FAQ clusters:", deleteError);
  }
  
  // Insert the new clusters
  for (const cluster of allClusters) {
    const { error: insertError } = await supabase
      .from('faq_clusters')
      .insert({
        topic: cluster.topic,
        representative_question: cluster.representative_question,
        question_count: cluster.question_count,
        similar_questions: cluster.similar_questions
      });
    
    if (insertError) {
      console.error(`Error inserting cluster "${cluster.topic}":`, insertError);
    }
  }
  
  console.log(`FAQ generation complete. Created ${allClusters.length} FAQ clusters.`);
}

// Run the function
generateFAQs()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  }); 