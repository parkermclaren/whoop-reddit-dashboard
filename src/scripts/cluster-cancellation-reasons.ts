import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);

// Maximum number of reasons to process at once for OpenAI API
const EMBEDDING_BATCH_SIZE = 100;

// The similarity threshold for considering reasons to be in the same cluster
const SIMILARITY_THRESHOLD = 0.95;

// Higher threshold for large clusters
const LARGE_CLUSTER_THRESHOLD = 0.97;

// How many clusters to create approximately
const TARGET_CLUSTER_COUNT = 10;

// Min/max cluster sizes
const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTER_SIZE = 20;

// Cache file for embeddings
const EMBEDDINGS_CACHE_FILE = path.join(process.cwd(), 'tmp', 'cancellation-embeddings-cache.json');

/**
 * Get all cancellation reasons from the database
 */
async function getAllCancellationReasons(): Promise<{reason: string, id: string, post_id: string, post_title: string, post_url: string}[]> {
  console.log("Fetching all cancellation reasons from analysis_results...");
  
  try {
    // First, get analysis results with cancellation mentions
    const { data, error } = await supabase
      .from('analysis_results')
      .select('id, content_id, cancellation_reason')
      .eq('cancellation_mention', true)
      .not('cancellation_reason', 'is', null)
      .not('cancellation_reason', 'eq', '');
      
    if (error) throw error;
    
    if (!data || data.length === 0) {
      console.log("No cancellation reasons found!");
      return [];
    }
    
    // Extract the post IDs to fetch their details separately
    const postIds = data.map(item => item.content_id);
    
    // Fetch post details separately
    const { data: postData, error: postError } = await supabase
      .from('reddit_posts')
      .select('id, title, url')
      .in('id', postIds);
    
    if (postError) {
      console.error("Error fetching post details:", postError);
      // Continue without post details if there's an error
      const formattedReasons = data.map(item => ({
        reason: item.cancellation_reason,
        id: item.id,
        post_id: item.content_id,
        post_title: '',
        post_url: ''
      }));
      
      // Remove duplicate reasons (keeping the first occurrence)
      const uniqueReasons = formattedReasons.filter((reason, index, self) => 
        index === self.findIndex(r => r.reason === reason.reason)
      );
      
      console.log(`Found ${uniqueReasons.length} unique cancellation reasons (from ${formattedReasons.length} total)`);
      return uniqueReasons;
    }
    
    // Create a map of post IDs to their details for quick lookup
    const postMap = new Map();
    if (postData) {
      postData.forEach(post => {
        postMap.set(post.id, {
          title: post.title || '',
          url: post.url || ''
        });
      });
    }
    
    // Format the reasons with post details
    const formattedReasons = data.map(item => {
      const postDetails = postMap.get(item.content_id) || { title: '', url: '' };
      return {
        reason: item.cancellation_reason,
        id: item.id,
        post_id: item.content_id,
        post_title: postDetails.title,
        post_url: postDetails.url
      };
    });
    
    // Remove duplicate reasons (keeping the first occurrence)
    const uniqueReasons = formattedReasons.filter((reason, index, self) => 
      index === self.findIndex(r => r.reason === reason.reason)
    );
    
    console.log(`Found ${uniqueReasons.length} unique cancellation reasons (from ${formattedReasons.length} total)`);
    return uniqueReasons;
  } catch (err) {
    console.error("Error fetching cancellation reasons:", err);
    throw err;
  }
}

/**
 * Generate embeddings for reasons
 */
