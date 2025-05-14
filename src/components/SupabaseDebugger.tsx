"use client";

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function SupabaseDebugger() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'error'>('unknown');
  
  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toISOString()}] ${message}`]);
  };
  
  const checkConnection = async () => {
    setIsChecking(true);
    setLogs([]);
    setConnectionStatus('unknown');
    
    try {
      // Check if environment variables are defined
      addLog("Checking environment variables...");
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl) {
        addLog("❌ NEXT_PUBLIC_SUPABASE_URL is missing or empty");
        setConnectionStatus('error');
        return;
      }
      
      addLog(`✅ NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl}`);
      
      if (!supabaseKey) {
        addLog("❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or empty");
        setConnectionStatus('error');
        return;
      }
      
      addLog(`✅ NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseKey.substring(0, 10)}...`);
      
      // Try to create Supabase client
      addLog("Creating Supabase client...");
      const supabase = createClient(supabaseUrl, supabaseKey);
      addLog("✅ Supabase client created");
      
      // Test a real database query
      addLog("Testing connection with a simple query...");
      
      const startTime = Date.now();
      const { data, error, status, statusText } = await supabase
        .from('reddit_posts')
        .select('*', { count: 'exact', head: true });
      const duration = Date.now() - startTime;
      
      if (error) {
        addLog(`❌ Query failed with error: ${error.message}`);
        addLog(`Status: ${status} ${statusText}`);
        setConnectionStatus('error');
        return;
      }
      
      addLog(`✅ Query successful! Response time: ${duration}ms`);
      addLog(`Status: ${status} ${statusText}`);
      addLog(`Count: ${(data as any).count}`);
      
      // Try another table
      addLog("Testing connection to theme_sentiment_stats table...");
      
      const themeResult = await supabase
        .from('theme_sentiment_stats')
        .select('*', { count: 'exact', head: true });
        
      if (themeResult.error) {
        addLog(`❌ theme_sentiment_stats query failed with error: ${themeResult.error.message}`);
        addLog(`Status: ${themeResult.status} ${themeResult.statusText}`);
      } else {
        addLog(`✅ theme_sentiment_stats query successful!`);
        addLog(`Count: ${(themeResult.data as any).count}`);
      }
      
      // Try another table
      addLog("Testing connection to analysis_results table...");
      
      const analysisResult = await supabase
        .from('analysis_results')
        .select('*', { count: 'exact', head: true });
        
      if (analysisResult.error) {
        addLog(`❌ analysis_results query failed with error: ${analysisResult.error.message}`);
        addLog(`Status: ${analysisResult.status} ${analysisResult.statusText}`);
      } else {
        addLog(`✅ analysis_results query successful!`);
        addLog(`Count: ${(analysisResult.data as any).count}`);
      }
      
      setConnectionStatus('success');
      addLog("✅ All checks complete - connection successful!");
      
    } catch (e) {
      const error = e as Error;
      addLog(`❌ Error: ${error.message}`);
      console.error(error);
      setConnectionStatus('error');
    } finally {
      setIsChecking(false);
    }
  };
  
  return (
    <div className="bg-[#24262b] rounded-xl p-6 shadow-lg">
      <h2 className="text-lg font-semibold mb-4 uppercase">Supabase Connection Debugger</h2>
      
      <div className="mb-4">
        <button
          onClick={checkConnection}
          disabled={isChecking}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {isChecking ? 'Checking...' : 'Check Connection'}
        </button>
        
        {connectionStatus === 'success' && (
          <span className="ml-3 text-green-400">✅ Connection successful</span>
        )}
        
        {connectionStatus === 'error' && (
          <span className="ml-3 text-red-400">❌ Connection failed</span>
        )}
      </div>
      
      <div className="bg-[#1a1c20] p-4 rounded-lg h-96 overflow-auto font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-gray-400">Click "Check Connection" to test your Supabase connection</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="pb-1">
              {log.includes('❌') ? (
                <p className="text-red-400">{log}</p>
              ) : log.includes('✅') ? (
                <p className="text-green-400">{log}</p>
              ) : (
                <p className="text-gray-300">{log}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
} 