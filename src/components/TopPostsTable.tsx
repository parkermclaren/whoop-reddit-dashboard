"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { format } from 'date-fns';

// Types for our data
type Post = {
  id: string;
  title: string;
  author: string;
  upvotes: number;
  comments: number;
  sentiment: string;
  date: string;
  url: string;
  summary: string;
}

type TooltipPosition = {
  direction: 'top' | 'bottom';
  x: number;
  y: number;
};

export type SortOption = 'upvotes' | 'comments';
export type SentimentFilter = 'all' | 'positive' | 'negative';

export default function TopPostsTable({ 
  sortBy = 'upvotes',
  initialSentiment = 'all'
}: { 
  sortBy?: SortOption,
  initialSentiment?: SentimentFilter 
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPost, setHoveredPost] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ direction: 'bottom', x: 0, y: 0 });
  const [activeSortBy, setActiveSortBy] = useState<SortOption>(sortBy);
  const [activeSentiment, setActiveSentiment] = useState<SentimentFilter>(initialSentiment);

  // Function to calculate and set tooltip position
  const calculateTooltipPosition = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // How much space we need below for the tooltip
    const requiredSpace = 350;
    
    // Check if there's enough space below
    const spaceBelow = viewportHeight - rect.bottom;
    const direction = spaceBelow < requiredSpace ? 'top' : 'bottom';
    
    // Calculate coordinates based on direction
    let x = rect.left;
    // Make sure tooltip doesn't go off-screen horizontally
    if (x + 320 > viewportWidth) {
      x = Math.max(10, viewportWidth - 330);
    }
    
    let y;
    if (direction === 'top') {
      // Place above the element
      y = rect.top - 10;
    } else {
      // Place below the element
      y = rect.bottom + 10;
    }
    
    setTooltipPos({ direction, x, y });
  };

  useEffect(() => {
    const fetchTopPosts = async () => {
      try {
        setLoading(true);
        
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          throw new Error("Supabase environment variables are missing");
        }
        
        // Use the client utility the same way ThemeBreakdown does
        const supabase = createClient();

        // First get the top posts by engagement
        let query = supabase
          .from('reddit_posts')
          .select('*')
          .order(activeSortBy === 'upvotes' ? 'ups' : 'num_comments', { ascending: false });
          
        // Get post IDs to fetch corresponding analysis results
        const { data: postsData, error: postsError } = await query.limit(100); // Fetch more so we can filter
          
        if (postsError) {
          throw new Error(postsError.message);
        }
        
        if (!postsData || postsData.length === 0) {
          setPosts([]);
          setLoading(false);
          return;
        }

        // Get post IDs to fetch corresponding analysis results
        const postIds = postsData.map(post => post.id);
        
        // Fetch analysis results for these posts
        const { data: analysisData, error: analysisError } = await supabase
          .from('analysis_results')
          .select('*')
          .in('content_id', postIds)
          .eq('content_type', 'post');
          
        if (analysisError) {
          console.error('Error fetching analysis results:', analysisError);
          // Continue with posts even if we can't get analysis
        }
        
        // Create a map of post ID to analysis for easy lookup
        const analysisMap = new Map();
        if (analysisData) {
          analysisData.forEach(analysis => {
            analysisMap.set(analysis.content_id, analysis);
          });
        }

        // Transform the data to match our Post type
        const transformedPosts: Post[] = postsData.map(post => {
          // Look up analysis for this post
          const analysis = analysisMap.get(post.id);
          
          return {
            id: post.id,
            title: post.title || '',
            author: post.author || '',
            upvotes: post.ups || 0,
            comments: post.num_comments || 0,
            sentiment: analysis ? analysis.sentiment : 'neutral',
            date: post.created_at ? format(new Date(post.created_at), 'MMM d, yyyy') : 'Unknown date',
            url: post.url || `https://reddit.com${post.permalink || ''}`,
            summary: analysis && analysis.summary ? analysis.summary : 'No summary available',
          };
        });

        // Filter by sentiment if not "all"
        let filteredPosts = transformedPosts;
        if (activeSentiment !== 'all') {
          filteredPosts = transformedPosts.filter(post => post.sentiment === activeSentiment);
        }

        // Take the top 25 after filtering instead of just 10
        setPosts(filteredPosts.slice(0, 25));
      } catch (err) {
        console.error('Error fetching top posts:', err);
        setError(err instanceof Error ? err.message : JSON.stringify(err));
      } finally {
        setLoading(false);
      }
    };

    fetchTopPosts();
  }, [activeSortBy, activeSentiment]);

  const handleMouseEnter = (postId: string, e: React.MouseEvent<HTMLDivElement>) => {
    calculateTooltipPosition(e.currentTarget);
    setHoveredPost(postId);
  };

  const handleMouseLeave = () => {
    setHoveredPost(null);
  };

  if (loading) {
    return <div className="py-6 text-center">Loading posts...</div>;
  }

  if (error) {
    return (
      <div className="py-6 text-center">
        <p className="text-red-400 mb-4">{error}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="mb-4">No posts found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-400">Posts with the highest community engagement</div>
        <div className="flex space-x-2">
          {/* Sentiment Filter Toggle Buttons */}
          <div className="bg-[#1E1F24] rounded-lg p-0.5 flex">
            <button 
              className={`px-3 py-1.5 text-sm rounded-md ${activeSentiment === 'all' ? 'bg-[#3D3F46] text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveSentiment('all')}
            >
              All
            </button>
            <button 
              className={`px-3 py-1.5 text-sm rounded-md ${activeSentiment === 'positive' ? 'bg-[#3D3F46] text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveSentiment('positive')}
            >
              Positive
            </button>
            <button 
              className={`px-3 py-1.5 text-sm rounded-md ${activeSentiment === 'negative' ? 'bg-[#3D3F46] text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveSentiment('negative')}
            >
              Negative
            </button>
          </div>
          
          {/* Sort Toggle Buttons */}
          <div className="bg-[#1E1F24] rounded-lg p-0.5 flex">
            <button 
              className={`px-3 py-1.5 text-sm rounded-md ${activeSortBy === 'upvotes' ? 'bg-[#3D3F46] text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveSortBy('upvotes')}
            >
              Highest Upvoted
            </button>
            <button 
              className={`px-3 py-1.5 text-sm rounded-md ${activeSortBy === 'comments' ? 'bg-[#3D3F46] text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveSortBy('comments')}
            >
              Most Discussed
            </button>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto relative max-h-[600px] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-[#24262b] sticky top-0">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Title</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Author</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Upvotes</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Comments</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Sentiment</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {posts.map((post) => (
              <tr key={post.id} className="hover:bg-[#2c2e33] transition-colors">
                <td className="px-3 py-4">
                  <div 
                    className="text-sm font-medium text-white"
                    onMouseEnter={(e) => handleMouseEnter(post.id, e)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <a 
                      href={post.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-blue-400 transition-colors"
                    >
                      {post.title}
                    </a>
                  </div>
                </td>
                <td className="px-3 py-4 text-sm text-gray-300">{post.author}</td>
                <td className="px-3 py-4 text-sm text-gray-300">{post.upvotes}</td>
                <td className="px-3 py-4 text-sm text-gray-300">{post.comments}</td>
                <td className="px-3 py-4">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                    post.sentiment === 'positive' 
                      ? 'bg-[#44d7b6]/20 text-[#44d7b6]' 
                      : post.sentiment === 'negative'
                      ? 'bg-[#ff6384]/20 text-[#ff6384]'
                      : 'bg-gray-500/20 text-gray-300'
                  }`}>
                    {post.sentiment.charAt(0).toUpperCase() + post.sentiment.slice(1)}
                  </span>
                </td>
                <td className="px-3 py-4 text-sm text-gray-300">{post.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Fixed-position tooltip that follows the cursor */}
        {hoveredPost && (
          <div 
            className={`fixed z-50 w-80 p-4 bg-[#2A2D3A] border-2 rounded-md shadow-xl text-sm text-white pointer-events-none ${
              posts.find(p => p.id === hoveredPost)?.sentiment === 'positive' 
                ? 'border-[#44d7b6]' 
                : posts.find(p => p.id === hoveredPost)?.sentiment === 'negative'
                ? 'border-[#ff6384]'
                : 'border-gray-500'
            }`}
            style={{ 
              left: `${tooltipPos.x}px`, 
              top: tooltipPos.direction === 'bottom' ? `${tooltipPos.y}px` : 'auto',
              bottom: tooltipPos.direction === 'top' ? `${window.innerHeight - tooltipPos.y}px` : 'auto',
              maxHeight: '250px',
              overflowY: 'auto'
            }}
          >
            <div className="font-semibold mb-2 text-blue-300 border-b border-gray-700 pb-1">AI Summary</div>
            <div className="leading-relaxed">
              {posts.find(p => p.id === hoveredPost)?.summary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 