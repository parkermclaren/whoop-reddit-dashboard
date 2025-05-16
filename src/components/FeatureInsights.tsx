"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { 
  Battery, 
  Heart, 
  Activity, 
  Watch, 
  Smartphone, 
  Brain, 
  Zap,
  ChevronDown,
  ChevronUp,
  Users,
  Gauge,
  MessageSquare,
  BarChart,
  HeartPulse,
  Flower,
  Footprints,
  Clock,
  Moon,
  Waves,
  Radar,
  Dumbbell,
  MessageCircle,
  Flame
} from 'lucide-react';

interface Quote {
  text: string;
  postUpvotes: number;
  contentId: string;
  commentCount?: number;
  isTopUpvoted?: boolean;
  isTopCommented?: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
  postUrl?: string;
}

interface FeatureData {
  name: string;
  icon: React.ReactNode;
  quotes: Quote[];
  mentionCount: number;
  isLoading?: boolean;
}

interface AspectInDb {
  feature: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  quote?: string;
}

// Pre-defined set of all WHOOP features with their icons
const PREDEFINED_FEATURES: FeatureData[] = [
  {
    name: 'Blood Pressure',
    icon: <Heart className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'Improved Sensor accuracy',
    icon: <Gauge className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'Battery Pack 5.0',
    icon: <Battery className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'ECG',
    icon: <Activity className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'Healthspan/WHOOP Age',
    icon: <Clock className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'Improved Step Counter',
    icon: <Footprints className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'improved Sleep Performance',
    icon: <Moon className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'Women\'s Hormonal Insights',
    icon: <Flower className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'Stress Monitor',
    icon: <Brain className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'HRV calibration',
    icon: <Waves className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'improved Auto-Detected Activities',
    icon: <Dumbbell className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'Irregular Heart Rhythm',
    icon: <HeartPulse className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  },
  {
    name: 'AI Assistant',
    icon: <Zap className="w-6 h-6 text-white" />,
    quotes: [],
    mentionCount: 0,
    isLoading: true
  }
];

// Display shorter feature names for the grid
const shortenFeatureName = (name: string) => {
  const nameMap: {[key: string]: string} = {
    'Blood Pressure': 'Blood Pressure',
    'Improved Sensor accuracy': 'Sensor Accuracy',
    'Battery Pack 5.0': 'Battery Pack 5.0',
    'ECG': 'ECG',
    'Healthspan/WHOOP Age': 'WHOOP Age',
    'Improved Step Counter': 'Step Counter',
    'improved Sleep Performance': 'Sleep',
    'Women\'s Hormonal Insights': 'Hormonal Insights',
    'Stress Monitor': 'Stress Monitor',
    'HRV calibration': 'HRV Calibration',
    'improved Auto-Detected Activities': 'Auto Activities',
    'Irregular Heart Rhythm': 'Heart Rhythm',
    'AI Assistant': 'AI Assistant'
  };
  
  return nameMap[name] || name;
};

