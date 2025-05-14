import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

// System prompt for content analysis
const SYSTEM_PROMPT = `
You are an AI assistant analyzing Reddit content about WHOOP fitness products.

Important Context:
- WHOOP is a fitness/health wearable company that tracks sleep, recovery, and exercise strain
- On May 8, 2025, WHOOP made major announcements including:

  HARDWARE UPDATES:
  * WHOOP 5.0: 14-day battery (up from 4-5 days), 7% smaller form factor, 60% faster processor, enhanced sensors
  * WHOOP MG (Medical Grade): All 5.0 features plus on-demand ECG readings and beta blood pressure estimation

  MEMBERSHIP MODEL CHANGES:
  * Changed from subscription-only to three annual membership tiers that include hardware:
    - One ($199/year): WHOOP 5.0 with wired charger, core health metrics only
    - Peak ($239/year): WHOOP 5.0 with wireless charger, all advanced features except medical
    - Life ($359/year): WHOOP MG with wireless charger, all features including medical grade

  NEW FEATURES:
  * Healthspan: Tracks "WHOOP Age" and "Pace of Aging" based on health metrics
  * Health Monitor: Dashboard displaying respiratory rate, heart rate, blood oxygen, skin temp, and HRV
  * Stress Monitor: Real-time stress tracking with guided breathing exercises
  * Heart Screener: On-demand ECG for arrhythmia detection with shareable PDF results
  * Expanded Women's Health: Enhanced menstrual cycle and pregnancy tracking

  UPGRADE POLICY:
  * Existing members must extend membership 12 months or pay a fee ($49-$79) to upgrade
  * Previous "free upgrade" promise for long-term members was reversed

Your task is to analyze this Reddit content and provide a JSON response with the following structure:
{
  "summary": string, // a concise 1-sentence summary of the post and sentiment
  "sentiment": string, // "positive", "neutral", or "negative"
  "sentiment_score": number, // -1.0 to 1.0 where -1 is most negative, 0 is neutral, and 1 is most positive
  "tone": string, // emotional tone (frustrated, curious, impressed, etc.)
  "themes": string[], // main topics (pricing, battery life, hardware quality, etc.)
  "keywords": string[], // relevant keywords
  "image_analysis": string, // if images present, description of what they show and relevance
  "is_announcement_related": boolean // true if the post is discussing the May 8, 2025 product announcements
}

For the "summary" field, provide a clear, concise one-sentence overview that captures the essence of the post and its sentiment. Example: "User expresses disappointment with the new membership pricing model, calling it a 'cash grab'."

For the "sentiment_score" field:
- Use a scale from -1.0 to 1.0
- -1.0 represents extremely negative sentiment
- 0.0 represents neutral sentiment
- 1.0 represents extremely positive sentiment
- Be precise with decimals to capture nuanced sentiment

Regarding the "is_announcement_related" field:
- Set to true if the post discusses WHOOP 5.0, WHOOP MG, the new membership model, or any specific new features announced on May 8, 2025
- Set to false if the post is about general WHOOP usage, older models, or unrelated topics
- If in doubt, err on the side of setting it to true if there's any relevance to the new announcements

Analyze both the post text AND image content together to form your assessment.
Please ensure your response is a valid JSON object matching this schema exactly.
`;

// Temporary directory for image downloads
const TEMP_DIR = path.join(process.cwd(), 'tmp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Downloads an image from a URL and returns the local file path
 */
async function downloadImage(url: string): Promise<string | null> {
  try {
    // Generate a hash of the URL for the filename
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    const fileExtension = path.extname(url) || '.jpg';
    const localFilePath = path.join(TEMP_DIR, `${urlHash}${fileExtension}`);
    
    // Check if file already exists
    if (fs.existsSync(localFilePath)) {
      return localFilePath;
    }
    
    // Download the image
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 10000, // 10 seconds timeout
    });
    
    // Save to local file
    const writer = fs.createWriteStream(localFilePath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(localFilePath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error);
    return null;
  }
}

/**
 * Process images from URLs and return base64 encoded data
 */
