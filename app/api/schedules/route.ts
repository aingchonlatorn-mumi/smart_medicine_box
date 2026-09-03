import { NextResponse } from 'next/server';
import { jsonError, loadContext, userIdFrom } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import type { MealRelation, ScheduleType } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface DoseInput {
  schedule_id?: string;
  time: string;
  dose_amount?: number;
  meal_relation?: MealRelation;
}

/**
 * บันทึกตารางทานยาทั้งชุด
 * - ประเภทตาราง (daily / weekly / interval) ใช้ร่วมกันทุกมื้อ ตามหน้าจอในไฟล์ดีไซน์
 * - มื้อที่มี schedule_id เดิมจะอัปเดต ไม่ลบทิ้ง เพื่อไม่ให้ log เก่าขาดการเชื่อมโยง
 */
export async function PUT(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const context = await loadContext(userId);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้', 404);
    if (!context.box) return jsonError('ยังไม่ได้ผูกกล่องยา', 400);

    const body = await req.json();
    const scheduleType: ScheduleType = body.schedule_type || 'daily';
    const doses: DoseInput[] = Array.isArray(body.doses) ? body.doses : [];

    if (!doses.length) return jsonError('กรุณาเพิ่มอย่างน้อย 1 มื้อ');

    const medicineId = body.medicine_id || context.medicine?.medicine_id;
    if (!medicineId) return jsonError('ยังไม่มีข้อมูลยา กรุณาบันทึกข้อมูลยาก่อน');

    const intervalDays = Math.max(1, Number(body.interval_days || 1));
    const dayOfWeek: string[] = Array.isArray(body.day_of_week) ? body.day_of_week : [];

    if (scheduleType === 'weekly' && dayOfWeek.length === 0) {
      return jsonError('กรุณาเลือกอย่างน้อย 1 วันในสัปดาห์');
    }

    const shared = {
      box_id: context.box.box_id,
      medicine_id: medicineId,
      schedule_type: scheduleType,
      interval_days: scheduleType === 'interval' ? intervalDays : 1,
      day_of_week: scheduleType === 'weekly' ? dayOfWeek : null,
      start_date: body.start_date || new Date().toISOString().slice(0, 10),
      active: true,
    };

    const db = supabaseAdmin();
    const keepIds: string[] = [];

    for (const dose of doses) {
      const time = (dose.time || '').slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(time)) return jsonError(`เวลาไม่ถูกต้อง: ${dose.time}`);

      const row = {
        ...shared,
        time,
        dose_amount: Math.max(1, Number(dose.dose_amount || 1)),
        meal_relation: dose.meal_relation || 'none',
      };

      if (dose.schedule_id) {
        const { data, error } = await db
          .from('schedules').update(row).eq('schedule_id', dose.schedule_id)
          .eq('box_id', context.box.box_id).select('schedule_id').maybeSingle();
        if (error) return jsonError(`บันทึกตารางไม่สำเร็จ: ${error.message}`, 500);
        if (data) { keepIds.push(data.schedule_id); continue; }
      }

      const { data, error } = await db
        .from('schedules').insert(row).select('schedule_id').single();
      if (error) return jsonError(`เพิ่มมื้อยาไม่สำเร็จ: ${error.message}`, 500);
      keepIds.push(data.schedule_id);
    }

    // มื้อที่ถูกลบออกจากหน้าจอ → ลบออกจากตาราง (log เก่ายังอยู่ schedule_id เป็น null)
    const removed = context.schedules
      .map((s) => s.schedule_id)
      .filter((id) => !keepIds.includes(id));
    if (removed.length) {
      await db.from('schedules').delete().in('schedule_id', removed);
    }

    const fresh = await loadContext(userId);
    return NextResponse.json({ schedules: fresh?.schedules || [] });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'บันทึกตารางไม่สำเร็จ', 500);
  }
}

/** ลบตารางทานยาทั้งหมดของกล่องนี้ (ข้อมูลยายังอยู่) */
export async function DELETE(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const context = await loadContext(userId);
    if (!context?.box) return jsonError('ยังไม่ได้ผูกกล่องยา', 400);

    const { error } = await supabaseAdmin()
      .from('schedules')
      .delete()
      .eq('box_id', context.box.box_id);

    if (error) return jsonError(`ลบตารางไม่สำเร็จ: ${error.message}`, 500);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'ลบตารางไม่สำเร็จ', 500);
  }
}
