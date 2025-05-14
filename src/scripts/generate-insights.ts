// Insights Generator
// Analyzes processed Reddit data to generate theme-based and time-based insights

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { format, subDays } from 'date-fns';

dotenv.config();

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Setup OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Constants
const MIN_POSTS_FOR_THEME_INSIGHT = 3; // Minimum number of posts to generate a theme-based insight
const INSIGHTS_LOOKBACK_DAYS = 7; // Default period for insights

// System prompt for generating insights
const INSIGHTS_SYSTEM_PROMPT = `
You are an AI assistant specialized in analyzing Reddit content about WHOOP fitness products.

Your task is to generate concise, data-driven insights based on analyzed Reddit posts.
Focus on identifying key patterns, trends, and actionable recommendations.

Your insights should be:
1. Factual and based only on the provided data
2. Business-oriented (what WHOOP should consider based on user feedback)
3. Specific and actionable
4. Concise and well-structured

The output should include:
- A brief summary of the main findings (2-3 sentences)
- 3-5 specific recommendations for WHOOP based on the data
- 2-3 representative quotes that illustrate the key points (direct quotes from users)
`;

// Function to generate theme-based insights
async function generateThemeInsights() {
  console.log('Generating theme-based insights...');
  
  // Get all active themes
  const { data: themes, error: themesError } = await supabase
    .from('themes')
    .select('*')
    .eq('is_active', true)
    .is('parent_theme_id', null) // Only get parent themes
    .order('priority', { ascending: true });
  
  if (themesError || !themes) {
    console.error('Error fetching themes:', themesError);
    return;
  }
  
  // Define time period for analysis
  const endDate = new Date();
  const startDate = subDays(endDate, INSIGHTS_LOOKBACK_DAYS);
  
  for (const theme of themes) {
    console.log(`Processing theme: ${theme.name}`);
    
    // Get all analyzed posts from the past week that match this theme
    const { data: analyzedPosts, error: postsError } = await supabase
      .from('analysis_results')
      .select(`
        id,
        content_id,
        sentiment,
        sentiment_score,
        tone,
        themes,
        keywords,
        has_image_analysis,
        image_analysis_data,
        analyzed_at,
        reddit_posts(*)
      `)
      .eq('content_type', 'post')
      .gte('analyzed_at', startDate.toISOString())
      .lte('analyzed_at', endDate.toISOString())
      .contains('themes', [theme.name.toLowerCase()]);
    
    if (postsError) {
      console.error(`Error fetching posts for theme ${theme.name}:`, postsError);
      continue;
    }
    
    // Skip if not enough posts for this theme
    if (!analyzedPosts || analyzedPosts.length < MIN_POSTS_FOR_THEME_INSIGHT) {
      console.log(`Not enough posts (${analyzedPosts?.length || 0}) for theme ${theme.name}, skipping...`);
      continue;
    }
    
    // Prepare data for OpenAI
    const postsData = analyzedPosts.map(post => {
      // Safely handle nested reddit_posts data
      const redditPost = post.reddit_posts as any;
      return {
        title: redditPost?.title || 'Unknown title',
        body: redditPost?.body || '',
        sentiment: post.sentiment,
        sentiment_score: post.sentiment_score,
        tone: post.tone,
        themes: post.themes,
        keywords: post.keywords,
        upvotes: redditPost?.ups || 0,
        comments: redditPost?.num_comments || 0,
        permalink: redditPost?.permalink || '',
        created_at: redditPost?.created_at || post.analyzed_at,
      };
    });
    
    console.log(`Generating insight for theme ${theme.name} based on ${postsData.length} posts...`);
    
    // Calculate overall sentiment stats
    const sentimentCounts = {
      positive: postsData.filter(p => p.sentiment === 'positive').length,
      neutral: postsData.filter(p => p.sentiment === 'neutral').length,
      negative: postsData.filter(p => p.sentiment === 'negative').length,
    };
    
    const sentimentOverview = `
      Total posts: ${postsData.length}
      Positive: ${sentimentCounts.positive} (${Math.round(sentimentCounts.positive / postsData.length * 100)}%)
      Neutral: ${sentimentCounts.neutral} (${Math.round(sentimentCounts.neutral / postsData.length * 100)}%)
      Negative: ${sentimentCounts.negative} (${Math.round(sentimentCounts.negative / postsData.length * 100)}%)
    `;
    
    // Prepare prompt for OpenAI
    const prompt = `
      Generate concise business insights about WHOOP products based on Reddit posts related to the theme: "${theme.name}".
      
      TIME PERIOD: ${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}
      
      SENTIMENT OVERVIEW:
      ${sentimentOverview}
      
      POSTS (${postsData.length} total):
      ${postsData.map((post, i) => `
        POST ${i + 1}:
        Title: ${post.title}
        Body: ${post.body.substring(0, 200)}${post.body.length > 200 ? '...' : ''}
        Sentiment: ${post.sentiment} (score: ${post.sentiment_score})
        Tone: ${post.tone.join(', ')}
        Keywords: ${post.keywords.join(', ')}
        Upvotes: ${post.upvotes}, Comments: ${post.comments}
        Created: ${new Date(post.created_at).toLocaleDateString()}
        URL: https://reddit.com${post.permalink}
      `).join('\n')}
    `;
    
    try {
      // Call OpenAI to generate insight
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        tools: [
          {
            type: "function",
            function: {
              name: "generate_theme_insight",
              description: "Generate structured insight based on Reddit data for a specific theme",
              parameters: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Clear title summarizing the insight"
                  },
                  summary: {
                    type: "string",
                    description: "2-3 sentence summary of the key findings related to this theme"
                  },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 actionable recommendations for WHOOP based on the data"
                  },
                  representative_quotes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        quote: { type: "string" },
                        sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                        source: { type: "string", description: "Source identifier, like post title or URL" }
                      },
                      required: ["quote", "sentiment"]
                    },
                    description: "2-3 representative quotes from the data that illustrate key points"
                  }
                },
                required: ["title", "summary", "recommendations", "representative_quotes"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_theme_insight" } }
      });
      
      const insightResult = response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
      
      if (insightResult) {
        const insight = JSON.parse(insightResult);
        
        // Save to insights table
        const { data: insightData, error: insightError } = await supabase
          .from('insights')
          .insert({
            title: insight.title,
            summary: insight.summary,
            recommendations: insight.recommendations,
            representative_quotes: insight.representative_quotes,
            theme_id: theme.id,
            time_period_start: startDate.toISOString(),
            time_period_end: endDate.toISOString(),
            insight_type: 'theme_based',
            metadata: {
              total_posts: postsData.length,
              sentiment_counts: sentimentCounts,
              generated_with: 'gpt-4o-mini',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select();
        
        if (insightError) {
          console.error(`Error saving insight for theme ${theme.name}:`, insightError);
        } else {
          console.log(`Successfully generated and saved insight for theme ${theme.name}`);
        }
      } else {
        console.error(`No valid insight returned for theme ${theme.name}`);
      }
    } catch (error) {
      console.error(`Error generating insight for theme ${theme.name}:`, error);
    }
  }
}

