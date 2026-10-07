import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabaseConfigured = Boolean(url && key);
export const supabaseConfigMessage = !url
  ? 'VITE_SUPABASE_URL পাওয়া যায়নি। .env.local ঠিক আছে কি না দেখুন।'
  : !key
    ? 'VITE_SUPABASE_PUBLISHABLE_KEY পাওয়া যায়নি। .env.local ঠিক আছে কি না দেখুন।'
    : '';

export const supabase = supabaseConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export function getSupabaseError(error) {
  const message = error?.message || '';
  if (/invalid api key/i.test(message)) {
    return 'Supabase API key ভুল বা পুরোনো। Supabase Dashboard → Connect → Publishable key/anon key থেকে সঠিক key .env.local-এ দিন, তারপর Vite আবার চালু করুন।';
  }
  if (/jwt|token/i.test(message)) return 'Supabase session/টোকেন সমস্যা হয়েছে। আবার Login করুন।';
  return message || 'Supabase অনুরোধটি সম্পন্ন হয়নি।';
}
