import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

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

// System prompt for product review analysis
const PRODUCT_REVIEW_SYSTEM_PROMPT = `
You are an AI assistant analyzing Reddit content about WHOOP fitness products, focusing ONLY on identifying posts where users EXPLICITLY state they have physically received and are using either the WHOOP 5.0 or WHOOP MG.

Important Context:
- WHOOP is a fitness/health wearable company that tracks sleep, recovery, and exercise strain
- We are ONLY interested in the newest generation products:
  * WHOOP 5.0: The standard wearable with 14-day battery (released May 2025)
  * WHOOP MG (Medical Grade): Enhanced version with ECG and blood pressure capabilities (released May 2025)

Your task is EXTREMELY specific:
1. ONLY mark as true if the user EXPLICITLY states they have PHYSICALLY RECEIVED and are PERSONALLY USING a WHOOP 5.0 or WHOOP MG device
2. Which specific product they received (MUST be either "WHOOP 5.0" or "WHOOP MG" exactly)
3. Their satisfaction with that specific product

Provide a JSON response with ONLY these fields:

{
  "has_received_product": boolean, // true ONLY if user EXPLICITLY states they have physically received and are using a WHOOP 5.0 or WHOOP MG
  "product_received": string, // ONLY "WHOOP 5.0" or "WHOOP MG" or null if has_received_product is false
  "product_satisfaction": string // "positive", "neutral", or "negative" or null if they don't have the product

STRICT GUIDELINES - READ CAREFULLY:
- Set "has_received_product" to true ONLY if the user uses phrases that EXPLICITLY indicate personal possession such as:
  * "I got my WHOOP 5.0 yesterday"
  * "My WHOOP MG arrived last week"
  * "I've been using my new WHOOP 5.0 for a few days"
  * "Just unboxed my WHOOP MG"

- The following types of statements should be marked FALSE:
  * General discussion of the products without explicit mention of receiving one
  * Hypothetical statements ("If I get a WHOOP 5.0...")
  * Future statements ("I'll be getting a WHOOP 5.0 soon")
  * Questions about the products without owning one
  * Discussions about the announcement or pricing
  * Excitement about the products without explicit mention of receiving one
  * Posts from before May 2025 (when these products were released)

- ONLY use "WHOOP 5.0" or "WHOOP MG" as values for "product_received"
- If the user doesn't specifically identify which model they received, set "product_received" to null
- Older models like WHOOP 4.0 should be marked as false

- For "product_satisfaction", only assess if they've actually received the product:
  * "positive": User explicitly expresses satisfaction with their new device
  * "neutral": User has mixed feelings or no clear opinion about their device
  * "negative": User explicitly expresses dissatisfaction with their new device

BE EXTREMELY CONSERVATIVE IN YOUR ASSESSMENT. When in doubt, mark "has_received_product" as FALSE.
`;

/**
 * Extract product review analysis data from a reddit post
 */
async function getProductReviewAnalysis(content: string): Promise<any> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: PRODUCT_REVIEW_SYSTEM_PROMPT },
        { role: "user", content }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const analysisResult = response.choices[0]?.message?.content;
    
    if (analysisResult) {
      return JSON.parse(analysisResult);
    }
    
    return null;
  } catch (error) {
    console.error("Error in OpenAI API call:", error);
    return null;
  }
}

/**
 * Add product review analysis to a specific post
 */
export async function analyzeProductReviewForPost(postId: string): Promise<boolean> {
  try {
    // First check if product review analysis already exists
    const { data: existingAnalysis, error: checkError } = await supabase
      .from('analysis_results')
      .select('product_received')
      .eq('content_id', postId)
      .eq('content_type', 'post')
      .single();
    
    if (checkError) {
      console.error(`Error checking existing product review analysis for post ${postId}:`, checkError);
      // Continue anyway as this is a safety check
    } else if (existingAnalysis && existingAnalysis.product_received !== null) {
      console.log(`Product review analysis already exists for post ${postId}, skipping.`);
      return true; // Return success since it's already analyzed
    }
    
    // Get post data and existing analysis
    const { data: post, error: postError } = await supabase
      .from('reddit_posts')
      .select('*')
      .eq('id', postId)
      .single();
    
    if (postError || !post) {
      console.error(`Error fetching post ${postId}:`, postError);
      return false;
    }
    
    // Get existing analysis
    const { data: analysisResult, error: analysisError } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('content_id', postId)
      .eq('content_type', 'post')
      .single();
    
    if (analysisError || !analysisResult) {
      console.error(`Error: No existing analysis found for post ${postId}`);
      return false;
    }
    
    // Prepare content for analysis
    let contentToAnalyze = `POST TITLE: ${post.title}\n\n`;
    
    if (post.body) {
      contentToAnalyze += `POST BODY: ${post.body}\n\n`;
    }
    
    // Get product review analysis
    const productReviewAnalysis = await getProductReviewAnalysis(contentToAnalyze);
    
    if (!productReviewAnalysis) {
      console.error(`Failed to get product review analysis for post ${postId}`);
      return false;
    }
    
    // Update analysis_results with product review data
    const { error: updateError } = await supabase
      .from('analysis_results')
      .update({
        has_received_product: productReviewAnalysis.has_received_product || false,
        product_received: productReviewAnalysis.product_received || null,
        product_satisfaction: productReviewAnalysis.product_satisfaction || null,
        updated_at: new Date().toISOString(),
        product_analysis_at: new Date().toISOString()
      })
      .eq('id', analysisResult.id);
    
    if (updateError) {
      console.error(`Error updating analysis for post ${postId}:`, updateError);
      return false;
    }
    
    console.log(`✅ Added product review analysis to post ${postId}`);
    return true;
  } catch (error) {
    console.error(`Error in product review analysis for post ${postId}:`, error);
    return false;
  }
}

/**
 * Process all posts that have already been analyzed
 */
export async function processAllAnalyzedPosts(): Promise<void> {
  console.log("Starting product review analysis for all analyzed posts...");
  
  // Get all post IDs that have been analyzed
  const { data: analyzedPosts, error } = await supabase
    .from('analysis_results')
    .select('content_id')
    .eq('content_type', 'post');
  
  if (error || !analyzedPosts) {
    console.error("Error fetching analyzed posts:", error);
    return;
  }
  
  console.log(`Found ${analyzedPosts.length} posts to process for product review analysis...`);
  
  // Process each post
  let successCount = 0;
  let failureCount = 0;
  
  for (const post of analyzedPosts) {
    const success = await analyzeProductReviewForPost(post.content_id);
    if (success) {
      successCount++;
    } else {
      failureCount++;
    }
    
    // Log progress every 10 posts
    if ((successCount + failureCount) % 10 === 0) {
      console.log(`Progress: ${successCount + failureCount}/${analyzedPosts.length} posts processed (${successCount} succeeded, ${failureCount} failed)`);
    }
  }
  
  console.log(`Completed product review analysis: ${successCount} succeeded, ${failureCount} failed`);
} 