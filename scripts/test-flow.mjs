/**
 * จำลองการใช้งานทั้งระบบตั้งแต่ลงทะเบียนใหม่ โดยไม่ต้องใช้กล่องจริง
 *
 * สคริปต์นี้ทำหน้าที่แทนกล่องยา (ขอคีย์ ส่งภาพ) และแทนผู้ใช้ (ยืนยันผล ตั้งตาราง)
 * ใช้ร่วมกับ vision/fake_server.py ซึ่งกำหนดจำนวนเม็ดยาที่จะให้ตอบกลับได้
 *
 *   node scripts/test-flow.mjs
 *   node scripts/test-flow.mjs --base http://localhost:3000 --serial B-TEST
 *
 * ใช้กับโมเดลจริง (vision/server.py) ให้ส่งภาพถ่ายจริงด้วย --images
 *   node scripts/test-flow.mjs --images a.jpg,b.jpg --serial B-999 --phone 0888888888
 * กรณีนี้จำนวนเม็ดยาจะมาจากภาพที่ส่ง ไม่ใช่ค่าที่ตั้งไว้ในบริการจำลอง
 */
import { readFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const BASE = arg('base', 'http://localhost:3000');
const VISION = arg('vision', 'http://127.0.0.1:8008');
const SERIAL = arg('serial', 'B-TEST');
const MAC = arg('mac', 'AABBCCDDEE01');
const PHONE = arg('phone', '0999999999');
const IMAGES = (arg('images', '') || '').split(',').filter(Boolean);
const REAL_IMAGES = IMAGES.length > 0;

// JPEG ขนาด 1x1 จุด ใช้เป็นภาพหลอก เพราะบริการจำลองไม่ได้อ่านภาพจริง
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

let deviceKey = '';
let userId = '';

const step = (n, text) => console.log(`\n[${n}] ${text}`);
const show = (label, value) => console.log(`    ${label}: ${value}`);

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(userId ? { 'x-user-id': userId } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`${path} → ${res.status} ${json.error || json.raw || ''}`);
  return json;
}

/** ตั้งค่าจำนวนเม็ดยาที่บริการจำลองจะตอบกลับ — ไม่มีผลเมื่อใช้ภาพจริง */
async function setCount(count, medicine) {
  if (REAL_IMAGES) return;
  const q = new URLSearchParams({ count: String(count) });
  if (medicine) q.set('medicine', medicine);
  await fetch(`${VISION}/set?${q}`);
}

/** จำลองการเปิด-ปิดฝาหนึ่งครั้ง พร้อมส่งภาพ 3 เฟรม */
async function lidClose(openSeconds = 8) {
  const form = new FormData();
  form.set('box_serial', SERIAL);
  form.set('device_mac', MAC);
  form.set('event', 'lid_close');
  form.set('lid_open_seconds', String(openSeconds));
  form.set('firmware', 'sim-2.2.0');
  const files = REAL_IMAGES ? IMAGES.map((f) => readFileSync(f)) : [TINY_JPEG, TINY_JPEG, TINY_JPEG];
  files.forEach((buf, i) => {
    form.set(`image${i}`, new Blob([buf], { type: 'image/jpeg' }), `f${i}.jpg`);
  });
  return api('/api/hardware/upload', {
    method: 'POST',
    body: form,
    headers: { 'x-device-mac': MAC, 'x-device-key': deviceKey, 'x-device-serial': SERIAL },
  });
}

