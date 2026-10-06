import { NextResponse } from 'next/server';
import { jsonError, loadContext } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateDevice, recordDeviceEvent, touchDevice } from '@/lib/device';
import { doseTime, schedulesForDate } from '@/lib/schedule';
import { bangkokToday, hhmm, timeOf } from '@/lib/time';
import { sendLineFlex, sendLinePushMessage } from '@/lib/line';
import { flexDoseResult } from '@/lib/flex';
import {
  analyzePills, countOf, detectionPayload, foreignIn, type VisionResult,
} from '@/lib/vision';
import { medicineByCode, medicineByModelClass } from '@/lib/medicines';
import type { DoseOutcome as Outcome, Schedule } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** ที่เก็บภาพหลักฐานจากกล้อง */
const BUCKET = 'pill_img';
/** ภาพ/เหตุการณ์ห่างจากเวลามื้อได้ไม่เกินเท่านี้ ถึงจะถือว่าเป็นมื้อเดียวกัน */
const MATCH_WINDOW_MINUTES = 90;
/**
 * เปิดฝาสั้นกว่านี้ถือว่าโดนชนหรือปัดโดนโดยไม่ตั้งใจ ไม่นับเป็นการหยิบยา
 * ใช้หน่วยมิลลิวินาที เพราะเกณฑ์ระดับวินาทีเต็มทำให้การเปิด 1.9 วินาทีถูกตัดทิ้ง
 * ทั้งที่เป็นการหยิบยาจริง การหยิบยาที่สั้นที่สุดที่วัดได้อยู่ราว 1.3 วินาที
 */
