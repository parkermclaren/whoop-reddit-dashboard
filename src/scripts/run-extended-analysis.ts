import { processAllAnalyzedPosts } from './extended-analyzer';

console.log('🔍 Starting extended WHOOP Reddit analysis...');
console.log('This will add competitor mentions, aspect-based sentiment, cancellation signals, and user questions');
console.log('to all existing analyzed posts in the database.');
console.log('-----------------------------------------------------------');

processAllAnalyzedPosts()
  .then(() => {
    console.log('-----------------------------------------------------------');
    console.log('✅ Extended analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error in extended analysis process:', error);
    process.exit(1);
  }); 