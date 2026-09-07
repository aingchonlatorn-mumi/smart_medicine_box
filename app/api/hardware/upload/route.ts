import { NextResponse } from 'next/server';
import { jsonError, loadContext } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateDevice, recordDeviceEvent, touchDevice } from '@/lib/device';
import { doseTime, schedulesForDate } from '@/lib/schedule';
import { bangkokToday, hhmm, timeOf } from '@/lib/time';
import { sendLinePushMessage } from '@/lib/line';
import type { Schedule } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** ที่เก็บภาพหลักฐานจากกล้อง */
const BUCKET = 'pill_img';
/** ภาพ/เหตุการณ์ห่างจากเวลามื้อได้ไม่เกินเท่านี้ ถึงจะถือว่าเป็นมื้อเดียวกัน */
const MATCH_WINDOW_MINUTES = 90;
/** เปิดฝาสั้นกว่านี้ถือว่าโดนชนหรือเปิดดูเฉย ๆ ไม่นับเป็นการหยิบยา */
const MIN_OPEN_SECONDS = 2;
/** signed URL อายุ 7 วัน พอให้ LINE โหลดภาพและผู้ใช้ย้อนดูได้ */
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

/**
 * รับข้อมูลจากกล่องยา (ESP32-CAM + reed switch)
 *
 *   POST /api/hardware/upload
 *   headers: x-device-mac: A0B7652C1FE8
 *            x-device-key: <คีย์ที่ได้จาก /api/hardware/provision>
 *   body (multipart):
 *     event             lid_close (ค่าเริ่มต้น) | lid_open | boot | heartbeat
 *     lid_open_seconds  เปิดฝาค้างไว้กี่วินาที
 *     image, image1..   ภาพชุดที่ถ่ายระหว่างฝาเปิด (ไม่บังคับ)
 *
 * หลักการ: บอร์ดรายงานแค่ "สิ่งที่เห็น" ส่วนการตีความว่าเป็นมื้อไหนและถือว่าทานหรือยัง
 * ตัดสินที่นี่ทั้งหมด จะได้แก้กฎได้โดยไม่ต้อง flash บอร์ดใหม่
 */
