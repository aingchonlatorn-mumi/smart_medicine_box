import { NextResponse } from 'next/server';
import { jsonError, normalizePhone, normalizeSerial } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** เข้าสู่ระบบด้วย เบอร์โทร + ซีเรียลกล่อง (ต้องเป็นกล่องของเบอร์นั้นจริง) */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const phone = normalizePhone(body.phone);
    const boxSerial = normalizeSerial(body.box_serial || body.serial);

    if (phone.length !== 10) return jsonError('เบอร์โทรศัพท์ต้องมี 10 หลัก');
    if (!boxSerial) return jsonError('กรุณากรอกรหัสกล่องยา 3 หลัก');

    const db = supabaseAdmin();

    const { data: user } = await db
      .from('users').select('user_id, name, line_user_id').eq('phone', phone).maybeSingle();
    if (!user) return jsonError('ไม่พบข้อมูลผู้ใช้งานด้วยเบอร์โทรศัพท์นี้', 404);

    const { data: box } = await db
      .from('boxes').select('box_id, owner_user_id').eq('box_serial', boxSerial).maybeSingle();
    if (!box) return jsonError(`ไม่พบรหัสกล่องยา ${boxSerial} ในระบบ`, 404);
    if (box.owner_user_id !== user.user_id) {
      return jsonError('กล่องยานี้ไม่ได้ผูกกับเบอร์โทรศัพท์นี้', 403);
    }

    // เปิดผ่าน LIFF ครั้งแรกหลังลงทะเบียนบนเว็บ → ผูก LINE userId ให้เลย
    const lineUserId = (body.line_user_id || '').trim();
    if (lineUserId && user.line_user_id !== lineUserId) {
      await db.from('users').update({ line_user_id: lineUserId }).eq('user_id', user.user_id);
    }

    return NextResponse.json({
      user_id: user.user_id,
      name: user.name,
      box_id: box.box_id,
      box_serial: boxSerial,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ', 500);
  }
}
