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
import InfoButton from '@/components/InfoButton';
import ProductSatisfactionInsights from '@/components/ProductSatisfactionInsights';
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
      
      <div id="dashboard-content" className="container mx-auto px-4 py-6">
        <div className="mb-6 pt-4 relative flex flex-col items-center justify-center">
          {/* Centered background logo */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none z-0">
            <div className="w-[90%] h-[90%] flex items-center justify-center">
              <Image 
                src="/logos/whooplogo.svg_.png" 
                alt="WHOOP Logo" 
                width={650} 
                height={650}
                className="object-contain opacity-20 backdrop-blur-sm filter blur-sm"
                priority
              />
            </div>
          </div>
          
          {/* Centered content */}
          <div className="relative z-10 text-center max-w-4xl mx-auto py-4">
            <h1 className="text-5xl font-bold mb-4 text-white">
              <span className="text-[#44d7b6]">Voice of WHOOP Users,</span> <span className="text-white">Decoded by AI</span>
            </h1>
            
            <p className="text-lg text-gray-200 leading-relaxed mb-6 max-w-3xl mx-auto">
              Transforming conversations from <a href="https://www.reddit.com/r/whoop/" target="_blank" rel="noopener noreferrer" className="text-[#44d7b6] hover:underline">r/whoop</a> into actionable insights following the <a href="https://www.youtube.com/watch?v=rZm8VHPkPoI" target="_blank" rel="noopener noreferrer" className="text-[#44d7b6] hover:underline">Unlocked 2025</a> announcement on May 8, 2025.
            </p>
            
            {/* Collapsible details button styled as a button instead of details/summary */}
            <button 
              onClick={() => {
                const details = document.getElementById('dashboard-details');
                if (details) {
                  details.classList.toggle('hidden');
                }
              }}
              className="inline-flex items-center justify-center px-5 py-2 mb-2 border border-[#44d7b6] rounded-lg text-sm font-medium text-[#44d7b6] hover:bg-[#44d7b6]/10 transition-colors"
            >
              <span>More about this dashboard</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* Hidden details section */}
            <div id="dashboard-details" className="hidden bg-[#24262b]/80 p-4 rounded-xl mx-auto max-w-2xl backdrop-blur-sm mt-2">
              <div className="space-y-4 text-left">
                <div className="border-l-4 border-[#44d7b6] pl-4 py-1">
                  <p className="text-gray-200 leading-relaxed">
                    <span className="font-semibold">Why Reddit matters:</span> Reddit offers unfiltered customer sentiment where authenticity is rewarded. This community-driven platform provides direct insights into user experiences that more curated channels simply can't match.
                  </p>
                </div>
                
                <div className="border-l-4 border-[#44d7b6] pl-4 py-1">
                  <p className="text-gray-200 leading-relaxed">
                    <span className="font-semibold">Why AI-powered analysis:</span> LLMs excel at analyzing sentiment and extracting key information from unstructured text. They process thousands of conversations in minutes, delivering insights that would take weeks of manual human analysis to uncover.
                  </p>
                </div>
                
                <p className="text-gray-200 leading-relaxed">
                  Updated hourly through our automated pipeline, this dashboard bridges the gap between raw community feedback and actionable product insights — transforming social noise into strategic direction.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <Stats />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div id="feature-analysis" className="bg-[#24262b] rounded-xl p-6 shadow-lg relative scroll-mt-24">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold uppercase">Feature Analysis</h2>
              <div className="absolute top-6 right-6">
                <InfoButton title="Feature Analysis Methodology">
                  <p className="text-gray-300 mb-2">
                    This visualization maps newly announced WHOOP features discussed in r/whoop following the Unlocked 2025 event.
                  </p>
                  <p className="text-gray-300 mb-1">
                    <span className="font-semibold">Size</span>: Represents frequency of mention across posts
                  </p>
                  <p className="text-gray-300">
                    <span className="font-semibold">Color</span>: Indicates sentiment (red = negative, green = positive)
                  </p>
                </InfoButton>
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              New features mentioned in community discussions (size = mentions, color = sentiment)
            </p>
            <KeywordCloud />
          </div>
          
          <div id="theme-distribution" className="bg-[#24262b] rounded-xl p-6 shadow-lg relative scroll-mt-24">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold uppercase">Theme Distribution</h2>
              <div className="flex items-center space-x-2">
                <button className="bg-[#1a1c20] px-3 py-1 rounded text-sm">Top 5</button>
                <InfoButton title="Theme Distribution Analysis">
                  <p className="text-gray-300 mb-2">
                    This chart shows the most common discussion themes extracted from Reddit posts by GPT-4o-mini.
                  </p>
                  <p className="text-gray-300">
                    Each bar is color-coded to show the sentiment distribution within that theme (red = negative, gray = neutral, green = positive).
                  </p>
                </InfoButton>
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Key topics discussed following the announcement
            </p>
            <ThemeBreakdown />
            <div className="mt-4 flex justify-center space-x-4 text-sm">
              <div className="flex items-center">
                <div className="h-3 w-3 rounded-full bg-[rgba(68,215,182,0.7)] mr-2"></div>
                <span className="text-gray-400">Positive</span>
              </div>
              <div className="flex items-center">
                <div className="h-3 w-3 rounded-full bg-[rgba(180,180,180,0.7)] mr-2"></div>
                <span className="text-gray-400">Neutral</span>
              </div>
              <div className="flex items-center">
                <div className="h-3 w-3 rounded-full bg-[rgba(245,108,108,0.7)] mr-2"></div>
                <span className="text-gray-400">Negative</span>
              </div>
            </div>
          </div>
        </div>
        
        <div id="top-posts" className="bg-[#24262b] rounded-xl p-6 shadow-lg mb-8 relative scroll-mt-24">
          <h2 className="text-lg font-semibold uppercase mb-2">Top Posts by Engagement</h2>
          <div className="absolute top-6 right-6">
            <InfoButton title="Top Posts Analysis">
              <p className="text-gray-300 mb-2">
                This table shows the most engaging posts from r/whoop sorted by upvotes and comment count.
              </p>
              <p className="text-gray-300">
                Each post has been analyzed by GPT-4o-mini to extract sentiment, key topics, and relevance to the product announcement.
              </p>
            </InfoButton>
          </div>
          <TopPostsTable />
          <div className="mt-4 text-sm text-gray-400">
            <p>
              These posts reflect the most engaging topics in the community. 
              Click on any post title to view the original thread on Reddit.
            </p>
          </div>
        </div>
        
        <div id="feature-feedback" className="bg-[#24262b] rounded-xl p-6 shadow-lg mb-8 relative scroll-mt-24">
          <h2 className="text-lg font-semibold uppercase mb-2">Feature Feedback Quotes</h2>
          <div className="absolute top-6 right-6">
            <InfoButton title="Feature Feedback Analysis">
              <p className="text-gray-300 mb-2">
                This component displays representative quotes for each new WHOOP feature.
              </p>
              <p className="text-gray-300">
                GPT-4o-mini identified direct mentions of specific features and extracted the most impactful quotes based on sentiment strength and engagement metrics.
              </p>
            </InfoButton>
          </div>
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
        
        {/* New Product Satisfaction Insights Component */}
        <div id="product-satisfaction" className="bg-[#24262b] rounded-xl p-6 shadow-lg mb-8 relative scroll-mt-24">
          <h2 className="text-lg font-semibold uppercase mb-2">Product Satisfaction Among Confirmed Recipients</h2>
          <div className="absolute top-6 right-6">
            <InfoButton title="Product Satisfaction Analysis">
              <p className="text-gray-300 mb-2">
                <span className="text-[#44d7b6] font-medium">Important:</span> This analysis includes ONLY users who have explicitly confirmed receiving their new WHOOP hardware.
              </p>
              <p className="text-gray-300">
                This side-by-side comparison reveals early satisfaction data for the two main new products (WHOOP 5.0 and WHOOP MG) among actual users, showing the breakdown between satisfied, neutral, and dissatisfied customers.
              </p>
            </InfoButton>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Direct comparison of WHOOP 5.0 vs WHOOP MG satisfaction metrics from users who have confirmed receiving their device
          </p>
          <ProductSatisfactionInsights />
          <div className="mt-4 text-sm text-gray-400">
            <p>
              This data represents actual hands-on experience with the new hardware, providing valuable insights into real-world product performance.
            </p>
          </div>
        </div>
        
        <div id="competitor-mentions" className="bg-[#24262b] rounded-xl p-6 shadow-lg mb-8 relative scroll-mt-24">
          <h2 className="text-lg font-semibold uppercase mb-2">Competitor Mentions</h2>
          <div className="absolute top-6 right-6">
            <InfoButton title="Competitor Analysis Methodology">
              <p className="text-gray-300 mb-2">
                This visualization shows how frequently competitors are mentioned in r/whoop discussions.
              </p>
              <p className="text-gray-300">
                GPT-4o-mini identifies mentions of competing fitness trackers and analyzes the sentiment context around each mention. This helps understand which alternatives users are considering.
              </p>
            </InfoButton>
          </div>
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
        
        <div id="cancellation-insights" className="bg-[#24262b] rounded-xl p-6 shadow-lg mb-8 relative scroll-mt-24">
          <h2 className="text-lg font-semibold uppercase mb-2">Cancellation Insights</h2>
          <div className="absolute top-6 right-6">
            <InfoButton title="Cancellation Analysis">
              <p className="text-gray-300 mb-2">
                This analysis identifies posts where users mention canceling their WHOOP membership.
              </p>
              <p className="text-gray-300">
                GPT-4o-mini extracts the primary reasons driving cancellation decisions, categorizing them to help understand retention challenges.
              </p>
            </InfoButton>
          </div>
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
        
        <div id="faqs" className="bg-[#24262b] rounded-xl p-6 shadow-lg relative scroll-mt-24">
          <h2 className="text-lg font-semibold uppercase mb-2">Frequently Asked Questions</h2>
          <div className="absolute top-6 right-6">
            <InfoButton title="FAQ Analysis">
              <p className="text-gray-300 mb-2">
                This component displays the most common questions from the r/whoop community, organized by topic.
              </p>
              <p className="text-gray-300">
                GPT-4o-mini identifies question patterns in posts and comments, then clusters similar questions to reveal the most pressing concerns from users.
              </p>
            </InfoButton>
          </div>
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
              <div className="w-56 h-56 rounded-full overflow-hidden border-4 border-[#44d7b6] mx-auto">
                <Image 
                  src="/mclaren_parker.jpg" 
                  alt="Parker McLaren" 
                  width={224} 
                  height={224}
                  className="object-cover w-full h-full"
                  style={{ objectPosition: 'center 10%' }}
                />
              </div>
            </div>
            
            <div className="text-center md:text-left max-w-md">
              <h3 className="text-xl font-bold mb-2">Parker McLaren, MBA</h3>
              <p className="text-gray-300 mb-4">
                Athlete, biohacker, and AI-native generalist with an interest in health-tech startups. Seeking to join WHOOP team.
              </p>
              
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-6 text-sm justify-center md:justify-start mb-4">
                <a href="mailto:parkerwoodmclaren@gmail.com" className="text-[#44d7b6] hover:text-white flex items-center justify-center md:justify-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  parkerwoodmclaren@gmail.com
                </a>
                <a href="tel:9782045739" className="text-[#44d7b6] hover:text-white flex items-center justify-center md:justify-start">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  (978) 204-5739
                </a>
              </div>
              
              <div className="flex justify-center md:justify-start space-x-4">
                <a 
                  href="https://github.com/parkermclaren" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-[#44d7b6]/20 hover:bg-[#44d7b6]/30 text-white p-2 rounded-full"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>
                <a 
                  href="https://www.linkedin.com/in/parker-mclaren/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-[#44d7b6]/20 hover:bg-[#44d7b6]/30 text-white p-2 rounded-full"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
