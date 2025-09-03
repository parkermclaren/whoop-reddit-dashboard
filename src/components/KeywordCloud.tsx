"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as d3 from 'd3';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Type definition for the feature aspect data
interface AspectData {
  feature: string;
  sentiment: string;
  score: number;
  quote: string;
}

// Type for sentiment breakdown
interface SentimentStats {
  positive: number;
  neutral: number;
  negative: number;
  [key: string]: number; // Add index signature for string keys
}

// Type definition for bubble data
interface BubbleData {
  id: string;
  value: number;
  name: string;
  sentiment: string;
  sentimentStats: SentimentStats;
  quotes: { text: string; upvotes: number }[];
}

// Type for the feature tooltip
interface FeatureTooltipProps {
  feature: BubbleData | null;
  position: { x: number; y: number };
  visible: boolean;
}

// Add this function after the interface definitions
const calculateSentimentScore = (stats: SentimentStats): number => {
  const total = stats.positive + stats.neutral + stats.negative;
  if (total === 0) return 0;
  
  // Calculate weighted score between -1 and 1
  const positiveWeight = stats.positive / total;
  const negativeWeight = stats.negative / total;
  
  return positiveWeight - negativeWeight;
};

// New function to normalize scores across all features
const normalizeScores = (data: BubbleData[]): Map<string, number> => {
  const scores = new Map<string, number>();
  let maxPositive = -1;
  let maxNegative = -1;
  
  // First calculate raw scores
  data.forEach(d => {
    const score = calculateSentimentScore(d.sentimentStats);
    scores.set(d.id, score);
    if (score > 0 && score > maxPositive) maxPositive = score;
    if (score < 0 && -score > maxNegative) maxNegative = -score;
  });
  
  // Normalize scores to -1 to 1 range based on max values
  data.forEach(d => {
    const score = scores.get(d.id) || 0;
    if (score > 0) {
      scores.set(d.id, score / maxPositive);
    } else if (score < 0) {
      scores.set(d.id, score / maxNegative);
    }
  });
  
  return scores;
};

interface KeywordCloudProps {
  fromDate?: string;
  toDate?: string;
}

