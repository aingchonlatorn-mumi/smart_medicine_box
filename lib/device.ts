// lib/device.ts — ตัวตนและการยืนยันตัวตนของกล่องยา (ESP32)
//
// แยกกันชัดเจน 3 อย่าง
//   box_serial  ตัวตนของ "กล่อง" ที่คนอ่านและกรอกได้ (B-001) พิมพ์ติดข้างกล่อง
//   device_mac  ตัวตนของ "บอร์ด" ที่อยู่ในกล่องใบนั้นตอนนี้ — ไม่ใช่ความลับ
//   device_key  ตัวยืนยันว่าบอร์ดเป็นตัวจริง — เป็นความลับ เก็บเฉพาะ hash ในฐานข้อมูล
import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase-server';
import type { Box } from './types';

/** MAC เก็บรูปแบบเดียวเสมอ: ตัวพิมพ์ใหญ่ 12 ตัว ไม่มีเครื่องหมายคั่น */
export function normalizeMac(raw: string | null | undefined): string | null {
  const mac = (raw || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return /^[0-9A-F]{12}$/.test(mac) ? mac : null;
}

/** MAC สำหรับแสดงผล A0:B7:65:2C:1F:E8 */
export function formatMac(mac: string | null | undefined): string {
  const norm = normalizeMac(mac);
  return norm ? (norm.match(/.{2}/g) ?? []).join(':') : '-';
}

export const hashDeviceKey = (key: string) =>
  crypto.createHash('sha256').update(key).digest('hex');

export const generateDeviceKey = () => crypto.randomBytes(24).toString('hex');

/** เทียบ hash แบบไม่รั่วเวลา กัน timing attack */
function keyMatches(key: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const incoming = Buffer.from(hashDeviceKey(key));
  const stored = Buffer.from(storedHash);
  return incoming.length === stored.length && crypto.timingSafeEqual(incoming, stored);
}

export type DeviceAuthError =
  | 'no_identity'      // ไม่ได้ส่ง MAC หรือ serial มาเลย
  | 'unknown_device'   // ไม่มีกล่องนี้ในระบบ
  | 'mac_mismatch'     // MAC ไม่ตรงกับที่ผูกไว้กับ serial นี้
  | 'not_provisioned'  // ยังไม่เคยผูกบอร์ด ต้องไป /api/hardware/provision ก่อน
  | 'bad_key';         // key ผิด

export interface DeviceAuthResult {
  ok: boolean;
  box?: Box;
  error?: DeviceAuthError;
  message?: string;
}

/**
 * ยืนยันตัวตนของบอร์ดที่ยิงเข้ามา
 *   ทางหลัก  x-device-mac + x-device-key   (ใช้กับฮาร์ดแวร์จริง)
 *   ทางสำรอง x-device-serial + x-device-key เทียบกับ HARDWARE_DEVICE_KEY
 *            (ไว้ทดสอบด้วย curl ตอนยังไม่มีบอร์ด)
 */
export async function authenticateDevice(req: Request): Promise<DeviceAuthResult> {
  const db = supabaseAdmin();
  const mac = normalizeMac(req.headers.get('x-device-mac'));
  const key = req.headers.get('x-device-key') || '';
  const serial = (req.headers.get('x-device-serial') || '').trim().toUpperCase();

  if (mac) {
    const { data } = await db.from('boxes').select('*').eq('device_mac', mac).maybeSingle();
    const box = data as Box | null;

    if (!box) {
      return {
        ok: false,
        error: 'not_provisioned',
        message: `ยังไม่ได้ผูกบอร์ด ${formatMac(mac)} กับกล่องใด — เรียก /api/hardware/provision ก่อน`,
      };
    }
    if (!keyMatches(key, box.device_key_hash ?? null)) {
      return { ok: false, error: 'bad_key', message: 'device key ไม่ถูกต้อง' };
    }
    return { ok: true, box };
  }

  // ทางสำรองสำหรับทดสอบ — ใช้ serial คู่กับคีย์รวมจาก environment
  if (serial) {
    const sharedKey = process.env.HARDWARE_DEVICE_KEY;
    if (sharedKey && key !== sharedKey) {
      return { ok: false, error: 'bad_key', message: 'device key ไม่ถูกต้อง' };
    }
    const { data } = await db.from('boxes').select('*').eq('box_serial', serial).maybeSingle();
    const box = data as Box | null;
    if (!box) return { ok: false, error: 'unknown_device', message: `ไม่พบกล่อง ${serial}` };
    return { ok: true, box };
  }

  return { ok: false, error: 'no_identity', message: 'ต้องส่ง x-device-mac หรือ x-device-serial' };
}

/** อัปเดตว่าบอร์ดยังมีชีวิตอยู่ — ใช้บอกว่ากล่องออฟไลน์ไปนานแค่ไหน */
export async function touchDevice(boxId: string, firmware?: string | null): Promise<void> {
  await supabaseAdmin()
    .from('boxes')
    .update({
      last_seen_at: new Date().toISOString(),
      ...(firmware ? { firmware_version: firmware } : {}),
    })
    .eq('box_id', boxId);
}

/**
 * บันทึกเหตุการณ์ของอุปกรณ์ — ประวัติการเข้าถึงกล่องยา (ขอบเขตข้อ 5)
 * คืนข้อความผิดพลาดถ้าเขียนไม่สำเร็จ เพื่อให้ปลายทางเอาไปแสดงได้
 * (ห้ามกลืน error เงียบ ๆ ไม่งั้นเวลาข้อมูลไม่ขึ้นจะหาสาเหตุไม่เจอ)
 */
export async function recordDeviceEvent(params: {
  boxId: string;
  eventType: 'lid_open' | 'lid_close' | 'boot' | 'heartbeat' | 'error';
  occurredAt?: string;
  lidOpenSeconds?: number | null;
  logId?: string | null;
  detail?: Record<string, unknown> | null;
}): Promise<string | null> {
  const { error } = await supabaseAdmin().from('device_events').insert({
    box_id: params.boxId,
    event_type: params.eventType,
    occurred_at: params.occurredAt ?? new Date().toISOString(),
    lid_open_seconds: params.lidOpenSeconds ?? null,
    log_id: params.logId ?? null,
    detail: params.detail ?? null,
  });

  if (error) {
    console.warn('บันทึก device_event ไม่สำเร็จ:', error.message);
    return error.message;
  }
  return null;
}
