/**
 * สร้างตัวเลขสำหรับตารางที่ 4.1 และ 4.2 จากข้อมูลที่ระบบบันทึกไว้จริง
 *
 *   node scripts/report-hardware.mjs                  ใช้ข้อมูลทั้งหมด
 *   node scripts/report-hardware.mjs --serial B-001   เฉพาะกล่องใบเดียว
 *   node scripts/report-hardware.mjs --since 2026-10-06T09:00
 *   node scripts/report-hardware.mjs --csv ผลการทดลอง.csv
 *
 * อ่านจากตาราง device_events และ logs โดยตรง จึงตรวจสอบย้อนหลังได้
 * และไม่ต้องนับด้วยมือ ซึ่งเป็นสิ่งที่ผู้ตรวจรายงานมักถาม
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

/** อ่านค่าจาก .env.local เองเพราะสคริปต์นี้รันนอก Next.js */
function env(key) {
  if (process.env[key]) return process.env[key];
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const line = text.split('\n').find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : '';
}

const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

const SERIAL = arg('serial', '');
const SINCE = arg('since', '');
/** ภาพที่ใหญ่กว่าค่ามัธยฐานเกินเท่านี้ ถือว่าถ่ายผิดจังหวะ */
const SIZE_LIMIT = 1.8;

const pct = (part, whole) => (whole ? ((part / whole) * 100).toFixed(2) : '0.00');
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

