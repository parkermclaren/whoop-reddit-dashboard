import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Define types for our data
type CompetitorMention = {
  competitor: string;
  comp_sentiment: string;
  comp_quote: string;
  comp_context: string;
};

type CompetitorQuote = {
  text: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  context: string;
  postUpvotes?: number;
  commentCount?: number;
  postUrl?: string;
  contentId: string;
  originalName: string; // Store the original competitor name before normalization
};

type CompetitorSummary = {
  name: string;
  count: number;
  sentiments: {
    positive: number;
    neutral: number;
    negative: number;
    mixed: number;
  };
  logo: string;
  quotes: CompetitorQuote[];
  isLoading?: boolean;
  originalNames: string[]; // Store all original names that were combined
};

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Mapping for normalizing competitor names (grouping similar names)
const normalizeCompetitorName = (name: string): string => {
  if (name.toLowerCase().includes('apple')) return 'Apple Watch';
  if (name.toLowerCase().includes('samsung')) return 'Samsung Watch';
  if (name.toLowerCase() === 'coros' || name.toUpperCase() === 'COROS') return 'COROS';
  return name;
};

// Mapping of competitor names to their logo URLs
const competitorLogos: Record<string, string> = {
  'Apple Watch': '/logos/applelogo.png',
  'Samsung Watch': '/logos/samsung-logo-white.webp',
  'COROS': '/logos/coros.png',
  'Garmin': '/logos/garmin-logo-white-on-black148-1827219.png',
  'Oura': '/logos/Oura-circle-logo.webp',
  'Fitbit': '/logos/why-fitbit-symbol-png-logo-10.png',
  'Suunto': '/logos/suunto white.png',
  'Amazfit': '/logos/amazfit-logo_brandlogos.net_8vpcc.png',
  'Withings': '/logos/Logo_withings_black.png',
  'KardiaMobile': '/logos/alivecor(kardia).png',
  'Pulse': '/logos/pulse. logo.svg',
  'Eight Sleep': '/logos/Eight-Sleep.webp',
  'Qardio': '/logos/qlogo.png',
  'Polar': '/logos/Polar-logo-300x125.png',
};

// Default text logo component for competitors without an image
const DefaultTextLogo = ({ name }: { name: string }) => (
  <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg">
    {name}
  </div>
);

