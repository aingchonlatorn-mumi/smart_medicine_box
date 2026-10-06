import { NextResponse } from 'next/server';
import { jsonError, loadContext, loadSlots, userIdFrom } from '@/lib/api';
import { summarize } from '@/lib/schedule';
import { addDays, bangkokToday, dayOfWeek, hhmm } from '@/lib/time';
import {
  flexDoseAlert, flexDoseResult, flexMissedAlert, flexScheduleSummary, flexTerms,
  flexWeeklyReport, flexWelcome,
} from '@/lib/flex';
import type { DoseOutcome } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * ดู Flex Message ทั้ง 5 แบบเป็น JSON โดยไม่ต้องส่งจริง
 * เอาไปวางใน LINE Flex Message Simulator เพื่อดูหน้าตาได้เลย
 *   /api/line/preview?type=welcome|terms|schedule|dose|missed|weekly|result
 *
 * แบบ result รับ ?outcome= เพิ่มได้ เพื่อดูการ์ดครบทุกผลลัพธ์ที่ใช้ในการทดลอง
 *   taken | partial | over_dose | not_taken | refilled | unverified
 */
export async function GET(req: Request) {
  const userId = userIdFrom(req);
  if (!userId) return jsonError('ต้องส่ง ?user_id= หรือ header x-user-id', 401);

  const type = new URL(req.url).searchParams.get('type') || 'dose';
  const context = await loadContext(userId);
  if (!context) return jsonError('ไม่พบข้อมูลผู้ใช้', 404);

  const { user, box, medicine, schedules } = context;
  const first = schedules[0];

  switch (type) {
    case 'welcome':
      return NextResponse.json(
        flexWelcome({ name: user.name, boxSerial: box?.box_serial || 'B-000' }),
      );

    case 'terms':
      return NextResponse.json(flexTerms());

    case 'schedule':
      if (!medicine) return jsonError('ยังไม่มีข้อมูลยา', 404);
      return NextResponse.json(flexScheduleSummary({ medicine, schedules }));

    case 'missed':
      return NextResponse.json(
        flexMissedAlert({
          time: first ? hhmm(first.time) : '08:00',
          medicineName: medicine?.name || 'ยาประจำตัว',
          minutesLate: 45,
        }),
      );

    case 'weekly': {
      const today = bangkokToday();
      const start = addDays(today, -6);
      const slots = await loadSlots(context, start, today);
      const summary = summarize(slots);
      const daily = [1, 2, 3, 4, 5, 6, 0].map((dow) => {
        const stat = summarize(slots.filter((slot) => dayOfWeek(slot.date) === dow));
        return stat.total ? (stat.onTime + stat.late) / stat.total : 0;
      });
      return NextResponse.json(
        flexWeeklyReport({
          adherence: summary.adherence,
          taken: summary.onTime + summary.late,
          total: summary.total,
          rangeStart: start,
          rangeEnd: today,
          daily,
          deltaPercent: 6,
        }),
      );
    }

    case 'result': {
      // ค่าตัวอย่างสำหรับดูหน้าตาการ์ด ไม่ได้อ่านจากผลการสแกนจริง
      const outcome = (new URL(req.url).searchParams.get('outcome') || 'taken') as DoseOutcome;
      // "หยิบไม่ครบ" ต้องมีขนาดยาอย่างน้อย 2 เม็ด ไม่งั้นตัวอย่างจะกลายเป็น 0 เม็ด
      // ซึ่งความจริงคือกรณี "เปิดแต่ไม่หยิบ" คนละผลลัพธ์กัน
      const dose = outcome === 'partial'
        ? Math.max(2, first?.dose_amount || 1)
        : first?.dose_amount || 1;
      const beforeCount = medicine?.total_pills ?? 20;
      const removedBy: Record<DoseOutcome, number | null> = {
        taken: dose, partial: dose - 1, over_dose: dose + 1,
        not_taken: 0, refilled: -5, unverified: null,
      };
      const removed = removedBy[outcome];
      return NextResponse.json(
        flexDoseResult({
          outcome,
          time: first ? hhmm(first.time) : '08:00',
          openedAt: '08:03',
          openSeconds: 7,
          medicineName: medicine?.name || 'ยาประจำตัว',
          doseAmount: dose,
          pillsBefore: removed === null ? null : beforeCount,
          pillsAfter: removed === null ? null : beforeCount - removed,
          removed,
          foreign: outcome === 'over_dose' ? 'ไกวเฟนิซิน 4 เม็ด' : null,
          stable: true,
          imageCount: 3,
        }),
      );
    }

    case 'dose':
    default:
      return NextResponse.json(
        flexDoseAlert({
          time: first ? hhmm(first.time) : '08:00',
          medicineName: medicine?.name || 'ยาประจำตัว',
          doseAmount: first?.dose_amount || 1,
          pillsLeft: medicine?.total_pills ?? 0,
          mealRelation: first?.meal_relation || 'none',
        }),
      );
  }
}
