import { NextResponse } from 'next/server';
import { cronAuthorized, jsonError, loadContext, loadSlots } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { summarize } from '@/lib/schedule';
import { addDays, bangkokToday, dayOfWeek } from '@/lib/time';
import { flexWeeklyReport } from '@/lib/flex';
import { sendLineFlex } from '@/lib/line';
import type { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** สรุปผลรายสัปดาห์ ส่งทุกวันอาทิตย์ 20:00 น. (13:00 UTC) */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return jsonError('unauthorized', 401);

  try {
    const db = supabaseAdmin();
    const { data: users } = await db.from('users').select('*');

    const today = bangkokToday();
    const start = addDays(today, -6);
    const previousStart = addDays(start, -7);
    const sent: unknown[] = [];

    for (const user of (users as User[]) || []) {
      const context = await loadContext(user.user_id);
      if (!context || !context.schedules.length) continue;

      const slots = await loadSlots(context, start, today);
      const summary = summarize(slots);
      if (!summary.total) continue;

      const previous = summarize(await loadSlots(context, previousStart, addDays(start, -1)));

      // อัตราต่อวัน เรียงจันทร์ → อาทิตย์
      const daily = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
        const items = slots.filter((slot) => dayOfWeek(slot.date) === dow);
        const stat = summarize(items);
        return stat.total ? (stat.onTime + stat.late) / stat.total : 0;
      });

      const push = await sendLineFlex(
        user.line_user_id,
        `สรุปการทานยาสัปดาห์นี้ ${summary.adherence}%`,
        flexWeeklyReport({
          adherence: summary.adherence,
          taken: summary.onTime + summary.late,
          total: summary.total,
          rangeStart: start,
          rangeEnd: today,
          daily,
          deltaPercent: summary.adherence - previous.adherence,
        }),
      );

      sent.push({ user_id: user.user_id, adherence: summary.adherence, line: push });
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'cron ล้มเหลว', 500);
  }
}

export const POST = GET;
