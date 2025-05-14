import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import https from 'https';
import { exit } from 'process';

// Load environment variables from different possible locations
try {
  console.log("Loading environment variables...");
  // Try .env.local first
  dotenv.config({ path: '.env.local' });
  
  // Check if key variables exist, if not try .env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log("Required environment variables not found in .env.local, trying .env...");
    dotenv.config({ path: '.env' });
  }
  
  // Final check to ensure we have what we need
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not defined in environment variables");
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_SERVICE_KEY is not defined in environment variables");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not defined in environment variables");
  }
  
  console.log("Environment variables loaded successfully");
  console.log(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? "✅ Set" : "❌ Not Set"}`);
  console.log(`Service Key: ${process.env.SUPABASE_SERVICE_KEY ? "✅ Set" : "❌ Not Set"}`);
} catch (error) {
  console.error("Error loading environment variables:", error);
  exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Explicitly print connection details (redacted)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
console.log(`Connecting to Supabase at: ${supabaseUrl}`);
console.log(`Using service key ending with: ...${supabaseServiceKey.substring(supabaseServiceKey.length - 4)}`);

// Create Supabase client with longer timeout
const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (url, options = {}) => {
        // Increase timeout for all fetch requests
        return fetch(url, {
          ...options,
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });
      }
    }
  }
);

// Verify connection to Supabase before proceeding
async function verifySupabaseConnection() {
  console.log("Verifying connection to Supabase...");
  try {
    // Try a simple query to verify connection
    const { data, error } = await supabase.from('reddit_posts').select('id').limit(1);
    
    if (error) {
      console.error("Error connecting to Supabase:", error);
      throw error;
    }
    
    console.log("Successfully connected to Supabase!");
    return true;
  } catch (error) {
    console.error("Failed to connect to Supabase:", error);
    
    // Try diagnostics
    try {
      const pingResult = await fetch(supabaseUrl).then(r => r.ok);
      console.log(`Ping to Supabase URL: ${pingResult ? "Success" : "Failed"}`);
    } catch (pingError) {
      console.error("Cannot even ping Supabase URL:", pingError);
    }
    
    return false;
  }
}

// Maximum number of questions to process at once for OpenAI API
const EMBEDDING_BATCH_SIZE = 100;

// The similarity threshold for considering questions to be in the same cluster
const SIMILARITY_THRESHOLD = 0.95; // Base threshold for clustering

// Higher threshold for large clusters to ensure finer separation
const LARGE_CLUSTER_THRESHOLD = 0.97;

// Size threshold that determines when to use the higher similarity threshold
const LARGE_CLUSTER_SIZE = 20;

// How many clusters to create overall (approximate)
const TARGET_CLUSTER_COUNT = 25;

// Minimum cluster size for it to be considered a real cluster
const MIN_CLUSTER_SIZE = 2;

// Maximum cluster size to prevent giant clusters
const MAX_CLUSTER_SIZE = 40;

// Cache file for embeddings to avoid regenerating
const EMBEDDINGS_CACHE_FILE = path.join(process.cwd(), 'tmp', 'embeddings-cache.json');

/**
 * Check if network connectivity is available
 */
async function checkNetworkConnectivity(): Promise<boolean> {
  return new Promise(resolve => {
    const testEndpoint = 'https://www.google.com';
    const req = https.get(testEndpoint, res => {
      res.on('data', () => {});
      res.on('end', () => {
        resolve(true);
      });
    });
    
    req.on('error', () => {
      console.error('Network connectivity check failed');
      resolve(false);
    });
    
    // Set a timeout
    req.setTimeout(5000, () => {
      req.destroy();
      console.error('Network connectivity check timeout');
      resolve(false);
    });
  });
}

/**
 * Wait for network connectivity with increasing backoff
 */
async function waitForNetwork(attempt = 1, maxAttempts = 5): Promise<boolean> {
  const isConnected = await checkNetworkConnectivity();
  
  if (isConnected) {
    if (attempt > 1) {
      console.log('✅ Network connectivity restored');
    }
    return true;
  }
  
  if (attempt >= maxAttempts) {
    console.error(`Failed to establish network connectivity after ${maxAttempts} attempts`);
    return false;
  }
  
  const delay = 10000 * Math.pow(2, attempt - 1); // Start with 10 seconds, then 20, 40, etc.
  console.log(`No network connectivity. Waiting ${delay/1000} seconds before retry...`);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  return waitForNetwork(attempt + 1, maxAttempts);
}

/**
 * Retry wrapper for Supabase calls
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 3
): Promise<T> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`${operationName} - attempt ${attempt}/${maxRetries}...`);
      }
      
      // Check for network connectivity before attempting
      if (attempt > 1) {
        console.log("Checking network connectivity...");
        const hasNetwork = await waitForNetwork();
        if (!hasNetwork) {
          console.error("Network connectivity issues persist. Will try operation anyway...");
        }
      }
      
      // Add a small delay between attempts to allow network to recover
      if (attempt > 1) {
        const initialDelay = 1000; // 1 second
        await new Promise(resolve => setTimeout(resolve, initialDelay));
      }
      
      const result = await operation();
      return result;
    } catch (err) {
      lastError = err;
      console.error(`${operationName} - attempt ${attempt} failed:`, err);
      
      if (attempt < maxRetries) {
        // Exponential backoff with longer delays for network issues
        // Start with a 5 second delay and increase exponentially
        const delay = 5000 * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Extract all questions from analysis results
 */
async function getAllQuestions(): Promise<{question: string, id: string, post_id: string, post_title: string, post_url: string}[]> {
  console.log("Fetching all questions from analysis_results...");
  
  // Add a small delay to ensure connection is ready
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // First get analysis results
  let data, error;
  try {
    console.log("Querying analysis_results table...");
    
    // Try with direct fetch first for better error handling
    try {
      // Use raw SQL query with direct fetch for better diagnostics
      const endpoint = `${supabaseUrl}/rest/v1/analysis_results?select=id,content_id,user_questions`;
      console.log(`Making direct fetch to: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`Direct fetch failed with status: ${response.status} ${response.statusText}`);
      }
      
      data = await response.json();
      console.log(`Direct fetch successful: received ${data?.length || 0} records`);
    } catch (directFetchError) {
      console.error("Direct fetch failed:", directFetchError);
      console.log("Falling back to Supabase client...");
      
      // Fall back to Supabase client
      const result = await supabase
        .from('analysis_results')
        .select('id, content_id, user_questions');
        
      data = result.data;
      error = result.error;
      
      if (error) {
        throw new Error(`Supabase client fetch failed: ${error.message}`);
      }
    }
  } catch (err) {
    console.error("Fatal error fetching analysis results:", err);
    throw new Error(`Cannot continue without analysis results: ${err}`);
  }
  
  if (error || !data) {
    console.error("Error fetching questions:", error);
    throw new Error("No data returned from analysis_results query");
  }

  // Filter for records with questions
  const filteredData = data.filter((record: any) => 
    record.user_questions && 
    Array.isArray(record.user_questions) && 
    record.user_questions.length > 0
  );
  
  console.log(`Found ${filteredData.length} records with questions`);
  
  // Get all the post IDs
  const postIds = [...new Set(filteredData.map((r: any) => r.content_id as string))];
  console.log(`Found ${postIds.length} unique post IDs`);
  
  // Fetch post details with retry logic and longer initial delay
  let postsData = null;
  let postsError = null;
  const maxRetries = 5; // Increased from 3 to 5
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetching post details (attempt ${attempt}/${maxRetries})...`);
      
      // Add increasing delay before each attempt
      const initialDelay = 3000 * attempt; // Start with 3 seconds, then 6, 9, etc.
      await new Promise(resolve => setTimeout(resolve, initialDelay));
      
      // Try with direct fetch for better error handling on the first few attempts
      if (attempt <= 3) {
        try {
          // Use chunks of post IDs to avoid URL length limits
          const chunkSize = 50;
          const chunks = [];
          for (let i = 0; i < postIds.length; i += chunkSize) {
            chunks.push(postIds.slice(i, i + chunkSize));
          }
          
          let allResults: any[] = [];
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`Processing chunk ${i+1}/${chunks.length} (${chunk.length} post IDs)...`);
            
            // Create in filter query
            const filter = `id.in.(${chunk.map(id => `"${String(id)}"`).join(',')})`;
            const endpoint = `${supabaseUrl}/rest/v1/reddit_posts?select=id,title,url&${encodeURIComponent(filter)}`;
            console.log(`Making direct fetch to: ${endpoint.substring(0, 100)}...`);
            
            const response = await fetch(endpoint, {
              method: 'GET',
              headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              },
              signal: AbortSignal.timeout(30000) // 30 second timeout
            });
            
            if (!response.ok) {
              throw new Error(`Direct fetch failed with status: ${response.status} ${response.statusText}`);
            }
            
            const chunkResults = await response.json();
            console.log(`Received ${chunkResults?.length || 0} records for chunk ${i+1}`);
            allResults = allResults.concat(chunkResults || []);
            
            // Small delay between chunks
            if (i < chunks.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          postsData = allResults;
          console.log(`Successfully fetched ${postsData?.length || 0} post details via direct fetch`);
          break; // Success, exit retry loop
          
        } catch (directFetchError) {
          console.error(`Direct fetch attempt ${attempt} failed:`, directFetchError);
          console.log("Will try Supabase client next...");
        }
      }
      
      // Fall back to Supabase client as last resort
      console.log("Using Supabase client to fetch post details...");
      const response = await supabase
        .from('reddit_posts')
        .select('id, title, url') // Changed from permalink to url
        .in('id', postIds.slice(0, 1000)); // Limit to first 1000 to avoid issues
      
      postsData = response.data;
      postsError = response.error;
      
      if (!postsError) {
        console.log(`Successfully fetched ${postsData?.length || 0} post details`);
        break; // Success, exit retry loop
      }
      
      console.error(`Attempt ${attempt} failed:`, postsError);
      
      if (attempt < maxRetries) {
        // Exponential backoff - wait longer between each retry
        const delay = 5000 * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (err) {
      console.error(`Unexpected error on attempt ${attempt}:`, err);
      postsError = err;
      
      if (attempt < maxRetries) {
        const delay = 5000 * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we still have errors after all retries, handle gracefully
  if (postsError || !postsData || postsData.length === 0) {
    console.error("Error fetching post details after multiple attempts:", postsError);
    console.log("Constructing URLs from post IDs to ensure UI linking works");
    
    // Create post details with constructed URLs
    postsData = postIds.map(id => ({ 
      id: id as string, 
      title: `Post ${(id as string).substring(0, 8)}...`, 
      // Construct a proper Reddit URL from the ID
      url: `https://www.reddit.com/comments/${id as string}`
    }));
  }
  
  // Create a map of post details for quick lookup
  const postDetailsMap = new Map();
  postsData.forEach(post => {
    postDetailsMap.set(post.id, {
      title: post.title || '',
      url: post.url || '' // Changed from permalink to url
    });
  });
  
  // Extract and flatten all questions with their source IDs
  const allQuestions: {question: string, id: string, post_id: string, post_title: string, post_url: string}[] = [];
  
  for (const result of filteredData) {
    const postDetails = postDetailsMap.get(result.content_id) || { title: '', url: '' };
    
    const questionsWithSource = result.user_questions.map((q: string) => ({
      question: q,
      id: result.id,
      post_id: result.content_id,
      post_title: postDetails.title,
      post_url: postDetails.url // Changed from permalink to url
    }));
    
    allQuestions.push(...questionsWithSource);
  }
  
  // Remove duplicate questions (keeping the first occurrence)
  const uniqueQuestions = allQuestions.filter((question, index, self) => 
    index === self.findIndex(q => q.question === question.question)
  );
  
  console.log(`Found ${uniqueQuestions.length} unique questions (from ${allQuestions.length} total)`);
  return uniqueQuestions;
}