// Function to generate a weekly summary insight
async function generateWeeklySummary() {
  console.log('Generating weekly summary insight...');
  
  // Define time period for analysis
  const endDate = new Date();
  const startDate = subDays(endDate, INSIGHTS_LOOKBACK_DAYS);
  
  // Get all analyzed posts from the past week
  const { data: analyzedPosts, error: postsError } = await supabase
    .from('analysis_results')
    .select(`
      id,
      content_id,
      sentiment,
      sentiment_score,
      tone,
      themes,
      keywords,
      has_image_analysis,
      image_analysis_data,
      analyzed_at,
      reddit_posts(*)
    `)
    .eq('content_type', 'post')
    .gte('analyzed_at', startDate.toISOString())
    .lte('analyzed_at', endDate.toISOString());
  
  if (postsError || !analyzedPosts) {
    console.error('Error fetching posts for weekly summary:', postsError);
    return;
  }
  
  if (analyzedPosts.length === 0) {
    console.log('No posts found for weekly summary, skipping...');
    return;
  }
  
  // Prepare data for OpenAI
  const postsData = analyzedPosts.map(post => {
    // Safely handle nested reddit_posts data
    const redditPost = post.reddit_posts as any;
    return {
      title: redditPost?.title || 'Unknown title',
      body: redditPost?.body || '',
      sentiment: post.sentiment,
      sentiment_score: post.sentiment_score,
      tone: post.tone,
      themes: post.themes,
      keywords: post.keywords,
      upvotes: redditPost?.ups || 0,
      comments: redditPost?.num_comments || 0,
      permalink: redditPost?.permalink || '',
      created_at: redditPost?.created_at || post.analyzed_at,
    };
  });
  
  console.log(`Generating weekly summary based on ${postsData.length} posts...`);
  
  // Calculate overall sentiment stats
  const sentimentCounts = {
    positive: postsData.filter(p => p.sentiment === 'positive').length,
    neutral: postsData.filter(p => p.sentiment === 'neutral').length,
    negative: postsData.filter(p => p.sentiment === 'negative').length,
  };
  
  const sentimentOverview = `
    Total posts: ${postsData.length}
    Positive: ${sentimentCounts.positive} (${Math.round(sentimentCounts.positive / postsData.length * 100)}%)
    Neutral: ${sentimentCounts.neutral} (${Math.round(sentimentCounts.neutral / postsData.length * 100)}%)
    Negative: ${sentimentCounts.negative} (${Math.round(sentimentCounts.negative / postsData.length * 100)}%)
  `;
  
  // Get top themes
  const allThemes = postsData.flatMap(p => p.themes);
  const themeCounts: Record<string, number> = {};
  allThemes.forEach(theme => {
    themeCounts[theme] = (themeCounts[theme] || 0) + 1;
  });
  
  const topThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([theme, count]) => `${theme} (${count})`);
  
  // Prepare prompt for OpenAI
  const prompt = `
    Generate a weekly summary of WHOOP-related discussions on Reddit.
    
    TIME PERIOD: ${format(startDate, 'MMM d, yyyy')} to ${format(endDate, 'MMM d, yyyy')}
    
    SENTIMENT OVERVIEW:
    ${sentimentOverview}
    
    TOP THEMES:
    ${topThemes.join(', ')}
    
    SAMPLE OF POSTS (${Math.min(postsData.length, 20)} of ${postsData.length} total):
    ${postsData.slice(0, 20).map((post, i) => `
      POST ${i + 1}:
      Title: ${post.title}
      Body: ${post.body.substring(0, 150)}${post.body.length > 150 ? '...' : ''}
      Sentiment: ${post.sentiment} (score: ${post.sentiment_score})
      Tone: ${post.tone.join(', ')}
      Themes: ${post.themes.join(', ')}
      Upvotes: ${post.upvotes}, Comments: ${post.comments}
    `).join('\n')}
  `;
  
  try {
    // Call OpenAI to generate insight
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      tools: [
        {
          type: "function",
          function: {
            name: "generate_weekly_summary",
            description: "Generate a structured weekly summary of WHOOP Reddit discussions",
            parameters: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Clear title for the weekly summary"
                },
                summary: {
                  type: "string",
                  description: "3-5 sentence summary of the key trends and findings from the week"
                },
                recommendations: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 actionable recommendations for WHOOP based on the week's discussions"
                },
                representative_quotes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      quote: { type: "string" },
                      sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                      source: { type: "string", description: "Source identifier, like post title or URL" }
                    },
                    required: ["quote", "sentiment"]
                  },
                  description: "2-3 representative quotes from the week that illustrate key points"
                },
                top_themes: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 most important themes from the week"
                }
              },
              required: ["title", "summary", "recommendations", "representative_quotes", "top_themes"]
            }
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "generate_weekly_summary" } }
    });
    
    const insightResult = response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
    
    if (insightResult) {
      const insight = JSON.parse(insightResult);
      
      // Save to insights table
      const { data: insightData, error: insightError } = await supabase
        .from('insights')
        .insert({
          title: insight.title,
          summary: insight.summary,
          recommendations: insight.recommendations,
          representative_quotes: insight.representative_quotes,
          theme_id: null, // No specific theme for weekly summary
          time_period_start: startDate.toISOString(),
          time_period_end: endDate.toISOString(),
          insight_type: 'weekly',
          metadata: {
            total_posts: postsData.length,
            sentiment_counts: sentimentCounts,
            top_themes: insight.top_themes,
            generated_with: 'gpt-4o-mini',
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select();
      
      if (insightError) {
        console.error('Error saving weekly summary insight:', insightError);
      } else {
        console.log('Successfully generated and saved weekly summary insight');
      }
    } else {
      console.error('No valid insight returned for weekly summary');
    }
  } catch (error) {
    console.error('Error generating weekly summary insight:', error);
  }
}

// Main execution function
async function main() {
  try {
    console.log('Starting insights generation...');
    
    // Generate theme-based insights
    await generateThemeInsights();
    
    // Generate weekly summary
    await generateWeeklySummary();
    
    console.log('Insights generation complete!');
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

// Run the main function
main().catch(console.error); 