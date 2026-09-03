// lib/flex/index.ts — ตัวสร้าง LINE Flex Message ทั้ง 5 แบบตามไฟล์ดีไซน์ (2b)
// พาเลตต์เดียวกับหน้าเว็บ: indigo #4f46e5 / เขียว #10b981 / เหลือง #f59e0b / แดง #fb7185

import type { Medicine, Schedule } from '../types';
import { MEAL_LABEL, summarizeSchedules } from '../schedule';
import { DOW_TH, hhmm, thaiDayMonth } from '../time';

const INDIGO = '#4F46E5';
const INK = '#0F172A';
const MUTED = '#64748B';
const FAINT = '#94A3B8';
const GREEN = '#10B981';
const AMBER = '#F59E0B';
const ROSE = '#FB7185';
const LINE_GREEN = '#06C755';

/** URL ของแอป — ใช้ทำปุ่มใน Flex (LINE รับเฉพาะ https) */
export function appUrl(path = '/'): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '');
  if (!base.startsWith('https://')) return '';
  return `${base.replace(/\/$/, '')}${path}`;
}

/** ปุ่มลิงก์ — คืน null ถ้ายังไม่ได้ตั้ง NEXT_PUBLIC_APP_URL (LINE จะตีกลับ 400 ถ้า uri ไม่ใช่ https) */
function linkButton(label: string, path: string, style: 'primary' | 'secondary' = 'primary') {
  const uri = appUrl(path);
  if (!uri) return null;
  return {
    type: 'button',
    style,
    height: 'sm',
    color: style === 'primary' ? INDIGO : '#EEF2FF',
    action: { type: 'uri', label, uri },
  };
}

function compact<T>(items: (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}

function text(value: string, opts: Record<string, unknown> = {}) {
  return { type: 'text', text: value, wrap: true, ...opts };
}

/* ------------------------------------------------------------------ */
/* 1 · เชื่อมต่อสำเร็จ / welcome                                        */
/* ------------------------------------------------------------------ */
export function flexWelcome(params: { name: string; boxSerial: string }) {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: INDIGO,
      paddingAll: '24px',
      spacing: 'sm',
      contents: [
        text('✓', { color: '#FFFFFF', size: 'xxl', weight: 'bold', align: 'center' }),
        text('เชื่อมต่อกล่องยาสำเร็จ', {
          color: '#FFFFFF', size: 'xl', weight: 'bold', align: 'center',
        }),
        text(`${params.boxSerial} · คุณ ${params.name}`, {
          color: '#C7D2FE', size: 'sm', align: 'center',
        }),
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: compact([
        text(
          'ยินดีต้อนรับสู่ Smart PillBox ตั้งแต่นี้กล่องยาจะเตือนคุณทุกมื้อผ่าน LINE และบันทึกให้อัตโนมัติเมื่อคุณเปิดฝา',
          { size: 'sm', color: MUTED },
        ),
        linkButton('ตั้งเวลาทานยา', '/schedule'),
        linkButton('เปิดหน้าหลัก', '/dashboard', 'secondary'),
      ]),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 2 · เงื่อนไขการใช้งาน                                                */
/* ------------------------------------------------------------------ */
export function flexTerms() {
  const rules = [
    'ระบบนี้ช่วยเตือนความจำ ไม่ใช่คำแนะนำทางการแพทย์ กรุณาทานยาตามที่แพทย์สั่ง',
    'กล่องยาจะถ่ายภาพเมื่อเปิดฝา เพื่อยืนยันการทานยาเท่านั้น',
    'ข้อมูลถูกเก็บในบัญชีของคุณคนเดียว ไม่แชร์ให้ผู้อื่น',
  ];

  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: compact([
        text('เงื่อนไขการใช้งาน', { weight: 'bold', size: 'lg', color: INK }),
        { type: 'separator', color: '#F1F5F9' },
        ...rules.map((rule, index) => ({
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          contents: [
            text(String(index + 1), { flex: 0, size: 'sm', weight: 'bold', color: INDIGO }),
            text(rule, { size: 'sm', color: MUTED, flex: 1 }),
          ],
        })),
        linkButton('ยอมรับและเริ่มใช้งาน', '/onboarding'),
      ]),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 3 · สรุปตารางเวลา                                                   */
/* ------------------------------------------------------------------ */
export function flexScheduleSummary(params: { medicine: Medicine; schedules: Schedule[] }) {
  const { medicine, schedules } = params;

  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: compact([
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            text(medicine.name, { weight: 'bold', size: 'lg', color: INK }),
            text(`${summarizeSchedules(schedules)} · เหลือ ${medicine.total_pills} เม็ด`, {
              size: 'sm', color: MUTED,
            }),
          ],
        },
        { type: 'separator', color: '#F1F5F9' },
        ...schedules.map((s) => ({
          type: 'box',
          layout: 'horizontal',
          contents: [
            text(`${hhmm(s.time)} น.`, { size: 'md', weight: 'bold', color: INK, flex: 3 }),
            text(MEAL_LABEL[s.meal_relation || 'none'], { size: 'sm', color: FAINT, flex: 3 }),
            text(`${s.dose_amount} เม็ด`, { size: 'sm', color: MUTED, align: 'end', flex: 2 }),
          ],
        })),
        linkButton('แก้ไขตารางยา', '/schedule'),
      ]),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 4 · แจ้งเตือนมื้อยา (Daily Alert)                                    */
/* ------------------------------------------------------------------ */
export function flexDoseAlert(params: {
  time: string;
  medicineName: string;
  doseAmount: number;
  pillsLeft: number;
  mealRelation?: string;
  imageUrl?: string | null;
}) {
  const meal = params.mealRelation && params.mealRelation !== 'none'
    ? ` · ${MEAL_LABEL[params.mealRelation as 'before' | 'after']}`
    : '';

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: compact([
        text(`ถึงเวลาทานยา ${params.time} น.`, {
          size: 'sm', weight: 'bold', color: INDIGO,
        }),
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            text(params.medicineName, { weight: 'bold', size: 'xl', color: INK }),
            text(
              `ทาน ${params.doseAmount} เม็ด${meal} · เหลือในกล่อง ${params.pillsLeft} เม็ด`,
              { size: 'sm', color: MUTED },
            ),
          ],
        },
        text('เปิดฝากล่องแล้วระบบจะบันทึกให้เอง หรือกดปุ่มด้านล่างเพื่อยืนยัน', {
          size: 'xs', color: FAINT,
        }),
        linkButton('เปิดแอปบันทึกการทานยา', '/dashboard'),
      ]),
    },
  };

  if (params.imageUrl?.startsWith('https://')) {
    bubble.hero = {
      type: 'image',
      url: params.imageUrl,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    };
  }

  return bubble;
}

