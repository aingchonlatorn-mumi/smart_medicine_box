import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { loadContext, loadSlots } from '@/lib/api';
import {
  appUrl, flexHelp, flexNotEnoughData, flexReportChoice, flexScheduleSummary,
  flexTerms, flexTodaySchedule, flexWelcome, type TodayDoseLine,
} from '@/lib/flex';
import { replyLineMessage } from '@/lib/line';
import { doseTime, periodLabel, schedulesForDate, slotsForDate, summarize } from '@/lib/schedule';
import { addDays, bangkokToday, hhmm, thaiDate, timeOf } from '@/lib/time';
import { signReportToken } from '@/lib/token';
import type { DoseLog, User } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** ต้องมีข้อมูลกี่วันถึงจะสรุปรายงานได้ (ตรงกับ /api/reports/pdf) */
const MIN_REPORT_DAYS = 3;

/** ตรวจลายเซ็นของ LINE (ข้ามได้ตอน dev ถ้ายังไม่ได้ตั้ง LINE_CHANNEL_SECRET) */
function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

const replyText = (replyToken: string, text: string) =>
  replyLineMessage(replyToken, [{ type: 'text', text }]);

const replyFlex = (replyToken: string, altText: string, contents: unknown) =>
  replyLineMessage(replyToken, [{ type: 'flex', altText, contents }]);

/* ------------------------------------------------------------------ */
/* ตารางมื้อยาวันนี้ — ปุ่ม "ตารางทานยา"                                 */
/* ------------------------------------------------------------------ */
async function replyTodaySchedule(replyToken: string, user: User) {
  const context = await loadContext(user.user_id);
  if (!context?.medicine || !context.schedules.length) {
    await replyText(replyToken, 'ยังไม่ได้ตั้งตารางทานยา กดปุ่ม "ตารางทานยา" ในเมนูเพื่อเริ่มตั้งเวลาได้เลย');
    return;
  }

  const today = bangkokToday();
  const db = supabaseAdmin();
  const { data } = await db
    .from('logs')
    .select('*')
    .eq('user_id', user.user_id)
    .gte('scheduled_time', `${today}T00:00:00+07:00`)
    .lt('scheduled_time', `${addDays(today, 1)}T00:00:00+07:00`);

  const slots = slotsForDate({
    schedules: context.schedules,
    logs: (data as DoseLog[]) || [],
    date: today,
    medicineName: context.medicine.name,
  });

  const doses: TodayDoseLine[] = slots.map((slot) => ({
    schedule_id: slot.schedule_id,
    time: slot.time,
    period: periodLabel(slot.time),
    dose_amount: slot.dose_amount,
    meal_relation: slot.meal_relation,
    state: slot.state,
    actual_time: slot.actual_time ? timeOf(slot.actual_time) : null,
  }));

  // มื้อที่ยังไม่ได้ทานและใกล้เวลาปัจจุบันที่สุด → ทำเป็นปุ่มยืนยันด่วน
  const now = Date.now();
  const confirmable =
    doses
      .filter((d) => d.state === 'pending' || d.state === 'missed')
      .sort((a, b) => {
        const diff = (t: string) =>
          Math.abs(new Date(`${today}T${t}:00+07:00`).getTime() - now);
        return diff(a.time) - diff(b.time);
      })[0] ?? null;

  await replyFlex(replyToken, 'ตารางทานยาวันนี้', flexTodaySchedule({
    medicineName: context.medicine.name,
    dateLabel: thaiDate(today),
    doses,
    confirmable,
  }));
}

/* ------------------------------------------------------------------ */
/* ยืนยันการทานยาจากในแชท — ปุ่ม "ทานตอนนี้"                            */
/* ------------------------------------------------------------------ */
async function confirmDose(replyToken: string, user: User, scheduleId: string | null) {
  const context = await loadContext(user.user_id);
  if (!context) return;

  const today = bangkokToday();
  const todaySchedules = schedulesForDate(context.schedules, today);
  const now = new Date();

  const target =
    todaySchedules.find((s) => s.schedule_id === scheduleId) ??
    todaySchedules
      .slice()
      .sort(
        (a, b) =>
          Math.abs(doseTime(a, today).getTime() - now.getTime()) -
          Math.abs(doseTime(b, today).getTime() - now.getTime()),
      )[0];

  if (!target) {
    await replyText(replyToken, 'วันนี้ไม่มีมื้อยาตามตาราง');
    return;
  }

  const db = supabaseAdmin();
  const scheduledAt = doseTime(target, today).toISOString();

  const { data: existing } = await db
    .from('logs').select('log_id, status')
    .eq('schedule_id', target.schedule_id)
    .eq('scheduled_time', scheduledAt)
    .maybeSingle();

  if (existing?.status === 'taken') {
    await replyText(replyToken, `มื้อ ${hhmm(target.time)} น. บันทึกไว้แล้วว่าทานเรียบร้อย`);
    return;
  }

  if (existing) {
    await db.from('logs')
      .update({ status: 'taken', actual_time: now.toISOString() })
      .eq('log_id', existing.log_id);
  } else {
    await db.from('logs').insert({
      user_id: user.user_id,
      box_id: context.box?.box_id ?? null,
      schedule_id: target.schedule_id,
      medicine_id: target.medicine_id,
      scheduled_time: scheduledAt,
      actual_time: now.toISOString(),
      status: 'taken',
    });
  }

  // หักจำนวนเม็ดในกล่องเฉพาะครั้งแรกที่บันทึก
  if (context.medicine) {
    await db.from('medicines')
      .update({
        total_pills: Math.max(0, context.medicine.total_pills - (target.dose_amount || 1)),
      })
      .eq('medicine_id', context.medicine.medicine_id);
  }

  const left = context.medicine
    ? Math.max(0, context.medicine.total_pills - (target.dose_amount || 1))
    : null;

  await replyText(
    replyToken,
    `✅ บันทึกแล้ว — มื้อ ${hhmm(target.time)} น. เวลา ${timeOf(now)} น.` +
      (left !== null ? `\nเหลือยาในกล่อง ${left} เม็ด` : ''),
  );
}