async function main() {
  console.log(`เว็บ: ${BASE}\nบริการจำลองโมเดล: ${VISION}\nกล่อง: ${SERIAL}`);

  const health = await fetch(`${VISION}/health`).then((r) => r.json()).catch(() => null);
  if (!health) throw new Error(`เรียก ${VISION} ไม่ได้ — ยังไม่ได้รันบริการประมวลผลภาพหรือเปล่า`);
  console.log(`โมเดล: ${health.model}`);
  if (REAL_IMAGES) {
    console.log(`ใช้ภาพจริง ${IMAGES.length} ไฟล์ — จำนวนเม็ดยามาจากภาพ ไม่ใช่ค่าที่ตั้งไว้`);
  }

  step(1, 'ลงทะเบียนผู้ใช้และผูกกล่อง');
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'ผู้ทดสอบระบบ', phone: PHONE, box_serial: SERIAL, birth_date: '2500-01-01' },
  });
  userId = reg.user?.user_id || reg.user_id;
  show('user_id', userId);

  step(2, 'กล่องขอคีย์ยืนยันตัวตน');
  const prov = await api('/api/hardware/provision', {
    method: 'POST',
    body: { box_serial: SERIAL, mac: MAC, firmware: 'sim-2.2.0' },
  });
  deviceKey = prov.device_key;
  show('ได้คีย์แล้ว', deviceKey ? 'ใช่' : 'ไม่');

  step(3, 'ใส่ยา 24 เม็ดแล้วปิดฝา — กล่องถ่ายภาพและส่งเข้าระบบ');
  await setCount(24, 'Ferrous Fumarate');
  const setup = await lidClose();
  show('โหมด', setup.setup ? 'สแกนตั้งค่าครั้งแรก' : 'ไม่ใช่โหมดตั้งค่า');
  show('อ่านได้', `${setup.medicine} จำนวน ${setup.counted} เม็ด`);

  step(4, 'เว็บดึงผลการสแกนมาแสดงให้ผู้ใช้ตรวจสอบ');
  const scan = await api('/api/scans');
  show('สถานะ', scan.status);
  show('ยา', `${scan.medicine?.name} (${scan.medicine?.code ?? 'ยังระบุชนิดไม่ได้'}) ${scan.medicine?.total_pills} เม็ด`);
  show('ภาพ', `${scan.images.length} ภาพ`);

  step(5, 'ผู้ใช้กดยืนยัน');
  const confirmed = await api('/api/scans', {
    method: 'POST',
    // ชนิดยาต้องส่งเป็นรหัสจากรายการที่ระบบรองรับ ไม่ใช่ชื่อที่พิมพ์เอง
    body: { code: scan.medicine.code ?? 'ferrous_fumarate', total_pills: scan.medicine.total_pills },
  });
  show('ยืนยันแล้ว', confirmed.medicine.confirmed);

  step(6, 'ตั้งตารางทานยา วันละ 1 ครั้ง มื้อละ 1 เม็ด');
  const now = new Date(Date.now() + 5 * 60 * 1000);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  await api('/api/schedules', {
    method: 'PUT',
    body: { schedule_type: 'daily', doses: [{ time: `${hh}:${mm}`, dose_amount: 1 }] },
  });
  show('มื้อที่ตั้ง', `${hh}:${mm} น. ครั้งละ 1 เม็ด`);

  step(7, 'กรณีที่ 1 — เปิดกล่องแล้วหยิบยา 1 เม็ด');
  await setCount(23);
  const taken = await lidClose();
  show('ผลการตีความ', taken.outcome);
  show('จำนวนก่อน-หลัง', `${taken.pills_before} → ${taken.pills_after}`);

  step(8, 'กรณีที่ 2 — เปิดกล่องดูเฉย ๆ ไม่หยิบยา');
  const notTaken = await lidClose();
  show('ผลการตีความ', notTaken.outcome);
  show('จำนวนก่อน-หลัง', `${notTaken.pills_before} → ${notTaken.pills_after}`);

  step(9, 'กรณีที่ 3 — หยิบยาเกินขนาด');
  await setCount(20);
  const over = await lidClose();
  show('ผลการตีความ', over.outcome);

  step(10, 'กรณีที่ 4 — เติมยา');
  await setCount(50);
  const refill = await lidClose();
  show('ผลการตีความ', refill.outcome);
  show('ยอดคงเหลือใหม่', refill.pills_after);

  step(11, 'กรณีที่ 5 — พบยาคนละชนิดกับที่ลงทะเบียน');
  await setCount(49, 'Curcuma longa');
  const foreign = await lidClose();
  show('คำเตือน', JSON.stringify(foreign.warnings));

  console.log('\nเสร็จสิ้น เปิดดูผลได้ที่');
  console.log(`  ${BASE}/dashboard   (ใส่ user_id ใน localStorage ด้วยคำสั่งด้านล่าง)`);
  console.log(`  localStorage.setItem('user_id','${userId}'); localStorage.setItem('user_name','ผู้ทดสอบระบบ'); location.reload()`);
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
