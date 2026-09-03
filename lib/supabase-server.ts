// lib/supabase-server.ts — client ฝั่ง server สำหรับ route handlers และ cron
// ใช้ SUPABASE_SERVICE_ROLE_KEY ถ้ามี (ข้าม RLS ได้ → ข้อมูลนิ่ง ไม่โดน policy บล็อก)
// ถ้าไม่ได้ตั้งค่าไว้ จะถอยไปใช้ anon key แทน
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const key = serviceKey || anonKey;
  if (!url || !key) throw new Error('ไม่พบค่า Supabase ใน environment variables');
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** ใช้เตือนในหน้า /api/health ว่ายังไม่ได้ใส่ service role key */
export const hasServiceRole = Boolean(serviceKey);
