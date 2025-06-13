# WHOOP Reddit Intelligence Dashboard

A sophisticated AI-powered analytics platform that transforms community conversations from r/whoop into actionable business insights. Built with Next.js, Supabase, and OpenAI's GPT-4o mini to deliver real-time sentiment analysis, feature feedback tracking, and competitive intelligence.

## 🚀 Overview

This application provides comprehensive insights into WHOOP's brand perception and customer sentiment by:
- **Continuously collecting** Reddit posts and comments from r/whoop
- **AI-analyzing** text and image content using OpenAI's GPT-4o mini
- **Categorizing** content by sentiment, themes, competitor mentions, and feature feedback
- **Generating** actionable insights for product and marketing teams
- **Visualizing** trends through an interactive dashboard

## ✨ Key Features

### 🔄 **Automated Data Pipeline**
- **Continuous collection** of new Reddit posts and comments
- **Hourly updates** via Vercel cron jobs
- **Smart metrics updates** with age-based scheduling
- **Duplicate prevention** and data integrity checks

### 🧠 **Advanced AI Analysis**
- **Multi-modal analysis** of text and images using GPT-4o mini
- **Sentiment analysis** with granular scoring (-1.0 to 1.0)
- **Theme categorization** into actionable topics
- **Feature-specific sentiment** tracking for WHOOP capabilities
- **Competitor mention detection** with context analysis
- **Cancellation signal detection** and reason extraction
- **User question extraction** for FAQ generation

### 📊 **Interactive Dashboard**
- **Real-time statistics** with engagement metrics
- **Feature analysis word cloud** with sentiment-colored visualization
- **Theme distribution** with sentiment breakdowns
- **Top posts table** with sorting and filtering
- **Feature feedback quotes** with representative examples
- **Competitor comparison** analysis
- **Cancellation insights** with actionable recommendations
- **Product satisfaction** tracking and analysis
- **FAQ clusters** from community questions

### 🔍 **Advanced Analytics**
- **Embedding-based clustering** for content similarity
- **Time-series sentiment** tracking
- **Engagement correlation** analysis
- **Product review** sentiment analysis
- **Competitive intelligence** reporting

## 🛠️ Technical Architecture

### **Frontend Stack**
- **Next.js 15** with App Router and Turbopack
- **React 19** with TypeScript
- **TailwindCSS 4** for styling
- **Chart.js & D3.js** for data visualizations
- **Lucide React** for iconography

### **Backend & Database**
- **Supabase** (PostgreSQL) for data storage
- **Supabase Auth** for authentication
- **Real-time subscriptions** for live updates

### **AI & APIs**
- **OpenAI GPT-4o mini** for text and image analysis
- **Reddit API** via Snoowrap for data collection
- **Custom embedding generation** for semantic search

### **Infrastructure**
- **Vercel** for hosting and cron jobs
- **Automated CI/CD** pipeline
- **Edge runtime** optimization

## 📋 Database Schema

### Core Tables
```sql
reddit_posts          -- Post metadata, content, and images
reddit_comments       -- Comment data with post relationships
analysis_results      -- AI analysis with multi-modal support
themes               -- Content categorization system
insights             -- AI-generated actionable insights
search_terms         -- Keyword monitoring system
collection_metadata  -- Pipeline tracking and scheduling
```

### Extended Analysis
```sql
-- Additional fields in analysis_results:
competitor_mentions  -- JSONB array of competitor comparisons
aspects             -- JSONB array of feature-specific sentiment
cancellation_mention -- Boolean flag for churn signals
cancellation_reason -- Text extraction of cancellation reasons
user_questions      -- Array of extracted user questions
embeddings         -- Vector embeddings for semantic search
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn
- Supabase account and project
- Reddit API credentials (client ID, secret, refresh token)
- OpenAI API key with GPT-4o mini access

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/your-username/whoop-reddit-dashboard.git
   cd whoop-reddit-dashboard
   npm install
   ```

