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
  box_serial: string;
  status: string | null;
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
  image_url: string | null;
  created_at?: string;
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