export default function CompetitorMentions() {
  const [competitors, setCompetitors] = useState<CompetitorSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompetitorData() {
      try {
        // Query to get all competitor mentions
        const { data: mentionsData, error: mentionsError } = await supabase
          .from('analysis_results')
          .select('competitor_mentions, content_id, content_type')
          .not('competitor_mentions', 'eq', '[]');

        if (mentionsError) throw mentionsError;
        if (!mentionsData) throw new Error('No data returned');

        // Process the data to count mentions by competitor
        const competitorMap = new Map<string, CompetitorSummary>();

        mentionsData.forEach(row => {
          if (row.competitor_mentions && row.competitor_mentions.length > 0) {
            row.competitor_mentions.forEach((mention: CompetitorMention) => {
              const originalName = mention.competitor;
              if (!originalName) return;
              
              // Normalize the competitor name (combine related names)
              const normalizedName = normalizeCompetitorName(originalName);

              const existingCompetitor = competitorMap.get(normalizedName);
              const sentiment = mention.comp_sentiment?.toLowerCase() || 'neutral';

              // Create a quote object
              const quote: CompetitorQuote = {
                text: mention.comp_quote,
                sentiment: sentiment as 'positive' | 'neutral' | 'negative' | 'mixed',
                context: mention.comp_context,
                contentId: row.content_id,
                originalName: originalName
              };

              if (existingCompetitor) {
                existingCompetitor.count += 1;
                if (sentiment === 'positive') existingCompetitor.sentiments.positive += 1;
                else if (sentiment === 'negative') existingCompetitor.sentiments.negative += 1;
                else if (sentiment === 'mixed') existingCompetitor.sentiments.mixed += 1;
                else existingCompetitor.sentiments.neutral += 1;
                
                // Add the quote
                existingCompetitor.quotes.push(quote);
                
                // Add original name if it's not already in the list
                if (!existingCompetitor.originalNames.includes(originalName)) {
                  existingCompetitor.originalNames.push(originalName);
                }
              } else {
                const newCompetitor: CompetitorSummary = {
                  name: normalizedName,
                  count: 1,
                  sentiments: {
                    positive: sentiment === 'positive' ? 1 : 0,
                    negative: sentiment === 'negative' ? 1 : 0,
                    neutral: sentiment === 'neutral' ? 1 : 0,
                    mixed: sentiment === 'mixed' ? 1 : 0,
                  },
                  logo: competitorLogos[normalizedName] || '',
                  quotes: [quote],
                  isLoading: false,
                  originalNames: [originalName]
                };
                competitorMap.set(normalizedName, newCompetitor);
              }
            });
          }
        });

        // Now get post data to enrich quotes with upvotes and URLs
        const uniqueContentIds = new Set<string>();
        competitorMap.forEach(competitor => {
          competitor.quotes.forEach(quote => {
            if (quote.contentId) uniqueContentIds.add(quote.contentId);
          });
        });

        // Map to store content_id -> data
        const postsData = new Map<string, { ups: number, num_comments: number, url?: string }>();

        if (uniqueContentIds.size > 0) {
          try {
            // Fetch in small batches to avoid query size limits
            const batchSize = 5;
            const contentIdsArray = Array.from(uniqueContentIds);
            
            for (let i = 0; i < contentIdsArray.length; i += batchSize) {
              const batchIds = contentIdsArray.slice(i, i + batchSize);
              
              const { data: postsBatch, error: batchError } = await supabase
                .from('reddit_posts')
                .select('id, ups, num_comments, permalink')
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
                    url: post.permalink ? `https://reddit.com${post.permalink}` : undefined
                  });
                });
              }
            }
            
            // Update quotes with post data
            competitorMap.forEach(competitor => {
              competitor.quotes = competitor.quotes.map(quote => {
                const postData = postsData.get(quote.contentId);
                return {
                  ...quote,
                  postUpvotes: postData?.ups,
                  commentCount: postData?.num_comments,
                  postUrl: postData?.url
                };
              });
              
              // Sort quotes by upvotes
              competitor.quotes.sort((a, b) => (b.postUpvotes || 0) - (a.postUpvotes || 0));
            });
          } catch (err) {
            console.warn("Error fetching post data:", err);
          }
        }

        // Convert map to array and sort by count
        const competitorArray = Array.from(competitorMap.values())
          .sort((a, b) => b.count - a.count);

        setCompetitors(competitorArray);
        // Set the first competitor as selected by default
        if (competitorArray.length > 0 && !selectedCompetitor) {
          setSelectedCompetitor(competitorArray[0].name);
        }
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching competitor data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsLoading(false);
      }
    }

    fetchCompetitorData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 text-center p-4">
        Error loading competitor data: {error}
      </div>
    );
  }

  const selectedCompetitorData = selectedCompetitor 
    ? competitors.find(c => c.name === selectedCompetitor) 
    : competitors[0];

  return (
    <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-6">
      {/* Left side - Competitor Grid */}
      <div className="md:w-1/2">
        <div className="grid grid-cols-3 gap-3">
          {competitors.map((competitor) => {
            // Determine if this logo needs a white background
            const needsWhiteBackground = ['Amazfit', 'Withings', 'Polar', 'Qardio'].includes(competitor.name);
            // Determine if this logo needs larger size
            const needsLargerSize = ['Garmin', 'Samsung Watch', 'Amazfit', 'Pulse', 'Suunto', 'Withings'].includes(competitor.name);
            // Determine if this logo needs to be in a circle
            const needsCircle = ['Oura', 'KardiaMobile', 'Eight Sleep'].includes(competitor.name);
            // Check if logo exists or should use default text
            const hasLogo = competitorLogos[competitor.name] !== undefined;
            
            return (
              <div 
                key={competitor.name}
                className={`bg-[#2c2e33] rounded-lg p-3 transition-all duration-200 cursor-pointer ${
                  selectedCompetitor === competitor.name ? 'ring-2 ring-blue-500 bg-[#33363c]' : 'hover:bg-[#33363c]'
                } relative group h-24 flex items-center justify-center`}
                onClick={() => setSelectedCompetitor(competitor.name)}
              >
                <div className={`w-full h-full flex items-center justify-center overflow-hidden ${
                  needsWhiteBackground ? 'bg-white rounded-xl' : ''
                } ${needsCircle ? 'rounded-full' : ''}`}>
                  {hasLogo ? (
                    <img 
                      src={competitor.logo} 
                      alt={`${competitor.name} logo`} 
                      className={`object-contain ${needsLargerSize ? 'w-20 h-20' : 'w-16 h-16'}`}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        // If image fails to load, fallback to text logo
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = '';
                          parent.appendChild(
                            Object.assign(document.createElement('div'), {
                              className: 'w-full h-full flex items-center justify-center text-white font-bold text-lg',
                              textContent: competitor.name
                            })
                          );
                        }
                      }}
                    />
                  ) : (
                    <DefaultTextLogo name={competitor.name} />
                  )}
                </div>
                
                {/* Tooltip on hover */}
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[#33363c] bg-opacity-90 rounded-lg">
                  <p className="text-sm font-medium text-white mb-1" title={competitor.originalNames.join(', ')}>
                    {competitor.name}
                  </p>
                  <p className="text-xs text-gray-300">{competitor.count} mentions</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right side - Detail View */}
      <div className="md:w-1/2 bg-[#2c2e33] rounded-lg p-4">
        {selectedCompetitorData && (
          <>
            <div className="flex items-center space-x-3 mb-4 border-b border-gray-700 pb-3">
              <div className={`w-10 h-10 flex items-center justify-center overflow-hidden ${
                ['Amazfit', 'Withings', 'Polar', 'Qardio'].includes(selectedCompetitorData.name) ? 'bg-white rounded-full' : ''
              } ${['Oura', 'KardiaMobile', 'Eight Sleep'].includes(selectedCompetitorData.name) ? 'rounded-full' : ''}`}>
                {competitorLogos[selectedCompetitorData.name] ? (
                  <img 
                    src={selectedCompetitorData.logo} 
                    alt={`${selectedCompetitorData.name} logo`} 
                    className={`object-contain ${
                      ['Garmin', 'Samsung Watch', 'Amazfit', 'Pulse', 'Suunto', 'Withings'].includes(selectedCompetitorData.name) 
                        ? 'w-9 h-9' : 'w-8 h-8'
                    }`}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = '';
                        parent.appendChild(
                          Object.assign(document.createElement('div'), {
                            className: 'w-full h-full flex items-center justify-center text-white font-bold text-xs',
                            textContent: selectedCompetitorData.name
                          })
                        );
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs">
                    {selectedCompetitorData.name}
                  </div>
                )}
              </div>
              <div>
                <h2 className="font-medium text-lg text-white">{selectedCompetitorData.name}</h2>
                {selectedCompetitorData.originalNames.length > 1 && (
                  <p className="text-xs text-gray-500">
                    {selectedCompetitorData.originalNames.join(', ')}
                  </p>
                )}
                <p className="text-sm text-gray-400">{selectedCompetitorData.count} mentions</p>
              </div>
              <div className="ml-auto flex items-center space-x-3">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-[rgba(68,215,182,0.7)] mr-1"></div>
                  <span className="text-xs">{selectedCompetitorData.sentiments.positive}</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-[rgba(180,180,180,0.7)] mr-1"></div>
                  <span className="text-xs">{selectedCompetitorData.sentiments.neutral}</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-[rgba(245,108,108,0.7)] mr-1"></div>
                  <span className="text-xs">{selectedCompetitorData.sentiments.negative}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {selectedCompetitorData.quotes.length > 0 ? (
                selectedCompetitorData.quotes.map((quote, index) => (
                  <a 
                    key={index} 
                    href={quote.postUrl || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block bg-[#24262b] rounded p-3 hover:bg-[#2c2e33] transition-colors"
                  >
                    <div className="flex items-start">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 mr-2 ${
                        quote.sentiment === 'positive' ? 'bg-[rgba(68,215,182,0.7)]' : 
                        quote.sentiment === 'negative' ? 'bg-[rgba(245,108,108,0.7)]' : 
                        'bg-[rgba(180,180,180,0.7)]'
                      }`} />
                      <p className="text-sm text-gray-300 italic">{quote.text}</p>
                    </div>
                    {quote.context && (
                      <p className="mt-1 text-xs text-gray-500">{quote.context}</p>
                    )}
                    <div className="mt-2 flex justify-between items-center">
                      <span className="text-xs text-gray-400">
                        {quote.postUpvotes || 0} Post Upvotes
                      </span>
                      {quote.originalName !== selectedCompetitorData.name && (
                        <span className="text-xs text-blue-400">
                          Mentioned as: {quote.originalName}
                        </span>
                      )}
                    </div>
                  </a>
                ))
              ) : (
                <p className="text-sm text-gray-400 italic">No specific quotes found for this competitor.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
} 