async function processImages(imageUrls: string[]): Promise<{ imageData: string[], downloadedCount: number }> {
  if (!imageUrls || imageUrls.length === 0) {
    return { imageData: [], downloadedCount: 0 };
  }
  
  // Limit to first 4 images to avoid token limits
  const urls = imageUrls.slice(0, 4);
  const imageData: string[] = [];
  let downloadedCount = 0;
  
  for (const url of urls) {
    try {
      const localFilePath = await downloadImage(url);
      
      if (localFilePath) {
        const base64Image = fs.readFileSync(localFilePath, { encoding: 'base64' });
        
        // Include the MIME type prefix for OpenAI API
        const mimeType = path.extname(localFilePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
        imageData.push(`data:${mimeType};base64,${base64Image}`);
        downloadedCount++;
      }
    } catch (error) {
      console.error(`Error processing image ${url}:`, error);
    }
  }
  
  return { imageData, downloadedCount };
}

/**
 * Analyze a Reddit post using GPT-4o mini
 */
export async function analyzeRedditPost(postId: string): Promise<boolean> {
  // Fetch the post and related comments from Supabase
  const { data: post, error: postError } = await supabase
    .from('reddit_posts')
    .select('*')
    .eq('id', postId)
    .single();
  
  if (postError || !post) {
    console.error(`Error fetching post ${postId}:`, postError);
    return false;
  }
  
  const { data: comments, error: commentsError } = await supabase
    .from('reddit_comments')
    .select('*')
    .eq('post_id', postId)
    .order('score', { ascending: false })
    .limit(5);
  
  if (commentsError) {
    console.error(`Error fetching comments for post ${postId}:`, commentsError);
    return false;
  }
  
  // Build content for analysis
  let contentToAnalyze = `POST TITLE: ${post.title}\n\n`;
  
  if (post.body) {
    contentToAnalyze += `POST BODY: ${post.body}\n\n`;
  }
  
  if (comments && comments.length > 0) {
    contentToAnalyze += `TOP COMMENTS:\n`;
    comments.forEach((comment: any, index: number) => {
      contentToAnalyze += `COMMENT ${index + 1} (Score: ${comment.score}): ${comment.body}\n\n`;
    });
  }

  // Process images if any
  let imageData: string[] = [];
  let downloadedCount = 0;

  if (post.image_urls && post.image_urls.length > 0) {
    console.log(`Processing ${post.image_urls.length} images for post ${post.id}...`);
    const imageResult = await processImages(post.image_urls);
    imageData = imageResult.imageData;
    downloadedCount = imageResult.downloadedCount;
    
    if (downloadedCount > 0) {
      contentToAnalyze += `\n[${downloadedCount} IMAGES ATTACHED]\n`;
    }
  }

  // Create messages array with image data if available
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT }
  ];

  // Add text content
  if (downloadedCount > 0) {
    // If we have images, create a multi-modal message with both text and images
    messages.push({
      role: "user",
      content: [
        { type: "text", text: contentToAnalyze },
        ...imageData.map(img => ({ type: "image_url", image_url: { url: img } } as OpenAI.ChatCompletionContentPart))
      ]
    });
  } else {
    // Text only
    messages.push({ role: "user", content: contentToAnalyze });
  }

  // Perform analysis with OpenAI
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      response_format: { type: "json_object" }
    });

    const analysisResult = response.choices[0]?.message?.content;
    
    if (analysisResult) {
      const analysis = JSON.parse(analysisResult);
      
      // Save to analysis_results table
      await supabase
        .from('analysis_results')
        .insert({
          content_id: post.id,
          content_type: 'post',
          summary: analysis.summary,
          sentiment: analysis.sentiment,
          sentiment_score: analysis.sentiment_score,
          tone: analysis.tone,
          themes: analysis.themes,
          keywords: analysis.keywords,
          has_image_analysis: downloadedCount > 0,
          image_analysis_data: downloadedCount > 0 ? { description: analysis.image_analysis } : null,
          is_announcement_related: analysis.is_announcement_related || false,
          model_used: 'gpt-4o-mini',
          prompt_version: '1.0',
          analysis_data: analysis
        });
      
      // Update post as processed
      await supabase
        .from('reddit_posts')
        .update({ 
          is_processed: true,
          processed_at: new Date().toISOString()
        })
        .eq('id', post.id);
      
      console.log(`✅ Analyzed post ${post.id} with ${downloadedCount} images (Announcement related: ${analysis.is_announcement_related ? 'Yes' : 'No'})`);
      return true;
    } else {
      console.error(`No valid analysis returned for post ${post.id}`);
      return false;
    }
  } catch (error) {
    console.error(`Error analyzing post ${post.id}:`, error);
    return false;
  }
}