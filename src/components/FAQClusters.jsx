import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { ChevronDownIcon, ChevronUpIcon, FireIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

// Temporary hardcoded data
const MOCK_CLUSTERS = [
  {
    id: '1',
    topic: '5.0 Upgrade Policies',
    question_count: 48,
    questions: [
      { 
        id: 'q1', 
        question: 'Is there any way to upgrade to the new WHOOP without paying a full year membership upfront?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example1' 
      },
      { 
        id: 'q2', 
        question: 'Why do I need to pay for an upgrade to the 5.0?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example2' 
      },
      { 
        id: 'q3', 
        question: 'Why do newer members get a better deal?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example3' 
      }
    ]
  },
  {
    id: '2',
    topic: 'Membership Cancellation and Management',
    question_count: 33,
    questions: [
      { 
        id: 'q4', 
        question: 'How do I cancel my membership?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example4' 
      },
      { 
        id: 'q5', 
        question: 'Will I get a refund if I cancel early?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example5' 
      }
    ]
  },
  {
    id: '3',
    topic: '5.0 Upgrade Considerations',
    question_count: 33,
    questions: [
      { 
        id: 'q6', 
        question: 'Is the 5.0 worth upgrading to from the 4.0?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example6' 
      },
      { 
        id: 'q7', 
        question: 'What new features does the 5.0 have?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example7' 
      }
    ]
  },
  {
    id: '4',
    topic: 'Subscription and Upgrade Options',
    question_count: 30,
    questions: [
      { 
        id: 'q8', 
        question: 'What are the different subscription plans?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example8' 
      },
      { 
        id: 'q9', 
        question: 'How much does it cost to upgrade?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example9' 
      }
    ]
  },
  {
    id: '5',
    topic: '5.0 Accessory Compatibility',
    question_count: 24,
    questions: [
      { 
        id: 'q10', 
        question: 'Are 4.0 bands compatible with 5.0?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example10' 
      },
      { 
        id: 'q11', 
        question: 'Do I need to buy new accessories for the 5.0?', 
        post_url: 'https://www.reddit.com/r/whoop/comments/example11' 
      }
    ]
  }
];

const FAQClusters = () => {
  const [faqClusters, setFAQClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCluster, setOpenCluster] = useState(null);
  const [error, setError] = useState(null);
  const [useRealData, setUseRealData] = useState(true);
  const [useEffectRanOnceForRealData, setUseEffectRanOnceForRealData] = useState(false);

  useEffect(() => {
    if (useRealData) {
      fetchClustersFromAPIRoute();
    } else {
      setTimeout(() => {
        setFAQClusters(MOCK_CLUSTERS.map(c => ({...c, questions: []})));
        setLoading(false);
      }, 500);
    }
  }, [useRealData]);

  const fetchClustersFromAPIRoute = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching clusters from API route (/api/faq-clusters)...');

      const response = await fetch('/api/faq-clusters');
      
      // Check if the response is OK
      if (!response.ok) {
        const errorText = await response.text(); // Use text() instead of json() for error responses
        throw new Error(
          `API request failed with status ${response.status}: ${errorText}`
        );
      }

      // Safely parse JSON
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('JSON parsing error:', jsonError);
        throw new Error(`Failed to parse API response: ${jsonError.message}`);
      }
      
      console.log('Data from API route:', data);

      if (!data.clusters || data.clusters.length === 0) {
        console.log('No clusters returned from API route');
        setFAQClusters([]);
      } else {
        setFAQClusters(data.clusters); 
      }
    } catch (error) {
      console.error('Error fetching clusters from API route:', error);
      setError(`Failed to fetch data via API: ${error.message}`);
      console.log('Falling back to mock data (API fetch failed)');
      setFAQClusters(MOCK_CLUSTERS.map(c => ({...c, questions: []})));
    } finally {
      setLoading(false);
    }
  };

  const fetchSimplifiedFAQClusters_NoSupabase = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Executing fetchSimplifiedFAQClusters_NoSupabase (NO actual Supabase call)...');

      await new Promise(resolve => setTimeout(resolve, 50)); 

      const hardcodedTestData = [
        { id: 'test1', topic: 'Test Cluster A (No Supabase)', question_count: 3, questions: [] },
        { id: 'test2', topic: 'Test Cluster B (No Supabase)', question_count: 2, questions: [] },
      ];
      
      console.log('Setting hardcoded test data (No Supabase):', hardcodedTestData);
      setFAQClusters(hardcodedTestData);

    } catch (error) {
      console.error('Error in fetchSimplifiedFAQClusters_NoSupabase:', error);
      setError(`Internal component error: ${error.message}`);
      setFAQClusters(MOCK_CLUSTERS.map(c => ({...c, questions: []})));
    } finally {
      setLoading(false);
    }
  };

  const fetchSimplifiedFAQClusters = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching SIMPLIFIED real question clusters (topics only)...');

      const { data: clusterData, error: clusterError } = await supabase
        .from('question_clusters')
        .select('id, topic, question_count')
        .order('question_count', { ascending: false })
        .limit(5);

      if (clusterError) {
        console.error('Error fetching simplified clusters:', clusterError);
        setError(`Failed to fetch clusters: ${clusterError.message}`);
        throw clusterError;
      }
      console.log('Simplified Cluster data (topics only):', clusterData);
      if (!clusterData || clusterData.length === 0) {
        console.log('No simplified clusters found');
        setFAQClusters([]);
      } else {
        setFAQClusters(clusterData.map(cluster => ({ ...cluster, questions: [] })));
      }
    } catch (error) {
      console.error('Error fetching simplified FAQ clusters:', error);
      setError(`Failed to fetch simplified FAQ data: ${error.message}`);
      console.log('Falling back to mock data (simplified)');
      setFAQClusters(MOCK_CLUSTERS.map(c => ({...c, questions: []})));
    } finally {
      setLoading(false);
    }
  };

  const fetchFullFAQClusters = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching real question clusters...');
      
      const { error: testError, count } = await supabase
        .from('question_clusters')
        .select('*', { count: 'exact', head: true });
      
      if (testError) {
        console.error('Error testing Supabase connection:', testError);
        setError(`Connection error: ${testError.message}`);
        throw testError;
      }
      console.log('Supabase connection test successful, count:', count);
      
      const { data: clusterData, error: clusterError } = await supabase
        .from('question_clusters')
        .select('id, topic, question_count')
        .order('question_count', { ascending: false })
        .limit(5);
      
      if (clusterError) {
        console.error('Error fetching clusters:', clusterError);
        setError(`Failed to fetch clusters: ${clusterError.message}`);
        throw clusterError;
      }
      console.log('Cluster data:', clusterData);
      
      if (!clusterData || clusterData.length === 0) {
        console.log('No clusters found');
        setFAQClusters([]);
        setLoading(false);
        return;
      }
      
      const clustersWithQuestions = await Promise.all(
        clusterData.map(async (cluster) => {
          console.log(`Fetching questions for cluster: ${cluster.id}`);
          try {
            const { data: questionData, error: questionError } = await supabase
              .from('question_embeddings')
              .select('id, question, post_url')
              .eq('cluster_id', cluster.id)
              .limit(5);
            if (questionError) {
              console.error(`Error fetching questions for cluster ${cluster.id}:`, questionError);
              return { ...cluster, questions: [], questionError: questionError.message };
            }
            console.log(`Found ${questionData?.length || 0} questions for cluster ${cluster.id}`);
            return { ...cluster, questions: questionData || [] };
          } catch (err) {
            console.error(`Unexpected error fetching questions for cluster ${cluster.id}:`, err);
            return { ...cluster, questions: [], questionError: err.message };
          }
        })
      );
      console.log('Clusters with questions:', clustersWithQuestions);
      setFAQClusters(clustersWithQuestions);
    } catch (error) {
      console.error('Error fetching FAQ clusters:', error);
      setError(`Failed to fetch FAQ data: ${error.message}`);
      console.log('Falling back to mock data');
      setFAQClusters(MOCK_CLUSTERS);
    } finally {
      setLoading(false);
    }
  };

  const toggleCluster = async (clusterId) => {
    if (openCluster === clusterId) {
      // If it's already open, just close it
      setOpenCluster(null);
      return;
    }
    
    // Open the cluster
    setOpenCluster(clusterId);
    
    // If using real data and we haven't loaded questions for this cluster yet
    if (useRealData) {
      const cluster = faqClusters.find(c => c.id === clusterId);
      
      // Only fetch questions if this cluster doesn't have any yet
      if (cluster && (!cluster.questions || cluster.questions.length === 0)) {
        try {
          console.log(`Fetching questions for cluster: ${clusterId}`);
          
          // Show loading state for this specific cluster
          setFAQClusters(prev => 
            prev.map(c => 
              c.id === clusterId 
                ? { ...c, isLoadingQuestions: true } 
                : c
            )
          );
          
          // Fetch questions for this cluster from our API endpoint
          const response = await fetch(`/api/faq-clusters/${clusterId}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch questions: ${errorText}`);
          }
          
          const data = await response.json();
          
          // Update this cluster with the fetched questions
          setFAQClusters(prev => 
            prev.map(c => 
              c.id === clusterId 
                ? { 
                    ...c, 
                    questions: data.questions || [],
                    isLoadingQuestions: false
                  } 
                : c
            )
          );
          
        } catch (error) {
          console.error(`Error fetching questions for cluster ${clusterId}:`, error);
          
          // Set error state for this specific cluster
          setFAQClusters(prev => 
            prev.map(c => 
              c.id === clusterId 
                ? { 
                    ...c, 
                    questionError: error.message,
                    isLoadingQuestions: false
                  } 
                : c
            )
          );
        }
      }
    }
  };

  const toggleDataSource = () => {
    setUseRealData(!useRealData);
  };

  useEffect(() => {
    if(useRealData && fetchClustersFromAPIRoute.name === 'fetchClustersFromAPIRoute') {
      setUseEffectRanOnceForRealData(true);
    } else if (useRealData && fetchSimplifiedFAQClusters_NoSupabase.name === 'fetchSimplifiedFAQClusters_NoSupabase') {
      setUseEffectRanOnceForRealData(false); 
    } else {
      setUseEffectRanOnceForRealData(false);
    }
  }, [useRealData]);

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
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Top FAQ Clusters</h3>
            <button
              onClick={toggleDataSource}
              className="px-3 py-1.5 text-xs bg-[#3D3F46] rounded-md text-gray-300"
            >
              {useRealData ? 
                (useEffectRanOnceForRealData ? 'Using Real Data (API Route)' : 'Using Real Data (No Supabase Call Test)') : 
                'Using Mock Data'}
            </button>
          </div>
          
          {error && (
            <div className="text-red-400 text-center p-4 mb-4 bg-[#1a1c20] rounded-lg">
              Error: {error}
            </div>
          )}
          
          {faqClusters.length === 0 ? (
            <div className="text-gray-400 text-center p-6">No FAQ clusters found</div>
          ) : (
            <div className="space-y-3">
              {faqClusters.map((cluster) => (
                <div key={cluster.id} className="bg-[#1a1c20] rounded-lg overflow-hidden">
                  <button
                    className="w-full px-4 py-3 flex justify-between items-center hover:bg-opacity-80 transition-colors"
                    onClick={() => toggleCluster(cluster.id)}
                  >
                    <div className="flex items-center">
                      <div className="text-left">
                        <h4 className="font-medium text-white">{cluster.topic}</h4>
                        <p className="text-xs text-gray-400">{cluster.question_count} related questions</p>
                      </div>
                    </div>
                    <div className="text-gray-400">
                      {openCluster === cluster.id ? (
                        <ChevronUpIcon className="h-5 w-5" />
                      ) : (
                        <ChevronDownIcon className="h-5 w-5" />
                      )}
                    </div>
                  </button>
                  
                  {openCluster === cluster.id && (
                    <div className="px-4 pb-3 space-y-2">
                      {cluster.isLoadingQuestions && (
                        <div className="flex justify-center p-4">
                          <div className="w-24 h-1 bg-[#1a1c20] rounded-full overflow-hidden">
                            <div className="animate-pulse h-full w-1/2 bg-[#44d7b6] rounded-full"></div>
                          </div>
                        </div>
                      )}
                      {cluster.questionError && (
                        <p className="text-sm text-orange-400 p-2">Error loading questions: {cluster.questionError}</p>
                      )}
                      {(!cluster.questions || cluster.questions.length === 0) && !cluster.questionError && !cluster.isLoadingQuestions && (
                         <p className="text-sm text-gray-400 p-2">Questions not loaded for this cluster yet.</p>
                      )}
                      {cluster.questions && cluster.questions.length > 0 && 
                        cluster.questions.map((question) => (
                          <a
                            key={question.id}
                            href={question.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block p-2 text-sm rounded-md hover:bg-[#2a2c32] transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start flex-grow mr-2">
                                <div className="w-1 h-1 rounded-full bg-[#44d7b6] mt-2 mr-2"></div>
                                <span>{question.question}</span>
                              </div>
                              
                              <div className="flex flex-shrink-0 items-center gap-2">
                                {question.isHighestUpvoted && (
                                  <div className="flex items-center text-xs text-orange-400">
                                    <FireIcon className="h-3.5 w-3.5 mr-1" />
                                    <span>Most upvoted</span>
                                  </div>
                                )}
                                {question.isMostCommented && (
                                  <div className="flex items-center text-xs text-blue-400">
                                    <ChatBubbleLeftRightIcon className="h-3.5 w-3.5 mr-1" />
                                    <span>Most discussed</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </a>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FAQClusters; 