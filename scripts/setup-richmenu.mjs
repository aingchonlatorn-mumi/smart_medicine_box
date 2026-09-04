#!/usr/bin/env node
/**
 * ลงทะเบียน Rich Menu กับ LINE Official Account
 *
 *   node scripts/setup-richmenu.mjs                      ติดตั้ง/อัปเดตเมนู
 *   node scripts/setup-richmenu.mjs --image=a.png        ใช้ภาพของตัวเอง
 *   node scripts/setup-richmenu.mjs --list     ดูเมนูที่มีอยู่
 *   node scripts/setup-richmenu.mjs --clean    ลบเมนูเก่าทั้งหมดแล้วติดตั้งใหม่
 *
 * ต้องมีใน .env.local:
 *   LINE_CHANNEL_ACCESS_TOKEN  ของ Messaging API channel
 *   NEXT_PUBLIC_LIFF_ID        เพื่อทำลิงก์เปิดเว็บในแอป LINE
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imageArg = process.argv.find((a) => a.startsWith('--image='));
const IMAGE = resolve(ROOT, imageArg ? imageArg.slice(8) : 'public/richmenu/richmenu.png');

/** อ่าน .env.local แบบง่าย ๆ ไม่ต้องพึ่ง dependency */
async function loadEnv() {
  const raw = await readFile(resolve(ROOT, '.env.local'), 'utf8').catch(() => '');
  const env = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return { ...env, ...process.env };
}

const env = await loadEnv();
const TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_ID = env.NEXT_PUBLIC_LIFF_ID;

if (!TOKEN) {
  console.error('✖ ไม่พบ LINE_CHANNEL_ACCESS_TOKEN ใน .env.local');
  process.exit(1);
}
if (!LIFF_ID) {
  console.error('✖ ไม่พบ NEXT_PUBLIC_LIFF_ID ใน .env.local');
  process.exit(1);
}

const api = (path, init = {}) =>
  fetch(`https://api.line.me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

/** เปิดหน้าเว็บภายในแอป LINE (LIFF URL พร้อม path เพิ่มเติม) */
const liff = (path) => `https://liff.line.me/${LIFF_ID}${path}`;

/**
 * ผังปุ่ม 2500x1686 ตามภาพเมนู
 *   แถวบน  [ ภาพรวมการทานยาประจำวัน (กว้าง 2/3) ][ ลงทะเบียน ]
 *   แถวล่าง [ ตารางทานยา ][ รายงาน ][ ติดต่อสอบถาม ]
 */
const CELLS = [
  {
    label: 'ภาพรวมการทานยา',
    bounds: { x: 0, y: 0, width: 1666, height: 843 },
    action: { type: 'uri', uri: liff('/dashboard') },
  },
  {
    label: 'ลงทะเบียน',
    bounds: { x: 1666, y: 0, width: 834, height: 843 },
    action: { type: 'uri', uri: liff('/') },
  },
  {
    // webhook ตอบเป็น Flex สรุปมื้อวันนี้ พร้อมปุ่มแก้ไขตาราง / ยืนยันการทาน
    label: 'ตารางทานยา',
    bounds: { x: 0, y: 843, width: 833, height: 843 },
    action: { type: 'postback', data: 'action=get_schedule', displayText: 'ตารางทานยาวันนี้' },
  },
  {
    // webhook ตอบเป็นตัวเลือก 7 / 30 วัน พร้อมลิงก์รายงานสำหรับพิมพ์
    label: 'รายงาน',
    bounds: { x: 833, y: 843, width: 834, height: 843 },
    action: { type: 'postback', data: 'action=get_report_pdf', displayText: 'ขอรายงานการทานยา' },
  },
  {
    label: 'ติดต่อสอบถาม',
    bounds: { x: 1667, y: 843, width: 833, height: 843 },
    action: { type: 'postback', data: 'action=contact', displayText: 'ขอวิธีใช้งาน' },
  },
];

const richMenu = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: `Smart PillBox ${new Date().toISOString().slice(0, 10)}`,
  chatBarText: 'เมนูกล่องยา',
  areas: CELLS.map(({ label, bounds, action }) => ({ bounds, action: { label, ...action } })),
};

/** อ่านขนาดจากไฟล์ PNG โดยตรง — LINE รับเฉพาะ 2500x1686 หรือ 2500x843 */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function list() {
  const res = await api('/v2/bot/richmenu/list');
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body.richmenus ?? [];
}

async function main() {
  const mode = process.argv[2];

  if (mode === '--list') {
    const menus = await list();
    if (!menus.length) return console.log('ยังไม่มี Rich Menu ในบัญชีนี้');
    for (const m of menus) console.log(`${m.richMenuId}  ${m.name}  (${m.chatBarText})`);
    return;
  }

  if (mode === '--clean') {
    for (const m of await list()) {
      await api(`/v2/bot/richmenu/${m.richMenuId}`, { method: 'DELETE' });
      console.log('ลบเมนูเก่า:', m.richMenuId);
    }
  }

  // 1) สร้างโครงเมนู
  const createRes = await api('/v2/bot/richmenu', {
    method: 'POST',
    body: JSON.stringify(richMenu),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(`สร้างเมนูไม่สำเร็จ: ${JSON.stringify(created)}`);
  const id = created.richMenuId;
  console.log('สร้างเมนูแล้ว:', id);

  // 2) อัปโหลดภาพ (คนละโดเมนกับ API ปกติ)
  const image = await readFile(IMAGE).catch(() => null);
  if (!image) {
    throw new Error(`ไม่พบภาพ ${IMAGE} — รัน python3 scripts/make_richmenu_image.py ก่อน`);
  }
  const size = pngSize(image);
  if (size && (size.width !== 2500 || (size.height !== 1686 && size.height !== 843))) {
    throw new Error(`ขนาดภาพต้องเป็น 2500x1686 หรือ 2500x843 แต่ได้ ${size.width}x${size.height}`);
  }
  if (image.length > 1024 * 1024) {
    throw new Error(`ไฟล์ใหญ่เกิน 1 MB (${(image.length / 1024).toFixed(0)} KB)`);
  }

  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${id}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'image/png' },
    body: image,
  });
  if (!uploadRes.ok) {
    throw new Error(`อัปโหลดภาพไม่สำเร็จ: ${await uploadRes.text()}`);
  }
  console.log(`อัปโหลดภาพแล้ว (${(image.length / 1024).toFixed(0)} KB)`);

  // 3) ตั้งเป็นเมนูเริ่มต้นของผู้ใช้ทุกคน
  const defaultRes = await api(`/v2/bot/user/all/richmenu/${id}`, { method: 'POST' });
  if (!defaultRes.ok) {
    throw new Error(`ตั้งเป็นเมนูเริ่มต้นไม่สำเร็จ: ${await defaultRes.text()}`);
  }

  console.log('\n✓ ติดตั้ง Rich Menu เรียบร้อย');
  console.log('  เปิดแชทกับบอทในแอป LINE แล้วดูเมนูด้านล่างได้เลย');
  console.log('  (ถ้ายังเห็นเมนูเก่า ให้ปิดแล้วเปิดห้องแชทใหม่)');
}

main().catch((err) => {
  console.error('✖', err.message);
  process.exit(1);
});
