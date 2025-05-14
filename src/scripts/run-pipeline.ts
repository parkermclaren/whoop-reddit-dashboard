// WHOOP Reddit Dashboard Pipeline
// Runs the entire data pipeline in sequence:
// 1. Initialize search terms and themes (if needed)
// 2. Collect Reddit data
// 3. Analyze posts with GPT-4o mini
// 4. Generate insights
// 5. (Optional) Run extended analysis for competitor mentions, feature sentiment, etc.

import * as dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Convert exec to promise-based function
const execPromise = promisify(exec);

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Check if extended analysis flag is passed
const shouldRunExtendedAnalysis = process.argv.includes('--extended-analysis');

// Function to check if initialization is needed
async function checkInitializationNeeded() {
  console.log('Checking if initialization is needed...');
  
  // Check if themes exist
  const { data: themes, error: themesError } = await supabase
    .from('themes')
    .select('id')
    .limit(1);
  
  if (themesError) {
    console.error('Error checking themes:', themesError);
    return true; // Assume initialization needed if error
  }
  
  // Check if search terms exist
  const { data: searchTerms, error: searchTermsError } = await supabase
    .from('search_terms')
    .select('id')
    .limit(1);
  
  if (searchTermsError) {
    console.error('Error checking search terms:', searchTermsError);
    return true; // Assume initialization needed if error
  }
  
  // Initialization needed if either table is empty
  const initNeeded = !themes?.length || !searchTerms?.length;
  console.log(`Initialization ${initNeeded ? 'is' : 'is not'} needed`);
  return initNeeded;
}

// Function to run a script
async function runScript(scriptPath: string, description: string) {
  console.log(`\n--- Running ${description} ---`);
  console.log(`Executing: ${scriptPath}`);
  
  try {
    const { stdout, stderr } = await execPromise(`npx ts-node ${scriptPath}`);
    
    if (stderr) {
      console.error(`Error: ${stderr}`);
    }
    
    console.log(`Output: ${stdout}`);
    console.log(`--- ${description} completed successfully ---\n`);
    return true;
  } catch (error) {
    console.error(`Failed to run ${description}:`, error);
    return false;
  }
}

// Main pipeline function
async function runPipeline() {
  console.log('Starting WHOOP Reddit Dashboard pipeline...');
  
  // Check environment variables
  const requiredEnvVars = [
    'REDDIT_CLIENT_ID',
    'REDDIT_CLIENT_SECRET',
    'REDDIT_REFRESH_TOKEN',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'OPENAI_API_KEY'
  ];
  
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please set these variables in a .env file and try again.');
    process.exit(1);
  }
  
  try {
    // Step 1: Initialize data if needed
    const initNeeded = await checkInitializationNeeded();
    
    if (initNeeded) {
      // Initialize themes
      const themesSuccess = await runScript(
        'src/scripts/init-themes.ts',
        'Theme initialization'
      );
      
      if (!themesSuccess) {
        console.error('Theme initialization failed, aborting pipeline.');
        process.exit(1);
      }
      
      // Initialize search terms
      const searchTermsSuccess = await runScript(
        'src/scripts/init-search-terms.ts',
        'Search terms initialization'
      );
      
      if (!searchTermsSuccess) {
        console.error('Search terms initialization failed, aborting pipeline.');
        process.exit(1);
      }
    }
    
    // Step 2: Collect Reddit data
    const redditSuccess = await runScript(
      'src/scripts/reddit-collector.ts',
      'Reddit data collection'
    );
    
    if (!redditSuccess) {
      console.error('Reddit data collection failed, aborting pipeline.');
      process.exit(1);
    }

    // Step 3: Run GPT analyzer (always run this step)
    const gptAnalyzerSuccess = await runScript(
      'src/scripts/gpt-analyzer.ts',
      'GPT analysis'
    );
    
    if (!gptAnalyzerSuccess) {
      console.error('GPT analysis failed, but continuing...');
      // Continue despite error, as we might still be able to use existing data
    }
    
    // Step 4: Run extended analysis if requested
    if (shouldRunExtendedAnalysis) {
      console.log('\n Running extended analysis with competitor mentions, feature sentiment, etc.');
      const extendedAnalysisSuccess = await runScript(
        'src/scripts/run-extended-analysis.ts',
        'Extended analysis'
      );
      
      if (!extendedAnalysisSuccess) {
        console.error('Extended analysis failed, but continuing...');
        // Continue despite error
      }
    }
    
    // Step 5: Generate insights
    const insightsSuccess = await runScript(
      'src/scripts/generate-insights.ts',
      'Insight generation'
    );
    
    if (!insightsSuccess) {
      console.error('Insight generation failed.');
      // Continue despite error
    }
    
    console.log('\n--- Pipeline completed successfully ---');
    console.log('All data has been collected, analyzed, and insights have been generated.');
    console.log('You can now view the results in the dashboard.\n');
  } catch (error) {
    console.error('Error in pipeline execution:', error);
    process.exit(1);
  }
}

// Run the pipeline
runPipeline().catch(error => {
  console.error('Unhandled error in pipeline:', error);
  process.exit(1);
}); 