import { NextResponse } from 'next/server';
import { cronAuthorized, jsonError } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { doseTime, occursOn } from '@/lib/schedule';
import { bangkokParts, hhmm, minutesOfDay } from '@/lib/time';
import { flexDoseAlert } from '@/lib/flex';
import { sendLineFlex } from '@/lib/line';
import type { Box, Medicine, Schedule, User } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * ยิงทุก 1 นาที — หามื้อที่ถึงเวลาแล้ว สร้าง log (pending) และส่ง Flex แจ้งเตือน
 * เผื่อ cron มาช้า จึงรับมื้อที่เพิ่งเลยมาไม่เกิน GRACE_MINUTES ด้วย
 * กันส่งซ้ำด้วย unique index (schedule_id, scheduled_time) ในตาราง logs
 */
const GRACE_MINUTES = 4;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return jsonError('unauthorized', 401);

  try {
    const db = supabaseAdmin();
    const now = new Date();
    const clock = bangkokParts(now);

    const [{ data: schedules }, { data: boxes }, { data: users }, { data: medicines }] =
      await Promise.all([
        db.from('schedules').select('*').eq('active', true),
        db.from('boxes').select('*'),
        db.from('users').select('*'),
        db.from('medicines').select('*'),
      ]);

    const boxById = new Map((boxes as Box[] || []).map((b) => [b.box_id, b]));
    const userById = new Map((users as User[] || []).map((u) => [u.user_id, u]));
    const medById = new Map((medicines as Medicine[] || []).map((m) => [m.medicine_id, m]));

    const triggered: unknown[] = [];

    for (const schedule of (schedules as Schedule[]) || []) {
      if (!occursOn(schedule, clock.date)) continue;

      const dueAt = minutesOfDay(schedule.time);
      const elapsed = clock.minutes - dueAt;
      if (elapsed < 0 || elapsed > GRACE_MINUTES) continue;

      const box = boxById.get(schedule.box_id);
      const user = box?.owner_user_id ? userById.get(box.owner_user_id) : null;
      if (!user) continue;

      const medicine = medById.get(schedule.medicine_id);
      const scheduledAt = doseTime(schedule, clock.date).toISOString();

      const { data: inserted, error } = await db
        .from('logs')
        .insert({
          user_id: user.user_id,
          box_id: box!.box_id,
          schedule_id: schedule.schedule_id,
          medicine_id: schedule.medicine_id,
          scheduled_time: scheduledAt,
          status: 'pending',
        })
        .select('log_id')
        .maybeSingle();

      if (error) {
        // 23505 = ส่งไปแล้วในนาทีก่อนหน้า ถือว่าปกติ
        if (error.code !== '23505') {
          triggered.push({ schedule_id: schedule.schedule_id, error: error.message });
        }
        continue;
      }

      const push = await sendLineFlex(
        user.line_user_id,
        `ถึงเวลาทานยา ${hhmm(schedule.time)} น.`,
        flexDoseAlert({
          time: hhmm(schedule.time),
          medicineName: medicine?.name || 'ยาประจำตัว',
          doseAmount: schedule.dose_amount || 1,
          pillsLeft: medicine?.total_pills ?? 0,
          mealRelation: schedule.meal_relation || 'none',
        }),
      );

      triggered.push({
        schedule_id: schedule.schedule_id,
        log_id: inserted?.log_id,
        time: hhmm(schedule.time),
        line: push,
      });
    }

    return NextResponse.json({
      ok: true,
      now: `${clock.date} ${clock.time}`,
      checked: schedules?.length ?? 0,
      triggered,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'cron ล้มเหลว', 500);
  }
}

/** Vercel Cron ยิงเป็น GET — เผื่อ cron ภายนอกที่ใช้ POST */
export const POST = GET;
