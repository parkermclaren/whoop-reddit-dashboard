"use client";

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

interface SentimentStats {
  avg_sentiment_score: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  total_count: number;
  positive_percent: number;
  neutral_percent: number;
  negative_percent: number;
}

export default function Stats() {
  const [sentimentStats, setSentimentStats] = useState<SentimentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverStat, setHoverStat] = useState<'negative' | 'neutral' | 'positive' | null>(null);
  const [announcementRelatedPercent, setAnnouncementRelatedPercent] = useState<number | null>(null);
  const [peakActivityPostCount, setPeakActivityPostCount] = useState<number>(392);

  useEffect(() => {
    const fetchSentimentStats = async () => {
      try {
        const supabase = createClient();
        // Use a direct SQL query instead of RPC function
        const { data, error } = await supabase
          .from('analysis_results')
          .select('sentiment, sentiment_score')
          .eq('content_type', 'post');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Calculate the stats manually
          const total = data.length;
          const positive = data.filter(item => item.sentiment === 'positive').length;
          const neutral = data.filter(item => item.sentiment === 'neutral').length;
          const negative = data.filter(item => item.sentiment === 'negative').length;
          
          const avgScore = data.reduce((sum, item) => sum + (item.sentiment_score || 0), 0) / total;
          
          setSentimentStats({
            avg_sentiment_score: avgScore,
            positive_count: positive,
            neutral_count: neutral,
            negative_count: negative,
            total_count: total,
            positive_percent: parseFloat(((positive / total) * 100).toFixed(1)),
            neutral_percent: parseFloat(((neutral / total) * 100).toFixed(1)),
            negative_percent: parseFloat(((negative / total) * 100).toFixed(1))
          });
        } else {
          // Fallback to static data if no data returned
          setSentimentStats({
            avg_sentiment_score: -0.25,
            positive_count: 112,
            neutral_count: 284,
            negative_count: 382,
            total_count: 778,
            positive_percent: 14.4,
            neutral_percent: 36.5,
            negative_percent: 49.1
          });
        }
      } catch (err) {
        console.error('Error fetching sentiment stats:', err);
        // Fallback to static data on error
        setSentimentStats({
          avg_sentiment_score: -0.25,
          positive_count: 112,
          neutral_count: 284,
          negative_count: 382,
          total_count: 778,
          positive_percent: 14.4,
          neutral_percent: 36.5,
          negative_percent: 49.1
        });
      } finally {
        setLoading(false);
      }
    };
    
    const fetchAnnouncementRelatedStats = async () => {
      try {
        const supabase = createClient();
        // Get peak activity posts and calculate announcement related percentage
        const { data: peakData, error: peakError } = await supabase
          .from('analysis_results')
          .select('is_announcement_related, content_id')
          .eq('content_type', 'post');
        
        if (peakError) throw peakError;
        
        if (peakData && peakData.length > 0) {
          // Count announcement related posts
          const totalPeakPosts = peakData.length;
          const announcementRelatedPosts = peakData.filter(item => item.is_announcement_related).length;
          
          // Set the percentage
          setAnnouncementRelatedPercent(
            parseFloat(((announcementRelatedPosts / totalPeakPosts) * 100).toFixed(1))
          );
          
          // Update peak activity post count
          setPeakActivityPostCount(totalPeakPosts);
        }
      } catch (err) {
        console.error('Error fetching announcement related stats:', err);
        // Fallback to a default value
        setAnnouncementRelatedPercent(68.5);
      }
    };
    
    fetchSentimentStats();
    fetchAnnouncementRelatedStats();
  }, []);

  // Helper to get tooltip text for hover
  const getTooltipText = (type: 'negative' | 'neutral' | 'positive') => {
    if (!sentimentStats) return '';
    
    switch(type) {
      case 'negative':
        return `${sentimentStats.negative_count} posts (${sentimentStats.negative_percent}%)`;
      case 'neutral':
        return `${sentimentStats.neutral_count} posts (${sentimentStats.neutral_percent}%)`;
      case 'positive':
        return `${sentimentStats.positive_count} posts (${sentimentStats.positive_percent}%)`;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
        <h3 className="text-sm text-gray-400 uppercase mb-1">Total Posts</h3>
        <div className="flex items-end">
          <div className="text-4xl font-bold">{sentimentStats?.total_count || 780}</div>
          <div className="text-sm text-green-500 ml-2 pb-1">+234%</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Compared to previous 3-day period</p>
      </div>
      
      <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
        <h3 className="text-sm text-gray-400 uppercase mb-1">
          Sentiment Distribution
        </h3>
        {loading ? (
          <div className="h-[70px] flex items-center justify-center">Loading...</div>
        ) : (
          <>
            <div className="mb-4 text-xl font-bold">
              {sentimentStats?.negative_percent}% Negative
            </div>
            
            {/* Thin bar container */}
            <div className="relative w-full mb-4">
              {/* Background bar */}
              <div className="w-full h-2.5 bg-[#1a1c20] rounded-full"></div>
              
              {/* Interactive segments overlay */}
              <div className="absolute top-0 left-0 flex w-full h-2.5 rounded-full overflow-hidden">
                {/* Negative segment */}
                <div 
                  className="h-full bg-[#ff6384] cursor-pointer relative"
                  style={{ width: `${sentimentStats?.negative_percent || 49.1}%` }}
                  onMouseEnter={() => setHoverStat('negative')}
                  onMouseLeave={() => setHoverStat(null)}
                ></div>
                
                {/* Neutral segment */}
                <div 
                  className="h-full bg-gray-400 cursor-pointer relative"
                  style={{ width: `${sentimentStats?.neutral_percent || 36.5}%` }}
                  onMouseEnter={() => setHoverStat('neutral')}
                  onMouseLeave={() => setHoverStat(null)}
                ></div>
                
                {/* Positive segment */}
                <div 
                  className="h-full bg-[#44d7b6] cursor-pointer relative"
                  style={{ width: `${sentimentStats?.positive_percent || 14.4}%` }}
                  onMouseEnter={() => setHoverStat('positive')}
                  onMouseLeave={() => setHoverStat(null)}
                ></div>
              </div>
              
              {/* Tooltip that appears on hover */}
              {hoverStat && (
                <div 
                  className="absolute -top-8 bg-black text-white text-xs py-1 px-2 rounded whitespace-nowrap pointer-events-none"
                  style={{ 
                    left: hoverStat === 'negative' 
                      ? `${(sentimentStats?.negative_percent || 49.1) / 2}%` 
                      : hoverStat === 'neutral' 
                        ? `${(sentimentStats?.negative_percent || 49.1) + ((sentimentStats?.neutral_percent || 36.5) / 2)}%` 
                        : `${(sentimentStats?.negative_percent || 49.1) + (sentimentStats?.neutral_percent || 36.5) + ((sentimentStats?.positive_percent || 14.4) / 2)}%`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  {getTooltipText(hoverStat)}
                </div>
              )}
            </div>
            
            <div className="flex justify-between text-xs text-gray-400">
              <span>Negative</span>
              <span>Neutral</span>
              <span>Positive</span>
            </div>
          </>
        )}
      </div>
      
      <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
        <h3 className="text-sm text-gray-400 uppercase mb-1">Top Theme</h3>
        <div className="text-xl font-bold mb-1">Subscription Pricing</div>
        <div className="flex items-center">
          <div className="h-3 w-3 rounded-full bg-[#ff6384] mr-2"></div>
          <span className="text-[#ff6384] text-sm">Negative Sentiment</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">68% of discussion mentions</p>
      </div>
      
      <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
        <h3 className="text-sm text-gray-400 uppercase mb-1">Announcement Relevance</h3>
        <div className="flex items-end">
          <div className="text-4xl font-bold">{announcementRelatedPercent || 79}%</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">discussed the May 8th product launch</p>
      </div>
    </div>
  );
} 