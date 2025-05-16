import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/client';

interface AspectData {
  feature: string;
  sentiment: string;
  quote?: string;
  [key: string]: any;
}

interface AnalysisResult {
  id: string;
  content_id: string;
  aspects: AspectData[];
  [key: string]: any;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const feature = searchParams.get('feature');
    
    if (!feature) {
      return NextResponse.json(
        { error: 'Feature parameter is required' },
        { status: 400 }
      );
    }

    const supabase = createClient();
    
    // Count how many posts mention this feature
    const { data: postsMentioning, error: postsError } = await supabase
      .from('analysis_results')
      .select('content_id')
      .eq('content_type', 'post')
      .contains('aspects', [{ feature }]);
    
    if (postsError) {
      console.error('Error fetching posts mentioning feature:', postsError);
      throw postsError;
    }
    
    // Count total aspects for this feature
    const { data: aspectsData, error: aspectsError } = await supabase
      .from('analysis_results')
      .select('id, content_id, aspects')
      .eq('content_type', 'post')
      .contains('aspects', [{ feature }]);
    
    if (aspectsError) {
      console.error('Error fetching aspects data:', aspectsError);
      throw aspectsError;
    }
    
    // Process the data to count aspects and quotes
    let totalMentions = 0;
    let mentionsWithQuotes = 0;
    let mentionsWithoutQuotes = 0;
    
    const processedResults = aspectsData.map((result: AnalysisResult) => {
      const featureAspects = result.aspects.filter((aspect: AspectData) => 
        aspect.feature === feature
      );
      
      let resultMentions = 0;
      let resultWithQuotes = 0;
      let resultWithoutQuotes = 0;
      
      featureAspects.forEach((aspect: AspectData) => {
        resultMentions++;
        
        if (aspect.quote && aspect.quote.trim() !== '') {
          resultWithQuotes++;
        } else {
          resultWithoutQuotes++;
        }
      });
      
      totalMentions += resultMentions;
      mentionsWithQuotes += resultWithQuotes;
      mentionsWithoutQuotes += resultWithoutQuotes;
      
      return {
        content_id: result.content_id,
        total_aspects: featureAspects.length,
        aspects_with_quotes: resultWithQuotes,
        aspects_without_quotes: resultWithoutQuotes,
        aspects_detail: featureAspects
      };
    });
    
    return NextResponse.json({
      feature,
      unique_posts: postsMentioning?.length || 0,
      total_mentions: totalMentions,
      mentions_with_quotes: mentionsWithQuotes,
      mentions_without_quotes: mentionsWithoutQuotes,
      results: processedResults
    });
  } catch (error) {
    console.error('Error in feature counts debug endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 