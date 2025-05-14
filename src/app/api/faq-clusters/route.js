import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createClientSide } from '@/utils/supabase/client';

export async function GET() {
  let supabase;
  
  try {
    // Try to use service role if available (server-side)
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('[API Route] Using service role key');
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    } else {
      // Fall back to client with anon key (which should work now due to RLS policies)
      console.log('[API Route] Service role key not found, falling back to anonymous client');
      supabase = createClientSide();
    }
    
    console.log('[API Route] Attempting to fetch FAQ clusters...');
  
    // Simplified fetch for now (just cluster topics)
    const { data: clusterData, error: clusterError } = await supabase
      .from('question_clusters')
      .select('id, topic, question_count')
      .order('question_count', { ascending: false })
      .limit(5);
  
    if (clusterError) {
      console.error('[API Route] Error fetching clusters:', clusterError);
      return NextResponse.json(
        { error: `Failed to fetch clusters: ${clusterError.message}` },
        { status: 500 }
      );
    }
  
    console.log('[API Route] Successfully fetched simplified cluster data:', clusterData);
    console.log('[API Route] Number of clusters found:', clusterData?.length || 0);
  
    if (!clusterData || clusterData.length === 0) {
      console.log('[API Route] No clusters found in question_clusters table.');
      return NextResponse.json({ clusters: [] }, { status: 200 });
    }
  
    // For now, we won't fetch detailed questions here to keep it simple and test stability
    const clusters = clusterData.map(cluster => ({ ...cluster, questions: [] }));
  
    return NextResponse.json({ clusters }, { status: 200 });
  
  } catch (error) {
    console.error('[API Route] General error in FAQ clusters route:', error);
    return NextResponse.json(
      { error: `Server error: ${error.message}` },
      { status: 500 }
    );
  }
} 