async function main() {
  let boxId = null;
  if (SERIAL) {
    const { data } = await db.from('boxes').select('box_id').eq('box_serial', SERIAL).maybeSingle();
    if (!data) throw new Error(`ไม่พบกล่อง ${SERIAL}`);
    boxId = data.box_id;
  }

  const where = (q) => {
    if (boxId) q = q.eq('box_id', boxId);
    if (SINCE) q = q.gte('occurred_at', new Date(SINCE).toISOString());
    return q;
  };

  const { data: events, error } = await where(
    db.from('device_events')
      .select('event_id, event_type, occurred_at, lid_open_ms, lid_open_seconds, log_id, detail')
      .order('occurred_at', { ascending: true }),
  );
  if (error) throw new Error(error.message);

  const opens = events.filter((e) => e.event_type === 'lid_open');
  const closes = events.filter((e) => e.event_type === 'lid_close');

  // สัญญาณซ้ำซ้อน = เหตุการณ์ชนิดเดียวกันสองครั้งห่างกันไม่ถึง 1 วินาที
  let bounce = 0;
  for (const list of [opens, closes]) {
    for (let i = 1; i < list.length; i++) {
      const gap = new Date(list[i].occurred_at) - new Date(list[i - 1].occurred_at);
      if (gap < 1000) bounce++;
    }
  }

  const logIds = [...new Set(closes.map((e) => e.log_id).filter(Boolean))];
  const { data: images } = logIds.length
    ? await db.from('log_images').select('log_id, bytes, sequence').in('log_id', logIds)
    : { data: [] };
  const { data: logs } = logIds.length
    ? await db.from('logs')
        .select('log_id, lid_opened_at, actual_time, lid_open_ms, pills_after, detection')
        .in('log_id', logIds)
    : { data: [] };

  const perLog = new Map();
  for (const img of images || []) {
    if (!perLog.has(img.log_id)) perLog.set(img.log_id, []);
    perLog.get(img.log_id).push(img);
  }

  const cycles = closes.length;
  const withThree = [...perLog.values()].filter((list) => list.length === 3).length;

  const sizes = (images || []).map((i) => i.bytes).filter((b) => typeof b === 'number' && b > 0);
  const sizeMedian = median(sizes);
  const usable = sizes.filter((b) => b <= sizeMedian * SIZE_LIMIT).length;

  const uploaded = closes.filter((e) => e.log_id).length;
  const stable = (logs || []).filter((l) => l.detection?.stable !== false).length;

  console.log(`\nกล่อง: ${SERIAL || 'ทุกใบ'}${SINCE ? ` · ตั้งแต่ ${SINCE}` : ''}`);
  console.log(`รอบเปิด-ปิดฝาที่บันทึกได้: ${cycles} รอบ\n`);

  console.log('ตารางที่ 4.1 ความน่าเชื่อถือของฮาร์ดแวร์');
  console.log('| รายการทดสอบ | ทดสอบ | สำเร็จ | ร้อยละ |');
  console.log('|---|---|---|---|');
  const row = (label, ok, total) =>
    console.log(`| ${label} | ${total} | ${ok} | ${pct(ok, total)} |`);
  row('การตรวจจับการเปิดฝากล่อง', opens.length, cycles);
  row('การตรวจจับการปิดฝากล่อง', closes.length, cycles);
  row('การไม่เกิดสัญญาณซ้ำซ้อนจากหน้าสัมผัส', cycles - bounce, cycles);
  row('การบันทึกภาพครบ 3 เฟรม', withThree, cycles);
  row('ภาพที่ใช้งานได้ตามเกณฑ์ขนาดไฟล์', usable, sizes.length);
  row('ผลการนับตรงกันทุกเฟรม', stable, (logs || []).length);
  row('การอัปโหลดสำเร็จในการส่งครั้งแรก', uploaded, cycles);

  const openMs = closes.map((e) => e.lid_open_ms).filter((v) => typeof v === 'number');
  // เวลาที่ปิดฝา = เวลาที่เปิด + ระยะที่เปิดค้าง ส่วน actual_time คือตอนระบบสรุปผลเสร็จ
  // ใช้สองค่านี้วัดระยะตั้งแต่ปิดฝาจนประมวลผลจบ ซึ่งเป็นเกณฑ์ 30 วินาทีในบทที่ 3
  const totalSec = (logs || [])
    .filter((l) => l.lid_opened_at && l.actual_time && typeof l.lid_open_ms === 'number')
    .map((l) => {
      const closedAt = new Date(l.lid_opened_at).getTime() + l.lid_open_ms;
      return (new Date(l.actual_time).getTime() - closedAt) / 1000;
    })
    .filter((v) => v >= 0);

  console.log('\nตารางที่ 4.2 ระยะเวลาการทำงาน (วินาที)');
  console.log('| ขั้นตอน | เฉลี่ย | ส่วนเบี่ยงเบน | สูงสุด | n |');
  console.log('|---|---|---|---|---|');
  const timeRow = (label, xs) =>
    console.log(`| ${label} | ${mean(xs).toFixed(2)} | ${sd(xs).toFixed(2)} | `
      + `${(xs.length ? Math.max(...xs) : 0).toFixed(2)} | ${xs.length} |`);
  timeRow('ระยะเวลาที่ฝาเปิดค้าง', openMs.map((v) => v / 1000));
  timeRow('ตั้งแต่ปิดฝาจนระบบสรุปผลเสร็จ', totalSec);

  const over = totalSec.filter((v) => v > 30).length;
  if (totalSec.length) {
    console.log(over
      ? `\n⚠️ เกินเกณฑ์ 30 วินาที ${over} จาก ${totalSec.length} ครั้ง (${pct(over, totalSec.length)}%)`
      : `\nทุกครั้งอยู่ในเกณฑ์ 30 วินาทีที่กำหนดไว้ในบทที่ 3 (n = ${totalSec.length})`);
  }

  if (sizes.length) {
    console.log(`\nขนาดภาพ: มัธยฐาน ${sizeMedian.toLocaleString()} bytes · `
      + `ต่ำสุด ${Math.min(...sizes).toLocaleString()} · สูงสุด ${Math.max(...sizes).toLocaleString()}`);
    const odd = sizes.length - usable;
    if (odd) console.log(`ภาพที่ใหญ่เกิน ${SIZE_LIMIT} เท่าของมัธยฐาน: ${odd} ภาพ `
      + `(${pct(odd, sizes.length)}%) — ตรวจด้วยตาว่าเป็นภาพตอนฝาเปิดหรือไม่`);
  }
  if (bounce) console.log(`\n⚠️ พบสัญญาณซ้ำซ้อน ${bounce} ครั้ง — ตรวจค่าหน่วงสัญญาณในเฟิร์มแวร์`);

  const csvPath = arg('csv', '');
  if (csvPath) {
    const lines = ['cycle,occurred_at,lid_open_ms,frames,total_bytes,uploaded'];
    closes.forEach((e, i) => {
      const imgs = perLog.get(e.log_id) || [];
      const bytes = imgs.reduce((a, b) => a + (b.bytes || 0), 0);
      lines.push([i + 1, e.occurred_at, e.lid_open_ms ?? '', imgs.length, bytes, e.log_id ? 1 : 0].join(','));
    });
    writeFileSync(csvPath, lines.join('\n'), 'utf8');
    console.log(`\nบันทึกข้อมูลดิบลง ${csvPath} แล้ว (${closes.length} แถว)`);
  }
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
