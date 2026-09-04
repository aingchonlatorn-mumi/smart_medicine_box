import { NextResponse } from 'next/server';
import { jsonError, loadContext, loadSlots, userIdFrom } from '@/lib/api';
import { summarize } from '@/lib/schedule';
import { addDays, bangkokToday, dayOfWeek, hhmm } from '@/lib/time';
import {
  appUrl, flexDoseAlert, flexMissedAlert, flexScheduleSummary,
  flexTerms, flexWeeklyReport, flexWelcome,
} from '@/lib/flex';
import { sendLineFlex, sendLinePushMessage } from '@/lib/line';

export const dynamic = 'force-dynamic';

/**
 * ยิงข้อความทดสอบเข้า LINE ของผู้ใช้จริง ๆ เพื่อดูหน้าตาก่อนถึงเวลามื้อยา
 *   POST /api/line/test?type=dose|missed|weekly|welcome|terms|schedule|text
 *   header: x-user-id: <user_id>   (หรือ ?user_id=)
 *
 * ใช้ POST เพื่อกันไม่ให้เบราว์เซอร์เผลอยิงตอน prefetch
 */
export async function POST(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ต้องส่ง ?user_id= หรือ header x-user-id', 401);

  const type = new URL(req.url).searchParams.get('type') || 'dose';

  const context = await loadContext(userId);
  if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้', 404);

  const { user, box, medicine, schedules } = context;
  const lineUserId = user.line_user_id;

  if (!lineUserId?.startsWith('U')) {
    return jsonError(`line_user_id ยังไม่ใช่ของจริง (${lineUserId}) — แก้ในตาราง users ก่อน`, 400);
  }
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return jsonError('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN', 500);
  }

  const first = schedules[0];
  let altText = '';
  let contents: unknown = null;

  switch (type) {
    case 'text': {
      const result = await sendLinePushMessage(
        lineUserId,
        '🔔 ทดสอบการแจ้งเตือนจาก Smart PillBox — ถ้าเห็นข้อความนี้แปลว่าเชื่อมต่อ LINE สำเร็จแล้ว',
      );
      return NextResponse.json({ sent: result.ok, type, result, app_url: appUrl('/') || null });
    }

    case 'welcome':
      altText = 'เชื่อมต่อกล่องยาสำเร็จ';
      contents = flexWelcome({ name: user.name, boxSerial: box?.box_serial || 'B-000' });
      break;

    case 'terms':
      altText = 'เงื่อนไขการใช้งาน';
      contents = flexTerms();
      break;

    case 'schedule':
      if (!medicine) return jsonError('ยังไม่มีข้อมูลยา', 404);
      altText = 'ตารางทานยาของคุณ';
      contents = flexScheduleSummary({ medicine, schedules });
      break;

    case 'missed':
      altText = 'เลยเวลาทานยา';
      contents = flexMissedAlert({
        time: first ? hhmm(first.time) : '08:00',
        medicineName: medicine?.name || 'ยาประจำตัว',
        minutesLate: 45,
      });
      break;

    case 'weekly': {
      const today = bangkokToday();
      const start = addDays(today, -6);
      const slots = await loadSlots(context, start, today);
      const stat = summarize(slots);
      const daily = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
        const day = summarize(slots.filter((slot) => dayOfWeek(slot.date) === dow));
        return day.total ? (day.onTime + day.late) / day.total : 0;
      });
      altText = `สรุปการทานยาสัปดาห์นี้ ${stat.adherence}%`;
      contents = flexWeeklyReport({
        adherence: stat.adherence,
        taken: stat.onTime + stat.late,
        total: stat.total,
        rangeStart: start,
        rangeEnd: today,
        daily,
        deltaPercent: 6,
      });
      break;
    }

    case 'dose':
    default:
      altText = `ถึงเวลาทานยา ${first ? hhmm(first.time) : '08:00'} น.`;
      contents = flexDoseAlert({
        time: first ? hhmm(first.time) : '08:00',
        medicineName: medicine?.name || 'ยาประจำตัว',
        doseAmount: first?.dose_amount || 1,
        pillsLeft: medicine?.total_pills ?? 0,
        mealRelation: first?.meal_relation || 'none',
      });
      break;
  }

  const result = await sendLineFlex(lineUserId, altText, contents);

  return NextResponse.json({
    sent: result.ok,
    type,
    alt_text: altText,
    result,
    // ปุ่มใน Flex จะโผล่ก็ต่อเมื่อ NEXT_PUBLIC_APP_URL เป็น https
    buttons_enabled: Boolean(appUrl('/')),
  });
}

export async function GET() {
  return NextResponse.json({
    hint: 'ใช้ POST พร้อม ?type=dose|missed|weekly|welcome|terms|schedule|text และ header x-user-id',
  });
}
