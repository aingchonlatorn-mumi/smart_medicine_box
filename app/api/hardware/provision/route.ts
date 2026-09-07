import { NextResponse } from 'next/server';
import { jsonError, normalizeSerial } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-server';
import { formatMac, generateDeviceKey, hashDeviceKey, normalizeMac } from '@/lib/device';
import type { Box } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * ผูกบอร์ดเข้ากับกล่องครั้งแรก — Trust On First Use
 *
 *   POST /api/hardware/provision
 *   { "box_serial": "B-001", "mac": "A0:B7:65:2C:1F:E8", "firmware": "1.0.0" }
 *   → { "device_key": "..." }   บอร์ดต้องเก็บคีย์นี้ลง NVS แล้วใช้ทุกครั้งที่ยิงข้อมูล
 *
 * กล่องหนึ่งใบผูกบอร์ดได้ตัวเดียว ถ้าผูกแล้วจะปฏิเสธ
 * เปลี่ยนบอร์ดใหม่ต้องล้าง device_mac ในฐานข้อมูลก่อน (ตั้งใจให้ต้องทำด้วยมือ
 * เพื่อไม่ให้ใครเอาบอร์ดตัวใหม่มาสวมรอยกล่องเดิมได้เอง)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const serial = normalizeSerial(body.box_serial || body.serial);
    const mac = normalizeMac(body.mac || body.device_mac);

    if (!serial) return jsonError('ต้องส่ง box_serial เช่น B-001');
    if (!mac) return jsonError('MAC ไม่ถูกต้อง ต้องเป็นเลขฐานสิบหก 12 ตัว');

    const db = supabaseAdmin();

    // บอร์ดตัวนี้เคยผูกกับกล่องอื่นไปแล้วหรือยัง
    const { data: existingByMac } = await db
      .from('boxes').select('*').eq('device_mac', mac).maybeSingle();
    const boundBox = existingByMac as Box | null;

    if (boundBox) {
      if (boundBox.box_serial === serial) {
        // ผูกกับกล่องใบเดิมอยู่แล้ว — ออกคีย์ใหม่ให้ (เผื่อบอร์ดล้าง NVS ไป)
        const key = generateDeviceKey();
        await db.from('boxes')
          .update({ device_key_hash: hashDeviceKey(key), device_bound_at: new Date().toISOString() })
          .eq('box_id', boundBox.box_id);
        return NextResponse.json({
          box_serial: boundBox.box_serial,
          device_key: key,
          rebound: true,
        });
      }
      return jsonError(
        `บอร์ด ${formatMac(mac)} ผูกกับกล่อง ${boundBox.box_serial} อยู่แล้ว`,
        409,
      );
    }

    const { data: found } = await db
      .from('boxes').select('*').eq('box_serial', serial).maybeSingle();
    const box = found as Box | null;

    if (!box) return jsonError(`ไม่พบกล่อง ${serial} ในระบบ`, 404);
    if (box.device_mac) {
      return jsonError(
        `กล่อง ${serial} ผูกกับบอร์ด ${formatMac(box.device_mac)} ไปแล้ว ` +
          'ถ้าเปลี่ยนบอร์ดใหม่ ให้ล้างค่า device_mac ของกล่องนี้ก่อน',
        409,
      );
    }

    const key = generateDeviceKey();
    const { error } = await db
      .from('boxes')
      .update({
        device_mac: mac,
        device_key_hash: hashDeviceKey(key),
        device_bound_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        firmware_version: body.firmware ?? null,
      })
      .eq('box_id', box.box_id)
      .is('device_mac', null); // กันสองบอร์ดยิงพร้อมกันแล้วแย่งกล่องใบเดียวกัน

    if (error) return jsonError(`ผูกบอร์ดไม่สำเร็จ: ${error.message}`, 500);

    return NextResponse.json({
      box_serial: box.box_serial,
      device_key: key,
      rebound: false,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'ผูกบอร์ดไม่สำเร็จ', 500);
  }
}
