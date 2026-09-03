import { NextResponse } from 'next/server';
import { jsonError, normalizePhone, normalizeSerial } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { flexWelcome } from '@/lib/flex';
import { sendLineFlex } from '@/lib/line';

export const dynamic = 'force-dynamic';

/** ขั้นที่ 2: สร้างผู้ใช้ แล้วผูกกล่องเข้ากับบัญชี + ส่ง Flex ต้อนรับ */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = (body.name || '').trim();
    const phone = normalizePhone(body.phone);
    const boxSerial = normalizeSerial(body.box_serial || body.serial);
    const birthDate = body.birth_date || null;
    const lineUserId = (body.line_user_id || '').trim();

    if (!name) return jsonError('กรุณากรอกชื่อ-นามสกุล');
    if (phone.length !== 10) return jsonError('เบอร์โทรศัพท์ต้องมี 10 หลัก');
    if (!boxSerial) return jsonError('ไม่พบรหัสกล่องยา');

    const db = supabaseAdmin();

    const { data: box } = await db
      .from('boxes').select('box_id, owner_user_id').eq('box_serial', boxSerial).maybeSingle();
    if (!box) return jsonError(`ไม่พบหมายเลขกล่อง ${boxSerial}`, 404);
    if (box.owner_user_id) return jsonError('กล่องยานี้ถูกลงทะเบียนไปแล้ว', 409);

    const { data: existing } = await db
      .from('users').select('user_id').eq('phone', phone).maybeSingle();
    if (existing) return jsonError('เบอร์โทรศัพท์นี้ถูกใช้ลงทะเบียนแล้ว กรุณาเข้าสู่ระบบ', 409);

    const { data: user, error: userError } = await db
      .from('users')
      .insert({
        name,
        phone,
        birth_date: birthDate,
        // ยังไม่ได้เปิดผ่าน LIFF ก็ลงทะเบียนได้ แล้วค่อยผูก LINE ทีหลังผ่าน webhook
        line_user_id: lineUserId || `PENDING_${phone}`,
      })
      .select()
      .single();

    if (userError || !user) return jsonError(`ลงทะเบียนไม่สำเร็จ: ${userError?.message}`, 500);

    const { error: boxError } = await db
      .from('boxes')
      .update({ owner_user_id: user.user_id, status: 'active' })
      .eq('box_id', box.box_id)
      .is('owner_user_id', null);

    if (boxError) {
      // ผูกกล่องไม่สำเร็จ → ลบผู้ใช้ที่เพิ่งสร้าง ไม่ให้ค้างเป็นบัญชีลอย
      await db.from('users').delete().eq('user_id', user.user_id);
      return jsonError(`ผูกกล่องยาไม่สำเร็จ: ${boxError.message}`, 500);
    }

    const push = await sendLineFlex(
      user.line_user_id,
      `เชื่อมต่อกล่อง ${boxSerial} สำเร็จ`,
      flexWelcome({ name, boxSerial }),
    );

    return NextResponse.json({
      user_id: user.user_id,
      name: user.name,
      box_id: box.box_id,
      box_serial: boxSerial,
      line_push: push,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'ลงทะเบียนไม่สำเร็จ', 500);
  }
}
