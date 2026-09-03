// lib/schedule.ts — ตรรกะกลางของ "มื้อยา"
// ใช้ร่วมกันทั้งฝั่ง cron (ตัดสินใจส่งแจ้งเตือน) และฝั่ง UI (แสดงไทม์ไลน์)
// แก้ที่เดียว ทั้งสองฝั่งตรงกันเสมอ

import type { DoseLog, DoseState, MealRelation, Schedule } from './types';
import {
  DOW_KEYS, bangkokDateTime, bangkokParts, bangkokToday,
  dateOf, daysBetween, hhmm, minutesOfDay,
} from './time';

/** ทานช้ากว่ากำหนดเกินกี่นาทีถึงนับว่า "ทานเลท" */
export const LATE_AFTER_MINUTES = 30;
/** เลยเวลากี่นาทีแล้วยังไม่มีสัญญาณ ถึงนับว่า "ลืมทาน" */
export const MISSED_AFTER_MINUTES = Number(process.env.MISSED_AFTER_MINUTES || 30);

/** ตารางนี้ต้องทานในวันที่ระบุหรือไม่ (daily / weekly / interval) */
export function occursOn(schedule: Schedule, date: string): boolean {
  if (schedule.active === false) return false;

  const start = schedule.start_date?.slice(0, 10);
  if (start && daysBetween(start, date) < 0) return false;

  switch (schedule.schedule_type) {
    case 'weekly': {
      const days = schedule.day_of_week;
      if (!days?.length) return false;
      const key = DOW_KEYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
      // รองรับทั้ง "Mon" และ "mon"
      return days.some((d) => d.slice(0, 3).toLowerCase() === key.toLowerCase());
    }
    case 'interval': {
      const step = schedule.interval_days || 1;
      if (step <= 0 || !start) return false;
      return daysBetween(start, date) % step === 0;
    }
    case 'daily':
    default:
      return true;
  }
}

/** มื้อทั้งหมดของวันนั้น เรียงตามเวลา */
export function schedulesForDate(schedules: Schedule[], date: string): Schedule[] {
  return schedules
    .filter((s) => occursOn(s, date))
    .sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));
}

/** เวลาจริงของมื้อ (Date) จากตาราง + วันที่ */
export function doseTime(schedule: Schedule, date: string): Date {
  return bangkokDateTime(date, hhmm(schedule.time));
}

/**
 * มื้อถัดไปที่ยังไม่ถึงเวลา — มองไปข้างหน้าไม่เกิน 14 วัน
 * (weekly/interval อาจข้ามหลายวัน)
 */
export function nextDose(
  schedules: Schedule[],
  at: Date = new Date(),
): { schedule: Schedule; date: string; at: Date; minutesUntil: number } | null {
  const now = bangkokParts(at);
  for (let offset = 0; offset <= 14; offset++) {
    const date = offset === 0 ? now.date : addDaysLocal(now.date, offset);
    for (const s of schedulesForDate(schedules, date)) {
      const mins = minutesOfDay(s.time);
      if (offset === 0 && mins <= now.minutes) continue;
      const when = doseTime(s, date);
      return {
        schedule: s,
        date,
        at: when,
        minutesUntil: Math.round((when.getTime() - at.getTime()) / 60_000),
      };
    }
  }
  return null;
}

