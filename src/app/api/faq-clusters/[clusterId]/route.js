import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createClientSide } from '@/utils/supabase/client';

export async function GET(request, { params }) {
  const clusterId = params.clusterId;
  
  if (!clusterId) {
    return NextResponse.json(
      { error: 'Cluster ID is required' },
      { status: 400 }
    );
  }

  let supabase;
  
  try {
    // Try to use service role if available (server-side)
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log(`[API Route] Using service role key for cluster ${clusterId}`);
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    } else {
      // Fall back to client with anon key (which should work now due to RLS policies)
      console.log(`[API Route] Service role key not found, falling back to anonymous client for cluster ${clusterId}`);
      supabase = createClientSide();
    }
    
    console.log(`[API Route] Fetching questions for cluster ID: ${clusterId}`);

    // Get cluster centroid (for future use with actual vector similarity)
    const { data: clusterData, error: clusterError } = await supabase
      .from('question_clusters')
      .select('centroid')
      .eq('id', clusterId)
      .single();

    if (clusterError) {
      console.error(`[API Route] Error fetching cluster centroid: ${clusterError.message}`);
      return NextResponse.json(
        { error: `Failed to fetch cluster centroid: ${clusterError.message}` },
        { status: 500 }
      );
    }

    const centroid = clusterData?.centroid;

    // Get all questions for this cluster first
    const { data: questionData, error: questionError } = await supabase
      .from('question_embeddings')
      .select(`
        id, 
        question, 
        post_url, 
        reddit_post_id
      `)
      .eq('cluster_id', clusterId);

    if (questionError) {
      console.error(`[API Route] Error fetching questions: ${questionError.message}`);
      return NextResponse.json(
        { error: `Failed to fetch questions: ${questionError.message}` },
        { status: 500 }
      );
    }

    if (!questionData || questionData.length === 0) {
      console.log(`[API Route] No questions found for cluster ${clusterId}`);
      return NextResponse.json({ questions: [] }, { status: 200 });
    }

    // Extract post IDs to fetch engagement metrics
    const redditPostIds = questionData
      .map(q => q.reddit_post_id)
      .filter(id => id !== null);
    
    // If we have valid post IDs, fetch their engagement metrics
    let postMetrics = {};
    if (redditPostIds.length > 0) {
      const { data: postData, error: postError } = await supabase
        .from('reddit_posts')
        .select('id, ups, num_comments, score')
        .in('id', redditPostIds);
      
      if (postError) {
        console.error(`[API Route] Error fetching post metrics: ${postError.message}`);
        // Continue without metrics rather than failing
      } else if (postData) {
        // Create a lookup map for easier access
        postMetrics = postData.reduce((acc, post) => {
          acc[post.id] = {
            ups: post.ups,
            num_comments: post.num_comments,
            score: post.score
          };
          return acc;
        }, {});
      }
    }

    // Combine question data with metrics
    const formattedQuestions = questionData.map(q => ({
      id: q.id,
      question: q.question,
      post_url: q.post_url,
      ups: q.reddit_post_id && postMetrics[q.reddit_post_id] ? postMetrics[q.reddit_post_id].ups : 0,
      num_comments: q.reddit_post_id && postMetrics[q.reddit_post_id] ? postMetrics[q.reddit_post_id].num_comments : 0,
      score: q.reddit_post_id && postMetrics[q.reddit_post_id] ? postMetrics[q.reddit_post_id].score : 0
    }));

    // If we have 5 or fewer questions, just return them all
    if (formattedQuestions.length <= 5) {
      // Still mark the highest upvoted and most commented
      if (formattedQuestions.length > 0) {
        const highestUpvoted = [...formattedQuestions].sort((a, b) => b.ups - a.ups)[0];
        highestUpvoted.isHighestUpvoted = true;

        const mostCommented = [...formattedQuestions].sort((a, b) => b.num_comments - a.num_comments)[0];
        mostCommented.isMostCommented = true;
      }
      
      console.log(`[API Route] Returning all ${formattedQuestions.length} questions for small cluster ${clusterId}`);
      return NextResponse.json({ questions: formattedQuestions }, { status: 200 });
    }

    // For clusters with more than 5 questions, use our priority logic
    // Find highest upvoted question
    const highestUpvoted = [...formattedQuestions].sort((a, b) => b.ups - a.ups)[0];
    highestUpvoted.isHighestUpvoted = true;

    // Find most commented question
    const mostCommented = [...formattedQuestions].sort((a, b) => b.num_comments - a.num_comments)[0];
    mostCommented.isMostCommented = true;
    
    // Remove the highest upvoted and most commented from the main list if they're different
    let restOfQuestions = formattedQuestions.filter(q => 
      q.id !== highestUpvoted.id && 
      q.id !== mostCommented.id
    );
    
    // Get closest to centroid - for now using score as a simple approximation
    const closestToCentroid = restOfQuestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    // Combine for our result, putting highest upvoted first, most commented second
    const sortedQuestions = [highestUpvoted];
    
    // Only add most commented if it's different from highest upvoted
    if (mostCommented.id !== highestUpvoted.id) {
      sortedQuestions.push(mostCommented);
    } else {
      // If they're the same, mark the single question as both highest upvoted and most commented
      highestUpvoted.isMostCommented = true;
      
      // Add one more from the rest to keep our count at 5 total
      if (restOfQuestions.length > 3) {
        closestToCentroid.push(restOfQuestions[3]);
      }
    }
    
    // Add the rest of the questions (closest to centroid)
    sortedQuestions.push(...closestToCentroid);
    
    // Ensure we return at most 5 questions
    const finalQuestions = sortedQuestions.slice(0, 5);
    
    console.log(`[API Route] Successfully sorted ${finalQuestions.length} questions for cluster ${clusterId}`);

    return NextResponse.json({ questions: finalQuestions }, { status: 200 });
  
  } catch (error) {
    console.error(`[API Route] General error fetching questions for cluster ${clusterId}:`, error);
    return NextResponse.json(
      { error: `Server error: ${error.message}` },
      { status: 500 }
    );
  }
} 