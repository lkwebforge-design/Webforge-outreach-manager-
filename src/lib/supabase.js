import { createClient } from "@supabase/supabase-js";

// Publishable keys are designed for browser use. Row Level Security protects user data.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://ylvklbyxybcuclnilxph.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_RxaBdHNI_keXe4WWXHe3OA_4EgahQ8C";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;
