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

interface SentimentData {
  sentiment: string;
  sentiment_score: number;
}

interface AnnouncementData {
  is_announcement_related: boolean;
  content_id: string;
}

export default function Stats() {
  const [sentimentStats, setSentimentStats] = useState<SentimentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverStat, setHoverStat] = useState<'negative' | 'neutral' | 'positive' | null>(null);
  const [announcementRelatedPercent, setAnnouncementRelatedPercent] = useState<number | null>(null);
  const [peakActivityPostCount, setPeakActivityPostCount] = useState<number>(392);
  const [postsLast24Hours, setPostsLast24Hours] = useState<number>(146);
  
  // Theme state has been simplified to just hold display data
  const [topTheme, setTopTheme] = useState<{
    name: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    percentage: number;
  } | null>(null);

  // Theme mapping to categorize various terms from the analysis_results table
  const THEME_MAPPING: Record<string, string> = {
    // Subscription Pricing related terms
    'pricing': 'Subscription Pricing',
    'membership model': 'Subscription Pricing',
    'membership pricing': 'Subscription Pricing',
    'membership': 'Subscription Pricing',
    'subscription model': 'Subscription Pricing',
    'membership policy': 'Subscription Pricing',
    'membership upgrade': 'Subscription Pricing',
    'upgrade fees': 'Subscription Pricing',
    'membership changes': 'Subscription Pricing',
    'membership benefits': 'Subscription Pricing',
    'membership cancellation': 'Subscription Pricing',
    'membership features': 'Subscription Pricing',
    'membership tiers': 'Subscription Pricing',
    'membership issues': 'Subscription Pricing',
    'membership extension': 'Subscription Pricing',
    'membership options': 'Subscription Pricing',
    'cost': 'Subscription Pricing',
    'free upgrade': 'Subscription Pricing',
    
    // Hardware Design related terms
    'hardware quality': 'Hardware Design',
    'hardware updates': 'Hardware Design',
    'hardware compatibility': 'Hardware Design',
    'upgrade process': 'Hardware Design',
    'accessories': 'Hardware Design',
    'hardware upgrades': 'Hardware Design',
    'hardware upgrade': 'Hardware Design',
    'WHOOP 5.0': 'Hardware Design',
    'hardware': 'Hardware Design',
    'compatibility': 'Hardware Design',
    'hardware comparison': 'Hardware Design',
    'device upgrade': 'Hardware Design',
    'hardware features': 'Hardware Design',
    'upgrade': 'Hardware Design',
    'design': 'Hardware Design',
    'hardware update': 'Hardware Design',
    'device functionality': 'Hardware Design',
    'wearability': 'Hardware Design',
    'wearable technology': 'Hardware Design',
    'WHOOP MG': 'Hardware Design',
    
    // New Health Metrics related terms
    'health metrics': 'New Health Metrics',
    'sleep tracking': 'New Health Metrics',
    'health tracking': 'New Health Metrics',
    'fitness tracking': 'New Health Metrics',
    'recovery': 'New Health Metrics',
    'heart rate accuracy': 'New Health Metrics',
    'health monitoring': 'New Health Metrics',
    'data accuracy': 'New Health Metrics',
    'medical features': 'New Health Metrics',
    'health features': 'New Health Metrics',
    'heart rate tracking': 'New Health Metrics',
    'sensor accuracy': 'New Health Metrics',
    'heart rate monitoring': 'New Health Metrics',
    'blood pressure': 'New Health Metrics',
    'Healthspan': 'New Health Metrics',
    'calibration': 'New Health Metrics',
    'blood pressure monitoring': 'New Health Metrics',
    'accuracy': 'New Health Metrics',
    
    // App Integration related terms
    'app functionality': 'App Integration',
    'user interface': 'App Integration',
    'app performance': 'App Integration',
    'integration': 'App Integration',
    'user experience': 'App Integration',
    'feature availability': 'App Integration',
    'features': 'App Integration',
    'new features': 'App Integration',
    'feature comparison': 'App Integration',
    
    // Battery Life related terms
    'battery life': 'Battery Life'
  };

  // Main theme categories
  const MAIN_THEMES = [
    'Subscription Pricing',
    'Hardware Design',
    'New Health Metrics',
    'App Integration',
    'Battery Life'
  ];

  useEffect(() => {
    const fetchSentimentStats = async () => {
      try {
        const supabase = createClient();
        
        // First get the total count
        const { count: totalCount, error: countError } = await supabase
          .from('analysis_results')
          .select('*', { count: 'exact', head: true })
          .eq('content_type', 'post');
        
        if (countError) {
          console.error('Error counting posts:', countError);
          throw countError;
        }
        
        if (totalCount === null) throw new Error('Could not get total count');

        // Initialize accumulators
        let allData: SentimentData[] = [];
        let batchSize = 1000;
        let processedRows = 0;

        // Fetch data in batches
        while (processedRows < totalCount) {
          const { data: batchData, error: batchError } = await supabase
            .from('analysis_results')
            .select('sentiment, sentiment_score')
            .eq('content_type', 'post')
            .range(processedRows, processedRows + batchSize - 1);

          if (batchError) throw batchError;
          if (!batchData) throw new Error('No data returned in batch');

          allData = [...allData, ...batchData];
          processedRows += batchSize;
        }

        // Calculate stats from complete dataset
        const total = allData.length;
        const positive = allData.filter(item => item.sentiment === 'positive').length;
        const neutral = allData.filter(item => item.sentiment === 'neutral').length;
        const negative = allData.filter(item => item.sentiment === 'negative').length;
        
        const avgScore = allData.reduce((sum, item) => sum + (item.sentiment_score || 0), 0) / total;
        
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
        
        // First get the total count
        const { count: totalCount, error: countError } = await supabase
          .from('analysis_results')
          .select('*', { count: 'exact', head: true })
          .eq('content_type', 'post');
        
        if (countError) throw countError;
        if (totalCount === null) throw new Error('Could not get total count');

        // Initialize accumulators
        let allData: AnnouncementData[] = [];
        let batchSize = 1000;
        let processedRows = 0;

        // Fetch data in batches
        while (processedRows < totalCount) {
          const { data: batchData, error: batchError } = await supabase
            .from('analysis_results')
            .select('is_announcement_related, content_id')
            .eq('content_type', 'post')
            .range(processedRows, processedRows + batchSize - 1);

          if (batchError) throw batchError;
          if (!batchData) throw new Error('No data returned in batch');

          allData = [...allData, ...batchData];
          processedRows += batchSize;
        }

        // Calculate announcement related stats from complete dataset
        const totalPeakPosts = allData.length;
        const announcementRelatedPosts = allData.filter(item => item.is_announcement_related).length;
        
        // Set the percentage
        setAnnouncementRelatedPercent(
          parseFloat(((announcementRelatedPosts / totalPeakPosts) * 100).toFixed(1))
        );
        
        // Update peak activity post count with actual total
        setPeakActivityPostCount(totalPeakPosts);
      } catch (err) {
        console.error('Error fetching announcement related stats:', err);
        // Fallback to a default value
        setAnnouncementRelatedPercent(68.5);
      }
    };
    
    const fetchRecentPosts = async () => {
      try {
        const supabase = createClient();
        // Get posts from the last 24 hours
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        
        const { data, error } = await supabase
          .from('reddit_posts')
          .select('id')
          .gte('created_at', oneDayAgo.toISOString());
        
        if (error) throw error;
        
        if (data) {
          setPostsLast24Hours(data.length);
        }
      } catch (err) {
        console.error('Error fetching recent posts:', err);
        // Keep the default value
      }
    };

    // New implementation of the top theme fetching
    const fetchTopTheme = async () => {
      try {
        const supabase = createClient();
        
        // Get all sentiment analysis results for posts with themes
        const { data: analysisResults, error: analysisError } = await supabase
          .from('analysis_results')
          .select('themes, sentiment')
          .eq('content_type', 'post')
          .not('themes', 'is', null);
        
        if (analysisError) {
          console.error('Error fetching analysis results:', analysisError);
          throw analysisError;
        }
        
        if (!analysisResults || analysisResults.length === 0) {
          // Default to fallback data if no results
          setTopTheme({
            name: 'Battery Life',
            sentiment: 'negative',
            percentage: 32
          });
          return;
        }
        
        // Initialize counters for main themes
        const themeCounters: Record<string, {
          positive: number;
          neutral: number;
          negative: number;
          total: number;
        }> = {};
        
        MAIN_THEMES.forEach(theme => {
          themeCounters[theme] = {
            positive: 0,
            neutral: 0,
            negative: 0,
            total: 0
          };
        });
        
        // Keep track of total posts analyzed
        let totalPostsAnalyzed = 0;
        
        // Process each analysis result
        analysisResults.forEach(result => {
          if (!result.themes || result.themes.length === 0) return;
          
          totalPostsAnalyzed++;
          
          // Get the sentiment of this result
          const sentiment = result.sentiment || 'neutral';
          
          // Find all mapped themes in this result
          const matchedThemes = new Set<string>();
          
          result.themes.forEach((theme: string) => {
            const mappedTheme = THEME_MAPPING[theme.toLowerCase()];
            if (mappedTheme) {
              matchedThemes.add(mappedTheme);
            }
          });
          
          // Increment counters for each matched theme
          matchedThemes.forEach(theme => {
            themeCounters[theme].total += 1;
            
            if (sentiment === 'positive') {
              themeCounters[theme].positive += 1;
            } else if (sentiment === 'negative') {
              themeCounters[theme].negative += 1;
            } else {
              themeCounters[theme].neutral += 1;
            }
          });
        });
        
        // Find the theme with the highest total count
        let topThemeName = MAIN_THEMES[0];
        let topThemeCount = 0;
        
        for (const theme of MAIN_THEMES) {
          if (themeCounters[theme].total > topThemeCount) {
            topThemeName = theme;
            topThemeCount = themeCounters[theme].total;
          }
        }
        
        // Calculate the dominant sentiment for the top theme
        const topThemeData = themeCounters[topThemeName];
        const sentiments = [
          { type: 'positive', count: topThemeData.positive },
          { type: 'neutral', count: topThemeData.neutral },
          { type: 'negative', count: topThemeData.negative }
        ];
        
        const dominantSentiment = sentiments.reduce((prev, current) => 
          (current.count > prev.count) ? current : prev
        );
        
        // Calculate percentage of posts that discussed this theme
        const percentage = Math.round((topThemeData.total / totalPostsAnalyzed) * 100);
        
        // Set the top theme
        setTopTheme({
          name: topThemeName,
          sentiment: dominantSentiment.type as 'positive' | 'neutral' | 'negative',
          percentage: percentage
        });
        
      } catch (err) {
        console.error('Error fetching top theme:', err);
        // Fallback data
        setTopTheme({
          name: 'Battery Life',
          sentiment: 'negative',
          percentage: 32
        });
      }
    };

    fetchSentimentStats();
    fetchAnnouncementRelatedStats();
    fetchRecentPosts();
    fetchTopTheme();
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 mt-2">
      <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
        <h3 className="text-sm text-gray-400 uppercase mb-1">Total Posts</h3>
        <div className="flex items-end">
          <div className="text-4xl font-bold">{sentimentStats?.total_count || 780}</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          <span className="text-sm text-green-500 mr-1">{postsLast24Hours}</span>
          in the past 24 hours
        </p>
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
        {loading ? (
          <div className="animate-pulse">
            <div className="h-6 bg-gray-700 rounded w-3/4 mb-1"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-gray-700 rounded w-2/3"></div>
          </div>
        ) : topTheme ? (
          <>
            <div className="text-xl font-bold mb-1">{topTheme.name}</div>
            <div className="flex items-center">
              <div className={`h-3 w-3 rounded-full mr-2 ${
                topTheme.sentiment === 'positive' ? 'bg-[#44d7b6]' :
                topTheme.sentiment === 'negative' ? 'bg-[#ff6384]' :
                'bg-gray-400'
              }`}></div>
              <span className={
                topTheme.sentiment === 'positive' ? 'text-[#44d7b6]' :
                topTheme.sentiment === 'negative' ? 'text-[#ff6384]' :
                'text-gray-400'
              }>
                {topTheme.sentiment.charAt(0).toUpperCase() + topTheme.sentiment.slice(1)} Sentiment
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">{topTheme.percentage}% of discussions</p>
          </>
        ) : (
          <div className="text-gray-400">No theme data available</div>
        )}
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