/**
 * Generate embeddings for a batch of questions
 */
async function generateEmbeddings(questions: string[]): Promise<number[][]> {
  console.log(`Generating embeddings for ${questions.length} questions...`);
  
  // Try to load from cache first
  let embeddingsCache: Record<string, number[]> = {};
  try {
    const cacheDir = path.dirname(EMBEDDINGS_CACHE_FILE);
    await fs.mkdir(cacheDir, { recursive: true });
    const cacheData = await fs.readFile(EMBEDDINGS_CACHE_FILE, 'utf-8');
    embeddingsCache = JSON.parse(cacheData);
    console.log(`Loaded ${Object.keys(embeddingsCache).length} cached embeddings`);
  } catch (err) {
    console.log("No cache found or error loading cache, will generate all embeddings");
  }
  
  const results: number[][] = [];
  const uncachedQuestions: string[] = [];
  const uncachedIndices: number[] = [];
  
  // Check which questions are not in cache
  questions.forEach((question, index) => {
    if (embeddingsCache[question]) {
      results[index] = embeddingsCache[question];
    } else {
      uncachedQuestions.push(question);
      uncachedIndices.push(index);
    }
  });
  
  if (uncachedQuestions.length === 0) {
    console.log("All embeddings found in cache!");
    return results;
  }
  
  console.log(`Generating ${uncachedQuestions.length} new embeddings...`);
  
  // Process uncached questions in batches
  for (let i = 0; i < uncachedQuestions.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = uncachedQuestions.slice(i, i + EMBEDDING_BATCH_SIZE);
    
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: batch
      });
      
      // Store embeddings in results array and cache
      response.data.forEach((item, batchIndex) => {
        const originalIndex = uncachedIndices[i + batchIndex];
        const question = questions[originalIndex];
        
        results[originalIndex] = item.embedding;
        embeddingsCache[question] = item.embedding;
      });
      
      console.log(`Processed batch ${i/EMBEDDING_BATCH_SIZE + 1}/${Math.ceil(uncachedQuestions.length/EMBEDDING_BATCH_SIZE)}`);
    } catch (error) {
      console.error(`Error generating embeddings for batch ${i/EMBEDDING_BATCH_SIZE + 1}:`, error);
    }
  }
  
  // Save updated cache
  try {
    await fs.writeFile(EMBEDDINGS_CACHE_FILE, JSON.stringify(embeddingsCache), 'utf-8');
    console.log("Embeddings cache updated");
  } catch (err) {
    console.error("Error saving embeddings cache:", err);
  }
  
  return results;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return -1;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Cluster embeddings using a modified DBSCAN approach
 */
