This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

# WHOOP Reddit Dashboard

A data-driven dashboard that provides insights on WHOOP's brand perception and customer sentiment from Reddit.

## Overview

This application:
1. Collects Reddit posts and comments from r/whoop
2. Uses GPT-4o mini to analyze text and image content
3. Categorizes content by sentiment, tone, and themes
4. Generates actionable insights for product and marketing teams

## Features

- **Reddit Data Collection**: Pulls posts, comments, and images from r/whoop
- **AI-Powered Analysis**: Uses OpenAI's GPT-4o mini for text and image analysis
- **Visual Dashboard**: Displays sentiment trends and key themes
- **Actionable Insights**: Generates recommendations based on user feedback
- **Categorization**: Organizes content into relevant themes like pricing, product updates, etc.

## Technical Stack

- **Frontend**: Next.js, React, TailwindCSS
- **Database**: Supabase (PostgreSQL)
- **AI/ML**: OpenAI GPT-4o mini
- **API Integration**: Reddit API via Snoowrap
- **Authentication**: Supabase Auth

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Supabase account
- Reddit API credentials
- OpenAI API key

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/whoop-reddit-dashboard.git
   cd whoop-reddit-dashboard
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with the following variables:
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

4. Run the data pipeline:
   ```
   npx ts-node src/scripts/run-pipeline.ts
   ```

5. Start the development server:
   ```
   npm run dev
   ```

## Data Pipeline

The data pipeline consists of several scripts:

1. **init-themes.ts**: Initializes theme categories for organizing content
2. **init-search-terms.ts**: Sets up search terms for monitoring specific topics
3. **reddit-collector.ts**: Fetches posts and comments from Reddit
4. **gpt-analyzer.ts**: Processes content with GPT-4o mini, including image analysis
5. **generate-insights.ts**: Creates actionable insights from analyzed data
6. **run-pipeline.ts**: Orchestrates the entire data collection and analysis process

## Database Schema

- `reddit_posts`: Stores post data including image URLs
- `reddit_comments`: Stores comment data with relationships to posts
- `analysis_results`: Stores sentiment analysis with support for image analysis
- `themes`: Categorizes content by topic
- `insights`: Stores AI-generated insights and recommendations
- `search_terms`: Tracks keywords to monitor

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
