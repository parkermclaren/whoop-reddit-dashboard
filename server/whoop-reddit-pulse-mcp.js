#!/usr/bin/env node

// Minimal MCP server: WHOOP Reddit Pulse MCP
// Implements five tools with time-window params to query Supabase read-only

// NOTE: Keep stdout reserved for JSON-RPC. Route logs to stderr.

const USE_TTY_HEALTH_LOG = false; // set true while local debugging ONLY (writes to stderr)

// Lazy ESM imports to support CommonJS context without "type":"module"
const importMcp = () => import('@modelcontextprotocol/sdk/server');
const importZod = () => import('zod');
const importSupabase = () => import('@supabase/supabase-js');

// Load env in local CLI runs (no-op in hosted envs)
try {
	const path = require('path');
	const fs = require('fs');
	const dotenv = require('dotenv');
	const projectRoot = path.resolve(__dirname, '..');
	const envLocal = path.join(projectRoot, '.env.local');
	const envFile = path.join(projectRoot, '.env');
	if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
	if (fs.existsSync(envFile)) dotenv.config({ path: envFile });
	// Fallback to default if cwd happens to be project root
	dotenv.config();
} catch (_) {}

/**
 * Utilities
 */
function logErr(...args) {
	try { console.error('[whoop-mcp]', ...args); } catch (_) {}
}

