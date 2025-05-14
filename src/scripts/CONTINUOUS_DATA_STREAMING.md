# Continuous Data Streaming for WHOOP Reddit Dashboard

This document explains how to set up continuous data streaming from Reddit to your Supabase database, with automatic analysis using GPT-4o mini.

## Overview

The continuous data pipeline does the following:

1. Collects new Reddit posts from r/whoop since the last collection time
2. Runs initial analysis using GPT-4o mini on unprocessed posts
3. Runs extended analysis (competitor mentions, feature sentiment, etc.) on newly analyzed posts
4. Runs product review analysis on newly analyzed posts
5. Updates the database with all results

This entire process is automated through Vercel Cron Jobs to run hourly.

## Setup Steps

### 1. Initialize the Collection Metadata Table

Before deploying, run the setup script to create the collection metadata table:

```bash
npx ts-node src/scripts/setup-collection-metadata.ts
```

This will:
- Create the `collection_metadata` table if it doesn't exist
- Initialize the last collection time to May 11, 2025
- Set up tracking for the collection process

### 2. Configure Environment Variables

Ensure these environment variables are set in your Vercel project:

```
# Reddit API credentials
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password

# Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key

# OpenAI API key
OPENAI_API_KEY=your_openai_api_key

# Cron job security
CRON_SECRET=your_random_secret_key
```

Create a strong random string for the `CRON_SECRET` to secure your API endpoint.

### 3. Deploy to Vercel

Deploy your project to Vercel. The `vercel.json` file is already configured to run the cron job hourly.

```bash
vercel --prod
```

### 4. Set up Vercel Cron Jobs

The `vercel.json` file already has the cron job configuration, but you'll need to ensure that Vercel Cron Jobs is enabled for your project:

1. Go to your Vercel project dashboard
2. Navigate to Settings > Cron Jobs
3. Verify that Cron Jobs are enabled
4. Check that your cron job is scheduled correctly (every hour at minute 0)

### 5. Test the Pipeline

You can manually test the pipeline by:

1. Visiting your API endpoint in a browser: `https://your-vercel-app.vercel.app/api/cron?secret=your_random_secret_key`
2. Check your Supabase database to verify that new data is being collected and analyzed

## How It Works

### Collection Tracking

The system tracks the last time data was collected in the `collection_metadata` table:

- Every time the pipeline runs, it fetches posts newer than the last collection time
- After collection, it updates this timestamp to the current time
- This ensures no posts are missed and no duplicates are created

### Metrics Update for Existing Posts

The system automatically updates the engagement metrics (upvotes and comment counts) for existing posts with an age-based schedule:

- **Recent posts (0-3 days old)**: Updated every 6 hours
- **Mid-age posts (4-7 days old)**: Updated once per day at midnight
- **Older posts (>7 days old)**: Updated once per week on Sunday at midnight

This intelligent schedule ensures that posts with higher activity get more frequent updates while reducing the load on the Reddit API for older posts that rarely change.

The metrics update process:
1. Only updates `ups` and `num_comments` (no analyzer is triggered)
2. Automatically skips posts that have been deleted on Reddit
3. Processes posts in batches to avoid memory issues and rate limits

### Analysis Pipeline

The analysis pipeline is sequential:

1. **Basic Analysis**: Every new post gets analyzed for sentiment, themes, etc.
2. **Extended Analysis**: Posts that have basic analysis but not extended analysis get additional data points
3. **Product Review Analysis**: Similarly, posts are checked for product review information

Each analysis task is tracked separately in the database, so no post will be analyzed twice for the same task.

### Automatic Dashboard Updates

Your dashboard will automatically reflect the latest data without requiring any code changes. The visualizations pull from the Supabase database directly, so as new data is added, the dashboard will display it on refresh.

## Troubleshooting

If the pipeline isn't working as expected, check:

1. **Environment Variables**: Ensure all environment variables are correctly set in Vercel
2. **Vercel Logs**: Check the function logs in your Vercel dashboard
3. **API Rate Limits**: If you're hitting Reddit or OpenAI rate limits, adjust the timing in the pipeline
4. **Database Permissions**: Ensure your Supabase service key has the right permissions

## Manual Execution

You can manually run the data pipeline using:

```bash
npx ts-node src/scripts/continuous-pipeline.ts
```

This will run the complete pipeline once, and is useful for testing or one-off updates.

You can also run just the metrics update with:

```bash
npx ts-node src/scripts/run-metrics-update.ts
``` 