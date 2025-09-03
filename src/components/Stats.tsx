"use client";

import React, { useEffect, useRef, useState } from 'react';
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

interface StatsProps {
  fromDate?: string;
  toDate?: string;
}

export default function Stats({ fromDate, toDate }: StatsProps) {
  const [sentimentStats, setSentimentStats] = useState<SentimentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverStat, setHoverStat] = useState<'negative' | 'neutral' | 'positive' | null>(null);
  const [announcementRelatedPercent, setAnnouncementRelatedPercent] = useState<number | null>(null);
  const [peakActivityPostCount, setPeakActivityPostCount] = useState<number>(0);
  const [postsLast24Hours, setPostsLast24Hours] = useState<number>(0);
  const [filteredTotalPosts, setFilteredTotalPosts] = useState<number | null>(null);
  const wasFilteredRef = useRef(false);
  const originalSentimentStatsRef = useRef<SentimentStats | null>(null);
  const originalAnnouncementRelatedPercentRef = useRef<number | null>(null);
  const originalPeakActivityPostCountRef = useRef<number>(0);
  const originalTopThemeRef = useRef<{ name: string; sentiment: 'positive' | 'neutral' | 'negative'; percentage: number; } | null>(null);
  
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
    const fetchAllStats = async () => {
      setLoading(true);
      try {
        const supabase = createClient();

        // Step 1: Get relevant post IDs if a date range is provided
        let postIds: string[] | null = null;
        if (fromDate || toDate) {
          const allPostIds = [];
          let offset = 0;
          const BATCH_SIZE = 1000;
          let keepFetching = true;

          while (keepFetching) {
            let postsQuery = supabase.from('reddit_posts').select('id');
            if (fromDate) postsQuery = postsQuery.gte('created_at', fromDate);
            if (toDate) postsQuery = postsQuery.lte('created_at', toDate);
            
            const { data, error } = await postsQuery.range(offset, offset + BATCH_SIZE - 1);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
              allPostIds.push(...data.map(p => p.id));
              offset += data.length;
            } else {
              keepFetching = false;
            }

            if (data && data.length < BATCH_SIZE) {
              keepFetching = false;
            }
          }

          postIds = allPostIds;
          setFilteredTotalPosts(postIds.length);
          if (postIds.length === 0) {
            setSentimentStats({ avg_sentiment_score: 0, positive_count: 0, neutral_count: 0, negative_count: 0, total_count: 0, positive_percent: 0, neutral_percent: 0, negative_percent: 0 });
            setAnnouncementRelatedPercent(0);
            setPeakActivityPostCount(0);
            setTopTheme(null);
            return;
          }
        } else {
          setFilteredTotalPosts(null);
        }

        // Step 2: Fetch all analysis results (either globally or filtered by postIds)
        let analysisResults: any[] = [];
        const baseQuery = () => supabase
          .from('analysis_results')
          .select('content_id, sentiment, sentiment_score, is_announcement_related, themes')
          .eq('content_type', 'post');

        if (postIds) {
          const CHUNK_SIZE = 500;
          for (let i = 0; i < postIds.length; i += CHUNK_SIZE) {
            const { data, error } = await baseQuery().in('content_id', postIds.slice(i, i + CHUNK_SIZE));
            if (error) throw error;
            if (data) analysisResults.push(...data);
          }
        } else {
          const { count } = await supabase.from('analysis_results').select('*', { count: 'exact', head: true }).eq('content_type', 'post');
          const BATCH_SIZE = 1000;
          if (count) {
            for (let i = 0; i < count; i += BATCH_SIZE) {
              const { data, error } = await baseQuery().range(i, i + BATCH_SIZE - 1);
              if (error) throw error;
              if (data) analysisResults.push(...data);
            }
          }
        }

        // Step 3: Process results for all stats
        // Sentiment Distribution
        const byPostSentiment: Record<string, { sentiment: string; sentiment_score: number }> = {};
        for (const row of analysisResults) {
          if (!byPostSentiment[row.content_id]) byPostSentiment[row.content_id] = { sentiment: row.sentiment, sentiment_score: row.sentiment_score };
        }
        const sentimentData = Object.values(byPostSentiment);
        const total = sentimentData.length;
        
        // Update filteredTotalPosts with the count of *analyzed* posts
        if (fromDate || toDate) {
          setFilteredTotalPosts(total);
        } else {
          setFilteredTotalPosts(null); // Fallback to sentimentStats.total_count for default view
        }

        const positive = sentimentData.filter(item => item.sentiment === 'positive').length;
        const neutral = sentimentData.filter(item => item.sentiment === 'neutral').length;
        const negative = sentimentData.filter(item => item.sentiment === 'negative').length;
        const avgScore = total > 0 ? sentimentData.reduce((sum, item) => sum + (item.sentiment_score || 0), 0) / total : 0;
        setSentimentStats({
          avg_sentiment_score: avgScore, positive_count: positive, neutral_count: neutral, negative_count: negative, total_count: total,
          positive_percent: total > 0 ? parseFloat(((positive / total) * 100).toFixed(1)) : 0,
          neutral_percent: total > 0 ? parseFloat(((neutral / total) * 100).toFixed(1)) : 0,
          negative_percent: total > 0 ? parseFloat(((negative / total) * 100).toFixed(1)) : 0,
        });

        // Announcement Relevance
        const byPostAnn: Record<string, { is_announcement_related: boolean }> = {};
        for (const row of analysisResults) {
          if (!byPostAnn[row.content_id]) byPostAnn[row.content_id] = { is_announcement_related: row.is_announcement_related };
        }
        const annData = Object.values(byPostAnn);
        const totalPeak = annData.length;
        const announcementRelated = annData.filter(item => item.is_announcement_related).length;
        setAnnouncementRelatedPercent(totalPeak > 0 ? parseFloat(((announcementRelated / totalPeak) * 100).toFixed(1)) : 0);
        setPeakActivityPostCount(totalPeak);

        // Top Theme
        const themeResults = analysisResults.filter(r => r.themes && r.themes.length > 0);
        if (themeResults.length === 0) { setTopTheme(null); }
        else {
          const themeCounters: Record<string, { p: number; u: number; n: number; t: number; }> = {};
          MAIN_THEMES.forEach(theme => { themeCounters[theme] = { p: 0, u: 0, n: 0, t: 0 }; });
          type PostAgg = { themes: Set<string>; sC: { p: number; u: number; n: number; } };
          const perPost: Record<string, PostAgg> = {};
          themeResults.forEach((row: any) => {
            const pId = row.content_id;
            if (!perPost[pId]) perPost[pId] = { themes: new Set(), sC: { p: 0, u: 0, n: 0 } };
            const s = row.sentiment || 'neutral';
            if (s === 'positive') perPost[pId].sC.p++; else if (s === 'negative') perPost[pId].sC.n++; else perPost[pId].sC.u++;
            row.themes.forEach((t: string) => { if (THEME_MAPPING[t.toLowerCase()]) perPost[pId].themes.add(THEME_MAPPING[t.toLowerCase()]); });
          });
          let totalAnalyzed = 0;
          Object.values(perPost).forEach(post => {
            if (post.themes.size === 0) return;
            totalAnalyzed++;
            const d = post.sC.p >= post.sC.u && post.sC.p >= post.sC.n ? 'p' : post.sC.u >= post.sC.p && post.sC.u >= post.sC.n ? 'u' : 'n';
            post.themes.forEach(theme => {
              themeCounters[theme].t++;
              if (d === 'p') themeCounters[theme].p++; else if (d === 'n') themeCounters[theme].n++; else themeCounters[theme].u++;
            });
          });
          let topName = MAIN_THEMES[0], topCount = 0;
          for (const theme of MAIN_THEMES) { if (themeCounters[theme].t > topCount) { topName = theme; topCount = themeCounters[theme].t; } }
          const topData = themeCounters[topName];
          const dS = [{ t: 'positive', c: topData.p }, { t: 'neutral', c: topData.u }, { t: 'negative', c: topData.n }].reduce((p, c) => (c.c > p.c) ? c : p);
          setTopTheme({ name: topName, sentiment: dS.t as any, percentage: totalAnalyzed > 0 ? Math.round((topData.t / totalAnalyzed) * 100) : 0 });
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllStats();

    // Fetch 24h posts count independently as it's not subject to date filters
    const fetchRecent = async () => {
        try {
            const supabase = createClient();
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            const { data, error } = await supabase.from('reddit_posts').select('id').gte('created_at', oneDayAgo.toISOString());
            if (error) throw error;
            if (data) setPostsLast24Hours(data.length);
        } catch (err) { console.error('Error fetching recent posts:', err); }
    };
    if (postsLast24Hours === 0) fetchRecent();

  }, [fromDate, toDate]);

  const getTooltipText = (type: 'negative' | 'neutral' | 'positive') => {
    if (!sentimentStats) return '';
    switch(type) {
      case 'negative': return `${sentimentStats.negative_count} posts (${sentimentStats.negative_percent}%)`;
      case 'neutral': return `${sentimentStats.neutral_count} posts (${sentimentStats.neutral_percent}%)`;
      case 'positive': return `${sentimentStats.positive_count} posts (${sentimentStats.positive_percent}%)`;
    }
  };

  const getTotalPostsTitle = () => {
    if (!fromDate && !toDate) return 'Total Posts Since Unlocked';
    const formatDate = (iso: string) => new Date(iso.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (fromDate && toDate) return `Posts (${formatDate(fromDate)} - ${formatDate(toDate)})`;
    if (fromDate) return `Posts Since ${formatDate(fromDate)}`;
    if (toDate) return `Posts Until ${formatDate(toDate)}`;
    return 'Total Posts Since Unlocked';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 mt-2">
      <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
        <h3 className="text-sm text-gray-400 uppercase mb-1">{getTotalPostsTitle()}</h3>
        <div className="flex items-end">
          <div className="text-4xl font-bold">{
            loading ? '...' : (filteredTotalPosts ?? sentimentStats?.total_count ?? 0).toLocaleString()
          }</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          <span className="text-sm text-green-500 mr-1">{postsLast24Hours}</span>
          in the past 24 hours
        </p>
      </div>
      
      <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
        <h3 className="text-sm text-gray-400 uppercase mb-1">Sentiment Distribution</h3>
        {loading ? (
          <div className="h-[70px] flex items-center justify-center">Loading...</div>
        ) : (
          <>
            <div className="flex justify-between mb-3">
              <div className="text-center">
                <div className="text-lg font-bold text-[#ff6384]">{sentimentStats?.negative_percent}%</div>
                <div className="text-xs text-gray-400">Negative</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-gray-400">{sentimentStats?.neutral_percent}%</div>
                <div className="text-xs text-gray-400">Neutral</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#44d7b6]">{sentimentStats?.positive_percent}%</div>
                <div className="text-xs text-gray-400">Positive</div>
              </div>
            </div>
            
            <div className="relative w-full mb-4">
              <div className="w-full h-2.5 bg-[#1a1c20] rounded-full"></div>
              <div className="absolute top-0 left-0 flex w-full h-2.5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#ff6384] cursor-pointer relative"
                  style={{ width: `${sentimentStats?.negative_percent || 0}%` }}
                  onMouseEnter={() => setHoverStat('negative')}
                  onMouseLeave={() => setHoverStat(null)}
                ></div>
                <div 
                  className="h-full bg-gray-400 cursor-pointer relative"
                  style={{ width: `${sentimentStats?.neutral_percent || 0}%` }}
                  onMouseEnter={() => setHoverStat('neutral')}
                  onMouseLeave={() => setHoverStat(null)}
                ></div>
                <div 
                  className="h-full bg-[#44d7b6] cursor-pointer relative"
                  style={{ width: `${sentimentStats?.positive_percent || 0}%` }}
                  onMouseEnter={() => setHoverStat('positive')}
                  onMouseLeave={() => setHoverStat(null)}
                ></div>
              </div>
              {hoverStat && (
                <div 
                  className="absolute -top-8 bg-black text-white text-xs py-1 px-2 rounded whitespace-nowrap pointer-events-none"
                  style={{ 
                    left: hoverStat === 'negative' ? `${(sentimentStats?.negative_percent || 0) / 2}%` 
                      : hoverStat === 'neutral' ? `${(sentimentStats?.negative_percent || 0) + ((sentimentStats?.neutral_percent || 0) / 2)}%` 
                      : `${(sentimentStats?.negative_percent || 0) + (sentimentStats?.neutral_percent || 0) + ((sentimentStats?.positive_percent || 0) / 2)}%`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  {getTooltipText(hoverStat)}
                </div>
              )}
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
              <div className={`h-3 w-3 rounded-full mr-2 ${topTheme.sentiment === 'positive' ? 'bg-[#44d7b6]' : topTheme.sentiment === 'negative' ? 'bg-[#ff6384]' : 'bg-gray-400'}`}></div>
              <span className={topTheme.sentiment === 'positive' ? 'text-[#44d7b6]' : topTheme.sentiment === 'negative' ? 'text-[#ff6384]' : 'text-gray-400'}>
                {topTheme.sentiment.charAt(0).toUpperCase() + topTheme.sentiment.slice(1)} Sentiment
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">{topTheme.percentage}% of discussions</p>
          </>
        ) : <div className="text-gray-400">No theme data available</div>}
      </div>
      
      <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
        <h3 className="text-sm text-gray-400 uppercase mb-1">Announcement Relevance</h3>
        <div className="flex items-end">
          <div className="text-4xl font-bold">{loading ? '...' : `${announcementRelatedPercent}%`}</div>
        </div>
        <p className="text-xs text-gray-400 mt-2">discussed the May 8th product launch</p>
      </div>
    </div>
  );
} 