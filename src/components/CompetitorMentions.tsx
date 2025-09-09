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

interface CompetitorMentionsProps {
    fromDate?: string;
    toDate?: string;
}

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Mapping for normalizing competitor names (grouping similar names)
const normalizeCompetitorName = (name: string): string | null => {
  // Normalize accents and convert to lowercase
  const normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  
  // Filter out WHOOP since it's not a competitor to itself
  if (normalizedName.includes('whoop')) return null;
  
  // Apple Watch variations
  if (normalizedName.includes('apple')) return 'Apple Watch';
  
  // Samsung Watch variations
  if (normalizedName.includes('samsung') || normalizedName.includes('galaxy')) return 'Samsung Watch';
  
  // Google Pixel Watch variations
  if (normalizedName.includes('google') || normalizedName.includes('pixel')) return 'Google Pixel Watch';
  
  // COROS variations
  if (normalizedName === 'coros' || name.toUpperCase() === 'COROS') return 'COROS';
  
  // Garmin variations
  if (normalizedName.includes('garmin')) return 'Garmin';
  
  // Fitbit variations
  if (normalizedName.includes('fitbit')) return 'Fitbit';
  
  // Oura variations
  if (normalizedName.includes('oura')) return 'Oura';
  
  // Suunto variations
  if (normalizedName.includes('suunto')) return 'Suunto';
  
  // Amazfit variations
  if (normalizedName.includes('amazfit') || normalizedName.includes('amazefit')) return 'Amazfit';
  
  // Withings variations
  if (normalizedName.includes('withings')) return 'Withings';
  
  // Polar variations
  if (normalizedName.includes('polar')) return 'Polar';
  
  // Eight Sleep variations
  if (normalizedName.includes('eight sleep')) return 'Eight Sleep';
  
  // KardiaMobile/AliveCor variations
  if (normalizedName.includes('kardia') || normalizedName.includes('alivecor')) return 'KardiaMobile';
  
  // QardioCore variations
  if (normalizedName.includes('qardio')) return 'QardioCore';
  
  // Pulse variations
  if (normalizedName === 'pulse') return 'Pulse';
  
  // sense.ai variations
  if (normalizedName.includes('sense.ai') || normalizedName.includes('sense ai')) return 'sense.ai';
  
  // Zyke variations
  if (normalizedName.includes('zyke')) return 'Zyke';
  
  // Orangetheory variations
  if (normalizedName.includes('orangetheory') || normalizedName.includes('orange theory')) return 'Orangetheory';
  
  // Helio Band variations (consolidated into Amazfit since Helio is an Amazfit product)
  if (normalizedName.includes('helio') || normalizedName.includes('helios')) return 'Amazfit';
  
  // Hilio variations (formerly Akttia)
  if (normalizedName.includes('hilio') || normalizedName.includes('akttia')) return 'Hilio';
  
  // Myzone variations
  if (normalizedName.includes('myzone')) return 'Myzone';
  
  return name;
};

// Mapping of competitor names to their display names (for cases where we want to show a different name)
const competitorDisplayNames: Record<string, string> = {
  'Hilio': 'Hilio',
  // Force the card/category that would appear as "Aktiia" to display as "Hilio"
  'Aktiia': 'Hilio',
  'aktiia': 'Hilio'
};

// Mapping of competitor names to their logo URLs
const competitorLogos: Record<string, string> = {
  'Apple Watch': '/logos/applelogo.png',
  'Samsung Watch': '/logos/samsung-logo-white.webp',
  'COROS': '/logos/coross.png',
  'Garmin': '/logos/garmin-logo-white-on-black148-1827219.png',
  'Oura': '/logos/oura_white.png',
  'Fitbit': '/logos/why-fitbit-symbol-png-logo-10.png',
  'Suunto': '/logos/suunto white.png',
  'Amazfit': '/logos/amazfit_white.png',
  'Withings': '/logos/logo_withings_white.png',
  'KardiaMobile': '/logos/alivecor(kardia).png',
  'Pulse': '/logos/pulse. logo.svg',
  'Eight Sleep': '/logos/Eight-Sleep.webp',
  'QardioCore': '/logos/qlogo.png',
  'Polar': '/logos/Polar-Logo.png',
  'Google Pixel Watch': '/logos/Google__G__logo.svg.webp',
  'Orangetheory': '/logos/Orangetheory-Fitness-Logo.png',
  'Hilio': '/logos/hilo.webp',
  'Myzone': '/logos/myzone.webp',
  'sense.ai': '',
  'Zyke': ''
};

