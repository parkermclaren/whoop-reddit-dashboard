"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as d3 from 'd3';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Type for post data
interface PostData {
  id: string;
  title: string;
  url: string;
  satisfaction: 'positive' | 'neutral' | 'negative';
  engagement: number; // upvotes + comments
}

// Type for user satisfaction data
interface SatisfactionData {
  productName: string;
  totalReceived: number;
  satisfied: number;
  neutral: number;
  dissatisfied: number;
  posts: PostData[];
}

interface ProductSatisfactionInsightsProps {
    fromDate?: string;
    toDate?: string;
}

export default function ProductSatisfactionInsights({ fromDate, toDate }: ProductSatisfactionInsightsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [satisfactionData, setSatisfactionData] = useState<Record<string, SatisfactionData>>({});
  const [activeTab, setActiveTab] = useState<'satisfaction' | 'posts'>('satisfaction');
  const [activePosts, setActivePosts] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all');

  useEffect(() => {
    async function fetchProductSatisfactionData() {
      try {
        setIsLoading(true);
        
        // Step 1: Get post_ids from date range if specified
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
            
            if (error) throw new Error(`Error fetching post IDs: ${error.message}`);
            
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

          if (postIds.length === 0) {
            setSatisfactionData({});
            setIsLoading(false);
            return;
          }
        }
        
        // Step 2: Fetch users who have received products, batched by postIds
        let receivedData: any[] = [];
        const baseSelect = () => supabase
          .from('analysis_results')
          .select('*')
          .eq('has_received_product', true);

        if (postIds) {
          const batchSize = 500;
          for (let i = 0; i < postIds.length; i += batchSize) {
            const batchIds = postIds.slice(i, i + batchSize);
            const { data, error } = await baseSelect().in('content_id', batchIds);
            if (error) throw new Error(error.message);
            if (data) receivedData.push(...data);
          }
        } else {
          const { data, error } = await baseSelect();
          if (error) throw new Error(error.message);
          receivedData = data || [];
        }
        
        if (!receivedData) throw new Error('No data received');
        
        const contentIds = receivedData
          .filter(item => item.content_id)
          .map(item => item.content_id);
        
        let redditPosts: Record<string, any> = {};
        
        if (contentIds.length > 0) {
          const postsMap: Record<string, any> = {};
          const batchSize = 200;
          for (let i = 0; i < contentIds.length; i += batchSize) {
            const batchIds = contentIds.slice(i, i + batchSize);
            const { data: postsData, error: postsError } = await supabase
              .from('reddit_posts')
              .select('*')
              .in('id', batchIds);
            if (postsError) {
              console.error('Error fetching reddit posts:', postsError);
            } else if (postsData) {
              postsData.forEach(post => { postsMap[post.id] = post; });
            }
          }
          redditPosts = postsMap;
        }
        
        const productSatisfactionMap: Record<string, {
          totalReceived: number;
          satisfied: number;
          neutral: number;
          dissatisfied: number;
          posts: PostData[];
        }> = {};
        
        receivedData.forEach(item => {
          const productName = item.product_received;
          if (!productName || productName.toLowerCase() === 'unknown product') return;
          if (productName !== 'WHOOP 5.0' && productName !== 'WHOOP MG') return;
          
          if (!productSatisfactionMap[productName]) {
            productSatisfactionMap[productName] = {
              totalReceived: 0,
              satisfied: 0,
              neutral: 0,
              dissatisfied: 0,
              posts: []
            };
          }
          
          productSatisfactionMap[productName].totalReceived += 1;
          const satisfaction = item.product_satisfaction || 'neutral';
          if (satisfaction === 'positive') productSatisfactionMap[productName].satisfied += 1;
          else if (satisfaction === 'negative') productSatisfactionMap[productName].dissatisfied += 1;
          else productSatisfactionMap[productName].neutral += 1;
          
          if (item.content_id && redditPosts[item.content_id]) {
            const post = redditPosts[item.content_id];
            productSatisfactionMap[productName].posts.push({
              id: item.id || `post-${Date.now()}-${Math.random()}`,
              title: post.title || 'Untitled Post',
              url: post.url || '#',
              satisfaction: satisfaction as 'positive' | 'neutral' | 'negative',
              engagement: (post.upvotes || 0) + (post.comments || 0)
            });
          } else if (item.title && item.url) {
            productSatisfactionMap[productName].posts.push({
              id: item.id || `post-${Date.now()}-${Math.random()}`,
              title: item.title,
              url: item.url,
              satisfaction: satisfaction as 'positive' | 'neutral' | 'negative',
              engagement: (item.upvotes || 0) + (item.comments || 0)
            });
          }
        });
        
        const satisfactionDataRecord: Record<string, SatisfactionData> = {};
        for (const [productName, data] of Object.entries(productSatisfactionMap)) {
          const uniquePosts: PostData[] = [];
          const seen = new Set();
          data.posts.forEach(post => {
            if (!seen.has(post.id)) { seen.add(post.id); uniquePosts.push(post); }
          });
          const sortedPosts = uniquePosts.sort((a, b) => b.engagement - a.engagement);
          satisfactionDataRecord[productName] = { ...data, productName, posts: sortedPosts };
        }
        
        const products = ['WHOOP 5.0', 'WHOOP MG'];
        products.forEach(productName => {
          if (!satisfactionDataRecord[productName]) {
            satisfactionDataRecord[productName] = {
              productName,
              totalReceived: 0,
              satisfied: 0,
              neutral: 0,
              dissatisfied: 0,
              posts: []
            };
          }
        });
        
        setSatisfactionData(satisfactionDataRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching product satisfaction data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchProductSatisfactionData();
  }, [fromDate, toDate]);

  // Helper function to get color based on sentiment
  const getSentimentColor = (sentiment: string): string => {
    switch(sentiment) {
      case 'positive': return '#44d7b6'; // Green
      case 'neutral': return '#b4b4b4';   // Gray
      case 'negative': return '#e25e5e'; // Red
      default: return '#b4b4b4';
    }
  };

  // Render satisfaction metrics
  const renderSatisfactionMetrics = (data: SatisfactionData) => {
    return (
      <div className="space-y-3 w-full">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-white">{data.totalReceived}</span>
            <span className="text-gray-400">Confirmed Recipients</span>
          </div>
        </div>
        
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-[#44d7b6]">Satisfied</span>
            <span className="font-medium">{data.satisfied} ({data.totalReceived > 0 ? Math.round((data.satisfied / data.totalReceived) * 100) : 0}%)</span>
          </div>
          <div className="bg-gray-700 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-[#44d7b6] h-full" 
              style={{ width: `${data.totalReceived > 0 ? (data.satisfied / data.totalReceived) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
        
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Neutral</span>
            <span className="font-medium">{data.neutral} ({data.totalReceived > 0 ? Math.round((data.neutral / data.totalReceived) * 100) : 0}%)</span>
          </div>
          <div className="bg-gray-700 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-gray-400 h-full" 
              style={{ width: `${data.totalReceived > 0 ? (data.neutral / data.totalReceived) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
        
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-[#e25e5e]">Dissatisfied</span>
            <span className="font-medium">{data.dissatisfied} ({data.totalReceived > 0 ? Math.round((data.dissatisfied / data.totalReceived) * 100) : 0}%)</span>
          </div>
          <div className="bg-gray-700 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-[#e25e5e] h-full" 
              style={{ width: `${data.totalReceived > 0 ? (data.dissatisfied / data.totalReceived) * 100 : 0}%` }}
            ></div>
          </div>
        </div>
      </div>
    );
  };

  // Render posts list
  const renderPosts = (data: SatisfactionData) => {
    const filteredPosts = activePosts === 'all' 
      ? data.posts 
      : data.posts.filter(post => post.satisfaction === activePosts);
    
    return (
      <div className="w-full">
        <div className="flex space-x-2 mb-4 overflow-x-auto">
          <button 
            className={`px-3 py-1 rounded-full text-xs ${activePosts === 'all' ? 'bg-[#34363f] text-white' : 'bg-[#2a2c33] text-gray-400'}`}
            onClick={() => setActivePosts('all')}
          >
            All ({data.posts.length})
          </button>
          <button 
            className={`px-3 py-1 rounded-full text-xs ${activePosts === 'positive' ? 'bg-[#44d7b6] text-gray-900' : 'bg-[#2a2c33] text-gray-400'}`}
            onClick={() => setActivePosts('positive')}
          >
            Satisfied ({data.posts.filter(p => p.satisfaction === 'positive').length})
          </button>
          <button 
            className={`px-3 py-1 rounded-full text-xs ${activePosts === 'neutral' ? 'bg-[#b4b4b4] text-gray-900' : 'bg-[#2a2c33] text-gray-400'}`}
            onClick={() => setActivePosts('neutral')}
          >
            Neutral ({data.posts.filter(p => p.satisfaction === 'neutral').length})
          </button>
          <button 
            className={`px-3 py-1 rounded-full text-xs ${activePosts === 'negative' ? 'bg-[#e25e5e] text-gray-900' : 'bg-[#2a2c33] text-gray-400'}`}
            onClick={() => setActivePosts('negative')}
          >
            Dissatisfied ({data.posts.filter(p => p.satisfaction === 'negative').length})
          </button>
        </div>
        
        {filteredPosts.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {filteredPosts.map(post => (
              <a 
                key={post.id}
                href={post.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-3 bg-[#34363f] hover:bg-[#3a3c45] rounded transition-colors"
              >
                <div className="flex items-start">
                  <div className={`w-2 h-2 rounded-full mt-1.5 mr-2 flex-shrink-0`} style={{ backgroundColor: getSentimentColor(post.satisfaction) }}></div>
                  <div className="text-sm flex-1">{post.title}</div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">
            No {activePosts !== 'all' ? activePosts : ''} posts available for this product
          </div>
        )}
      </div>
    );
  };

  // Render a single product card
  const renderProductCard = (data: SatisfactionData) => {
    if (!data) return null;
    
    return (
      <div className="bg-[#2d2f36] rounded-xl p-6 shadow h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-3xl font-bold">{data.productName}</h3>
          
          <div className="flex">
            <button 
              className={`px-3 py-1 text-sm ${activeTab === 'satisfaction' ? 'bg-[#34363f] text-white rounded-full' : 'text-gray-400'}`}
              onClick={() => setActiveTab('satisfaction')}
            >
              Satisfaction
            </button>
            <button 
              className={`px-3 py-1 text-sm ${activeTab === 'posts' ? 'bg-[#34363f] text-white rounded-full' : 'text-gray-400'}`}
              onClick={() => setActiveTab('posts')}
            >
              Posts ({data.posts.length})
            </button>
          </div>
        </div>
        
        {activeTab === 'satisfaction' ? renderSatisfactionMetrics(data) : renderPosts(data)}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64 text-red-500">
        <p>Error loading data: {error}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderProductCard(satisfactionData['WHOOP 5.0'])}
        {renderProductCard(satisfactionData['WHOOP MG'])}
      </div>
    </div>
  );
} 