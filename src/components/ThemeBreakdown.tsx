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

export default function ThemeBreakdown() {
  const [themeData, setThemeData] = useState<ThemeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  useEffect(() => {
    const fetchThemeData = async () => {
      try {
        setLoading(true);
        
        // Debug environment variables
        console.log("ThemeBreakdown - Environment variables check:");
        console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
        console.log("NEXT_PUBLIC_SUPABASE_ANON_KEY:", 
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 
          "Exists (first 10 chars): " + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 10) + "..." : 
          "Missing"
        );
        
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          throw new Error("Supabase environment variables are missing");
        }
        
        console.log("ThemeBreakdown - Creating Supabase client...");
        let supabase;
        try {
          supabase = createClient();
          console.log("ThemeBreakdown - Supabase client created successfully");
        } catch (clientErr) {
          console.error("ThemeBreakdown - Error creating Supabase client:", clientErr);
          throw new Error(`Failed to create Supabase client: ${clientErr instanceof Error ? clientErr.message : String(clientErr)}`);
        }

        console.log("ThemeBreakdown - Fetching theme sentiment stats");
        let queryResult;
        try {
          queryResult = await supabase
            .from('theme_sentiment_stats')
            .select('*')
            .not('grouped_theme', 'eq', 'Other')
            .order('total_count', { ascending: false })
            .limit(5);
            
          console.log("ThemeBreakdown - Theme stats query result:", queryResult);
          // Store the query result for debugging purposes
          setDebugInfo(JSON.stringify(queryResult, null, 2));
        } catch (queryErr) {
          console.error("ThemeBreakdown - Error querying theme_sentiment_stats:", queryErr);
          throw new Error(`Error querying theme_sentiment_stats: ${queryErr instanceof Error ? queryErr.message : String(queryErr)}`);
        }
        
        if (queryResult.error) {
          console.error("ThemeBreakdown - Supabase error returned:", queryResult.error);
          throw new Error(`Supabase error when fetching theme data: ${queryResult.error.message}`);
        }
        
        if (!queryResult.data || queryResult.data.length === 0) {
          console.log("ThemeBreakdown - No theme data found");
          setThemeData([]);
        } else {
          setThemeData(queryResult.data);
        }
      } catch (err) {
        console.error('ThemeBreakdown - Error fetching theme data:', err);
        setError(err instanceof Error ? err.message : JSON.stringify(err));
      } finally {
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