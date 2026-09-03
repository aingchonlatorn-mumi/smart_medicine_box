// lib/time.ts — ตัวช่วยเรื่องเวลาโซนไทย (Asia/Bangkok) และการแสดงผลภาษาไทย
// ทุกอย่างที่เกี่ยวกับ "วันนี้ / มื้อนี้" ต้องผ่านไฟล์นี้ เพื่อไม่ให้เพี้ยนเวลา server อยู่ UTC

export const TZ = 'Asia/Bangkok';
/** ชื่อวันใน schedules.day_of_week (index 0 = อาทิตย์ ตรงกับ Date.getUTCDay) */
export const DOW_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DOW_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;
export const DOW_TH_FULL = [
  'อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์',
] as const;
export const MONTH_TH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;
export const MONTH_TH_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const;

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

export interface BangkokParts {
  /** "YYYY-MM-DD" ตามเวลาไทย */
  date: string;
  /** "HH:MM" ตามเวลาไทย */
  time: string;
  /** นาทีนับจากเที่ยงคืนตามเวลาไทย */
  minutes: number;
  /** 0 = อาทิตย์ */
  dow: number;
}

/** แตกวันเวลาไทยออกจาก Date (ค่า default = ตอนนี้) */
export function bangkokParts(at: Date = new Date()): BangkokParts {
  const p: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(at)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  const hour = p.hour === '24' ? '00' : p.hour;
  const date = `${p.year}-${p.month}-${p.day}`;
  return {
    date,
    time: `${hour}:${p.minute}`,
    minutes: Number(hour) * 60 + Number(p.minute),
    dow: dayOfWeek(date),
  };
}

/** "YYYY-MM-DD" ของวันนี้ตามเวลาไทย */
export function bangkokToday(at: Date = new Date()): string {
  return bangkokParts(at).date;
}

/** แปลง "YYYY-MM-DD" + "HH:MM" (เวลาไทย) → Date จริง (UTC ข้างใน) */
export function bangkokDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00+07:00`);
}

/** ตัดวินาทีออกจาก "HH:MM:SS" ที่มาจากคอลัมน์ TIME */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** นาทีนับจากเที่ยงคืน ของ "HH:MM" */
export function minutesOfDay(time: string): number {
  const [h, m] = hhmm(time).split(':').map(Number);
  return h * 60 + m;
}

/** วันในสัปดาห์ของ "YYYY-MM-DD" (0 = อาทิตย์) โดยไม่พึ่ง timezone ของเครื่อง */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** จำนวนวันเต็มระหว่างสองวัน (b - a) */
export function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** บวก/ลบวันจาก "YYYY-MM-DD" */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "HH:MM" ของ timestamp ตามเวลาไทย */
export function timeOf(ts: string | Date): string {
  return bangkokParts(typeof ts === 'string' ? new Date(ts) : ts).time;
}

/** "YYYY-MM-DD" ของ timestamp ตามเวลาไทย */
export function dateOf(ts: string | Date): string {
  return bangkokParts(typeof ts === 'string' ? new Date(ts) : ts).date;
}

/** 2026-08-24 → "24 ส.ค. 2569" (พ.ศ.) */
export function thaiDate(date: string | null | undefined, style: 'short' | 'full' = 'short'): string {
  if (!date) return '-';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const months = style === 'full' ? MONTH_TH_FULL : MONTH_TH_SHORT;
  return `${d} ${months[m - 1]} ${y + 543}`;
}

/** 2026-08-24 → "24 ส.ค." */
export function thaiDayMonth(date: string): string {
  const [, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTH_TH_SHORT[m - 1]}`;
}

/** ป้ายหัวข้อของวัน: วันนี้ / เมื่อวาน / 22 สิงหาคม */
export function dayLabel(date: string, today = bangkokToday()): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return `วันนี้ · ${thaiDayMonthFull(date)}`;
  if (diff === 1) return `เมื่อวาน · ${thaiDayMonthFull(date)}`;
  return `${DOW_TH_FULL[dayOfWeek(date)]} · ${thaiDayMonthFull(date)}`;
}

function thaiDayMonthFull(date: string): string {
  const [, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTH_TH_FULL[m - 1]}`;
}

/** 95 → "1 ชม. 35 นาที" */
export function humanMinutes(total: number): string {
  const mins = Math.max(0, Math.round(total));
  if (mins < 60) return `${mins} นาที`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชั่วโมง`;
}

/** อายุจากวันเกิด */
export function ageFrom(birthDate: string | null | undefined, today = bangkokToday()): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 ? age : null;
}

/** 0812345678 → 081-234-5678 */
export function formatPhone(phone: string | null | undefined): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length !== 10) return phone || '-';
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
