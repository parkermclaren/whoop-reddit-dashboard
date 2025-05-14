import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

console.log('Supabase URL exists:', !!supabaseUrl);
console.log('Supabase key exists:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables:');
  if (!supabaseUrl) console.error('- NEXT_PUBLIC_SUPABASE_URL is missing');
  if (!supabaseKey) console.error('- SUPABASE_SERVICE_KEY is missing');
  process.exit(1);
}

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

/**
 * Sets up the collection_metadata table and initializes 
 * the last collection time to May 11, 2025
 */
async function setupCollectionMetadata() {
  try {
    console.log('Setting up collection metadata...');
    
    // Simply try to insert the record. If the table doesn't exist,
    // we'll get an error, but we'll just proceed to create it via manual SQL
    
    // Initialize with last collection time of May 11, 2025
    const lastCollectionTime = new Date('2025-05-11T02:06:31+00:00');
    
    console.log('Attempting to insert metadata...');
    const { error: upsertError } = await supabase
      .from('collection_metadata')
      .upsert({
        id: 'reddit-collection',
        last_collection_time: lastCollectionTime.toISOString(),
        posts_collected: 0,
        last_updated: new Date().toISOString()
      });
    
    if (upsertError) {
      // If the error is that the table doesn't exist, we need to create it manually
      if (upsertError.code === '42P01') {
        console.log('Table doesn\'t exist. Please create it manually in the Supabase dashboard with:');
        console.log(`
          CREATE TABLE collection_metadata (
            id TEXT PRIMARY KEY,
            last_collection_time TIMESTAMP WITH TIME ZONE,
            posts_collected INTEGER DEFAULT 0,
            last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        
        console.log('After creating the table, run this script again.');
        return false;
      }
      
      console.error('Error initializing collection metadata:', upsertError);
      return false;
    }
    
    console.log(`Successfully initialized collection metadata with last collection time: ${lastCollectionTime.toISOString()}`);
    return true;
  } catch (error) {
    console.error('Error in setupCollectionMetadata:', error);
    return false;
  }
}

// Run the setup if this file is executed directly
if (require.main === module) {
  setupCollectionMetadata().then(success => {
    if (success) {
      console.log('Collection metadata setup completed');
    } else {
      console.error('Collection metadata setup failed');
      process.exit(1);
    }
    process.exit(0);
  }).catch(error => {
    console.error('Unhandled error in setupCollectionMetadata:', error);
    process.exit(1);
  });
}

export { setupCollectionMetadata }; 