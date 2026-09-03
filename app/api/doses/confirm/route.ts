import { NextResponse } from 'next/server';
import { jsonError, loadContext, userIdFrom } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { doseTime, schedulesForDate } from '@/lib/schedule';
import { bangkokToday, hhmm } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * ยืนยันการทานยาด้วยมือ (ปุ่ม "ทานยาแล้ว")
 * ปกติกล่องจะบันทึกให้เองตอนเปิดฝา — เส้นทางนี้ไว้เผื่อกล้องไม่ทำงาน
 */
export async function POST(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const body = await req.json().catch(() => ({}));
    const context = await loadContext(userId);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้', 404);

    const db = supabaseAdmin();
    const now = new Date();

    // 1) ระบุ log ที่จะยืนยัน
    let logId: string | null = body.log_id || null;

    if (!logId) {
      const scheduleId = body.schedule_id as string | undefined;
      const today = bangkokToday(now);
      const todaySchedules = schedulesForDate(context.schedules, today);

      // ไม่ได้ระบุมาก็เลือกมื้อที่ใกล้เวลาปัจจุบันที่สุดของวันนี้
      const target = scheduleId
        ? todaySchedules.find((s) => s.schedule_id === scheduleId)
        : todaySchedules
            .slice()
            .sort(
              (a, b) =>
                Math.abs(doseTime(a, today).getTime() - now.getTime()) -
                Math.abs(doseTime(b, today).getTime() - now.getTime()),
            )[0];

      if (!target) return jsonError('วันนี้ไม่มีมื้อยาตามตาราง', 404);

      const scheduledAt = doseTime(target, today).toISOString();
      const { data: existing } = await db
        .from('logs')
        .select('log_id, status')
        .eq('schedule_id', target.schedule_id)
        .eq('scheduled_time', scheduledAt)
        .maybeSingle();

      if (existing) {
        logId = existing.log_id;
      } else {
        const { data, error } = await db
          .from('logs')
          .insert({
            user_id: userId,
            box_id: context.box?.box_id ?? null,
            schedule_id: target.schedule_id,
            medicine_id: target.medicine_id,
            scheduled_time: scheduledAt,
            actual_time: now.toISOString(),
            status: 'taken',
          })
          .select('log_id')
          .single();
        if (error) return jsonError(`บันทึกไม่สำเร็จ: ${error.message}`, 500);
        logId = data.log_id;
      }
    }

    // 2) อัปเดตเป็น taken เฉพาะตอนที่ยังไม่ taken (กันกดซ้ำแล้วหักยาซ้ำ)
    const { data: updated } = await db
      .from('logs')
      .update({ status: 'taken', actual_time: now.toISOString() })
      .eq('log_id', logId)
      .eq('user_id', userId)
      .neq('status', 'taken')
      .select('log_id, medicine_id, schedule_id')
      .maybeSingle();

    // 3) หักจำนวนเม็ดในกล่อง
    if (updated && context.medicine) {
      const schedule = context.schedules.find((s) => s.schedule_id === updated.schedule_id);
      const dose = schedule?.dose_amount || 1;
      await db
        .from('medicines')
        .update({ total_pills: Math.max(0, context.medicine.total_pills - dose) })
        .eq('medicine_id', context.medicine.medicine_id);
    }

    return NextResponse.json({
      ok: true,
      log_id: logId,
      already_taken: !updated,
      time: hhmm(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(now)),
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'ยืนยันการทานยาไม่สำเร็จ', 500);
  }
}