function clusterEmbeddings(
  questions: string[], 
  embeddings: number[][], 
  targetClusterCount: number
): { clusters: Map<number, string[]>, centroids: Map<number, number[]> } {
  if (questions.length === 0) {
    return { clusters: new Map(), centroids: new Map() };
  }
  
  console.log(`Clustering ${questions.length} questions using modified DBSCAN and semantic similarity...`);
  
  // Calculate similarity matrix
  console.log("Calculating similarity matrix...");
  const similarityMatrix: number[][] = [];
  for (let i = 0; i < embeddings.length; i++) {
    similarityMatrix[i] = [];
    for (let j = 0; j < embeddings.length; j++) {
      if (i === j) {
        similarityMatrix[i][j] = 1.0; // Self-similarity
      } else if (j < i) {
        // Reuse already calculated value
        similarityMatrix[i][j] = similarityMatrix[j][i];
      } else {
        similarityMatrix[i][j] = cosineSimilarity(embeddings[i], embeddings[j]);
      }
    }
  }
  
  // Modified DBSCAN with size control
  function modified_dbscan(
    similarityMatrix: number[][], 
    minSimilarity: number, 
    minPts: number,
    maxClusterSize: number
  ): number[] {
    const n = similarityMatrix.length;
    const visited = new Array(n).fill(false);
    const processed = new Array(n).fill(false);
    const labels = new Array(n).fill(-1); // -1 means noise
    let clusterId = 0;
    
    // Sort points by their connectivity (sum of similarities) - process most connected first
    const connectivity: {index: number, score: number}[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let connectionCount = 0;
      for (let j = 0; j < n; j++) {
        if (i !== j && similarityMatrix[i][j] >= minSimilarity) {
          sum += similarityMatrix[i][j];
          connectionCount++;
        }
      }
      connectivity.push({
        index: i,
        score: connectionCount > 0 ? sum / connectionCount : 0 // Average similarity
      });
    }
    
    // Sort by connectivity score (descending)
    connectivity.sort((a, b) => b.score - a.score);
    
    // Find neighbors of a point
    const getNeighbors = (pointId: number): number[] => {
      const neighbors: number[] = [];
      for (let i = 0; i < n; i++) {
        if (!processed[i] && similarityMatrix[pointId][i] >= minSimilarity) {
          neighbors.push(i);
        }
      }
      return neighbors;
    };
    
    // Expand cluster with size limit and adaptive threshold
    const expandCluster = (pointId: number, neighbors: number[], clusterId: number) => {
      let clusterSize = 1; // Include the seed point
      processed[pointId] = true;
      labels[pointId] = clusterId;
      
      // Keep track of cluster members for adaptive threshold
      const clusterMembers = [pointId];
      
      const queue = [...neighbors];
      while (queue.length > 0 && clusterSize < maxClusterSize) {
        const current = queue.shift()!;
        
        if (processed[current]) continue;
        
        // Apply adaptive threshold for growing clusters
        // As the cluster gets larger, we become more strict about what can join
        let currentThreshold = minSimilarity;
        if (clusterSize >= LARGE_CLUSTER_SIZE) {
          currentThreshold = Math.max(minSimilarity, LARGE_CLUSTER_THRESHOLD);
        }
        
        // Check if the point should be added to the cluster
        let shouldAdd = false;
        let avgSimilarity = 0;
        
        // Calculate average similarity to existing cluster members
        for (const member of clusterMembers) {
          avgSimilarity += similarityMatrix[current][member];
        }
        avgSimilarity /= clusterMembers.length;
        
        // Add if average similarity is above threshold
        if (avgSimilarity >= currentThreshold) {
          shouldAdd = true;
        }
        
        if (shouldAdd) {
          processed[current] = true;
          labels[current] = clusterId;
          clusterSize++;
          clusterMembers.push(current);
          
          if (clusterSize >= maxClusterSize) break;
          
          const currentNeighbors = getNeighbors(current);
          if (currentNeighbors.length >= minPts) {
            for (const neighbor of currentNeighbors) {
              if (!processed[neighbor] && !queue.includes(neighbor)) {
                queue.push(neighbor);
              }
            }
          }
        } else {
          // Skip this point, but don't mark as processed yet
          continue;
        }
      }
      
      return clusterSize;
    };
    
    // Process points in order of connectivity
    for (const {index} of connectivity) {
      if (processed[index]) continue;
      
      visited[index] = true;
      const neighbors = getNeighbors(index);
      
      if (neighbors.length < minPts) {
        // Mark as noise initially
        continue;
      } else {
        const size = expandCluster(index, neighbors, clusterId);
        console.log(`Created cluster ${clusterId} with ${size} items`);
        clusterId++;
      }
    }
    
    // Handle remaining unprocessed points
    for (let i = 0; i < n; i++) {
      if (!processed[i]) {
        // Find the most similar existing cluster
        let bestCluster = -1;
        let bestSim = minSimilarity * 0.9; // Slightly lower threshold
        
        for (let j = 0; j < n; j++) {
          if (labels[j] !== -1 && similarityMatrix[i][j] > bestSim) {
            bestSim = similarityMatrix[i][j];
            bestCluster = labels[j];
          }
        }
        
        if (bestCluster !== -1) {
          labels[i] = bestCluster;
        } else {
          // Create a singleton cluster if nothing fits
          labels[i] = clusterId++;
        }
      }
    }
    
    return labels;
  }
  
  // Try different parameter combinations to get a good clustering
  const similarityOptions = [0.97, 0.96, 0.95, 0.94, 0.93, 0.92];
  const minPtsOptions = [3, 2, 4];
  const maxClusterSizeOptions = [MAX_CLUSTER_SIZE, MAX_CLUSTER_SIZE * 0.75, MAX_CLUSTER_SIZE * 1.25];
  
  let bestLabels: number[] = [];
  let bestClusterCount = 0;
  let bestDistribution = 0;
  
  // Try to find optimal parameters
  for (const similarity of similarityOptions) {
    for (const minPts of minPtsOptions) {
      for (const maxSize of maxClusterSizeOptions) {
        console.log(`Trying similarity=${similarity}, minPts=${minPts}, maxSize=${maxSize}...`);
        
        const labels = modified_dbscan(similarityMatrix, similarity, minPts, maxSize);
        
        // Calculate cluster sizes
        const clusterSizes = new Map<number, number>();
        for (const label of labels) {
          if (label !== -1) {
            clusterSizes.set(label, (clusterSizes.get(label) || 0) + 1);
          }
        }
        
        const clusterCount = clusterSizes.size;
        
        // Calculate a distribution score - we want more clusters with a good distribution of sizes
        // Avoid too many tiny clusters or a few huge clusters
        let distributionScore = 0;
        let smallClusters = 0;
        let mediumClusters = 0;
        let largeClusters = 0;
        
        for (const size of clusterSizes.values()) {
          if (size === 1) smallClusters++;
          else if (size <= 10) mediumClusters++;
          else largeClusters++;
        }
        
        // Prefer a mix of medium and large clusters, with fewer singletons
        distributionScore = mediumClusters * 3 + largeClusters * 2 - smallClusters * 0.5;
        
        console.log(`  Results: ${clusterCount} clusters, distribution score: ${distributionScore}`);
        console.log(`  Small: ${smallClusters}, Medium: ${mediumClusters}, Large: ${largeClusters}`);
        
        // Choose parameters that give cluster count close to target and good distribution
        const targetCloseness = Math.abs(clusterCount - targetClusterCount);
        const currentBestCloseness = Math.abs(bestClusterCount - targetClusterCount);
        
        if (
          // If we don't have any results yet
          bestLabels.length === 0 ||
          // Or if this has a better distribution with reasonable count
          (distributionScore > bestDistribution && targetCloseness <= currentBestCloseness * 1.5) ||
          // Or if this is much closer to target with decent distribution
          (targetCloseness < currentBestCloseness * 0.7 && distributionScore >= bestDistribution * 0.7)
        ) {
          bestLabels = labels;
          bestClusterCount = clusterCount;
          bestDistribution = distributionScore;
          
          console.log(`  👉 New best parameters found`);
          
          // If we have a good enough result, break early
          if (
            targetCloseness <= 5 && 
            distributionScore >= 10 && 
            smallClusters < clusterCount * 0.3
          ) {
            console.log("Found good parameters, stopping search");
            break;
          }
        }
      }
    }
  }
  
  console.log(`Selected clustering with ${bestClusterCount} clusters`);
  
  // Create clusters from labels
  const clusters = new Map<number, string[]>();
  const centroids = new Map<number, number[]>();
  
  // Initialize clusters
  for (let i = 0; i < bestLabels.length; i++) {
    const label = bestLabels[i];
    
    if (!clusters.has(label)) {
      clusters.set(label, []);
    }
    clusters.get(label)!.push(questions[i]);
  }
  
  // Calculate centroids
  for (const [clusterId, clusterQuestions] of clusters.entries()) {
    const centroid = Array(embeddings[0].length).fill(0);
    for (const q of clusterQuestions) {
      const qIndex = questions.indexOf(q);
      const qEmbedding = embeddings[qIndex];
      
      for (let i = 0; i < centroid.length; i++) {
        centroid[i] += qEmbedding[i] / clusterQuestions.length;
      }
    }
    centroids.set(clusterId, centroid);
  }
  
  console.log(`Final cluster count: ${clusters.size}`);
  
  // Print cluster size distribution
  const sizes = Array.from(clusters.values()).map(c => c.length);
  sizes.sort((a, b) => b - a);
  
  console.log("Cluster size distribution:");
  console.log(`Largest cluster: ${sizes[0]} questions`);
  console.log(`Smallest cluster: ${sizes[sizes.length - 1]} questions`);
  console.log(`Average cluster size: ${sizes.reduce((a, b) => a + b, 0) / sizes.length}`);
  
  const sizeGroups = {
    "1": 0,
    "2-5": 0,
    "6-10": 0,
    "11-20": 0,
    "21-50": 0,
    "50+": 0
  };
  
  for (const size of sizes) {
    if (size === 1) sizeGroups["1"]++;
    else if (size <= 5) sizeGroups["2-5"]++;
    else if (size <= 10) sizeGroups["6-10"]++;
    else if (size <= 20) sizeGroups["11-20"]++;
    else if (size <= 50) sizeGroups["21-50"]++;
    else sizeGroups["50+"]++;
  }
  
  console.log("Size groups:", sizeGroups);
  
  return { clusters, centroids };
}

