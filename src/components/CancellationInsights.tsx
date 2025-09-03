"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

interface CancellationStats {
  cancellation_count: number;
  total_count: number;
  cancellation_percent: number;
}

interface CancellationReason {
  id: string;
  reason: string;
  post_title: string;
  post_url: string;
  sentiment_score: number;
}

interface CancellationInsightsProps {
    fromDate?: string;
    toDate?: string;
}

export default function CancellationInsights({ fromDate, toDate }: CancellationInsightsProps) {
  const [cancellationStats, setCancellationStats] = useState<CancellationStats | null>(null);
  const [cancellationReasons, setCancellationReasons] = useState<CancellationReason[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchCancellationData = async () => {
      try {
        const supabase = createClient();
        
        // Step 1: Get post_ids from date range if specified, with pagination
        let postIds: string[] | null = null;
        if (fromDate || toDate) {
            let allPostIds: string[] = [];
            let offset = 0;
            const BATCH_SIZE = 1000;
            let keepFetching = true;

            while(keepFetching) {
                let query = supabase.from('reddit_posts').select('id');
                if (fromDate) query = query.gte('created_at', fromDate);
                if (toDate) query = query.lte('created_at', toDate);
                
                const { data, error } = await query.range(offset, offset + BATCH_SIZE - 1);

                if (error) throw new Error(`Error fetching post IDs: ${error.message}`);
                
                if (data && data.length > 0) {
                    allPostIds.push(...data.map(p => p.id));
                    offset += data.length;
                } else {
                    keepFetching = false;
                }

                if (!data || data.length < BATCH_SIZE) {
                    keepFetching = false;
                }
            }
            postIds = allPostIds;

            if (postIds.length === 0) {
                setCancellationStats({ cancellation_count: 0, total_count: 0, cancellation_percent: 0 });
                setCancellationReasons([]);
                setLoading(false);
                return;
            }
        }
        
        let totalAnalyzedCount = 0;
        let cancellationMentionTrueCount = 0;

        const countBatch = async (ids?: string[]) => {
          let totalQuery = supabase
            .from('analysis_results')
            .select('*', { count: 'exact', head: true })
            .eq('content_type', 'post')
            .not('extended_analysis_at', 'is', null);
          if (ids) totalQuery = totalQuery.in('content_id', ids);
          const { count: totalCountPart, error: totalErr } = await totalQuery;
          if (totalErr) throw totalErr;
          totalAnalyzedCount += totalCountPart || 0;

          let cancellationQuery = supabase
            .from('analysis_results')
            .select('*', { count: 'exact', head: true })
            .eq('content_type', 'post')
            .not('extended_analysis_at', 'is', null)
            .eq('cancellation_mention', true);
          if (ids) cancellationQuery = cancellationQuery.in('content_id', ids);
          const { count: cancellationCountPart, error: cancellationErr } = await cancellationQuery;
          if (cancellationErr) throw cancellationErr;
          cancellationMentionTrueCount += cancellationCountPart || 0;
        };

        if (postIds) {
          const batchSize = 200; // Reduced batch size
          for (let i = 0; i < postIds.length; i += batchSize) {
            await countBatch(postIds.slice(i, i + batchSize));
          }
        } else {
          await countBatch();
        }

        const calculatedCancellationStats: CancellationStats = {
          cancellation_count: cancellationMentionTrueCount,
          total_count: totalAnalyzedCount,
          cancellation_percent: totalAnalyzedCount > 0 ? parseFloat(((cancellationMentionTrueCount / totalAnalyzedCount) * 100).toFixed(1)) : 0
        };
        setCancellationStats(calculatedCancellationStats);

        let reasonsRows: any[] = [];
        const baseReasons = () => supabase
          .from('analysis_results')
          .select(`id, cancellation_reason, sentiment_score, content_id`)
          .eq('content_type', 'post') // Added for consistency
          .eq('cancellation_mention', true)
          .not('cancellation_reason', 'is', null)
          .not('cancellation_reason', 'eq', '')
          .not('extended_analysis_at', 'is', null)
          .order('sentiment_score', { ascending: true });

        const fetchReasonsInBatches = async (ids?: string[]) => {
          const allReasons: any[] = [];
          const BATCH_SIZE = 1000; // Can be larger as it's for pagination
          let offset = 0;
          let keepFetching = true;
          
          while(keepFetching) {
            let query = baseReasons();
            if (ids) query = query.in('content_id', ids);
            
            const { data, error } = await query.range(offset, offset + BATCH_SIZE - 1);
            if (error) {
              console.error('Error fetching cancellation reasons batch:', error);
              keepFetching = false; // Stop on error
              throw error;
            }

            if (data && data.length > 0) {
                allReasons.push(...data);
                offset += data.length;
            } else {
                keepFetching = false;
            }

            if (!data || data.length < BATCH_SIZE) {
                keepFetching = false;
            }
          }
          return allReasons;
        }

        if (postIds) {
          const batchSize = 200; // Reduced batch size
          for (let i = 0; i < postIds.length; i += batchSize) {
            const batchIds = postIds.slice(i, i + batchSize);
            const reasonsBatch = await fetchReasonsInBatches(batchIds);
            reasonsRows.push(...reasonsBatch);
          }
        } else {
          reasonsRows = await fetchReasonsInBatches();
        }

        if (reasonsRows.length > 0) {
          // De-duplicate reasons based on their unique ID to prevent React key errors
          const uniqueReasons = Array.from(new Map(reasonsRows.map(item => [item.id, item])).values());

          const contentIds = Array.from(new Set(uniqueReasons.map(item => item.content_id).filter(Boolean)));
          const postsMap = new Map<string, { title: string; url: string }>();
          const batchSize = 200;
          for (let i = 0; i < contentIds.length; i += batchSize) {
            const batchIds = contentIds.slice(i, i + batchSize);
            const { data: postsData, error: postsError } = await supabase
              .from('reddit_posts')
              .select('id, title, url')
              .in('id', batchIds);
            if (postsError) {
              console.error('Error fetching post details:', postsError);
              continue;
            }
            if (postsData) {
              postsData.forEach(post => {
                postsMap.set(post.id, { title: post.title || '', url: post.url || '' });
              });
            }
          }

          const formattedReasons = uniqueReasons.map(item => {
            const postDetails = postsMap.get(item.content_id) || { title: '', url: '' };
            return {
              id: item.id,
              reason: item.cancellation_reason,
              post_title: postDetails.title,
              post_url: postDetails.url,
              sentiment_score: item.sentiment_score
            } as CancellationReason;
          });

          setCancellationReasons(formattedReasons);
        } else {
          setCancellationReasons([]);
        }
      } catch (err) {
        console.error('Error fetching cancellation data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCancellationData();
  }, [fromDate, toDate]);
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Cancellation Percentage */}
      <div className="flex flex-col justify-center">
        <h3 className="text-sm text-gray-400 uppercase mb-4">Cancellation Mentions</h3>
        {loading ? (
          <div className="flex items-center justify-center h-60">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
          </div>
        ) : cancellationStats ? (
          <div className="flex flex-col items-center justify-center h-60">
            <div className="text-[#ff6384] text-8xl font-bold">
              {cancellationStats.cancellation_percent}%
            </div>
            <div className="mt-4 text-center">
              <div className="text-lg text-gray-200">
                {cancellationStats.cancellation_count} of {cancellationStats.total_count} posts
              </div>
              <div className="text-sm text-gray-400">
                mention cancelling their WHOOP membership
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-60 text-gray-400">
            No cancellation data available
          </div>
        )}
      </div>
      
      {/* Cancellation Reasons */}
      <div>
        <h3 className="text-sm text-gray-400 uppercase mb-4">Top Cancellation Reasons</h3>
        {loading ? (
          <div className="flex items-center justify-center h-60">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
          </div>
        ) : cancellationReasons.length > 0 ? (
          <div className="h-60 overflow-y-auto pr-2 custom-scrollbar">
            {cancellationReasons.slice(0, 5).map((reason) => (
              <div 
                key={reason.id}
                className="mb-4 border-l-4 border-[#ff6384] pl-3 py-1"
              >
                <div className="text-sm font-medium mb-1">{reason.reason}</div>
                <div className="flex items-center text-xs">
                  <a 
                    href={reason.post_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 truncate"
                  >
                    {reason.post_title}
                  </a>
                </div>
              </div>
            ))}
            {cancellationReasons.length > 5 && (
              <div className="space-y-4 mt-4 pt-2 border-t border-gray-700">
                {cancellationReasons.slice(5).map((reason) => (
                  <div 
                    key={reason.id}
                    className="mb-4 border-l-4 border-[#ff6384] pl-3 py-1"
                  >
                    <div className="text-sm font-medium mb-1">{reason.reason}</div>
                    <div className="flex items-center text-xs">
                      <a 
                        href={reason.post_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 truncate"
                      >
                        {reason.post_title}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-center py-10">
            No cancellation reasons found.
          </div>
        )}
      </div>
    </div>
  );
} 