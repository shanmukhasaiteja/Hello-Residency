import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the env vars are present; the app shows setup help otherwise. */
export const isConfigured = Boolean(url && anonKey);

// The anon key is public by design. Never use the service_role key in the browser.
export const supabase: SupabaseClient<Database> = createClient<Database>(
  url || 'http://localhost:54321',
  anonKey || 'missing-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);