async function generateEmbeddings(reasons: string[]): Promise<number[][]> {
  console.log(`Generating embeddings for ${reasons.length} cancellation reasons...`);
  
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
  const uncachedReasons: string[] = [];
  const uncachedIndices: number[] = [];
  
  // Check which reasons are not in cache
  reasons.forEach((reason, index) => {
    if (embeddingsCache[reason]) {
      results[index] = embeddingsCache[reason];
    } else {
      uncachedReasons.push(reason);
      uncachedIndices.push(index);
    }
  });
  
  if (uncachedReasons.length === 0) {
    console.log("All embeddings found in cache!");
    return results;
  }
  
  console.log(`Generating ${uncachedReasons.length} new embeddings...`);
  
  // Process uncached reasons in batches
  for (let i = 0; i < uncachedReasons.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = uncachedReasons.slice(i, i + EMBEDDING_BATCH_SIZE);
    
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: batch
      });
      
      // Store embeddings in results array and cache
      response.data.forEach((item, batchIndex) => {
        const originalIndex = uncachedIndices[i + batchIndex];
        const reason = reasons[originalIndex];
        
        results[originalIndex] = item.embedding;
        embeddingsCache[reason] = item.embedding;
      });
      
      console.log(`Processed batch ${i/EMBEDDING_BATCH_SIZE + 1}/${Math.ceil(uncachedReasons.length/EMBEDDING_BATCH_SIZE)}`);
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
 * Cluster embeddings using DBSCAN
 */
function clusterEmbeddings(
  reasons: string[], 
  embeddings: number[][]
): { clusters: Map<number, string[]>, centroids: Map<number, number[]> } {
  console.log(`Clustering ${reasons.length} cancellation reasons...`);
  
  // Calculate similarity matrix
  const similarityMatrix: number[][] = [];
  for (let i = 0; i < embeddings.length; i++) {
    similarityMatrix[i] = [];
    for (let j = 0; j < embeddings.length; j++) {
      if (i === j) {
        similarityMatrix[i][j] = 1.0; // Self-similarity
      } else if (j < i) {
        similarityMatrix[i][j] = similarityMatrix[j][i];
      } else {
        similarityMatrix[i][j] = cosineSimilarity(embeddings[i], embeddings[j]);
      }
    }
  }
  
  // Apply DBSCAN clustering
  const labels = dbscan(similarityMatrix, SIMILARITY_THRESHOLD, MIN_CLUSTER_SIZE);
  
  // Create clusters from labels
  const clusters = new Map<number, string[]>();
  const centroids = new Map<number, number[]>();
  
  // Initialize clusters
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    
    if (!clusters.has(label)) {
      clusters.set(label, []);
    }
    clusters.get(label)!.push(reasons[i]);
  }
  
  // Calculate centroids
  for (const [clusterId, clusterReasons] of clusters.entries()) {
    const centroid = Array(embeddings[0].length).fill(0);
    for (const r of clusterReasons) {
      const rIndex = reasons.indexOf(r);
      const rEmbedding = embeddings[rIndex];
      
      for (let i = 0; i < centroid.length; i++) {
        centroid[i] += rEmbedding[i] / clusterReasons.length;
      }
    }
    centroids.set(clusterId, centroid);
  }
  
  return { clusters, centroids };
}

/**
 * Simple DBSCAN algorithm for clustering
 */
function dbscan(similarityMatrix: number[][], minSimilarity: number, minPts: number): number[] {
  const n = similarityMatrix.length;
  const visited = new Array(n).fill(false);
  const labels = new Array(n).fill(-1); // -1 means noise
  let clusterId = 0;
  
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    
    visited[i] = true;
    const neighbors = getNeighbors(i, similarityMatrix, minSimilarity);
    
    if (neighbors.length < minPts) {
      // Mark as noise initially
      continue;
    } else {
      // Expand cluster
      labels[i] = clusterId;
      
      for (let j = 0; j < neighbors.length; j++) {
        const neighbor = neighbors[j];
        
        if (!visited[neighbor]) {
          visited[neighbor] = true;
          const neighborNeighbors = getNeighbors(neighbor, similarityMatrix, minSimilarity);
          
          if (neighborNeighbors.length >= minPts) {
            neighbors.push(...neighborNeighbors.filter(nn => !neighbors.includes(nn) && nn !== i));
          }
        }
        
        if (labels[neighbor] === -1) {
          labels[neighbor] = clusterId;
        }
      }
      
      clusterId++;
    }
  }
  
  // Assign noise points to nearest cluster
  for (let i = 0; i < n; i++) {
    if (labels[i] === -1) {
      let bestCluster = -1;
      let bestSimilarity = minSimilarity * 0.8; // Lower threshold for noise points
      
      for (let j = 0; j < n; j++) {
        if (labels[j] !== -1 && similarityMatrix[i][j] > bestSimilarity) {
          bestSimilarity = similarityMatrix[i][j];
          bestCluster = labels[j];
        }
      }
      
      if (bestCluster !== -1) {
        labels[i] = bestCluster;
      } else {
        // Create singleton cluster
        labels[i] = clusterId++;
      }
    }
  }
  
  return labels;
}