/**
 * Choose representative question for each cluster
 */
function chooseRepresentatives(
  clusters: Map<number, string[]>, 
  centroids: Map<number, number[]>,
  questions: string[],
  embeddings: number[][]
): Map<number, string> {
  const representatives = new Map<number, string>();
  
  for (const [clusterId, clusterQuestions] of clusters.entries()) {
    const centroid = centroids.get(clusterId)!;
    let bestQuestion = clusterQuestions[0];
    let bestSimilarity = -Infinity;
    
    // Find question closest to centroid
    for (const q of clusterQuestions) {
      const qIndex = questions.indexOf(q);
      const qEmbedding = embeddings[qIndex];
      const similarity = cosineSimilarity(qEmbedding, centroid);
      
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestQuestion = q;
      }
    }
    
    representatives.set(clusterId, bestQuestion);
  }
  
  return representatives;
}

/**
 * Get or create a descriptive topic for a cluster
 */
async function getClusterTopic(questions: string[]): Promise<string> {
  // Take more samples for larger clusters
  const sampleSize = Math.min(10, questions.length);
  const sample = questions.slice(0, sampleSize).join("\n");
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system", 
          content: "You are a labeling assistant that creates short, descriptive topics for clusters of questions about the WHOOP fitness tracker. Create concise, specific topics that accurately capture what users want to know."
        },
        {
          role: "user",
          content: `Here are ${sampleSize} questions from a cluster of ${questions.length} total questions about WHOOP:\n\n${sample}\n\nProvide a concise topic (2-5 words) that captures what these questions are asking about. Focus on the specific feature, issue, or aspect of WHOOP these questions address. Don't use generic phrases like "Questions about" or "Help with".`
        }
      ],
      max_tokens: 15,
      temperature: 0.2
    });
    
    let topic = response.choices[0].message.content?.trim() || "Miscellaneous";
    
    // Clean up the topic
    topic = topic.replace(/^"(.+)"$/, "$1"); // Remove quotes if present
    topic = topic.replace(/^Topic: /, ""); // Remove "Topic: " prefix if present
    topic = topic.replace(/^WHOOP /, ""); // Remove "WHOOP " prefix if present
    topic = topic.charAt(0).toUpperCase() + topic.slice(1); // Capitalize first letter
    
    return topic;
  } catch (error) {
    console.error("Error generating topic:", error);
    return "Miscellaneous";
  }
}

