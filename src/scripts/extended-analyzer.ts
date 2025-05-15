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

// System prompt for extended content analysis
const EXTENDED_SYSTEM_PROMPT = `
You are an AI assistant analyzing Reddit content about WHOOP fitness products, focusing on specific data points.

Important Context:
- WHOOP is a fitness/health wearable company that tracks sleep, recovery, and exercise strain
- On May 8, 2025, WHOOP made major announcements including:

  HARDWARE UPDATES:
  * WHOOP 5.0: 14-day battery (up from 4-5 days), 7% smaller form factor, 60% faster processor, enhanced sensors
  * WHOOP MG (Medical Grade): All 5.0 features plus on-demand ECG readings and beta blood pressure estimation
  * 7% smaller and lighter design than WHOOP 4.0, improving comfort and wearability
  * Sensors now collect data 26 times per second for greater accuracy
  * 60% faster processor that's 10x more power efficient
  * Wireless PowerPack accessory enables up to 30 days of battery life

  MEMBERSHIP MODEL CHANGES:
  * Changed from subscription-only to three annual membership tiers that include hardware:
    - One ($199/year): WHOOP 5.0 with wired charger, core health metrics only
    - Peak ($239/year): WHOOP 5.0 with wireless charger, all advanced features except medical
    - Life ($359/year): WHOOP MG with wireless charger, all features including medical grade

  NEW FEATURES:
  * Stress Monitor: Real-time stress tracking with guided breathing exercises
  * HRV calibration: Improved heart rate variability measurements
  * Battery Pack 5.0: New wireless charging battery pack
  * Auto-Detected Activities: Enhanced activity detection and classification of workouts
  * Sensor accuracy: Improved accuracy of all health metrics
  * Subscription price: New tiered pricing model
  * Upgrade eligibility: Policy for existing members to upgrade
  * Healthspan & WHOOP Age: Metrics to track physiological age and aging speed, with weekly updates
  * AI Assistant / Daily Outlook: AI-powered daily summaries and personalized recommendations
  * Step Counter: Integrated step counting with improved accuracy
  * Sleep Performance Update: Reimagined Sleep Score with focus on sleep consistency, efficiency, and stress
  * Women's Hormonal Insights: Personalized insights on hormonal cycles and their impact on recovery and training
  * Advanced Labs (Coming Soon): Integration for blood testing and clinician-reviewed reports

  MEDICAL FEATURES (WHOOP MG only):
  * On-demand ECG (electrocardiogram) for heart health screening
  * Blood Pressure Insights
  * Irregular Heart Rhythm Notifications (IHRN)

Your task is to analyze this Reddit content and extract ONLY the following specific data points:

1. Competitor Mentions:
   - Identify mentions of competitors (Oura, Apple Watch, Garmin, Fitbit)
   - For each mention, extract context, sentiment compared to WHOOP, and a representative quote

2. Aspect-Based Feature Sentiment:
   - Extract sentiment about specific WHOOP features from a fixed list
   - Include sentiment score and representative quote for each mentioned feature

3. Cancellation Signals:
   - Detect if the post mentions or threatens cancellation
   - Extract the reason for cancellation if mentioned

4. User Questions:
   - Extract any questions the user is asking about the product, subscription, features, or usage
   - If a question lacks context, add parenthetical context to clarify what it's about

Provide a JSON response with ONLY these fields:

{
  "competitor_mentions": [
    {
      "competitor": "Oura",
      "comp_context": "sleep tracking",
      "comp_sentiment": "positive",
      "comp_quote": "I prefer Oura for sleep—it's more intuitive than WHOOP right now."
    },
    ...
  ],
  "aspects": [
    {
      "feature": "Stress Monitor",
      "sentiment": "positive",
      "score": 0.8,
      "quote": "The stress feature helps me know when to take breaks."
    },
    ...
  ],
  "cancellation_mention": true,
  "cancellation_reason": "Price increase on PEAK plan feels unfair",
  "user_questions": [
    "Is the stress monitor only for PEAK members?",
    "How's the battery life on the 5.0 compared to 4.0?",
    "Any unexpected pros or cons? (comparing WHOOP 5.0 to previous models)",
    "Will my old bands work with WHOOP 5.0? (compatibility question)"
  ]
}

For the "competitor_mentions" field:
- Return an empty array if no competitors are mentioned
- Only include canonical competitor names: "Oura", "Apple Watch", "Garmin", "Fitbit"
- Keep quotes concise (≤25 words)

For the "aspects" field:
- Only extract features if mentioned from this fixed list of NEW/IMPROVED features:
  ["Stress Monitor", "HRV calibration", "Battery Pack 5.0", "improved Auto-Detected Activities", "Improved Sensor accuracy", "Healthspan/WHOOP Age", "AI Assistant", "Daily Outlook", "improved Step Counter", "improved Sleep Performance", "Women's Hormonal Insights", "ECG", "Blood Pressure", "Irregular Heart Rhythm"]
- Score should range from -1.0 to 1.0
- Keep quotes concise (≤25 words)

For cancellation fields:
- Set "cancellation_mention" to false and "cancellation_reason" to null if not mentioned
- Keep reason concise (≤25 words)

For "user_questions":
- Return an empty array if no questions are found
- Only include questions related to WHOOP products, subscription, features, or usage
- For questions lacking context, add parenthetical clarification after the question text
  Example: "Any unexpected pros or cons? (comparing WHOOP 5.0 to previous models)"
  Example: "How's the battery life? (of the WHOOP 5.0 device)"
  Example: "Will it be worth the money? (upgrading to the new subscription tier)"
- Always add contextual parentheses to ambiguous questions IF they don't clearly specify:
  * Which product or model is being discussed
  * What is being compared
  * Which feature is being referenced
  * What the user is considering purchasing/upgrading to
- Ensure questions include sufficient context for understanding what is being asked without requiring the reader to see the original post

Ensure your response is a valid JSON object matching this schema exactly.
`;

