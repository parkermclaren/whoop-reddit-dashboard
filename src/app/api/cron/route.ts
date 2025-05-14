import { NextResponse } from 'next/server';
import { runContinuousPipeline } from '../../../scripts/continuous-pipeline';

// A secret key to verify the cron job requests come from Vercel
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * This API route runs the continuous data pipeline
 * It is triggered by Vercel Cron Job (hourly)
 * 
 * To secure this endpoint, we check for:
 * 1. The x-vercel-cron header (set by Vercel for cron jobs)
 * 2. A secret key to prevent unauthorized access
 */
export async function GET(request: Request) {
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
    
    // Run the pipeline
    const success = await runContinuousPipeline();
    
    if (success) {
      return NextResponse.json(
        { 
          success: true, 
          message: 'Reddit data pipeline completed successfully',
          timestamp: new Date().toISOString()
        }
      );
    } else {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Reddit data pipeline completed with errors',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in cron API route:', error);
    
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