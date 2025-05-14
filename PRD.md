PRD: WHOOP Reddit Insight Dashboard
Overview
This application is designed to provide data-driven and AI-generated insights on WHOOP’s brand perception and customer sentiment surrounding its recent product launches, as discussed on Reddit. The tool will aggregate relevant Reddit posts, analyze sentiment and discussion themes, and present the results in an intuitive dashboard format.

Objective
To build a lightweight, automated dashboard that:

Pulls Reddit posts related to WHOOP and recent product launches (e.g., WHOOP 5.0, new features, pricing changes).

Categorizes and analyzes posts by sentiment and discussion themes using GPT.

Visualizes sentiment trends and top user concerns over time.

Provides AI-generated summaries and key takeaways from recent community discussions.

Target Users
WHOOP product and marketing teams

Brand and community managers

Customer experience teams

Core Features (v1 MVP)
1. Data Ingestion
Pull recent posts and comments from:

r/whoop subreddit

Posts mentioning keywords like “WHOOP 5.0”, “new membership”, “WHOOP pricing”, etc.

Use Reddit’s API or Pushshift API to retrieve top 300–500 posts from the past 2–4 weeks.

2. Data Storage
Store raw post data (title, body, author, timestamp, permalink, upvotes) in a structured table (e.g., Supabase or local JSON/CSV for MVP).

3. Sentiment Analysis
Run GPT-4o (or another LLM) on each post body with a prompt to label sentiment as:

Positive

Neutral

Negative

Optionally tag tone or inferred intent (e.g., “frustrated”, “curious”, “impressed”).

4. Thematic Categorization
Use GPT to assign each post a topic label (e.g., “Price Concerns”, “Battery Life Feedback”, “Membership Debate”) based on content.

Cluster posts under these themes for display.

5. AI Insights
Generate summary blurbs per category answering:

What are users saying?

What concerns/praises come up most?

What should WHOOP consider in response?

Example GPT prompt:

“Summarize the top 3 concerns from 40 Reddit posts about WHOOP pricing. Include one representative quote for each and suggest one actionable recommendation.”

6. Dashboard UI
Clean interface displaying:

Sentiment bar chart (Positive / Neutral / Negative)

Table or cards of categories with # of posts and summary

Timeline view of sentiment shifts

“Top Quotes of the Week” section

GPT-generated action recommendations per theme

Tools & Stack
Reddit API (or Pushshift API) for data scraping

OpenAI GPT-4o for categorization and summarization

Supabase / CSV for lightweight data storage

Streamlit / Retool / Gradio / simple web UI for dashboard (whichever is fastest for rapid build)

Deliverables
Working app that displays analyzed Reddit data and GPT-powered insights

Clean UI for reviewing real-time themes and sentiment

Easily extensible structure for adding new platforms later (Twitter, YouTube, etc.)

