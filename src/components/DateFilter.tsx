"use client";

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

interface DateFilterProps {
  fromDate: string | null;
  toDate: string | null;
  onFromDateChange: (date: string | null) => void;
  onToDateChange: (date: string | null) => void;
  // Optional combined setter to avoid race conditions when applying presets
  onSetRange?: (fromDate: string | null, toDate: string | null) => void;
  className?: string;
}

export default function DateFilter({ 
  fromDate, 
  toDate, 
  onFromDateChange, 
  onToDateChange,
  onSetRange,
  className = ""
}: DateFilterProps) {
  const [earliestDate, setEarliestDate] = useState<string | null>(null);

  const setPreset = (days: number | null) => {
    if (days === null) {
      // For "All time", clear date filters to show all data
      if (onSetRange) onSetRange(null, null);
      else {
        onFromDateChange(null);
        onToDateChange(null);
      }
      return;
    }
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - days);
    if (onSetRange) onSetRange(from.toISOString(), now.toISOString());
    else {
      onFromDateChange(from.toISOString());
      onToDateChange(now.toISOString());
    }
  };

  // Function to determine if a preset is active
  const isPresetActive = (days: number | null) => {
    if (days === null) {
      // "All time" is active when no date filters are applied
      return !fromDate && !toDate;
    }
    
    if (!fromDate || !toDate) return false;
    
    const now = new Date();
    const expectedFrom = new Date(now);
    expectedFrom.setDate(now.getDate() - days);
    
    // Check if the current date range matches the preset (within 1 hour tolerance)
    const fromDiff = Math.abs(new Date(fromDate).getTime() - expectedFrom.getTime());
    const toDiff = Math.abs(new Date(toDate).getTime() - now.getTime());
    
    return fromDiff < 3600000 && toDiff < 3600000; // 1 hour in milliseconds
  };

  const dateInputValue = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  const onFromInputChange = (value: string) => {
    if (!value) {
      onFromDateChange(null);
      return;
    }
    onFromDateChange(new Date(`${value}T00:00:00.000Z`).toISOString());
  };

  const onToInputChange = (value: string) => {
    if (!value) {
      onToDateChange(null);
      return;
    }
    onToDateChange(new Date(`${value}T23:59:59.999Z`).toISOString());
  };

  // Fetch earliest tracking date for display when no filters are applied
  useEffect(() => {
    let isMounted = true;
    const fetchEarliest = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('reddit_posts')
          .select('created_at')
          .order('created_at', { ascending: true })
          .limit(1);
        if (error) return;
        const first = data && data[0] && data[0].created_at ? new Date(data[0].created_at) : null;
        if (isMounted && first) {
          // Store as YYYY-MM-DD for date input display
          setEarliestDate(first.toISOString().slice(0, 10));
        }
      } catch {
        // Ignore display-only failure
      }
    };
    fetchEarliest();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className={`mx-auto max-w-5xl bg-[#1E1F24]/80 backdrop-blur supports-[backdrop-filter]:bg-[#1E1F24]/60 border border-[#2b2d31] rounded-xl shadow-md ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-2">
        <button 
          onClick={() => setPreset(null)} 
          className={`px-3 py-1 rounded-md border transition-colors ${
            isPresetActive(null) 
              ? 'bg-[#44d7b6] text-black border-[#44d7b6] hover:bg-[#3bc4a8]' 
              : 'bg-[#1E1F24] text-gray-200 border-[#383a3e] hover:bg-[#26282d]'
          }`}
        >
          All time
        </button>
        <button 
          onClick={() => setPreset(1)} 
          className={`px-3 py-1 rounded-md border transition-colors ${
            isPresetActive(1) 
              ? 'bg-[#44d7b6] text-black border-[#44d7b6] hover:bg-[#3bc4a8]' 
              : 'bg-[#1E1F24] text-gray-200 border-[#383a3e] hover:bg-[#26282d]'
          }`}
        >
          24h
        </button>
        <button 
          onClick={() => setPreset(7)} 
          className={`px-3 py-1 rounded-md border transition-colors ${
            isPresetActive(7) 
              ? 'bg-[#44d7b6] text-black border-[#44d7b6] hover:bg-[#3bc4a8]' 
              : 'bg-[#1E1F24] text-gray-200 border-[#383a3e] hover:bg-[#26282d]'
          }`}
        >
          7d
        </button>
        <button 
          onClick={() => setPreset(30)} 
          className={`px-3 py-1 rounded-md border transition-colors ${
            isPresetActive(30) 
              ? 'bg-[#44d7b6] text-black border-[#44d7b6] hover:bg-[#3bc4a8]' 
              : 'bg-[#1E1F24] text-gray-200 border-[#383a3e] hover:bg-[#26282d]'
          }`}
        >
          30d
        </button>
        <div className="flex items-center gap-2 ml-1">
          <input 
            type="date" 
            value={fromDate ? dateInputValue(fromDate) : (earliestDate || '')} 
            onChange={(e) => onFromInputChange(e.target.value)} 
            className="bg-[#1E1F24] text-white placeholder-gray-400 rounded-md px-3 py-1 outline-none ring-1 ring-[#383a3e] focus:ring-[#44d7b6]/60" 
          />
          <span className="text-gray-400 text-sm">to</span>
          <input 
            type="date" 
            value={toDate ? dateInputValue(toDate) : new Date().toISOString().slice(0, 10)} 
            onChange={(e) => onToInputChange(e.target.value)} 
            className="bg-[#1E1F24] text-white placeholder-gray-400 rounded-md px-3 py-1 outline-none ring-1 ring-[#383a3e] focus:ring-[#44d7b6]/60" 
          />
        </div>
      </div>
    </div>
  );
}
