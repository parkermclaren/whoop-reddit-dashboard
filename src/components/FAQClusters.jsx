import React, { useState, useEffect } from 'react';
import { ChevronDownIcon, ChevronUpIcon, FireIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

const FAQClusters = () => {
  const [faqClusters, setFAQClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openCluster, setOpenCluster] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchClustersFromAPIRoute();
  }, []);

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
  };

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
          <div className="mb-4">
            <h3 className="text-lg font-medium">Top FAQ Clusters</h3>
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