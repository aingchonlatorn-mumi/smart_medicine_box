// lib/api.ts — ตัวช่วยฝั่ง server ที่ route handler ใช้ร่วมกัน
import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase-server';
import { slotsForDate, type DoseSlot } from './schedule';
import { addDays, bangkokDateTime, bangkokToday } from './time';
import type { Box, DoseLog, Medicine, Schedule, User } from './types';

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** ตัวตนผู้ใช้ (prototype: ส่งมาทาง header x-user-id จาก localStorage ฝั่ง client) */
export function userIdFrom(req: Request): string | null {
  const header = req.headers.get('x-user-id');
  if (header) return header;
  const param = new URL(req.url).searchParams.get('user_id');
  return param || null;
}

export interface UserContext {
  user: User;
  box: Box | null;
  medicine: Medicine | null;
  schedules: Schedule[];
}

/** โหลดข้อมูลชุดหลักของผู้ใช้ทีเดียว (ผู้ใช้ 1 คน = กล่อง 1 ใบ) */
export async function loadContext(userId: string): Promise<UserContext | null> {
  const db = supabaseAdmin();

  const { data: user } = await db
    .from('users').select('*').eq('user_id', userId).maybeSingle();
  if (!user) return null;

  const { data: box } = await db
    .from('boxes').select('*').eq('owner_user_id', userId).maybeSingle();

  const { data: medicines } = await db
    .from('medicines').select('*').eq('user_id', userId)
    .order('created_at', { ascending: true });

  let schedules: Schedule[] = [];
  if (box) {
    const { data } = await db
      .from('schedules').select('*').eq('box_id', box.box_id)
      .eq('active', true).order('time', { ascending: true });
    schedules = (data as Schedule[]) || [];
  }

  return {
    user: user as User,
    box: (box as Box) || null,
    medicine: ((medicines as Medicine[]) || [])[0] || null,
    schedules,
  };
}

/** ตรวจ secret ของ cron — ถ้ายังไม่ตั้ง CRON_SECRET จะปล่อยผ่าน (โหมด dev) */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get('secret') === secret;
}

/** normalize เบอร์โทรให้เหลือแต่ตัวเลข 10 หลัก */
export function normalizePhone(input: string): string {
  return (input || '').replace(/\D/g, '').slice(0, 10);
}

/** "001" หรือ "B-001" → "B-001" */
export function normalizeSerial(input: string): string {
  const digits = (input || '').replace(/\D/g, '').slice(0, 3);
  return digits.length === 3 ? `B-${digits}` : (input || '').trim().toUpperCase();
}

/* ------------------------------------------------------------------ */
/* มื้อยาย้อนหลัง — รวมตารางเวลา + log จริง                             */
/* ------------------------------------------------------------------ */


/**
 * มื้อยาทั้งหมดตั้งแต่ from ถึง to (รวมปลายทั้งสองข้าง, "YYYY-MM-DD" เวลาไทย)
 * เรียงจากใหม่ไปเก่า
 */
export async function loadSlots(
  context: UserContext,
  from: string,
  to: string = bangkokToday(),
): Promise<DoseSlot[]> {
  const db = supabaseAdmin();

  const { data } = await db
    .from('logs')
    .select('*')
    .eq('user_id', context.user.user_id)
    .gte('scheduled_time', bangkokDateTime(from, '00:00').toISOString())
    .lt('scheduled_time', bangkokDateTime(addDays(to, 1), '00:00').toISOString())
    .order('scheduled_time', { ascending: false });

  const logs = (data as DoseLog[]) || [];
  const medicineName = context.medicine?.name || 'ยา';
  const now = new Date();
  const slots: DoseSlot[] = [];

  for (let date = to; date >= from; date = addDays(date, -1)) {
    slots.push(
      ...slotsForDate({
        schedules: context.schedules,
        logs,
        date,
        medicineName,
        at: now,
      }),
    );
  }

  return slots.sort((a, b) => b.scheduled_time.localeCompare(a.scheduled_time));
}