/**
 * Get neighbors of a point based on similarity
 */
function getNeighbors(pointId: number, similarityMatrix: number[][], minSimilarity: number): number[] {
  const neighbors: number[] = [];
  for (let i = 0; i < similarityMatrix.length; i++) {
    if (i !== pointId && similarityMatrix[pointId][i] >= minSimilarity) {
      neighbors.push(i);
    }
  }
  return neighbors;
}

/**
 * Choose representative reason for each cluster
 */
function chooseRepresentatives(
  clusters: Map<number, string[]>, 
  centroids: Map<number, number[]>,
  reasons: string[],
  embeddings: number[][]
): Map<number, string> {
  const representatives = new Map<number, string>();
  
  for (const [clusterId, clusterReasons] of clusters.entries()) {
    const centroid = centroids.get(clusterId)!;
    let bestReason = clusterReasons[0];
    let bestSimilarity = -Infinity;
    
    // Find reason closest to centroid
    for (const r of clusterReasons) {
      const rIndex = reasons.indexOf(r);
      const rEmbedding = embeddings[rIndex];
      const similarity = cosineSimilarity(rEmbedding, centroid);
      
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestReason = r;
      }
    }
    
    representatives.set(clusterId, bestReason);
  }
  
  return representatives;
}

/**
 * Get a topic name for the cluster using GPT
 */
async function getClusterTopic(reasons: string[]): Promise<string> {
  const sampleSize = Math.min(5, reasons.length);
  const sample = reasons.slice(0, sampleSize).join("\n");
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system", 
          content: "You are a labeling assistant that creates short, descriptive topics for clusters of cancellation reasons for WHOOP fitness device users. Create concise, specific topics."
        },
        {
          role: "user",
          content: `Here are ${sampleSize} reasons from a cluster of ${reasons.length} total cancellation reasons for WHOOP:\n\n${sample}\n\nProvide a concise topic (2-5 words) that captures the main cancellation reason.`
        }
      ],
      max_tokens: 15,
      temperature: 0.2
    });
    
    let topic = response.choices[0].message.content?.trim() || "Miscellaneous";
    
    // Clean up the topic
    topic = topic.replace(/^"(.+)"$/, "$1"); // Remove quotes if present
    topic = topic.replace(/^Topic: /, ""); // Remove "Topic: " prefix if present
    topic = topic.charAt(0).toUpperCase() + topic.slice(1); // Capitalize first letter
    
    return topic;
  } catch (error) {
    console.error("Error generating topic:", error);
    return "Miscellaneous";
  }
}

/**
 * Store results in database
 */
