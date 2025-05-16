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
  quotes: string[];
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

export default function FeatureAspectCloud() {
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
    "HRV calibration": "HRV",
    "improved Step Counter": "Steps",
    "Improved Step Counter": "Steps",
    "AI Assistant": "AI",
    "improved Sleep Performance": "Sleep",
    "Improved Sleep Performance": "Sleep",
    "Women's Hormonal Insights": "Hormonal",
    "Healthspan/WHOOP Age": "WHOOP Age",
    "Improved Sensor accuracy": "Sensor",
    "improved Sensor accuracy": "Sensor",
    "Irregular Heart Rhythm": "Heart Rhythm",
    "Blood Pressure": "BP",
    "Battery Pack 5.0": "Battery",
    "Stress Monitor": "Stress",
    "improved Auto-Detected Activities": "Auto-Detect",
    "Improved Auto-Detected Activities": "Auto-Detect",
    "Daily Outlook": "Outlook",
    "ECG": "ECG"
  };

  // Function to get short name for display
  const getShortName = (fullName: string): string => {
    return featureNameMap[fullName] || fullName;
  };

  useEffect(() => {
    async function fetchFeatureAspectData() {
      try {
        setIsLoading(true);
        
        const { data, error } = await supabase
          .from('analysis_results')
          .select('aspects, sentiment')
          .not('aspects', 'is', null)
          .not('aspects', 'eq', '[]');
          
        if (error) throw new Error(error.message);
        
        const featureFrequency: Record<string, { 
          count: number; 
          sentiments: SentimentStats;
          quotes: string[];
        }> = {};
        
        data.forEach(item => {
          if (item.aspects && item.aspects.length > 0) {
            item.aspects.forEach((aspect: AspectData) => {
              const featureName = aspect.feature.trim();
              if (!featureFrequency[featureName]) {
                featureFrequency[featureName] = { 
                  count: 0, 
                  sentiments: { positive: 0, neutral: 0, negative: 0 },
                  quotes: []
                };
              }
              featureFrequency[featureName].count += 1;
              
              // Safely increment sentiment count
              const sentiment = aspect.sentiment;
              if (sentiment === 'positive' || sentiment === 'neutral' || sentiment === 'negative') {
                featureFrequency[featureName].sentiments[sentiment] += 1;
              }
              
              // Store up to 3 quotes per feature
              if (aspect.quote && featureFrequency[featureName].quotes.length < 3) {
                featureFrequency[featureName].quotes.push(aspect.quote);
              }
            });
          }
        });
        
        const bubbles = Object.entries(featureFrequency).map(([feature, { count, sentiments, quotes }]) => {
          let mostCommonSentiment = 'neutral';
          let maxCount = 0;
          
          // Find most common sentiment
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
            id: feature,
            name: feature,
            value: count,
            sentiment: mostCommonSentiment,
            sentimentStats: sentiments,
            quotes: quotes
          };
        });
        
        bubbles.sort((a, b) => b.value - a.value);
        const topBubbles = bubbles.slice(0, 20); // Reduced from 30 to 20 for smaller visualization
        
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
  }, []);

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
      .on('mouseover', function(event, d) {
        // Get position relative to the container
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (!svgRect) return;
        
        const xPos = event.clientX - svgRect.left;
        const yPos = event.clientY - svgRect.top;
        
        setTooltip({
          feature: d,
          position: { x: xPos, y: yPos },
          visible: true
        });
      })
      .on('mouseout', function() {
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
        className="absolute z-10 bg-gray-800 p-3 rounded-md shadow-lg border border-gray-700 max-w-xs"
        style={{
          left: `${tooltip.position.x + 10}px`,
          top: `${tooltip.position.y - 10}px`,
        }}
      >
        <h3 className="font-medium text-white text-sm mb-1">{feature.name}</h3>
        <div className="text-xs text-gray-300 mb-2">{feature.value} mentions</div>
        
        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">Sentiment breakdown:</span>
          </div>
          <div className="flex h-3 mb-1 rounded overflow-hidden">
            <div style={{ width: `${positivePercent}%`, backgroundColor: '#44d7b6' }}></div>
            <div style={{ width: `${neutralPercent}%`, backgroundColor: '#b4b4b4' }}></div>
            <div style={{ width: `${negativePercent}%`, backgroundColor: '#e25e5e' }}></div>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Positive: {sentimentStats.positive} ({positivePercent}%)</span>
            <span>Neutral: {sentimentStats.neutral} ({neutralPercent}%)</span>
            <span>Negative: {sentimentStats.negative} ({negativePercent}%)</span>
          </div>
        </div>
        
        {feature.quotes && feature.quotes.length > 0 && (
          <div>
            <div className="text-xs text-gray-400 mb-1">Sample quotes:</div>
            <ul className="list-disc pl-4">
              {feature.quotes.slice(0, 2).map((quote, i) => (
                <li key={i} className="text-xs text-gray-300 mb-1">{quote}</li>
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