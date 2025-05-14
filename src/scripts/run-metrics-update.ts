/**
 * WHOOP Reddit Metrics Update
 * 
 * This script updates the metrics (ups and num_comments) for existing Reddit posts
 * based on their age, without running the analyzers.
 * 
 * Run with: npx ts-node src/scripts/run-metrics-update.ts
 */

import { updatePostMetrics } from './update-post-metrics';

async function main() {
  console.log('Starting metrics update script...');
  
  try {
    // Default batch size is 50, can be adjusted as needed
    const success = await updatePostMetrics();
    
    if (success) {
      console.log('Metrics update completed successfully!');
      process.exit(0);
    } else {
      console.error('Metrics update encountered errors');
      process.exit(1);
    }
  } catch (error) {
    console.error('Unhandled error during metrics update:', error);
    process.exit(1);
  }
}

main(); 