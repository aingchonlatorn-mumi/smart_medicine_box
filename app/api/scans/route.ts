import { NextResponse } from 'next/server';
import { jsonError, userIdFrom } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { MEDICINE_TYPES, medicineByCode } from '@/lib/medicines';
import type { Medicine } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * ผลการสแกนยาครั้งแรกที่ยังรอผู้ใช้ตรวจสอบ
 *
 *   GET  /api/scans   → { status: 'waiting' | 'ready', medicine, images }
 *
 * หน้าเว็บตอนตั้งค่าจะเรียกซ้ำเป็นระยะ ระหว่างรอผู้ใช้เปิดกล่องใส่ยา
 * waiting = ยังไม่มีผลจากกล่อง / ready = กล้องนับเสร็จแล้ว รอกดยืนยัน
 */
export async function GET(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  const { data, error } = await supabaseAdmin()
    .from('medicines').select('*')
    .eq('user_id', userId).eq('confirmed', false)
    .maybeSingle();

  if (error) return jsonError(`โหลดผลการสแกนไม่สำเร็จ: ${error.message}`, 500);
  if (!data) return NextResponse.json({ status: 'waiting', medicine: null, images: [] });

  const medicine = data as Medicine;
  const detection = (medicine.detection || {}) as Record<string, unknown>;

  return NextResponse.json({
    status: 'ready',
    medicine,
    images: Array.isArray(detection.images) ? (detection.images as string[]) : [],
    per_class: detection.per_class ?? {},
    frames: detection.frames ?? [],
    stable: detection.stable ?? true,
    // ชนิดยาที่ระบบรองรับ ส่งไปให้หน้าเว็บทำเป็นตัวเลือก ผู้ใช้พิมพ์ชื่อเองไม่ได้
    catalog: MEDICINE_TYPES,
    recognised: Boolean(medicine.code),
  });
}

/**
 * ผู้ใช้ยืนยันหรือแก้ไขผลที่กล้องอ่านได้
 *
 *   POST /api/scans   { code, total_pills }
 *
 * ชนิดยาต้องเป็นหนึ่งในรายการที่โมเดลจำแนกได้เท่านั้น ผู้ใช้เลือกได้แต่พิมพ์เองไม่ได้
 * เพราะยาที่โมเดลไม่รู้จักจะนับไม่ได้ทุกครั้งที่เปิดกล่อง
 *
 * ถ้าผู้ใช้แก้ตัวเลขหรือเปลี่ยนชนิดยาเอง ถือว่าที่มาของยอดเปลี่ยนเป็น manual
 * เพราะต้องตอบได้เสมอว่าตัวเลขในระบบมาจากการวัดหรือจากคน
 */
export async function POST(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const body = await req.json();
    const type = medicineByCode((body.code || '').trim());
    if (!type) return jsonError('กรุณาเลือกชนิดยาจากรายการที่ระบบรองรับ');

    const db = supabaseAdmin();
    const { data: pending } = await db
      .from('medicines').select('*')
      .eq('user_id', userId).eq('confirmed', false).maybeSingle();
    if (!pending) return jsonError('ไม่พบผลการสแกนที่รอการยืนยัน', 404);

    const scanned = (pending as Medicine).total_pills;
    const total = body.total_pills === undefined ? scanned : Math.max(0, Number(body.total_pills));
    const edited = total !== scanned || type.code !== (pending as Medicine).code;

    const { data, error } = await db
      .from('medicines')
      .update({
        code: type.code,
        name: type.nameTh,
        total_pills: total,
        confirmed: true,
        count_source: edited ? 'manual' : 'camera',
      })
      .eq('medicine_id', (pending as Medicine).medicine_id)
      .select().single();

    if (error) return jsonError(`ยืนยันไม่สำเร็จ: ${error.message}`, 500);
    return NextResponse.json({ medicine: data, edited });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'ยืนยันผลการสแกนไม่สำเร็จ', 500);
  }
}
