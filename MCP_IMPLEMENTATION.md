### MCP Integration: Live Marketing Insights via Model Context Protocol

This document describes a minimal, production‑minded MCP integration that enables an LLM client (e.g., Claude Desktop or Cursor) to fetch live insights from the Reddit dashboard data for marketing purposes. It covers the chosen approach, tool catalog, setup, configuration, testing, and guardrails.

---

### Overview

- **Goal**: Allow an LLM to answer natural questions about live community discussions and performance signals (e.g., “Which feature had the most positive sentiment in the last 7 days?”).
- **Approach**: A small Node.js MCP server (stdio transport) exposing a curated set of tools. Each tool accepts a time window, queries Supabase read‑only, and returns structured JSON for the LLM to summarize.
- **Why curated tools**: Fast to ship, stable response shapes, safe by default. Still flexible enough for common ad‑hoc marketing questions.
- **Name**: WHOOP Reddit Pulse MCP

---

### Architecture

- **Client**: Claude Desktop or Cursor (acts as MCP client)
- **MCP Server**: Node.js using `@modelcontextprotocol/sdk` over stdio
- **Data Source**: Supabase Postgres (read‑only via anon key with RLS)
- **Key tables**:
  - `reddit_posts`: post metadata, engagement (ups, num_comments), timestamps, links
  - `analysis_results`: sentiment (+score), `aspects` (feature-level sentiment JSON), `competitor_mentions` (JSON), cancellation flags/reasons, product satisfaction, timestamps
  - `question_clusters` + `question_embeddings`: FAQ topics and source threads
  - `metrics_update_logs`: deltas for ups/comments to find growth leaders

---

### Tool Catalog (marketing‑focused)

Each tool accepts a time window and returns structured JSON. Parameters are validated with `zod` and bounded (limits, defaults).

1) feature_sentiment_leaders
- **Purpose**: Rank features/aspects by positive sentiment and volume within a window; include sample quotes and links
- **Params**:
  - `startISO` (string, ISO 8601)
  - `endISO` (string, ISO 8601)
  - `minMentions` (number, optional, default 5)
- **Response (example)**:
```json
{
  "window": {"startISO": "...", "endISO": "..."},
  "features": [
    {
      "name": "Auto-Measure",
      "counts": {"positive": 42, "neutral": 18, "negative": 9},
      "positive_share": 0.58,
      "top_quotes": [
        {"text": "...", "post_title": "...", "url": "..."}
      ]
    }
  ]
}
```

2) competitor_share_of_voice
- **Purpose**: Rank competitors by mentions; sentiment breakdown with representative quotes
- **Params**: `startISO`, `endISO`
- **Response**:
```json
{
  "competitors": [
    {
      "name": "Apple Watch",
      "counts": {"total": 61, "positive": 15, "neutral": 30, "negative": 16},
      "examples": [{"text": "...", "url": "..."}]
    }
  ]
}
```

3) cancellation_insights
- **Purpose**: Top cancellation reasons with counts/percent and example threads
- **Params**: `startISO`, `endISO`
- **Response**:
```json
{
  "reasons": [
    {
      "reason": "Price/value",
      "count": 23,
      "percent": 0.34,
      "examples": [{"post_title": "...", "url": "..."}]
    }
  ]
}
```

4) engagement_top_posts
- **Purpose**: Highest‑engagement threads in the window; include sentiment/themes/aspects and links
- **Params**:
  - `startISO`, `endISO`
  - `limit` (number, default 10, max 25)
  - `filterSentiment` ("all" | "positive" | "neutral" | "negative", default "all")
- **Response**:
```json
{
  "posts": [
    {
      "title": "...",
      "url": "...",
      "engagement": {"ups": 320, "num_comments": 140, "score": 242},
      "sentiment": "positive",
      "aspects": [
        {"feature": "Smart Alarms", "sentiment": "positive"}
      ]
    }
  ]
}
```

5) faq_top_clusters
- **Purpose**: Most active FAQ topics in the window; include example threads
- **Params**: `startISO`, `endISO`, `topN` (default 5)
- **Response**:
```json
{
  "topics": [
    {
      "topic": "Battery & Charging",
      "count": 18,
      "examples": [{"question": "...", "url": "..."}]
    }
  ]
}
```

---

### Implementation Notes

- **Server file**: `server/whoop-community-pulse-mcp.js` (suggested path)
- **Core libs**: `@modelcontextprotocol/sdk`, `zod`, `@supabase/supabase-js`
- **Transport**: stdio (no HTTP server needed)
- **Data access**: Supabase anon key (read‑only) with RLS; enforce limits/timeouts in code
- **Time window**: UTC ISO timestamps; server computes any derived boundaries (e.g., last 7 days)

---

### Setup

1) Install dependencies
```bash
npm i @modelcontextprotocol/sdk zod @supabase/supabase-js
```

2) Environment variables (read‑only)
```bash
export NEXT_PUBLIC_SUPABASE_URL=... 
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

3) Run locally with MCP Inspector
```bash
npx @modelcontextprotocol/inspector node server/whoop-community-pulse-mcp.js
```

---

### Client Configuration

#### Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "whoop-community-pulse": {
      "command": "node",
      "args": [
        "/absolute/path/to/server/whoop-community-pulse-mcp.js"
      ],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "YOUR_ANON_KEY"
      }
    }
  }
}
```
Restart Claude Desktop after saving.

Host configuration tips
- Use absolute paths in the `args` for the server file (avoid relative paths).
- If `node` isn’t on PATH for the host, provide the full path (output of `which node`).
- After any config edits, fully restart the host (quit and reopen Claude Desktop/Cursor).
- Ensure the JSON is valid; malformed config prevents tool discovery.

#### Cursor (project‑scoped)
Create `.cursor/mcp.json` in the project:
```json
{
  "mcpServers": {
    "whoop-community-pulse": {
      "command": "node",
      "args": [
        "/absolute/path/to/server/whoop-community-pulse-mcp.js"
      ],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "YOUR_ANON_KEY"
      }
    }
  }
}
```

---

### Example Prompts (for marketing insights)
- "In the past 7 days, which feature leads by positive sentiment? Include representative quotes and links."
- "Rank competitors by mentions and sentiment this week; include example threads."
- "Top cancellation reasons in the last 30 days; suggest brief objection‑handling points."
- "Give the 10 highest‑engagement threads from the last 72 hours with their dominant themes."
- "Which FAQ topics spiked this week? Link to representative discussions."

---

### Security & Guardrails
- Logging (stdio): never write logs to stdout; route logs to stderr or a file. Avoid `console.log` to stdout. Use a logging library configured for stderr.
- Read‑only Supabase anon key with strict RLS.
- Secrets: store credentials in environment variables; never print or log keys or tokens.
- Validate tool params with `zod`; enforce max `limit`, maximum window size, and short timeouts.
- Sanitize/format responses; return JSON and let the LLM summarize.
- Log errors non‑verbosely; avoid leaking internal details.

---

### Testing Checklist
- Inspector: list tools, run each with a small window.
- Sanity checks: totals sum correctly; links resolve.
- Edge cases: empty results; very small/very large windows; limit boundaries.

---

### Future Enhancements
- **Remote MCP (SSE/HTTP)** with auth/rate limiting for broader access.
- **Open explore tool**: a safe, bounded query builder for more ad‑hoc analysis.
- **Caching**: memoize recent windows to reduce load and latency.
- **Delta views**: include week‑over‑week or month‑over‑month change for core metrics. 