export default function FeatureInsights() {
  const [features, setFeatures] = useState<FeatureData[]>(PREDEFINED_FEATURES);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string>('Blood Pressure');
  const [activeSentiment, setActiveSentiment] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all');

  useEffect(() => {
    const fetchFeatureData = async () => {
      try {
        setError(null);
        const supabase = createClient();

        console.log("Fetching analysis results...");
        
        // Using a simple approach - just fetch all analysis results that are posts
        const { data: analysisResults, error: analysisError } = await supabase
          .from('analysis_results')
          .select('content_id, aspects, id')
          .eq('content_type', 'post');
        
        if (analysisError) {
          console.error("Analysis results error:", analysisError);
          throw analysisError;
        }
        
        if (!analysisResults || analysisResults.length === 0) {
          console.log("No analysis results found");
          setFeatures(features.map(f => ({ ...f, isLoading: false })));
          setDataLoading(false);
          return;
        }
        
        console.log(`Found ${analysisResults.length} analysis results`);
        
        // Filter in JavaScript to find results with non-null aspects
        const validResults = analysisResults
          .filter(result => result.aspects && Array.isArray(result.aspects) && result.aspects.length > 0);
          
        console.log(`Found ${validResults.length} results with valid aspects`);
        
        if (validResults.length === 0) {
          setFeatures(features.map(f => ({ ...f, isLoading: false })));
          setDataLoading(false);
          return;
        }
        
        // Count feature mentions and collect quotes
        const featureMap = new Map<string, { quotes: Quote[], mentionCount: number }>();
        
        // Initialize with predefined features
        features.forEach(feature => {
          featureMap.set(feature.name, { quotes: [], mentionCount: 0 });
        });
        
        // Process results to extract feature data
        validResults.forEach(result => {
          const aspects = result.aspects;
          aspects.forEach((aspect: AspectInDb) => {
            if (!aspect.feature || !aspect.quote) return;
            
            // For existing features and potentially new ones
            if (!featureMap.has(aspect.feature)) {
              featureMap.set(aspect.feature, { quotes: [], mentionCount: 0 });
            }
            
            const featureData = featureMap.get(aspect.feature)!;
            featureData.mentionCount++;
            featureData.quotes.push({
              text: aspect.quote,
              postUpvotes: 1, // Default, will be updated if possible
              contentId: result.content_id,
              commentCount: 0, // Default, will be updated if possible
              sentiment: aspect.sentiment
            });
          });
        });
        
        // Now try to get upvotes and comment information
        const uniqueContentIds = Array.from(
          new Set(validResults.map(result => result.content_id))
        );
        
        console.log(`Found ${uniqueContentIds.length} unique content IDs`);
        
        // Map to store content_id -> data
        const postsData = new Map<string, { ups: number, num_comments: number, url?: string }>();
        
        if (uniqueContentIds.length > 0) {
          try {
            // Fetch in small batches
            const batchSize = 5;
            
            for (let i = 0; i < uniqueContentIds.length; i += batchSize) {
              const batchIds = uniqueContentIds.slice(i, i + batchSize);
              
              const { data: postsBatch, error: batchError } = await supabase
                .from('reddit_posts')
                .select('id, ups, num_comments, url')
                .in('id', batchIds);
                
              if (batchError) {
                console.error(`Batch ${i/batchSize} error:`, batchError);
                continue;
              }
              
              if (postsBatch) {
                postsBatch.forEach(post => {
                  postsData.set(post.id, { 
                    ups: post.ups || 0,
                    num_comments: post.num_comments || 0,
                    url: post.url || undefined
                  });
                });
              }
            }
          } catch (upvotesError) {
            console.warn("Error fetching post data, using default values:", upvotesError);
          }
        }
        
        // Update our predefined features with the data we've gathered
        const updatedFeatures = features.map(feature => {
          const featureData = featureMap.get(feature.name);
          
          if (!featureData) {
            // Feature not found in results
            return { ...feature, isLoading: false };
          }
          
          // Add upvote/comment data to quotes
          const quotesWithData = featureData.quotes.map(quote => ({
            ...quote,
            postUpvotes: postsData.get(quote.contentId)?.ups || quote.postUpvotes,
            commentCount: postsData.get(quote.contentId)?.num_comments || 0,
            postUrl: postsData.get(quote.contentId)?.url,
            isTopUpvoted: false,
            isTopCommented: false
          }));
          
          // Sort all quotes by upvotes for display
          const allSortedQuotes = [...quotesWithData].sort((a, b) => b.postUpvotes - a.postUpvotes);
          
          // Mark top upvoted
          if (allSortedQuotes.length > 0) {
            allSortedQuotes.slice(0, 3).forEach(quote => {
              quote.isTopUpvoted = true;
            });
          }
          
          // Mark top commented
          const commentSortedQuotes = [...quotesWithData].sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0));
          if (commentSortedQuotes.length > 0) {
            commentSortedQuotes.slice(0, 2).forEach(quote => {
              quote.isTopCommented = true;
            });
          }
          
          return {
            ...feature,
            quotes: allSortedQuotes, // Keep all quotes instead of limiting to 5
            mentionCount: featureData.mentionCount,
            isLoading: false
          };
        });
        
        // Sort by mention count from highest to lowest
        updatedFeatures.sort((a, b) => b.mentionCount - a.mentionCount);
        
        setFeatures(updatedFeatures);
      } catch (err: any) {
        console.error('Full error object:', err);
        setError(err.message || 'An unexpected error occurred while fetching feature data.');
        // Still update loading state on features
        setFeatures(features.map(f => ({ ...f, isLoading: false })));
      } finally {
        setDataLoading(false);
      }
    };

    fetchFeatureData();
  }, []);

  if (error) {
    return (
      <div className="text-red-500 text-center p-4 bg-[#2c2e33] rounded-lg">
        <p className="font-semibold">Error loading feature insights:</p>
        <p className="text-sm">{error}</p>
        <p className="text-xs mt-2">Please check the browser console for more details.</p>
      </div>
    );
  }

  const selectedFeatureData = features.find(f => f.name === selectedFeature) || features[0];
  
  // Filter quotes by sentiment
  const filteredQuotes = selectedFeatureData.quotes.filter(quote => 
    activeSentiment === 'all' || quote.sentiment === activeSentiment
  );

  return (
    <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-6">
      {/* Left side - Feature Grid */}
      <div className="md:w-1/2">
        <div className="grid grid-cols-3 gap-3">
          {features.map((feature) => (
            <div 
              key={feature.name}
              className={`bg-[#2c2e33] rounded-lg p-2 pt-3 transition-all duration-200 cursor-pointer ${
                selectedFeature === feature.name ? 'ring-2 ring-blue-500 bg-[#33363c]' : 'hover:bg-[#33363c]'
              }`}
              onClick={() => setSelectedFeature(feature.name)}
            >
              <div className="flex flex-col items-center text-center justify-center h-full">
                <div className="p-1.5 rounded-lg bg-[#3a3d45] mb-2"> 
                  {feature.icon}
                </div>
                <div className="w-full">
                  <h3 className="font-medium text-xs text-white leading-tight mb-1" title={feature.name}>
                    {shortenFeatureName(feature.name)}
                  </h3>
                  {feature.isLoading ? (
                    <div className="h-3 w-8 bg-gray-700 animate-pulse rounded mx-auto"></div>
                  ) : (
                    <p className="text-xs text-gray-400">{feature.mentionCount}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right side - Detail View */}
      <div className="md:w-1/2 bg-[#2c2e33] rounded-lg p-4">
        <div className="flex items-center space-x-3 mb-4 border-b border-gray-700 pb-3">
          <div className="p-2 rounded-lg bg-[#3a3d45]"> 
            {selectedFeatureData.icon}
          </div>
          <div>
            <h2 className="font-medium text-lg text-white">{selectedFeatureData.name}</h2>
            {selectedFeatureData.isLoading ? (
              <div className="h-4 w-24 bg-gray-700 animate-pulse rounded"></div>
            ) : (
              <p className="text-sm text-gray-400">{selectedFeatureData.mentionCount} mentions</p>
            )}
          </div>
        </div>

        {/* Sentiment filter buttons */}
        <div className="flex space-x-2 mb-4 overflow-x-auto">
          <button 
            className={`px-3 py-1 rounded-full text-xs ${activeSentiment === 'all' ? 'bg-[#34363f] text-white' : 'bg-[#2a2c33] text-gray-400'}`}
            onClick={() => setActiveSentiment('all')}
          >
            All ({selectedFeatureData.quotes.length})
          </button>
          <button 
            className={`px-3 py-1 rounded-full text-xs ${activeSentiment === 'positive' ? 'bg-[#44d7b6] text-gray-900' : 'bg-[#2a2c33] text-gray-400'}`}
            onClick={() => setActiveSentiment('positive')}
          >
            Positive ({selectedFeatureData.quotes.filter(q => q.sentiment === 'positive').length})
          </button>
          <button 
            className={`px-3 py-1 rounded-full text-xs ${activeSentiment === 'neutral' ? 'bg-[#b4b4b4] text-gray-900' : 'bg-[#2a2c33] text-gray-400'}`}
            onClick={() => setActiveSentiment('neutral')}
          >
            Neutral ({selectedFeatureData.quotes.filter(q => q.sentiment === 'neutral').length})
          </button>
          <button 
            className={`px-3 py-1 rounded-full text-xs ${activeSentiment === 'negative' ? 'bg-[#e25e5e] text-gray-900' : 'bg-[#2a2c33] text-gray-400'}`}
            onClick={() => setActiveSentiment('negative')}
          >
            Negative ({selectedFeatureData.quotes.filter(q => q.sentiment === 'negative').length})
          </button>
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
          {selectedFeatureData.isLoading ? (
            // Loading state for quotes
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="bg-[#24262b] rounded p-3">
                <div className="h-4 bg-gray-700 animate-pulse rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-700 animate-pulse rounded w-3/4"></div>
                <div className="mt-2 flex justify-between items-center">
                  <div className="h-3 bg-gray-700 animate-pulse rounded w-20"></div>
                </div>
              </div>
            ))
          ) : filteredQuotes.length > 0 ? (
            filteredQuotes.map((quote, index) => (
              <a 
                key={index} 
                href={quote.postUrl || '#'} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block bg-[#24262b] rounded p-3 hover:bg-[#2c2e33] transition-colors"
              >
                <div className="flex items-start">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 mr-2 ${
                    quote.sentiment === 'positive' ? 'bg-[#44d7b6] bg-opacity-70' : 
                    quote.sentiment === 'negative' ? 'bg-[#f56c6c] bg-opacity-70' : 
                    'bg-[#b4b4b4] bg-opacity-70'
                  }`} />
                  <p className="text-sm text-gray-300 italic">{quote.text}</p>
                </div>
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-xs text-gray-400">
                    {quote.postUpvotes} Post Upvotes
                  </span>
                  <div className="flex items-center gap-2">
                    {quote.isTopUpvoted && (
                      <div className="flex items-center text-xs text-orange-400">
                        <Flame className="h-3.5 w-3.5 mr-1" />
                        <span>Most upvoted</span>
                      </div>
                    )}
                    {quote.isTopCommented && (
                      <div className="flex items-center text-xs text-blue-400">
                        <MessageCircle className="h-3.5 w-3.5 mr-1" />
                        <span>Most discussed</span>
                      </div>
                    )}
                  </div>
                </div>
              </a>
            ))
          ) : (
            <p className="text-sm text-gray-400 italic">No specific quotes found for this feature.</p>
          )}
        </div>
      </div>
    </div>
  );
} 