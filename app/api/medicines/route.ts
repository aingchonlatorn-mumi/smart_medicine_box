import { NextResponse } from 'next/server';
import { jsonError, userIdFrom } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** แก้ข้อมูลยา (ชื่อ / จำนวนเม็ด / วันหมดอายุ) — ถ้ายังไม่มีจะสร้างให้ */
export async function PUT(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const body = await req.json();
    const name = (body.name || '').trim();
    if (!name) return jsonError('กรุณากรอกชื่อยา');

    const totalPills = Math.max(0, Number(body.total_pills ?? 0));
    const expireDate = body.expire_date || null;
    const db = supabaseAdmin();

    if (body.medicine_id) {
      const { data, error } = await db
        .from('medicines')
        .update({ name, total_pills: totalPills, expire_date: expireDate })
        .eq('medicine_id', body.medicine_id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) return jsonError(`บันทึกไม่สำเร็จ: ${error.message}`, 500);
      return NextResponse.json({ medicine: data });
    }

    const { data, error } = await db
      .from('medicines')
      .insert({ user_id: userId, name, total_pills: totalPills, expire_date: expireDate })
      .select()
      .single();
    if (error) return jsonError(`บันทึกไม่สำเร็จ: ${error.message}`, 500);
    return NextResponse.json({ medicine: data });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'บันทึกข้อมูลยาไม่สำเร็จ', 500);
  }
}

/** เติมยา — เขียนทับ total_pills ตรง ๆ ตามที่ระบุไว้ใน NOTES ของไฟล์ดีไซน์ */
export async function POST(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  try {
    const body = await req.json();
    const db = supabaseAdmin();

    const { data: medicine } = await db
      .from('medicines').select('*').eq('medicine_id', body.medicine_id)
      .eq('user_id', userId).maybeSingle();
    if (!medicine) return jsonError('ไม่พบข้อมูลยา', 404);

    // ส่ง total_pills มา = ตั้งค่าใหม่, ส่ง amount มา = บวกเพิ่ม
    const next = body.total_pills !== undefined
      ? Math.max(0, Number(body.total_pills))
      : medicine.total_pills + Math.max(0, Number(body.amount || 0));

    const { data, error } = await db
      .from('medicines').update({ total_pills: next })
      .eq('medicine_id', medicine.medicine_id).select().single();
    if (error) return jsonError(`เติมยาไม่สำเร็จ: ${error.message}`, 500);

    return NextResponse.json({ medicine: data });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'เติมยาไม่สำเร็จ', 500);
  }
}

/** ลบยา 1 รายการ (ตารางทานยาของยานี้จะถูกลบตามด้วย cascade) */
export async function DELETE(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  const medicineId = new URL(req.url).searchParams.get('medicine_id');
  if (!medicineId) return jsonError('ไม่พบรหัสยาที่จะลบ');

  const { error } = await supabaseAdmin()
    .from('medicines')
    .delete()
    .eq('medicine_id', medicineId)
    .eq('user_id', userId);

  if (error) return jsonError(`ลบไม่สำเร็จ: ${error.message}`, 500);
  return NextResponse.json({ ok: true });
}