/**
 * Store embeddings and clusters in Supabase
 */
async function storeResults(
  questionData: {question: string, id: string, post_id: string, post_title: string, post_url: string}[],
  embeddings: number[][],
  clusters: Map<number, string[]>,
  centroids: Map<number, number[]>,
  representatives: Map<number, string>
) {
  console.log("Storing results in Supabase...");
  
  // Clear existing data with retry logic
  try {
    console.log("Clearing existing embeddings...");
    await withRetry(
      async () => {
        const { error } = await supabase
          .from('question_embeddings')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        return true;
      },
      'Clear embeddings'
    );
    
    console.log("Clearing existing clusters...");
    await withRetry(
      async () => {
        const { error } = await supabase
          .from('question_clusters')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        return true;
      },
      'Clear clusters'
    );
  } catch (error) {
    console.error("Error clearing existing data:", error);
    console.log("Continuing with storing new data...");
  }
  
  // Store clusters first
  const clusterIdMap = new Map<number, string>();
  
  for (const [clusterId, questions] of clusters.entries()) {
    const representativeQuestion = representatives.get(clusterId)!;
    const topic = await getClusterTopic(questions);
    
    try {
      const clusterData = await withRetry(
        async () => {
          const { data, error } = await supabase
            .from('question_clusters')
            .insert({
              topic: topic,
              centroid: centroids.get(clusterId),
              question_count: questions.length
            })
            .select('id')
            .single();
          
          if (error) throw error;
          return data;
        },
        `Store cluster ${clusterId}`
      );
      
      clusterIdMap.set(clusterId, clusterData.id);
    } catch (error) {
      console.error(`Error storing cluster ${clusterId}:`, error);
      continue;
    }
  }
  
  // Store embeddings in batches
  const questionMap = new Map<string, {index: number, sourceId: string, postId: string, postTitle: string, postUrl: string}>();
  questionData.forEach((q, i) => {
    questionMap.set(q.question, {
      index: i, 
      sourceId: q.id,
      postId: q.post_id,
      postTitle: q.post_title,
      postUrl: q.post_url // Changed from permalink to url
    });
  });
  
  for (const [clusterId, clusterQuestions] of clusters.entries()) {
    const supabaseClusterId = clusterIdMap.get(clusterId);
    
    if (!supabaseClusterId) continue;
    
    // Find representative question
    const representativeQuestion = representatives.get(clusterId)!;
    let representativeId: string | null = null;
    
    // Store each question in the cluster
    for (const question of clusterQuestions) {
      const qInfo = questionMap.get(question);
      if (!qInfo) continue;
      
      const { index, sourceId, postId, postTitle, postUrl } = qInfo;
      const isRepresentative = question === representativeQuestion;
      
      try {
        const data = await withRetry(
          async () => {
            const { data, error } = await supabase
              .from('question_embeddings')
              .insert({
                question: question,
                embedding: embeddings[index],
                cluster_id: supabaseClusterId,
                reddit_post_id: postId,
                post_title: postTitle,
                post_url: postUrl // Changed from permalink to url
              })
              .select('id')
              .single();
            
            if (error) throw error;
            return data;
          },
          `Store embedding for "${question.substring(0, 20)}..."`
        );
        
        if (isRepresentative) {
          representativeId = data.id;
        }
      } catch (error) {
        console.error(`Error storing embedding for question: ${question}:`, error);
        continue;
      }
    }
    
    // Update cluster with representative question ID
    if (representativeId) {
      try {
        await withRetry(
          async () => {
            const { error } = await supabase
              .from('question_clusters')
              .update({
                representative_question_id: representativeId
              })
              .eq('id', supabaseClusterId);
            
            if (error) throw error;
            return true;
          },
          `Update cluster ${clusterId} with representative question`
        );
      } catch (error) {
        console.error(`Error updating cluster ${clusterId} with representative:`, error);
      }
    }
  }
  
  console.log("Storage complete");
}