function addDaysLocal(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** นาทีที่ทานช้ากว่ากำหนด (ค่าลบ = ทานก่อนเวลา) */
export function delayMinutes(log: Pick<DoseLog, 'scheduled_time' | 'actual_time'>): number | null {
  if (!log.actual_time) return null;
  const diff = new Date(log.actual_time).getTime() - new Date(log.scheduled_time).getTime();
  return Math.round(diff / 60_000);
}

/**
 * สถานะสำหรับแสดงผล — DB เก็บแค่ pending/taken/missed
 * "ทานเลท" คำนวณจาก actual_time − scheduled_time > 30 นาที ตามที่ตกลงในไฟล์ดีไซน์
 */
export function doseState(
  log: Pick<DoseLog, 'scheduled_time' | 'actual_time' | 'status'>,
  at: Date = new Date(),
): DoseState {
  if (log.status === 'missed') return 'missed';
  if (log.status === 'taken') {
    const delay = delayMinutes(log) ?? 0;
    return delay > LATE_AFTER_MINUTES ? 'late' : 'taken';
  }
  // ยัง pending อยู่ แต่เลยเวลามาไกลแล้ว → แสดงเป็นลืมทานไปก่อน
  // (cron check-missed จะตามมาปรับสถานะจริงใน DB ทีหลัง)
  const overdue = (at.getTime() - new Date(log.scheduled_time).getTime()) / 60_000;
  return overdue > MISSED_AFTER_MINUTES ? 'missed' : 'pending';
}

export const STATE_LABEL: Record<DoseState, string> = {
  taken: 'ตรงเวลา',
  late: 'ทานเลท',
  missed: 'ลืมทาน',
  pending: 'รออยู่',
};

export const MEAL_LABEL: Record<MealRelation, string> = {
  before: 'ก่อนอาหาร',
  after: 'หลังอาหาร',
  none: 'ไม่ระบุ',
};

export const SCHEDULE_TYPE_LABEL: Record<Schedule['schedule_type'], string> = {
  daily: 'ทุกวัน',
  weekly: 'รายสัปดาห์',
  interval: 'ทุก X วัน',
};

/** สรุปตารางเป็นข้อความ เช่น "ทุกวัน · 3 มื้อ" */
export function summarizeSchedules(schedules: Schedule[]): string {
  if (!schedules.length) return 'ยังไม่ได้ตั้งเวลา';
  const type = schedules[0].schedule_type;
  if (type === 'weekly') {
    const days = schedules[0].day_of_week || [];
    return `สัปดาห์ละ ${days.length} วัน · ${schedules.length} มื้อ`;
  }
  if (type === 'interval') {
    return `ทุก ${schedules[0].interval_days || 1} วัน · ${schedules.length} มื้อ`;
  }
  return `ทุกวัน · ${schedules.length} มื้อ`;
}

/** จำนวนเม็ดที่ใช้ต่อวัน (ประมาณจากตารางของวันนี้) */
export function pillsPerDay(schedules: Schedule[], date = bangkokToday()): number {
  return schedulesForDate(schedules, date).reduce((sum, s) => sum + (s.dose_amount || 1), 0);
}

/** ยาที่เหลือจะพอใช้ถึงวันไหน */
export function pillsRunOutInDays(totalPills: number, schedules: Schedule[]): number | null {
  const perDay = pillsPerDay(schedules);
  if (perDay <= 0) return null;
  return Math.floor(totalPills / perDay);
}

/** จัดกลุ่ม log ตามวัน (เวลาไทย) เรียงจากใหม่ไปเก่า */
export function groupLogsByDate<T extends { scheduled_time: string }>(
  logs: T[],
): Array<{ date: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const log of logs) {
    const date = dateOf(log.scheduled_time);
    const bucket = map.get(date);
    if (bucket) bucket.push(log);
    else map.set(date, [log]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time)),
    }));
}

/** มื้อยาของวันหนึ่ง หลังรวมตารางเวลาเข้ากับ log ที่บันทึกไว้จริง */
export interface DoseSlot {
  key: string;
  schedule_id: string | null;
  log_id: string | null;
  date: string;
  /** "HH:MM" */
  time: string;
  scheduled_time: string;
  actual_time: string | null;
  dose_amount: number;
  meal_relation: MealRelation;
  medicine_name: string;
  state: DoseState;
  delay_minutes: number | null;
  image_url: string | null;
}

/**
 * รวม "ตารางที่ตั้งไว้" กับ "log ที่เกิดขึ้นจริง" ของวันนั้น
 * มื้อที่ cron ยังไม่ได้สร้าง log จะโผล่เป็น pending — หน้าจอจึงเห็นครบทุกมื้อเสมอ
 */
