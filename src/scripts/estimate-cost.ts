// Cost Estimator for GPT-4o mini Analysis
// Estimates the OpenAI API costs for analyzing Reddit posts

// Constants for OpenAI GPT-4o mini pricing
const GPT4O_MINI_INPUT_PRICE_PER_1M_TOKENS = 0.15; // $0.15 per 1M input tokens
const GPT4O_MINI_OUTPUT_PRICE_PER_1M_TOKENS = 0.60; // $0.60 per 1M output tokens
const GPT4O_MINI_IMAGE_PRICE_PER_IMAGE = 0.002; // $0.002 per image

// Constants for token estimation
const SYSTEM_PROMPT_TOKENS = 450; // Approximately 450 tokens for our system prompt
const AVG_POST_TOKENS = 500; // Average post might be around 500 tokens
const AVG_COMMENTS_TOKENS = 750; // Average 5 comments at ~150 tokens each
const AVG_OUTPUT_TOKENS = 500; // The structured JSON output is around 500 tokens
const AVG_IMAGES_PER_POST = 0.3; // Estimate: 30% of posts have an image (avg 1 image when present)

// Number of posts to analyze from count-posts.ts
const TOTAL_POSTS = 993;

// Calculate token usage per post
const inputTokensPerPost = SYSTEM_PROMPT_TOKENS + AVG_POST_TOKENS + AVG_COMMENTS_TOKENS;
const outputTokensPerPost = AVG_OUTPUT_TOKENS;
const imagesPerPost = AVG_IMAGES_PER_POST;

// Calculate total token usage
const totalInputTokens = inputTokensPerPost * TOTAL_POSTS;
const totalOutputTokens = outputTokensPerPost * TOTAL_POSTS;
const totalImages = Math.ceil(imagesPerPost * TOTAL_POSTS);

// Calculate costs
const inputCost = (totalInputTokens / 1000000) * GPT4O_MINI_INPUT_PRICE_PER_1M_TOKENS;
const outputCost = (totalOutputTokens / 1000000) * GPT4O_MINI_OUTPUT_PRICE_PER_1M_TOKENS;
const imageCost = totalImages * GPT4O_MINI_IMAGE_PRICE_PER_IMAGE;
const totalCost = inputCost + outputCost + imageCost;

// Print results
console.log('============= OPENAI API COST ESTIMATE =============');
console.log(`Total posts to analyze: ${TOTAL_POSTS}`);
console.log('\nToken Usage Estimate:');
console.log(`- Input tokens per post: ${inputTokensPerPost}`);
console.log(`- Output tokens per post: ${outputTokensPerPost}`);
console.log(`- Total input tokens: ${totalInputTokens.toLocaleString()}`);
console.log(`- Total output tokens: ${totalOutputTokens.toLocaleString()}`);
console.log(`- Estimated images to process: ${totalImages}`);

console.log('\nCost Breakdown:');
console.log(`- Input tokens cost: $${inputCost.toFixed(2)}`);
console.log(`- Output tokens cost: $${outputCost.toFixed(2)}`);
console.log(`- Image processing cost: $${imageCost.toFixed(2)}`);
console.log(`- TOTAL ESTIMATED COST: $${totalCost.toFixed(2)}`);

console.log('\nAssumptions:');
console.log('- Using GPT-4o mini pricing ($0.15/1M input tokens, $0.60/1M output tokens)');
console.log('- Average post length of ~500 tokens');
console.log('- Including ~5 comments per post (~750 tokens)');
console.log('- ~30% of posts contain images');
console.log('- Structured JSON output of ~500 tokens');
console.log('This is an approximation and actual costs may vary based on actual content length and image frequency.'); 