/**
 * Create FAQ view for easy querying
 */
async function createFAQView() {
  console.log("Creating FAQ view...");
  
  try {
    await withRetry(
      async () => {
        const { error } = await supabase.rpc('exec_sql', {
          sql: `
          CREATE OR REPLACE VIEW public.faqs AS
          SELECT 
            qc.id as cluster_id,
            qc.topic,
            qe.question as representative_question,
            qe.reddit_post_id as representative_post_id,
            qe.post_title as representative_post_title,
            qe.post_url as representative_post_url,
            qc.question_count,
            (
              SELECT jsonb_agg(json_build_object(
                'question', s.question, 
                'post_id', s.reddit_post_id,
                'post_title', s.post_title,
                'post_url', s.post_url
              ))
              FROM question_embeddings s
              WHERE s.cluster_id = qc.id AND s.id != qe.id
            ) as similar_questions
          FROM 
            question_clusters qc
          JOIN 
            question_embeddings qe ON qe.id = qc.representative_question_id
          ORDER BY 
            qc.question_count DESC;
          `
        });
        
        if (error) throw error;
        return true;
      },
      'Create FAQ view'
    );
    
    console.log("FAQ view created successfully");
  } catch (error) {
    console.error("Error creating FAQ view:", error);
    console.log("Will try an alternative approach");
    
    // Alternative approach
    try {
      // First create a simpler view
      await withRetry(
        async () => {
          const { error } = await supabase.rpc('exec_sql', {
            sql: `
            CREATE OR REPLACE VIEW public.faq_simple AS
            SELECT 
              qc.id as cluster_id,
              qc.topic,
              qe.question as representative_question,
              qe.reddit_post_id,
              qe.post_title,
              qe.post_url,
              qc.question_count
            FROM 
              question_clusters qc
            JOIN 
              question_embeddings qe ON qe.id = qc.representative_question_id
            ORDER BY 
              qc.question_count DESC;
            `
          });
          
          if (error) throw error;
          return true;
        },
        'Create simple FAQ view'
      );
      
      console.log("Created simple FAQ view as fallback");
    } catch (innerError) {
      console.error("Error with simple view too:", innerError);
    }
  }
}