function clampWindow(startISO, endISO, maxDays) {
	const start = new Date(startISO);
	const end = new Date(endISO);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		throw new Error('Invalid startISO or endISO');
	}
	if (end < start) {
		throw new Error('endISO must be >= startISO');
	}
	const ms = end.getTime() - start.getTime();
	if (typeof maxDays === 'number' && isFinite(maxDays)) {
		const maxMs = maxDays * 24 * 60 * 60 * 1000;
		if (ms > maxMs) {
			throw new Error(`Time window too large; maximum is ${maxDays} days`);
		}
	}
	return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function defaultWindow(days = 7) {
	const end = new Date();
	const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
	return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function pick(obj, keys) {
	const out = {};
	for (const k of keys) if (k in obj) out[k] = obj[k];
	return out;
}

async function fetchAllPaged(createQuery, pageSize = 1000, maxPages = 100) {
	const results = [];
	for (let page = 0; page < maxPages; page++) {
		const from = page * pageSize;
		const to = from + pageSize - 1;
		const { data, error } = await createQuery().range(from, to);
		if (error) throw new Error(error.message);
		const rows = data || [];
		results.push(...rows);
		if (rows.length < pageSize) break;
	}
	return results;
}

async function main() {
	const [mcpMod, stdioMod, zodMod, supabaseMod] = await Promise.all([
		importMcp(),
		import('@modelcontextprotocol/sdk/server/stdio.js'),
		importZod(),
		importSupabase()
	]);
	const { Server } = mcpMod;
	const { StdioServerTransport } = stdioMod;
	const z = zodMod.z || zodMod.default;
	const { createClient } = supabaseMod;

	const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
		logErr('Missing Supabase env vars NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
	}
	const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL || '', NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
		auth: { persistSession: false },
		realtime: { params: { eventsPerSecond: 0 } }
	});

	// Schemas
	const WindowBase = z.object({
		useWindow: z.boolean().optional().default(false),
		startISO: z.string().datetime().optional(),
		endISO: z.string().datetime().optional()
	});
	const WindowShape = {
		useWindow: z.boolean().optional().default(false),
		startISO: z.string().datetime().optional(),
		endISO: z.string().datetime().optional()
	};

	const FeatureLeadersParams = WindowBase.extend({
		minMentions: z.number().int().min(1).max(100).optional().default(5)
	});
	const FeatureLeadersShape = {
		...WindowShape,
		minMentions: z.number().int().min(1).max(100).optional().default(5)
	};

	const EngagementTopPostsParams = WindowBase.extend({
		limit: z.number().int().min(1).max(25).optional().default(25),
		filterSentiment: z.enum(['all', 'positive', 'neutral', 'negative']).optional().default('all')
	});
	const EngagementTopPostsShape = {
		...WindowShape,
		limit: z.number().int().min(1).max(25).optional().default(25),
		filterSentiment: z.enum(['all', 'positive', 'neutral', 'negative']).optional().default('all')
	};

	const FaqTopClustersParams = WindowBase.extend({
		topN: z.number().int().min(1).max(20).optional().default(5)
	});
	const FaqTopClustersShape = {
		...WindowShape,
		topN: z.number().int().min(1).max(20).optional().default(5)
	};

	// Helpers
	function resolveWindow(params) {
		// Treat empty strings as undefined to avoid invalid datetime errors
		const cleaned = {
			useWindow: params?.useWindow ?? false,
			startISO: params?.startISO ? String(params.startISO).trim() : undefined,
			endISO: params?.endISO ? String(params.endISO).trim() : undefined
		};
		if (cleaned.startISO === '') cleaned.startISO = undefined;
		if (cleaned.endISO === '') cleaned.endISO = undefined;

		// If flag is false, ignore any dates (all-time)
		if (!cleaned.useWindow) {
			return null;
		}

		const parsed = WindowBase.safeParse(cleaned);
		if (!parsed.success) throw new Error('Invalid window parameters');
		const { startISO, endISO } = parsed.data;
		if ((startISO && !endISO) || (!startISO && endISO)) {
			throw new Error('Provide both startISO and endISO or neither');
		}
		if (!startISO && !endISO) {
			return null;
		}
		return clampWindow(startISO, endISO);
	}

	// Server
	const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
	const server = new McpServer({
		    name: 'WHOOP Reddit Pulse MCP',
		version: '0.1.0',
		instructions: 'Default to ALL-TIME results. Do NOT synthesize startISO/endISO unless the user explicitly specifies a time window. Prefer returning structured JSON; the server will paginate if needed.'
	});

	// Tool: feature_sentiment_leaders
	server.registerTool('feature_sentiment_leaders',
		{
			title: 'Feature Sentiment Leaders',
			description: 'Rank features/aspects by positive sentiment and volume within a window; include sample quotes and links',
			inputSchema: FeatureLeadersShape
		},
		async (params) => {
		const window = resolveWindow(params);
		const minMentions = params.minMentions ?? 5;

		// Fetch feature aspects from analysis_results with pagination
		const data = await fetchAllPaged(() => {
			let q = supabase
				.from('analysis_results')
				.select('content_id, aspects, sentiment, summary')
				.eq('content_type', 'post')
				.order('inserted_at', { ascending: true });
			if (window) {
				q = q.gte('inserted_at', window.startISO).lte('inserted_at', window.endISO);
			}
			return q;
		});
		if (!data || data.length === 0) return { window, features: [] };

		const featureMap = new Map();
		for (const row of data) {
			if (!row || !row.aspects) continue;
			// aspects expected shape: [{ feature: string, sentiment: 'positive'|'neutral'|'negative', quote?: string }]
			try {
				const aspects = Array.isArray(row.aspects) ? row.aspects : [];
				for (const a of aspects) {
					if (!a || !a.feature) continue;
					const f = a.feature;
					if (!featureMap.has(f)) featureMap.set(f, { name: f, counts: { positive: 0, neutral: 0, negative: 0 }, examples: [] });
					const cur = featureMap.get(f);
					if (a.sentiment === 'positive') cur.counts.positive++;
					else if (a.sentiment === 'negative') cur.counts.negative++;
					else cur.counts.neutral++;
					if (a.quote) {
						cur.examples.push({ text: a.quote, url: null, post_id: row.content_id });
					}
				}
			} catch (_) {}
		}

		// Convert and filter
		let features = Array.from(featureMap.values()).map((f) => {
			const total = f.counts.positive + f.counts.neutral + f.counts.negative;
			return {
				name: f.name,
				counts: f.counts,
				positive_share: total > 0 ? f.counts.positive / total : 0,
				top_quotes: f.examples.slice(0, 3)
			};
		}).filter((f) => (f.counts.positive + f.counts.neutral + f.counts.negative) >= minMentions);

		features.sort((a, b) => b.positive_share - a.positive_share || (b.counts.positive + b.counts.neutral + b.counts.negative) - (a.counts.positive + a.counts.neutral + a.counts.negative));

		// Attach URLs for examples when available
		const postIds = new Set();
		for (const f of features) for (const ex of f.top_quotes) if (ex.post_id) postIds.add(ex.post_id);
		if (postIds.size > 0) {
			const { data: posts } = await supabase
				.from('reddit_posts')
				.select('id, url, title')
				.in('id', Array.from(postIds));
			const map = new Map();
			(posts || []).forEach(p => map.set(p.id, p));
			for (const f of features) for (const ex of f.top_quotes) if (ex.post_id && map.has(ex.post_id)) {
				ex.url = map.get(ex.post_id).url;
				ex.post_title = map.get(ex.post_id).title;
			}
		}

		return { content: [{ type: 'text', text: JSON.stringify({ window: window || { startISO: null, endISO: null, note: 'All time data' }, features }, null, 2) }] };
	});

	// Tool: competitor_share_of_voice
	server.registerTool('competitor_share_of_voice',
		{
			title: 'Competitor Share of Voice',
			description: 'Rank competitors by mentions; sentiment breakdown with quotes',
			inputSchema: WindowShape
		},
		async (params) => {
		const window = resolveWindow(params);
		
		const data = await fetchAllPaged(() => {
			let q = supabase
				.from('analysis_results')
				.select('content_id, competitor_mentions, sentiment')
				.eq('content_type', 'post')
				.order('inserted_at', { ascending: true });
			if (window) {
				q = q.gte('inserted_at', window.startISO).lte('inserted_at', window.endISO);
			}
			return q;
		});
		if (!data) return { window, competitors: [] };

		const compMap = new Map();
		for (const row of data) {
			const mentions = Array.isArray(row.competitor_mentions) ? row.competitor_mentions : [];
			for (const m of mentions) {
				if (!m) continue;
				const competitorName = m.name || m.competitor || m.brand || m.vendor || null;
				if (!competitorName) continue;
				const key = competitorName;
				if (!compMap.has(key)) compMap.set(key, { name: key, counts: { total: 0, positive: 0, neutral: 0, negative: 0 }, examples: [] });
				const entry = compMap.get(key);
				entry.counts.total += 1;
				const mentionSentiment = (m.comp_sentiment || m.sentiment || row.sentiment || 'neutral');
				if (mentionSentiment === 'positive') entry.counts.positive += 1;
				else if (mentionSentiment === 'negative') entry.counts.negative += 1;
				else entry.counts.neutral += 1;
				const quoteText = m.comp_quote || m.quote || null;
				if (quoteText) entry.examples.push({ text: quoteText, post_id: row.content_id });
			}
		}

		let competitors = Array.from(compMap.values());
		competitors.sort((a, b) => b.counts.total - a.counts.total);

		// hydrate URLs
		const ids = new Set();
		for (const c of competitors) for (const ex of c.examples) if (ex.post_id) ids.add(ex.post_id);
		if (ids.size > 0) {
			const { data: posts } = await supabase
				.from('reddit_posts')
				.select('id, url, title')
				.in('id', Array.from(ids));
			const map = new Map();
			(posts || []).forEach(p => map.set(p.id, p));
			for (const c of competitors) for (const ex of c.examples) if (ex.post_id && map.has(ex.post_id)) {
				ex.url = map.get(ex.post_id).url;
				ex.post_title = map.get(ex.post_id).title;
			}
		}

		return { content: [{ type: 'text', text: JSON.stringify({ window: window || { startISO: null, endISO: null, note: 'All time data' }, competitors }, null, 2) }] };
	});

	// Tool: cancellation_insights
	server.registerTool('cancellation_insights',
		{
			title: 'Cancellation Insights',
			description: 'Top cancellation reasons with counts/percent and example threads',
			inputSchema: WindowShape
		},
		async (params) => {
		const window = resolveWindow(params);

		const data = await fetchAllPaged(() => {
			let q = supabase
				.from('analysis_results')
				.select('id, content_id, cancellation_mention, cancellation_reason')
				.eq('content_type', 'post')
				.eq('cancellation_mention', true)
				.order('inserted_at', { ascending: true });
			if (window) {
				q = q.gte('inserted_at', window.startISO).lte('inserted_at', window.endISO);
			}
			return q;
		});
		if (!data || data.length === 0) return { window, reasons: [] };

		const reasonCounts = new Map();
		for (const r of data) {
			const reason = (r.cancellation_reason || 'Unspecified').trim();
			if (!reasonCounts.has(reason)) reasonCounts.set(reason, { reason, count: 0, examples: [] });
			reasonCounts.get(reason).count += 1;
			reasonCounts.get(reason).examples.push({ post_id: r.content_id });
		}
		const total = data.length;
		let reasons = Array.from(reasonCounts.values()).map(r => ({
			reason: r.reason,
			count: r.count,
			percent: total > 0 ? r.count / total : 0,
			examples: r.examples.slice(0, 3)
		})).sort((a, b) => b.count - a.count);

		// hydrate URLs
		const ids = new Set(); for (const r of reasons) for (const ex of r.examples) if (ex.post_id) ids.add(ex.post_id);
		if (ids.size > 0) {
			const { data: posts } = await supabase
				.from('reddit_posts')
				.select('id, url, title')
				.in('id', Array.from(ids));
			const map = new Map(); (posts || []).forEach(p => map.set(p.id, p));
			for (const r of reasons) for (const ex of r.examples) if (ex.post_id && map.has(ex.post_id)) {
				ex.url = map.get(ex.post_id).url;
				ex.post_title = map.get(ex.post_id).title;
			}
		}

		return { content: [{ type: 'text', text: JSON.stringify({ window: window || { startISO: null, endISO: null, note: 'All time data' }, reasons }, null, 2) }] };
	});

	// Tool: engagement_top_posts
	server.registerTool('engagement_top_posts',
		{
			title: 'Engagement Top Posts',
			description: 'Highest-engagement threads in the window; include sentiment, aspects and links',
			inputSchema: EngagementTopPostsShape
		},
		async (params) => {
		const window = resolveWindow(params);
		const limit = params.limit ?? 10;
		const filter = params.filterSentiment ?? 'all';

		// 1) get posts by engagement within window
		let postQuery = supabase
			.from('reddit_posts')
			.select('id, title, url, ups, num_comments, score, created_at')
			.order('ups', { ascending: false })
			.limit(100);
		
		// Apply time filter only if window is specified
		if (window) {
			postQuery = postQuery.gte('created_at', window.startISO).lte('created_at', window.endISO);
		}
		const { data: posts, error: postsError } = await postQuery;
		if (postsError) throw new Error(postsError.message);
		if (!posts || posts.length === 0) return { window, posts: [] };

		// 2) fetch analysis for these posts
		const ids = posts.map(p => p.id);
		let analysisQuery = supabase
			.from('analysis_results')
			.select('content_id, sentiment, aspects')
			.in('content_id', ids)
			.eq('content_type', 'post');
		if (filter !== 'all') {
			analysisQuery = analysisQuery.eq('sentiment', filter);
		}
		const { data: analysis, error: analysisError } = await analysisQuery;
		if (analysisError) throw new Error(analysisError.message);
		const byId = new Map(); (analysis || []).forEach(a => byId.set(a.content_id, a));

		const combined = posts
			.map(p => ({
				title: p.title,
				url: p.url,
				engagement: { ups: p.ups, num_comments: p.num_comments, score: p.score },
				sentiment: byId.get(p.id)?.sentiment || null,
				aspects: Array.isArray(byId.get(p.id)?.aspects) ? byId.get(p.id).aspects.map(x => pick(x, ['feature', 'sentiment'])) : []
			}))
			.filter(item => filter === 'all' ? true : (item.sentiment === filter))
			.slice(0, limit);

		return { content: [{ type: 'text', text: JSON.stringify({ window: window || { startISO: null, endISO: null, note: 'All time data' }, posts: combined }, null, 2) }] };
	});

	// Tool: faq_top_clusters
	server.registerTool('faq_top_clusters',
		{
			title: 'FAQ Top Clusters',
			description: 'Most active FAQ topics in the window; include example threads',
			inputSchema: FaqTopClustersShape
		},
		async (params) => {
		const window = resolveWindow(params);
		const topN = params.topN ?? 5;

		// Use question_clusters and question_embeddings; fall back to counts from analysis_results when needed
		const { data: clusters, error: clusterError } = await supabase
			.from('question_clusters')
			.select('id, topic, question_count')
			.order('question_count', { ascending: false })
			.limit(topN);
		if (clusterError) throw new Error(clusterError.message);
		if (!clusters || clusters.length === 0) return { window, topics: [] };

		// For examples, get up to 3 questions per cluster within window from question_embeddings if available
		const clusterIds = clusters.map(c => c.id);
		let questionsQuery = supabase
			.from('question_embeddings')
			.select('cluster_id, question, post_url, reddit_post_id, created_at')
			.in('cluster_id', clusterIds);
		
		// Apply time filter only if window is specified
		if (window) {
			questionsQuery = questionsQuery.gte('created_at', window.startISO).lte('created_at', window.endISO);
		}
		
		const { data: questions, error: qErr } = await questionsQuery;
		if (qErr) throw new Error(qErr.message);

		const byCluster = new Map();
		for (const c of clusters) byCluster.set(c.id, []);
		for (const q of (questions || [])) {
			if (!byCluster.has(q.cluster_id)) byCluster.set(q.cluster_id, []);
			byCluster.get(q.cluster_id).push(q);
		}

		const topics = clusters.map(c => ({
			topic: c.topic || `Cluster ${c.id}`,
			count: c.question_count || (byCluster.get(c.id)?.length || 0),
			examples: (byCluster.get(c.id) || []).slice(0, 3).map(q => ({ question: q.question, url: q.post_url }))
		}));

		return { content: [{ type: 'text', text: JSON.stringify({ window: window || { startISO: null, endISO: null, note: 'All time data' }, topics }, null, 2) }] };
	});

	// Transport
	const transport = new StdioServerTransport();
	superviseProcess();
	await server.connect(transport);
	if (USE_TTY_HEALTH_LOG) logErr('WHOOP Reddit Pulse MCP server started');
}

function superviseProcess() {
	process.on('uncaughtException', (err) => {
		logErr('uncaughtException', err?.message);
	});
	process.on('unhandledRejection', (reason) => {
		logErr('unhandledRejection', reason?.message || String(reason));
	});
}

main().catch((err) => {
	logErr('Fatal error starting MCP server:', err?.message || err);
	process.exit(1);
}); 