const MIN_OPEN_MS = 1000;
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
    // เฟิร์มแวร์ตั้งแต่รุ่น 2.3.1 ส่งเป็นมิลลิวินาที รุ่นก่อนหน้าส่งเป็นวินาทีเต็ม
    // รับทั้งสองแบบ เพื่อให้บอร์ดที่ยังไม่ได้อัปเดตใช้งานต่อได้
    const rawMs = field('lid_open_ms');
    const rawSeconds = field('lid_open_seconds') ?? field('open_duration');
    const openMs = rawMs !== null && rawMs !== ''
      ? Number(rawMs)
      : rawSeconds !== null && rawSeconds !== '' ? Number(rawSeconds) * 1000 : null;
    // ค่าเป็นวินาทีไว้แสดงผลและคงความเข้ากันได้กับข้อมูลเดิม
    const openSeconds = openMs !== null ? Math.round(openMs / 1000) : null;

    await touchDevice(box.box_id, field('firmware'));

    // เหตุการณ์ที่ไม่ใช่การปิดฝา แค่บันทึกไว้เป็นประวัติ ไม่ต้องตีความเป็นมื้อยา
    if (eventType !== 'lid_close') {
      note(await recordDeviceEvent({ boxId: box.box_id, eventType, lidOpenSeconds: openSeconds, lidOpenMs: openMs }));
      return NextResponse.json({ ok: true, event: eventType, recorded: !warnings.length, warnings });
    }

    if (!box.owner_user_id) {
      note(await recordDeviceEvent({
        boxId: box.box_id, eventType, lidOpenSeconds: openSeconds, lidOpenMs: openMs,
        detail: { note: 'กล่องยังไม่มีเจ้าของ' },
      }));
      return jsonError('กล่องนี้ยังไม่มีผู้ลงทะเบียน', 409);
    }

    const context = await loadContext(box.owner_user_id);
    if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้ของกล่องนี้', 404);

    const db = supabaseAdmin();
    const now = new Date();
    const today = bangkokToday(now);
    const openedAt = openMs
      ? new Date(now.getTime() - openMs).toISOString()
      : now.toISOString();

    // 1) เปิดฝาแวบเดียว = ไม่ใช่การหยิบยา บันทึกเป็นเหตุการณ์อย่างเดียว
    if (openMs !== null && openMs < MIN_OPEN_MS) {
      note(await recordDeviceEvent({
        boxId: box.box_id, eventType, occurredAt: openedAt, lidOpenSeconds: openSeconds, lidOpenMs: openMs,
        detail: { note: 'เปิดสั้นเกินไป ไม่นับเป็นการหยิบยา' },
      }));
      return NextResponse.json({ ok: true, matched_schedule: null, too_short: true, warnings });
    }

    // 2) โหมดตั้งค่าครั้งแรก — ยังไม่มียาที่ผู้ใช้ยืนยัน จึงยังไม่มีมื้อให้เทียบ
    //    ผลการสแกนตอนนี้มีหน้าที่เดียวคือกรอกชื่อยาและจำนวนเม็ดให้ผู้ใช้ตรวจสอบ
    //    ไม่สร้างแถวใน logs เพราะยังไม่ใช่การทานยา ถ้าสร้างจะทำให้สถิติ adherence เพี้ยน
    if (!context.medicine || context.medicine.confirmed === false) {
      const files = imageFiles(form);
      const shot = await uploadImages({
        files, boxId: box.box_id, userId: context.user.user_id, logId: null,
      });
      warnings.push(...shot.warnings);

      const vision = await analyzePills(await buffersOf(files));
      if (!vision) {
        note(await recordDeviceEvent({
          boxId: box.box_id, eventType, occurredAt: openedAt, lidOpenSeconds: openSeconds, lidOpenMs: openMs,
          detail: { note: 'สแกนตั้งค่าครั้งแรก แต่ยังประมวลผลภาพไม่ได้' },
        }));
        return NextResponse.json({
          ok: true, setup: true, counted: null,
          images: shot.urls.length, warnings: [...warnings, 'ยังไม่ได้ตั้งค่าบริการประมวลผลภาพ'],
        });
      }

      // รับเฉพาะยาที่อยู่ในรายการที่โมเดลจำแนกได้ ถ้าไม่ตรงจะปล่อย code ว่างไว้
      // แล้วให้ผู้ใช้เลือกเองในหน้าเว็บ ดีกว่าบันทึกชื่อที่ระบบยืนยันต่อไม่ได้
      const scanned = medicineByCode(vision.medicine_code);
      // กล่องรองรับยาชนิดเดียว ยอดตั้งต้นจึงนับเฉพาะชนิดที่จำแนกได้
      const scannedCount = countOf(vision, scanned?.code ?? null);
      const scannedOthers = foreignIn(vision, scanned?.code ?? null);
      const record = {
        code: scanned?.code ?? null,
        name: scanned?.nameTh ?? 'ยังระบุชนิดไม่ได้',
        total_pills: scannedCount,
        count_source: 'camera' as const,
        last_counted_at: now.toISOString(),
        confirmed: false,
        detection: { ...detectionPayload(vision), images: shot.urls },
      };

      const { data: medicine, error } = context.medicine
        ? await db.from('medicines').update(record)
            .eq('medicine_id', context.medicine.medicine_id).select().single()
        : await db.from('medicines').insert({ user_id: context.user.user_id, ...record })
            .select().single();
      if (error) return jsonError(`บันทึกผลการสแกนไม่สำเร็จ: ${error.message}`, 500);

      note(await recordDeviceEvent({
        boxId: box.box_id, eventType, occurredAt: openedAt, lidOpenSeconds: openSeconds, lidOpenMs: openMs,
        detail: { note: 'สแกนตั้งค่าครั้งแรก', counted: vision.count, per_class: vision.per_class },
      }));

      await sendLinePushMessage(
        context.user.line_user_id,
        [
          '📷 อ่านข้อมูลยาในกล่องเรียบร้อยแล้ว',
          `ชนิดยา: ${scanned ? `${scanned.nameTh} (${scanned.nameEn})` : 'ยังระบุไม่ได้'}`,
          `จำนวน: ${scannedCount} เม็ด`,
          vision.stable ? '' : '(ผลการนับแต่ละภาพไม่เท่ากัน ควรตรวจสอบ)',
          Object.keys(scannedOthers).length
            ? `พบยาชนิดอื่นปนอยู่ ${describeClasses(scannedOthers)} กล่องรองรับยาชนิดเดียว กรุณานำออก`
            : '',
          scanned ? '' : 'ยานี้ไม่อยู่ใน 6 ชนิดที่ระบบรองรับ กรุณาเลือกชนิดยาในหน้าเว็บ',
          'กรุณาเปิดหน้าเว็บเพื่อตรวจสอบและยืนยันข้อมูล',
        ].filter(Boolean).join('\n'),
      );

      return NextResponse.json({
        ok: true, setup: true,
        medicine_id: medicine.medicine_id,
        counted: scannedCount,
        medicine: scanned?.code ?? null,
        recognised: Boolean(scanned),
        images: shot.urls.length,
        warnings,
      });
    }

    // 3) หามื้อที่ใกล้ที่สุดของวันนี้ ต้องอยู่ในกรอบ ±90 นาที
    const candidates = schedulesForDate(context.schedules, today).map((schedule) => ({
      schedule,
      at: doseTime(schedule, today),
      diff: Math.abs(doseTime(schedule, today).getTime() - now.getTime()) / 60_000,
    }));
    const nearest = candidates.sort((a, b) => a.diff - b.diff)[0];
    const matched: { schedule: Schedule; at: Date } | null =
      nearest && nearest.diff <= MATCH_WINDOW_MINUTES ? nearest : null;

    // 4) เปิดนอกเวลามื้อยา → ลงเป็นประวัติการเข้าถึงกล่อง ไม่แตะตัวเลข adherence
    if (!matched) {
      const files = imageFiles(form);
      const outside = await uploadImages({
        files, boxId: box.box_id, userId: context.user.user_id, logId: null,
      });
      warnings.push(...outside.warnings);

      // นับด้วย เพราะการเปิดนอกเวลามื้อส่วนใหญ่คือการเติมยา ซึ่งต้องอัปเดตยอดคงเหลือ
      const vision = await analyzePills(await buffersOf(files));
      if (vision && context.medicine) {
        await db.from('medicines').update({
          total_pills: countOf(vision, context.medicine.code),
          count_source: 'camera',
          last_counted_at: now.toISOString(),
        }).eq('medicine_id', context.medicine.medicine_id);
      }

      note(await recordDeviceEvent({
        boxId: box.box_id, eventType, occurredAt: openedAt, lidOpenSeconds: openSeconds, lidOpenMs: openMs,
        detail: {
          note: 'เปิดนอกเวลามื้อยา',
          ...(vision ? { counted: vision.count, per_class: vision.per_class } : {}),
        },
      }));

      return NextResponse.json({
        ok: true, matched_schedule: null, outside_schedule: true,
        images: outside.urls.length, counted: vision?.count ?? null, warnings,
      });
    }

    // 5) หา/สร้าง log ของมื้อนั้น
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

    // 6) อัปโหลดภาพชุด แล้วส่งภาพเดียวกันให้โมเดลนับเม็ดยา
    const files = imageFiles(form);
    const upload = await uploadImages({
      files, boxId: box.box_id, userId: context.user.user_id, logId: logId!,
    });
    const images = upload.urls;
    warnings.push(...upload.warnings);

    const vision = await analyzePills(await buffersOf(files));

    // 7) ตีความจากจำนวนเม็ดยาที่หายไป
    //    pills_before มาจากยอดที่นับได้ครั้งก่อน ส่วน pills_after คือที่นับได้ครั้งนี้
    //    เก็บทั้งสองค่าไว้ ไม่เก็บ "หายไปกี่เม็ด" เพราะคำนวณจากสองค่านี้ได้
    const dose = matched.schedule.dose_amount || 1;
    const pillsBefore = context.medicine?.total_pills ?? null;
    // นับเฉพาะยาชนิดที่ลงทะเบียนไว้ ยาแปลกปลอมที่ปนมาต้องไม่ถูกนับรวม
    // ไม่งั้นการหยิบยาผิดชนิดจะทำให้ผลต่างออกมาเท่าขนาดที่กำหนด แล้วระบบสรุปว่าทานถูก
    const pillsAfter = vision ? countOf(vision, context.medicine?.code ?? null) : null;
    const removed = pillsBefore !== null && pillsAfter !== null ? pillsBefore - pillsAfter : null;

    const outcome: Outcome =
      removed === null ? 'unverified'
        : removed === 0 ? 'not_taken'
          : removed < 0 ? 'refilled'
            : removed === dose ? 'taken'
              : removed > dose ? 'over_dose'
                : 'partial';

    // กล่องรองรับยาชนิดเดียว ยาชนิดอื่นที่โผล่ในภาพถือว่าผิดปกติทั้งหมด
    // ดูทุกชนิดที่พบ ไม่ใช่แค่ชนิดที่พบมากที่สุด เพราะยาที่ปนมาจำนวนน้อย
    // จะไม่มีวันเป็นชนิดเด่น แต่เป็นสิ่งที่ผู้ดูแลต้องรู้มากที่สุด
    const others = vision ? foreignIn(vision, context.medicine?.code ?? null) : {};
    const foreign = Object.keys(others).length ? describeClasses(others) : null;
    if (foreign) warnings.push(`พบยาที่ไม่ตรงกับที่ลงทะเบียน: ${foreign}`);

    // บันทึกว่าทานยาเมื่อยาหายไปจริงเท่านั้น ยกเว้นกรณีที่ยังไม่มีผลจากโมเดล
    const markTaken = outcome === 'unverified' || (removed !== null && removed > 0);

    await db
      .from('logs')
      .update({
        ...(markTaken && !alreadyTaken
          ? { status: 'taken', actual_time: now.toISOString(), confirmed_by: 'device' }
          : {}),
        lid_opened_at: openedAt,
        lid_open_seconds: openSeconds,
        lid_open_ms: openMs,
        pills_before: pillsBefore,
        pills_after: pillsAfter,
        ...(vision ? { detection: { ...detectionPayload(vision), outcome, foreign } } : {}),
        ...(images[0] ? { image_url: images[0] } : {}),
      })
      .eq('log_id', logId!);

    note(await recordDeviceEvent({
      boxId: box.box_id, eventType, occurredAt: openedAt,
      lidOpenSeconds: openSeconds, lidOpenMs: openMs, logId: logId!,
      detail: { images: images.length, outcome, pills_after: pillsAfter },
    }));

    // 8) อัปเดตยอดคงเหลือ — เชื่อกล้องก่อนเสมอ เพราะเป็นค่าที่วัดได้จริง
    if (context.medicine) {
      if (pillsAfter !== null) {
        await db.from('medicines').update({
          total_pills: pillsAfter,
          count_source: 'camera',
          last_counted_at: now.toISOString(),
        }).eq('medicine_id', context.medicine.medicine_id);
      } else if (!alreadyTaken) {
        // ไม่มีผลจากกล้อง ใช้วิธีเดิมคือหักตามจำนวนที่ตารางกำหนด
        await db.from('medicines').update({
          total_pills: Math.max(0, context.medicine.total_pills - dose),
        }).eq('medicine_id', context.medicine.medicine_id);
      }
    }

    // 9) แจ้งผู้ดูแล — ข้อความต่างกันตามผลที่ตีความได้
    if (!alreadyTaken || outcome === 'over_dose' || foreign) {
      // ข้อความแบบตัวอักษรยังใช้เป็น altText ที่โผล่ในแถบแจ้งเตือนของ LINE
      // ส่วนตัวการ์ดเป็น Flex เพราะผลลัพธ์นี้มีทั้งภาพและตัวเลขก่อน-หลังที่ต้องอ่านเทียบกัน
      const alt = lineMessage({
        outcome, matched, openedAt, openSeconds, images: images.length,
        removed, dose, remaining: pillsAfter, foreign, vision,
        medicineName: context.medicine?.name ?? null,
      });

      await sendLineFlex(
        context.user.line_user_id,
        alt.split('\n')[0],
        flexDoseResult({
          outcome,
          time: hhmm(matched.schedule.time),
          openedAt: timeOf(openedAt),
          openSeconds,
          medicineName: context.medicine?.name ?? 'ยาในกล่อง',
          doseAmount: dose,
          pillsBefore, pillsAfter, removed, foreign,
          stable: vision?.stable ?? true,
          imageUrl: images[0] ?? null,
          imageCount: images.length,
        }),
      );
    }

    return NextResponse.json({
      ok: true,
      log_id: logId,
      matched_schedule: matched.schedule.schedule_id,
      lid_open_seconds: openSeconds,
      lid_open_ms: openMs,
      images: images.length,
      already_taken: alreadyTaken,
      outcome,
      pills_before: pillsBefore,
      pills_after: pillsAfter,
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
  files: File[];
  boxId: string;
  userId: string;
  logId: string | null;
}): Promise<{ urls: string[]; warnings: string[] }> {
  const { files, boxId, userId, logId } = params;
  const warnings: string[] = [];
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
        bytes: file.size,
      });
      if (rowError) warnings.push(`บันทึก log_images ไม่สำเร็จ: ${rowError.message}`);
    }
  }

  return { urls, warnings };
}