export async function POST(req: Request) {
  try {
    const auth = await authenticateDevice(req);
    if (!auth.ok || !auth.box) {
      const status = auth.error === 'bad_key' ? 401 : auth.error === 'unknown_device' ? 404 : 400;
      return jsonError(auth.message || 'ยืนยันตัวตนอุปกรณ์ไม่สำเร็จ', status);
    }
    const box = auth.box;

    const form = await req.formData().catch(() => null);
    const field = (name: string) => {
      const value = form?.get(name);
      return typeof value === 'string' ? value : null;
    };

    const warnings: string[] = [];
    const note = (message: string | null) => { if (message) warnings.push(message); };

    const eventType = (field('event') || 'lid_close') as
      'lid_open' | 'lid_close' | 'boot' | 'heartbeat' | 'error';
    const openSeconds = field('lid_open_seconds') ? Number(field('lid_open_seconds')) : null;

    await touchDevice(box.box_id, field('firmware'));

    // เหตุการณ์ที่ไม่ใช่การปิดฝา แค่บันทึกไว้เป็นประวัติ ไม่ต้องตีความเป็นมื้อยา
    if (eventType !== 'lid_close') {
      note(await recordDeviceEvent({ boxId: box.box_id, eventType, lidOpenSeconds: openSeconds }));
      return NextResponse.json({ ok: true, event: eventType, recorded: !warnings.length, warnings });
    }

    if (!box.owner_user_id) {
      note(await recordDeviceEvent({
        boxId: box.box_id, eventType, lidOpenSeconds: openSeconds,
        detail: { note: 'กล่องยังไม่มีเจ้าของ' },
      }));
      return jsonError('กล่องนี้ยังไม่มีผู้ลงทะเบียน', 409);
    }

    const context = await loadContext(box.owner_user_id);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้ของกล่องนี้', 404);

    const db = supabaseAdmin();
    const now = new Date();
    const today = bangkokToday(now);
    const openedAt = openSeconds
      ? new Date(now.getTime() - openSeconds * 1000).toISOString()
      : now.toISOString();

    // 1) เปิดฝาแวบเดียว = ไม่ใช่การหยิบยา บันทึกเป็นเหตุการณ์อย่างเดียว
    if (openSeconds !== null && openSeconds < MIN_OPEN_SECONDS) {
      note(await recordDeviceEvent({
        boxId: box.box_id, eventType, occurredAt: openedAt, lidOpenSeconds: openSeconds,
        detail: { note: 'เปิดสั้นเกินไป ไม่นับเป็นการหยิบยา' },
      }));
      return NextResponse.json({ ok: true, matched_schedule: null, too_short: true, warnings });
    }

    // 2) หามื้อที่ใกล้ที่สุดของวันนี้ ต้องอยู่ในกรอบ ±90 นาที
    const candidates = schedulesForDate(context.schedules, today).map((schedule) => ({
      schedule,
      at: doseTime(schedule, today),
      diff: Math.abs(doseTime(schedule, today).getTime() - now.getTime()) / 60_000,
    }));
    const nearest = candidates.sort((a, b) => a.diff - b.diff)[0];
    const matched: { schedule: Schedule; at: Date } | null =
      nearest && nearest.diff <= MATCH_WINDOW_MINUTES ? nearest : null;

    // 3) เปิดนอกเวลามื้อยา → ลงเป็นประวัติการเข้าถึงกล่อง ไม่แตะตัวเลข adherence
    if (!matched) {
      note(await recordDeviceEvent({
        boxId: box.box_id, eventType, occurredAt: openedAt, lidOpenSeconds: openSeconds,
        detail: { note: 'เปิดนอกเวลามื้อยา' },
      }));
      const outside = await uploadImages({
        form, boxId: box.box_id, userId: context.user.user_id, logId: null,
      });
      warnings.push(...outside.warnings);
      return NextResponse.json({
        ok: true, matched_schedule: null, outside_schedule: true,
        images: outside.urls.length, warnings,
      });
    }

    // 4) หา/สร้าง log ของมื้อนั้น
    const scheduledAt = matched.at.toISOString();
    const { data: existing } = await db
      .from('logs').select('log_id, status')
      .eq('schedule_id', matched.schedule.schedule_id)
      .eq('scheduled_time', scheduledAt)
      .maybeSingle();

    const alreadyTaken = existing?.status === 'taken';
    let logId = existing?.log_id as string | undefined;

    if (!logId) {
      const { data, error } = await db
        .from('logs')
        .insert({
          user_id: context.user.user_id,
          box_id: box.box_id,
          schedule_id: matched.schedule.schedule_id,
          medicine_id: matched.schedule.medicine_id,
          scheduled_time: scheduledAt,
          status: 'pending',
        })
        .select('log_id').single();
      if (error) return jsonError(`บันทึกไม่สำเร็จ: ${error.message}`, 500);
      logId = data.log_id;
    }

    // 5) อัปโหลดภาพชุด
    const upload = await uploadImages({
      form, boxId: box.box_id, userId: context.user.user_id, logId: logId!,
    });
    const images = upload.urls;
    warnings.push(...upload.warnings);

    // 6) สรุปผล — ยังไม่มีการตรวจจับมือ จึงเชื่อ "ระยะเวลาที่ฝาเปิด" เป็นหลัก
    //    hand_detected ปล่อยเป็น null ไว้ให้ตัวประมวลผลภาพมาเติมทีหลัง
    await db
      .from('logs')
      .update({
        status: 'taken',
        actual_time: now.toISOString(),
        lid_opened_at: openedAt,
        lid_open_seconds: openSeconds,
        confirmed_by: 'device',
        ...(images[0] ? { image_url: images[0] } : {}),
      })
      .eq('log_id', logId!);

    note(await recordDeviceEvent({
      boxId: box.box_id, eventType, occurredAt: openedAt,
      lidOpenSeconds: openSeconds, logId: logId!,
      detail: { images: images.length },
    }));

    // 7) หักจำนวนเม็ดเฉพาะครั้งแรก กันเปิดฝาซ้ำแล้วยาหายรัว ๆ
    if (!alreadyTaken && context.medicine) {
      await db
        .from('medicines')
        .update({
          total_pills: Math.max(
            0, context.medicine.total_pills - (matched.schedule.dose_amount || 1),
          ),
        })
        .eq('medicine_id', context.medicine.medicine_id);

      await sendLinePushMessage(
        context.user.line_user_id,
        `✅ บันทึกการทานยามื้อ ${hhmm(matched.schedule.time)} น. แล้ว` +
          ` (เปิดฝา ${timeOf(openedAt)} น.${openSeconds ? ` นาน ${openSeconds} วินาที` : ''})` +
          `${images.length ? `\nถ่ายภาพไว้ ${images.length} ภาพ` : ''}`,
      );
    }

    return NextResponse.json({
      ok: true,
      log_id: logId,
      matched_schedule: matched.schedule.schedule_id,
      lid_open_seconds: openSeconds,
      images: images.length,
      already_taken: alreadyTaken,
      warnings,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'รับข้อมูลจากกล่องไม่สำเร็จ', 500);
  }
}

/**
 * อัปโหลดภาพทุกเฟรมที่ส่งมา แล้วบันทึกลง log_images
 * คืน signed URL เรียงตามลำดับเฟรม (ตัวแรกใช้เป็นภาพตัวแทน)
 */
async function uploadImages(params: {
  form: FormData | null;
  boxId: string;
  userId: string;
  logId: string | null;
}): Promise<{ urls: string[]; warnings: string[] }> {
  const { form, boxId, userId, logId } = params;
  const warnings: string[] = [];
  if (!form) return { urls: [], warnings };

  const files = [...form.entries()]
    .filter(([name, value]) => name.startsWith('image') && value instanceof File)
    .map(([, value]) => value as File)
    .filter((file) => file.size > 0);

  if (!files.length) return { urls: [], warnings };

  const db = supabaseAdmin();
  const stamp = Date.now();
  const urls: string[] = [];

  for (const [index, file] of files.entries()) {
    const path = `${userId}/${logId ?? 'unmatched'}/${stamp}-${index}.jpg`;

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });

    if (uploadError) {
      // กล้องพังหรือ bucket มีปัญหา ก็ยังต้องบันทึกการทานยาได้ตามปกติ
      console.warn('อัปโหลดภาพไม่สำเร็จ:', uploadError.message);
      warnings.push(`อัปโหลดภาพที่ ${index} ไม่สำเร็จ: ${uploadError.message}`);
      continue;
    }

    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    if (!signed?.signedUrl) continue;
    urls.push(signed.signedUrl);

    if (logId) {
      const { error: rowError } = await db.from('log_images').insert({
        log_id: logId,
        box_id: boxId,
        image_url: signed.signedUrl,
        storage_path: path,
        sequence: index,
      });
      if (rowError) warnings.push(`บันทึก log_images ไม่สำเร็จ: ${rowError.message}`);
    }
  }

  return { urls, warnings };
}
