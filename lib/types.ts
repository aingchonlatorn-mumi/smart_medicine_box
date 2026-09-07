// lib/types.ts — โครงสร้างข้อมูลตามสคีมาจริงใน Supabase

export type ScheduleType = 'daily' | 'weekly' | 'interval';
export type MealRelation = 'before' | 'after' | 'none';
export type LogStatus = 'pending' | 'taken' | 'missed';

/** สถานะที่ใช้แสดงผล — 'late' คำนวณตอนแสดงผล ไม่ได้เก็บใน DB */
export type DoseState = 'pending' | 'taken' | 'late' | 'missed';

export interface User {
  user_id: string;
  name: string;
  phone: string | null;
  birth_date: string | null;
  line_user_id: string;
  created_at?: string;
}

export interface Box {
  box_id: string;
  owner_user_id: string | null;
  /** รหัสที่พิมพ์ติดข้างกล่อง ผู้ป่วยกรอกตอนลงทะเบียน เช่น B-001 */
  box_serial: string;
  status: string | null;
  /** MAC ของบอร์ด ESP32 ที่อยู่ในกล่องใบนี้ (ตัวพิมพ์ใหญ่ 12 ตัว) */
  device_mac: string | null;
  /** sha256 ของ device key — ไม่เก็บคีย์จริง */
  device_key_hash: string | null;
  device_bound_at: string | null;
  last_seen_at: string | null;
  firmware_version: string | null;
  created_at?: string;
}

export interface Medicine {
  medicine_id: string;
  user_id: string;
  name: string;
  total_pills: number;
  expire_date: string | null;
  created_at?: string;
}

export interface Schedule {
  schedule_id: string;
  box_id: string;
  medicine_id: string;
  /** "HH:MM:SS" ตามเวลาไทย */
  time: string;
  dose_amount: number;
  schedule_type: ScheduleType;
  interval_days: number | null;
  day_of_week: string[] | null;
  start_date: string | null;
  active: boolean | null;
  meal_relation: MealRelation | null;
  created_at?: string;
}

export interface DoseLog {
  log_id: string;
  user_id: string;
  box_id: string | null;
  schedule_id: string | null;
  medicine_id: string | null;
  scheduled_time: string;
  actual_time: string | null;
  status: LogStatus;
  /** ภาพตัวแทนที่เอาไปโชว์ใน LINE และหน้า Dashboard */
  image_url: string | null;
  /* --- หลักฐานจากฮาร์ดแวร์ เก็บแยกจากผลสรุป (status) --- */
  lid_opened_at: string | null;
  lid_open_seconds: number | null;
  /** null = ยังไม่ได้ประมวลผลภาพ */
  hand_detected: boolean | null;
  confirmed_by: ConfirmedBy | null;
  created_at?: string;
}

/** ใครเป็นคนยืนยันว่าทานยาแล้ว — ใช้วัดว่าฮาร์ดแวร์ทำงานได้ดีแค่ไหน */
export type ConfirmedBy = 'device' | 'patient' | 'caregiver' | 'system';

/** ภาพหนึ่งเฟรมในชุดที่ถ่ายตอนเปิดฝา */
export interface LogImage {
  image_id: string;
  log_id: string;
  box_id: string | null;
  image_url: string;
  storage_path: string | null;
  sequence: number;
  captured_at: string;
  hand_detected: boolean | null;
  detection: Record<string, unknown> | null;
}

/** เหตุการณ์ที่อุปกรณ์รายงานเข้ามา — ประวัติการเข้าถึงกล่องยา */
export interface DeviceEvent {
  event_id: string;
  box_id: string;
  event_type: 'lid_open' | 'lid_close' | 'boot' | 'heartbeat' | 'error';
  occurred_at: string;
  lid_open_seconds: number | null;
  log_id: string | null;
  detail: Record<string, unknown> | null;
}

/** log + ข้อมูลที่ join มาแล้ว ใช้ในหน้า UI */
export interface DoseLogView extends DoseLog {
  medicine_name: string;
  dose_amount: number;
  meal_relation: MealRelation;
  state: DoseState;
  /** นาทีที่ทานช้ากว่ากำหนด (null ถ้ายังไม่ทาน) */
  delay_minutes: number | null;
}

export interface MeResponse {
  user: User;
  box: Box | null;
  medicine: Medicine | null;
  schedules: Schedule[];
}
