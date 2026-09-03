import { NextResponse } from 'next/server';
import { jsonError, loadContext, loadSlots, userIdFrom } from '@/lib/api';
import { summarize, type DoseSlot } from '@/lib/schedule';
import { addDays, bangkokToday, dayOfWeek } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** รายงาน adherence — ?days=7 หรือ 30 */
export async function GET(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const days = Number(new URL(req.url).searchParams.get('days')) === 30 ? 30 : 7;
    const context = await loadContext(userId);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้', 404);

    const today = bangkokToday();
    const start = addDays(today, -(days - 1));
    const previousStart = addDays(start, -days);

    const slots = await loadSlots(context, start, today);
    const previous = await loadSlots(context, previousStart, addDays(start, -1));

    const summary = summarize(slots);
    const previousSummary = summarize(previous);

    // ราย 7 วันล่าสุด เรียงจันทร์ → อาทิตย์ สำหรับกราฟแท่ง
    const byDate = new Map<string, DoseSlot[]>();
    for (const slot of slots) {
      const bucket = byDate.get(slot.date);
      if (bucket) bucket.push(slot);
      else byDate.set(slot.date, [slot]);
    }

    const weekly = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
      const dates = [...byDate.keys()].filter((d) => dayOfWeek(d) === dow);
      const items = dates.flatMap((d) => byDate.get(d) || []);
      const stat = summarize(items);
      return { dow, rate: stat.total ? (stat.onTime + stat.late) / stat.total : 0, ...stat };
    });

    // ไทม์ไลน์รายวันสำหรับ "บันทึกสำหรับแพทย์"
    const timeline = [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        date,
        states: items
          .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
          .map((s) => s.state),
      }));

    return NextResponse.json({
      days,
      range: { start, end: today },
      summary,
      delta: summary.adherence - previousSummary.adherence,
      weekly,
      timeline,
      medicine: context.medicine,
      user: context.user,
      box: context.box,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'สร้างรายงานไม่สำเร็จ', 500);
  }
}