2. **Configure environment variables:**
   Create `.env.local` with:
   ```bash
   # Reddit API credentials
   REDDIT_CLIENT_ID=your_reddit_client_id
   REDDIT_CLIENT_SECRET=your_reddit_client_secret
   REDDIT_REFRESH_TOKEN=your_reddit_refresh_token

   # Supabase credentials
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key

   # OpenAI API key
   OPENAI_API_KEY=your_openai_api_key

   # Cron job security (for production)
   CRON_SECRET=your_random_secret_key
   ```

3. **Initialize the database:**
   ```bash
   # Set up collection tracking
   npx ts-node src/scripts/setup-collection-metadata.ts
   ```

4. **Run initial data pipeline:**
   ```bash
   # Complete pipeline with extended analysis
   npm run pipeline -- --extended-analysis
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

## 📊 Data Pipeline Commands

### Core Pipeline
```bash
# Full pipeline (collection + analysis + insights)
npm run pipeline

# Pipeline with extended analysis (competitors, features, etc.)
npm run pipeline -- --extended-analysis

# Extended analysis only (on existing data)
npm run extended-analysis
```

### Specialized Analysis
```bash
# Generate FAQ clusters from user questions
npm run generate-faqs

# Generate semantic embeddings for content
npm run generate-embeddings

# Cluster cancellation reasons
npm run cluster-cancellations

# Product review analysis
npm run run-missing-product
```

### Utilities
```bash
# Count posts in database
npm run count-posts

# Test single post analysis
npx ts-node src/scripts/test-single-post.ts

# Estimate pipeline costs
npx ts-node src/scripts/estimate-cost.ts
```

## 🔄 Continuous Data Streaming

### Automated Collection
The system runs **hourly automated collection** via Vercel cron jobs:
- Collects new posts since last run
- Analyzes content with GPT-4o mini
- Updates engagement metrics intelligently:
  - **Recent posts (0-3 days)**: Every 6 hours
  - **Mid-age posts (4-7 days)**: Daily
  - **Older posts (7+ days)**: Weekly

### Production Deployment
1. **Deploy to Vercel:**
   ```bash
   vercel --prod
   ```

2. **Verify cron job setup** in Vercel dashboard
3. **Test pipeline:** Visit `/api/cron?secret=your_secret`

## 🔧 Advanced Features

### Multi-Modal Analysis
- **Image analysis** for WHOOP device photos and screenshots
- **Text + image context** correlation
- **Visual sentiment** analysis for product posts

### Competitive Intelligence
- **Automatic competitor detection** (Oura, Apple Watch, Garmin, Fitbit)
- **Comparison context** analysis
- **Competitive sentiment** tracking
- **Feature gap identification**

### Semantic Search & Clustering
- **Vector embeddings** for content similarity
- **FAQ auto-generation** from user questions
- **Content clustering** by semantic meaning
- **Duplicate detection** and consolidation

### Real-Time Updates
- **Live dashboard** updates without refresh
- **Streaming data** integration
- **Real-time notifications** for significant sentiment shifts

## 📈 Analytics & Insights

The dashboard provides:
- **Sentiment trends** over time
- **Feature adoption** tracking
- **Engagement correlation** analysis
- **Competitive positioning** insights
- **Churn prediction** signals
- **Product satisfaction** metrics
- **Community health** indicators

## 🔒 Security & Rate Limiting

- **API rate limiting** with intelligent backoff
- **Secure cron endpoints** with secret validation
- **Environment variable** protection
- **Database connection** pooling and security

## 📝 API Documentation

### Cron Endpoints
- `GET /api/cron` - Main pipeline trigger
- `GET /api/cron/collect` - Data collection only
- `GET /api/cron/analyze` - Analysis only
- `GET /api/cron/extended` - Extended analysis
- `GET /api/cron/metrics` - Metrics update

### Debug Endpoints
- `GET /api/debug` - Database connection test
- `GET /api/faq-clusters` - FAQ cluster data

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with the pipeline scripts
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Related Resources

- [Reddit API Documentation](https://www.reddit.com/dev/api/)
- [OpenAI GPT-4o mini Documentation](https://platform.openai.com/docs/)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

---
