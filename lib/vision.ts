// lib/vision.ts — จุดเชื่อมกับโมเดลตรวจจับเม็ดยา (YOLO)
//
// โมเดลรันอยู่ฝั่ง Python ไม่ได้ฝังไว้ในเว็บ เพราะไฟล์ .pt เป็นโมเดล segmentation
// ที่ถอดผลลัพธ์เองใน Node ได้ยากและเปราะ ส่วนสคริปต์ Python ที่ใช้อยู่ทำงานได้แล้ว
// ที่นี่จึงทำหน้าที่แค่ส่งภาพไปและแปลผลที่ได้กลับมาให้เป็นชนิดข้อมูลที่ระบบใช้
//
// ถ้ายังไม่ได้ตั้ง VISION_SERVICE_URL ทุกฟังก์ชันจะคืน null
// และส่วนที่เรียกใช้ต้องทำงานต่อได้เหมือนเดิม — ระบบเดิมจึงไม่พังระหว่างที่ยังไม่มีโมเดล

import { medicineByCode, medicineByModelClass, isSupportedModelClass } from '@/lib/medicines';

const DEFAULT_TIMEOUT_MS = 20000;

/** ผลการนับจากภาพหนึ่งชุด (หนึ่งครั้งที่เปิด-ปิดกล่อง) */
export interface VisionResult {
  /** จำนวนเม็ดยาทั้งหมดที่นับได้ — ใช้ค่ามัธยฐานของทุกเฟรม */
  count: number;
  /** จำนวนแยกตามชนิดยา เช่น { "Amoxicillin": 12 } */
  per_class: Record<string, number>;
  /** ชนิดยาที่พบมากที่สุดในภาพ — กล่องหนึ่งมียาชนิดเดียว จึงใช้เสียงข้างมาก */
  medicine: string | null;
  /** รหัสยาในรายการที่ระบบรองรับ — null เมื่อโมเดลตอบคลาสที่ไม่รู้จัก */
  medicine_code: string | null;
  /** วัตถุที่โมเดลตรวจเจอแต่ไม่ใช่ยาในรายการ ไม่ถูกนับรวมใน count */
  ignored: number;
  /** จำนวนที่นับได้ของแต่ละเฟรม เก็บไว้ดูความนิ่งของผล */
  frames: number[];
  /** ทุกเฟรมนับได้เท่ากันหรือไม่ — ถ้าไม่เท่า ควรให้คนยืนยันก่อนเชื่อ */
  stable: boolean;
  model_version: string | null;
}

export function visionEnabled(): boolean {
  return Boolean(process.env.VISION_SERVICE_URL);
}

/**
 * ส่งภาพไปให้บริการโมเดลนับเม็ดยา
 * คืน null เมื่อยังไม่ได้ตั้งค่า เรียกไม่สำเร็จ หรือผลลัพธ์ผิดรูป
 * ผู้เรียกต้องถือว่า null = "ยังไม่รู้" ไม่ใช่ "นับได้ศูนย์เม็ด"
 */
export async function analyzePills(images: (Buffer | Uint8Array)[]): Promise<VisionResult | null> {
  const base = process.env.VISION_SERVICE_URL;
  if (!base || images.length === 0) return null;

  const timeout = Number(process.env.VISION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const url = `${base.replace(/\/+$/, '')}/analyze`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.VISION_SERVICE_KEY ? { 'x-vision-key': process.env.VISION_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({
        images: images.map((img) => Buffer.from(img).toString('base64')),
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      console.warn(`[vision] บริการโมเดลตอบกลับ ${res.status}`);
      return null;
    }
    return parseResult(await res.json());
  } catch (err) {
    // ตั้งใจกลืน error ไว้ตรงนี้ เพราะการนับไม่ได้ต้องไม่ทำให้การอัปโหลดภาพล้มเหลว
    console.warn('[vision] เรียกบริการโมเดลไม่สำเร็จ:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** แปลง JSON จากบริการโมเดลให้เป็น VisionResult — ข้อมูลผิดรูปถือว่าใช้ไม่ได้ */
function parseResult(raw: unknown): VisionResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const count = Number(data.count);
  if (!Number.isInteger(count) || count < 0) return null;

  // นับเฉพาะยาที่อยู่ในรายการที่ระบบรองรับ ตัวที่เหลือไม่นับรวมเป็นเม็ดยา
  // กรองซ้ำที่นี่อีกชั้น เผื่อบริการโมเดลที่รันอยู่เป็นรุ่นเก่าที่ยังไม่ได้กรอง
  const perClass: Record<string, number> = {};
  let ignored = 0;
  if (data.per_class && typeof data.per_class === 'object') {
    for (const [name, value] of Object.entries(data.per_class as Record<string, unknown>)) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (isSupportedModelClass(name)) perClass[name] = n;
      else ignored += n;
    }
  }
  if (typeof data.ignored === 'number' && data.ignored > ignored) ignored = data.ignored;

  // จำนวนที่ใช้จริงคือผลรวมของยาที่รู้จัก ไม่ใช่จำนวนวัตถุทั้งหมดที่โมเดลเห็น
  const entries = Object.values(perClass);
  const pillCount = entries.length ? entries.reduce((a, b) => a + b, 0) : count - ignored;

  const frames = Array.isArray(data.frames)
    ? data.frames.map(Number).filter((n) => Number.isInteger(n) && n >= 0)
    : [];

  const reported = typeof data.medicine === 'string' && data.medicine ? data.medicine : null;
  const medicine = reported && isSupportedModelClass(reported) ? reported : dominant(perClass);

  return {
    count: Math.max(0, pillCount),
    per_class: perClass,
    medicine,
    medicine_code: medicineByModelClass(medicine)?.code ?? null,
    ignored,
    frames,
    stable: frames.length > 1 ? new Set(frames).size === 1 : true,
    model_version: typeof data.model_version === 'string' ? data.model_version : null,
  };
}

/** ชนิดยาที่พบมากที่สุด — เท่ากันหลายชนิดถือว่าตัดสินไม่ได้ */
function dominant(perClass: Record<string, number>): string | null {
  const ranked = Object.entries(perClass).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

/**
 * จำนวนเม็ดของยาชนิดที่กำหนด — กล่องหนึ่งใบรองรับยาชนิดเดียว
 * จึงต้องนับเฉพาะชนิดที่ลงทะเบียนไว้ ไม่ใช่จำนวนรวมทั้งภาพ
 * ไม่งั้นยาแปลกปลอมที่ปนเข้ามาจะทำให้ผลต่างก่อน-หลังเพี้ยนโดยไม่มีใครรู้
 */
export function countOf(result: VisionResult, code: string | null): number {
  const type = medicineByCode(code);
  if (!type) return result.count;
  return result.per_class[type.modelClass] ?? 0;
}

/** ยาชนิดอื่นที่พบในภาพนอกเหนือจากที่ลงทะเบียนไว้ */
export function foreignIn(result: VisionResult, code: string | null): Record<string, number> {
  const type = medicineByCode(code);
  const others: Record<string, number> = {};
  for (const [name, n] of Object.entries(result.per_class)) {
    if (!type || name !== type.modelClass) others[name] = n;
  }
  return others;
}

/** เก็บลงคอลัมน์ detection ของ logs / medicines */
export function detectionPayload(result: VisionResult) {
  return {
    per_class: result.per_class,
    medicine_code: result.medicine_code,
    ignored: result.ignored,
    frames: result.frames,
    stable: result.stable,
    model_version: result.model_version,
    analyzed_at: new Date().toISOString(),
  };
}
