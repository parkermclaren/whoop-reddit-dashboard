import { NextResponse } from 'next/server';
import { runContinuousPipeline } from '../../../scripts/continuous-pipeline';

// A secret key to verify the cron job requests come from Vercel
const CRON_SECRET = process.env.CRON_SECRET;

// Configure the maximum duration for this API route
export const maxDuration = 300; // 5 minutes maximum (adjust based on your Vercel plan)

// Add global type declaration for pipelineStartTime
declare global {
  var pipelineStartTime: number;
}

/**
 * This API route runs the continuous data pipeline
 * It is triggered by Vercel Cron Job (hourly)
 * 
 * To secure this endpoint, we check for:
 * 1. The x-vercel-cron header (set by Vercel for cron jobs)
 * 2. A secret key to prevent unauthorized access
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('CRON API triggered at:', new Date().toISOString());
  
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    // Security checks
    const isVercelCron = request.headers.get('x-vercel-cron') === 'true';
    const hasValidSecret = CRON_SECRET && secret === CRON_SECRET;
    
    if (!isVercelCron && !hasValidSecret) {
      console.error('Unauthorized access attempt to cron API');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log('Starting scheduled Reddit data pipeline...');
    
    // Set a global timeout flag to help the pipeline monitor runtime
    global.pipelineStartTime = Date.now();
    
    // Run the pipeline with timeout protection
    const timeoutPromise = new Promise<boolean>((_, reject) => {
      const timeoutSeconds = 280; // 4m40s (to ensure we stay under the 5m limit)
      setTimeout(() => {
        reject(new Error(`Pipeline execution timed out after ${timeoutSeconds} seconds`));
      }, timeoutSeconds * 1000);
    });
    
    // Race between pipeline completion and timeout
    const success = await Promise.race([
      runContinuousPipeline(),
      timeoutPromise
    ]).catch(error => {
      console.error('Pipeline execution error:', error.message);
      return false;
    });
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Pipeline completed in ${processingTime} seconds`);
    
    if (success) {
      return NextResponse.json(
        { 
          success: true, 
          message: 'Reddit data pipeline completed successfully',
          processing_time_seconds: Number(processingTime),
          timestamp: new Date().toISOString()
        }
      );
    } else {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Reddit data pipeline encountered errors or timed out',
          processing_time_seconds: Number(processingTime),
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`Error in cron API route (after ${processingTime}s):`, error);
    
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