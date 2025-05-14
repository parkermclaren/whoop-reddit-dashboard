// Initialization script for search terms
// Populates the search_terms table with initial terms for WHOOP-related content

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Define search term categories
const SEARCH_TERM_CATEGORIES = {
  PRODUCT: 'product',
  FEATURE: 'feature',
  PRICING: 'pricing',
  COMPETITOR: 'competitor',
  ISSUE: 'issue',
};

// Define initial search terms
const initialSearchTerms = [
  // Product terms
  { term: 'WHOOP 5.0', category: SEARCH_TERM_CATEGORIES.PRODUCT },
  { term: 'WHOOP 4.0', category: SEARCH_TERM_CATEGORIES.PRODUCT },
  { term: 'WHOOP app', category: SEARCH_TERM_CATEGORIES.PRODUCT },
  { term: 'WHOOP bands', category: SEARCH_TERM_CATEGORIES.PRODUCT },
  { term: 'WHOOP body', category: SEARCH_TERM_CATEGORIES.PRODUCT },
  { term: 'Body Composition', category: SEARCH_TERM_CATEGORIES.PRODUCT },
  
  // Feature terms
  { term: 'sleep tracking', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'recovery', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'strain', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'HRV', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'heart rate', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'resting heart rate', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'activity tracking', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'workout detection', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'battery life', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'sleep coach', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'respiratory rate', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'SPO2', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'skin temperature', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'body temperature', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'journal', category: SEARCH_TERM_CATEGORIES.FEATURE },
  { term: 'sleep quality', category: SEARCH_TERM_CATEGORIES.FEATURE },
  
  // Pricing terms
  { term: 'membership', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'subscription', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'pricing', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'price increase', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'cost', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'cheaper', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'expensive', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'monthly fee', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'annual fee', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'yearly fee', category: SEARCH_TERM_CATEGORIES.PRICING },
  { term: 'hardware cost', category: SEARCH_TERM_CATEGORIES.PRICING },
  
  // Competitor terms
  { term: 'Apple Watch', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  { term: 'Oura Ring', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  { term: 'Fitbit', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  { term: 'Garmin', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  { term: 'Polar', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  { term: 'Amazfit', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  { term: 'Samsung Galaxy Watch', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  { term: 'switch to', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  { term: 'switching to', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  { term: 'better than', category: SEARCH_TERM_CATEGORIES.COMPETITOR },
  
  // Issue terms
  { term: 'inaccurate', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'broken', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'disconnecting', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'battery drain', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'customer support', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'customer service', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'not tracking', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'not syncing', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'not working', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'won\'t charge', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'issues', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'problems', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'disappointed', category: SEARCH_TERM_CATEGORIES.ISSUE },
  { term: 'frustrating', category: SEARCH_TERM_CATEGORIES.ISSUE },
];

// Function to insert search terms into Supabase
async function insertSearchTerms() {
  console.log('Initializing search terms in database...');
  
  // Prepare terms with metadata
  const termsToInsert = initialSearchTerms.map(term => ({
    ...term,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    usage_count: 0,
  }));
  
  // Insert into Supabase with conflict handling
  const { data, error } = await supabase
    .from('search_terms')
    .upsert(termsToInsert, {
      onConflict: 'term',
      ignoreDuplicates: false,
    });
    
  if (error) {
    console.error('Error inserting search terms:', error);
  } else {
    console.log(`Successfully initialized ${initialSearchTerms.length} search terms`);
  }
}

// Initialize search terms
insertSearchTerms()
  .catch(error => console.error('Error in initialization:', error))
  .finally(() => console.log('Search term initialization complete')); 