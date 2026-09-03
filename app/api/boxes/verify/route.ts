import { NextResponse } from 'next/server';
import { jsonError, normalizeSerial } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** ขั้นที่ 1 ของการลงทะเบียน: ตรวจว่าซีเรียลมีจริงและยังว่างอยู่ */
export async function POST(req: Request) {
  try {
    const { serial } = await req.json();
    const boxSerial = normalizeSerial(serial);
    if (!boxSerial) return jsonError('กรุณากรอกรหัสกล่องยา 3 หลัก');

    const db = supabaseAdmin();
    const { data: box, error } = await db
      .from('boxes')
      .select('box_id, box_serial, owner_user_id, status')
      .eq('box_serial', boxSerial)
      .maybeSingle();

    if (error) return jsonError(`ระบบขัดข้อง: ${error.message}`, 500);
    if (!box) return jsonError(`ไม่พบหมายเลขกล่อง ${boxSerial} ในระบบ`, 404);
    if (box.owner_user_id) return jsonError('กล่องยานี้มีผู้ใช้งานอื่นลงทะเบียนไปแล้ว', 409);

    return NextResponse.json({ box_id: box.box_id, box_serial: box.box_serial });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'ตรวจสอบกล่องยาไม่สำเร็จ', 500);
  }
}
