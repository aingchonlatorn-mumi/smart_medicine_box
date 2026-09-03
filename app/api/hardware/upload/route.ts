import { NextResponse } from 'next/server';
import { jsonError, loadContext, normalizeSerial } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { doseTime, schedulesForDate } from '@/lib/schedule';
import { bangkokToday, hhmm, timeOf } from '@/lib/time';
import { sendLinePushMessage } from '@/lib/line';

export const dynamic = 'force-dynamic';

const BUCKET = 'dose-photos';
/** ภาพที่ส่งมาห่างจากเวลามื้อได้ไม่เกินเท่านี้ ถึงจะถือว่าเป็นมื้อเดียวกัน */
const MATCH_WINDOW_MINUTES = 90;

/**
 * ESP32 เปิดฝากล่อง → ยิง multipart เข้ามาที่นี่
 *   headers: x-device-serial: B-001, x-device-key: <HARDWARE_DEVICE_KEY>
 *   body:    image=<jpeg> (ไม่บังคับ — กล้องพังก็ยังบันทึกการทานยาได้)
 */
export async function POST(req: Request) {
  try {
    const deviceKey = process.env.HARDWARE_DEVICE_KEY;
    if (deviceKey && req.headers.get('x-device-key') !== deviceKey) {
      return jsonError('device key ไม่ถูกต้อง', 401);
    }

    const form = await req.formData().catch(() => null);
    const serialRaw =
      req.headers.get('x-device-serial') ||
      (form?.get('box_serial') as string | null) ||
      (form?.get('device_id') as string | null) ||
      '';
    const boxSerial = normalizeSerial(serialRaw);
    if (!boxSerial) return jsonError('ไม่พบ x-device-serial', 400);

    const db = supabaseAdmin();
    const { data: box } = await db
      .from('boxes').select('box_id, owner_user_id').eq('box_serial', boxSerial).maybeSingle();
    if (!box) return jsonError(`ไม่พบกล่อง ${boxSerial}`, 404);
    if (!box.owner_user_id) return jsonError('กล่องนี้ยังไม่มีผู้ลงทะเบียน', 409);

    const context = await loadContext(box.owner_user_id);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้ของกล่องนี้', 404);

    const now = new Date();
    const today = bangkokToday(now);

    // 1) หามื้อที่ใกล้เวลาที่สุดของวันนี้ (ต้องอยู่ในกรอบ ±90 นาที)
    const candidates = schedulesForDate(context.schedules, today).map((schedule) => ({
      schedule,
      at: doseTime(schedule, today),
      diff: Math.abs(doseTime(schedule, today).getTime() - now.getTime()) / 60_000,
    }));
    const nearest = candidates.sort((a, b) => a.diff - b.diff)[0];
    const matched = nearest && nearest.diff <= MATCH_WINDOW_MINUTES ? nearest : null;

    // 2) หา/สร้าง log ของมื้อนั้น
    let logId: string | null = null;
    let alreadyTaken = false;

    if (matched) {
      const scheduledAt = matched.at.toISOString();
      const { data: existing } = await db
        .from('logs').select('log_id, status')
        .eq('schedule_id', matched.schedule.schedule_id)
        .eq('scheduled_time', scheduledAt)
        .maybeSingle();

      if (existing) {
        logId = existing.log_id;
        alreadyTaken = existing.status === 'taken';
      } else {
        const { data, error } = await db
          .from('logs')
          .insert({
            user_id: context.user.user_id,
            box_id: box.box_id,
            schedule_id: matched.schedule.schedule_id,
            medicine_id: matched.schedule.medicine_id,
            scheduled_time: scheduledAt,
            actual_time: now.toISOString(),
            status: 'taken',
          })
          .select('log_id').single();
        if (error) return jsonError(`บันทึกไม่สำเร็จ: ${error.message}`, 500);
        logId = data.log_id;
      }
    } else {
      // เปิดฝานอกเวลามื้อ — บันทึกไว้เป็นเหตุการณ์หนึ่ง ไม่ผูกกับตาราง
      const { data, error } = await db
        .from('logs')
        .insert({
          user_id: context.user.user_id,
          box_id: box.box_id,
          medicine_id: context.medicine?.medicine_id ?? null,
          scheduled_time: now.toISOString(),
          actual_time: now.toISOString(),
          status: 'taken',
        })
        .select('log_id').single();
      if (error) return jsonError(`บันทึกไม่สำเร็จ: ${error.message}`, 500);
      logId = data.log_id;
    }

    // 3) อัปโหลดภาพจากกล้อง (ถ้ามี) → signed URL อายุ 7 วัน
    let imageUrl: string | null = null;
    const image = form?.get('image');
    if (image instanceof File && image.size > 0 && logId) {
      const path = `${context.user.user_id}/${logId}.jpg`;
      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(path, image, { contentType: image.type || 'image/jpeg', upsert: true });

      if (uploadError) {
        console.warn('อัปโหลดภาพไม่สำเร็จ:', uploadError.message);
      } else {
        const { data: signed } = await db.storage
          .from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
        imageUrl = signed?.signedUrl ?? null;
      }
    }

    // 4) ปิดงาน: อัปเดตสถานะ + ภาพ แล้วหักจำนวนเม็ด (เฉพาะครั้งแรก)
    await db
      .from('logs')
      .update({
        status: 'taken',
        actual_time: now.toISOString(),
        ...(imageUrl ? { image_url: imageUrl } : {}),
      })
      .eq('log_id', logId);

    if (!alreadyTaken && context.medicine) {
      const dose = matched?.schedule.dose_amount || 1;
      await db
        .from('medicines')
        .update({ total_pills: Math.max(0, context.medicine.total_pills - dose) })
        .eq('medicine_id', context.medicine.medicine_id);
    }

    if (!alreadyTaken) {
      const label = matched ? `มื้อ ${hhmm(matched.schedule.time)} น.` : `เวลา ${timeOf(now)} น.`;
      await sendLinePushMessage(
        context.user.line_user_id,
        `✅ บันทึกการทานยา ${label} เรียบร้อยแล้ว${imageUrl ? ' พร้อมภาพจากกล่อง' : ''}`,
      );
    }

    return NextResponse.json({
      success: true,
      log_id: logId,
      matched_schedule: matched?.schedule.schedule_id ?? null,
      image_url: imageUrl,
      already_taken: alreadyTaken,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'รับข้อมูลจากกล่องไม่สำเร็จ', 500);
  }
}
