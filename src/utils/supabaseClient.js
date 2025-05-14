import { createClient } from './supabase/client';

// Create a singleton instance of the Supabase client
export const supabase = createClient(); 