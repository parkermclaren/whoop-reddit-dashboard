"use client";

import { Inter } from 'next/font/google';
import dynamic from 'next/dynamic';
import SentimentTimeline from '@/components/SentimentTimeline';
import FAQClusters from '@/components/FAQClusters';
import ThemeBreakdown from '@/components/ThemeBreakdown';
import TopPostsTable from '@/components/TopPostsTable';
import Stats from '@/components/Stats';
import Header from '@/components/Header';
import FeatureInsights from '@/components/FeatureInsights';
import CompetitorMentions from '@/components/CompetitorMentions';
import CancellationInsights from '@/components/CancellationInsights';
import { useState } from 'react';
import Image from 'next/image';

// Import the SortOption type from the TopPostsTable component
import type { SortOption, SentimentFilter } from '@/components/TopPostsTable';

// Dynamically import KeywordCloud with ssr: false
const KeywordCloud = dynamic(() => import('@/components/KeywordCloud'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
    </div>
  ),
});

const inter = Inter({ subsets: ['latin'] });

export default function Home() {
  // These state variables are no longer needed as they're handled in the component
  
  return (
    <main className="min-h-screen bg-[#1a1c20] text-white">
      <Header />
      
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2">WHOOP REDDIT INSIGHTS</h1>
          <p className="text-gray-400">
            Analysis of 780 Reddit posts from r/whoop following the May 8, 2025 product announcement
          </p>
        </div>
        
        <Stats />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold uppercase">Feature Analysis</h2>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              New features mentioned in community discussions (size = mentions, color = sentiment)
            </p>
            <KeywordCloud />
          </div>
          
          <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold uppercase">Theme Distribution</h2>
              <div className="flex space-x-2">
                <button className="bg-[#1a1c20] px-3 py-1 rounded text-sm">Top 5</button>
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Key topics discussed following the announcement
            </p>
            <ThemeBreakdown />
            <div className="mt-4 text-sm text-gray-400">
              <p>"Subscription pricing" and "hardware design" were the most discussed topics with predominantly negative sentiment. "New health metrics" received the most positive feedback proportionally.</p>
            </div>
          </div>
        </div>
        
        <div className="bg-[#24262b] rounded-xl p-6 shadow-lg mb-8">
          <h2 className="text-lg font-semibold uppercase mb-2">Top Posts by Engagement</h2>
          <TopPostsTable />
          <div className="mt-4 text-sm text-gray-400">
            <p>
              These posts reflect the most engaging topics in the community. 
              Click on any post title to view the original thread on Reddit.
            </p>
          </div>
        </div>
        
        <div className="bg-[#24262b] rounded-xl p-6 shadow-lg mb-8">
          <h2 className="text-lg font-semibold uppercase mb-2">Feature Feedback Quotes</h2>
          <p className="text-sm text-gray-400 mb-4">
            Most impactful community quotes about each new feature
          </p>
          <FeatureInsights />
          <div className="mt-4 text-sm text-gray-400">
            <p>
              Select any feature to see what the community is saying. Quotes are color-coded by sentiment and ranked by engagement.
            </p>
          </div>
        </div>
        
        <div className="bg-[#24262b] rounded-xl p-6 shadow-lg mb-8">
          <h2 className="text-lg font-semibold uppercase mb-2">Competitor Mentions</h2>
          <p className="text-sm text-gray-400 mb-4">
            Breakdown of competitors mentioned in community discussions
          </p>
          <CompetitorMentions />
          <div className="mt-4 text-sm text-gray-400">
            <p>
              Each card shows the number of mentions and sentiment distribution (positive, neutral, negative) for each competitor.
            </p>
          </div>
        </div>
        
        <div className="bg-[#24262b] rounded-xl p-6 shadow-lg mb-8">
          <h2 className="text-lg font-semibold uppercase mb-2">Cancellation Insights</h2>
          <p className="text-sm text-gray-400 mb-4">
            Analysis of users mentioning cancellation of their WHOOP membership
          </p>
          <CancellationInsights />
          <div className="mt-4 text-sm text-gray-400">
            <p>
              This analysis shows what percentage of users mention cancellation and the primary reasons driving cancellation decisions.
            </p>
          </div>
        </div>
        
        <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
          <h2 className="text-lg font-semibold uppercase mb-2">Frequently Asked Questions</h2>
          <p className="text-sm text-gray-400 mb-4">
            Top questions from the community grouped by topic
          </p>
          <FAQClusters />
          <div className="mt-4 text-sm text-gray-400">
            <p>
              These questions represent the most common concerns and inquiries from the community. Click on any question to see the original discussion on Reddit.
            </p>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16 py-12 bg-[#24262b]">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-center md:space-x-12">
            <div className="mb-6 md:mb-0">
              <div className="w-56 h-56 rounded-full overflow-hidden border-4 border-[#ff6384] mx-auto">
                <Image 
                  src="/mclaren_parker.jpg" 
                  alt="Parker McLaren" 
                  width={224} 
                  height={224}
                  className="object-cover w-full h-full"
                  style={{ objectPosition: 'center 25%' }}
                />
              </div>
            </div>
            
            <div className="text-center md:text-left max-w-md">
              <h3 className="text-xl font-bold mb-2">Parker McLaren, MBA</h3>
              <p className="text-gray-300 mb-4">
                Passionate data analyst and visualization expert with a keen interest in health and fitness technology. 
                Building insights to help WHOOP better understand their community.
              </p>
              
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-6 text-sm justify-center md:justify-start mb-4">
                <a href="mailto:parkerwoodmclaren@gmail.com" className="text-[#ff6384] hover:text-white flex items-center justify-center md:justify-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  parkerwoodmclaren@gmail.com
                </a>
                <a href="tel:9782045739" className="text-[#ff6384] hover:text-white flex items-center justify-center md:justify-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  (978) 204-5739
                </a>
              </div>
              
              <div className="flex justify-center md:justify-start space-x-4">
                <a 
                  href="https://github.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>
                <a 
                  href="https://linkedin.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
          
          <div className="text-center mt-8 text-gray-400 text-sm">
            <p>Seeking to join the WHOOP team to transform fitness data into actionable insights that help people reach their full potential.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
