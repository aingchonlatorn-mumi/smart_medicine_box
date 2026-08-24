// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ Supabase URL หรือ ANON KEY ไม่พบใน Environment Variables!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const CURRENT_USER_ID = 'b2cbf842-d0aa-4dce-81f5-a587327518df';
export const CURRENT_BOX_ID = '80b4ae50-fb83-460d-8618-a740c94952a8';