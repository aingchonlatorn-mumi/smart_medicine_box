import { NextResponse } from 'next/server';
import { jsonError, loadContext, loadSlots, userIdFrom } from '@/lib/api';
import { nextDose, pillsRunOutInDays, summarize } from '@/lib/schedule';
import { addDays, bangkokToday, hhmm } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** ข้อมูลหน้า Dashboard: ไทม์ไลน์วันนี้ + มื้อถัดไป + ภาพล่าสุด + adherence 7 วัน */
export async function GET(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const context = await loadContext(userId);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้', 404);

    const today = bangkokToday();
    const now = new Date();

    const weekSlots = await loadSlots(context, addDays(today, -6), today);
    const todaySlots = weekSlots.filter((slot) => slot.date === today)
      .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

    const next = nextDose(context.schedules, now);
    const lastPhoto = weekSlots.find((slot) => Boolean(slot.image_url)) || null;

    return NextResponse.json({
      user: context.user,
      box: context.box,
      medicine: context.medicine,
      schedules: context.schedules,
      today: todaySlots,
      today_summary: summarize(todaySlots),
      week_summary: summarize(weekSlots),
      next_dose: next
        ? {
            time: hhmm(next.schedule.time),
            date: next.date,
            at: next.at.toISOString(),
            minutes_until: next.minutesUntil,
            dose_amount: next.schedule.dose_amount,
            meal_relation: next.schedule.meal_relation || 'none',
          }
        : null,
      last_photo: lastPhoto
        ? { image_url: lastPhoto.image_url, at: lastPhoto.actual_time, time: lastPhoto.time }
        : null,
      days_left: context.medicine
        ? pillsRunOutInDays(context.medicine.total_pills, context.schedules)
        : null,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ', 500);
  }
}
