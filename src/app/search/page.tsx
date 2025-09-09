"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { format } from 'date-fns';
import Header from '@/components/Header';
import DateFilter from '@/components/DateFilter';

type Post = {
  id: string;
  title: string;
  author: string;
  upvotes: number;
  comments: number;
  sentiment: string;
  tone: string;
  themes: string[];
  cancellationMention: boolean;
  cancellationReason: string;
  features: { name: string; quote: string; sentiment: 'positive' | 'neutral' | 'negative' }[];
  competitors: { name: string; sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'; quote: string }[];
  userQuestions: string[];
  productReceived: string | null;
  productSatisfaction: 'positive' | 'neutral' | 'negative' | null;
  dateShort: string;
  dateYear: string;
  url: string;
  summary: string;
};

// Canonical feature list to match the main dashboard (12 total)
const DASHBOARD_FEATURES = [
  'Blood Pressure',
  'Improved Sensor accuracy',
  'Battery Pack 5.0',
  'ECG',
  'Healthspan/WHOOP Age',
  'Improved Step Counter',
  'Improved Sleep Performance',
  "Women's Hormonal Insights",
  'Stress Monitor',
  'HRV calibration',
  'Improved Auto-Detected Activities',
  'AI Assistant',
] as const;

// Normalize raw aspect feature names to the 12 canonical dashboard features
const canonicalizeFeatureName = (raw: string): string | null => {
  if (!raw) return null;
  const name = raw.toLowerCase().trim();

  // Filter out known non-features
  if (name.includes('advanced labs') || name.includes('strain')) return null;

  // Consolidation rules (keep order specific → general)
  if (name.includes('outlook')) return 'AI Assistant';
  if (name.includes('ai assistant')) return 'AI Assistant';

  if (name.includes('sleep')) return 'Improved Sleep Performance';

  if (name.includes('auto') && name.includes('detect')) return 'Improved Auto-Detected Activities';

  if (
    name.includes('irregular') ||
    name.includes('ecg') ||
    name.includes('electrocardiogram') ||
    name.includes('heart rhythm')
  ) return 'ECG';

  if (name.includes('blood pressure') || name === 'bp') return 'Blood Pressure';

  if (name.includes('sensor') && name.includes('accuracy')) return 'Improved Sensor accuracy';

  if (name.includes('battery') && name.includes('pack')) return 'Battery Pack 5.0';

  if (name.includes('whoop age') || name.includes('healthspan')) return 'Healthspan/WHOOP Age';

  if (name.includes('step') && (name.includes('counter') || name.includes('count'))) return 'Improved Step Counter';

  if (name.includes('hormonal') || name.includes("women")) return "Women's Hormonal Insights";

  if (name.includes('stress')) return 'Stress Monitor';

  if (name.includes('hrv') && name.includes('calib')) return 'HRV calibration';

  // If it doesn't match one of our 12 canonical features, ignore from filters
  return null;
};

// All consolidated competitors from CompetitorMentions.tsx
const ALL_COMPETITORS = [
  'Apple Watch',
  'Samsung Watch', 
  'Google Pixel Watch',
  'COROS',
  'Garmin',
  'Fitbit',
  'Oura',
  'Suunto',
  'Amazfit',
  'Withings',
  'Polar',
  'Eight Sleep',
  'KardiaMobile',
  'QardioCore',
  'Pulse',
  'sense.ai',
  'Zyke',
  'Orangetheory',
  'Helio Band'
] as const;

// Normalize competitor names to consolidated labels (matching CompetitorMentions.tsx)
const canonicalizeCompetitorName = (name: string): string | null => {
  if (!name) return null;
  const normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (normalizedName.includes('whoop')) return null; // not a competitor to itself
  if (normalizedName.includes('apple')) return 'Apple Watch';
  if (normalizedName.includes('samsung') || normalizedName.includes('galaxy')) return 'Samsung Watch';
  if (normalizedName.includes('google') || normalizedName.includes('pixel')) return 'Google Pixel Watch';
  if (normalizedName === 'coros' || name.toUpperCase() === 'COROS') return 'COROS';
  if (normalizedName.includes('garmin')) return 'Garmin';
  if (normalizedName.includes('fitbit')) return 'Fitbit';
  if (normalizedName.includes('oura')) return 'Oura';
  if (normalizedName.includes('suunto')) return 'Suunto';
  if (normalizedName.includes('amazfit')) return 'Amazfit';
  if (normalizedName.includes('withings')) return 'Withings';
  if (normalizedName.includes('polar')) return 'Polar';
  if (normalizedName.includes('eight sleep')) return 'Eight Sleep';
  if (normalizedName.includes('kardia') || normalizedName.includes('alivecor')) return 'KardiaMobile';
  if (normalizedName.includes('qardio')) return 'QardioCore';
  if (normalizedName === 'pulse') return 'Pulse';
  if (normalizedName.includes('sense.ai') || normalizedName.includes('sense ai')) return 'sense.ai';
  if (normalizedName.includes('zyke')) return 'Zyke';
  if (normalizedName.includes('orangetheory') || normalizedName.includes('orange theory')) return 'Orangetheory';
  if (normalizedName.includes('helio') || normalizedName.includes('helios')) return 'Helio Band';
  // default: return original unmodified (but trimmed) name
  return name.trim();
};

type TooltipPosition = {
  direction: 'top' | 'bottom';
  x: number;
  y: number;
};

function SearchPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialQuery = useMemo(() => searchParams.get('q') || '', [searchParams]);
  const [queryInput, setQueryInput] = useState<string>(initialQuery);
  
  // Sort state derived from URL
  const sortBy = useMemo<'ups' | 'date'>(() => (searchParams.get('sort') === 'date' ? 'date' : 'ups'), [searchParams]);
  const sortDir = useMemo<'asc' | 'desc'>(() => (searchParams.get('dir') === 'asc' ? 'asc' : 'desc'), [searchParams]);
  
  // Date filtering state
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [results, setResults] = useState<Post[]>([]);
  const [allResults, setAllResults] = useState<Post[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 100;
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [filters, setFilters] = useState<{ type: 'feature' | 'theme' | 'tone' | 'sentiment' | 'competitor' | 'cancel' | 'product'; value: string }[]>([]);
  const [hoveredPost, setHoveredPost] = useState<string | null>(null);
  const [hoveredCompetitor, setHoveredCompetitor] = useState<{postId: string, competitor: string, quote: string, sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'} | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<{postId: string, feature: string, quote: string, sentiment: 'positive' | 'neutral' | 'negative'} | null>(null);
  const [hoveredCancellation, setHoveredCancellation] = useState<{postId: string, reason: string} | null>(null);
  const [hoveredQuestions, setHoveredQuestions] = useState<{postId: string, questions: string[]} | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ direction: 'bottom', x: 0, y: 0 });
  const [postTimeout, setPostTimeout] = useState<NodeJS.Timeout | null>(null);
  const [competitorTimeout, setCompetitorTimeout] = useState<NodeJS.Timeout | null>(null);
  const [featureTimeout, setFeatureTimeout] = useState<NodeJS.Timeout | null>(null);
  const [cancellationTimeout, setCancellationTimeout] = useState<NodeJS.Timeout | null>(null);
  const [questionsTimeout, setQuestionsTimeout] = useState<NodeJS.Timeout | null>(null);
  const [headerTimeout, setHeaderTimeout] = useState<NodeJS.Timeout | null>(null);
  const [globalSentiment, setGlobalSentiment] = useState<{
    counts: { positive: number; neutral: number; negative: number };
    total: number;
    positivePct: number;
    neutralPct: number;
    negativePct: number;
    dominant: 'positive' | 'neutral' | 'negative' | null;
  } | null>(null);
  const [globalSentimentStatus, setGlobalSentimentStatus] = useState<'idle' | 'loading' | 'complete' | 'error'>('idle');
  const [globalFilteredCount, setGlobalFilteredCount] = useState<number | null>(null);
  const [globalFilteredStatus, setGlobalFilteredStatus] = useState<'idle' | 'loading' | 'complete' | 'error'>('idle');

  // Filter popover UI state
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);
  const [filterPanelPos, setFilterPanelPos] = useState<{ left: number; top: number; width: number } | null>(null);

  // Date popover UI state (compact "Within" chip)
  const [isDateOpen, setIsDateOpen] = useState<boolean>(false);
  const dateButtonRef = useRef<HTMLButtonElement | null>(null);
  const datePanelRef = useRef<HTMLDivElement | null>(null);
  const [datePanelPos, setDatePanelPos] = useState<{ left: number; top: number; width: number } | null>(null);

  // Derived: selected sentiment filter (if any)
  const selectedSentimentFilter = useMemo(() => {
    return filters.find((f) => f.type === 'sentiment') || null;
  }, [filters]);

  // Total to display in the "Showing X of Y" line
  const displayTotalCount = useMemo(() => {
    if (filters.length > 0) {
      if (globalFilteredCount !== null && globalFilteredCount !== undefined) return globalFilteredCount;
      // fall back to currently visible until background completes
      return results.length;
    }
    if (selectedSentimentFilter && globalSentiment) {
      const key = (selectedSentimentFilter.value || 'neutral') as 'positive' | 'neutral' | 'negative';
      return globalSentiment.counts[key] ?? 0;
    }
    return (totalCount ?? globalSentiment?.total ?? results.length);
  }, [filters.length, selectedSentimentFilter, globalSentiment, globalFilteredCount, totalCount, results.length]);

  // Refs for infinite scroll
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);



  // Aggregate sentiment summary
  // If no client-side filters are active and we have global stats, prefer those.
  const sentimentSummary = useMemo(() => {
    if (filters.length === 0 && globalSentiment) return globalSentiment;

    const counts = { positive: 0, neutral: 0, negative: 0 };
    for (const post of results) {
      const key = (post.sentiment || 'neutral') as 'positive' | 'neutral' | 'negative';
      if (key in counts) counts[key] += 1;
    }
    const total = results.length || 0;
    const positivePct = total ? Math.round((counts.positive / total) * 100) : 0;
    const neutralPct = total ? Math.round((counts.neutral / total) * 100) : 0;
    const negativePct = total ? Math.round((counts.negative / total) * 100) : 0;
    let dominant: 'positive' | 'neutral' | 'negative' | null = null;
    if (total > 0) {
      const maxVal = Math.max(counts.positive, counts.neutral, counts.negative);
      if (maxVal === counts.positive) dominant = 'positive';
      else if (maxVal === counts.neutral) dominant = 'neutral';
      else dominant = 'negative';
    }
    return { counts, total, positivePct, neutralPct, negativePct, dominant };
  }, [results, filters.length, globalSentiment]);

  useEffect(() => {
    setQueryInput(initialQuery);
  }, [initialQuery]);

  // Initialize date filters from URL params
  useEffect(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    setFromDate(fromParam || null);
    setToDate(toParam || null);
  }, [searchParams]);

  // Update URL when date filters change
  const updateDateInURL = useCallback((newFromDate: string | null, newToDate: string | null) => {
    const params = new URLSearchParams(searchParams);
    
    if (newFromDate) {
      params.set('from', newFromDate);
    } else {
      params.delete('from');
    }
    
    if (newToDate) {
      params.set('to', newToDate);
    } else {
      params.delete('to');
    }
    
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchParams, router, pathname]);

  const handleFromDateChange = useCallback((date: string | null) => {
    setFromDate(date);
    updateDateInURL(date, toDate);
  }, [toDate, updateDateInURL]);

  const handleToDateChange = useCallback((date: string | null) => {
    setToDate(date);
    updateDateInURL(fromDate, date);
  }, [fromDate, updateDateInURL]);

  // Update URL when sort changes
  const updateSortInURL = useCallback((newSortBy: 'date' | 'ups', newSortDir: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    params.set('sort', newSortBy);
    params.set('dir', newSortDir);
    params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchParams, router, pathname]);

  const handleToggleSort = useCallback((column: 'date' | 'ups') => {
    if (column === sortBy) {
      const nextDir: 'asc' | 'desc' = sortDir === 'desc' ? 'asc' : 'desc';
      updateSortInURL(column, nextDir);
    } else {
      // default to desc when switching columns (recency/highest first)
      updateSortInURL(column, 'desc');
    }
  }, [sortBy, sortDir, updateSortInURL]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (postTimeout) clearTimeout(postTimeout);
      if (competitorTimeout) clearTimeout(competitorTimeout);
      if (featureTimeout) clearTimeout(featureTimeout);
      if (cancellationTimeout) clearTimeout(cancellationTimeout);
      if (questionsTimeout) clearTimeout(questionsTimeout);
      if (headerTimeout) clearTimeout(headerTimeout);
    };
  }, [postTimeout, competitorTimeout, featureTimeout, cancellationTimeout, questionsTimeout, headerTimeout]);

  const calculateTooltipPosition = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Tooltip dimensions
    const tooltipWidth = 320;
    const tooltipMinHeight = 120; // Minimum height needed
    const tooltipMaxHeight = 250; // Maximum height allowed
    const padding = 20; // Safe distance from edges
    const arrowOffset = 8; // Space for arrow
    
    // Find the table container to constrain tooltips within it
    const tableContainer = element.closest('.overflow-x-auto');
    let containerBounds = { top: 0, bottom: viewportHeight, left: 0, right: viewportWidth };
    
    if (tableContainer) {
      const containerRect = tableContainer.getBoundingClientRect();
      containerBounds = {
        top: containerRect.top,
        bottom: containerRect.bottom,
        left: containerRect.left,
        right: containerRect.right
      };
    }
    
    // Horizontal position calculation - constrain to table bounds
    let x = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    const minX = Math.max(containerBounds.left + padding, padding);
    const maxX = Math.min(containerBounds.right - tooltipWidth - padding, viewportWidth - tooltipWidth - padding);
    x = Math.max(minX, Math.min(x, maxX));
    
    // Calculate available space within table bounds
    const spaceBelow = containerBounds.bottom - rect.bottom - padding - 20;
    const spaceAbove = rect.top - containerBounds.top - padding - 20;
    
    let direction: 'top' | 'bottom';
    let y: number;
    
    // Choose direction based on available space within table
    if (spaceBelow >= tooltipMinHeight + arrowOffset) {
      direction = 'bottom';
      y = rect.bottom + arrowOffset;
      
      // Constrain to table bottom boundary
      const maxAllowedY = containerBounds.bottom - tooltipMaxHeight - padding;
      if (y > maxAllowedY) {
        y = maxAllowedY;
      }
    } else if (spaceAbove >= tooltipMinHeight + arrowOffset) {
      direction = 'top';
      y = rect.top - arrowOffset;
      
      // Constrain to table top boundary
      const minAllowedY = containerBounds.top + tooltipMaxHeight + padding;
      if (y < minAllowedY) {
        y = minAllowedY;
      }
    } else {
      // Extremely constrained - force to side with more space
      if (spaceBelow > spaceAbove) {
        direction = 'bottom';
        y = rect.bottom + arrowOffset;
        // Force conservative bottom position within table
        y = Math.min(y, containerBounds.bottom - 100 - padding);
      } else {
        direction = 'top';
        y = rect.top - arrowOffset;
        // Force conservative top position within table
        y = Math.max(y, containerBounds.top + 100 + padding);
      }
    }
    
    // Final bounds checking within table container
    if (direction === 'bottom') {
      y = Math.min(y, containerBounds.bottom - 50 - padding);
    } else {
      y = Math.max(y, containerBounds.top + 50 + padding);
    }
    
    setTooltipPos({ direction, x, y });
  };

  // Filtering utilities
  // OR within the same category, AND across different categories
  const applyFilters = useCallback((list: Post[]) => {
    if (!filters.length) return list;

    // Group selected values by category type
    const grouped = filters.reduce<Record<string, Set<string>>>((acc, f) => {
      if (!acc[f.type]) acc[f.type] = new Set<string>();
      acc[f.type].add(f.value);
      return acc;
    }, {});

    return list.filter((post) => {
      // For each category that has selections, the post must match ANY of the values
      for (const [type, values] of Object.entries(grouped)) {
        let matches = true;
        switch (type as typeof filters[number]['type']) {
          case 'feature': {
            const hasAny = (post.features || []).some((x) => values.has(x.name));
            matches = hasAny;
            break;
          }
          case 'theme': {
            const hasAny = (post.themes || []).some((t) => values.has(t));
            matches = hasAny;
            break;
          }
          case 'tone': {
            const tone = (post.tone || '').toString();
            matches = values.has(tone);
            break;
          }
          case 'sentiment': {
            matches = values.has(post.sentiment);
            break;
          }
          case 'competitor': {
            const hasAny = (post.competitors || []).some((c) => values.has(c.name));
            matches = hasAny;
            break;
          }
          case 'cancel': {
            const yesSelected = values.has('Yes');
            const noSelected = values.has('No');
            if (yesSelected && noSelected) {
              matches = true; // both selected => any
            } else if (yesSelected) {
              matches = Boolean(post.cancellationMention);
            } else if (noSelected) {
              matches = !Boolean(post.cancellationMention);
            } else {
              matches = true;
            }
            break;
          }
          case 'product': {
            const productValue = post.productReceived || '';
            matches = values.has(productValue);
            break;
          }
          default:
            matches = true;
        }
        if (!matches) return false; // AND across categories
      }
      return true;
    });
  }, [filters]);

  const addFilter = useCallback((type: 'feature' | 'theme' | 'tone' | 'sentiment' | 'competitor' | 'cancel' | 'product', value: string) => {
    setFilters((prev) => {
      if (prev.some((f) => f.type === type && f.value === value)) return prev;
      return [...prev, { type, value }];
    });
  }, []);

  const toggleFilterSelection = useCallback((type: 'feature' | 'theme' | 'tone' | 'sentiment' | 'competitor' | 'cancel' | 'product', value: string) => {
    setFilters((prev) => {
      const existingIndex = prev.findIndex((f) => f.type === type && f.value === value);
      if (existingIndex !== -1) {
        return prev.filter((_, i) => i !== existingIndex);
      }
      return [...prev, { type, value }];
    });
  }, []);

  const isSelected = useCallback((type: 'feature' | 'theme' | 'tone' | 'sentiment' | 'competitor' | 'cancel' | 'product', value: string) => {
    return filters.some((f) => f.type === type && f.value === value);
  }, [filters]);

  const removeFilter = useCallback((idx: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
  }, []);

  // Recompute displayed results whenever filters or allResults change
  useEffect(() => {
    setResults(applyFilters(allResults));
  }, [filters, allResults, applyFilters]);

  // Close filter panel on outside click or Escape
  useEffect(() => {
    const handleDocMouseDown = (e: MouseEvent) => {
      if (!isFilterOpen) return;
      const panel = filterPanelRef.current;
      const btn = filterButtonRef.current;
      if (panel && panel.contains(e.target as Node)) return;
      if (btn && btn.contains(e.target as Node)) return;
      setIsFilterOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFilterOpen(false);
    };
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isFilterOpen]);

  // Compute position for date popover
  useEffect(() => {
    if (!isDateOpen || !dateButtonRef.current) return;
    const compute = () => {
      const r = dateButtonRef.current!.getBoundingClientRect();
      const width = Math.min(520, Math.max(420, r.width));
      const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
      const top = Math.max(12, r.bottom + 8);
      setDatePanelPos({ left, top, width });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [isDateOpen]);

  // Close date popover on Escape
  useEffect(() => {
    if (!isDateOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsDateOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDateOpen]);

  // Helpers: preset/label logic
  const isPresetActive = useCallback((days: number | null) => {
    if (days === null) return !fromDate && !toDate;
    if (!fromDate || !toDate) return false;
    const now = new Date();
    const expectedFrom = new Date(now);
    expectedFrom.setDate(now.getDate() - days);
    const fromDiff = Math.abs(new Date(fromDate).getTime() - expectedFrom.getTime());
    const toDiff = Math.abs(new Date(toDate).getTime() - now.getTime());
    return fromDiff < 3600000 && toDiff < 3600000; // 1h tolerance
  }, [fromDate, toDate]);

  const setPresetRange = useCallback((days: number | null) => {
    if (days === null) {
      setFromDate(null);
      setToDate(null);
      updateDateInURL(null, null);
      return;
    }
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - days);
    const f = from.toISOString();
    const t = now.toISOString();
    setFromDate(f);
    setToDate(t);
    updateDateInURL(f, t);
  }, [updateDateInURL]);

  const formatRangeLabel = useMemo(() => {
    const formatShort = (iso?: string | null) => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    if (!fromDate && !toDate) return 'All time';
    if (fromDate && toDate) return `${formatShort(fromDate)} – ${formatShort(toDate)}`;
    if (fromDate) return `${formatShort(fromDate)} – now`;
    return `until ${formatShort(toDate)}`;
  }, [fromDate, toDate]);

  // Compute clamped filter panel position within viewport when opened
  useEffect(() => {
    if (!isFilterOpen) return;
    const compute = () => {
      const btn = filterButtonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const width = Math.min(720, Math.floor(vw * 0.9));
      const padding = 12;
      const left = Math.max(padding, Math.min(rect.right - width, vw - width - padding));
      const top = Math.max(padding, rect.bottom + 8);
      setFilterPanelPos({ left, top, width });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [isFilterOpen]);

  // Available filter option sets (derived from allResults)
  const availableFeatures = useMemo(() => {
    // Always show the 12 dashboard features in a consistent order
    return [...DASHBOARD_FEATURES];
  }, []);

  const availableCompetitors = useMemo(() => {
    // Always show all consolidated competitors
    return [...ALL_COMPETITORS];
  }, []);

  const availableProducts = useMemo(() => {
    const set = new Set<string>();
    for (const p of allResults) if (p.productReceived) set.add(p.productReceived);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allResults]);

  const performSearch = useCallback(async (term: string, pageParam: number, append: boolean) => {
    const q = term.trim();
    if (!q) {
      setResults([]);
      setAllResults([]);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      if (!append) setTotalCount(null);

      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error('Supabase environment variables are missing');
      }

      const supabase = createClient();
      const like = `%${q}%`;

      // Count total rows
      let countQuery = supabase
        .from('reddit_posts')
        .select('*', { count: 'exact', head: true })
        .or(`title.ilike.${like},body.ilike.${like}`);
      
      if (fromDate) countQuery = countQuery.gte('created_at', fromDate);
      if (toDate) countQuery = countQuery.lte('created_at', toDate);
      
      const { count, error: countError } = await countQuery;

      if (countError) {
        throw new Error(countError.message);
      }

      const total = typeof count === 'number' ? count : 0;
      setTotalCount(total);

      if (total === 0) {
        setResults([]);
        return;
      }

      const from = (pageParam - 1) * PAGE_SIZE;
      const to = Math.min(from + PAGE_SIZE - 1, Math.max(total - 1, 0));

      // Helper: delay
      const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

      // Helper: fetch analysis with limited concurrency and retry/backoff
      const fetchAnalysisWithLimit = async (ids: string[]) => {
        const chunkSize = 40;
        const idChunks: string[][] = [];
        for (let i = 0; i < ids.length; i += chunkSize) {
          idChunks.push(ids.slice(i, i + chunkSize));
        }

        const MAX_CONCURRENT = 5;
        const results: any[][] = [];
        let idx = 0;
        while (idx < idChunks.length) {
          const batch = idChunks.slice(idx, idx + MAX_CONCURRENT);
          const batchResults = await Promise.all(
            batch.map(async (chunk) => {
              let attempts = 0;
              while (attempts < 3) {
                const { data, error } = await supabase
                  .from('analysis_results')
                  .select('*')
                  .in('content_id', chunk)
                  .eq('content_type', 'post');
                if (!error) {
                  return data || [];
                }
                attempts += 1;
                const backoff = attempts === 1 ? 200 : attempts === 2 ? 600 : 1200;
                await delay(backoff);
              }
              return [] as any[];
            })
          );
          results.push(...batchResults.map((r) => r));
          idx += MAX_CONCURRENT;
        }
        const analysisMap = new Map<string, any>();
        results.flat().forEach((row: any) => {
          analysisMap.set(row.content_id, row);
        });
        return analysisMap;
      };

      let postsQuery = supabase
        .from('reddit_posts')
        .select('*')
        .or(`title.ilike.${like},body.ilike.${like}`);
      
      if (fromDate) postsQuery = postsQuery.gte('created_at', fromDate);
      if (toDate) postsQuery = postsQuery.lte('created_at', toDate);
      
      if (sortBy === 'date') {
        postsQuery = postsQuery.order('created_at', { ascending: sortDir === 'asc' });
      } else {
        postsQuery = postsQuery.order('ups', { ascending: sortDir === 'asc' });
      }
      postsQuery = postsQuery.order('id', { ascending: sortDir === 'asc' });
      
      const { data: postsPage, error: pageError } = await postsQuery.range(from, to);

      if (pageError) {
        throw new Error(pageError.message);
      }

      const uniquePage = (postsPage || []);
      const pageIds = uniquePage.map((p) => p.id);
      const analysisMap = await fetchAnalysisWithLimit(pageIds);

        const transformed: Post[] = uniquePage.map((post: any) => {
          const analysis = analysisMap.get(post.id);
          const rawTone = analysis?.tone;
          let tone: string = '—';
          if (Array.isArray(rawTone)) {
            tone = rawTone.filter(Boolean).join(', ') || '—';
          } else if (typeof rawTone === 'string' && rawTone.trim().length > 0) {
            tone = rawTone;
          }

          const themes: string[] = Array.isArray(analysis?.themes) ? analysis.themes : [];
          const cancellationMention: boolean = Boolean(analysis?.cancellation_mention);
          const features: { name: string; quote: string; sentiment: 'positive' | 'neutral' | 'negative' }[] = (() => {
            const aspects = Array.isArray(analysis?.aspects) ? analysis.aspects : [];
            const featureMap = new Map<string, { quote: string; sentiment: 'positive' | 'neutral' | 'negative' }>();
            aspects.forEach((a: any) => {
              const rawName = (a?.feature || '').toString().trim();
              const canonical = canonicalizeFeatureName(rawName);
              if (!canonical) return;
              const quote = (a?.quote || '').toString().trim();
              const s = (a?.sentiment || 'neutral').toString().toLowerCase();
              const sentiment = (s === 'positive' || s === 'negative') ? s : 'neutral';
              if (!featureMap.has(canonical)) {
                featureMap.set(canonical, { quote: quote || 'No quote available', sentiment });
              }
            });
            return Array.from(featureMap.entries()).map(([name, data]) => ({ name, quote: data.quote, sentiment: data.sentiment }));
          })();

          const competitors: { name: string; sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'; quote: string }[] = (() => {
            const mentions = Array.isArray(analysis?.competitor_mentions) ? analysis.competitor_mentions : [];
            const competitorMap = new Map<string, { sentiment: Set<string>; quotes: string[] }>();
            mentions.forEach((m: any) => {
              const rawName = (m?.competitor || '').toString().trim();
              const name = canonicalizeCompetitorName(rawName);
              const s = (m?.comp_sentiment || 'neutral').toString().toLowerCase();
              const quote = (m?.comp_quote || '').toString().trim();
              if (!name) return;
              if (!competitorMap.has(name)) competitorMap.set(name, { sentiment: new Set(), quotes: [] });
              const entry = competitorMap.get(name)!;
              entry.sentiment.add(s);
              if (quote) entry.quotes.push(quote);
            });
            const entries: { name: string; sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'; quote: string }[] = [];
            competitorMap.forEach((data, name) => {
              let sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
              const hasPos = data.sentiment.has('positive');
              const hasNeg = data.sentiment.has('negative');
              if (hasPos && hasNeg) sentiment = 'mixed';
              else if (hasPos) sentiment = 'positive';
              else if (hasNeg) sentiment = 'negative';
              else sentiment = 'neutral';
              const quote = data.quotes.length > 0 ? data.quotes[0] : '';
              entries.push({ name, sentiment, quote });
            });
            return entries;
          })();

          const cancellationReason: string = (analysis?.cancellation_reason || '').toString().trim();
          const userQuestions: string[] = Array.isArray(analysis?.user_questions) ? analysis.user_questions : [];
          const productReceived: string | null = analysis?.product_received || null;
          const productSatisfaction: 'positive' | 'neutral' | 'negative' | null = analysis?.product_satisfaction || null;

          return {
            id: post.id,
            title: post.title || '',
            author: post.author || '',
            upvotes: post.ups || 0,
            comments: post.num_comments || 0,
            sentiment: analysis ? analysis.sentiment : 'neutral',
            tone,
            themes,
            cancellationMention,
            cancellationReason,
            features,
            competitors,
            userQuestions,
            productReceived,
            productSatisfaction,
            dateShort: post.created_at ? format(new Date(post.created_at), 'M/d') : '—',
            dateYear: post.created_at ? format(new Date(post.created_at), 'yyyy') : '—',
            url: post.url || `https://reddit.com${post.permalink || ''}`,
            summary: analysis && analysis.summary ? analysis.summary : 'No summary available',
          };
        });

        setAllResults((prev) => append ? [...prev, ...transformed] : transformed);
        setHasMore((pageParam * PAGE_SIZE) < total);
    } catch (e: any) {
      setError(e?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [PAGE_SIZE, fromDate, toDate, sortBy, sortDir]);

  const performFetchAll = useCallback(async (pageParam: number, append: boolean) => {
    try {
      setLoading(true);
      setError(null);
      if (!append) setTotalCount(null);

      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error('Supabase environment variables are missing');
      }

      const supabase = createClient();

      let countQuery = supabase
        .from('reddit_posts')
        .select('*', { count: 'exact', head: true });
      
      if (fromDate) countQuery = countQuery.gte('created_at', fromDate);
      if (toDate) countQuery = countQuery.lte('created_at', toDate);
      
      const { count, error: countError } = await countQuery;

      if (countError) throw new Error(countError.message);

      const total = typeof count === 'number' ? count : 0;
      setTotalCount(total);

      if (total === 0) {
        setResults([]);
        setAllResults([]);
        return;
      }

      const from = (pageParam - 1) * PAGE_SIZE;
      const to = Math.min(from + PAGE_SIZE - 1, Math.max(total - 1, 0));

      const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
      const fetchAnalysisWithLimit = async (ids: string[]) => {
        const chunkSize = 40;
        const idChunks: string[][] = [];
        for (let i = 0; i < ids.length; i += chunkSize) {
          idChunks.push(ids.slice(i, i + chunkSize));
        }
        const MAX_CONCURRENT = 5;
        const results: any[][] = [];
        let idx = 0;
        while (idx < idChunks.length) {
          const batch = idChunks.slice(idx, idx + MAX_CONCURRENT);
          const batchResults = await Promise.all(
            batch.map(async (chunk) => {
              let attempts = 0;
              while (attempts < 3) {
                const { data, error } = await supabase
                  .from('analysis_results')
                  .select('*')
                  .in('content_id', chunk)
                  .eq('content_type', 'post');
                if (!error) {
                  return data || [];
                }
                attempts += 1;
                const backoff = attempts === 1 ? 200 : attempts === 2 ? 600 : 1200;
                await delay(backoff);
              }
              return [] as any[];
            })
          );
          results.push(...batchResults.map((r) => r));
          idx += MAX_CONCURRENT;
        }
        const analysisMap = new Map<string, any>();
        results.flat().forEach((row: any) => analysisMap.set(row.content_id, row));
        return analysisMap;
      };

      let postsQuery = supabase
        .from('reddit_posts')
        .select('*');
      
      if (sortBy === 'date') {
        postsQuery = postsQuery.order('created_at', { ascending: sortDir === 'asc' });
      } else {
        postsQuery = postsQuery.order('ups', { ascending: sortDir === 'asc' });
      }
      postsQuery = postsQuery.order('id', { ascending: sortDir === 'asc' });
      
      if (fromDate) postsQuery = postsQuery.gte('created_at', fromDate);
      if (toDate) postsQuery = postsQuery.lte('created_at', toDate);
      
      const { data: postsPage, error: pageError } = await postsQuery.range(from, to);

      if (pageError) throw new Error(pageError.message);

      const pageIds = (postsPage || []).map((p) => p.id);
      const analysisMap = await fetchAnalysisWithLimit(pageIds);

      const transformed: Post[] = (postsPage || []).map((post: any) => {
        const analysis = analysisMap.get(post.id);
        const rawTone = analysis?.tone;
        let tone: string = '—';
        if (Array.isArray(rawTone)) {
          tone = rawTone.filter(Boolean).join(', ') || '—';
        } else if (typeof rawTone === 'string' && rawTone.trim().length > 0) {
          tone = rawTone;
        }
        const themes: string[] = Array.isArray(analysis?.themes) ? analysis.themes : [];
        const cancellationMention: boolean = Boolean(analysis?.cancellation_mention);
        const features: { name: string; quote: string; sentiment: 'positive' | 'neutral' | 'negative' }[] = (() => {
          const aspects = Array.isArray(analysis?.aspects) ? analysis.aspects : [];
          const featureMap = new Map<string, { quote: string; sentiment: 'positive' | 'neutral' | 'negative' }>();
          aspects.forEach((a: any) => {
            const rawName = (a?.feature || '').toString().trim();
            const canonical = canonicalizeFeatureName(rawName);
            if (!canonical) return;
            const quote = (a?.quote || '').toString().trim();
            const s = (a?.sentiment || 'neutral').toString().toLowerCase();
            const sentiment = (s === 'positive' || s === 'negative') ? s : 'neutral';
            if (!featureMap.has(canonical)) {
              featureMap.set(canonical, { quote: quote || 'No quote available', sentiment });
            }
          });
          return Array.from(featureMap.entries()).map(([name, data]) => ({ name, quote: data.quote, sentiment: data.sentiment }));
        })();
        const competitors: { name: string; sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'; quote: string }[] = (() => {
          const mentions = Array.isArray(analysis?.competitor_mentions) ? analysis.competitor_mentions : [];
          const competitorMap = new Map<string, { sentiment: Set<string>; quotes: string[] }>();
          mentions.forEach((m: any) => {
            const rawName = (m?.competitor || '').toString().trim();
            const name = canonicalizeCompetitorName(rawName);
            const s = (m?.comp_sentiment || 'neutral').toString().toLowerCase();
            const quote = (m?.comp_quote || '').toString().trim();
            if (!name) return;
            if (!competitorMap.has(name)) competitorMap.set(name, { sentiment: new Set(), quotes: [] });
            const entry = competitorMap.get(name)!;
            entry.sentiment.add(s);
            if (quote) entry.quotes.push(quote);
          });
          const entries: { name: string; sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'; quote: string }[] = [];
          competitorMap.forEach((data, name) => {
            let sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
            const hasPos = data.sentiment.has('positive');
            const hasNeg = data.sentiment.has('negative');
            if (hasPos && hasNeg) sentiment = 'mixed';
            else if (hasPos) sentiment = 'positive';
            else if (hasNeg) sentiment = 'negative';
            else sentiment = 'neutral';
            const quote = data.quotes.length > 0 ? data.quotes[0] : '';
            entries.push({ name, sentiment, quote });
          });
          return entries;
        })();
        const cancellationReason: string = (analysis?.cancellation_reason || '').toString().trim();
        const userQuestions: string[] = Array.isArray(analysis?.user_questions) ? analysis.user_questions : [];
        const productReceived: string | null = analysis?.product_received || null;
        const productSatisfaction: 'positive' | 'neutral' | 'negative' | null = analysis?.product_satisfaction || null;
        return {
          id: post.id,
          title: post.title || '',
          author: post.author || '',
          upvotes: post.ups || 0,
          comments: post.num_comments || 0,
          sentiment: analysis ? analysis.sentiment : 'neutral',
          tone,
          themes,
          cancellationMention,
          cancellationReason,
          features,
          competitors,
          userQuestions,
          productReceived,
          productSatisfaction,
          dateShort: post.created_at ? format(new Date(post.created_at), 'M/d') : '—',
          dateYear: post.created_at ? format(new Date(post.created_at), 'yyyy') : '—',
          url: post.url || `https://reddit.com${post.permalink || ''}`,
          summary: analysis && analysis.summary ? analysis.summary : 'No summary available',
        };
      });

      setAllResults((prev) => append ? [...prev, ...transformed] : transformed);
      setHasMore((pageParam * PAGE_SIZE) < total);
    } catch (e: any) {
      setError(e?.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [PAGE_SIZE, fromDate, toDate, sortBy, sortDir]);

  useEffect(() => {
    const q = (searchParams.get('q') || '').trim();
    const all = searchParams.get('all') === '1';
    // Reset when mode/query changes
    setPage(1);
    setHasMore(true);
    setGlobalSentiment(null);
    setGlobalSentimentStatus('idle');
    setGlobalFilteredCount(null);
    setGlobalFilteredStatus('idle');
    if (all) {
      performFetchAll(1, false);
    } else if (q) {
      performSearch(q, 1, false);
    } else {
      setResults([]);
      setAllResults([]);
      setTotalCount(null);
      setError(null);
    }
  }, [searchParams, performSearch, performFetchAll]);

  // Re-run queries when date filters change (in case URL updates don't trigger effects)
  useEffect(() => {
    const q = (searchParams.get('q') || '').trim();
    const all = searchParams.get('all') === '1';
    setPage(1);
    setHasMore(true);
    if (all) {
      performFetchAll(1, false);
    } else if (q) {
      performSearch(q, 1, false);
    }
  }, [fromDate, toDate]);

  const submitSearch = useCallback(() => {
    const q = queryInput.trim();
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (q) {
      params.set('q', q);
      params.delete('all');
      params.set('page', '1');
    } else {
      params.delete('q');
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [queryInput, router, pathname, searchParams]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const q = (searchParams.get('q') || '').trim();
    const all = searchParams.get('all') === '1';
    const nextPage = page + 1;
    setPage(nextPage);
    if (all) {
      performFetchAll(nextPage, true);
    } else if (q) {
      performSearch(q, nextPage, true);
    }
  }, [loading, hasMore, page, performFetchAll, performSearch, searchParams]);

  const toggleAllMode = useCallback(() => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (params.get('all') === '1') {
      params.delete('all');
    } else {
      params.set('all', '1');
      params.delete('q');
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  // Background global sentiment aggregation for entire result set
  useEffect(() => {
    let isCancelled = false;
    const run = async () => {
      const q = (searchParams.get('q') || '').trim();
      const all = searchParams.get('all') === '1';
      // Only run when no client-side filters are active
      if (filters.length > 0) return;

      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return;
      }

      const supabase = createClient();

      try {
        setGlobalSentimentStatus('loading');
        // Count total matching posts
        const like = `%${q}%`;
        const countQuery = supabase
          .from('reddit_posts')
          .select('*', { count: 'exact', head: true });
        const { count, error: countError } = all
          ? await countQuery
          : await supabase
              .from('reddit_posts')
              .select('*', { count: 'exact', head: true })
              .or(`title.ilike.${like},body.ilike.${like}`);

        if (countError) throw new Error(countError.message);
        const total = typeof count === 'number' ? count : 0;
        if (total === 0 || isCancelled) return setGlobalSentiment({
          counts: { positive: 0, neutral: 0, negative: 0 },
          total: 0,
          positivePct: 0,
          neutralPct: 0,
          negativePct: 0,
          dominant: null,
        });

        const pageSizeForIds = 500; // minimize round trips for ids
        const pages = Math.ceil(total / pageSizeForIds);
        const counts = { positive: 0, neutral: 0, negative: 0 } as {
          positive: number; neutral: number; negative: number;
        };

        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
        const fetchAnalysisWithLimit = async (ids: string[]) => {
          const chunkSize = 100;
          const idChunks: string[][] = [];
          for (let i = 0; i < ids.length; i += chunkSize) idChunks.push(ids.slice(i, i + chunkSize));
          const MAX_CONCURRENT = 6;
          let idx = 0;
          const results: any[][] = [];
          while (idx < idChunks.length && !isCancelled) {
            const batch = idChunks.slice(idx, idx + MAX_CONCURRENT);
            const batchResults = await Promise.all(
              batch.map(async (chunk) => {
                let attempts = 0;
                while (attempts < 3 && !isCancelled) {
                  const { data, error } = await supabase
                    .from('analysis_results')
                    .select('content_id,sentiment')
                    .in('content_id', chunk)
                    .eq('content_type', 'post');
                  if (!error) return data || [];
                  attempts += 1;
                  await delay(attempts === 1 ? 200 : attempts === 2 ? 600 : 1200);
                }
                return [] as any[];
              })
            );
            results.push(...batchResults.map((r) => r));
            idx += MAX_CONCURRENT;
          }
          const analysisMap = new Map<string, any>();
          results.flat().forEach((row: any) => analysisMap.set(row.content_id, row));
          return analysisMap;
        };

        for (let p = 0; p < pages && !isCancelled; p++) {
          const from = p * pageSizeForIds;
          const to = Math.min(from + pageSizeForIds - 1, Math.max(total - 1, 0));

          const idQuery = supabase
            .from('reddit_posts')
            .select('id')
            .order('ups', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to);

          const { data: idRows, error: idError } = all
            ? await idQuery
            : await supabase
                .from('reddit_posts')
                .select('id')
                .or(`title.ilike.${like},body.ilike.${like}`)
                .order('ups', { ascending: false })
                .order('id', { ascending: false })
                .range(from, to);

          if (idError) throw new Error(idError.message);
          const ids = (idRows || []).map((r: any) => r.id);
          if (ids.length === 0) continue;

          const analysisMap = await fetchAnalysisWithLimit(ids);
          for (const id of ids) {
            const sentiment = (analysisMap.get(id)?.sentiment || 'neutral') as 'positive' | 'neutral' | 'negative';
            if (sentiment === 'positive') counts.positive += 1;
            else if (sentiment === 'negative') counts.negative += 1;
            else counts.neutral += 1;
          }

          // Do not update UI until aggregation completes
        }

        if (!isCancelled) {
          const positivePct = Math.round((counts.positive / total) * 100);
          const neutralPct = Math.round((counts.neutral / total) * 100);
          const negativePct = Math.round((counts.negative / total) * 100);
          const maxVal = Math.max(counts.positive, counts.neutral, counts.negative);
          const dominant = total > 0
            ? (maxVal === counts.positive ? 'positive' : maxVal === counts.neutral ? 'neutral' : 'negative')
            : null;
          setGlobalSentiment({ counts, total, positivePct, neutralPct, negativePct, dominant });
          setGlobalSentimentStatus('complete');
        }
      } catch (e) {
        // Swallow background errors; UI will fall back to visible results
        if (!isCancelled) {
          setGlobalSentiment(null);
          setGlobalSentimentStatus('error');
        }
      }
    };

    run();
    return () => { isCancelled = true; };
  }, [searchParams, filters.length]);

  // Background filtered total aggregation across ALL results (OR within category, AND across categories)
  useEffect(() => {
    let isCancelled = false;
    const run = async () => {
      if (filters.length === 0) return;

      setGlobalFilteredStatus('loading');
      setGlobalFilteredCount(null);

      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        setGlobalFilteredStatus('error');
        return;
      }

      const supabase = createClient();
      const q = (searchParams.get('q') || '').trim();
      const all = searchParams.get('all') === '1';

      // Group values by type for OR-in-category logic
      const grouped = filters.reduce<Record<string, Set<string>>>((acc, f) => {
        if (!acc[f.type]) acc[f.type] = new Set<string>();
        acc[f.type].add(f.value);
        return acc;
      }, {});

      try {
        // Step 1: fetch candidate post ids by applying Supabase query for query/all only
        const like = `%${q}%`;
        const pageSizeForIds = 500;
        // Count base set size
        const { count, error: baseCountError } = all
          ? await supabase.from('reddit_posts').select('*', { count: 'exact', head: true })
          : await supabase.from('reddit_posts').select('*', { count: 'exact', head: true }).or(`title.ilike.${like},body.ilike.${like}`);
        if (baseCountError) throw new Error(baseCountError.message);
        const total = typeof count === 'number' ? count : 0;
        if (total === 0) {
          if (!isCancelled) {
            setGlobalFilteredCount(0);
            setGlobalFilteredStatus('complete');
          }
          return;
        }

        let matchedCount = 0;
        const pages = Math.ceil(total / pageSizeForIds);
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

        const fetchAnalysisWithLimit = async (ids: string[]) => {
          const chunkSize = 100;
          const idChunks: string[][] = [];
          for (let i = 0; i < ids.length; i += chunkSize) idChunks.push(ids.slice(i, i + chunkSize));
          const MAX_CONCURRENT = 6;
          let idx = 0;
          const results: any[][] = [];
          while (idx < idChunks.length && !isCancelled) {
            const batch = idChunks.slice(idx, idx + MAX_CONCURRENT);
            const batchResults = await Promise.all(
              batch.map(async (chunk) => {
                let attempts = 0;
                while (attempts < 3 && !isCancelled) {
                  const { data, error } = await supabase
                    .from('analysis_results')
                    .select('*')
                    .in('content_id', chunk)
                    .eq('content_type', 'post');
                  if (!error) return data || [];
                  attempts += 1;
                  await delay(attempts === 1 ? 200 : attempts === 2 ? 600 : 1200);
                }
                return [] as any[];
              })
            );
            results.push(...batchResults.map((r) => r));
            idx += MAX_CONCURRENT;
          }
          const analysisMap = new Map<string, any>();
          results.flat().forEach((row: any) => analysisMap.set(row.content_id, row));
          return analysisMap;
        };

        for (let p = 0; p < pages && !isCancelled; p++) {
          const from = p * pageSizeForIds;
          const to = Math.min(from + pageSizeForIds - 1, Math.max(total - 1, 0));
          const baseQuery = supabase
            .from('reddit_posts')
            .select('*')
            .order('ups', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to);
          const { data: rows, error: rowsError } = all
            ? await baseQuery
            : await supabase
                .from('reddit_posts')
                .select('*')
                .or(`title.ilike.${like},body.ilike.${like}`)
                .order('ups', { ascending: false })
                .order('id', { ascending: false })
                .range(from, to);
          if (rowsError) throw new Error(rowsError.message);
          const ids = (rows || []).map((r: any) => r.id);
          if (ids.length === 0) continue;

          const analysisMap = await fetchAnalysisWithLimit(ids);

          for (const row of rows || []) {
            if (isCancelled) break;
            const analysis = analysisMap.get(row.id) || {};

            // Evaluate OR within category
            const matchesCategory = (type: string, predicate: () => boolean) => {
              if (!(type in grouped)) return true; // no filter for this category
              return predicate();
            };

            const featureMatch = matchesCategory('feature', () => {
              const set = grouped['feature'];
              const aspects = Array.isArray(analysis?.aspects) ? analysis.aspects : [];
              // Extract unique canonical feature names
              const names = new Set<string>();
              aspects.forEach((a: any) => {
                const raw = (a?.feature || '').toString().trim();
                const canon = canonicalizeFeatureName(raw);
                if (canon) names.add(canon);
              });
              for (const n of names) { if (set.has(n)) return true; }
              return false;
            });

            const themeMatch = matchesCategory('theme', () => {
              const set = grouped['theme'];
              const themes = Array.isArray(analysis?.themes) ? analysis.themes : [];
              return themes.some((t: string) => set.has(t));
            });

            const toneMatch = matchesCategory('tone', () => {
              const set = grouped['tone'];
              const tone = (analysis?.tone && Array.isArray(analysis.tone)) ? analysis.tone.join(', ') : (analysis?.tone || '—').toString();
              return set.has(tone);
            });

            const sentimentMatch = matchesCategory('sentiment', () => {
              const set = grouped['sentiment'];
              const s = (analysis?.sentiment || 'neutral').toString();
              return set.has(s);
            });

            const competitorMatch = matchesCategory('competitor', () => {
              const set = grouped['competitor'];
              const mentions = Array.isArray(analysis?.competitor_mentions) ? analysis.competitor_mentions : [];
              const names = new Set<string>();
              mentions.forEach((m: any) => {
                const raw = (m?.competitor || '').toString().trim();
                const canon = canonicalizeCompetitorName(raw);
                if (canon) names.add(canon);
              });
              for (const n of names) { if (set.has(n)) return true; }
              return false;
            });

            const cancelMatch = matchesCategory('cancel', () => {
              const yesSelected = grouped['cancel']?.has('Yes') ?? false;
              const noSelected = grouped['cancel']?.has('No') ?? false;
              if (yesSelected && noSelected) return true;
              const mention = Boolean(analysis?.cancellation_mention);
              if (yesSelected) return mention;
              if (noSelected) return !mention;
              return true;
            });

            const productMatch = matchesCategory('product', () => {
              const set = grouped['product'];
              const productValue = (analysis?.product_received || '').toString();
              return set.has(productValue);
            });

            if (featureMatch && themeMatch && toneMatch && sentimentMatch && competitorMatch && cancelMatch && productMatch) {
              matchedCount += 1;
            }
          }
        }

        if (!isCancelled) {
          setGlobalFilteredCount(matchedCount);
          setGlobalFilteredStatus('complete');
        }
      } catch (e) {
        if (!isCancelled) {
          setGlobalFilteredStatus('error');
          setGlobalFilteredCount(null);
        }
      }
    };

    run();
    return () => { isCancelled = true; };
  }, [filters, searchParams, sortBy, sortDir]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitSearch();
    }
  };

  const handleMouseEnter = (postId: string, e: React.MouseEvent<HTMLDivElement>) => {
    // Clear any existing timeout for this tooltip type
    if (postTimeout) {
      clearTimeout(postTimeout);
      setPostTimeout(null);
    }
    // Clear other tooltips to prevent overlaps
    setHoveredCompetitor(null);
    setHoveredFeature(null);
    setHoveredCancellation(null);
    setHoveredQuestions(null);
    
    calculateTooltipPosition(e.currentTarget);
    setHoveredPost(postId);
  };

  const handleMouseLeave = () => {
    const timeout = setTimeout(() => {
      setHoveredPost(null);
    }, 100); // Small delay to prevent flickering
    setPostTimeout(timeout);
  };

  const handleCompetitorMouseEnter = (postId: string, competitor: string, quote: string, sentiment: 'positive' | 'neutral' | 'negative' | 'mixed', e: React.MouseEvent<HTMLSpanElement>) => {
    if (competitorTimeout) {
      clearTimeout(competitorTimeout);
      setCompetitorTimeout(null);
    }
    // Clear other tooltips to prevent overlaps
    setHoveredPost(null);
    setHoveredFeature(null);
    setHoveredCancellation(null);
    setHoveredQuestions(null);
    
    calculateTooltipPosition(e.currentTarget);
    setHoveredCompetitor({ postId, competitor, quote, sentiment });
  };

  const handleCompetitorMouseLeave = () => {
    const timeout = setTimeout(() => {
      setHoveredCompetitor(null);
    }, 100); // Small delay to prevent flickering
    setCompetitorTimeout(timeout);
  };

  const handleFeatureMouseEnter = (postId: string, feature: string, quote: string, sentiment: 'positive' | 'neutral' | 'negative', e: React.MouseEvent<HTMLSpanElement>) => {
    if (featureTimeout) {
      clearTimeout(featureTimeout);
      setFeatureTimeout(null);
    }
    // Clear other tooltips to prevent overlaps
    setHoveredPost(null);
    setHoveredCompetitor(null);
    setHoveredCancellation(null);
    setHoveredQuestions(null);
    
    calculateTooltipPosition(e.currentTarget);
    setHoveredFeature({ postId, feature, quote, sentiment });
  };

  const handleFeatureMouseLeave = () => {
    const timeout = setTimeout(() => {
      setHoveredFeature(null);
    }, 100);
    setFeatureTimeout(timeout);
  };

  const handleCancellationMouseEnter = (postId: string, reason: string, e: React.MouseEvent<HTMLSpanElement>) => {
    if (cancellationTimeout) {
      clearTimeout(cancellationTimeout);
      setCancellationTimeout(null);
    }
    // Clear other tooltips to prevent overlaps
    setHoveredPost(null);
    setHoveredCompetitor(null);
    setHoveredFeature(null);
    setHoveredQuestions(null);
    
    calculateTooltipPosition(e.currentTarget);
    setHoveredCancellation({ postId, reason });
  };

  const handleCancellationMouseLeave = () => {
    const timeout = setTimeout(() => {
      setHoveredCancellation(null);
    }, 100);
    setCancellationTimeout(timeout);
  };

  const handleQuestionsMouseEnter = (postId: string, questions: string[], e: React.MouseEvent<HTMLSpanElement>) => {
    if (questionsTimeout) {
      clearTimeout(questionsTimeout);
      setQuestionsTimeout(null);
    }
    // Clear other tooltips to prevent overlaps
    setHoveredPost(null);
    setHoveredCompetitor(null);
    setHoveredFeature(null);
    setHoveredCancellation(null);
    
    calculateTooltipPosition(e.currentTarget);
    setHoveredQuestions({ postId, questions });
  };

  const handleQuestionsMouseLeave = () => {
    const timeout = setTimeout(() => {
      setHoveredQuestions(null);
    }, 100);
    setQuestionsTimeout(timeout);
  };

  const handleHeaderMouseEnter = (headerType: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (headerTimeout) {
      clearTimeout(headerTimeout);
      setHeaderTimeout(null);
    }
    // Clear other tooltips to prevent overlaps
    setHoveredPost(null);
    setHoveredCompetitor(null);
    setHoveredFeature(null);
    setHoveredCancellation(null);
    setHoveredQuestions(null);
    
    calculateTooltipPosition(e.currentTarget);
    setHoveredHeader(headerType);
  };

  const handleHeaderMouseLeave = () => {
    const timeout = setTimeout(() => {
      setHoveredHeader(null);
    }, 100);
    setHeaderTimeout(timeout);
  };

  // IntersectionObserver: auto load more when sentinel appears
  useEffect(() => {
    if (!sentinelRef.current) return;
    const node = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { root: scrollContainerRef.current, rootMargin: '200px 0px', threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <main className="min-h-screen bg-[#1a1c20] text-white">
      <Header />
      
      
      <div className="container mx-auto px-4 py-6">
        <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold uppercase">Search Reddit Posts</h2>
          </div>

          <div className="mb-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center space-x-2 flex-1 min-w-[300px]">
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search e.g. whoop 5.0"
                  className="w-full max-w-lg bg-[#1E1F24] text-white placeholder-gray-400 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />

                {/* Within chip */}
                <div className="relative">
                  <button
                    ref={dateButtonRef}
                    onClick={() => setIsDateOpen((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-md bg-[#1E1F24] border border-[#3b3d44] px-3 h-10 text-sm text-gray-200 hover:bg-[#23252b] focus:outline-none focus:ring-2 focus:ring-blue-500/40 whitespace-nowrap min-w-[180px]"
                    aria-haspopup="dialog"
                    aria-expanded={isDateOpen}
                    aria-label="Change date range"
                    title="Date range"
                  >
                    <span className="text-gray-400">Within:</span>
                    <span className="font-medium text-gray-200">{formatRangeLabel}</span>
                    {(fromDate || toDate) && (
                      <span
                        onClick={(e) => { e.stopPropagation(); setPresetRange(null); setIsDateOpen(false); }}
                        className="ml-1 inline-flex items-center justify-center rounded-full bg-[#3b3d44] text-gray-200 w-4 h-4 text-[10px] hover:bg-[#4a4d55]"
                        aria-label="Clear date range"
                        title="Clear date range"
                      >
                        ×
                      </span>
                    )}
                  </button>

                  {isDateOpen && datePanelPos && createPortal(
                    <div
                      ref={datePanelRef}
                      role="dialog"
                      aria-label="Date range"
                      style={{ position: 'fixed', left: datePanelPos.left, top: datePanelPos.top, width: datePanelPos.width, maxHeight: '70vh' }}
                      className="mt-0 overflow-auto rounded-lg border border-[#3b3d44] bg-[#1E1F24] shadow-2xl z-[10000]"
                    >
                      <div className="px-4 py-3 border-b border-[#3b3d44] flex items-center justify-between sticky top-0 bg-[#1E1F24]">
                        <div className="text-sm font-semibold text-gray-200">Date range</div>
                        <button onClick={() => setIsDateOpen(false)} className="text-xs text-gray-300 hover:text-white">Close</button>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => setPresetRange(null)} className={`px-3 py-1 rounded-md border ${isPresetActive(null) ? 'bg-[#44d7b6] text-black border-[#44d7b6]' : 'bg-[#1E1F24] text-gray-200 border-[#383a3e] hover:bg-[#26282d]'}`}>All time</button>
                          <button onClick={() => setPresetRange(1)} className={`px-3 py-1 rounded-md border ${isPresetActive(1) ? 'bg-[#44d7b6] text-black border-[#44d7b6]' : 'bg-[#1E1F24] text-gray-200 border-[#383a3e] hover:bg-[#26282d]'}`}>24h</button>
                          <button onClick={() => setPresetRange(7)} className={`px-3 py-1 rounded-md border ${isPresetActive(7) ? 'bg-[#44d7b6] text-black border-[#44d7b6]' : 'bg-[#1E1F24] text-gray-200 border-[#383a3e] hover:bg-[#26282d]'}`}>7d</button>
                          <button onClick={() => setPresetRange(30)} className={`px-3 py-1 rounded-md border ${isPresetActive(30) ? 'bg-[#44d7b6] text-black border-[#44d7b6]' : 'bg-[#1E1F24] text-gray-200 border-[#383a3e] hover:bg-[#26282d]'}`}>30d</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="date" value={fromDate ? new Date(fromDate).toISOString().slice(0, 10) : ''} onChange={(e) => handleFromDateChange(e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : null)} className="bg-[#1E1F24] text-white rounded-md px-3 py-1 ring-1 ring-[#383a3e] focus:ring-[#44d7b6]/60" />
                          <span className="text-gray-400 text-sm">to</span>
                          <input type="date" value={toDate ? new Date(toDate).toISOString().slice(0, 10) : ''} onChange={(e) => handleToDateChange(e.target.value ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString() : null)} className="bg-[#1E1F24] text-white rounded-md px-3 py-1 ring-1 ring-[#383a3e] focus:ring-[#44d7b6]/60" />
                        </div>
                      </div>
                    </div>, document.body)
                  }
                </div>
                <div className="relative">
                  <button
                    ref={filterButtonRef}
                    onClick={() => setIsFilterOpen((v) => !v)}
                    className="bg-[#3D3F46] hover:bg-[#4a4d55] text-white rounded-md inline-flex items-center justify-center h-10 px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    aria-haspopup="dialog"
                    aria-expanded={isFilterOpen}
                    aria-label="Filters"
                    title="Filters"
                  >
                    <span className="sr-only">Filters</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    {filters.length > 0 && (
                      <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] w-4 h-4">
                        {filters.length}
                      </span>
                    )}
                  </button>

                  {isFilterOpen && filterPanelPos && createPortal(
                    <div
                      ref={filterPanelRef}
                      role="dialog"
                      aria-label="Filter options"
                      style={{ position: 'fixed', left: filterPanelPos.left, top: filterPanelPos.top, width: filterPanelPos.width, maxHeight: '70vh' }}
                      className="mt-0 overflow-auto rounded-lg border border-[#3b3d44] bg-[#1E1F24] shadow-2xl z-[10000]"
                    >
                      <div className="sticky top-0 bg-[#1E1F24] border-b border-[#3b3d44] px-4 py-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-200">Filters</div>
                        <div className="flex items-center gap-2">
                          {filters.length > 0 && (
                            <button onClick={clearFilters} className="text-xs text-blue-300 hover:text-blue-200 underline">
                              Clear all
                            </button>
                          )}
                          <button onClick={() => setIsFilterOpen(false)} className="text-xs px-2 py-1 rounded-md bg-[#3D3F46] hover:bg-[#4a4d55]">
                            Done
                          </button>
                        </div>
                      </div>

                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <section>
                          <div className="text-xs uppercase text-gray-400 mb-2">Sentiment</div>
                          <div className="flex flex-wrap gap-2">
                            {['positive','neutral','negative'].map((s) => (
                              <label key={s} className={`cursor-pointer inline-flex items-center gap-2 px-2 py-1 rounded-md border text-xs ${isSelected('sentiment', s) ? 'bg-[rgba(68,215,182,0.15)] border-[#44d7b6]/30 text-[#44d7b6]' : 'bg-[#24262b] border-[#3b3d44] text-gray-200'}`}>
                                <input
                                  type="checkbox"
                                  className="accent-blue-500 h-3 w-3"
                                  checked={isSelected('sentiment', s)}
                                  onChange={() => toggleFilterSelection('sentiment', s)}
                                />
                                <span className="capitalize">{s}</span>
                              </label>
                            ))}
                          </div>
                        </section>

                        <section>
                          <div className="text-xs uppercase text-gray-400 mb-2">Cancel</div>
                          <div className="flex flex-wrap gap-2">
                            {['Yes','No'].map((v) => (
                              <label key={v} className={`cursor-pointer inline-flex items-center gap-2 px-2 py-1 rounded-md border text-xs ${isSelected('cancel', v) ? 'bg-[rgba(255,99,132,0.15)] border-[#ff6384]/30 text-[#ff6384]' : 'bg-[#24262b] border-[#3b3d44] text-gray-200'}`}>
                                <input
                                  type="checkbox"
                                  className="accent-blue-500 h-3 w-3"
                                  checked={isSelected('cancel', v)}
                                  onChange={() => toggleFilterSelection('cancel', v)}
                                />
                                <span>{v}</span>
                              </label>
                            ))}
                          </div>
                        </section>

                        <section className="md:col-span-2">
                          <div className="text-xs uppercase text-gray-400 mb-2">Features</div>
                          {availableFeatures.length === 0 ? (
                            <div className="text-xs text-gray-500">No features available</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {availableFeatures.map((f) => (
                                <label key={f} className={`cursor-pointer inline-flex items-center gap-2 px-2 py-1 rounded-md border text-xs ${isSelected('feature', f) ? 'bg-[#24262b] border-[#5a5d66] text-white' : 'bg-[#24262b] border-[#3b3d44] text-gray-200'}`} title={f}>
                                  <input
                                    type="checkbox"
                                    className="accent-blue-500 h-3 w-3"
                                    checked={isSelected('feature', f)}
                                    onChange={() => toggleFilterSelection('feature', f)}
                                  />
                                  <span className="truncate max-w-[180px]" title={f}>{f}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </section>

                        <section>
                          <div className="text-xs uppercase text-gray-400 mb-2">Products</div>
                          {availableProducts.length === 0 ? (
                            <div className="text-xs text-gray-500">No products available</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {availableProducts.map((p) => (
                                <label key={p} className={`cursor-pointer inline-flex items-center gap-2 px-2 py-1 rounded-md border text-xs ${isSelected('product', p) ? 'bg-[#24262b] border-[#5a5d66] text-white' : 'bg-[#24262b] border-[#3b3d44] text-gray-200'}`} title={p}>
                                  <input
                                    type="checkbox"
                                    className="accent-blue-500 h-3 w-3"
                                    checked={isSelected('product', p)}
                                    onChange={() => toggleFilterSelection('product', p)}
                                  />
                                  <span className="truncate max-w-[180px]" title={p}>{p}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="md:col-span-2">
                          <div className="text-xs uppercase text-gray-400 mb-2">Competitors</div>
                          {availableCompetitors.length === 0 ? (
                            <div className="text-xs text-gray-500">No competitors available</div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {availableCompetitors.map((c) => (
                                <label key={c} className={`cursor-pointer inline-flex items-center gap-2 px-2 py-1 rounded-md border text-xs ${isSelected('competitor', c) ? 'bg-[#24262b] border-[#5a5d66] text-white' : 'bg-[#24262b] border-[#3b3d44] text-gray-200'}`} title={c}>
                                  <input
                                    type="checkbox"
                                    className="accent-blue-500 h-3 w-3"
                                    checked={isSelected('competitor', c)}
                                    onChange={() => toggleFilterSelection('competitor', c)}
                                  />
                                  <span className="truncate max-w-[180px]" title={c}>{c}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
                <button
                  className="bg-[#3D3F46] hover:bg-[#4a4d55] text-white rounded-md px-4 py-2 transition-colors"
                  onClick={submitSearch}
                >
                  Search
                </button>
                {searchParams.get('all') !== '1' && (
                  <button
                    onClick={toggleAllMode}
                    className="text-sm px-3 py-2 rounded-md transition-colors border bg-transparent text-blue-300 hover:text-blue-200 border-transparent"
                    title="See full dataset"
                  >
                    See full dataset
                  </button>
                )}

                {/* Sentiment bar - now aligned with other elements */}
                {(filters.length > 0 || globalSentimentStatus === 'complete') && sentimentSummary.total > 0 && (
                  <div className="relative" title={`Positive ${sentimentSummary.positivePct}%, Neutral ${sentimentSummary.neutralPct}%, Negative ${sentimentSummary.negativePct}%`}>
                    {/* Labels above segments */}
                    <div className="absolute -top-6 left-0 right-0 flex text-[12px] font-semibold select-none">
                      <div className="text-[#44d7b6]" style={{ width: `${sentimentSummary.positivePct}%`, textAlign: 'left' }}>{sentimentSummary.positivePct}%</div>
                      <div className="text-gray-300" style={{ width: `${sentimentSummary.neutralPct}%`, textAlign: 'center' }}>{sentimentSummary.neutralPct}%</div>
                      <div className="text-[#ff738d]" style={{ width: `${sentimentSummary.negativePct}%`, textAlign: 'right' }}>{sentimentSummary.negativePct}%</div>
                    </div>
                    {/* Bar aligned with other toolbar elements */}
                    <div className="w-64 h-3 bg-[#3D3F46] rounded-full overflow-hidden">
                      <div className="h-full flex">
                        <div className="h-full bg-[#44d7b6]" style={{ width: `${sentimentSummary.positivePct}%` }} />
                        <div className="h-full bg-gray-500" style={{ width: `${sentimentSummary.neutralPct}%` }} />
                        <div className="h-full bg-[#ff6384]" style={{ width: `${sentimentSummary.negativePct}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {filters.length === 0 && globalSentimentStatus === 'loading' && (
                <div className="hidden md:flex items-center gap-2 ml-auto text-xs text-gray-400" aria-live="polite">
                  Calculating sentiment across all results…
                </div>
              )}

              
            </div>
            {loading && (
              <div className="text-sm text-gray-400 mt-2">Searching…</div>
            )}
            {!loading && (displayTotalCount !== null && displayTotalCount !== undefined) && (
              <div className="text-sm text-gray-400 mt-2">
                Showing {results.length} of {displayTotalCount} total
              </div>
            )}
            {filters.length > 0 && globalFilteredStatus === 'loading' && (
              <div className="text-xs text-gray-500 mt-1">Calculating total across all results…</div>
            )}

            {/* Active filter chips */}
            {filters.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                {filters.map((f, idx) => (
                  <span
                    key={`${f.type}-${f.value}`}
                    className="flex items-center gap-2 bg-[#1E1F24] border border-[#383a3e] text-gray-200 text-xs px-2 py-1 rounded-md"
                    title={`${f.type}: ${f.value}`}
                  >
                    <span className="uppercase text-[10px] text-gray-400">{f.type}</span>
                    <span className="font-medium">{f.value}</span>
                    <button
                      onClick={() => removeFilter(idx)}
                      className="ml-1 text-gray-400 hover:text-white"
                      aria-label="Remove filter"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  onClick={clearFilters}
                  className="text-xs text-blue-300 hover:text-blue-200 underline ml-1"
                >
                  Clear filters
                </button>
              </div>
            )}
            {error && (
              <div className="text-sm text-red-400 mt-2">{error}</div>
            )}
            {!loading && !error && results.length === 0 && (initialQuery ? (
              <div className="py-6 text-gray-300">
                {fromDate || toDate
                  ? `No results for "${initialQuery}" within the selected timeframe.`
                  : `No results for "${initialQuery}". Try a different query.`}
              </div>
            ) : (
              <div className="py-6 text-gray-400">
                {fromDate || toDate
                  ? 'No posts found within the selected timeframe.'
                  : 'Enter a keyword to search posts.'}
              </div>
            ))}
          </div>

          {results.length > 0 && (
            <div ref={scrollContainerRef} className="overflow-x-auto relative max-h-[70vh] overflow-y-auto">
              <table className="min-w-[1400px] w-full divide-y divide-gray-700">
                <thead className="bg-[#24262b] sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      <button
                        onClick={() => handleToggleSort('date')}
                        className={`${sortBy === 'date' ? 'text-white' : ''} inline-flex items-center gap-1`}
                        title="Toggle sort by date"
                        aria-label="Toggle sort by date"
                      >
                        Date
                        <span className="text-[10px] opacity-80">{sortBy === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Title</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      <button
                        onClick={() => handleToggleSort('ups')}
                        className={`${sortBy === 'ups' ? 'text-white' : ''} inline-flex items-center gap-1`}
                        title="Toggle sort by upvotes"
                        aria-label="Toggle sort by upvotes"
                      >
                        Upvotes
                        <span className="text-[10px] opacity-80">{sortBy === 'ups' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    </th>
                    <th 
                      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-help"
                      onMouseEnter={(e) => handleHeaderMouseEnter('sentiment', e)}
                      onMouseLeave={handleHeaderMouseLeave}
                    >
                      Sentiment
                    </th>
                    <th 
                      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-help"
                      onMouseEnter={(e) => handleHeaderMouseEnter('tone', e)}
                      onMouseLeave={handleHeaderMouseLeave}
                    >
                      Tone
                    </th>
                    <th 
                      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-help"
                      onMouseEnter={(e) => handleHeaderMouseEnter('features', e)}
                      onMouseLeave={handleHeaderMouseLeave}
                    >
                      Features
                    </th>
                    <th 
                      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-help"
                      onMouseEnter={(e) => handleHeaderMouseEnter('competitors', e)}
                      onMouseLeave={handleHeaderMouseLeave}
                    >
                      Competitors
                    </th>
                    <th 
                      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-help"
                      onMouseEnter={(e) => handleHeaderMouseEnter('questions', e)}
                      onMouseLeave={handleHeaderMouseLeave}
                    >
                      Questions
                    </th>
                    <th 
                      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-help"
                      onMouseEnter={(e) => handleHeaderMouseEnter('cancel', e)}
                      onMouseLeave={handleHeaderMouseLeave}
                    >
                      Cancel
                    </th>
                    <th 
                      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-help"
                      onMouseEnter={(e) => handleHeaderMouseEnter('product', e)}
                      onMouseLeave={handleHeaderMouseLeave}
                    >
                      Product
                    </th>
                    <th 
                      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-help"
                      onMouseEnter={(e) => handleHeaderMouseEnter('themes', e)}
                      onMouseLeave={handleHeaderMouseLeave}
                    >
                      Themes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {results.map((post) => (
                    <tr key={post.id} className="hover:bg-[#2c2e33] transition-colors">
                      <td className="px-3 py-4">
                        <div className="leading-tight">
                          <div className="text-sm text-gray-300">{post.dateShort}</div>
                          <div className="text-xs text-gray-500">{post.dateYear}</div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div
                          className="text-sm font-medium text-white"
                          onMouseEnter={(e) => handleMouseEnter(post.id, e)}
                          onMouseLeave={handleMouseLeave}
                        >
                          <div className="text-xs text-gray-400 mb-1">u/{post.author}</div>
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-400 transition-colors"
                          >
                            {post.title}
                          </a>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-300">{post.upvotes}</td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold cursor-pointer ${
                            post.sentiment === 'positive'
                              ? 'bg-[#44d7b6]/20 text-[#44d7b6]'
                              : post.sentiment === 'negative'
                              ? 'bg-[#ff6384]/20 text-[#ff6384]'
                              : 'bg-gray-500/20 text-gray-300'
                          }`}
                          onClick={() => addFilter('sentiment', post.sentiment)}
                        >
                          {post.sentiment.charAt(0).toUpperCase() + post.sentiment.slice(1)}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-300 max-w-[160px] truncate" title={post.tone}>
                        <span className="cursor-pointer" onClick={() => post.tone && addFilter('tone', post.tone)}>
                          {post.tone || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[320px]">
                          {post.features && post.features.length > 0 ? (
                            post.features.slice(0, 5).map((f) => (
                              <span 
                                key={`${post.id}-feature-${f.name}`} 
                                className={`text-xs px-2 py-0.5 rounded-md border cursor-pointer ${
                                  f.sentiment === 'positive'
                                    ? 'bg-[rgba(68,215,182,0.15)] text-[#44d7b6] border-[#44d7b6]/30'
                                    : f.sentiment === 'negative'
                                    ? 'bg-[rgba(255,99,132,0.15)] text-[#ff6384] border-[#ff6384]/30'
                                    : 'bg-[#1E1F24] text-gray-200 border-[#383a3e]'
                                }`}
                                onMouseEnter={(e) => handleFeatureMouseEnter(post.id, f.name, f.quote, f.sentiment, e)}
                                onMouseLeave={handleFeatureMouseLeave}
                                onClick={() => addFilter('feature', f.name)}
                              >
                                {f.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                          {post.features && post.features.length > 5 && (
                            <span className="text-xs text-gray-400">+{post.features.length - 5} more</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[320px]">
                          {post.competitors && post.competitors.length > 0 ? (
                            post.competitors.slice(0, 5).map((c) => (
                              <span 
                                key={`${post.id}-competitor-${c.name}`} 
                                className="text-xs px-2 py-0.5 rounded-md border cursor-pointer bg-[#1E1F24] text-gray-200 border-[#383a3e]"
                                onMouseEnter={(e) => handleCompetitorMouseEnter(post.id, c.name, c.quote, c.sentiment, e)}
                                onMouseLeave={handleCompetitorMouseLeave}
                                onClick={() => addFilter('competitor', c.name)}
                              >
                                {c.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                          {post.competitors && post.competitors.length > 5 && (
                            <span className="text-xs text-gray-400">+{post.competitors.length - 5} more</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {post.userQuestions && post.userQuestions.length > 0 ? (
                            <span 
                              className="bg-[#1E1F24] text-gray-200 text-xs px-2 py-0.5 rounded-md border border-[#383a3e] cursor-pointer"
                              onMouseEnter={(e) => handleQuestionsMouseEnter(post.id, post.userQuestions, e)}
                              onMouseLeave={handleQuestionsMouseLeave}
                            >
                              {post.userQuestions.length}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <span 
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold cursor-pointer ${post.cancellationMention ? 'bg-[#ff6384]/20 text-[#ff6384]' : 'bg-[#3D3F46] text-gray-200'}`}
                          onMouseEnter={post.cancellationMention && post.cancellationReason ? (e) => handleCancellationMouseEnter(post.id, post.cancellationReason, e) : undefined}
                          onMouseLeave={post.cancellationMention && post.cancellationReason ? handleCancellationMouseLeave : undefined}
                          onClick={() => addFilter('cancel', post.cancellationMention ? 'Yes' : 'No')}
                        >
                          {post.cancellationMention ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        {post.productReceived ? (
                          <span 
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold cursor-pointer ${
                              post.productSatisfaction === 'positive'
                                ? 'bg-[#44d7b6]/20 text-[#44d7b6]'
                                : post.productSatisfaction === 'negative'
                                ? 'bg-[#ff6384]/20 text-[#ff6384]'
                                : 'bg-gray-500/20 text-gray-300'
                            }`}
                            onClick={() => addFilter('product', post.productReceived!)}
                          >
                            {post.productReceived === 'WHOOP 5.0' ? '5.0' : 
                             post.productReceived === 'WHOOP MG' ? 'MG' : 
                             post.productReceived}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {post.themes && post.themes.length > 0 ? (
                            post.themes.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                className="bg-[#1E1F24] text-gray-200 text-xs px-2 py-0.5 rounded-md border border-[#383a3e] cursor-pointer"
                                onClick={() => addFilter('theme', t)}
                              >
                                {t}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                          {post.themes && post.themes.length > 4 && (
                            <span className="text-xs text-gray-400">+{post.themes.length - 4} more</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-8" />
              {!loading && hasMore && (
                <div className="py-3 px-2 flex items-center justify-center">
                  <button onClick={loadMore} className="text-sm text-blue-300 hover:text-blue-200 underline">
                    Load more
                  </button>
                </div>
              )}

              {hoveredPost && (
                <div
                  onMouseEnter={() => { if (postTimeout) { clearTimeout(postTimeout); setPostTimeout(null); } }}
                  onMouseLeave={() => { const timeout = setTimeout(() => { setHoveredPost(null); }, 100); setPostTimeout(timeout); }}
                  className={`fixed z-50 w-80 p-4 bg-[#2A2D3A] border-2 rounded-md shadow-xl text-sm text-white pointer-events-auto transition-all duration-200 ease-out ${
                    results.find((p) => p.id === hoveredPost)?.sentiment === 'positive'
                      ? 'border-[#44d7b6]'
                      : results.find((p) => p.id === hoveredPost)?.sentiment === 'negative'
                      ? 'border-[#ff6384]'
                      : 'border-gray-500'
                  }`}
                  style={{
                    left: `${tooltipPos.x}px`,
                    top: tooltipPos.direction === 'bottom' ? `${tooltipPos.y}px` : 'auto',
                    bottom: tooltipPos.direction === 'top' ? `${window.innerHeight - tooltipPos.y}px` : 'auto',
                    maxHeight: tooltipPos.direction === 'bottom'
                      ? `${Math.max(120, window.innerHeight - tooltipPos.y - 24)}px`
                      : `${Math.max(120, tooltipPos.y - 24)}px`,
                    overflowY: 'auto',
                    transform: 'translateY(0)',
                    opacity: 1,
                    zIndex: 9999,
                  }}
                >
                  <div className="font-semibold mb-2 text-blue-300 border-b border-gray-700 pb-1">AI Summary</div>
                  <div className="leading-relaxed">{results.find((p) => p.id === hoveredPost)?.summary}</div>
                </div>
              )}

              {hoveredCompetitor && (
                <div
                  className={`fixed z-50 w-80 p-4 bg-[#2A2D3A] border-2 rounded-md shadow-xl text-sm text-white pointer-events-none transition-all duration-200 ease-out ${
                    hoveredCompetitor.sentiment === 'positive'
                      ? 'border-[#44d7b6]'
                      : hoveredCompetitor.sentiment === 'negative'
                      ? 'border-[#ff6384]'
                      : 'border-gray-500'
                  }`}
                  style={{
                    left: `${tooltipPos.x}px`,
                    top: tooltipPos.direction === 'bottom' ? `${tooltipPos.y}px` : 'auto',
                    bottom: tooltipPos.direction === 'top' ? `${window.innerHeight - tooltipPos.y}px` : 'auto',
                    maxHeight: tooltipPos.direction === 'bottom' 
                      ? `${Math.min(250, Math.max(120, window.innerHeight - tooltipPos.y - 70))}px`
                      : `${Math.min(250, Math.max(120, tooltipPos.y - 70))}px`,
                    overflowY: 'auto',
                    transform: 'translateY(0)',
                    opacity: 1,
                    zIndex: 9999,
                  }}
                >
                  <div className="font-semibold mb-2 text-blue-300 border-b border-gray-700 pb-1">
                    {hoveredCompetitor.competitor} Quote
                  </div>
                  <div className="leading-relaxed">
                    {hoveredCompetitor.quote ? `"${hoveredCompetitor.quote}"` : 'No quote available'}
                  </div>
                </div>
              )}

              {hoveredFeature && (
                <div
                  className={`fixed z-50 w-80 p-4 bg-[#2A2D3A] border-2 rounded-md shadow-xl text-sm text-white pointer-events-none transition-all duration-200 ease-out ${
                    hoveredFeature.sentiment === 'positive'
                      ? 'border-[#44d7b6]'
                      : hoveredFeature.sentiment === 'negative'
                      ? 'border-[#ff6384]'
                      : 'border-gray-500'
                  }`}
                  style={{
                    left: `${tooltipPos.x}px`,
                    top: tooltipPos.direction === 'bottom' ? `${tooltipPos.y}px` : 'auto',
                    bottom: tooltipPos.direction === 'top' ? `${window.innerHeight - tooltipPos.y}px` : 'auto',
                    maxHeight: tooltipPos.direction === 'bottom' 
                      ? `${Math.min(250, Math.max(120, window.innerHeight - tooltipPos.y - 70))}px`
                      : `${Math.min(250, Math.max(120, tooltipPos.y - 70))}px`,
                    overflowY: 'auto',
                    transform: 'translateY(0)',
                    opacity: 1,
                    zIndex: 9999,
                  }}
                >
                  <div className="font-semibold mb-2 text-blue-300 border-b border-gray-700 pb-1">
                    {hoveredFeature.feature} Quote
                  </div>
                  <div className="leading-relaxed">
                    {hoveredFeature.quote ? `"${hoveredFeature.quote}"` : 'No quote available'}
                  </div>
                </div>
              )}

              {hoveredCancellation && (
                <div
                  className="fixed z-50 w-80 p-4 bg-[#2A2D3A] border-2 border-[#ff6384] rounded-md shadow-xl text-sm text-white pointer-events-none transition-all duration-200 ease-out"
                  style={{
                    left: `${tooltipPos.x}px`,
                    top: tooltipPos.direction === 'bottom' ? `${tooltipPos.y}px` : 'auto',
                    bottom: tooltipPos.direction === 'top' ? `${window.innerHeight - tooltipPos.y}px` : 'auto',
                    maxHeight: tooltipPos.direction === 'bottom' 
                      ? `${Math.min(250, Math.max(120, window.innerHeight - tooltipPos.y - 70))}px`
                      : `${Math.min(250, Math.max(120, tooltipPos.y - 70))}px`,
                    overflowY: 'auto',
                    transform: 'translateY(0)',
                    opacity: 1,
                    zIndex: 9999,
                  }}
                >
                  <div className="font-semibold mb-2 text-blue-300 border-b border-gray-700 pb-1">
                    Cancellation Reason
                  </div>
                  <div className="leading-relaxed">
                    "{hoveredCancellation.reason}"
                  </div>
                </div>
              )}

              {hoveredQuestions && (
                <div
                  className="fixed z-50 w-80 p-4 bg-[#2A2D3A] border-2 border-blue-500 rounded-md shadow-xl text-sm text-white pointer-events-none transition-all duration-200 ease-out"
                  style={{
                    left: `${tooltipPos.x}px`,
                    top: tooltipPos.direction === 'bottom' ? `${tooltipPos.y}px` : 'auto',
                    bottom: tooltipPos.direction === 'top' ? `${window.innerHeight - tooltipPos.y}px` : 'auto',
                    maxHeight: tooltipPos.direction === 'bottom' 
                      ? `${Math.min(250, Math.max(120, window.innerHeight - tooltipPos.y - 70))}px`
                      : `${Math.min(250, Math.max(120, tooltipPos.y - 70))}px`,
                    overflowY: 'auto',
                    transform: 'translateY(0)',
                    opacity: 1,
                    zIndex: 9999,
                  }}
                >
                  <div className="font-semibold mb-2 text-blue-300 border-b border-gray-700 pb-1">
                    User Questions
                  </div>
                  <div className="leading-relaxed">
                    {hoveredQuestions.questions.map((question, index) => (
                      <div key={index} className="mb-2 last:mb-0">
                        <span className="text-gray-400 text-xs">Q{index + 1}:</span> {question}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hoveredHeader && (
                <div
                  className="fixed z-50 w-80 p-4 bg-[#2A2D3A] border-2 border-blue-500 rounded-md shadow-xl text-sm text-white pointer-events-none transition-all duration-200 ease-out"
                  style={{
                    left: `${tooltipPos.x}px`,
                    top: tooltipPos.direction === 'bottom' ? `${tooltipPos.y}px` : 'auto',
                    bottom: tooltipPos.direction === 'top' ? `${window.innerHeight - tooltipPos.y}px` : 'auto',
                    maxHeight: tooltipPos.direction === 'bottom' 
                      ? `${Math.min(250, Math.max(120, window.innerHeight - tooltipPos.y - 70))}px`
                      : `${Math.min(250, Math.max(120, tooltipPos.y - 70))}px`,
                    overflowY: 'auto',
                    transform: 'translateY(0)',
                    opacity: 1,
                    zIndex: 9999,
                  }}
                >
                  <div className="font-semibold mb-2 text-blue-300 border-b border-gray-700 pb-1">
                    {hoveredHeader === 'sentiment' && 'Sentiment Analysis'}
                    {hoveredHeader === 'tone' && 'Tone Detection'}
                    {hoveredHeader === 'themes' && 'Theme Extraction'}
                    {hoveredHeader === 'features' && 'Feature Analysis'}
                    {hoveredHeader === 'competitors' && 'Competitor Mentions'}
                    {hoveredHeader === 'questions' && 'User Questions'}
                    {hoveredHeader === 'cancel' && 'Cancellation Detection'}
                    {hoveredHeader === 'product' && 'Product Analysis'}
                  </div>
                  <div className="leading-relaxed">
                    {hoveredHeader === 'sentiment' && (
                      <div>
                        GPT analyzes the overall emotional tone of the post content. 
                        <span className="text-[#44d7b6]"> Positive</span> indicates satisfaction or praise, 
                        <span className="text-[#ff6384]"> negative</span> shows complaints or criticism, 
                        <span className="text-gray-300"> neutral</span> is factual or mixed.
                      </div>
                    )}
                    {hoveredHeader === 'tone' && (
                      <div>
                        GPT identifies the emotional style and attitude in the writing. 
                        Examples: frustrated, excited, confused, sarcastic, helpful, disappointed.
                        Click to filter by specific tones.
                      </div>
                    )}
                    {hoveredHeader === 'themes' && (
                      <div>
                        GPT extracts main topics and categories from the post content. 
                        These represent the primary subjects being discussed (e.g., "battery life", "shipping delays").
                        Click any theme to filter posts by that topic.
                      </div>
                    )}
                    {hoveredHeader === 'features' && (
                      <div>
                        GPT identifies specific WHOOP features, metrics, or product aspects mentioned. 
                        Each feature includes a sentiment (positive/negative/neutral) and a direct quote from the post.
                        Hover for quotes, click to filter by feature.
                      </div>
                    )}
                    {hoveredHeader === 'competitors' && (
                      <div>
                        GPT detects mentions of competing brands or products (Apple Watch, Oura, Garmin, etc.).
                        Includes sentiment analysis and direct quotes about the competitor.
                        Hover for quotes, click to filter by competitor.
                      </div>
                    )}
                    {hoveredHeader === 'questions' && (
                      <div>
                        GPT extracts questions asked by users in the post. 
                        Shows the count of questions found. Hover to see the actual questions.
                        Useful for identifying common user concerns and support needs.
                      </div>
                    )}
                    {hoveredHeader === 'cancel' && (
                      <div>
                        GPT detects if the post mentions cancelling or considering cancellation of WHOOP membership.
                        <span className="text-[#ff6384]"> Yes</span> indicates cancellation discussion, 
                        <span className="text-gray-300"> No</span> means no cancellation mentioned.
                        Hover for cancellation reasons when available.
                      </div>
                    )}
                    {hoveredHeader === 'product' && (
                      <div>
                        GPT identifies which WHOOP product the user received and their satisfaction level.
                        <span className="text-[#44d7b6]"> 5.0</span> or <span className="text-[#44d7b6]">MG</span> shows the product model.
                        Color indicates satisfaction: <span className="text-[#44d7b6]">green</span> for positive, 
                        <span className="text-[#ff6384]">red</span> for negative, <span className="text-gray-300">gray</span> for neutral.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#1a1c20] text-white"><Header /><div className="container mx-auto px-4 py-6">Loading search…</div></main>}>
      <SearchPageInner />
    </Suspense>
  );
}


