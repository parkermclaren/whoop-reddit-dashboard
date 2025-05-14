import { NextResponse } from 'next/server';
import { runContinuousPipeline } from '../../../scripts/continuous-pipeline';

// A secret key to verify the cron job requests come from Vercel
const CRON_SECRET = process.env.CRON_SECRET;

// Configure the maximum duration for this API route
export const maxDuration = 60; // 60 seconds maximum (Vercel hobby plan limit)

// Add global type declaration for pipelineStartTime
declare global {
  var pipelineStartTime: number;
}

/**
 * This API route acts as a master scheduler that calls each specialized endpoint
 * It is triggered by cron-job.org
 * 
 * To secure this endpoint, we check for:
 * 1. The x-vercel-cron header (set by Vercel for cron jobs)
 * 2. A secret key to prevent unauthorized access
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('CRON API master triggered at:', new Date().toISOString());
  
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
    
    console.log('Starting Reddit dashboard master scheduler...');
    
    // Simply return instructions on how to set up the cron jobs
    // Each specialized endpoint will be called directly by cron-job.org
    
    return NextResponse.json(
      { 
        success: true, 
        message: 'WHOOP Reddit Dashboard Master Scheduler',
        instructions: 'Set up separate cron-job.org jobs for each of these endpoints:',
        endpoints: [
          '/api/cron/collect?secret=[YOUR_SECRET]',
          '/api/cron/analyze?secret=[YOUR_SECRET]',
          '/api/cron/extended?secret=[YOUR_SECRET]',
          '/api/cron/product?secret=[YOUR_SECRET]',
          '/api/cron/embeddings?secret=[YOUR_SECRET]',
          '/api/cron/metrics?secret=[YOUR_SECRET]'
        ],
        recommended_schedule: [
          { endpoint: 'collect', schedule: 'Every 2 hours' },
          { endpoint: 'analyze', schedule: 'Every 2 hours, 15 minutes after collect' },
          { endpoint: 'extended', schedule: 'Every 6 hours' },
          { endpoint: 'product', schedule: 'Every 6 hours, 15 minutes after extended' },
          { endpoint: 'embeddings', schedule: 'Every 12 hours' },
          { endpoint: 'metrics', schedule: 'Every 6 hours' }
        ],
        timestamp: new Date().toISOString()
      }
    );
  } catch (error: any) {
    console.error(`Error in master cron API:`, error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 