/* ------------------------------------------------------------------ */
/* รายงาน PDF — ปุ่ม "รายงาน"                                          */
/* ------------------------------------------------------------------ */
async function replyReport(replyToken: string, user: User) {
  const context = await loadContext(user.user_id);
  if (!context) return;

  const today = bangkokToday();
  const slots = await loadSlots(context, addDays(today, -29), today);
  const daysWithData = new Set(
    slots.filter((s) => s.state !== 'pending').map((s) => s.date),
  ).size;

  if (daysWithData < MIN_REPORT_DAYS) {
    await replyFlex(replyToken, 'ข้อมูลยังไม่พอสรุปรายงาน', flexNotEnoughData(daysWithData));
    return;
  }

  const base = appUrl('/api/reports/pdf');
  if (!base) {
    await replyText(replyToken, 'ยังเปิดรายงานจาก LINE ไม่ได้ เพราะยังไม่ได้ตั้งค่า NEXT_PUBLIC_APP_URL');
    return;
  }

  const token = signReportToken(user.user_id);
  const week = summarize(slots.filter((s) => s.date >= addDays(today, -6)));

  await replyFlex(replyToken, 'รายงานการทานยา', flexReportChoice({
    adherence: week.adherence,
    pdfUrl: (days) => `${base}?days=${days}&token=${encodeURIComponent(token)}&print=1`,
  }));
}

/* ------------------------------------------------------------------ */
/* ตัวรับ event                                                        */
/* ------------------------------------------------------------------ */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(raw || '{}');
  const db = supabaseAdmin();

  for (const event of payload.events || []) {
    const lineUserId: string | undefined = event.source?.userId;
    const replyToken: string | undefined = event.replyToken;
    if (!lineUserId || !replyToken) continue;

    const { data } = await db
      .from('users').select('*').eq('line_user_id', lineUserId).maybeSingle();
    const user = data as User | null;

    /* ----- เพิ่มเพื่อนครั้งแรก ----- */
    if (event.type === 'follow') {
      if (user) {
        const { data: box } = await db
          .from('boxes').select('box_serial').eq('owner_user_id', user.user_id).maybeSingle();
        await replyFlex(replyToken, 'ยินดีต้อนรับสู่ Smart PillBox',
          flexWelcome({ name: user.name, boxSerial: box?.box_serial || '-' }));
      } else {
        await replyFlex(replyToken, 'เงื่อนไขการใช้งาน', flexTerms());
      }
      continue;
    }

    /* ----- ปุ่มใน Rich Menu ที่ส่ง postback ----- */
    if (event.type === 'postback') {
      const action = new URLSearchParams(event.postback?.data || '').get('action');

      if (!user) {
        await replyText(replyToken,
          'ยังไม่พบบัญชีของคุณในระบบ กดปุ่ม "ลงทะเบียน" ในเมนูเพื่อผูกกล่องยาก่อนนะครับ');
        continue;
      }

      if (action === 'get_schedule') {
        await replyTodaySchedule(replyToken, user);
      } else if (action === 'confirm_dose') {
        const scheduleId = new URLSearchParams(event.postback.data).get('schedule_id');
        await confirmDose(replyToken, user, scheduleId || null);
      } else if (action === 'get_report_pdf') {
        await replyReport(replyToken, user);
      } else if (action === 'contact') {
        await replyFlex(replyToken, 'วิธีใช้งาน Smart PillBox', flexHelp());
      }
      continue;
    }

    /* ----- พิมพ์ข้อความในแชท ----- */
    if (event.type === 'message' && event.message?.type === 'text' && user) {
      const text: string = event.message.text.trim();

      if (text.includes('ตาราง')) {
        await replyTodaySchedule(replyToken, user);
        continue;
      }
      if (text.includes('รายงาน')) {
        await replyReport(replyToken, user);
        continue;
      }
      if (text.includes('ยาที่ต้องทาน') || text.includes('ข้อมูลยา')) {
        const context = await loadContext(user.user_id);
        if (context?.medicine) {
          await replyFlex(replyToken, 'ยาและตารางของคุณ',
            flexScheduleSummary({ medicine: context.medicine, schedules: context.schedules }));
        }
        continue;
      }
      if (text.includes('เงื่อนไข')) {
        await replyFlex(replyToken, 'เงื่อนไขการใช้งาน', flexTerms());
        continue;
      }
      if (text.includes('ช่วยเหลือ') || text.includes('สอบถาม') || text.toLowerCase() === 'help') {
        await replyFlex(replyToken, 'วิธีใช้งาน Smart PillBox', flexHelp());
      }
    }
  }

  // LINE ต้องได้ 200 เสมอ ไม่งั้นจะ retry ซ้ำ
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'LINE webhook endpoint' });
}
