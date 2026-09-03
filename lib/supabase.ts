// lib/supabase.ts — client ฝั่งเบราว์เซอร์ (anon key)
// หน้าเว็บอ่าน/เขียนข้อมูลผ่าน /api/* เป็นหลัก ไฟล์นี้เหลือไว้สำหรับงานเบา ๆ ฝั่ง client
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** บัญชี mockup ที่ seed ไว้ ใช้ตอน dev เพื่อเข้าดูหน้าจอโดยไม่ต้องลงทะเบียนใหม่ */
export const DEMO_USER_ID = 'b2cbf842-d0aa-4dce-81f5-a587327518df';
export const DEMO_BOX_ID = '80b4ae50-fb83-460d-8618-a740c94952a8';
export const DEMO_BOX_SERIAL = 'B-001';