/**
 * Extract extended analysis data from a reddit post
 */
async function getExtendedAnalysis(content: string): Promise<any> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: EXTENDED_SYSTEM_PROMPT },
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
 * Add extended analysis to a specific post
 */
export async function extendAnalysisForPost(postId: string): Promise<boolean> {
  try {
    // First check if extended analysis already exists using all four criteria:
    // 1. competitor_mentions is not an empty array
    // 2. aspects is not an empty array
    // 3. cancellation_mention is not FALSE
    // 4. cancellation_reason is not NULL
    const { data: existingAnalysis, error: checkError } = await supabase
      .from('analysis_results')
      .select('competitor_mentions, aspects, cancellation_mention, cancellation_reason')
      .eq('content_id', postId)
      .eq('content_type', 'post')
      .single();
    
    if (checkError) {
      console.error(`Error checking existing extended analysis for post ${postId}:`, checkError);
      // Continue anyway as this is a safety check
    } else if (
      existingAnalysis && 
      // Check if any of these conditions is true, meaning extended analysis has been run
      (
        (existingAnalysis.competitor_mentions && existingAnalysis.competitor_mentions.length > 0) ||
        (existingAnalysis.aspects && existingAnalysis.aspects.length > 0) ||
        existingAnalysis.cancellation_mention !== false ||
        existingAnalysis.cancellation_reason !== null
      )
    ) {
      console.log(`Extended analysis already exists for post ${postId}, skipping.`);
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
    
    // Get extended analysis
    const extendedAnalysis = await getExtendedAnalysis(contentToAnalyze);
    
    if (!extendedAnalysis) {
      console.error(`Failed to get extended analysis for post ${postId}`);
      return false;
    }
    
    // Update analysis_results with extended data
    const { error: updateError } = await supabase
      .from('analysis_results')
      .update({
        competitor_mentions: extendedAnalysis.competitor_mentions || [],
        aspects: extendedAnalysis.aspects || [],
        cancellation_mention: extendedAnalysis.cancellation_mention || false,
        cancellation_reason: extendedAnalysis.cancellation_reason || null,
        user_questions: extendedAnalysis.user_questions || [],
        updated_at: new Date().toISOString(),
        extended_analysis_at: new Date().toISOString()
      })
      .eq('id', analysisResult.id);
    
    if (updateError) {
      console.error(`Error updating analysis for post ${postId}:`, updateError);
      return false;
    }
    
    console.log(`✅ Added extended analysis to post ${postId}`);
    return true;
  } catch (error) {
    console.error(`Error in extended analysis for post ${postId}:`, error);
    return false;
  }
}

/**
 * Process all posts that have already been analyzed
 */
export async function processAllAnalyzedPosts(): Promise<void> {
  console.log("Starting extended analysis for all analyzed posts...");
  
  // Get all post IDs that have been analyzed
  const { data: analyzedPosts, error } = await supabase
    .from('analysis_results')
    .select('content_id')
    .eq('content_type', 'post');
  
  if (error || !analyzedPosts) {
    console.error("Error fetching analyzed posts:", error);
    return;
  }
  
  console.log(`Found ${analyzedPosts.length} analyzed posts to enhance...`);
  
  // Process in batches to avoid rate limits
  const batchSize = 5;
  let successCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < analyzedPosts.length; i += batchSize) {
    const batch = analyzedPosts.slice(i, i + batchSize);
    
    // Process batch sequentially to avoid rate limits
    for (const item of batch) {
      try {
        const success = await extendAnalysisForPost(item.content_id);
        
        if (success) {
          successCount++;
        } else {
          failedCount++;
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error processing post ${item.content_id}:`, error);
        failedCount++;
      }
    }
    
    console.log(`Progress: ${i + Math.min(batchSize, batch.length)}/${analyzedPosts.length} posts processed`);
    
    // Delay between batches to avoid rate limits
    if (i + batchSize < analyzedPosts.length) {
      console.log("Waiting between batches...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`Extended analysis complete! Success: ${successCount}, Failed: ${failedCount}`);
}

// Run as main when executed directly
if (require.main === module) {
  processAllAnalyzedPosts()
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
} 