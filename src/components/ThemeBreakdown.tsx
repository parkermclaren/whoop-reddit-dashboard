"use client";

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  TooltipItem
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Theme data type
type ThemeData = {
  grouped_theme: string;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  total_count: number;
  positive_percent: number;
  neutral_percent: number;
  negative_percent: number;
}

// Main theme order and mapping of terms to themes
const MAIN_THEME_ORDER = [
  'Subscription Pricing',
  'Hardware Design',
  'New Health Metrics',
  'App Integration',
  'Battery Life'
];

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

export default function ThemeBreakdown() {
  const [themeData, setThemeData] = useState<ThemeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  useEffect(() => {
    const fetchThemeData = async () => {
      try {
        setLoading(true);
        
        const supabase = createClient();

        // Get all sentiment analysis results for posts
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
          setError('No analysis results found with theme data');
          setLoading(false);
          return;
        }
        
        // Initialize counters for main themes
        const themeCounters: Record<string, {
          positive: number;
          neutral: number;
          negative: number;
          total: number;
        }> = {};
        
        MAIN_THEME_ORDER.forEach(theme => {
          themeCounters[theme] = {
            positive: 0,
            neutral: 0,
            negative: 0,
            total: 0
          };
        });
        
        // Process each analysis result
        analysisResults.forEach(result => {
          if (!result.themes || result.themes.length === 0) return;
          
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
        
        // Convert counters to ThemeData array
        const calculatedThemeData: ThemeData[] = MAIN_THEME_ORDER.map(theme => {
          const counts = themeCounters[theme];
          return {
            grouped_theme: theme,
            positive_count: counts.positive,
            neutral_count: counts.neutral,
            negative_count: counts.negative,
            total_count: counts.total,
            positive_percent: counts.total > 0 ? Math.round((counts.positive / counts.total) * 100) : 0,
            neutral_percent: counts.total > 0 ? Math.round((counts.neutral / counts.total) * 100) : 0,
            negative_percent: counts.total > 0 ? Math.round((counts.negative / counts.total) * 100) : 0
          };
        });
        
        // Set the theme data
        setThemeData(calculatedThemeData);
        setLoading(false);
        
      } catch (err) {
        console.error('Error in theme data processing:', err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };

    fetchThemeData();
  }, []);

  const options: ChartOptions<'bar'> = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        bottom: 0
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#999',
        }
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#ccc',
          font: {
            size: 11,
          }
        }
      }
    },
    plugins: {
      legend: {
        display: false,
        position: 'bottom' as const,
        align: 'start' as const,
        labels: {
          color: '#ccc',
          usePointStyle: true,
          padding: 5,
          boxHeight: 7,
          boxWidth: 7,
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        titleColor: '#fff',
        bodyColor: '#fff',
        callbacks: {
          label: function(tooltipItem: TooltipItem<'bar'>) {
            const dataIndex = tooltipItem.dataIndex;
            const value = tooltipItem.raw as number;
            const dataset = tooltipItem.dataset.label?.toLowerCase() || '';
            const percentField: keyof ThemeData = 
              dataset === 'positive' ? 'positive_percent' : 
              dataset === 'neutral' ? 'neutral_percent' : 'negative_percent';
            return `${tooltipItem.dataset.label || ''}: ${value.toFixed(0)} (${themeData[dataIndex][percentField]}%)`;
          }
        }
      }
    },
  };

  if (loading) {
    return <div className="h-[400px] flex items-center justify-center">Loading theme data...</div>;
  }

  if (error) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center">
        <p className="text-red-400 mb-4">{error}</p>
        {debugInfo && (
          <details className="text-xs text-gray-400 mt-2 p-2 bg-gray-800 rounded max-w-full overflow-auto">
            <summary>Debug Information</summary>
            <pre className="whitespace-pre-wrap">{debugInfo}</pre>
          </details>
        )}
      </div>
    );
  }

  if (themeData.length === 0) {
    return <div className="h-[400px] flex items-center justify-center">No theme data available</div>;
  }

  const labels = themeData.map(item => item.grouped_theme);

  const data = {
    labels,
    datasets: [
      {
        label: 'Positive',
        data: themeData.map(item => item.positive_count),
        backgroundColor: 'rgba(68, 215, 182, 0.7)',
      },
      {
        label: 'Neutral',
        data: themeData.map(item => item.neutral_count),
        backgroundColor: 'rgba(180, 180, 180, 0.7)',
      },
      {
        label: 'Negative',
        data: themeData.map(item => item.negative_count),
        backgroundColor: 'rgba(245, 108, 108, 0.7)',
      },
    ],
  };

  return (
    <div className="h-[400px] w-full">
      <Bar options={options} data={data} style={{ height: '100%', width: '100%' }} />
    </div>
  );
} 