export default function FeatureAspectCloud({ fromDate, toDate }: KeywordCloudProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bubbleData, setBubbleData] = useState<BubbleData[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<FeatureTooltipProps>({
    feature: null,
    position: { x: 0, y: 0 },
    visible: false
  });
  const [normalizedScores, setNormalizedScores] = useState<Map<string, number>>(new Map());

  // Map of full feature names to shortened display names
  const featureNameMap: Record<string, string> = {
    "hrv calibration": "HRV",
    "improved step counter": "Steps",
    "ai assistant": "AI",
    "improved sleep performance": "Sleep",
    "women's hormonal insights": "Hormonal",
    "healthspan/whoop age": "WHOOP Age",
    "improved sensor accuracy": "Sensor",
    "irregular heart rhythm": "Heart Rhythm",
    "blood pressure": "BP",
    "battery pack 5.0": "Battery",
    "stress monitor": "Stress",
    "improved auto-detected activities": "Auto-Detect",
    "daily outlook": "AI",
    "ecg": "ECG"
  };

  // Function to consolidate features before processing
  const consolidateFeature = (featureName: string): string => {
    const normalizedName = featureName.toLowerCase().trim();
    
    // Filter out non-feature terms
    if (normalizedName.includes('advanced labs') || normalizedName.includes('strain')) {
      return ''; // Return empty string to filter out
    }
    
    // Consolidate outlook-related features under AI
    if (normalizedName.includes('outlook')) {
      return 'ai assistant';
    }
    
    // Consolidate sleep-related features under Sleep
    if (normalizedName.includes('sleep')) {
      return 'improved sleep performance';
    }
    
    // Consolidate auto-detected activities variations
    if (normalizedName.includes('auto') && normalizedName.includes('detect')) {
      return 'improved auto-detected activities';
    }
    
    // Consolidate heart rhythm monitoring features
    if (normalizedName.includes('irregular') || normalizedName.includes('ecg') || normalizedName.includes('electrocardiogram')) {
      return 'ecg';
    }
    
    return normalizedName;
  };

  // Function to get short name for display
  const getShortName = (fullName: string): string => {
    const normalizedName = fullName.toLowerCase();
    return featureNameMap[normalizedName] || fullName;
  };

  // Title formatter that preserves known acronyms (e.g., ECG, HRV) and title-cases others
  const formatTitle = (name: string): string => {
    const upper = name.toUpperCase();
    // Preserve common acronyms if the entire name is an acronym
    if (upper === 'ECG' || upper === 'HRV' || upper === 'AI' || upper === 'BP') {
      return upper;
    }
    // Title-case words while preserving known acronyms within words
    return name.split(/[\s\/\-]+/).map(word => {
      if (!word) return word; // Handle empty strings from multiple separators
      const lowerWord = word.toLowerCase();
      if (['ecg', 'hrv', 'ai', 'bp', 'whoop'].includes(lowerWord)) {
        return lowerWord.toUpperCase();
      }
      // For other words, title-case them, ensuring the rest of the word is lowercase
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };

  useEffect(() => {
    async function fetchFeatureAspectData() {
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
          
          // If date range is specified but no posts are found, exit early
          if (postIds.length === 0) {
            setBubbleData([]);
            setNormalizedScores(new Map());
            setIsLoading(false);
            return;
          }
        }
        
        // Step 2: Fetch analysis_results using postIds
        let analysisRows: any[] = [];
        const baseSelect = () => supabase
          .from('analysis_results')
          .select('aspects, sentiment, content_id')
          .not('aspects', 'is', null)
          .not('aspects', 'eq', '[]');

        if (postIds) {
          const batchSize = 500;
          for (let i = 0; i < postIds.length; i += batchSize) {
            const batchIds = postIds.slice(i, i + batchSize);
            const { data, error } = await baseSelect().in('content_id', batchIds);
            if (error) throw new Error(error.message);
            if (data) analysisRows.push(...data);
          }
        } else {
          const { data, error } = await baseSelect();
          if (error) throw new Error(error.message);
          analysisRows = data || [];
        }
        
        const featureFrequency: Record<string, { 
          count: number; 
          sentiments: SentimentStats;
          quotes: { text: string; upvotes: number }[];
          originalName: string; // Store the original name for display
        }> = {};
        
        const contentIds: string[] = Array.from(new Set((analysisRows || []).map((row: any) => row.content_id).filter(Boolean)));
        const postUpvotesMap = new Map<string, number>();
        if (contentIds.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < contentIds.length; i += batchSize) {
            const batchIds = contentIds.slice(i, i + batchSize);
            const { data: postsData } = await supabase
              .from('reddit_posts')
              .select('id, ups')
              .in('id', batchIds);
            if (postsData) {
              postsData.forEach((p: any) => postUpvotesMap.set(p.id, p.ups || 0));
            }
          }
        }
        
        analysisRows.forEach(item => {
          if (item.aspects && item.aspects.length > 0) {
            item.aspects.forEach((aspect: AspectData) => {
              const originalName = aspect.feature.trim();
              const consolidatedName = consolidateFeature(originalName);
              
              if (!consolidatedName) return;
              
              if (!featureFrequency[consolidatedName]) {
                featureFrequency[consolidatedName] = {
                  count: 0,
                  sentiments: { positive: 0, neutral: 0, negative: 0 },
                  quotes: [],
                  originalName: consolidatedName
                };
              }
              featureFrequency[consolidatedName].count += 1;
              
              const sentiment = aspect.sentiment;
              if (sentiment === 'positive' || sentiment === 'neutral' || sentiment === 'negative') {
                featureFrequency[consolidatedName].sentiments[sentiment] += 1;
              }
              
              if (aspect.quote && aspect.quote.trim().length > 0) {
                const upvotes = postUpvotesMap.get((item as any).content_id) || 0;
                const quotesArr = featureFrequency[consolidatedName].quotes;
                if (!quotesArr.some(q => q.text === aspect.quote.trim())) {
                  quotesArr.push({ text: aspect.quote.trim(), upvotes });
                }
                quotesArr.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
                if (quotesArr.length > 2) quotesArr.length = 2;
              }
            });
          }
        });
        
        const bubbles = Object.entries(featureFrequency).map(([consolidatedName, { count, sentiments, quotes, originalName }]) => {
          let mostCommonSentiment = 'neutral';
          let maxCount = 0;
          
          const sentimentEntries: [string, number][] = [
            ['positive', sentiments.positive],
            ['neutral', sentiments.neutral],
            ['negative', sentiments.negative]
          ];
          
          for (const [sentiment, sentimentCount] of sentimentEntries) {
            if (sentimentCount > maxCount) {
              maxCount = sentimentCount;
              mostCommonSentiment = sentiment;
            }
          }
          
          return {
            id: consolidatedName,
            name: originalName,
            value: count,
            sentiment: mostCommonSentiment,
            sentimentStats: sentiments,
            quotes: quotes
          };
        });
        
        bubbles.sort((a, b) => b.value - a.value);
        const topBubbles = bubbles.slice(0, 20);
        
        if (topBubbles.length > 0) {
          const scores = normalizeScores(topBubbles);
          setNormalizedScores(scores);
          setBubbleData(topBubbles);
        } else {
          setBubbleData([{
            id: 'no-data',
            name: 'No features available',
            value: 1,
            sentiment: 'neutral',
            sentimentStats: { positive: 0, neutral: 1, negative: 0 },
            quotes: []
          }]);
          setNormalizedScores(new Map());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching feature aspect data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchFeatureAspectData();
  }, [fromDate, toDate]);

  // Helper function to add line breaks to text
  const formatText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length + word.length + (currentLine ? 1 : 0) <= maxLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  };

  useEffect(() => {
    if (!bubbleData.length || isLoading || !svgRef.current) return;
    
    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();
    
    // Adjust dimensions to fit card
    const width = 450;
    const height = 350;
    
    // Update the getColor function in the second useEffect
    const getColor = (d: BubbleData) => {
      const score = normalizedScores.get(d.id) || 0;
      
      // Apply a curve to make the color changes more pronounced
      const curvedScore = Math.sign(score) * Math.pow(Math.abs(score), 0.7);
      
      if (curvedScore === 0) return '#b4b4b4'; // Neutral grey
      
      if (curvedScore > 0) {
        // Interpolate between grey and green
        const greenColor = d3.color('#44d7b6')!;
        const greyColor = d3.color('#b4b4b4')!;
        return d3.interpolate(greyColor, greenColor)(curvedScore);
      } else {
        // Interpolate between grey and red
        const redColor = d3.color('#e25e5e')!;
        const greyColor = d3.color('#b4b4b4')!;
        return d3.interpolate(greyColor, redColor)(-curvedScore);
      }
    };
    
    // Find value range for scaling
    const valueExtent = d3.extent(bubbleData, d => d.value) as [number, number];
    const minValue = valueExtent[0] || 1;
    const maxValue = valueExtent[1] || 1;
    
    // Adjust bubble sizes to fit container
    const radiusScale = d3.scaleSqrt()
      .domain([minValue, maxValue])
      .range([15, 50]); // Adjusted for better fit - made slightly smaller
    
    // Create SVG with adjusted padding
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('style', 'max-width: 100%; height: auto; padding: 0;');
    
    // Create simulation for force layout
    const simulation = d3.forceSimulation(bubbleData as d3.SimulationNodeDatum[])
      .force('charge', d3.forceManyBody().strength(5))
      .force('center', d3.forceCenter(width / 2, height / 2 - 15))
      .force('collision', d3.forceCollide().radius((d: any) => radiusScale(d.value) + 1))
      .force('x', d3.forceX(width / 2).strength(0.07))
      .force('y', d3.forceY(height / 2 - 15).strength(0.07));
    
    // Create nodes
    const node = svg.selectAll('.node')
      .data(bubbleData)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', function(event, d: any) {
        try {
          // Dispatch selection to FeatureInsights
          window.dispatchEvent(new CustomEvent('select-feature', {
            detail: { feature: d?.name }
          }));
          // Smooth scroll to Feature-Feedback section
          const target = document.getElementById('Feature-Feedback');
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          // Update hash for deep-linking
          if (typeof history !== 'undefined' && history.replaceState) {
            history.replaceState(null, '', '#Feature-Feedback');
          }
          // Hide tooltip after click
          setTooltip(prev => ({ ...prev, visible: false }));
        } catch {}
      })
      .on('mouseenter', function(event, d) {
        // Use viewport-relative coordinates for fixed tooltips
        const xPos = event.clientX;
        const yPos = event.clientY;
        
        setTooltip({
          feature: d,
          position: { x: xPos, y: yPos },
          visible: true
        });
      })
      .on('mouseleave', function() {
        setTooltip(prev => ({ ...prev, visible: false }));
      });
    
    // Update the bubble creation code in the useEffect
    node.append('circle')
      .attr('r', d => radiusScale(d.value))
      .attr('fill', d => getColor(d))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);
    
    // Add text with line breaks if needed
    node.each(function(d) {
      const radius = radiusScale(d.value);
      const fontSize = Math.min(radius / 3.5, 12);
      // Use the shortened name for display
      const shortName = getShortName(d.name);
      const maxCharsPerLine = Math.max(3, Math.floor(radius / (fontSize * 0.6)));
      const lines = formatText(shortName, maxCharsPerLine);
      
      const textElement = d3.select(this).append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .style('fill', 'white')
        .style('font-size', fontSize + 'px')
        .style('pointer-events', 'none');
      
      if (Array.isArray(lines)) {
        const lineHeight = 1.2; // em
        const totalHeight = lines.length * lineHeight;
        const startY = -(totalHeight / 2) + (lineHeight / 2);
        
        lines.forEach((line, i) => {
          textElement.append('tspan')
            .attr('x', 0)
            .attr('y', 0)
            .attr('dy', startY + i * lineHeight + 'em')
            .text(line);
        });
      } else {
        textElement.text(lines);
      }
    });
    
    // Update positions for force layout
    simulation.on('tick', () => {
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });
    
  }, [bubbleData, isLoading, normalizedScores]);

  // Render feature tooltip/modal
  const renderTooltip = () => {
    if (!tooltip.visible || !tooltip.feature) return null;
    
    const feature = tooltip.feature;
    const sentimentStats = feature.sentimentStats;
    const total = feature.value;
    
    const positivePercent = Math.round((sentimentStats.positive / total) * 100) || 0;
    const neutralPercent = Math.round((sentimentStats.neutral / total) * 100) || 0;
    const negativePercent = Math.round((sentimentStats.negative / total) * 100) || 0;
    
    return (
      <div 
        className="fixed z-[9999] bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-600 min-w-[320px] max-w-md pointer-events-none"
        style={{
          left: `${tooltip.position.x + 14}px`,
          top: `${tooltip.position.y + 14}px`,
        }}
      >
        <h3 className="font-semibold text-white text-base mb-2">{formatTitle(feature.name)}</h3>
        <div className="text-sm text-gray-300 mb-3">{feature.value} mentions</div>
        
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-2">Sentiment breakdown:</div>
          <div className="flex h-3 mb-3 rounded-full overflow-hidden">
            <div style={{ width: `${positivePercent}%`, backgroundColor: '#44d7b6' }}></div>
            <div style={{ width: `${neutralPercent}%`, backgroundColor: '#b4b4b4' }}></div>
            <div style={{ width: `${negativePercent}%`, backgroundColor: '#e25e5e' }}></div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs text-gray-300">
            <div className="text-center">
              <div className="font-medium" style={{ color: '#44d7b6' }}>Positive</div>
              <div>{sentimentStats.positive} ({positivePercent}%)</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 font-medium">Neutral</div>
              <div>{sentimentStats.neutral} ({neutralPercent}%)</div>
            </div>
            <div className="text-center">
              <div className="text-red-400 font-medium">Negative</div>
              <div>{sentimentStats.negative} ({negativePercent}%)</div>
            </div>
          </div>
        </div>
        
        {feature.quotes && feature.quotes.length > 0 && (
          <div>
            <div className="text-xs text-gray-400 mb-2">Sample quotes:</div>
            <ul className="space-y-2">
              {feature.quotes
                .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
                .slice(0, 2)
                .map((q, i) => (
                <li key={i} className="text-xs text-gray-300 bg-gray-700 p-2 rounded border-l-2 border-gray-500">
                  "{q.text}"
                </li>
              ))}
            </ul>
          </div>
        )}
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
    <div className="w-full flex flex-col items-center relative">
      <div className="relative w-full mx-auto -mt-4 -mb-4">
        <svg ref={svgRef} className="w-full"></svg>
        {renderTooltip()}
      </div>
      <div className="flex justify-center items-center space-x-4 text-xs">
        <div className="flex items-center space-x-1">
          <div className="h-3 w-3 rounded-full bg-[#e25e5e]"></div>
          <span>Negative</span>
        </div>
        <div className="w-24 h-2 rounded-full bg-gradient-to-r from-[#e25e5e] via-[#b4b4b4] to-[#44d7b6]" />
        <div className="flex items-center space-x-1">
          <div className="h-3 w-3 rounded-full bg-[#44d7b6]"></div>
          <span>Positive</span>
        </div>
      </div>
    </div>
  );
} 