export function slotsForDate(params: {
  schedules: Schedule[];
  logs: DoseLog[];
  date: string;
  medicineName?: string;
  at?: Date;
}): DoseSlot[] {
  const { schedules, logs, date, medicineName = 'ยา', at = new Date() } = params;

  const logsOfDate = logs.filter((log) => dateOf(log.scheduled_time) === date);
  const used = new Set<string>();

  const fromSchedules: DoseSlot[] = schedulesForDate(schedules, date).map((schedule) => {
    const time = hhmm(schedule.time);
    const scheduledAt = doseTime(schedule, date);
    const log =
      logsOfDate.find((l) => l.schedule_id === schedule.schedule_id && !used.has(l.log_id)) ||
      logsOfDate.find((l) => timeMatches(l.scheduled_time, scheduledAt) && !used.has(l.log_id));
    if (log) used.add(log.log_id);

    return {
      key: `${date}-${time}`,
      schedule_id: schedule.schedule_id,
      log_id: log?.log_id ?? null,
      date,
      time,
      scheduled_time: log?.scheduled_time ?? scheduledAt.toISOString(),
      actual_time: log?.actual_time ?? null,
      dose_amount: schedule.dose_amount || 1,
      meal_relation: schedule.meal_relation || 'none',
      medicine_name: medicineName,
      state: log
        ? doseState(log, at)
        : scheduledAt.getTime() > at.getTime()
          ? 'pending'
          : doseState(
              { scheduled_time: scheduledAt.toISOString(), actual_time: null, status: 'pending' },
              at,
            ),
      delay_minutes: log ? delayMinutes(log) : null,
      image_url: log?.image_url ?? null,
    };
  });

  // log ที่ไม่ตรงกับตารางปัจจุบัน (เช่น ตารางถูกแก้ทีหลัง) ยังต้องแสดงในประวัติ
  const orphans: DoseSlot[] = logsOfDate
    .filter((log) => !used.has(log.log_id))
    .map((log) => ({
      key: `${date}-${log.log_id}`,
      schedule_id: log.schedule_id,
      log_id: log.log_id,
      date,
      time: timeOfIso(log.scheduled_time),
      scheduled_time: log.scheduled_time,
      actual_time: log.actual_time,
      dose_amount: 1,
      meal_relation: 'none' as MealRelation,
      medicine_name: medicineName,
      state: doseState(log, at),
      delay_minutes: delayMinutes(log),
      image_url: log.image_url,
    }));

  return [...fromSchedules, ...orphans].sort((a, b) =>
    a.scheduled_time.localeCompare(b.scheduled_time),
  );
}

/** log ถือว่าเป็นมื้อเดียวกับตาราง ถ้าเวลาห่างกันไม่เกิน 5 นาที */
function timeMatches(iso: string, target: Date): boolean {
  return Math.abs(new Date(iso).getTime() - target.getTime()) <= 5 * 60_000;
}

function timeOfIso(iso: string): string {
  return bangkokParts(new Date(iso)).time;
}

/** สรุปผลของช่วงเวลาหนึ่ง ใช้ทั้งหน้า Reports และ Flex สรุปรายสัปดาห์ */
export interface AdherenceSummary {
  total: number;
  onTime: number;
  late: number;
  missed: number;
  pending: number;
  /** เปอร์เซ็นต์มื้อที่ทาน (ตรงเวลา + เลท) จากมื้อทั้งหมด */
  adherence: number;
}

export function summarize(slots: DoseSlot[]): AdherenceSummary {
  const onTime = slots.filter((s) => s.state === 'taken').length;
  const late = slots.filter((s) => s.state === 'late').length;
  const missed = slots.filter((s) => s.state === 'missed').length;
  const pending = slots.filter((s) => s.state === 'pending').length;
  const total = slots.length;
  return {
    total, onTime, late, missed, pending,
    adherence: total ? Math.round(((onTime + late) / total) * 100) : 0,
  };
}
