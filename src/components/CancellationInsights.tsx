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

export default function CancellationInsights() {
  const [cancellationStats, setCancellationStats] = useState<CancellationStats | null>(null);
  const [cancellationReasons, setCancellationReasons] = useState<CancellationReason[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchCancellationData = async () => {
      try {
        const supabase = createClient();
        
        // Get total posts count and cancellation mention count
        const { data, error } = await supabase
          .from('analysis_results')
          .select('cancellation_mention, content_id')
          .eq('content_type', 'post');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          const total = data.length;
          const cancellationMentions = data.filter(item => item.cancellation_mention).length;
          
          setCancellationStats({
            cancellation_count: cancellationMentions,
            total_count: total,
            cancellation_percent: parseFloat(((cancellationMentions / total) * 100).toFixed(1))
          });
        }
        
        // Get cancellation reasons directly from analysis_results, joined with reddit_posts
        const { data: reasonData, error: reasonError } = await supabase
          .from('analysis_results')
          .select(`
            id, 
            cancellation_reason,
            sentiment_score,
            content_id
          `)
          .eq('cancellation_mention', true)
          .not('cancellation_reason', 'is', null)
          .not('cancellation_reason', 'eq', '')
          .order('sentiment_score', { ascending: true }) // Most negative first
          .limit(50);
        
        if (reasonError) {
          console.error('Error fetching cancellation reasons:', reasonError);
        } else if (reasonData) {
          // Get the post details separately
          const contentIds = reasonData.map(item => item.content_id);
          
          const { data: postsData, error: postsError } = await supabase
            .from('reddit_posts')
            .select('id, title, url')
            .in('id', contentIds);
            
          if (postsError) {
            console.error('Error fetching post details:', postsError);
          }
          
          // Create a map of post IDs to their details
          const postsMap = new Map();
          if (postsData) {
            postsData.forEach(post => {
              postsMap.set(post.id, {
                title: post.title || '',
                url: post.url || ''
              });
            });
          }
          
          const formattedReasons = reasonData.map(item => {
            const postDetails = postsMap.get(item.content_id) || { title: '', url: '' };
            
            return {
              id: item.id,
              reason: item.cancellation_reason,
              post_title: postDetails.title,
              post_url: postDetails.url,
              sentiment_score: item.sentiment_score
            };
          });
          
          setCancellationReasons(formattedReasons);
        }
      } catch (err) {
        console.error('Error fetching cancellation data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCancellationData();
  }, []);
  
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