async function storeResults(
  reasonData: {reason: string, id: string, post_id: string, post_title: string, post_url: string}[],
  embeddings: number[][],
  clusters: Map<number, string[]>,
  centroids: Map<number, number[]>,
  representatives: Map<number, string>
) {
  console.log("Storing cancellation clustering results in Supabase...");
  
  // Clear existing data
  try {
    console.log("Clearing existing cancellation embeddings...");
    const { error: embeddingError } = await supabase
      .from('cancellation_embeddings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (embeddingError) console.error("Error clearing embeddings:", embeddingError);
    
    console.log("Clearing existing cancellation clusters...");
    const { error: clusterError } = await supabase
      .from('cancellation_clusters')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (clusterError) console.error("Error clearing clusters:", clusterError);
  } catch (error) {
    console.error("Error clearing existing data:", error);
  }
  
  // Store clusters first
  const clusterIdMap = new Map<number, string>();
  
  for (const [clusterId, reasons] of clusters.entries()) {
    const representativeReason = representatives.get(clusterId)!;
    const topic = await getClusterTopic(reasons);
    
    try {
      const { data, error } = await supabase
        .from('cancellation_clusters')
        .insert({
          topic: topic,
          centroid: centroids.get(clusterId),
          reason_count: reasons.length
        })
        .select('id')
        .single();
      
      if (error) throw error;
      clusterIdMap.set(clusterId, data.id);
    } catch (error) {
      console.error(`Error storing cluster ${clusterId}:`, error);
      continue;
    }
  }
  
  // Store embeddings
  const reasonMap = new Map<string, {index: number, sourceId: string, postId: string, postTitle: string, postUrl: string}>();
  reasonData.forEach((r, i) => {
    reasonMap.set(r.reason, {
      index: i, 
      sourceId: r.id,
      postId: r.post_id,
      postTitle: r.post_title,
      postUrl: r.post_url
    });
  });
  
  for (const [clusterId, clusterReasons] of clusters.entries()) {
    const supabaseClusterId = clusterIdMap.get(clusterId);
    
    if (!supabaseClusterId) continue;
    
    // Find representative reason
    const representativeReason = representatives.get(clusterId)!;
    let representativeId: string | null = null;
    
    // Store each reason in the cluster
    for (const reason of clusterReasons) {
      const rInfo = reasonMap.get(reason);
      if (!rInfo) continue;
      
      const { index, sourceId, postId, postTitle, postUrl } = rInfo;
      const isRepresentative = reason === representativeReason;
      
      try {
        const { data, error } = await supabase
          .from('cancellation_embeddings')
          .insert({
            reason: reason,
            embedding: embeddings[index],
            cluster_id: supabaseClusterId,
            reddit_post_id: postId,
            post_title: postTitle,
            post_url: postUrl
          })
          .select('id')
          .single();
        
        if (error) throw error;
        
        if (isRepresentative) {
          representativeId = data.id;
        }
      } catch (error) {
        console.error(`Error storing embedding for reason: ${reason}:`, error);
        continue;
      }
    }
    
    // Update cluster with representative reason ID
    if (representativeId) {
      try {
        const { error } = await supabase
          .from('cancellation_clusters')
          .update({
            representative_reason_id: representativeId
          })
          .eq('id', supabaseClusterId);
        
        if (error) throw error;
      } catch (error) {
        console.error(`Error updating cluster ${clusterId} with representative:`, error);
      }
    }
  }
  
  console.log("Storage complete");
}

/**
 * Main function
 */
async function clusterCancellationReasons() {
  console.log("Starting cancellation reason clustering process...");
  
  // Get all cancellation reasons
  const reasonData = await getAllCancellationReasons();
  const reasons = reasonData.map(r => r.reason);
  
  if (reasons.length === 0) {
    console.log("No cancellation reasons found!");
    return;
  }
  
  // Generate embeddings
  const embeddings = await generateEmbeddings(reasons);
  
  // Cluster embeddings
  const { clusters, centroids } = clusterEmbeddings(reasons, embeddings);
  
  // Choose representatives
  const representatives = chooseRepresentatives(
    clusters, 
    centroids,
    reasons,
    embeddings
  );
  
  // Store results
  await storeResults(
    reasonData,
    embeddings,
    clusters,
    centroids,
    representatives
  );
  
  console.log("Process complete!");
  
  // Output statistics
  console.log("\nClustering Statistics:");
  console.log(`Total Cancellation Reasons: ${reasons.length}`);
  console.log(`Total Clusters: ${clusters.size}`);
  
  for (const [clusterId, clusterReasons] of clusters.entries()) {
    const rep = representatives.get(clusterId);
    console.log(`Cluster ${clusterId}: ${clusterReasons.length} reasons`);
    console.log(`  Representative: "${rep}"\n`);
  }
}

// Run the clustering function
clusterCancellationReasons()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  }); 