import { NextResponse } from 'next/server';
import { jsonError, loadContext, normalizePhone, userIdFrom } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** ข้อมูลชุดหลักของผู้ใช้: user + box + medicine + schedules */
export async function GET(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const context = await loadContext(userId);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้', 404);
    return NextResponse.json(context);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ', 500);
  }
}

/** แก้ไขข้อมูลส่วนตัว (ชื่อ / เบอร์ / วันเกิด) */
export async function PATCH(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const body = await req.json();
    const patch: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) return jsonError('กรุณากรอกชื่อ-นามสกุล');
      patch.name = name;
    }

    if (typeof body.phone === 'string') {
      const phone = normalizePhone(body.phone);
      if (phone.length !== 10) return jsonError('เบอร์โทรศัพท์ต้องมี 10 หลัก');

      const db = supabaseAdmin();
      const { data: taken } = await db
        .from('users').select('user_id').eq('phone', phone).neq('user_id', userId).maybeSingle();
      if (taken) return jsonError('เบอร์โทรศัพท์นี้ถูกใช้ไปแล้ว', 409);
      patch.phone = phone;
    }

    if ('birth_date' in body) patch.birth_date = body.birth_date || null;

    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin()
        .from('users').update(patch).eq('user_id', userId);
      if (error) return jsonError(`บันทึกไม่สำเร็จ: ${error.message}`, 500);
    }

    const context = await loadContext(userId);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้', 404);
    return NextResponse.json(context);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 500);
  }
}
