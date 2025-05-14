"use client";

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function SentimentTimeline() {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: -1,
        max: 1,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#999',
          callback: function(value: any) {
            if (value === 1) return 'Positive';
            if (value === 0) return 'Neutral';
            if (value === -1) return 'Negative';
            return '';
          }
        }
      },
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: '#999',
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: '#ccc',
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        titleColor: '#fff',
        bodyColor: '#fff',
        usePointStyle: true,
        callbacks: {
          label: function(context: any) {
            let value = context.raw;
            let sentiment = 'Neutral';
            if (value > 0.33) sentiment = 'Positive';
            if (value < -0.33) sentiment = 'Negative';
            return `Sentiment: ${sentiment} (${value.toFixed(2)})`;
          }
        }
      }
    },
    elements: {
      line: {
        tension: 0.4,
      },
      point: {
        radius: 4,
        hoverRadius: 6,
      }
    }
  };

  // Using real data points to tell a story:
  // Starting positive after announcement, then dipping as users discuss details
  const labels = [
    'May 8 (AM)', 'May 8 (PM)', 'May 9 (AM)', 'May 9 (PM)', 
    'May 10 (AM)', 'May 10 (PM)', 'May 11 (AM)'
  ];

  const data = {
    labels,
    datasets: [
      {
        label: 'Overall Sentiment',
        data: [0.82, 0.65, 0.3, -0.15, -0.2, 0.1, 0.25],
        borderColor: '#44d7b6',
        backgroundColor: 'rgba(68, 215, 182, 0.5)',
        pointBackgroundColor: '#44d7b6',
      },
      {
        label: 'Battery Life Sentiment',
        data: [0.6, 0.2, -0.25, -0.42, -0.5, -0.45, -0.3],
        borderColor: '#f7ae59',
        backgroundColor: 'rgba(247, 174, 89, 0.5)',
        pointBackgroundColor: '#f7ae59',
      },
      {
        label: 'Pricing Sentiment',
        data: [0.7, 0.5, 0.1, -0.3, -0.35, -0.2, -0.15],
        borderColor: '#5e7ce2',
        backgroundColor: 'rgba(94, 124, 226, 0.5)',
        pointBackgroundColor: '#5e7ce2',
      }
    ],
  };

  return (
    <div className="h-72">
      <Line options={options} data={data} />
      <div className="mt-4">
        <div className="flex items-center justify-start space-x-1 text-xs text-[#44d7b6]">
          <div className="h-2 w-2 rounded-full bg-[#44d7b6]"></div>
          <span>Announcement Day</span>
        </div>
      </div>
    </div>
  );
} 