// Default text logo component for competitors without an image
const DefaultTextLogo = ({ name }: { name: string }) => (
                    <div className="w-full h-full flex items-center justify-center text-white font-bold text-base">
                    {name}
                  </div>
);

export default function CompetitorMentions({ fromDate, toDate }: CompetitorMentionsProps) {
  const [competitors, setCompetitors] = useState<CompetitorSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompetitorData() {
      try {
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

          if (postIds.length === 0) {
            setCompetitors([]);
            setIsLoading(false);
            return;
          }
        }

        // Step 2: Fetch competitor mentions using postIds
        let mentionsData: any[] = [];
        const baseSelect = () => supabase
          .from('analysis_results')
          .select('competitor_mentions, content_id, content_type')
          .not('competitor_mentions', 'eq', '[]');

        if (postIds) {
          const batchSize = 500;
          for (let i = 0; i < postIds.length; i += batchSize) {
            const batchIds = postIds.slice(i, i + batchSize);
            const { data, error } = await baseSelect().in('content_id', batchIds);
            if (error) throw error;
            if (data) mentionsData.push(...data);
          }
        } else {
          const { data, error } = await baseSelect();
          if (error) throw error;
          mentionsData = data || [];
        }

        if (!mentionsData) throw new Error('No data returned');

        const competitorMap = new Map<string, CompetitorSummary>();

        mentionsData.forEach(row => {
          if (row.competitor_mentions && row.competitor_mentions.length > 0) {
            row.competitor_mentions.forEach((mention: CompetitorMention) => {
              const originalName = mention.competitor;
              if (!originalName) return;
              const normalizedName = normalizeCompetitorName(originalName);
              if (!normalizedName) return;
              const existingCompetitor = competitorMap.get(normalizedName);
              const sentiment = mention.comp_sentiment?.toLowerCase() || 'neutral';
              const quote: CompetitorQuote = {
                text: mention.comp_quote,
                sentiment: sentiment as 'positive' | 'neutral' | 'negative' | 'mixed',
                context: mention.comp_context,
                contentId: row.content_id,
                originalName: originalName
              };
              if (existingCompetitor) {
                existingCompetitor.name = competitorDisplayNames[normalizedName] || normalizedName;
                // Keep logo in sync with displayed name
                existingCompetitor.logo = competitorLogos[existingCompetitor.name] || competitorLogos[normalizedName] || existingCompetitor.logo;
                existingCompetitor.count += 1;
                if (sentiment === 'positive') existingCompetitor.sentiments.positive += 1;
                else if (sentiment === 'negative') existingCompetitor.sentiments.negative += 1;
                else if (sentiment === 'mixed') existingCompetitor.sentiments.mixed += 1;
                else existingCompetitor.sentiments.neutral += 1;
                existingCompetitor.quotes.push(quote);
                if (!existingCompetitor.originalNames.includes(originalName)) {
                  existingCompetitor.originalNames.push(originalName);
                }
              } else {
                const displayName = competitorDisplayNames[normalizedName] || normalizedName;
                const newCompetitor: CompetitorSummary = {
                  name: displayName,
                  count: 1,
                  sentiments: {
                    positive: sentiment === 'positive' ? 1 : 0,
                    negative: sentiment === 'negative' ? 1 : 0,
                    neutral: sentiment === 'neutral' ? 1 : 0,
                    mixed: sentiment === 'mixed' ? 1 : 0,
                  },
                  logo: competitorLogos[displayName] || competitorLogos[normalizedName] || '',
                  quotes: [quote],
                  isLoading: false,
                  originalNames: [originalName]
                };
                competitorMap.set(normalizedName, newCompetitor);
              }
            });
          }
        });

        const uniqueContentIds = new Set<string>();
        competitorMap.forEach(competitor => {
          competitor.quotes.forEach(quote => {
            if (quote.contentId) uniqueContentIds.add(quote.contentId);
          });
        });

        const postsData = new Map<string, { ups: number, num_comments: number, url?: string }>();
        if (uniqueContentIds.size > 0) {
          const contentIdsArray = Array.from(uniqueContentIds);
          const batchSize = 200;
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
        }

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
          competitor.quotes.sort((a, b) => (b.postUpvotes || 0) - (a.postUpvotes || 0));
        });

        const competitorArray = Array.from(competitorMap.values()).sort((a, b) => b.count - a.count);
        setCompetitors(competitorArray);
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
  }, [fromDate, toDate]);

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
        <div className="grid grid-cols-3 gap-2 max-h-[480px] overflow-y-auto pr-2">
          {competitors.map((competitor) => {
            // Determine if this logo needs larger size
            const needsLargerSize = ['Garmin', 'Samsung Watch', 'Amazfit', 'Pulse', 'Suunto', 'Withings', 'Google Pixel Watch', 'COROS', 'Polar'].includes(competitor.name);
            // Determine if this logo needs extra large size (50% larger than normal large)
            const needsExtraLargeSize = ['Polar', 'Amazfit', 'COROS', 'Withings'].includes(competitor.name);
            // Orangetheory at 75% larger than normal large
            const needsSeventyFivePercentLarger = ['Orangetheory'].includes(competitor.name);
            // Determine if this logo needs super large size (100% larger than normal large)
            const needsSuperLargeSize = ['QardioCore'].includes(competitor.name);
            // Determine if this logo needs to be in a circle
            const needsCircle = ['Oura', 'KardiaMobile', 'Eight Sleep'].includes(competitor.name);
            // Check if logo exists or should use default text
            const hasLogo = competitorLogos[competitor.name] !== undefined && competitorLogos[competitor.name] !== '';
            
            return (
              <div 
                key={competitor.name}
                className={`bg-[#2c2e33] rounded-lg p-2 transition-all duration-200 cursor-pointer ${
                  selectedCompetitor === competitor.name ? 'ring-2 ring-blue-500 bg-[#33363c]' : 'hover:bg-[#33363c]'
                } relative group h-20 flex items-center justify-center`}
                onClick={() => setSelectedCompetitor(competitor.name)}
              >
                <div className={`w-full h-full flex items-center justify-center overflow-hidden ${
                  needsCircle ? 'rounded-full' : ''
                }`}>
                  {competitor.logo ? (
                    <img 
                      src={competitor.logo} 
                      alt={`${competitor.name} logo`} 
                      className={`object-contain ${
                        needsSuperLargeSize ? 'w-32 h-32' :
                        needsSeventyFivePercentLarger ? 'w-28 h-28' :
                        needsExtraLargeSize ? 'w-24 h-24' : 
                        needsLargerSize ? 'w-16 h-16' : 'w-14 h-14'
                      }`}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        // If image fails to load, fallback to text logo
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = '';
                          parent.appendChild(
                            Object.assign(document.createElement('div'), {
                              className: 'w-full h-full flex items-center justify-center text-white font-bold text-base',
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
      <div className="md:w-1/2 bg-[#2c2e33] rounded-lg p-3">
        {selectedCompetitorData && (
          <>
            <div className="flex items-center space-x-3 mb-3 border-b border-gray-700 pb-2">
              <div className={`w-10 h-10 flex items-center justify-center overflow-hidden ${
                ['Oura', 'KardiaMobile', 'Eight Sleep'].includes(selectedCompetitorData.name) ? 'rounded-full' : ''
              }`}>
                {competitorLogos[selectedCompetitorData.name] ? (
                  <img 
                    src={selectedCompetitorData.logo} 
                    alt={`${selectedCompetitorData.name} logo`} 
                    className={`object-contain ${
                      ['QardioCore'].includes(selectedCompetitorData.name) 
                        ? 'w-18 h-18' :
                      ['Orangetheory'].includes(selectedCompetitorData.name)
                        ? 'w-16 h-16' :
                      ['Polar', 'Amazfit', 'COROS', 'Withings'].includes(selectedCompetitorData.name) 
                        ? 'w-14 h-14' :
                      ['Garmin', 'Samsung Watch', 'Pulse', 'Suunto', 'Google Pixel Watch'].includes(selectedCompetitorData.name) 
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

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {selectedCompetitorData.quotes.length > 0 ? (
                selectedCompetitorData.quotes.map((quote, index) => (
                  <a 
                    key={index} 
                    href={quote.postUrl || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block bg-[#24262b] rounded p-2 hover:bg-[#2c2e33] transition-colors"
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