/** ดึงเฉพาะไฟล์ภาพที่ส่งมาในฟอร์ม เรียงตามลำดับเฟรม */
function imageFiles(form: FormData | null): File[] {
  if (!form) return [];
  return [...form.entries()]
    .filter(([name, value]) => name.startsWith('image') && value instanceof File)
    .map(([, value]) => value as File)
    .filter((file) => file.size > 0);
}

/** เขียนรายชื่อยาที่ปนมาให้อ่านรู้เรื่อง เช่น "ไกวเฟนิซิน 4 เม็ด" */
function describeClasses(perClass: Record<string, number>): string {
  return Object.entries(perClass)
    .map(([modelClass, n]) => `${medicineByModelClass(modelClass)?.nameTh ?? modelClass} ${n} เม็ด`)
    .join(' · ');
}

/** อ่านไฟล์เป็น Buffer เพื่อส่งให้โมเดล — ใช้ภาพชุดเดียวกับที่อัปโหลด */
async function buffersOf(files: File[]): Promise<Buffer[]> {
  return Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer())));
}

/** ข้อความแจ้งผู้ดูแล — เขียนให้อ่านแล้วรู้ทันทีว่าระบบเห็นอะไรและสรุปว่าอย่างไร */
function lineMessage(params: {
  outcome: Outcome;
  matched: { schedule: Schedule };
  openedAt: string;
  openSeconds: number | null;
  images: number;
  removed: number | null;
  dose: number;
  /** ยอดคงเหลือของยาชนิดที่ลงทะเบียนไว้ ไม่ใช่จำนวนวัตถุทั้งหมดในภาพ */
  remaining: number | null;
  foreign: string | null;
  vision: VisionResult | null;
  medicineName: string | null;
}): string {
  const { outcome, matched, openedAt, openSeconds, images, removed, dose, remaining, foreign,
    vision, medicineName } = params;
  const at = `เปิดฝา ${timeOf(openedAt)} น.${openSeconds ? ` นาน ${openSeconds} วินาที` : ''}`;
  const meal = `มื้อ ${hhmm(matched.schedule.time)} น.`;

  const head =
    outcome === 'taken' ? `✅ บันทึกการทานยา${meal}แล้ว — ยาหายไป ${removed} เม็ดตามที่กำหนด`
      : outcome === 'partial' ? `⚠️ ${meal} หยิบยาไป ${removed} เม็ด จากที่ต้องทาน ${dose} เม็ด`
        : outcome === 'over_dose' ? `🚨 ${meal} หยิบยาไป ${removed} เม็ด มากกว่าที่กำหนด ${dose} เม็ด`
          : outcome === 'not_taken' ? `⚠️ มีการเปิดกล่องใน${meal} แต่จำนวนยาไม่เปลี่ยน ยังไม่บันทึกว่าทานยา`
            : outcome === 'refilled' ? `ℹ️ ตรวจพบการเติมยา ยอดคงเหลือตอนนี้ ${remaining ?? '-'} เม็ด`
              : `✅ บันทึกการทานยา${meal}แล้ว`;

  const lines = [head, at];
  if (medicineName) lines.push(`ยา: ${medicineName}`);
  if (vision) {
    lines.push(
      `คงเหลือในกล่อง ${remaining ?? '-'} เม็ด${vision.stable ? '' : ' (ผลไม่นิ่ง ควรตรวจสอบ)'}`,
    );
  }
  if (foreign) lines.push(`🚨 พบยาที่ไม่ตรงกับที่ลงทะเบียนไว้: ${foreign}`);
  if (images) lines.push(`ถ่ายภาพไว้ ${images} ภาพ`);
  return lines.join('\n');
}
