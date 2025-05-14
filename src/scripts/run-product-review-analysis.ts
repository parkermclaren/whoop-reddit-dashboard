import { processAllAnalyzedPosts } from './product-review-analyzer';

console.log('🔍 Starting WHOOP product review analysis...');
console.log('This will detect when users have received a new product and analyze their satisfaction level');
console.log('for all existing analyzed posts in the database.');
console.log('-----------------------------------------------------------');

processAllAnalyzedPosts()
  .then(() => {
    console.log('-----------------------------------------------------------');
    console.log('✅ Product review analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error in product review analysis process:', error);
    process.exit(1);
  }); 