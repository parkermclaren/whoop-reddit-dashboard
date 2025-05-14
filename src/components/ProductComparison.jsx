import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

const ProductComparison = () => {
  const [productData, setProductData] = useState({
    mentions: { whoop5: 0, whoopMG: 0, both: 0 },
    sentiment: { 
      whoop5: { positive: 0, neutral: 0, negative: 0 },
      whoopMG: { positive: 0, neutral: 0, negative: 0 }
    },
    themes: [],
    engagement: { whoop5: {}, whoopMG: {} }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    try {
      // Fetch mention counts
      const { data: mentionsData, error: mentionsError } = await supabase.rpc('get_product_mentions');
      if (mentionsError) throw mentionsError;
      
      // Fetch sentiment breakdown
      const { data: sentimentData, error: sentimentError } = await supabase.rpc('get_product_sentiment');
      if (sentimentError) throw sentimentError;
      
      // Fetch theme data
      const { data: themeData, error: themeError } = await supabase.rpc('get_product_themes');
      if (themeError) throw themeError;
      
      // Fetch engagement metrics
      const { data: engagementData, error: engagementError } = await supabase.rpc('get_product_engagement');
      if (engagementError) throw engagementError;
      
      setProductData({
        mentions: mentionsData || { 
          whoop5: 220, 
          whoopMG: 84, 
          both: 95 
        },
        sentiment: sentimentData || {
          whoop5: { positive: 32, neutral: 84, negative: 103 },
          whoopMG: { positive: 14, neutral: 34, negative: 35 }
        },
        themes: themeData || [
          { theme: "pricing", whoop5: 51, whoopMG: 19 },
          { theme: "hardware quality", whoop5: 50, whoopMG: 17 },
          { theme: "membership model", whoop5: 35, whoopMG: 18 },
          { theme: "upgrade policy", whoop5: 38, whoopMG: 4 },
          { theme: "battery life", whoop5: 14, whoopMG: 0 }
        ],
        engagement: engagementData || {
          whoop5: { 
            postCount: 220, 
            totalScore: 4645, 
            totalComments: 2475, 
            avgScore: 21.11, 
            avgComments: 11.25 
          },
          whoopMG: { 
            postCount: 84, 
            totalScore: 983, 
            totalComments: 782, 
            avgScore: 11.70, 
            avgComments: 9.31 
          }
        }
      });

    } catch (error) {
      console.error('Error fetching product comparison data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate percentage data for engagement ratios  
  const getPercentage = (value, total) => ((value / total) * 100).toFixed(1);
  
  const whoop5Total = productData.sentiment.whoop5.positive + 
                       productData.sentiment.whoop5.neutral + 
                       productData.sentiment.whoop5.negative;
                       
  const whoopMGTotal = productData.sentiment.whoopMG.positive + 
                        productData.sentiment.whoopMG.neutral + 
                        productData.sentiment.whoopMG.negative;

  return (
    <div className="h-full">
      {loading ? (
        <div className="h-72 flex items-center justify-center">
          <div className="w-full h-1.5 bg-[#1a1c20] rounded-full overflow-hidden">
            <div className="animate-pulse h-full w-1/2 bg-[#44d7b6] rounded-full"></div>
          </div>
        </div>
      ) : (
        <div className="h-full">
          {/* Total Mentions Comparison */}
          <div className="mb-5">
            <h3 className="text-sm font-medium mb-3">Total Mentions</h3>
            <div className="mb-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>WHOOP 5.0</span>
                <span>{productData.mentions.whoop5}</span>
              </div>
              <div className="w-full h-2.5 bg-[#1a1c20] rounded-full overflow-hidden">
                <div className="h-full bg-[#3498db] rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>
            <div className="mb-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>WHOOP MG</span>
                <span>{productData.mentions.whoopMG}</span>
              </div>
              <div className="w-full h-2.5 bg-[#1a1c20] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#2ecc71] rounded-full" 
                  style={{ width: `${(productData.mentions.whoopMG / productData.mentions.whoop5) * 100}%` }}
                ></div>
              </div>
            </div>
            <div className="mb-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Mentioned Together</span>
                <span>{productData.mentions.both}</span>
              </div>
              <div className="w-full h-2.5 bg-[#1a1c20] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#9b59b6] rounded-full" 
                  style={{ width: `${(productData.mentions.both / productData.mentions.whoop5) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Sentiment Comparison */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <h3 className="text-sm font-medium mb-3">WHOOP 5.0 Sentiment</h3>
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Positive</span>
                  <span>{getPercentage(productData.sentiment.whoop5.positive, whoop5Total)}%</span>
                </div>
                <div className="w-full h-2 bg-[#1a1c20] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#44d7b6]" 
                    style={{ width: `${getPercentage(productData.sentiment.whoop5.positive, whoop5Total)}%` }}
                  ></div>
                </div>
              </div>
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Neutral</span>
                  <span>{getPercentage(productData.sentiment.whoop5.neutral, whoop5Total)}%</span>
                </div>
                <div className="w-full h-2 bg-[#1a1c20] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gray-400" 
                    style={{ width: `${getPercentage(productData.sentiment.whoop5.neutral, whoop5Total)}%` }}
                  ></div>
                </div>
              </div>
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Negative</span>
                  <span>{getPercentage(productData.sentiment.whoop5.negative, whoop5Total)}%</span>
                </div>
                <div className="w-full h-2 bg-[#1a1c20] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#ff6384]" 
                    style={{ width: `${getPercentage(productData.sentiment.whoop5.negative, whoop5Total)}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">WHOOP MG Sentiment</h3>
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Positive</span>
                  <span>{getPercentage(productData.sentiment.whoopMG.positive, whoopMGTotal)}%</span>
                </div>
                <div className="w-full h-2 bg-[#1a1c20] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#44d7b6]" 
                    style={{ width: `${getPercentage(productData.sentiment.whoopMG.positive, whoopMGTotal)}%` }}
                  ></div>
                </div>
              </div>
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Neutral</span>
                  <span>{getPercentage(productData.sentiment.whoopMG.neutral, whoopMGTotal)}%</span>
                </div>
                <div className="w-full h-2 bg-[#1a1c20] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gray-400" 
                    style={{ width: `${getPercentage(productData.sentiment.whoopMG.neutral, whoopMGTotal)}%` }}
                  ></div>
                </div>
              </div>
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Negative</span>
                  <span>{getPercentage(productData.sentiment.whoopMG.negative, whoopMGTotal)}%</span>
                </div>
                <div className="w-full h-2 bg-[#1a1c20] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#ff6384]" 
                    style={{ width: `${getPercentage(productData.sentiment.whoopMG.negative, whoopMGTotal)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Engagement Stats Comparison */}
          <div className="mb-1">
            <h3 className="text-sm font-medium mb-3">Community Engagement</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#1a1c20] rounded-lg p-3">
                <h4 className="font-semibold mb-2 text-[#3498db]">WHOOP 5.0</h4>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-400">Posts:</span>
                  <span>{productData.engagement.whoop5.postCount}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-400">Comments:</span>
                  <span>{productData.engagement.whoop5.totalComments}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-400">Avg Score:</span>
                  <span>{productData.engagement.whoop5.avgScore}</span>
                </div>
              </div>
              
              <div className="bg-[#1a1c20] rounded-lg p-3">
                <h4 className="font-semibold mb-2 text-[#2ecc71]">WHOOP MG</h4>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-400">Posts:</span>
                  <span>{productData.engagement.whoopMG.postCount}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-400">Comments:</span>
                  <span>{productData.engagement.whoopMG.totalComments}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-400">Avg Score:</span>
                  <span>{productData.engagement.whoopMG.avgScore}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductComparison; 