/**
 * Main function to generate embeddings and cluster questions
 */
async function generateEmbeddingsAndCluster(offlineMode = false) {
  console.log("Starting question embedding and clustering process...");
  
  // Verify Supabase connection before proceeding
  const connected = await verifySupabaseConnection();
  if (!connected) {
    console.error("Could not establish connection to Supabase. Exiting.");
    process.exit(1);
  }
  
  // Check network connectivity at startup if not in offline mode
  if (!offlineMode) {
    console.log("Checking initial network connectivity...");
    const hasNetwork = await checkNetworkConnectivity();
    if (!hasNetwork) {
      console.log("⚠️ Network connectivity issues detected");
      console.log("Checking if we can use cached embeddings...");
      
      try {
        const cacheData = await fs.readFile(EMBEDDINGS_CACHE_FILE, 'utf-8');
        const embeddingsCache = JSON.parse(cacheData);
        const questionCount = Object.keys(embeddingsCache).length;
        
        if (questionCount > 0) {
          console.log(`Found ${questionCount} cached embeddings`);
          console.log("Switching to offline mode");
          offlineMode = true;
        } else {
          console.log("No cached embeddings available");
          console.log("Will need network connectivity to proceed");
          await waitForNetwork(1, 10); // More aggressive waiting, up to 10 attempts
        }
      } catch (err) {
        console.log("No cache found or error loading cache, network required");
        await waitForNetwork(1, 10); // More aggressive waiting, up to 10 attempts
      }
    }
  }
  
  if (offlineMode) {
    console.log("Operating in offline mode - will only use cached embeddings");
  }
  
  // Get all unique questions
  const questionData = await getAllQuestions();
  const questions = questionData.map(q => q.question);
  
  if (questions.length === 0) {
    console.log("No questions found!");
    return;
  }
  
  // Generate embeddings
  const embeddings = await generateEmbeddings(questions);
  
  // If in offline mode and some questions don't have cached embeddings, filter them out
  let filteredQuestions = questions;
  let filteredEmbeddings = embeddings;
  let filteredQuestionData = questionData;
  
  if (offlineMode) {
    const validIndices = embeddings.map((embedding, index) => embedding ? index : -1).filter(i => i !== -1);
    
    if (validIndices.length < questions.length) {
      console.log(`Filtering out ${questions.length - validIndices.length} questions without cached embeddings`);
      
      filteredQuestions = validIndices.map(i => questions[i]);
      filteredEmbeddings = validIndices.map(i => embeddings[i]);
      filteredQuestionData = validIndices.map(i => questionData[i]);
      
      console.log(`Proceeding with ${filteredQuestions.length} questions with cached embeddings`);
    }
  }
  
  // Cluster embeddings
  const { clusters, centroids } = clusterEmbeddings(
    filteredQuestions, 
    filteredEmbeddings, 
    TARGET_CLUSTER_COUNT
  );
  
  // Choose representative questions
  const representatives = chooseRepresentatives(
    clusters, 
    centroids,
    filteredQuestions,
    filteredEmbeddings
  );
  
  // Store results
  await storeResults(
    filteredQuestionData,
    filteredEmbeddings,
    clusters,
    centroids,
    representatives
  );
  
  // Create FAQ view
  await createFAQView();
  
  console.log("Process complete!");
  
  // Output some statistics
  console.log("\nClustering Statistics:");
  console.log(`Total Questions: ${filteredQuestions.length}`);
  console.log(`Total Clusters: ${clusters.size}`);
  
  let min = Infinity;
  let max = 0;
  let sum = 0;
  
  for (const [clusterId, clusterQuestions] of clusters.entries()) {
    const count = clusterQuestions.length;
    min = Math.min(min, count);
    max = Math.max(max, count);
    sum += count;
    
    const rep = representatives.get(clusterId);
    console.log(`Cluster ${clusterId}: ${clusterQuestions.length} questions`);
    console.log(`  Representative: "${rep}"\n`);
  }
  
  console.log(`Min Cluster Size: ${min}`);
  console.log(`Max Cluster Size: ${max}`);
  console.log(`Average Cluster Size: ${sum / clusters.size}`);
}

// Allow command line flag for offline mode
const args = process.argv.slice(2);
const offlineMode = args.includes('--offline');

// Run the function
generateEmbeddingsAndCluster(offlineMode)
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  }); 