import { NextResponse } from 'next/server';
import { cronAuthorized, jsonError } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { MISSED_AFTER_MINUTES } from '@/lib/schedule';
import { timeOf } from '@/lib/time';
import { flexMissedAlert } from '@/lib/flex';
import { sendLineFlex } from '@/lib/line';
import type { DoseLog, Medicine, User } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** เลยเวลามาเกิน MISSED_AFTER_MINUTES แล้วยัง pending → ตั้งเป็น missed + เตือนซ้ำ */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return jsonError('unauthorized', 401);

  try {
    const db = supabaseAdmin();
    const cutoff = new Date(Date.now() - MISSED_AFTER_MINUTES * 60_000).toISOString();

    const { data: pending, error } = await db
      .from('logs')
      .select('*')
      .eq('status', 'pending')
      .lt('scheduled_time', cutoff)
      .order('scheduled_time', { ascending: true })
      .limit(100);

    if (error) return jsonError(error.message, 500);
    const logs = (pending as DoseLog[]) || [];
    if (!logs.length) return NextResponse.json({ ok: true, processed: 0 });

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const medicineIds = [...new Set(logs.map((l) => l.medicine_id).filter(Boolean))] as string[];

    const [{ data: users }, { data: medicines }] = await Promise.all([
      db.from('users').select('*').in('user_id', userIds),
      medicineIds.length
        ? db.from('medicines').select('*').in('medicine_id', medicineIds)
        : Promise.resolve({ data: [] as Medicine[] }),
    ]);

    const userById = new Map((users as User[] || []).map((u) => [u.user_id, u]));
    const medById = new Map((medicines as Medicine[] || []).map((m) => [m.medicine_id, m]));

    const processed: unknown[] = [];

    for (const log of logs) {
      // อัปเดตเฉพาะแถวที่ยัง pending อยู่จริง กันชนกับ ESP32 ที่เพิ่งส่งเข้ามา
      const { data: updated } = await db
        .from('logs')
        .update({ status: 'missed' })
        .eq('log_id', log.log_id)
        .eq('status', 'pending')
        .select('log_id')
        .maybeSingle();

      if (!updated) continue;

      const user = userById.get(log.user_id);
      if (!user) continue;

      const minutesLate = Math.round(
        (Date.now() - new Date(log.scheduled_time).getTime()) / 60_000,
      );

      const push = await sendLineFlex(
        user.line_user_id,
        `เลยเวลาทานยา ${timeOf(log.scheduled_time)} น.`,
        flexMissedAlert({
          time: timeOf(log.scheduled_time),
          medicineName: (log.medicine_id && medById.get(log.medicine_id)?.name) || 'ยาประจำตัว',
          minutesLate,
        }),
      );

      processed.push({ log_id: log.log_id, minutes_late: minutesLate, line: push });
    }

    return NextResponse.json({ ok: true, processed: processed.length, details: processed });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'cron ล้มเหลว', 500);
  }
}

export const POST = GET;
