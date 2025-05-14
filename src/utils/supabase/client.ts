import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Create a Supabase client for browser-side usage with only the public anon key
export const createClient = () => {
  // Next.js automatically loads variables from .env.local into process.env.NEXT_PUBLIC_*
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  console.log('Creating Supabase client with:', { 
    hasUrl: !!supabaseUrl, 
    hasAnonKey: !!supabaseAnonKey,
    url: supabaseUrl ? supabaseUrl.substring(0, 10) + '...' : undefined,
    key: supabaseAnonKey ? supabaseAnonKey.substring(0, 10) + '...' : undefined
  });
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Check your .env.local file.');
    // Return a safer fallback that won't cause runtime errors
    // Using default values from the database
    return createSupabaseClient(
      'https://hzzmolvlmwlhpxpqhpib.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6em1vbHZsbXdsaHB4cHFocGliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY0MzU3OTQsImV4cCI6MjAzMjAxMTc5NH0.LPQg_Yim5A1ASJ0p5LPBH3b6i3F-BoICYo7eWQUcRXE'
    );
  }
  
  try {
    const client = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    console.log('Supabase client created successfully');
    return client;
  } catch (error) {
    console.error('Error creating Supabase client:', error);
    // Fallback to hardcoded values if client creation fails
    return createSupabaseClient(
      'https://hzzmolvlmwlhpxpqhpib.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6em1vbHZsbXdsaHB4cHFocGliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY0MzU3OTQsImV4cCI6MjAzMjAxMTc5NH0.LPQg_Yim5A1ASJ0p5LPBH3b6i3F-BoICYo7eWQUcRXE'
    );
  }
}; 