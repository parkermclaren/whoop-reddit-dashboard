import { NextResponse } from 'next/server';
import { runProductAnalysisStep } from '../../../../scripts/continuous-pipeline';

// A secret key to verify the cron job requests come from cron-job.org
const CRON_SECRET = process.env.CRON_SECRET;

// Configure the maximum duration for this API route
export const maxDuration = 60; // 60 seconds maximum (Vercel hobby plan limit)

// Add global type declaration for pipelineStartTime
declare global {
  var pipelineStartTime: number;
}

/**
 * This API route runs the product review analysis step of the pipeline
 * It is triggered by cron-job.org
 * 
 * To secure this endpoint, we check for a secret key to prevent unauthorized access
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('PRODUCT ANALYSIS API triggered at:', new Date().toISOString());
  
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    // Security check
    const hasValidSecret = CRON_SECRET && secret === CRON_SECRET;
    
    if (!hasValidSecret) {
      console.error('Unauthorized access attempt to product analysis API');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log('Starting product review analysis...');
    
    // Set a global timeout flag to help the pipeline monitor runtime
    global.pipelineStartTime = Date.now();
    
    // Run the product analysis step with timeout protection
    const timeoutPromise = new Promise<boolean>((_, reject) => {
      const timeoutSeconds = 55; // Allow 5s buffer before Vercel's 60s limit
      setTimeout(() => {
        reject(new Error(`Product analysis execution timed out after ${timeoutSeconds} seconds`));
      }, timeoutSeconds * 1000);
    });
    
    // Race between step completion and timeout
    const success = await Promise.race([
      runProductAnalysisStep(),
      timeoutPromise
    ]).catch(error => {
      console.error('Product analysis execution error:', error.message);
      return false;
    });
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Product analysis completed in ${processingTime} seconds`);
    
    if (success) {
      return NextResponse.json(
        { 
          success: true, 
          message: 'Product review analysis completed successfully',
          processing_time_seconds: Number(processingTime),
          timestamp: new Date().toISOString()
        }
      );
    } else {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Product review analysis encountered errors or timed out',
          processing_time_seconds: Number(processingTime),
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`Error in product analysis API route (after ${processingTime}s):`, error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Unknown error',
        processing_time_seconds: Number(processingTime),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 