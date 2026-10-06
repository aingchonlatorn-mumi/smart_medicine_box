import { NextResponse } from 'next/server';
import { jsonError, userIdFrom } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** อายุของลิงก์ภาพที่สร้างใหม่ — สั้นกว่าตอนอัปโหลดเพราะสร้างใหม่ได้ทุกครั้งที่เปิดดู */
const SIGNED_URL_TTL = 60 * 60;
const BUCKET = 'pill_img';

/**
 * ภาพหลักฐานของมื้อยาหนึ่งมื้อ
 *
 *   GET /api/images?log_id=...
 *
 * สร้าง signed URL ใหม่ทุกครั้งจาก storage_path แทนการใช้ลิงก์เดิมที่เก็บไว้
 * เพราะลิงก์ที่บันทึกตอนอัปโหลดมีอายุ 7 วัน ภาพเก่ากว่านั้นจะเปิดไม่ขึ้น
 */
export async function GET(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ยังไม่ได้เข้าสู่ระบบ', 401);

  const logId = new URL(req.url).searchParams.get('log_id');
  if (!logId) return jsonError('ไม่พบรหัสมื้อยา');

  const db = supabaseAdmin();

  // ตรวจว่ามื้อนี้เป็นของผู้ใช้คนนี้จริง ก่อนคืนภาพในกล่องยาของเขา
  const { data: log } = await db
    .from('logs').select('log_id, pills_before, pills_after, detection')
    .eq('log_id', logId).eq('user_id', userId).maybeSingle();
  if (!log) return jsonError('ไม่พบมื้อยานี้', 404);

  const { data: rows, error } = await db
    .from('log_images').select('image_id, image_url, storage_path, sequence, captured_at')
    .eq('log_id', logId).order('sequence', { ascending: true });
  if (error) return jsonError(`โหลดภาพไม่สำเร็จ: ${error.message}`, 500);

  const images = await Promise.all(
    (rows || []).map(async (row) => {
      if (!row.storage_path) return { ...row, url: row.image_url };
      const { data: signed } = await db.storage
        .from(BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL);
      return { ...row, url: signed?.signedUrl || row.image_url };
    }),
  );

  return NextResponse.json({
    images,
    pills_before: log.pills_before,
    pills_after: log.pills_after,
    detection: log.detection,
  });
}
