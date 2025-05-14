#!/usr/bin/env node

// Load environment variables from .env.local
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

require('ts-node').register({
  transpileOnly: true,
  project: 'src/scripts/tsconfig.json'
});

// Now require the TypeScript file
require('./test-single-post.ts'); 