# WHOOP Reddit Dashboard Scripts

This directory contains the scripts used for data collection, analysis, and insight generation for the WHOOP Reddit Dashboard.

## Overview

- `reddit-collector.ts` - Collects data from Reddit using the Reddit API
- `gpt-analyzer.ts` - Analyzes Reddit posts using OpenAI's GPT-4o mini
- `extended-analyzer.ts` - Adds enhanced analysis with competitor mentions, feature sentiment, etc.
- `generate-insights.ts` - Generates insights based on analyzed data
- `init-themes.ts` - Initializes themes in the database
- `init-search-terms.ts` - Initializes search terms in the database
- `run-pipeline.ts` - Runs the entire data pipeline in sequence
- `run-extended-analysis.ts` - Runs only the extended analysis on existing posts
- `count-posts.ts` - Utility script to count posts in the database
- `estimate-cost.ts` - Estimates the cost of running the pipeline
- `test-single-post.ts` - Tests the analysis on a single post

## How to Run

### Complete Pipeline

To run the complete pipeline, which will:
1. Initialize search terms and themes (if needed)
2. Collect Reddit data
3. Analyze posts with GPT-4o mini
4. Generate insights

Run:
```bash
npm run pipeline
```

### Extended Analysis

To run the pipeline with extended analysis (competitor mentions, feature sentiment, etc.):

```bash
npm run pipeline -- --extended-analysis
```

To run just the extended analysis on existing posts (without collecting new data):

```bash
npm run extended-analysis
```

## Extended Analysis Features

The extended analysis adds the following data points to each analyzed post:

### Competitor Mentions

Identifies mentions of WHOOP competitors (Oura, Apple Watch, Garmin, Fitbit) with:
- The specific competitor mentioned
- The context of the comparison
- Sentiment (positive/neutral/negative compared to WHOOP)
- Representative quote

### Aspect-Based Feature Sentiment

Extracts sentiment about specific WHOOP features:
- Feature name (from a predefined list)
- Sentiment (positive/neutral/negative)
- Sentiment score (-1.0 to 1.0)
- Representative quote

### Cancellation Signals

Detects if users are threatening to cancel or have canceled:
- Boolean flag for cancellation mention
- Reason for cancellation (if mentioned)

### User Questions

Extracts questions users are asking about:
- Products
- Subscriptions
- Features
- Usage

## Database Schema Additions

The extended analysis adds the following fields to the `analysis_results` table:

- `competitor_mentions` (JSONB array)
- `aspects` (JSONB array)
- `cancellation_mention` (boolean)
- `cancellation_reason` (text)
- `user_questions` (text array)

## Reddit Collector

The `reddit-collector.ts` script fetches posts from r/whoop subreddit, extracts metadata including image URLs, and analyzes the content using GPT-4o mini.

### Setup

1. Create a `.env` file in the project root with the following variables:

```
# Reddit API credentials
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_REFRESH_TOKEN=your_reddit_refresh_token

# Supabase credentials
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key

# OpenAI API key
OPENAI_API_KEY=your_openai_api_key
```

2. Make sure you have installed all dependencies:

```bash
npm install
```

### Running the script

To run the Reddit collector script:

```bash
npx ts-node src/scripts/reddit-collector.ts
```

## Getting Reddit API Credentials

1. Go to https://www.reddit.com/prefs/apps
2. Create a new app (choose "script")
3. Get the client ID and client secret
4. For the refresh token, use the Reddit OAuth flow with "permanent" scope

## Notes on Data Collection

- The script collects posts from the past week from r/whoop
- For each post, it saves:
  - Post data (title, body, author, timestamps, upvotes, etc.)
  - Top comments (up to 15 per post)
  - Selected replies (up to 3 per comment)
  - Image URLs (if any images are present in the post)

- GPT-4o mini analyzes each post for:
  - Sentiment (positive, neutral, negative)
  - Sentiment score (0-1)
  - Tone (emotional tone categories)
  - Themes (main topics discussed)
  - Keywords
  - Image content (if images are present) 