/* ------------------------------------------------------------------ */
/* 4b · เตือนซ้ำเมื่อเลยเวลา (missed)                                   */
/* ------------------------------------------------------------------ */
export function flexMissedAlert(params: {
  time: string;
  medicineName: string;
  minutesLate: number;
}) {
  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: compact([
        text(`เลยเวลามื้อ ${params.time} น. มา ${params.minutesLate} นาที`, {
          size: 'sm', weight: 'bold', color: ROSE,
        }),
        text(params.medicineName, { weight: 'bold', size: 'xl', color: INK }),
        text('ระบบยังไม่พบการเปิดฝากล่อง จึงบันทึกมื้อนี้เป็น "ลืมทาน" ถ้าเพิ่งทานไป กดยืนยันในแอปได้เลย', {
          size: 'sm', color: MUTED,
        }),
        linkButton('ยืนยันว่าทานแล้ว', '/dashboard'),
      ]),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 5 · สรุปรายสัปดาห์ (อาทิตย์ 20:00)                                   */
/* ------------------------------------------------------------------ */
export function flexWeeklyReport(params: {
  adherence: number;
  taken: number;
  total: number;
  rangeStart: string;
  rangeEnd: string;
  /** อัตราต่อวัน 7 ค่า เรียงจันทร์→อาทิตย์ (0–1) */
  daily: number[];
  deltaPercent?: number;
}) {
  const barColor = (rate: number) => (rate >= 0.99 ? GREEN : rate >= 0.5 ? AMBER : ROSE);
  const dowOrder = [1, 2, 3, 4, 5, 6, 0]; // จันทร์ → อาทิตย์

  const delta = params.deltaPercent ?? 0;
  const deltaText = delta === 0
    ? 'ทำได้เท่ากับสัปดาห์ก่อน รักษาระดับนี้ไว้ได้เลย'
    : delta > 0
      ? `สัปดาห์นี้ดีขึ้นจากสัปดาห์ก่อน ${delta}%`
      : `สัปดาห์นี้ลดลงจากสัปดาห์ก่อน ${Math.abs(delta)}%`;

  return {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '20px',
      contents: compact([
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            text('สรุปสัปดาห์นี้', { weight: 'bold', size: 'lg', color: INK, flex: 3 }),
            text(`${thaiDayMonth(params.rangeStart)}–${thaiDayMonth(params.rangeEnd)}`, {
              size: 'xs', color: FAINT, align: 'end', gravity: 'center', flex: 2,
            }),
          ],
        },
        {
          type: 'box',
          layout: 'baseline',
          spacing: 'md',
          contents: [
            text(`${params.adherence}%`, { size: '3xl', weight: 'bold', color: INDIGO, flex: 0 }),
            text(`ทานตรงเวลา ${params.taken} จาก ${params.total} มื้อ`, {
              size: 'sm', color: MUTED,
            }),
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'xs',
          contents: dowOrder.map((dow, index) => {
            const rate = params.daily[index] ?? 0;
            return {
              type: 'box',
              layout: 'vertical',
              spacing: 'xs',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  height: '8px',
                  backgroundColor: barColor(rate),
                  cornerRadius: '4px',
                  contents: [text(' ', { size: 'xxs', color: barColor(rate) })],
                },
                text(DOW_TH[dow], { size: 'xxs', color: FAINT, align: 'center' }),
              ],
            };
          }),
        },
        text(deltaText, { size: 'xs', color: MUTED }),
        linkButton('ดูรายงานฉบับเต็ม', '/reports'),
      ]),
    },
    styles: { body: { backgroundColor: '#FFFFFF' } },
  };
}

export const LINE_BRAND_GREEN = LINE_GREEN;
